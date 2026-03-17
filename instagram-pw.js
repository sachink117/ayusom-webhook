// instagram-pw.js
// Playwright-based Instagram DM handler for Ayusomam Herbals bot.
// Polls Instagram DMs every 1 minute via headless Chromium browser.
// Processes up to 3 threads in parallel using a page pool.
// No Meta API token needed â uses real browser session.
//
// Requires env vars: INSTAGRAM_USERNAME, INSTAGRAM_PASSWORD, TOTP_SECRET
// TOTP_SECRET: base32 key from Instagram's authenticator app setup (e.g. "JBSWY3DPEHPK3PXP")

let igBrowser = null;
let igContext = null;
let igPage = null;
let igReady = false;

const igSeenMessages = new Set();
const igThreadUrls = new Map();
const igActivePages = new Map(); // senderId -> pool page currently open on that thread
const igSendFailCounts = new Map(); // threadId -> consecutive send failure count (skip unreachable threads)

// Qualification state per sender
// Stages: 'awaiting_qual', 'awaiting_symptoms', 'awaiting_duration', 'qualified'
const igQualStates = new Map();
const igLastUserReply = new Map(); // senderId → timestamp of last user message (priority queue)

// Page pool for parallel thread processing
const igPagePool = [];
const POOL_SIZE = 1; // reduced: API-first means pool only needed for DOM fallback

let _db, _handleMessage, _sleep;
let _currentProcessingThreadId = null; // set by processThread so sendMessageOnPage knows thread without URL
let _igUsername, _igPassword;

// ââ TOTP generator (no external deps â uses Node built-in crypto) âââââââââââââ
function generateTOTP(secret, timeOffset = 0) {
  const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of secret.toUpperCase().replace(/[\s=]/g, '')) {
    const val = base32Chars.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  const key = Buffer.from(bytes);
  const time = Math.floor(Date.now() / 1000 / 30) + timeOffset;
  const timeBuf = Buffer.alloc(8);
  timeBuf.writeBigUInt64BE(BigInt(time));
  const crypto = require('crypto');
  const hmac = crypto.createHmac('sha1', key);
  hmac.update(timeBuf);
  const digest = hmac.digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code = (
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff)
  ) % 1000000;
  return code.toString().padStart(6, '0');
}

// ââ Cookie persistence (Firestore) ââââââââââââââââââââââââââââââââââââââââââ
async function loadIgCookies() {
  if (!_db) return null;
  try {
    const doc = await _db.collection('config').doc('ig_cookies').get();
    if (doc.exists) return doc.data().cookies;
  } catch (e) {}
  return null;
}
function saveIgCookies(cookies) {
  if (!_db) return;
  _db.collection('config').doc('ig_cookies')
    .set({ cookies, savedAt: Date.now() })
    .catch(e => console.error('[IG-PW] Cookie save error:', e.message));
}

// ââ Qualification State (Firestore persistence) ââââââââââââââââââââââââââââââ
async function loadQualStates() {
  // No-op: state now managed by SALESOM handleMessage via Firestore users/ collection
  console.log('[IG-PW] Qual states: using SALESOM userData (Firestore users/)');
}
function saveQualStates() {
  // No-op: no longer writing to ig_qual_states
}

// ââ Qualification Engine âââââââââââââââââââââââââââââââââââââââââââââââââââââ

function parseDuration(text) {
  const t = text.toLowerCase();
  // Explicit single-letter codes (A/B/C/D)
  if (/(?:^|[\s+,])d(?:[\s+,]|$)/.test(t)) return 'D';
  if (/(?:^|[\s+,])c(?:[\s+,]|$)/.test(t)) return 'C';
  if (/(?:^|[\s+,])b(?:[\s+,]|$)/.test(t)) return 'B';
  if (/(?:^|[\s+,])a(?:[\s+,]|$)/.test(t)) return 'A';
  // Natural language: years
  const yearMatch = t.match(/(\d+)\s*(?:saal|sal|year|yr)/);
  if (yearMatch) {
    const n = parseInt(yearMatch[1]);
    return n >= 3 ? 'D' : (n >= 1 ? 'C' : 'B');
  }
  if (/saalon\s*se|kaafi\s*time|bahut\s*pehle|bahut\s*purana|years?\s*se/.test(t)) return 'D';
  // Natural language: months
  const monthMatch = t.match(/(\d+)\s*(?:mahine|maheene|month)/);
  if (monthMatch) {
    const n = parseInt(monthMatch[1]);
    return n >= 3 ? 'C' : 'B';
  }
  if (/kuch\s*(?:mahine|month)/.test(t)) return 'C';
  // Natural language: weeks
  if (/(?:\d+\s*)?(?:hafte|hafta|hapta|week)/.test(t)) return 'B';
  // Natural language: days
  const dayMatch = t.match(/(\d+)\s*(?:din|day)/);
  if (dayMatch) {
    return parseInt(dayMatch[1]) <= 7 ? 'A' : 'B';
  }
  return null;
}

function parseSymptoms(text) {
  const t = text.toLowerCase();
  const syms = new Set();
  // Explicit single digit numbers 1-5
  const nums = t.match(/\b[1-5]\b/g);
  if (nums) nums.forEach(n => syms.add(parseInt(n)));
  // "all" or "sab"
  if (/\ball\b|\bsab\b|\bsaari\b|\bsabhi\b|\bsab kuch\b/.test(t)) {
    [1, 2, 3, 4, 5].forEach(n => syms.add(n));
  }
  // Symptom 1: naak band / nose block
  if (/naak\s*(?:band|block|jam|bund)|band\s*naak|nose\s*(?:block|band|bund)|nak\s*(?:band|block)|blocked?\s*nose|congestion/.test(t)) syms.add(1);
  // Symptom 2: sneezing / runny nose
  if (/sneez|chhink|runny|naak\s*(?:beh|bah)|bahnti|behna|watery\s*nose|pani\s*aat|paani\s*aat/.test(t)) syms.add(2);
  // Symptom 3: head heaviness / sinus pressure
  if (/sir\s*(?:bhaari|bhari|dard|heavy|dukh)|sar\s*(?:bhaari|dard)|head\s*(?:heavy|ache|pain|pressure)|bhaariapan|pressure\s*(?:sar|sir|head)|heaviness/.test(t)) syms.add(3);
  // Symptom 4: smell loss
  if (/smell\s*(?:nahi|nahin|na|loss|gone)|khushbu\s*(?:nahi|nahin)|mehak\s*(?:nahi|nahin)|sunghna|soongh|anosmia/.test(t)) syms.add(4);
  // Symptom 5: post nasal drip / gale mein mucus
  if (/gal[ae]\s*(?:me[ih]n|mein|me|par|mey)|mucus|kapha|balgam|khara[hs]|throat\s*(?:mucus|drip)|phlegm|post.?nasal|drip/.test(t)) syms.add(5);
  return [...syms].sort((a, b) => a - b);
}

function detectSinusType(duration, symptoms) {
  const s = new Set(symptoms);
  const isChron = duration === 'D' || duration === 'C';
  // All 5 symptoms
  if (s.has(1) && s.has(2) && s.has(3) && s.has(4) && s.has(5)) return 'mixed_overload';
  if (s.size >= 5) return 'mixed_overload';
  // Smell loss + block (advanced)
  if (isChron && s.has(1) && s.has(4)) return 'advanced_chronic';
  // Block only (chronic)
  if (isChron && s.has(1) && !s.has(2) && !s.has(3)) return 'chronic_congestion';
  // Sneezing + head heaviness (reactive congestion)
  if (s.has(2) && s.has(3)) return 'reactive_congestion';
  // Sneezing only, long duration
  if (isChron && s.has(2) && !s.has(1) && !s.has(3)) return 'reactive_sensitivity';
  // Short duration with reactivity
  if ((duration === 'A' || duration === 'B') && s.has(2)) return 'reactive_congestion';
  // Fallbacks
  if (s.has(1)) return 'chronic_congestion';
  if (s.has(3)) return 'reactive_congestion';
  if (s.has(2)) return 'reactive_sensitivity';
  if (s.has(5)) return 'reactive_sensitivity';
  return 'chronic_congestion';
}

// Message templates â NO dashes of any kind
const MSG_MEDICINE_CYCLE =
`Itne lambe time se sinus hai toh ek cheez zaroor hua hoga.
Koi na koi medicine li hogi, thoda theek laga, band ki, wapas aa gayi problem.
Aisa isliye hota hai kyunki medicines sirf symptoms dabati hain.
Andar ki wajah theek nahi hoti.
Sahi hai na aapke saath bhi yahi hua?`;

const MSG_SYMPTOM = {
  1: `Naak ka band rehna nasal lining ki permanent swelling ka sign hai.
Jitna purana hoga, utna tissue level par asar badh jaata hai.`,
  2: `Frequent sneezing aur naak behna matlab nasal lining bahut sensitive ho gayi hai.
Chhoti si cheez se bhi reaction hoti hai jaise dust, smell ya cold air.`,
  3: `Sir mein bhaariapan matlab sinus cavity mein mucus jam gaya hai jo drain nahi ho raha.
Pressure build hota hai aur sar dard bhi aata rehta hai.`,
  4: `Smell ka chale jaana matlab naak ke andar ki nerve layer affect ho rahi hai.
Ye treatable hai lekin isme time lagta hai.`,
  5: `Gale mein mucus rehna post nasal drip hai.
Raat mein zyada pareshaan karta hai aur neend kharaab hoti hai.`,
};

const MSG_COMBO = {
  '1,4': `Naak block aur smell loss dono saath matlab inflammation nasal passage ke upar tak pahunch gayi hai.
Ye ek advanced sign hai.`,
  '2,3': `Sneezing aur sir ka bhaariapan dono saath matlab body ek hi time par reactive bhi hai aur congested bhi.
Dono ko alag alag treat karna padta hai.`,
  '1,2,3': `Naak band, sneezing aur sir bhaariapan teeno saath matlab sinus ka complete inflammation hai.
Sirf ek symptom theek karna kaafi nahi hoga.`,
  '1,2,3,4,5': `Itne saare symptoms ek saath matlab body mein multiple layers par problem hai.
Ek cheez treat karo to doosri baaki rehti hai.`,
};

const SINUS_TYPE_DATA = {
  chronic_congestion: {
    name: 'Chronic Congestion Type',
    insight: `Is type mein nasal lining lamba time se swell rehti hai aur passage narrow ho jaata hai.
Regular breathing bhi mushkil hoti hai dhire dhire.`,
    question: `Kya kabhi doctor ne surgery suggest ki hai aapko?`,
  },
  reactive_sensitivity: {
    name: 'Reactive Sensitivity Type',
    insight: `Is type mein nasal lining bahut zyada sensitive ho jaati hai.
Dust, smoke, cold air - kuch bhi trigger kar sakta hai.`,
    question: `Kaunsi cheez sabse zyada trigger karti hai aapko - dust, smoke ya cold?`,
  },
  reactive_congestion: {
    name: 'Reactive Congestion Type',
    insight: `Is type mein dono problems hain. Sensitivity bhi aur blockage bhi.
Subah uthne par symptoms zyada hote hain usually.`,
    question: `Subah uthte hi naak band hoti hai ya sneezing hoti hai?`,
  },
  mixed_overload: {
    name: 'Mixed Overload Type',
    insight: `Is type mein ek saath kaafi layers par problem hai.
Isliye sirf ek cheez se relief nahi milti aur sab ko saath treat karna padta hai.`,
    question: `Kya pehle koi Ayurvedic ya herbal treatment try kiya tha?`,
  },
  advanced_chronic: {
    name: 'Advanced Chronic Congestion Type',
    insight: `Naak block ke saath smell ka jaana matlab nerve level par bhi asar hua hai.
Ye serious hai lekin Ayurvedic treatment se reverse ho sakta hai.`,
    question: `Smell kab se gayi hai approximately - 1 saal se pehle ya baad mein?`,
  },
  deep_inflammation: {
    name: 'Deep Inflammation Type',
    insight: `Is type mein andar ki lining thick ho jaati hai aur passage narrow ho jaata hai.
Ye chronic inflammation ka advanced stage hai.`,
    question: `Kya doctor ne kabhi scope ya X-ray se check kiya tha?`,
  },
};

function getSymptomInsightMsg(symptoms) {
  const key = symptoms.join(',');
  if (MSG_COMBO[key]) return MSG_COMBO[key];
  // Try partial combos
  if (symptoms.includes(1) && symptoms.includes(4)) return MSG_COMBO['1,4'];
  if (symptoms.includes(2) && symptoms.includes(3)) return MSG_COMBO['2,3'];
  // Single priority: smell > block > head > sneezing > throat
  for (const p of [4, 1, 3, 2, 5]) {
    if (symptoms.includes(p)) return MSG_SYMPTOM[p];
  }
  return MSG_SYMPTOM[1];
}

// Per-page send lock — prevents concurrent keyboard events from interleaving characters
// (e.g. two messages sent at the same time would garble like "KySai rafa pe kt hboadaat")
const _pageSendLocks = new WeakMap();

// Send a single message on a specific Playwright page (already on the thread)
// Strategy: API first (no typing, no interleaving), then execCommand, then keyboard fallback
async function sendMessageOnPage(page, text) {
  // Serialize all sends on this page — only one at a time
  const prevLock = _pageSendLocks.get(page) || Promise.resolve();
  let releaseLock;
  const thisLock = new Promise(r => { releaseLock = r; });
  _pageSendLocks.set(page, thisLock);
  await prevLock;

  try {
    // ── DOM send — navigate a fresh temp page to the thread, type and send ──
    // API (/api/v1/direct_v2/) was returning 404 for all threads; DOM is the reliable path.
    const domTid = _currentProcessingThreadId || page.url().match(/\/direct\/t\/(\d+)/)?.[1];

    if (!domTid) {
      console.error('[IG-PW] No thread ID available for send — skipping');
      return;
    }

    let domPage = page;
    let domPoolEntry = null;
    const onThreadPage = page.url().includes('/direct/t/' + domTid);

    if (!onThreadPage) {
      try {
        domPage = await igContext.newPage();
        domPoolEntry = { page: domPage, _isTemp: true };
        await domPage.goto('https://www.instagram.com/direct/t/' + domTid + '/', {
          waitUntil: 'domcontentloaded', timeout: 20000
        }).catch(e => { if (!e.message.includes('ERR_ABORTED')) console.warn('[IG-PW] DOM nav warn:', e.message); });
        // Give React time to render the DM UI — wait up to 10s for textbox
        await domPage.waitForSelector(
          'div[contenteditable="true"], p[contenteditable="true"], [role="textbox"]',
          { timeout: 10000 }
        ).catch(() => null);
        await _sleep(600);
      } catch (pageErr) {
        console.error('[IG-PW] Could not open thread page for send:', pageErr.message);
        return;
      }
    }

    try {
      const pageUrl = domPage.url();

      // ── Attempt 1: execCommand insertText + Playwright Enter (reliable combo) ──
      // execCommand inserts text into React's contenteditable correctly,
      // but synthetic KeyboardEvent dispatches do NOT trigger Instagram's send.
      // So we use execCommand for text insertion, then Playwright keyboard.press for Enter.
      const jsResult = await domPage.evaluate(async (msg) => {
        const inputs = Array.from(document.querySelectorAll(
          'div[contenteditable="true"], p[contenteditable="true"], [role="textbox"]'
        ));
        const visible = inputs.filter(el => el.offsetHeight > 10 && el.offsetWidth > 10);
        if (visible.length === 0) {
          return { ok: false, count: inputs.length, url: location.href };
        }
        const el = visible[visible.length - 1];
        el.focus();
        document.execCommand('insertText', false, msg);
        el.dispatchEvent(new InputEvent('input', { bubbles: true, data: msg, inputType: 'insertText' }));
        // Do NOT dispatch synthetic Enter here — Playwright will press Enter natively below
        return { ok: true, tag: el.tagName, role: el.getAttribute('role'), visCount: visible.length };
      }, text).catch(e => ({ ok: false, err: e.message }));

      if (jsResult?.ok) {
        // Use Playwright's native keyboard.press to actually send — synthetic events don't work
        await _sleep(300);
        await domPage.keyboard.press('Enter');
        await _sleep(600);
        console.log('[IG-PW] execCommand+Enter send OK:', JSON.stringify(jsResult));
        igSendFailCounts.delete(domTid);
        return;
      }

      // Log why execCommand missed — helps diagnose restricted/unavailable threads
      console.log('[IG-PW] execCommand miss (url:', pageUrl.substring(30), 'inputs:', jsResult?.count, jsResult?.url ? '→ ' + jsResult.url.substring(30) : '', ') — trying keyboard.type');

      // ── Attempt 2: Playwright keyboard.type — directly types into the element ──
      const SELECTORS = [
        'div[role="textbox"][contenteditable="true"]',
        'div[contenteditable="true"][aria-label]',
        'div[contenteditable="true"]',
        'p[contenteditable="true"]',
      ];
      for (const sel of SELECTORS) {
        const el = await domPage.waitForSelector(sel, { timeout: 4000 }).catch(() => null);
        if (!el) continue;
        try {
          await el.scrollIntoViewIfNeeded();
          await el.click({ timeout: 3000 });
          await _sleep(200);
          await domPage.keyboard.type(text, { delay: 20 });
          await _sleep(200);
          await domPage.keyboard.press('Enter');
          await _sleep(600);
          console.log('[IG-PW] keyboard.type send OK (selector:', sel, ')');
          igSendFailCounts.delete(domTid);
          return;
        } catch (clickErr) { /* try next selector */ }
      }

      const n = (igSendFailCounts.get(domTid) || 0) + 1;
      igSendFailCounts.set(domTid, n);
      if (n >= 3) console.warn('[IG-PW] Thread', domTid, 'failed', n, 'sends — likely blocked/restricted/request-pending');
      console.error('[IG-PW] All send attempts failed for text:', text.substring(0, 40));
    } finally {
      if (domPoolEntry?._isTemp) {
        domPage.close().catch(() => {}); // close temp page — free memory immediately
      }
    }
  } catch (e) {
    console.error('[IG-PW] sendMessageOnPage error:', e.message);
  } finally {
    releaseLock();
  }
}

// Send the full qualification sequence (3-4 messages with delays)
async function sendQualificationSequence(senderId, page, duration, symptoms) {
  const sinusType = detectSinusType(duration, symptoms);
  const typeData = SINUS_TYPE_DATA[sinusType] || SINUS_TYPE_DATA.chronic_congestion;

  console.log('[IG-PW] Qual sequence for', senderId, '| duration:', duration, '| symptoms:', symptoms, '| type:', sinusType);

  const messages = [];

  // Step 1: Medicine cycle insight (only for C/D = chronic)
  if (duration === 'D' || duration === 'C') {
    messages.push(MSG_MEDICINE_CYCLE);
  }

  // Step 2: Symptom insight
  messages.push(getSymptomInsightMsg(symptoms));

  // Step 3: Sinus type reveal + insight
  messages.push(`Aapka sinus type hai: ${typeData.name}.\n${typeData.insight}`);

  // Step 4: Engaging question
  messages.push(typeData.question);

  // Save state as 'qualified' BEFORE sending messages.
  // If we save AFTER (old behaviour), a crash mid-sequence leaves state as 'awaiting_qual'
  // and the bot re-runs the whole sequence on the next message — asking details again.
  igQualStates.set(senderId, { stage: 'qualified', duration, symptoms, sinusType, lastUpdated: Date.now() });
  saveQualStates();

  for (const msg of messages) {
    await sendMessageOnPage(page, msg);
    await _sleep(2800); // Pause between messages to feel natural
  }
}

// Returns true if this message was handled as a qualification reply
async function handleQualificationReply(senderId, page, msgText, recentContext) {
  const state = igQualStates.get(senderId);

  // Already qualified â do not re-run the sequence
  if (state && (state.stage === 'qualified' || state.stage === 'pitched')) return false;

  const duration = parseDuration(msgText);
  const symptoms = parseSymptoms(msgText);

  // Scan full conversation context (last 20 msgs) for duration/symptoms shared in earlier messages.
  // e.g. user said "3 mahine se" 2 turns ago — we should still remember it.
  const ctxDuration = duration || (recentContext ? parseDuration(recentContext) : null);
  const ctxSymptoms = symptoms.length > 0 ? symptoms : (recentContext ? parseSymptoms(recentContext) : []);

  // New user with BOTH found anywhere in full context â handle directly
  if ((!state || state.stage === 'new') && ctxDuration && ctxSymptoms.length > 0) {
    await sendQualificationSequence(senderId, page, ctxDuration, ctxSymptoms);
    return true;
  }

  // Not awaiting qual yet â let _handleMessage handle it
  if (!state || state.stage === 'new') return false;

  if (state.stage === 'awaiting_qual' || state.stage === 'awaiting_symptoms' || state.stage === 'awaiting_duration') {
    // Use context-enriched values — avoids re-asking for details the user already shared
    const finalDuration = ctxDuration || state.duration || null;
    const finalSymptoms = ctxSymptoms.length > 0 ? ctxSymptoms : (state.symptoms || []);

    if (finalDuration && finalSymptoms.length > 0) {
      // Have everything â send full sequence
      await sendQualificationSequence(senderId, page, finalDuration, finalSymptoms);
      return true;
    }

    if (finalDuration && finalSymptoms.length === 0) {
      // Have duration, need symptoms
      igQualStates.set(senderId, { stage: 'awaiting_symptoms', duration: finalDuration });
      state.lastUpdated = Date.now();
      saveQualStates();
      await sendMessageOnPage(page,
        `Theek hai.\nAapko kaun kaun si problem hoti hai? Inme se jo bhi ho woh number type karein:\n1. Naak band rehti hai\n2. Sneezing ya naak behna\n3. Sir mein bhaariapan\n4. Smell nahi aati\n5. Gale mein mucus`
      );
      return true;
    }

    if (!finalDuration && finalSymptoms.length > 0) {
      // Have symptoms, need duration
      igQualStates.set(senderId, { stage: 'awaiting_duration', symptoms: finalSymptoms });
      state.lastUpdated = Date.now();
      saveQualStates();
      await sendMessageOnPage(page,
        `Acha. Yeh problem kitne time se hai aapko?\nA. 7 din se kam\nB. 1 se 4 hafte\nC. 1 se 3 mahine\nD. 3 mahine se zyada ya saalon se`
      );
      return true;
    }

    // Cannot parse duration or symptoms from this message
    return false;
  }

  return false;
}

// ââ Init âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

// Post-qualification conversation: handles replies after the sinus type + question was sent
async function handlePostQualReply(senderId, page, msgText, state, recentContext) {
  const { sinusType, duration } = state;
  const lower = (msgText || '').toLowerCase();
  const isLong = duration === 'D' || duration === 'C';
  const messages = [];

  if (state.stage === 'pitched') {
    // User replied after we already sent the program pitch

    // Handle "ilaz batao / treatment kya hai / jukham ka ilaz" — user asking for treatment details
    if (/ilaz|ilaaj|treatment|upay|remedy|kaise theek|kaise kare|kaise karein|kya karun|kya karna|herb|dawai|dawa|nuskha|gharelu|jukham|sardi|cold|batao kaise|bataiye kaise/.test(lower)) {
      messages.push('Sinus ka sabse effective ilaz hai root cause target karna — sirf symptoms dabana nahi.\n\nHamare program mein 3 cheezon ka combination hai:\n1. Customized Ayurvedic herb kit (aapke sinus type ke liye)\n2. Daily nasal routine — steam, Nasya, exercises\n3. Diet + lifestyle changes jo mucus production rokein');
      messages.push('Yeh combination 7-14 din mein clear difference deta hai.\n\nStarter pack Rs. 499 (7 din) ya Core Program Rs. 1299 (14 din + full support).\n\nKya shuru karein?');
      state.lastUpdated = Date.now();
      igQualStates.set(senderId, state);
      saveQualStates();
      for (const msg of messages) { await sendMessageOnPage(page, msg); await _sleep(2500); }
      return true;
    }

    // Objection patterns — must be buying-related, not generic "nahi" complaints
    const isBuyingObjection = (
      /nahi chahiye|nahi lena|nahi khareedna|nahi karna|zaroorat nahi|mat bhejo|nahin chahiye|nahin lena/.test(lower) ||
      /costly|mahanga|mehenga|budget nahi|paisa nahi|afford nahi|paisa kam/.test(lower) ||
      /sochna hai|soch ke|baad mein|kal baat|pehle sochta|zaroorat nahi|ek baar soch/.test(lower) ||
      (/nahi/.test(lower) && /program|starter|core|499|1299|khareed|le loon|shuru/.test(lower))
    );
    if (isBuyingObjection) {
      messages.push('Bilkul samajh sakta hoon, aap sochna chahte hain.\n\nSirf ek baat — sinus jitna purana hota hai, utna mushkil treat karna hota hai. Time ke saath condition aur kharab hoti rehti hai.\n\nRs. 499 ka 7-din Starter Program ek baar try karke dekh sakte hain. Koi long commitment nahi — sirf ek hafte ka chhota experiment.');
    } else if (/\bhaan\b|\bha\b|\byes\b|\btheek\b|\bokay\b|\bok\b|chalega|shuru|\bkaro\b|bhejo|payment|\blink\b|karunga|karenge|ready|le lenge|le leta|shuru kar/.test(lower)) {
      messages.push('Bahut accha! Main abhi payment link bhej raha hoon.\n\nEk kaam karein — apna naam aur WhatsApp number yahan share karein. Taki program details aur payment link directly aapke paas pahunche aur setup mein koi delay na ho.');
    } else if (/batao|samjhao|explain|kya hai|kya hoga|kaise|kaisa|puchna|poochna|sawaal|question/.test(lower)) {
      messages.push('Zaroor — koi bhi sawaal poochein. Main program, herbs, ya treatment process ke baare mein sab kuch bataunga.');
      messages.push('Ya seedha shuru karte hain? 7-din Starter Program Rs. 499 mein available hai — koi long commitment nahi.');
    } else {
      // Smart fallback: look at last 3 user messages in context for relevant keywords
      const lastUserMsgs = (recentContext || '')
        .split('\n')
        .filter(l => l.startsWith('User: '))
        .slice(-3)
        .map(l => l.replace('User: ', '').trim())
        .join(' | ');
      const ctxLower = lastUserMsgs.toLowerCase();
      if (/kitna|price|cost|rupees|rs |paisa|kitne|mehanga|sasta/.test(ctxLower)) {
        messages.push('7-din Starter Program sirf Rs. 499 ka hai.');
        messages.push('14-din Core Program Rs. 1299 mein milta hai — jo purani problem ke liye zyada effective hai.');
      } else if (/kya milega|kya hota|program mein|product|herbs|kya hai/.test(ctxLower)) {
        messages.push('Program mein milta hai: customized herbal kit, nasal Ayurvedic routine, diet tips, aur WhatsApp support.');
        messages.push('Aapke sinus type ke hisaab se personalized hoga.');
      } else if (/kitne din|kitne time|kab tak|result|kitna time/.test(ctxLower)) {
        messages.push('Most people 3-4 din mein breathing improvement feel karte hain.');
        messages.push('7-din program mein 70-80% log noticeable relief report karte hain.');
      } else if (/side effect|safe|nuksan|koi problem|nuksaan/.test(ctxLower)) {
        messages.push('Bilkul safe hai — 100% natural Ayurvedic herbs, koi chemicals nahi.');
        messages.push('Already 200+ log try kar chuke hain, koi side effects report nahi hue.');
      } else {
        messages.push('Koi bhi sawaal ho — price, program, ya treatment ke baare mein — seedha poochein.');
        messages.push('Main yahan hoon aapki help ke liye.');
      }
    }
    state.lastUpdated = Date.now();
    igQualStates.set(senderId, state);
    saveQualStates();
  } else {
    // state.stage === 'qualified' - user replied to the type-specific question
    if (sinusType === 'chronic_congestion') {
      // Question was: "Kya kabhi doctor ne surgery suggest ki hai aapko?"
      const usedSpray = /otrivin|spray|nasal|decongestant/.test(lower);
      const yesSurgery = /haan|ha|yes|surgery|operation|suggest ki/.test(lower);

      if (usedSpray) {
        messages.push('Otrivin jaisi spray se temporarily naak khulti hai — lekin andar ki inflammation bilkul theek nahi hoti.\n\nRegular use se nasal lining aur zyada sensitive ho jaati hai. Dhire dhire dependency ban jaati hai aur asli problem wahi ki wahi rehti hai.');
      } else if (yesSurgery) {
        messages.push('Surgery ek option zaroor hai, lekin pehle Ayurvedic route try karna chahiye.\n\nHamare program se bahut log surgery avoid kar chuke hain — kyunki root cause herbs + lifestyle se treat hota hai, knife se nahi.');
      } else {
        messages.push('Accha hua doctor ke paas surgery ke liye nahi gaye. Abhi bhi natural route bilkul possible hai.');
      }
      const prog = isLong ? '14-din Core Program (Rs. 1299)' : '7-din Starter Program (Rs. 499)';
      messages.push('Hamare ' + prog + ' mein customized herbal kit, nasal exercises aur complete Ayurvedic protocol milta hai.\n\nKya shuru karein?');

    } else if (sinusType === 'reactive_sensitivity') {
      // Question was: "Kaunsi cheez sabse zyada trigger karti hai aapko - dust, smoke ya cold?"
      const prog = isLong ? '14-din Core Program (Rs. 1299)' : '7-din Starter Program (Rs. 499)';
      messages.push('Yeh trigger pata lagana treatment ka pehla step hota hai — sahi pakda aapne.\n\nHamare program mein trigger management bhi sikhate hain. Herbs ke saath lifestyle changes bhi hoti hain jo sensitivity ko root se khatam karne mein help karti hain.\n\n' + prog + ' mein yeh sab milta hai. Kya try karna chahenge?');

    } else if (sinusType === 'reactive_congestion') {
      // Question was: "Subah uthte hi naak band hoti hai ya sneezing hoti hai?"
      const prog = isLong ? '14-din Core Program (Rs. 1299)' : '7-din Starter Program (Rs. 499)';
      messages.push('Subah ke symptoms zyada hona is type ki classic sign hai — raat bhar mucus accumulate hota hai aur subah uthte hi attack karta hai.\n\nHamare program mein subah ki specially designed Ayurvedic routine hai iske liye. Plus herbs jo raat mein bhi mucus build-up rokein.\n\n' + prog + '. Kya shuru karein?');

    } else if (sinusType === 'mixed_overload') {
      // Question was: "Kya pehle koi Ayurvedic ya herbal treatment try kiya tha?"
      if (/nahi|nahin|nai|no|pehle nahi|try nahi/.test(lower)) {
        messages.push('Pehli baar mein sahi system se try karna zyada effective hota hai.\n\nHamare 14-din Core Program mein sabh symptoms ko ek saath address kiya jaata hai — herbs, nasal routine, diet, aur lifestyle. Rs. 1299.\n\nKya try karna chahenge?');
      } else {
        messages.push('Pehle jo try kiya wo shayad incomplete protocol tha — mixed type ke liye ek complete approach chahiye jo sab symptoms ek saath target kare.\n\nHamare 14-din Core Program mein yahi milta hai. Rs. 1299.\n\nKya try karein?');
      }

    } else if (sinusType === 'advanced_chronic') {
      // Question was about when smell left
      messages.push('Smell ka return possible hai — sahi herbs se nasal nerve layer recover hoti hai.\n\nIs type ke liye hamare program mein ek dedicated protocol hai jo specifically nerve recovery aur deep-seated inflammation target karta hai.\n\n14-din Core Program (Rs. 1299). Kya shuru karein?');

    } else {
      const prog = isLong ? '14-din Core Program (Rs. 1299)' : '7-din Starter Program (Rs. 499)';
      messages.push('Aapke case ke liye personalized guidance zaroor help karegi.\n\n' + prog + ' — customized herbal kit, exercises, aur complete Ayurvedic protocol.\n\nKya shuru karna chahenge?');
    }

    // Move to pitched stage
    igQualStates.set(senderId, { ...state, stage: 'pitched', lastUpdated: Date.now() });
    saveQualStates();
  }

  for (const msg of messages) {
    await sendMessageOnPage(page, msg);
    await _sleep(2500);
  }
  return true;
}

async function initPlaywrightIG(INSTAGRAM_USERNAME, INSTAGRAM_PASSWORD) {
  _igUsername = INSTAGRAM_USERNAME;
  _igPassword = INSTAGRAM_PASSWORD;
  try {
    const { chromium } = require('playwright');
    igBrowser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-zygote',
        '--disable-blink-features=AutomationControlled',
        '--lang=en-US,en',
        // Memory saving flags (stable set — no --single-process, it crashes headless Linux)
        '--disable-extensions',
        '--disable-plugins',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-sync',
        '--disable-translate',
        '--disable-default-apps',
        '--no-first-run',
        '--mute-audio',
        '--hide-scrollbars',
        '--renderer-process-limit=2',    // max 2 renderer processes
        '--js-flags=--max-old-space-size=256'
      ]
    });
    igContext = await igBrowser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      viewport: { width: 800, height: 600 }, // smaller = less GPU memory
      locale: 'en-US',
      extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
    });
    await igContext.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      window.chrome = { runtime: {}, loadTimes: function(){}, csi: function(){}, app: {} };
    });
    igPage = await igContext.newPage();

    const saved = await loadIgCookies();
    if (saved && saved.length > 0) {
      await igContext.addCookies(saved);
      console.log('[IG-PW] Loaded saved cookies:', saved.length);
    }

    await igPage.goto('https://www.instagram.com/direct/inbox/', { timeout: 30000 });
    await _sleep(3000);
    console.log('[IG-PW] Init inbox URL:', igPage.url());

    if (igPage.url().includes('login')) {
      console.log('[IG-PW] Session expired â logging in...');
      await loginInstagramPW(INSTAGRAM_USERNAME, INSTAGRAM_PASSWORD);
    } else {
      console.log('[IG-PW] Session restored from cookies');
    }

    // Load saved qualification states
    await loadQualStates();

    // No persistent pool pages — DOM fallback creates a fresh page on demand and closes it.
    // Persistent pool pages accumulate JS heap from repeated thread navigations.
    igPagePool.length = 0;
    console.log('[IG-PW] Pool: on-demand mode (no persistent tabs)');

    igBrowser.on('disconnected', () => {
      console.log('[IG-PW] Browser disconnected — reinitializing in 30s...');
      igReady = false;
      setTimeout(() => initPlaywrightIG(_igUsername, _igPassword), 30 * 1000);
    });

    igReady = true;
    console.log('Instagram Playwright: ready, polling every 1 min');
    console.log('[IG-PW] Module loaded. Page pool:', POOL_SIZE, 'tabs. Auto-qualification: ON');
    setInterval(pollInstagramDMs, 20 * 1000);
    setInterval(pollNewUserRequests, 20 * 1000);
    setInterval(sendProactiveFollowups, 2 * 60 * 60 * 1000); // nudge silent leads every 2 hrs
    setTimeout(catchUpOldThreads, 60 * 1000);        // catch up on old threads 60s after start
    setTimeout(sendProactiveFollowups, 5 * 60 * 1000); // first nudge check 5 min after start
  } catch (e) {
    console.error('[IG-PW] Init error:', e.message);
    setTimeout(() => initPlaywrightIG(INSTAGRAM_USERNAME, INSTAGRAM_PASSWORD), 5 * 60 * 1000);
  }
}

// ââ Login ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
async function loginInstagramPW(username = _igUsername, password = _igPassword) {
  try {
    await igPage.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await _sleep(3000);
    console.log('[IG-PW] Login page URL:', igPage.url());

    const cookieBtn = igPage.locator('button:has-text("Allow all cookies"), button:has-text("Accept all"), button:has-text("Allow essential and optional cookies")').first();
    if (await cookieBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await cookieBtn.click();
      await _sleep(2000);
    }

    const tryFill = async (selectors, value) => {
      for (const sel of selectors) {
        const found = await igPage.$(sel).catch(() => null);
        if (found) { console.log('[IG-PW] Using selector:', sel); await found.fill(value); return true; }
      }
      return false;
    };
    const unameSelectors = ['input[name="username"]','input[aria-label*="username" i]','input[autocomplete="username"]','input[type="text"]'];
    const pwSelectors = ['input[name="password"]','input[aria-label*="password" i]','input[autocomplete="current-password"]','input[type="password"]'];

    const gotUname = await tryFill(unameSelectors, username);
    if (!gotUname) throw new Error('Username input not found');
    const gotPw = await tryFill(pwSelectors, password);
    if (!gotPw) throw new Error('Password input not found');

    const submitBtn = await igPage.$('button[type="submit"], button:has-text("Log in"), button:has-text("Log In")').catch(() => null);
    if (submitBtn) { await submitBtn.click(); }
    else { await igPage.keyboard.press('Enter'); }
    await _sleep(6000);
    console.log('[IG-PW] Post-submit URL:', igPage.url());

    // ââ Handle Two-Factor Authentication ââââââââââââââââââââââââââââââââââââââ
    if (igPage.url().includes('two_factor') || igPage.url().includes('codeentry') || igPage.url().includes('challenge')) {
      console.log('[IG-PW] 2FA page detected:', igPage.url());
      const totpSecret = process.env.TOTP_SECRET;
      if (!totpSecret) {
        throw new Error('2FA required but TOTP_SECRET env var is not set');
      }
      const pageText2fa = await igPage.evaluate(() => document.body.innerText).catch(() => '');
      console.log('[IG-PW] 2FA page text:', pageText2fa.slice(0, 400).replace(/\n/g, ' | '));

      try {
        const allEls = await igPage.$$('a, button, span[role="button"]');
        for (const el of allEls) {
          const txt = (await el.textContent().catch(() => '')).trim();
          if (/authentication app|authenticator app|use an app|use app|totp/i.test(txt)) {
            console.log('[IG-PW] Switching to authenticator app, clicked:', txt);
            await el.click();
            await _sleep(2000);
            break;
          }
        }
      } catch(e) { console.log('[IG-PW] Auth-app switch error (non-fatal):', e.message); }

      const serverTs = Math.floor(Date.now() / 1000);
      console.log('[IG-PW] Server Unix timestamp:', serverTs, '| window:', Math.floor(serverTs / 30));
      const codeInput = await igPage.$(
        'input[name="verificationCode"], input[aria-label*="code" i], input[inputmode="numeric"], input[type="number"], input[autocomplete="one-time-code"]'
      ).catch(() => null);
      if (!codeInput) throw new Error('2FA input not found on two_factor page');

      let twoFaDone = false;
      for (const offset of [-2, -1, 0, 1, 2]) {
        const totpCode = generateTOTP(totpSecret, offset);
        console.log('[IG-PW] Trying TOTP offset', offset, 'code:', totpCode);
        await codeInput.click();
        await _sleep(200);
        await codeInput.fill('');
        await _sleep(100);
        await codeInput.fill(totpCode);
        await _sleep(400);
        const twoFaSubmit = await igPage.$('button[type="submit"]').catch(() => null);
        if (twoFaSubmit) { await twoFaSubmit.click(); }
        else { await igPage.keyboard.press('Enter'); }
        await _sleep(5000);
        const postUrl = igPage.url();
        console.log('[IG-PW] Post-2FA URL (offset ' + offset + '):', postUrl);
        if (!postUrl.includes('two_factor') && !postUrl.includes('codeentry') && !postUrl.includes('challenge')) {
          console.log('[IG-PW] 2FA SUCCESS with offset', offset, '(clock drift:', offset * 30, 's)');
          twoFaDone = true;
          break;
        }
      }
      if (!twoFaDone) console.log('[IG-PW] All TOTP windows failed â wrong secret or Instagram challenge');
    }

    // Dismiss "Save your login info?" and "Turn on notifications?" prompts
    const notNow1 = igPage.locator('button:has-text("Not Now"), button:has-text("Not now")').first();
    if (await notNow1.isVisible({ timeout: 4000 }).catch(() => false)) await notNow1.click();
    await _sleep(1000);
    const notNow2 = igPage.locator('button:has-text("Not Now"), button:has-text("Not now")').first();
    if (await notNow2.isVisible({ timeout: 4000 }).catch(() => false)) await notNow2.click();
    await _sleep(1000);

    const cookies = await igContext.cookies();
    const sessionCookie = cookies.find(c => c.name === 'sessionid');
    console.log('[IG-PW] Cookies:', cookies.length, '| sessionid:', sessionCookie ? 'PRESENT' : 'MISSING');
    saveIgCookies(cookies);
    console.log('[IG-PW] Logged in, cookies saved');

    await igPage.goto('https://www.instagram.com/direct/inbox/', { timeout: 30000 });
    await _sleep(3000);
    console.log('[IG-PW] Post-login inbox URL:', igPage.url());
  } catch (e) {
    console.error('[IG-PW] Login error:', e.message);
  }
}

// ââ Process a single DM thread on a specific pool page âââââââââââââââââââââââ
async function processThread(poolEntry, href) {
  // poolEntry is kept for API compatibility but igPage is used directly (no navigation)
  const threadId = href.replace(/\//g, '').replace('directt', '');
  const senderId = 'ig_pw_' + threadId;
  const threadUrl = 'https://www.instagram.com' + href; // kept for reference/logging only

  try {
    // No page navigation — all data fetched via Instagram API from igPage.
    // This is the key RAM saving: no page.goto() per thread means no full page load.
    // Pool pages only used as fallback for DOM sends (rare).
    const page = igPage;
    _currentProcessingThreadId = threadId; // used by sendMessageOnPage for API sends

    // Use Instagram thread API to get last message (DOM scan unreliable in headless mode)
    const threadData = await page.evaluate(async (tid) => {
      try {
        const tok = document.cookie.match(/csrftoken=([^;]+)/)?.[1] || '';
        const r = await fetch('/api/v1/direct_v2/threads/' + tid + '/?limit=20', {
          credentials: 'include',
          headers: { 'X-CSRFToken': tok, 'X-IG-App-ID': '936619743392459' }
        });
        if (!r.ok) return null;
        return await r.json();
      } catch(e) { return null; }
    }, threadId).catch(() => null);

    if (!threadData?.thread?.items?.length) return;

    const lastItem = threadData.thread.items[0]; // items are newest-first
    // Skip if the last message is our own reply (avoid infinite reply loop)
    if (String(lastItem.user_id) === String(threadData.thread.viewer_id)) return;

    // Only process actual text messages — skip media shares, reels, clips, action logs etc.
    const SKIP_ITEM_TYPES = new Set(['media_share', 'clip', 'placeholder', 'action_log', 'reel_share',
      'animated_media', 'voice_media', 'video_call_event', 'link', 'like', 'raven_media',
      'story_share', 'felix_share', 'profile', 'location']);
    if (SKIP_ITEM_TYPES.has(lastItem.item_type) && !lastItem.text) return;
    const msgText = (lastItem.text || '').trim();
    if (!msgText || msgText.length < 2) return;

    // Context is now built by SALESOM AI in index.js (user.history) — no need for IG-side context.
    const msgId = lastItem.item_id || (threadId + '::' + msgText.substring(0, 60));
    if (igSeenMessages.has(msgId)) return; // already processed — skip silently
    igSeenMessages.add(msgId);
    igThreadUrls.set(senderId, threadUrl);
    // Track when this user last sent a message — used for priority queue (active chats first)
    igLastUserReply.set(senderId, Date.now());
    console.log('[IG-PW] DM (' + threadId + '): "' + msgText.substring(0, 80) + '"');

    // ── Relevance filter: only respond to sinus/health-related DMs ──
    // Existing users (already in conversation) always get a reply.
    // New users only get a reply if their message is health/sinus related or a common trigger.
    const _isExistingUser = _db ? await (async () => {
      try {
        const doc = await _db.collection('users').doc(senderId).get();
        return doc.exists;
      } catch(e) { return false; }
    })() : false;

    if (!_isExistingUser) {
      const lower = msgText.toLowerCase();
      const SINUS_KEYWORDS = /sinus|naak|nose|allergy|sneezing|cold|jukham|sardi|blocked|band|smell|breathing|mucus|congestion|headache|sir dard|sar dard|nasal|steam|spray|otrivin|sinusitis|post.?nasal|drip|ent|polyp|dns|deviated|septum|ayurved|herb|treatment|ilaj|ilaaj|dawai|dawa|medicine|doctor|clinic|hospital|problem|takleef|pareshani|dikkat|health|sehat|sukhapuri|theek|cure|remedy|upay|nuskha/;
      const GREETING_TRIGGERS = /^(hi|hello|hey|namaste|namaskar|hlo|hii|hlw|good morning|good evening|sinus|help|interested|program|plan|price|kitna|batao|start|shuru|join|details|info)\b/i;
      const REEL_TRIGGERS = /top comment|comment|reel|send|link|interested|want|chahiye|bhejo|dm|free|trick|tip/i;

      if (!SINUS_KEYWORDS.test(lower) && !GREETING_TRIGGERS.test(lower) && !REEL_TRIGGERS.test(lower)) {
        console.log('[IG-PW] Skipping non-sinus DM from new user:', msgText.substring(0, 60));
        return;
      }
    }

    // ── Route through SALESOM AI (same as WhatsApp) ──
    igActivePages.set(senderId, page);
    await _handleMessage(senderId, msgText, 'instagram_playwright')
      .catch(e => console.error('[IG-PW] handleMessage error:', e.message));
    igActivePages.delete(senderId);

    await _sleep(1500);
  } catch (e) {
    console.error('[IG-PW] Thread error [' + threadId + ']:', e.message);
  } finally {
    if (_currentProcessingThreadId === threadId) _currentProcessingThreadId = null;
  }
}

// ââ Poll DMs (parallel with page pool) ââââââââââââââââââââââââââââââââââââââââ
// ─── PROACTIVE FOLLOW-UP ENGINE ──────────────────────────────────────────────
// Re-engages warm leads who went silent mid-qualification
const FOLLOWUP_DELAY_MS = 8 * 60 * 60 * 1000; // 8 hours silence before nudge
const FOLLOWUP_MSGS = {
  awaiting_qual:     'Namaste 🙏 Kya aapke sinus ki problem abhi bhi pareshaan kar rahi hai? Main aapki help ke liye yahan hoon — bas batayein kya feel ho raha hai?',
  awaiting_symptoms: 'Namaste 🙏 Aapne sinus problem ke baare mein bataya tha. Kya aap apne main symptoms share kar sakte hain? (naak band, sir dard, etc.) 🌿',
  awaiting_duration: 'Namaste 🙏 Bas ek chhota sawaal — yeh sinus ki takleef aapko kitne time se hai? Isse hum sahi program suggest kar sakte hain 🌿',
  qualified:         'Namaste 🙏 Aap hamare Ayurvedic sinus program ke liye perfect candidate hain! 14 din intensive + 7 din free support. Sirf Rs.499. Kya shuru karein? 🌿'
};

// Proactive follow-ups now handled by SALESOM AI ghosting recovery in index.js handleMessage.
// The WhatsApp handler already sends type-specific nudges at 24h and 72h intervals.
async function sendProactiveFollowups() {
  // No-op — SALESOM AI handles ghosting recovery for all platforms including instagram_playwright
}
// ──────────────────────────────────────────────────────────────────────────────

// ── Catch up on old / unanswered threads (runs once ~60s after startup) ────────
async function catchUpOldThreads() {
  if (!igReady || !igPage) return;
  console.log('[IG-PW] Catch-up: scanning older threads for unanswered messages...');
  try {
    let allHrefs = [];
    let cursor = null;

    // Paginate inbox API (3 pages × 20 threads = up to 60 threads)
    for (let p = 0; p < 3; p++) {
      const data = await igPage.evaluate(async (cur) => {
        try {
          const tok = document.cookie.match(/csrftoken=([^;]+)/)?.[1] || '';
          let url = '/api/v1/direct_v2/inbox/?limit=20';
          if (cur) url += '&cursor=' + encodeURIComponent(cur);
          const r = await fetch(url, {
            credentials: 'include',
            headers: { 'X-CSRFToken': tok, 'X-IG-App-ID': '936619743392459' }
          });
          if (!r.ok) return null;
          return await r.json();
        } catch(e) { return null; }
      }, cursor).catch(() => null);

      if (!data?.inbox?.threads?.length) break;
      allHrefs.push(...data.inbox.threads.map(t => '/direct/t/' + t.thread_id + '/'));
      cursor = data.inbox.oldest_cursor || null;
      if (!cursor) break;
      await _sleep(1000);
    }

    console.log('[IG-PW] Catch-up: ' + allHrefs.length + ' threads to check');

    // Process serially — API-based processThread needs no parallel pool pages
    for (const href of allHrefs) {
      await processThread(igPagePool[0] || { page: igPage }, href)
        .catch(e => console.error('[IG-PW] Catch-up thread error:', e.message));
      await _sleep(500);
    }

    console.log('[IG-PW] Catch-up complete');
  } catch(e) {
    console.error('[IG-PW] Catch-up error:', e.message);
  }
}

// ── Poll pending DM requests (new users who haven't been accepted yet) ─────────
async function pollNewUserRequests() {
  if (!igReady || !igPage) return;
  try {
    const pendingApi = await igPage.evaluate(async () => {
      try {
        const tok = document.cookie.match(/csrftoken=([^;]+)/)?.[1] || '';
        const r = await fetch('/api/v1/direct_v2/pending_inbox/?limit=20', {
          credentials: 'include',
          headers: { 'X-CSRFToken': tok, 'X-IG-App-ID': '936619743392459' }
        });
        if (!r.ok) return { err: r.status };
        return await r.json();
      } catch(e) { return { err: e.message }; }
    }).catch(() => null);

    if (!pendingApi?.inbox?.threads?.length) return;

    console.log('[IG-PW] Pending requests:', pendingApi.inbox.threads.length);

    for (const thread of pendingApi.inbox.threads) {
      const threadId = thread.thread_id;

      // Accept the message request first
      await igPage.evaluate(async (tid) => {
        try {
          const tok = document.cookie.match(/csrftoken=([^;]+)/)?.[1] || '';
          await fetch('/api/v1/direct_v2/threads/' + tid + '/approve/', {
            method: 'POST',
            credentials: 'include',
            headers: {
              'X-CSRFToken': tok,
              'X-IG-App-ID': '936619743392459',
              'Content-Type': 'application/x-www-form-urlencoded'
            }
          });
        } catch(e) {}
      }, threadId).catch(() => {});

      console.log('[IG-PW] Accepted pending request:', threadId);

      // Now process the thread using a free pool page
      const href = '/direct/t/' + threadId + '/';
      const poolEntry = igPagePool.find(p => !p.busy);
      if (poolEntry) {
        poolEntry.busy = true;
        await processThread(poolEntry, href).catch(e => console.error('[IG-PW] New user thread error:', e.message));
        poolEntry.busy = false;
      } else {
        // All pool pages busy — use igPage as fallback
        await processThread({ page: igPage }, href).catch(e => console.error('[IG-PW] New user thread error:', e.message));
      }

      await _sleep(2000);
    }
  } catch(e) {
    console.error('[IG-PW] New user poll error:', e.message);
  }
}

let _igPollRunning = false; // guard: prevent overlapping poll cycles
let _igPollCount = 0;    // tracks cycle count for periodic maintenance
let _igSeedDone = false; // first poll seeds igSeenMessages without sending replies
async function pollInstagramDMs() {
  if (!igReady || !igPage || _igPollRunning) return;
  _igPollRunning = true;
  try {
    // ── Periodic session check (every 20 cycles ~6min) — avoids loading inbox SPA each poll ──
    // The inbox SPA is a heavy React app that accumulates heap if loaded repeatedly.
    // Instead, we only navigate for session keep-alive, and use API calls for all data.
    _igPollCount = (_igPollCount || 0) + 1;
    if (_igPollCount % 20 === 1) {
      await igPage.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 20000 })
        .catch(e => { if (!e.message.includes('ERR_ABORTED')) throw e; });
      await _sleep(1500);
      if (igPage.url().includes('login')) {
        console.log('[IG-PW] Session expired — re-logging in...');
        await loginInstagramPW();
        if (igPage.url().includes('login')) { console.log('[IG-PW] Re-login failed — aborting poll'); return; }
      }
      console.log('[IG-PW] Session OK — poll cycle', _igPollCount);
    }

    // ── Memory cleanup every 30 cycles (~10min) ──
    if (_igPollCount % 30 === 0) {
      if (igSeenMessages.size > 500) {
        const keep = [...igSeenMessages].slice(-300);
        igSeenMessages.clear(); keep.forEach(id => igSeenMessages.add(id));
      }
      if (igThreadUrls.size > 300)   { const k=[...igThreadUrls.entries()].slice(-200);   igThreadUrls.clear();   k.forEach(([a,b])=>igThreadUrls.set(a,b)); }
      if (igLastUserReply.size > 300) { const k=[...igLastUserReply.entries()].slice(-200); igLastUserReply.clear(); k.forEach(([a,b])=>igLastUserReply.set(a,b)); }
      console.log('[IG-PW] Cleanup done. seen=' + igSeenMessages.size + ' threads=' + igThreadUrls.size);
    }

    // Collect all thread hrefs from inbox (no clicking â just read hrefs)
    // Wait for thread list to render (Instagram SPA needs time)

    // Use Instagram internal API to get DM thread IDs (DOM scan doesn't work in headless mode)
    let threadHrefs = [];
    const _inboxApi = await igPage.evaluate(async () => {
      try {
        const tok = document.cookie.match(/csrftoken=([^;]+)/)?.[1] || '';
        const r = await fetch('/api/v1/direct_v2/inbox/?limit=100', {
          credentials: 'include',
          headers: { 'X-CSRFToken': tok, 'X-IG-App-ID': '936619743392459' }
        });
        if (!r.ok) return { err: r.status };
        return await r.json();
      } catch(e) { return { err: e.message }; }
    }).catch(() => null);

    if (_inboxApi?.inbox?.threads?.length) {
      // Priority sort: active conversations (user replied < 5 min ago) first,
      // then by Instagram's own last_activity_at, then cold threads last.
      const now = Date.now();
      const sorted = [..._inboxApi.inbox.threads].sort((a, b) => {
        const aSender = 'ig_pw_' + a.thread_id;
        const bSender = 'ig_pw_' + b.thread_id;
        const aRecent = (igLastUserReply.get(aSender) || 0) > now - 5 * 60 * 1000 ? 1 : 0;
        const bRecent = (igLastUserReply.get(bSender) || 0) > now - 5 * 60 * 1000 ? 1 : 0;
        if (bRecent !== aRecent) return bRecent - aRecent; // active first
        return (b.last_activity_at || 0) - (a.last_activity_at || 0); // then by IG timestamp
      });
      threadHrefs = sorted.map(t => '/direct/t/' + t.thread_id + '/');
      console.log('[IG-PW] API: got ' + threadHrefs.length + ' threads (priority sorted)');
    } else {
      console.log('[IG-PW] API no threads. Response keys:', Object.keys(_inboxApi || {}).join(','));
    }

    console.log('[IG-PW] Found ' + threadHrefs.length + ' DM threads');

    // ── First poll after restart: seed igSeenMessages without sending any replies ──
    // This prevents the bot from re-processing old messages and spamming re-prompts.
    if (!_igSeedDone) {
      _igSeedDone = true;
      console.log('[IG-PW] Seed pass: marking', threadHrefs.length, 'threads as seen (no replies)');
      for (const href of threadHrefs.slice(0, 100)) {
        const tid = href.replace(/\//g, '').replace('directt', '');
        try {
          const td = await igPage.evaluate(async (t) => {
            try {
              const tok = document.cookie.match(/csrftoken=([^;]+)/)?.[1] || '';
              const r = await fetch('/api/v1/direct_v2/threads/' + t + '/?limit=1', {
                credentials: 'include',
                headers: { 'X-CSRFToken': tok, 'X-IG-App-ID': '936619743392459' }
              });
              if (!r.ok) return null;
              return await r.json();
            } catch(e) { return null; }
          }, tid).catch(() => null);
          if (td?.thread?.items?.[0]) {
            const item = td.thread.items[0];
            const mid = item.item_id || (tid + '::' + (item.text || '').substring(0, 60));
            igSeenMessages.add(mid);
          }
        } catch(e) { /* skip */ }
      }
      console.log('[IG-PW] Seed done: marked', igSeenMessages.size, 'messages as seen');
      // Save cookies and return — actual processing starts from next poll cycle
      saveIgCookies(await igContext.cookies());
      _igPollRunning = false;
      return;
    }

    // Process up to 100 threads SERIALLY (API calls are fast, no page loads needed)
    const toProcess = threadHrefs.slice(0, 100);
    for (const href of toProcess) {
      await processThread(igPagePool[0] || { page: igPage }, href)
        .catch(e => console.error('[IG-PW] processThread error:', e.message));
      await _sleep(200); // tiny yield between threads
    }

    saveIgCookies(await igContext.cookies());
  } catch (e) {
    console.error('[IG-PW] Poll error:', e.message);
    igReady = false;
    if (e.message.includes('browser has been closed') || e.message.includes('context or browser')) {
      console.log('[IG-PW] Browser crash detected in poll — reinitializing in 30s...');
      setTimeout(() => initPlaywrightIG(_igUsername, _igPassword), 30 * 1000);
    } else {
      // Re-engage warm leads who went silent
      await sendProactiveFollowups();
      setTimeout(pollInstagramDMs, 30 * 1000);
    }
  } finally {
    _igPollRunning = false; // always release the lock so next interval can run
  }
}

// ââ Send reply (used by index.js _handleMessage for initial messages) âââââââââ
async function sendInstagramMessagePW(senderId, text) {
  if (!igPage) { console.error('[IG-PW] No browser page'); return; }
  try {
    const threadUrl = igThreadUrls.get(senderId);

    // Prefer the page already open on this thread (registered by processThread).
    // This avoids a race condition where all pool pages are still busy.
    const activePage = igActivePages.get(senderId);
    if (activePage) {
      await sendMessageOnPage(activePage, text);
      console.log('[IG-PW] Reply sent to', senderId, '(active page)');
      return;
    }

    // API-first send: extract threadId and send directly without navigation
    const threadId = threadUrl ? threadUrl.split('/').filter(Boolean).pop() : null;
    if (threadId) {
      const prevThreadId = _currentProcessingThreadId;
      _currentProcessingThreadId = threadId;
      try {
        await sendMessageOnPage(igPage, text);
        console.log('[IG-PW] Reply sent to', senderId, '(API, no navigation)');
        return;
      } finally {
        _currentProcessingThreadId = prevThreadId;
      }
    }
    // DOM fallback: create fresh page, navigate, send, close — no heap leak
    let tempPage = null;
    try {
      tempPage = await igContext.newPage();
      if (threadUrl) {
        await tempPage.goto(threadUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
          .catch(e => { if (!e.message.includes('ERR_ABORTED')) throw e; });
        await _sleep(2000);
      }
      await sendMessageOnPage(tempPage, text);
      console.log('[IG-PW] Reply sent to', senderId, '(DOM fallback)');
    } finally {
      if (tempPage) tempPage.close().catch(() => {}); // always close — free memory
    }
  } catch (e) {
    console.error('[IG-PW] Send error:', e.message);
  }
}

// ââ Module export âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
module.exports = {
  async init({ db, handleMessage, sleep, INSTAGRAM_USERNAME, INSTAGRAM_PASSWORD}) {
    _db = db;
    _handleMessage = handleMessage;
    _sleep = sleep;
    await initPlaywrightIG(INSTAGRAM_USERNAME, INSTAGRAM_PASSWORD);
    return sendInstagramMessagePW;
  }
};

module.exports.loginInstagramPW = loginInstagramPW;
