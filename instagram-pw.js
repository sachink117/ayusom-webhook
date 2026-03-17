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

// Qualification state per sender
// Stages: 'awaiting_qual', 'awaiting_symptoms', 'awaiting_duration', 'qualified'
const igQualStates = new Map();

// Page pool for parallel thread processing
const igPagePool = [];
const POOL_SIZE = 3;

let _db, _handleMessage, _sleep;
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
  if (!_db) return;
  try {
    const doc = await _db.collection('config').doc('ig_qual_states').get();
    if (doc.exists && doc.data().states) {
      for (const [k, v] of Object.entries(doc.data().states)) {
        igQualStates.set(k, v);
      }
      console.log('[IG-PW] Loaded', igQualStates.size, 'qualification states');
    }
  } catch (e) {}
}
function saveQualStates() {
  if (!_db) return;
  const obj = {};
  igQualStates.forEach((v, k) => { obj[k] = v; });
  _db.collection('config').doc('ig_qual_states')
    .set({ states: obj, savedAt: Date.now() })
    .catch(e => console.error('[IG-PW] QualState save error:', e.message));
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

// Send a single message on a specific Playwright page (already on the thread)
async function sendMessageOnPage(page, text) {
  try {
    const inputEl = await page.waitForSelector(
      '[contenteditable="true"][role="textbox"], div[contenteditable="true"][data-testid], textarea[placeholder*="essage"]',
      { timeout: 8000 }
    ).catch(() => null);
    if (!inputEl) { console.error('[IG-PW] Message input not found'); return; }
    await inputEl.click();
    await _sleep(400);
    await inputEl.fill(text);
    await _sleep(400);
    await page.keyboard.press('Enter');
    await _sleep(600);
  } catch (e) {
    console.error('[IG-PW] sendMessageOnPage error:', e.message);
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

  for (const msg of messages) {
    await sendMessageOnPage(page, msg);
    await _sleep(2800); // Pause between messages to feel natural
  }

  igQualStates.set(senderId, { stage: 'qualified', duration, symptoms, sinusType });
  saveQualStates();
}

// Returns true if this message was handled as a qualification reply
async function handleQualificationReply(senderId, page, msgText) {
  const state = igQualStates.get(senderId);

  // Already qualified â do not re-run the sequence
  if (state && state.stage === 'qualified') return false;

  const duration = parseDuration(msgText);
  const symptoms = parseSymptoms(msgText);

  // New user with BOTH duration + symptoms in first message â handle directly
  if ((!state || state.stage === 'new') && duration && symptoms.length > 0) {
    await sendQualificationSequence(senderId, page, duration, symptoms);
    return true;
  }

  // Not awaiting qual yet â let _handleMessage handle it
  if (!state || state.stage === 'new') return false;

  if (state.stage === 'awaiting_qual' || state.stage === 'awaiting_symptoms' || state.stage === 'awaiting_duration') {
    const finalDuration = duration || state.duration || null;
    const finalSymptoms = symptoms.length > 0 ? symptoms : (state.symptoms || []);

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
async function initPlaywrightIG(INSTAGRAM_USERNAME, INSTAGRAM_PASSWORD) {
  _igUsername = INSTAGRAM_USERNAME;
  _igPassword = INSTAGRAM_PASSWORD;
  try {
    const { chromium } = require('playwright');
    igBrowser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--single-process',
        '--disable-blink-features=AutomationControlled',
        '--lang=en-US,en',
      ]
    });
    igContext = await igBrowser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
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

    // Initialize page pool for parallel DM processing
    console.log('[IG-PW] Initializing page pool (' + POOL_SIZE + ' tabs)...');
    igPagePool.length = 0;
    for (let i = 0; i < POOL_SIZE; i++) {
      const poolPage = await igContext.newPage();
      // Pre-warm each pool page by navigating to a blank Instagram page
      await poolPage.goto('https://www.instagram.com/', { timeout: 20000 }).catch(() => {});
      igPagePool.push({ page: poolPage, busy: false });
      console.log('[IG-PW] Pool tab', i + 1, 'ready');
    }

    igReady = true;
    console.log('Instagram Playwright: ready, polling every 1 min');
    console.log('[IG-PW] Module loaded. Page pool:', POOL_SIZE, 'tabs. Auto-qualification: ON');
    setInterval(pollInstagramDMs, 1 * 60 * 1000);
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
  const { page } = poolEntry;
  const threadId = href.replace(/\//g, '').replace('directt', '');
  const senderId = 'ig_pw_' + threadId;
  const threadUrl = 'https://www.instagram.com' + href;

  try {
    await page.goto(threadUrl, { timeout: 20000 });
    await _sleep(2200);

    // Check if session expired on this pool page
    if (page.url().includes('login')) {
      console.log('[IG-PW] Pool page session expired â skipping thread', threadId);
      return;
    }

    const msgEls = await page.$$(
      'div[class*="_aa6j"], div[dir="auto"]:not(header *), [class*="messageText"]'
    );
    if (msgEls.length === 0) return;

    const lastEl = msgEls[msgEls.length - 1];
    const msgText = (await lastEl.textContent().catch(() => '')).trim();
    if (!msgText || msgText.length < 2) return;

    const msgId = threadId + '::' + msgText.substring(0, 60);
    if (igSeenMessages.has(msgId)) return;
    igSeenMessages.add(msgId);
    igThreadUrls.set(senderId, threadUrl);

    console.log('[IG-PW] DM (' + threadId + '): "' + msgText.substring(0, 80) + '"');

    // Try qualification handler first
    const qualHandled = await handleQualificationReply(senderId, page, msgText);

    if (!qualHandled) {
      // Mark as awaiting qualification after _handleMessage sends initial message
      const isNew = !igQualStates.has(senderId);
      await _handleMessage(senderId, msgText, 'instagram_playwright')
        .catch(e => console.error('[IG-PW] handleMessage error:', e.message));
      if (isNew) {
        igQualStates.set(senderId, { stage: 'awaiting_qual' });
        saveQualStates();
      }
    }

    await _sleep(1500);
  } catch (e) {
    console.error('[IG-PW] Thread error [' + threadId + ']:', e.message);
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

async function sendProactiveFollowups() {
  try {
    const now = Date.now();
    const senders = Object.keys(igQualStates);
    if (!senders.length) return;
    console.log('[IG-PW] Checking proactive follow-ups for ' + senders.length + ' leads...');
    let nudgeCount = 0;
    for (const senderId of senders) {
      const st = igQualStates[senderId];
      if (!st || !st.stage) continue;
      if (st.stage === 'converted' || st.stage === 'opted_out') continue;
      if (!FOLLOWUP_MSGS[st.stage]) continue;
      if (st.nudgeSentAt && (now - st.nudgeSentAt) < FOLLOWUP_DELAY_MS) continue;
      const lastAct = st.lastUpdated || st.nudgeSentAt || 0;
      if (lastAct && (now - lastAct) < FOLLOWUP_DELAY_MS) continue;
      console.log('[IG-PW] Nudging ' + senderId + ' | stage: ' + st.stage);
      try {
        await sendInstagramMessagePW(senderId, FOLLOWUP_MSGS[st.stage]);
        st.nudgeSentAt = now;
        nudgeCount++;
        await _sleep(4000);
      } catch (e) {
        console.error('[IG-PW] Nudge failed for ' + senderId + ':', e.message);
      }
    }
    if (nudgeCount > 0) {
      await saveQualStates();
      console.log('[IG-PW] Proactive nudges sent: ' + nudgeCount);
    }
  } catch (err) {
    console.error('[IG-PW] Proactive follow-up error:', err.message);
  }
}
// ──────────────────────────────────────────────────────────────────────────────

async function pollInstagramDMs() {
  if (!igReady || !igPage) return;
  try {
    await igPage.goto('https://www.instagram.com/direct/inbox/', { timeout: 30000 });
    await _sleep(3000);
    console.log('[IG-PW] Poll URL:', igPage.url());

    if (igPage.url().includes('login')) {
      console.log('[IG-PW] Session expired â re-logging in...');
      await loginInstagramPW();
      console.log('[IG-PW] Post-relogin URL:', igPage.url());
      if (igPage.url().includes('login')) {
        console.log('[IG-PW] Still on login after re-login â aborting poll');
        return;
      }
    }

    // Collect all thread hrefs from inbox (no clicking â just read hrefs)
    // Wait for thread list to render (Instagram SPA needs time)
    await igPage.waitForSelector('a[href*="/direct/t/"]', { timeout: 12000 }).catch(() => null);

    // Collect thread hrefs via evaluate (more reliable than $$ for SPAs)
    const threadHrefs = await igPage.evaluate(() => {
      const seen = new Set();
      const hrefs = [];
      document.querySelectorAll('a').forEach(a => {
        try {
          const path = a.pathname || new URL(a.href).pathname;
          if (path && path.includes('/direct/t/') && !seen.has(path)) {
            seen.add(path);
            hrefs.push(path);
          }
        } catch (e) {}
      });
      return hrefs;
    }).catch(() => []);
    console.log('[IG-PW] Found ' + threadHrefs.length + ' DM threads');
  // Auto re-login if inbox appears empty (expired session)
  if (threadHrefs.length === 0) {
      // Debug: log page state to diagnose empty inbox
      try {
        const dbg = await igPage.evaluate(() => ({
          url: location.href,
          title: document.title,
          totalLinks: document.querySelectorAll('a').length,
          directLinks: Array.from(document.querySelectorAll('a')).filter(a => a.href && a.href.includes('/direct/')).length,
          sampleLinks: Array.from(document.querySelectorAll('a')).filter(a => a.href && a.href.includes('/direct/')).slice(0,3).map(a => new URL(a.href).pathname)
        }));
        console.log('[IG-PW] Debug - URL:', dbg.url, '| title:', dbg.title, '| links:', dbg.totalLinks, '| /direct/ links:', dbg.directLinks, '| samples:', JSON.stringify(dbg.sampleLinks));
      } catch(_dbg) {}
    try {
      const hasLoginForm = await page.evaluate(() =>
        !!document.querySelector('input[name="username"], input[autocomplete="username"]')
      );
      if (hasLoginForm) {
        console.log('[IG-PW] Empty inbox + login form detected — session expired, re-logging in...');
        await loginInstagramPW();
        setTimeout(pollInstagramDMs, 2 * 60 * 1000);
        return;
      }
    } catch(_e) {}
    console.log('[IG-PW] Empty inbox — inbox may genuinely be empty, continuing.');
  }

    // Process up to 15 threads in parallel batches of POOL_SIZE
    const toProcess = threadHrefs.slice(0, 15);
    for (let i = 0; i < toProcess.length; i += POOL_SIZE) {
      const batch = toProcess.slice(i, i + POOL_SIZE);
      // Mark pool entries as busy
      const poolEntries = igPagePool.slice(0, batch.length);
      poolEntries.forEach(p => { p.busy = true; });
      await Promise.allSettled(
        batch.map((href, idx) => processThread(poolEntries[idx], href))
      );
      poolEntries.forEach(p => { p.busy = false; });
      await _sleep(1000); // Brief pause between batches
    }

    saveIgCookies(await igContext.cookies());
  } catch (e) {
    console.error('[IG-PW] Poll error:', e.message);
    igReady = false;
        // Re-engage warm leads who went silent
    await sendProactiveFollowups();
    setTimeout(pollInstagramDMs, 5 * 60 * 1000);
  }
}

// ââ Send reply (used by index.js _handleMessage for initial messages) âââââââââ
async function sendInstagramMessagePW(senderId, text) {
  if (!igPage) { console.error('[IG-PW] No browser page'); return; }
  try {
    const threadUrl = igThreadUrls.get(senderId);

    // Find a free pool page
    const poolEntry = igPagePool.find(p => !p.busy);
    const page = poolEntry ? poolEntry.page : igPage;
    if (poolEntry) poolEntry.busy = true;

    try {
      if (threadUrl) {
        const currentUrl = page.url();
        if (!currentUrl.includes(threadUrl.split('/').pop())) {
          await page.goto(threadUrl, { timeout: 15000 });
          await _sleep(2000);
        }
      }
      await sendMessageOnPage(page, text);
      console.log('[IG-PW] Reply sent to', senderId);
    } finally {
      if (poolEntry) poolEntry.busy = false;
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
