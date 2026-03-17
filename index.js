// ============================================================
// AYUSOMAM MESSENGER BOT — Version 5.0 (PLUGIN EDITION)
// Built by Claude | Ayusomam Herbals
//
// v5.0 Updates (from Plugin learnings):
// ✅ Numbered duration + symptom menus (tap to reply)
// ✅ Multi-symptom selection with combo insights (wow factor)
// ✅ Sinus Type revealed LAST after all insights
// ✅ Insight-led, not sympathy-led for chronic cases
// ✅ Medicine cycle assumed for 3+ year cases
// ✅ Hope-led pitch: "14 din mein sinus theek ho sakta hai"
// ✅ Commitment first, manual payment details shared by you after yes
// ✅ Diet always last in program descriptionh
// ✅ No dashes — full stops and line breaks only
// ✅ All 6 sinus types with wellness naming for revealsh
// ✅ Language mirroring across all Indian languages
// ✅ Ghosting recovery + Day milestones (5, 7, 10, 13)
// ✅ Red flag detection → ENT referral
// ✅ Google Sheets logging
// ============================================================

const express    = require("express");
const Anthropic  = require("@anthropic-ai/sdk");
const app        = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ─── CONFIG ──────────────────────────────────────────────────
const PAGE_ACCESS_TOKEN  = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN       = process.env.VERIFY_TOKEN;
const ANTHROPIC_API_KEY  = process.env.ANTHROPIC_API_KEY;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WA_NUMBER = '+15559069156'; // Ayusomam Twilio WhatsApp number (hardcoded)
const INSTAGRAM_TOKEN    = process.env.INSTAGRAM_TOKEN;
const SHEET_URL          = process.env.GOOGLE_SHEET_URL || "";
const PORT               = process.env.PORT || 3000;
const RAZORPAY_LINK_499  = process.env.RAZORPAY_LINK_499  || "https://rzp.io/rzp/Re2W26iX";
const RAZORPAY_LINK_1299 = process.env.RAZORPAY_LINK_1299 || "https://rzp.io/rzp/qu8zhQT";

const WHATSAPP_TOKEN           = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const widgetPending            = {};
const INSTAGRAM_USERNAME       = process.env.INSTAGRAM_USERNAME;
const INSTAGRAM_PASSWORD       = process.env.INSTAGRAM_PASSWORD;

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// ─── FIREBASE INIT ────────────────────────────────────────────
let db = null;
try {
  const admin = require('firebase-admin');
  if (!admin.apps.length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  db = admin.firestore();
  console.log('✅ Firebase connected');
} catch(e) {
  console.warn('⚠️  Firebase not available — running in-memory only:', e.message);
}

// ─── IN-MEMORY STORE ─────────────────────────────────────────
// userData[userId] = {
//   lang, sinusType, convPhase, state, history,
//   duration, durationIndex, symptoms, symptomNums,
//   usedAllopathy, selectedPlan, enrolledAt,
//   lastMessageAt, ghostAttempts, followupStage,
//   milestonesSent[], name, platform,
//   durationMenuSent, symptomMenuSent, insightShown,
//   sinusTypeRevealed, awaitingCommitment
// }
const userData = {};
const processedMessages = new Set();

// ─── FIRESTORE HELPERS ────────────────────────────────────────────
async function loadUserFromFirestore(userId) {
  if (!db || userData[userId]) return;
  try {
    const doc = await db.collection('users').doc(String(userId)).get();
    if (doc.exists) userData[userId] = doc.data();
  } catch(e) { console.error('Firestore load error:', e.message); }
}

function persistUserToFirestore(userId) {
  if (!db || !userData[userId]) return;
  db.collection('users').doc(String(userId)).set(userData[userId])
    .catch(e => console.error('Firestore save error:', e.message));
}

// Load all existing users from Firestore on startup
if (db) {
  db.collection('users').get()
    .then(snap => {
      snap.forEach(doc => { userData[doc.id] = doc.data(); });
      console.log(`✅ Loaded ${snap.size} users from Firestore`);
    })
    .catch(e => console.error('Firestore startup load error:', e.message));
}

// ─── PLAYWRIGHT INSTAGRAM DM HANDLER (module) ──────────────────────────────────
// Loaded lazily when INSTAGRAM_USERNAME env var is set.
// See instagram-pw.js for the full Playwright browser automation code.
let sendInstagramMessagePW = null;

// ─── PRICING ─────────────────────────────────────────────────
const PRICES = {
  reset:       { name: "7-Day Sinus Reset",       price: "499",   days: 7  },
  restoration: { name: "14-Day Sinus Restoration", price: "1,299", days: 14 },
};

// ─── SINUS TYPE MAPPING ───────────────────────────────────────
// Internal key → customer-facing wellness name
const SINUS_TYPE_NAMES = {
  allergic:   "Reactive Sensitivity Type",
  congestive: "Chronic Congestion Type",
  infective:  "Deep Inflammation Type",
  spray:      "Spray Dependency Pattern",
  polyp:      "Drainage Blockage Type",
  dns:        "Structural Congestion Type",
};

// ─── DURATION OPTIONS ─────────────────────────────────────────
const DURATION_OPTIONS = [
  "1 se 3 mahine",
  "3 se 6 mahine",
  "1 se 2 saal",
  "3 se 5 saal",
  "5 saal se zyada",
];

// ─── SYMPTOM OPTIONS ──────────────────────────────────────────
const SYMPTOM_OPTIONS = [
  "Naak band rehti hai, khul hi nahi pati",
  "Baar baar sneezing, dhool ya thandi se trigger hoti hai",
  "Smell ya taste kum ho gayi hai",
  "Sar bhaari rehta hai, aankhon ke upar pressure feel hota hai",
  "Gale mein kuch girta rehta hai, baar baar clear karna padta hai",
  "Baar baar infection aata hai, throat mein bhi asar hota hai",
];

// ─── CONVERSATION PHASES ─────────────────────────────────────
const PHASES = ["probe", "mirror", "educate", "reframe", "close"];

// ─── LANGUAGE DETECTION ──────────────────────────────────────
function detectLang(text) {
  if (!text) return "eng";
  const devanagari = (text.match(/[\u0900-\u097F]/g) || []).length;
  const bengali    = (text.match(/[\u0980-\u09FF]/g) || []).length;
  const telugu     = (text.match(/[\u0C00-\u0C7F]/g) || []).length;
  const tamil      = (text.match(/[\u0B80-\u0BFF]/g) || []).length;
  const kannada    = (text.match(/[\u0C80-\u0CFF]/g) || []).length;
  const punjabi    = (text.match(/[\u0A00-\u0A7F]/g) || []).length;
  const max = Math.max(devanagari, bengali, telugu, tamil, kannada, punjabi);
  if (max < 2) return "eng";
  if (devanagari >= max) return "hin";
  if (bengali    >= max) return "ben";
  if (telugu     >= max) return "tel";
  if (tamil      >= max) return "tam";
  if (kannada    >= max) return "kan";
  if (punjabi    >= max) return "pun";
  return "eng";
}

// ─── PARSE NUMBER LIST FROM REPLY ────────────────────────────
// Handles: "1", "1,3", "1 3 4", "1,2,3", "1 and 3", "1-3" etc.
function parseNumberList(text) {
  const nums = [];
  const matches = text.match(/[1-6]/g) || [];
  for (const m of matches) {
    const n = parseInt(m);
    if (n >= 1 && n <= 6 && !nums.includes(n)) nums.push(n);
  }
  return nums.sort();
}

// ─── SINUS TYPE FROM KEYWORD SCAN ────────────────────────────
function detectSinusTypeFromText(text) {
  const t = text.toLowerCase();
  if (t.includes("spray") || t.includes("otrivin") || t.includes("nasivion") ||
      t.includes("nasal drop") || t.includes("bina spray"))                     return "spray";
  if (t.includes("polyp") || t.includes("polip") || t.includes("growt"))        return "polyp";
  if (t.includes("dns") || t.includes("deviated") || t.includes("septum") ||
      t.includes("tirchi") || t.includes("crooked"))                             return "dns";
  if (t.includes("jalan") || t.includes("burning") || t.includes("yellow") ||
      t.includes("peela") || t.includes("pus"))                                  return "infective";
  if (t.includes("band") || t.includes("smell") || t.includes("taste") ||
      t.includes("gandh") || t.includes("swad") || t.includes("heaviness"))      return "congestive";
  if (t.includes("sneez") || t.includes("chhink") || t.includes("allerg") ||
      t.includes("dhool") || t.includes("dust") || t.includes("watery eye"))     return "allergic";
  return null;
}

// ─── SINUS TYPE FROM SYMPTOM NUMBERS ─────────────────────────
function getSinusTypeFromSymptoms(nums) {
  const has = (n) => nums.includes(n);
  if (nums.includes(2) && !nums.includes(3) && !nums.includes(4)) return "allergic";
  if (nums.includes(3) && nums.includes(4))                         return "infective";
  if (nums.includes(3))                                             return "infective";
  if (nums.includes(5) && nums.includes(6))                         return "polyp";
  if (nums.includes(1) && nums.includes(4))                         return "congestive";
  if (nums.includes(1))                                             return "congestive";
  if (nums.includes(4))                                             return "congestive";
  return "congestive";
}

// ─── SYMPTOM INSIGHTS (the wow factor) ───────────────────────
// Returns multi-message insight text based on selected symptom numbers
function buildSymptomInsights(nums, lang) {
  const isEng = lang === "eng";

  const singleInsights = {
    1: isEng
      ? "Blocked nose means mucus has been building up chronically in your nasal passages. When this is not cleared regularly, the passages narrow and the body starts treating it as the new normal."
      : "Naak band rehna matlab nasal passages mein chronic mucus build-up ho raha hai. Jab ye regularly clear nahi hota, passages narrow hone lagte hain aur body ise normal maanna shuru kar deti hai.",
    2: isEng
      ? "Repeated sneezing triggered by dust or cold means your nasal lining has become hypersensitive. The body is over-reacting to external triggers. This is not just allergy. It is an imbalanced immune response in the nasal system."
      : "Dhool ya thandi se baar baar sneezing matlab nasal lining hypersensitive ho gayi hai. Body baahri triggers ke against over-react kar rahi hai. Ye sirf allergy nahi. Ye nasal system ki imbalanced immune response hai.",
    3: isEng
      ? "Smell and taste loss happens when inflammation reaches the olfactory nerves at the top of the nasal passage. This is a sign that inflammation has gone deeper than the surface. It is reversible, but needs the right approach."
      : "Smell aur taste kum hona tab hota hai jab inflammation olfactory nerves tak pahunch jaati hai. Ye sign hai ki inflammation surface se andar ja chuki hai. Ye reversible hai, lekin sahi approach chahiye.",
    4: isEng
      ? "Head heaviness and eye pressure means mucus is collecting inside the sinuses and not draining out. The pressure you feel above the eyes is directly from that trapped mucus and inflammation around it."
      : "Sar bhaari aur aankhon ke upar pressure matlab mucus sinuses ke andar collect ho raha hai aur drain nahi ho pa raha. Jo pressure feel hota hai aankhon ke upar, woh directly usi trapped mucus ki wajah se hai.",
    5: isEng
      ? "Mucus dripping into the throat means the nasal drainage system is not clearing forward. It goes backward instead. This usually gets worse at night and disrupts sleep. It also keeps the throat irritated."
      : "Gale mein girna matlab nasal drainage system aage clear nahi ho raha. Peeche ki taraf ja raha hai. Ye raat ko zyada hota hai aur neend disturb karta hai. Throat bhi irritate rehti hai isi wajah se.",
    6: isEng
      ? "Recurring infections happen because blocked passages become a breeding ground for bacteria. Every time you treat the infection with antibiotics, the blockage stays. So the infection keeps coming back. The real problem is the blockage, not the infection."
      : "Baar baar infection isliye aata hai kyunki blocked passages mein bacteria thehri rehti hai. Har baar antibiotic se infection treat karo, blockage wahi rehti hai. Isliye infection wapas aata hai. Asli problem blockage hai, infection nahi.",
  };

  const combinationInsights = {
    "1,4": isEng
      ? "Blocked nose and pressure together means mucus is stuck inside the sinuses with no way out. Classic chronic congestion pattern."
      : "Naak band aur pressure saath mein matlab mucus sinuses ke andar collect ho rahi hai aur drain nahi ho pa rahi. Classic chronic congestion pattern hai.",
    "1,6": isEng
      ? "Blocked nose and recurring infection together means every infection is caused by the same blockage. Treating only the infection will keep this cycle going forever."
      : "Naak band aur baar baar infection saath mein matlab har infection usi blockage ki wajah se ho rahi hai. Sirf infection treat karte rehne se ye cycle kabhi band nahi hogi.",
    "3,4": isEng
      ? "Smell loss and pressure together means inflammation has spread from the sinuses up to the smell nerves. Multiple areas are now affected."
      : "Smell loss aur pressure saath mein matlab inflammation sinuses se upar smell nerves tak pahunch gayi hai. Multiple areas affect ho chuke hain.",
    "5,6": isEng
      ? "Post-nasal drip and recurring infection together form a cycle. Mucus drips into the throat, bacteria settles there, infection follows. Breaking this drainage cycle is the key."
      : "Gale mein girna aur baar baar infection ek cycle mein hain. Mucus throat mein girti hai, bacteria wahan settle hoti hai, infection hota hai. Is drainage cycle ko band karna zaroori hai.",
    "1,2,4": isEng
      ? "This combination means your nasal passages are both reactive to triggers AND congested. Double burden on the system."
      : "Ye combination matlab nasal passages triggers ke against reactive bhi hain aur congestion bhi hai. System pe double burden hai.",
    "1,3,4": isEng
      ? "All three together means inflammation has spread significantly. The blockage, the smell loss, and the pressure are all connected. Full system reset is needed."
      : "Teeno saath mein matlab inflammation kaafi spread ho gayi hai. Blockage, smell loss, aur pressure teeno connected hain. Full system reset zaroori hai.",
  };

  // Collect individual insights for selected symptoms
  const parts = [];
  for (const n of nums) {
    if (singleInsights[n]) parts.push(singleInsights[n]);
  }

  // Find best combo insight
  const key = nums.slice().sort().join(",");
  let comboInsight = null;
  // Check all combo keys, longest match first
  const comboKeys = Object.keys(combinationInsights).sort((a, b) => b.split(",").length - a.split(",").length);
  for (const ck of comboKeys) {
    const ckNums = ck.split(",").map(Number);
    if (ckNums.every((n) => nums.includes(n))) {
      comboInsight = combinationInsights[ck];
      break;
    }
  }

  if (comboInsight && nums.length > 1) parts.push(comboInsight);

  return parts;
}

// ─── RED FLAG DETECTION ───────────────────────────────────────
function hasRedFlag(text) {
  const t = text.toLowerCase();
  return (
    t.includes("blood") || t.includes("khoon") || t.includes("rakta") ||
    t.includes("vision") || t.includes("aankhein") || t.includes("nazar") ||
    t.includes("severe pain") || t.includes("bahut dard") ||
    t.includes("double vision") || t.includes("swelling eye") ||
    (t.includes("fever") && (t.includes("high") || t.includes("102"))) ||
    (t.includes("bukhar") && t.includes("tej"))
  );
}

// ─── MESSAGING FUNCTIONS ─────────────────────────────────────
async function sendTwilioMessage(to, body) {
  if (!to || !/^[+0-9]/.test(String(to))) { console.error('[Twilio] Skipping invalid to:', to); return; }
  const client = require("twilio")(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  return client.messages.create({
    body,
    from: `whatsapp:${TWILIO_WA_NUMBER}`,
    to:   `whatsapp:${to.replace(/^whatsapp:/i, '')}`,
  });
}

async function sendFBMessage(recipientId, text) {
  const url = `https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`;
  const res = await fetch(url, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ recipient: { id: recipientId }, message: { text } }),
  });
  return res.json();
}

async function sendInstagramMessage(recipientId, text) {
  // Must use Instagram Business Account ID as sender, not "me" (which resolves to the FB Page)
  const igAccountId = process.env.INSTAGRAM_ACCOUNT_ID || '17841445309536661';
  const url = `https://graph.facebook.com/v18.0/me/messages?access_token=${INSTAGRAM_TOKEN}`;
  const res = await fetch(url, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${INSTAGRAM_TOKEN}`
    },
    body:    JSON.stringify({ recipient: { id: recipientId }, message: { text } }),
  });
  const json = await res.json();
  if (json.error) console.error("[IG] Send error:", JSON.stringify(json.error));
  else console.log("[IG] Message sent to", recipientId);
  return json;
}

async function sendWhatsAppMessage(to, body) {
  const url = "https://graph.facebook.com/v18.0/" + WHATSAPP_PHONE_NUMBER_ID + "/messages";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + WHATSAPP_TOKEN,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body }
    })
  });
  if (!res.ok) {
    const err = await res.text();
    console.error("[WA] Send failed:", err);
  }
}

async function sendMessage(platform, userId, text) {
  if (!text || !text.trim()) return;
  text = cleanText(text);
  const chunks = splitMessage(text);
  for (const chunk of chunks) {
    if      (platform === "twilio")    await sendTwilioMessage(userId, chunk);
    else if (platform === "instagram") await sendInstagramMessage(userId, chunk);
    else if (platform === "instagram_playwright" && sendInstagramMessagePW) await sendInstagramMessagePW(userId, chunk);
    else if (platform === "whatsapp")  await sendWhatsAppMessage(userId, chunk);
    else if (platform === "website")   { if (widgetPending[userId]) widgetPending[userId].push(chunk); }
    else                               await sendFBMessage(userId, chunk);
    if (chunks.length > 1) await sleep(700);
  }
}

function cleanText(text) {
  if (!text) return text;
  return text
    .replace(/\u2014|\u2013/g, '')          // strip em-dash and en-dash
    .replace(/^ *[-\u2022] +/gm, '')         // strip bullet hyphens/dots at line start
    .replace(/ - /g, ' ')                     // strip pause hyphens
    .replace(/([a-zA-Z\u0900-\u097F]) - ([a-zA-Z\u0900-\u097F])/g, '$1 $2') // word-hyphen-word
    .replace(/ {2,}/g, ' ')                   // collapse spaces
    .trim();
}

function splitMessage(text, maxLen = 1500) {
  if (text.length <= maxLen) return [text];
  const parts = [];
  let cur = "";
  for (const line of text.split("\n")) {
    if ((cur + "\n" + line).length > maxLen) {
      if (cur) parts.push(cur.trim());
      cur = line;
    } else {
      cur = cur ? cur + "\n" + line : line;
    }
  }
  if (cur) parts.push(cur.trim());
  return parts;
}

async function sendWithTyping(platform, userId, text, delayMs = 1200) {
  await sleep(delayMs);
  await sendMessage(platform, userId, text);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── GOOGLE SHEETS LOGGING ────────────────────────────────────
async function logToSheet(userId, platform, sinusType, state, msg, botReply) {
  if (!SHEET_URL) return;
  const user = userData[userId] || {};
  try {
    await fetch(SHEET_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        action:    "log_message",
        timestamp: new Date().toISOString(),
        userId:    userId.replace(/^whatsapp:/i, ''),
        name:      user.name || '',
        platform,
        sinusType: sinusType || user.sinusType || "unknown",
        state:     state     || user.state     || "new",
        phase:     user.convPhase || "probe",
        userMsg:   (msg      || "").substring(0, 300),
        botReply:  cleanText(botReply || "").substring(0, 300),
      }),
    });

    await fetch(SHEET_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        action:          "update_lead",
        timestamp:       new Date().toISOString(),
        userId, platform,
        name:            user.name          || "",
        language:        user.lang          || "hin",
        sinusType:       user.sinusType     || sinusType || "unknown",
        duration:        user.duration      || "",
        symptoms:        (user.symptomNums  || []).join(","),
        usedAllopathy:   user.usedAllopathy === true ? "Yes" : user.usedAllopathy === false ? "No" : "Not asked",
        convPhase:       user.convPhase     || "probe",
        state:           user.state         || state || "new",
        selectedPlan:    user.selectedPlan  || "",
        enrolledAt:      user.enrolledAt    ? new Date(user.enrolledAt).toISOString() : "",
        ghostAttempts:   user.ghostAttempts || 0,
        milestonesSent:  (user.milestonesSent || []).join(","),
        lastMessageAt:   user.lastMessageAt ? new Date(user.lastMessageAt).toISOString() : "",
        totalMessages:   Math.floor((user.history || []).length / 2),
        lastUserMsg:     (msg      || "").substring(0, 200),
        lastBotReply:    (botReply || "").substring(0, 200),
      }),
    });
  } catch (e) {
    console.error("Sheet log error:", e.message);
  }
}

// ─── NAME EXTRACTION ─────────────────────────────────────────
function extractNameFromText(text) {
  if (!text) return null;
  const patterns = [
    /(?:mera naam|my name is|main hun|i am|i'm|naam hai)\s+([A-Za-z\u0900-\u097F]+)/i,
    /^([A-Za-z]{3,20})\s+(?:hun|hoon|here|bol raha|bol rahi)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m && m[1] && m[1].length > 2) return m[1];
  }
  return null;
}

// ─── DURATION EXTRACTION ─────────────────────────────────────
function extractDuration(text) {
  if (!text) return null;
  const m = text.match(/(\d+)\s*(?:saal|year|sal|mahine|month|hafte|week|din|day)/i);
  if (m) return m[0];
  if (/bahut samay|kaafi samay|long time|years/i.test(text)) return "Long term";
  return null;
}

// ─── DURATION MENU BUILDER ────────────────────────────────────
function buildDurationMenu(lang) {
  if (lang === "eng") {
    return "How long have you had this sinus problem?\n\n1. Just started (1 to 3 months)\n2. A few months (3 to 6 months)\n3. 1 to 2 years\n4. 3 to 5 years\n5. More than 5 years";
  }
  return "Ye problem kitne time se hai?\n\n1. Abhi abhi shuru hua (1 se 3 mahine)\n2. Thodi purani hai (3 se 6 mahine)\n3. 1 se 2 saal se\n4. 3 se 5 saal se\n5. 5 saal se zyada";
}

// ─── SYMPTOM MENU BUILDER ─────────────────────────────────────
function buildSymptomMenu(lang) {
  if (lang === "eng") {
    return "Which symptoms do you have? Reply with all the numbers that apply.\n\n1. Nose stays blocked, can never fully open\n2. Repeated sneezing triggered by dust or cold\n3. Smell or taste has reduced\n4. Head feels heavy, pressure above the eyes\n5. Something keeps dripping into the throat, need to clear it often\n6. Recurring infections, also affecting the throat";
  }
  return "Aapko kaunse symptoms hain? Sab numbers reply karein jo apply hote hain.\n\n1. Naak band rehti hai, khul hi nahi pati\n2. Baar baar sneezing, dhool ya thandi se trigger hoti hai\n3. Smell ya taste kum ho gayi hai\n4. Sar bhaari rehta hai, aankhon ke upar pressure feel hota hai\n5. Gale mein kuch girta rehta hai, baar baar clear karna padta hai\n6. Baar baar infection aata hai, throat mein bhi asar hota hai";
}

// ─── MEDICINE CYCLE MESSAGE ───────────────────────────────────
function buildMedicineCycleMsg(durationIndex, lang) {
  // Only for 3+ year cases (indices 2, 3, 4)
  if (durationIndex < 2) return null;
  if (lang === "eng") {
    return "With this much history, you have likely tried medicines before. Some relief, then the same problem came back. Is that right?";
  }
  return "Itne time mein medicines zaroor try ki hogi. Thoda relief, phir wahi problem wapas. Sahi hai?";
}

// ─── SINUS TYPE REVEAL MESSAGE ────────────────────────────────
function buildTypeReveal(sinusType, lang) {
  const name = SINUS_TYPE_NAMES[sinusType] || "Chronic Sinus Type";
  if (lang === "eng") {
    return `Based on everything you have shared, your sinus type is: ${name}.`;
  }
  return `Jo aapne bataya usse ek cheez clear hai.\n\nAapka sinus type hai: ${name}.`;
}

// ─── HOPE-LED PITCH ───────────────────────────────────────────
function buildPitch(user) {
  const isEng    = user.lang === "eng";
  const chronic  = (user.durationIndex || 0) >= 2;
  const plan     = chronic ? "restoration" : "reset";
  const planName = PRICES[plan].name;
  const price    = PRICES[plan].price;

  user.selectedPlan = plan;

  if (isEng) {
    if (chronic) {
      return `Your sinus can get better in 14 days.\n\nThis is not just hope. This is what our customers have experienced.\n\nThe program is a structured system: herbs that target chronic inflammation, specific breathing exercises, identifying your personal triggers, and diet adjustments. Everything in the right sequence.\n\n${planName} is Rs. ${price}. That is Rs. 92 a day.\n\nWould you like to start?`;
    }
    return `In 7 days, you will feel a clear difference.\n\nHerbs, exercises, structured routine. Easy to follow.\n\n${planName} is Rs. ${price}.\n\nWould you like to try?`;
  }

  if (chronic) {
    return `14 din mein aapka sinus theek ho sakta hai.\n\nYe sirf ummeed nahi. Ye hamare customers ka experience hai.\n\nProgram ek structured system hai. Herbs jo chronic inflammation ko target karte hain, specific breathing exercises, aapke personal triggers identify karna, aur diet adjustments. Sab sahi sequence mein.\n\n${planName} hai Rs. ${price}. Matlab Rs. 92 roz.\n\nShuru karna chahein?`;
  }
  return `7 din mein aap khud farak feel karein.\n\nHerbs, exercises, structured routine. Easy to follow.\n\n${planName} hai Rs. ${price}.\n\nTry karein?`;
}

// ─── COMMITMENT YES DETECTION ─────────────────────────────────
function isCommitmentYes(text) {
  const t = text.toLowerCase().trim();
  return ["haan", "ha", "yes", "theek hai", "kar lete", "okay", "ok",
    "shuru", "batao", "try", "start", "karein", "krte", "bilkul"].some((s) => t.includes(s));
}

// ─── PAYMENT DETECTION ───────────────────────────────────────
function isPaymentConfirmation(text) {
  const t = text.toLowerCase();
  return ["paid", "payment", "done", "kiya", "bheja", "transferred",
    "upi", "gpay", "phonepe", "paytm", "screenshot"].some((k) => t.includes(k));
}

// ─── SALESOM SYSTEM PROMPT ────────────────────────────────────
function buildSystemPrompt(user) {
  const lang          = user.lang || "hin";
  const sinusType     = user.sinusType ? SINUS_TYPE_NAMES[user.sinusType] || user.sinusType : "still identifying";
  const phase         = user.convPhase || "probe";
  const duration      = user.duration  || "not captured yet";
  const usedAllopathy = user.usedAllopathy ?? null;
  const isEng         = lang === "eng";

  const langInstruction = {
    hin: "LANGUAGE: Respond in Hinglish (Hindi and English mix). Write like a warm knowledgeable friend texting. Aap always. NEVER Bhai, Yaar, Boss, Didi. Short sentences. No formal paragraphs.",
    eng: "LANGUAGE: Respond in English. Write like a caring, knowledgeable friend. Short sentences. Warm and direct. No formal language. No slang.",
    ben: "LANGUAGE: Respond in Bengali mixed with English. Warm formal tone.",
    mar: "LANGUAGE: Respond in Marathi mixed with English. Aapan/Ji tone.",
    pun: "LANGUAGE: Respond in Punjabi mixed with English. Respectful tone.",
    tel: "LANGUAGE: Respond in Telugu mixed with English. Warm formal tone.",
    tam: "LANGUAGE: Respond in Tamil mixed with English. Warm formal tone.",
    kan: "LANGUAGE: Respond in Kannada mixed with English. Warm formal tone.",
  }[lang] || "LANGUAGE: Respond in Hinglish.";

  return `You are SALESOM, the AI consultant for Ayusomam Herbals. You respond as Sachin, the founder.

${langInstruction}

CURRENT PATIENT CONTEXT:
Sinus Type: ${sinusType}
Conversation Phase: ${phase}
Problem Duration: ${duration}
Used Medicines Before: ${usedAllopathy === null ? "not confirmed yet" : usedAllopathy ? "yes" : "no"}

FORMATTING RULES (follow strictly in every message):
1. ABSOLUTE RULE: ZERO dashes. No — no – no hyphen-as-pause. Not even one. Full stop or line break only. This is non-negotiable.
1b. Write like a real person texting a friend. Short, warm, natural. Never sound like a formal consultant or a robot.
2. Keep each message to 4 to 5 lines maximum. No long paragraphs. One idea per message.
3. When listing things, use numbered points. Never use bullet points or dashes.
4. No "bhai" or "didi". Use "aap" always. Professional and warm.
5. No sympathy openers for chronic cases (3+ years). Open with a clinical insight instead.
6. Prefer yes/no questions. Reduce typing effort for the customer.
7. When listing program components, always use this order: herbs first, exercises second, trigger identification third, diet last. Diet sounds like restriction. Mention it last.
8. Mirror the customer's language. If they write in English, reply in English. If Hindi, reply in Hindi. Never switch unless they do.

SINUS TYPES AND APPROACH:

1. REACTIVE SENSITIVITY TYPE (Allergic)
   Symptoms: Morning sneezing, watery eyes, dust or cold triggers, seasonal cycles
   Insight for customer: Nasal lining has become hypersensitive. Body over-reacts to external triggers. This is an immune imbalance, not just allergy.
   Key probe: "Triggers kaun se hain? Season change mein worse hota hai?"

2. CHRONIC CONGESTION TYPE (Congestive/Kaphaja)
   Symptoms: Blocked nose, smell or taste loss, facial heaviness, often started after a cold
   Insight for customer: Mucus has been building up chronically. Passages have narrowed. Body has normalized the inflamed state.
   Key probe: "Dairy kitna lete hain? Doodh, dahi, paneer."

3. DEEP INFLAMMATION TYPE (Heat Pattern/Pittaja)
   Symptoms: Burning sensation, yellow discharge, worse in heat, antibiotic cycle
   CRITICAL: Eucalyptus or camphor steam WORSENS this type. State this early.
   Insight for customer: Pitta aggravation. Standard steam makes this worse.
   Key probe: "Spicy food ya garmi mein worse hota hai?"

4. SPRAY DEPENDENCY PATTERN
   Symptoms: Cannot sleep without spray, frequency increasing, failed cold turkey attempts
   Insight for customer: Cold turkey never works for spray dependency. Physiological rebound is the reason. Graduated protocol only.
   Key probe: "Raat ko bina spray ke so pa rahe hain?"

5. DRAINAGE BLOCKAGE TYPE (Polyp)
   SAFETY RULE: Never claim to shrink polyps. Structural issues need ENT evaluation.
   Honest framing: "Structural issues ENT se confirm karwao. Hamaara protocol surrounding inflammation address karta hai, jo polyp ke saath hoti hai. Structural correction surgical hai."
   Always recommend ENT evaluation first.

6. STRUCTURAL CONGESTION TYPE (DNS)
   SAFETY RULE: DNS is anatomical. Protocol cannot straighten a septum.
   Honest framing: "DNS ka permanent solution surgical correction hai. Hamaara protocol surrounding inflammation aur congestion address karta hai. Bahut DNS patients 60 to 70 percent relief paate hain."
   Never claim to fix DNS anatomically.

CONVERSATION PHASES:
PROBE: Ask 1 to 2 smart questions to identify type.
MIRROR: Reflect symptoms accurately. Use insights, not sympathy. "Matlab aapki nasal lining..."
EDUCATE: Explain why current approach is not working. Be specific to their sinus type.
REFRAME: Show the gap between what they tried and what a type-specific protocol does.
CLOSE: This is handled by the structured flow automatically. If customer asks about the program or price, describe it hope-first then features.

CURRENT PHASE IS ${phase.toUpperCase()}. Stay in this phase unless user signals readiness to advance.

THE TWO PROGRAMS:

1. 7-Day Sinus Reset Rs. 499
   For: First-time, mild cases, seasonal issues, post-14-day maintenance
   Pitch as: "7-Day Sinus Reset. 7 din mein farak feel karein. Rs. 499."

2. 14-Day Sinus Restoration Rs. 1299
   For: All chronic cases, spray dependency, all 6 sinus types with 1+ year history
   Pitch as: "14 din mein sinus theek ho sakta hai. Rs. 1299. Rs. 92 roz."
   Program includes in this order: targeted herbs, breathing exercises, personal trigger identification, diet adjustments.

PITCH RULE:
Lead with hope, not features. State the outcome first.
"14 din mein sinus theek ho sakta hai. Rs. 1299."
Then features as proof.
Then one yes/no close: "Shuru karna chahein?"
NEVER send UPI IDs, payment links, or bank details in your message — payment is handled automatically by the system. When customer says yes to buy, just say "Perfect! Sending payment link now 🌿" and stop. Do NOT generate or include any UPI number, UPI ID, or payment details yourself.

OBJECTION RESPONSES:

"Mahanga hai" or "Expensive":
"Samajh aa raha hai. 7-Day Sinus Reset se shuru kar sakte hain. Rs. 499 mein 7 din ka structured protocol. Results feel karein. Phir decide karein."

"Pehle Ayurveda try kiya kuch nahi hua":
"Jo try kiya, kya woh specifically aapke sinus type ke liye tha? Generic Ayurveda aur type-specific protocol mein bahut farak hota hai. Yahi gap hai."

"Koi guarantee hai":
"Guarantee word use nahi karunga. Har body alag hoti hai. Jo honestly bol sakta hun: jo customers ne protocol exactly follow kiya unhe Day 5 to 7 mein meaningful change mila."

"Itna sab karna padega, time nahi":
"Subah 20 minute, raat 10 minute. Roz exactly batata hun kya karna hai. Sochna nahi padta, sirf karna padta hai."

"Doctor ne bola Ayurveda se nahi hoga":
"Doctor allopathic framework se dekh rahe hain. Classical Ayurveda ka classification alag hai. 14 din try karna medical treatment rok nahi raha."

"Pehle free try karwao":
Give one free type-specific tip. Then: "Yeh ek step hai. Full protocol mein 7 to 8 steps hain aur har step ek reason se wahan hai."

"10 saal ki problem 14 din mein kaise":
"Doctor dawai deta hai. Dawai inflammation ko dabati hai, khatam nahi karti. 10 saal mein problem complex nahi hui. Baar baar temporarily dabai gayi. Hum woh karte hain jo doctor nahi karta. Herbs, exercises, triggers, aur diet. Cause hata do, symptoms wapas nahi aate."

RED FLAGS. If user mentions blood in discharge, vision changes, 102 degrees+ fever with sinus, severe one-sided facial pain, eye swelling:
Immediately say: "Yeh symptoms serious hain. Aaj hi ENT ya doctor se milein. Yeh emergency signs hain jo pehle evaluate hone chahiye. Protocol baad mein start kar sakte hain."
Then stop the sales conversation.

IMPORTANT: You are a wellness consultant, not a replacement for medical care. Always recommend ENT for polyp, DNS, and red flag cases.`;
}

// ─── SALESOM AI CALL ──────────────────────────────────────────
async function callSalesom(userId, userMessage, platform) {
  const user = userData[userId];
  const history = (user.history || []).slice(-12);

  const messages = [
    ...history,
    { role: "user", content: userMessage },
  ];

  const response = await anthropic.messages.create({
    model:      "claude-sonnet-4-20250514",
    max_tokens: 800,
    system:     buildSystemPrompt(user),
    messages,
  });

  const reply = response.content?.[0]?.text || "";

  if (!user.history) user.history = [];
  user.history.push({ role: "user",      content: userMessage });
  user.history.push({ role: "assistant", content: reply });
  if (user.history.length > 24) user.history = user.history.slice(-24);

  return reply;
}

// ─── PHASE ADVANCEMENT ───────────────────────────────────────
function advancePhase(user, userMessage) {
  const phase = user.convPhase || "probe";
  const msg   = userMessage.toLowerCase();
  const buySignals = ["haan", "yes", "try", "interested", "batao", "link", "kaise", "kab", "start"];
  const hasBuySignal = buySignals.some((s) => msg.includes(s));
  const phaseMap = { probe: "mirror", mirror: "educate", educate: "reframe", reframe: "close", close: "close" };
  if (hasBuySignal && phase !== "close") user.convPhase = phaseMap[phase];
}

// ─── GHOSTING RECOVERY ───────────────────────────────────────
function getGhostMessage(user, attempt) {
  const type = user.sinusType;
  const name = user.name ? `${user.name} ji` : "ji";
  const isEng = user.lang === "eng";

  if (attempt === 1) {
    const hooks = {
      allergic:   isEng ? `${name} We spoke about your seasonal sneezing. One thing worth knowing: the timing of breathing exercises matters a lot in reactive sinus cases. Most people miss this. Whenever you have a moment.` : `${name} 🙏 Kal baat hui thi seasonal sneezing ke baare mein. Ek cheez batana tha. Reactive sinus mein breathing exercise ka timing bahut important hota hai. Zyaadatar log ye miss karte hain. Jab time ho.`,
      congestive: isEng ? `${name} We spoke about your blocked nose and smell. One thing: a specific cleansing step before steam makes a significant difference in congestion cases. Whenever you have a moment.` : `${name} 🙏 Kal naak band aur smell ke baare mein baat hui thi. Ek cheez. Congestive cases mein steam se pehle ek specific step hota hai. Woh akela bahut farak karta hai. Jab time ho.`,
      infective:  isEng ? `${name} We spoke about the burning sensation. Important: eucalyptus or camphor steam makes this type worse, not better. If you are using it, stop today. Sharing more when you are ready.` : `${name} 🙏 Kal naak mein jalan ke baare mein baat hui thi. Important. Eucalyptus ya camphor steam is type mein condition worse karta hai. Agar use kar rahe hain, aaj se band karein. Aur batana tha. Jab ready hon.`,
      spray:      isEng ? `${name} We spoke about spray dependency. Cold turkey never works because of physiological rebound. That is why attempts keep failing. Sharing more when you are ready.` : `${name} 🙏 Spray dependency ke baare mein baat hui thi. Cold turkey kabhi kaam nahi karta. Physiological rebound hoti hai. Isliye attempts fail hote hain. Aur batana tha. Jab ready hon.`,
      polyp:      isEng ? `${name} We spoke about your condition. Even with structural issues, reducing surrounding inflammation improves breathing quality significantly. Sharing more when you have time.` : `${name} 🙏 Aapki condition ke baare mein baat hui thi. Structural issue ke saath bhi surrounding inflammation reduce karna breathing quality significantly improve karta hai. Jab time ho.`,
      dns:        isEng ? `${name} We spoke about DNS. The surrounding inflammation and congestion that comes with DNS can be addressed. Breathing quality improves significantly even without surgery. More to share when you have time.` : `${name} 🙏 DNS ke baare mein baat hui thi. DNS ke saath jo surrounding inflammation aur congestion hoti hai, usse address kiya ja sakta hai. Surgery ke bina bhi breathing kaafi improve hoti hai. Jab time ho.`,
    };
    return hooks[type] || (isEng
      ? `${name} We spoke about your sinus. Had a specific insight for your case. Whenever you have a moment. 🙏`
      : `${name} 🙏 Kal sinus ke baare mein baat hui thi. Aapke case ke liye ek specific insight thi. Jab time ho.`);
  }

  if (attempt === 2) {
    return isEng
      ? `${name} Direct question: is the problem still there?\n\nIf yes, let us discuss the right option.\nIf it resolved on its own, please let me know.\n\nNo pressure either way. 🙏`
      : `${name} Seedha sawaal: kya woh problem abhi bhi chal rahi hai?\n\nAgar haan, sahi option discuss karte hain.\nAgar theek ho gaya, batayein.\n\nKoi pressure nahi. 🙏`;
  }

  return null;
}

// ─── DAY-WISE MILESTONE MESSAGES ─────────────────────────────
function getMilestoneMessage(user, day) {
  const type = user.sinusType;
  const name = user.name ? `${user.name} ji` : "ji";
  const isEng = user.lang === "eng";

  const milestones = {
    allergic: {
      5:  isEng ? `${name} Day 5 check-in. Sneezing triggers should feel a little less intense by now. Is dusty air or the morning episode milder than before?\n\nWhatever you feel, share it. I will adjust if needed.` : `${name} 🙏 Day 5 check-in. Sneezing triggers ka response thoda kam feel ho raha hoga. Dusty jagah ya subah ka episode pehle se mild hua?\n\nJo bhi feel ho, batayein. Zaroorat ho toh protocol adjust karunga.`,
      7:  isEng ? `${name} Day 7. Important observation today: has the intensity of triggers reduced? You should notice seasonal sensitivity improving by now.\n\nHow is the progress?` : `${name} 🙏 Day 7. Aaj ka ek important observation: triggers ki intensity kam hui hai? Season sensitivity mein fark aa raha hoga abhi tak.\n\nKaisi chal rahi hai progress?`,
      10: isEng ? `${name} Day 10 done. The allergic cycle starts breaking at this point.\n\nHow many times did you need antihistamine in the last 3 days?\n\nThe next 4 days are critical. Stay consistent.` : `${name} 🙏 Day 10 ho gaya. Allergic cycle break hona shuru hoti hai is point pe.\n\nLast 3 din mein antihistamine kitni baar leni padi?\n\nAgle 4 din critical hain. Consistency banaye rakhein.`,
      13: isEng ? `${name} Day 13. Almost there.\n\nThe improvement you have seen so far will hold through seasonal peaks with the 7-Day Sinus Reset. One reset per month stops triggers from rebuilding.\n\nInterested in continuing after Day 14?` : `${name} 🙏 Day 13. Almost complete.\n\nAb tak jo improvement aayi hai woh seasonal peak pe bhi hold karegi 7-Day Sinus Reset se. Mahine mein ek baar reset karo, triggers dobara build nahi hote.\n\nInterested hain Day 14 ke baad continue karne mein?`,
    },
    congestive: {
      5:  isEng ? `${name} Day 5. Most important check-in.\n\nHas any smell or taste returned, even slightly? Even 10 percent return means the protocol is working.\n\nShare whatever you notice. I am genuinely waiting for this feedback.` : `${name} 🙏 Day 5. Sabse important check-in.\n\nSmell ya taste mein koi bhi thoda sa sensation wapas aaya? Even 10 percent return matlab protocol kaam kar raha hai.\n\nBatayein. Main genuinely is feedback ka wait kar raha hun.`,
      7:  isEng ? `${name} Day 7 milestone. Smell and taste return usually happens in this window.\n\nHow is it feeling? And is dairy completely stopped? That single factor affects results the most.` : `${name} 🙏 Day 7 milestone. Smell taste return usually is window mein hoti hai.\n\nKaisa feel ho raha hai? Aur dairy completely band hai na? Woh single factor sabse zyada results affect karta hai.`,
      10: isEng ? `${name} Day 10. Congestion should be significantly reduced by now. How blocked is the nose this morning?\n\nIf improvement is happening, good. If not, be honest about dairy.` : `${name} 🙏 Day 10. Congestion significantly reduced honi chahiye. Subah naak kitni band hoti hai aaj?\n\nAgar improvement hai, achha. Agar kuch feel nahi, dairy ke baare mein honestly batayein.`,
      13: isEng ? `${name} Tomorrow is Day 14 of your Sinus Restoration. What a journey.\n\nTo maintain the smell and taste recovery, the 7-Day Sinus Reset once a month keeps Kapha from rebuilding.\n\nShall I send the link?` : `${name} 🙏 Kal 14-Day Sinus Restoration ka last day hai. Bahut achhi journey rahi.\n\nSmell taste jo restore hua, usse maintain karna ho toh 7-Day Sinus Reset mahine mein ek baar karo. Kapha dobara build nahi hota.\n\nLink bheju?`,
    },
    infective: {
      5:  isEng ? `${name} Day 5 check-in. Burning should be noticeably less by now.\n\nIs the discharge still yellow or is the color shifting toward clear?\nYellow to cloudy to clear means Pitta is normalizing.\n\nShare what you observe.` : `${name} 🙏 Day 5 check-in. Burning mein noticeable reduction aa rahi hogi.\n\nDischarge ka color, abhi bhi yellow hai ya thoda change aa raha hai?\nYellow se cloudy se clear matlab Pitta normalize ho rahi hai.\n\nBatayein.`,
      7:  isEng ? `${name} Day 7. Discharge should be predominantly clear by now.\n\nReminder: hot chai, spicy food, and prolonged time in heat rebuild Pitta. Any issues on that front?` : `${name} 🙏 Day 7. Discharge predominantly clear hona chahiye abhi tak.\n\nEk reminder: garm chai, spicy khana, garmi mein zyada time. Yeh sab Pitta rebuild karte hain. Kuch issues hain is front pe?`,
      10: isEng ? `${name} Day 10. Headache frequency should also be less by now. How is the overall progress?\n\nIf burning is still significant, let me adjust the protocol. Be honest.` : `${name} 🙏 Day 10. Headache frequency bhi kam hui hogi. Kaisi hai overall progress?\n\nAgar burning abhi bhi significant hai, ek adjustment karte hain protocol mein. Honestly batayein.`,
      13: isEng ? `${name} Tomorrow is the last day of your Sinus Restoration.\n\nPitta seasonal flare can return in summer without maintenance. One 7-Day Reset before the season starts and it does not come back.\n\nInterested?` : `${name} 🙏 Kal 14 din complete hone wale hain.\n\nPitta seasonal flare garmi mein wapas aa sakti hai bina maintenance ke. Season se pehle ek baar 7-Day Reset karo, flare aata hi nahi.\n\nInterested hain?`,
    },
    spray: {
      5:  isEng ? `${name} Day 5. First big milestone.\n\nDid you have even a 1 to 2 hour period where the nose stayed open without spray?\nEven a small spray-free window means your natural mechanism is returning.\n\nCelebrate this. It is genuinely significant.` : `${name} 🙏 Day 5. Pehla bada milestone.\n\nKya koi 1 se 2 ghante ka period aaya jab spray bina naak theek rahi?\nChhoti si bhi spray-free window matlab body ka natural mechanism wapas aa raha hai.\n\nCelebrate karein ye. Genuinely bada hai.`,
      7:  isEng ? `${name} Day 7. How many times is spray being used at night now?\n\nBhramari Pranayama for 10 minutes before sleeping is the most important step at this stage. Are you doing it?` : `${name} 🙏 Day 7. Raat mein spray use kitni baar ho rahi hai abhi?\n\nSone se pehle 10 min Bhramari Pranayama is phase mein sabse important step hai. Kar rahe hain?`,
      10: isEng ? `${name} Day 10. Key milestone. Daytime spray-free periods of 4 to 6 hours should be possible now.\n\nHow many spray-free hours today? Give me an honest number.` : `${name} 🙏 Day 10. Key milestone. Din mein 4 se 6 ghante spray-free rehna possible hona chahiye abhi.\n\nAaj kitne ghante spray-free rahe? Honest number batayein.`,
      13: isEng ? `${name} Almost there. Freedom from spray dependency, which felt impossible before.\n\nIf night spray is still present, the 7-Day Sinus Reset extends the rehabilitation. If you are already spray-free, one monthly Reset keeps that progress locked in.\n\nWhat would you prefer?` : `${name} 🙏 Almost there. Spray dependency se freedom, jo 2 saal pehle impossible laga tha.\n\nRaat ka spray abhi bhi hai toh 7-Day Sinus Reset se extended rehabilitation karte hain. Spray-free ho chuke hain toh monthly ek baar Reset, jo progress aayi hai woh hold karti hai.\n\nKya prefer karenge?`,
    },
    polyp: {
      5:  isEng ? `${name} Day 5. Inflammation reduction starts at this point.\n\nIs breathing feeling even slightly easier? Even partial relief means the Kapha congestion around the blockage is reducing.\n\nShare what you notice.` : `${name} 🙏 Day 5. Inflammation reduction shuru hoti hai is point pe.\n\nBreathing thodi bhi easy feel ho rahi hai? Even partial relief matlab polyp ke around jo congestion thi woh kam ho rahi hai.\n\nBatayein.`,
      7:  isEng ? `${name} Day 7 check-in. Have you scheduled an ENT appointment?\n\nRunning the protocol alongside ENT evaluation gives the best outcome for your case. Both together.` : `${name} 🙏 Day 7 check-in. ENT appointment schedule kiya?\n\nProtocol ke saath parallel ENT evaluation aapke case mein best outcome deta hai. Dono saath.`,
      10: isEng ? `${name} Day 10. How is the breathing quality now?\n\nEven with structural issues, addressing surrounding inflammation improves breathing significantly. Share how it has been so far.` : `${name} 🙏 Day 10. Kaisi hai breathing quality abhi?\n\nStructural issue ke saath bhi surrounding inflammation address hona breathing ko significantly improve karta hai. Abhi tak ka progress batayein.`,
      13: isEng ? `${name} 14 days are almost done.\n\nFor polyp cases, inflammation rebuilds without maintenance. One 7-Day Reset per month keeps it from coming back.\n\nShall I send details?` : `${name} 🙏 14 din almost complete hone wale hain.\n\nPolyp cases mein inflammation wapas build hoti hai bina maintenance ke. Mahine mein ek 7-Day Reset, inflammation ka wapas aana rok sakte hain.\n\nDetails bheju?`,
    },
    dns: {
      5:  isEng ? `${name} Day 5. Is there any change in the quality of congestion?\n\nEven with DNS, addressing surrounding congestion improves breathing noticeably. Anything to report?` : `${name} 🙏 Day 5. Congestion quality mein koi change feel ho raha hai?\n\nDNS ke saath bhi surrounding Kapha congestion reduce hona breathing significantly improve karta hai. Kuch feel hua?`,
      7:  isEng ? `${name} Day 7. Has nighttime blockage reduced at all?\n\nSleeping on the less-affected side is also important for DNS cases. Are you doing that?` : `${name} 🙏 Day 7. Raat mein naak band hona kam hua hai?\n\nSone ki position, affected side upar rakhna, DNS mein important hai. Kar rahe hain?`,
      10: isEng ? `${name} Day 10 milestone. On a scale of 1 to 10, how is breathing quality now versus Day 1?\n\nEven with DNS, 60 to 70 percent improvement is achievable with a consistent protocol.` : `${name} 🙏 Day 10 milestone. Overall breathing quality 1 se 10 mein kitni feel hoti hai ab versus Day 1?\n\nDNS cases mein bhi 60 se 70 percent improvement possible hai consistent protocol se.`,
      13: isEng ? `${name} Tomorrow is the last day.\n\nWith DNS, seasonal congestion can return. One 7-Day Reset at each season change keeps breathing quality maintained year-round.\n\nInterested?` : `${name} 🙏 Kal last day hai.\n\nDNS ke saath seasonal congestion wapas aa sakti hai. Season change pe ek baar 7-Day Reset karo, saal bhar breathing quality maintain rehti hai.\n\nInterested hain?`,
    },
  };

  const typeMilestones = milestones[type] || milestones.congestive;
  return typeMilestones[day] || null;
}

// ─── SCHEDULED JOBS ───────────────────────────────────────────
setInterval(async () => {
  const now = Date.now();
  for (const [userId, user] of Object.entries(userData)) {
    if (!user.platform) continue;

    // Ghosting recovery
    if (
      user.state &&
      !["done", "post_payment", "human"].includes(user.state) &&
      user.lastMessageAt
    ) {
      const hoursSince = (now - user.lastMessageAt) / (1000 * 60 * 60);
      if (hoursSince >= 24 && hoursSince < 25 && (user.ghostAttempts || 0) === 0) {
        const msg = getGhostMessage(user, 1);
        if (msg) {
          await sendMessage(user.platform, userId, msg);
          user.ghostAttempts  = 1;
          user.lastMessageAt  = now;
          // ghost_1 — no sheet log (would create blank row)
        }
      } else if (hoursSince >= 72 && hoursSince < 73 && (user.ghostAttempts || 0) === 1) {
        const msg = getGhostMessage(user, 2);
        if (msg) {
          await sendMessage(user.platform, userId, msg);
          user.ghostAttempts  = 2;
          user.lastMessageAt  = now;
          // ghost_2 — no sheet log (would create blank row)
        }
      }
    }

    // Day-wise milestone check-ins
    if (user.enrolledAt && user.sinusType && user.state === "post_payment") {
      const daysSinceEnroll = Math.floor((now - user.enrolledAt) / (1000 * 60 * 60 * 24));
      const milestoneDay = [5, 7, 10, 13].find(
        (d) => daysSinceEnroll === d && !(user.milestonesSent || []).includes(d)
      );
      if (milestoneDay) {
        const msg = getMilestoneMessage(user, milestoneDay);
        if (msg) {
          await sendMessage(user.platform, userId, msg);
          if (!user.milestonesSent) user.milestonesSent = [];
          user.milestonesSent.push(milestoneDay);
          await logToSheet(userId, user.platform, user.sinusType, `day_${milestoneDay}_checkin`, "", msg);
        }
      }
    }
  }
}, 30 * 60 * 1000);

setInterval(() => processedMessages.clear(), 10 * 60 * 1000);

// ─── MAIN MESSAGE HANDLER ─────────────────────────────────────
async function handleMessage(senderId, messageText, platform) {
  if (!messageText || !messageText.trim()) return;
  const text = messageText.trim();

  // Load user from Firestore if not in memory cache
  await loadUserFromFirestore(senderId);

  // Init user
  if (!userData[senderId]) {
    userData[senderId] = {
      lang: null, sinusType: null, convPhase: "probe",
      state: "new", history: [], duration: null,
      durationIndex: null, symptomNums: [], symptoms: null,
      usedAllopathy: null, selectedPlan: null, enrolledAt: null,
      lastMessageAt: Date.now(), ghostAttempts: 0,
      milestonesSent: [], name: null, platform,
      durationMenuSent: false, symptomMenuSent: false,
      insightShown: false, sinusTypeRevealed: false,
      awaitingCommitment: false,
    };
  }

  const user           = userData[senderId];
  user.lastMessageAt   = Date.now();
  user.ghostAttempts   = 0;
  user.platform        = platform;

  // Detect language — always re-check + honour explicit English/Hindi requests
  const _engReq = /\b(english|in english|speak english|reply english|english mein|only english)\b/i.test(text);
  const _hinReq = /\b(hindi|hinglish|hindi mein|hindi me|in hindi|hindi bolo|hindi main)\b/i.test(text);
  if (_engReq) user.lang = 'eng';
  else if (_hinReq) user.lang = 'hin';
  else user.lang = detectLang(text) || user.lang || 'hin';

  // ── LANGUAGE SWITCH INTERCEPTION (only mid-conversation, not during assessment) ──
  const inAssessment = ["asked_duration", "asked_symptoms"].includes(user.state);
  if ((_engReq || _hinReq) && text.trim().split(/\s+/).length <= 6 && !inAssessment) {
    const ack = user.lang === 'eng'
      ? "Sure! I'll reply in English now. Please continue."
      : 'Bilkul! Ab Hindi mein baat karte hain. Bataiye kya takleef hai?';
    await sendWithTyping(platform, senderId, ack);
    userData[senderId] = user;
    return;
  }

  // ── RED FLAG — highest priority ──────────────────────────
  if (hasRedFlag(text)) {
    const redFlagMsg = user.lang === "eng"
      ? "These symptoms need immediate medical attention. Please see an ENT specialist or doctor today. Blood in discharge, vision changes, or high fever with sinus pain are serious signs that must be evaluated first. Please do not delay."
      : "Yeh symptoms serious hain 🙏\n\nAaj hi ENT ya doctor se milein. Naak mein khoon, aankhon mein dikkat, ya tej bukhar ke saath sinus dard emergency signs hain jo pehle evaluate hone chahiye.\n\nProtocol baad mein start kar sakte hain.";
    await sendWithTyping(platform, senderId, redFlagMsg, 600);
    user.state = "human";
    await logToSheet(senderId, platform, user.sinusType, "red_flag", text, redFlagMsg);
    return;
  }

  // ── POST-PAYMENT ─────────────────────────────────────────
  if (user.state === "post_payment") {
    const reply = await callSalesom(senderId, text, platform);
    await sendWithTyping(platform, senderId, reply);
    await logToSheet(senderId, platform, user.sinusType, "post_payment", text, reply);
    return;
  }

  // ── PAYMENT CONFIRMATION ──────────────────────────────────
  if (isPaymentConfirmation(text) && user.state === "awaiting_payment") {
    user.state      = "post_payment";
    user.enrolledAt = Date.now();
    user.milestonesSent = [];
    const planName  = user.selectedPlan === "reset" ? "7-Day Sinus Reset" : "14-Day Sinus Restoration";
    const confirmMsg = user.lang === "eng"
      ? `Thank you so much 🙏 Payment confirmed.\n\nYour ${planName} starts today. I will send your morning guidance shortly. We work together here on WhatsApp every day. 🌿\n\nAny questions, message here.`
      : `Bahut shukriya 🙏 Payment confirm ho gayi.\n\nAapka ${planName} aaj se shuru ho raha hai. Subah ki guidance aaj bhejta hun. Roz WhatsApp pe saath rahenge. 🌿\n\nKoi bhi sawaal, yahaan message karein.`;
    await sendWithTyping(platform, senderId, confirmMsg);
    await logToSheet(senderId, platform, user.sinusType, "payment_confirmed", text, "payment confirmed");
    return;
  }

  // ── WELCOME — skip language menu, auto-detect from reply ──
  if (user.state === "new") {
    user.state = "asked_duration";
    user.durationMenuSent = true;
    const welcomeMsg =
      "Namaste 🙏 Ayusomam Herbals mein swagat hai.\nSinus ki takleef mein specialized Ayurvedic guidance dete hain.\n\nAap jis bhasha mein comfortable hain, usi mein reply karein.\n\nYe problem kitne time se hai?\n\n1. Abhi abhi shuru hua (1 se 3 mahine)\n2. Thodi purani hai (3 se 6 mahine)\n3. 1 se 2 saal se\n4. 3 se 5 saal se\n5. 5 saal se zyada\n\nBas number reply karein 👇";
    await sendWithTyping(platform, senderId, welcomeMsg, 800);
    await logToSheet(senderId, platform, null, "welcome_sent", text, "welcome + duration menu");
    return;
  }

  // ── DURATION REPLY ────────────────────────────────────────
  if (user.state === "asked_duration" || (user.durationMenuSent && !user.durationIndex)) {
    const dNums = parseNumberList(text);
    if (dNums.length > 0 && dNums[0] >= 1 && dNums[0] <= 5) {
      const idx = dNums[0] - 1;
      user.durationIndex = idx;
      user.duration      = DURATION_OPTIONS[idx];
      user.state         = "asked_symptoms";

      // For 3+ year cases, state the medicine cycle assumption
      const cycleMsg = buildMedicineCycleMsg(idx, user.lang);
      if (cycleMsg) {
        await sendWithTyping(platform, senderId, cycleMsg, 800);
        await sleep(1000);
      }

      // Send symptom menu
      await sendWithTyping(platform, senderId, buildSymptomMenu(user.lang), 800);
      user.symptomMenuSent = true;
      await logToSheet(senderId, platform, null, "asked_symptoms", text, "duration captured");
      return;
    }

    // If they typed duration in text form instead of number
    const extracted = extractDuration(text);
    if (extracted) {
      user.duration  = extracted;
      user.state     = "asked_symptoms";
      await sendWithTyping(platform, senderId, buildSymptomMenu(user.lang), 800);
      user.symptomMenuSent = true;
      return;
    }

    // Re-prompt duration menu if unclear
    await sendWithTyping(platform, senderId, buildDurationMenu(user.lang), 600);
    return;
  }

  // ── SYMPTOM REPLY ─────────────────────────────────────────
  if (user.state === "asked_symptoms" || (user.symptomMenuSent && !user.insightShown)) {
    const sNums = parseNumberList(text);

    // Check for text-based type mentions even if no numbers
    if (sNums.length === 0) {
      const detected = detectSinusTypeFromText(text);
      if (detected) {
        user.sinusType = detected;
      }
      // Still needs symptoms, ask again or proceed to AI
      if (!user.sinusType) {
        await sendWithTyping(platform, senderId, buildSymptomMenu(user.lang), 600);
        return;
      }
    } else {
      user.symptomNums = sNums;
      user.symptoms    = sNums.map((n) => SYMPTOM_OPTIONS[n - 1]).join(", ");

      // Also check for spray/polyp/dns keywords in symptom text
      const detected = detectSinusTypeFromText(text);
      user.sinusType  = detected || getSinusTypeFromSymptoms(sNums);
    }

    // Detect medicine usage
    user.usedAllopathy = (user.durationIndex || 0) >= 2 ? true : null;

    user.insightShown      = true;
    user.sinusTypeRevealed = true;
    user.convPhase         = "reframe";
    user.state             = "pitched";

    // Build and send insights one at a time for wow factor
    const insights = buildSymptomInsights(user.symptomNums || [], user.lang);
    for (const insight of insights) {
      await sendWithTyping(platform, senderId, insight, 1000);
    }

    await sleep(1200);

    // Reveal sinus type
    const typeReveal = buildTypeReveal(user.sinusType, user.lang);
    await sendWithTyping(platform, senderId, typeReveal, 800);
    await sleep(1000);

    // Hope-led pitch
    const pitch = buildPitch(user);
    await sendWithTyping(platform, senderId, pitch, 1000);

    user.awaitingCommitment = true;
    await logToSheet(senderId, platform, user.sinusType, "pitched", text, typeReveal + " | " + pitch);
    return;
  }

  // ── COMMITMENT STEP ───────────────────────────────────────
  if (user.awaitingCommitment && user.state === "pitched") {
    if (isCommitmentYes(text)) {
      user.awaitingCommitment = false;
      user.state              = "awaiting_payment";
      const plan      = user.selectedPlan || "restoration";
      const planPrice = PRICES[plan].price;
      const rzpLink   = plan === "clearing" ? RAZORPAY_LINK_499 : RAZORPAY_LINK_1299;

      let paymentMsg;
      if (rzpLink) {
        // Razorpay link available — send it directly
        paymentMsg = user.lang === "eng"
          ? `Here is your secure payment link:\n${rzpLink}\n\nAmount: Rs. ${planPrice}. Once paid, send the confirmation here and your program starts the same day.`
          : `Yeh raha aapka secure payment link:\n${rzpLink}\n\nAmount: Rs. ${planPrice}. Payment hone ke baad confirmation yahaan bhej dein. Program usi din shuru hoga.`;
      } else {
        // No Razorpay — notify and send manually
        paymentMsg = user.lang === "eng"
          ? `Great! I will share the payment details with you shortly. Amount: Rs. ${planPrice}.\n\nOnce done, send a screenshot here and your program starts the same day.`
          : `Bahut badhiya. Payment details abhi share karta hun. Amount: Rs. ${planPrice}.\n\nScreenshot yahaan bhej dein, program usi din shuru hoga.`;
      }
      await sendWithTyping(platform, senderId, paymentMsg, 800);
      await logToSheet(senderId, platform, user.sinusType, "awaiting_payment", text, paymentMsg);
      return;
    }

    // Not a yes. Let AI handle the objection.
    advancePhase(user, text);
    const reply = await callSalesom(senderId, text, platform);
    await sendWithTyping(platform, senderId, reply);
    await logToSheet(senderId, platform, user.sinusType, "objection_handling", text, reply);
    return;
  }

  // ── EXTRACT NAME IF NOT CAPTURED ──────────────────────────
  if (!user.name) {
    const n = extractNameFromText(text);
    if (n) user.name = n;
  }

  // ── DEFAULT: SALESOM AI HANDLES EVERYTHING ELSE ───────────
  // This covers: off-script questions, mid-program questions,
  // re-engagement, any state not caught above
  advancePhase(user, text);

  // Early sinus type detection from free text
  if (!user.sinusType) {
    const detected = detectSinusTypeFromText(text);
    if (detected) {
      user.sinusType = detected;
      user.convPhase = "mirror";
    }
  }

  let reply;
  try {
    reply = await callSalesom(senderId, text, platform);
  } catch (err) {
    console.error("SALESOM AI error:", err.message);
    reply = user.lang === "eng"
      ? "So sorry, a brief technical issue. Please send your message again. 🙏"
      : "Maafi chahta hun. Thodi technical dikkat aa gayi. Please ek baar wapas message karein. 🙏";
  }

  await sendWithTyping(platform, senderId, reply);

  // Detect if AI moved to pitch state
  if (reply.includes("499") || reply.includes("1,299") || reply.includes("Shuru karna")) {
    user.state = "pitched";
    if (user.convPhase !== "close") user.convPhase = "close";
  }

  await logToSheet(senderId, platform, user.sinusType, user.state, text, reply);
  persistUserToFirestore(senderId);   // fire-and-forget
}

// ─── FACEBOOK WEBHOOK ─────────────────────────────────────────
app.get("/webhook", (req, res) => {
  if (
    req.query["hub.mode"]          === "subscribe" &&
    req.query["hub.verify_token"]  === VERIFY_TOKEN
  ) {
    res.status(200).send(req.query["hub.challenge"]);
  } else {
    res.sendStatus(403);
  }
});

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    const body = req.body;
    console.log("[WEBHOOK] object:", body.object, "entries:", (body.entry || []).length);

    //    Instagram DMs                                           
    if (body.object === "instagram") {
      for (const entry of body.entry || []) {
        for (const event of (entry.messaging || [])) {
          if (!event.message || event.message.is_echo) continue;
          const msgId = event.message.mid;
          if (processedMessages.has(msgId)) continue;
          processedMessages.add(msgId);
          console.log("[IG] DM from", event.sender.id, ":", event.message.text);
          await handleMessage(event.sender.id, event.message.text || "", "instagram");
        }
      }
      return;
    }

    //    Facebook Messenger                                      
    if (body.object !== "page") return;
    for (const entry of body.entry || []) {
      for (const event of entry.messaging || []) {
        if (!event.message || event.message.is_echo) continue;
        const msgId = event.message.mid;
        if (processedMessages.has(msgId)) continue;
        processedMessages.add(msgId);
        await handleMessage(event.sender.id, event.message.text || "", "facebook");
      }
    }
  } catch (e) {
    console.error("Webhook error:", e.message);
  }
});

// ─── TWILIO WHATSAPP WEBHOOK ──────────────────────────────────
app.post(["/twilio-webhook", "/twilio"], async (req, res) => {
  res.status(200).end(); // empty body — prevents Twilio from sending "OK" as WhatsApp msg
  try {
    const from  = (req.body.From || "").replace("whatsapp:", "");
    const body  = req.body.Body || "";
    const msgId = req.body.MessageSid;
    if (!from || !body) return;
    if (processedMessages.has(msgId)) return;
    processedMessages.add(msgId);
    await handleMessage(from, body, "twilio");
  } catch (e) {
    console.error("Twilio webhook error:", e.message);
  }
});

// ─── INSTAGRAM WEBHOOK ────────────────────────────────────────
app.get("/instagram-webhook", (req, res) => {
  if (
    req.query["hub.mode"]          === "subscribe" &&
    req.query["hub.verify_token"]  === VERIFY_TOKEN
  ) {
    res.status(200).send(req.query["hub.challenge"]);
  } else {
    res.sendStatus(403);
  }
});

app.post("/instagram-webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    const body = req.body;
    if (body.object !== "instagram") return;
    for (const entry of body.entry || []) {
      for (const event of (entry.messaging || [])) {
        if (!event.message || event.message.is_echo) continue;
        const msgId = event.message.mid;
        if (processedMessages.has(msgId)) continue;
        processedMessages.add(msgId);
        await handleMessage(event.sender.id, event.message.text || "", "instagram");
      }
    }
  } catch (e) {
    console.error("Instagram webhook error:", e.message);
  }
});

// ─── BROADCAST ────────────────────────────────────────────────
// ── WHATSAPP CLOUD API WEBHOOK ─────────────────────────────────────────
app.get("/whatsapp-webhook", (req, res) => {
  const mode      = req.query["hub.mode"];
  const token     = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === (process.env.WA_VERIFY_TOKEN || "ayusomam_wa_verify")) {
    console.log("WhatsApp webhook verified");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post("/whatsapp-webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    const body = req.body;
    if (body.object !== "whatsapp_business_account") return;
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value;
        if (!value || !value.messages) continue;
        for (const msg of value.messages) {
          if (msg.type !== "text") continue;
          const userId = msg.from;
          const text   = msg.text.body;
          console.log("[WA] Message from " + userId + ": " + text);
          await handleMessage(userId, text, "whatsapp");
        }
      }
    }
  } catch (err) {
    console.error("WhatsApp webhook error:", err);
  }
});

app.post("/broadcast", async (req, res) => {
  const { numbers, message, secret } = req.body;
  if (secret !== VERIFY_TOKEN) return res.status(401).json({ error: "Unauthorized" });
  if (!Array.isArray(numbers) || !message) return res.status(400).json({ error: "Invalid payload" });
  let sent = 0;
  const errors = [];
  for (const num of numbers) {
    try {
      await sendTwilioMessage(num, message);
      sent++;
      await sleep(500);
    } catch (e) {
      errors.push({ num, error: e.message });
    }
  }
  res.json({ sent, errors });
});

// ─── SEASONAL BROADCAST TEMPLATES ────────────────────────────
app.get("/seasonal-template/:season", (req, res) => {
  const templates = {
    "pre-winter": {
      season: "Pre-Winter (Nov)",
      target: "Congestive + Spray users",
      message: "Ji 🙏 December mein Kapha peak hoti hai. Congestive sinus is time mein sabse zyada flare hoti hai. Abhi se shuru karna zyada effective hai. 14-Day Sinus Restoration Rs. 1299 ready hai. Reply karein. Sachin, Ayusomam Herbals 🌿",
    },
    "pre-summer": {
      season: "Pre-Summer (Apr)",
      target: "Deep Inflammation users",
      message: "Ji 🙏 Garmi aa rahi hai. Deep Inflammation pattern ke liye yeh critical time hai. Proactive protocol is season mein sabse effective hota hai. 14-Day Sinus Restoration ready hai. Reply karein. 🌿",
    },
    "vasant": {
      season: "Vasant (Feb-Mar)",
      target: "Reactive Sensitivity users",
      message: "Ji 🙏 Vasant season mein Reactive Sensitivity sinus sabse zyada flare hoti hai. Pollen season se pehle protocol start karna sabse effective hai. 14-Day Sinus Restoration Rs. 1299 ready hai. Details chahiye? Reply karein. 🌿",
    },
    "monsoon": {
      season: "Monsoon (Jul-Sep)",
      target: "All types",
      message: "Ji 🙏 Monsoon mein sinus peak pe hoti hai. 7-Day Sinus Reset Rs. 499 ya 14-Day Sinus Restoration Rs. 1299. Dono available hain. Reply karein. 🌿",
    },
    "past-customer": {
      season: "Past Customer Re-engagement",
      target: "Completed 14-day program",
      message: "Ji 🙏 14-Day Sinus Restoration complete ki thi. Follow up karne ka mann tha. Naak kaisi hai ab? Agar seasonal flare wapas aa rahi ho, 7-Day Sinus Reset Rs. 499 se maintain kar sakte hain. Reply karein. 🌿",
    },
  };
  const t = templates[req.params.season];
  if (!t) return res.status(404).json({ error: "Template not found", available: Object.keys(templates) });
  res.json(t);
});

// ─── STATS / ADMIN ────────────────────────────────────────────
app.get("/stats", (req, res) => {
  if (req.query.secret !== VERIFY_TOKEN) return res.status(401).json({ error: "Unauthorized" });
  const all = Object.values(userData);
  const stats = {
    totalUsers: all.length,
    byType: {}, byState: {}, byPhase: {},
    enrolled:   all.filter((u) => u.enrolledAt).length,
    ghosted:    all.filter((u) => u.ghostAttempts > 0).length,
    converted:  all.filter((u) => u.state === "post_payment" || u.state === "done").length,
  };
  for (const u of all) {
    const t = u.sinusType  || "unknown";
    const s = u.state      || "new";
    const p = u.convPhase  || "probe";
    stats.byType[t]  = (stats.byType[t]  || 0) + 1;
    stats.byState[s] = (stats.byState[s] || 0) + 1;
    stats.byPhase[p] = (stats.byPhase[p] || 0) + 1;
  }
  stats.conversionRate = stats.totalUsers
    ? ((stats.converted / stats.totalUsers) * 100).toFixed(1) + "%"
    : "0%";
  res.json(stats);
});

// ─── ADMIN API: DATA ──────────────────────────────────────────
app.get("/admin/data", async (req, res) => {
  if (req.query.secret !== VERIFY_TOKEN) return res.status(401).json({ error: "Unauthorized" });
  const all = Object.entries(userData).map(([id, u]) => ({
    id,
    platform:          u.platform || "unknown",
    state:             u.state    || "new",
    sinusType:         u.sinusType || null,
    lang:              u.lang     || null,
    duration:          u.duration || null,
    selectedPlan:      u.selectedPlan || null,
    lastMessageAt:     u.lastMessageAt || null,
    ghostAttempts:     u.ghostAttempts || 0,
    enrolledAt:        u.enrolledAt || null,
    history:           (u.history || []).slice(-40), // last 40 messages
  }));
  // ─── SHEETS HISTORICAL DATA ─────────────────────────────────
  if (SHEET_URL) {
    try {
      const _sr = await fetch(SHEET_URL, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({action:'conversations'})});
      const _sl = await _sr.json();
      const _rows = Array.isArray(_sl) ? _sl : [];
      console.log('[ADMIN] Sheets rows:', _rows.length);
      const _cm = {};
      for (const _row of _rows) {
        const _sid = String(_row.SenderID || _row.senderId || _row.id || '').trim();
        if (!_sid) continue;
        if (!_cm[_sid]) {const _p=String(_row.Platform||_row.platform||'').toLowerCase();const _plt=_p.includes('messenger')||_p.includes('facebook')||_p.includes('fb')?'messenger':_p.includes('instagram')?'instagram':'whatsapp';_cm[_sid]={msgs:[],lastTs:0,platform:_plt};}
        const _ts = _row.Timestamp ? new Date(_row.Timestamp).getTime() : 0;
        const _role = String(_row.Role || _row.role || 'user').toLowerCase();
        const _content = String(_row.Message || _row.message || _row.content || '');
        _cm[_sid].msgs.push({ts:_ts, role:_role, content:_content});
        if (_ts > _cm[_sid].lastTs) _cm[_sid].lastTs = _ts;
      }
      for (const [_sid, _conv] of Object.entries(_cm)) {
        _conv.msgs.sort((a,b)=>a.ts-b.ts);
        const _hist = _conv.msgs.map(m=>({role:m.role, content:m.content}));
        if (userData[_sid]) {
          const _ex = new Set((userData[_sid].history||[]).map(m=>m.content));
          userData[_sid].history = [..._hist.filter(m=>!_ex.has(m.content)), ...(userData[_sid].history||[])];
          if (!userData[_sid].lastMessageAt) userData[_sid].lastMessageAt = _conv.lastTs||null;
        } else {
          userData[_sid] = {lang:null,sinusType:null,state:'unknown',platform:_conv.platform||'whatsapp',duration:null,selectedPlan:null,lastMessageAt:_conv.lastTs||null,ghostAttempts:0,enrolledAt:null,history:_hist.slice(-60),source:'sheets'};
        }
      }
      console.log('[ADMIN] Merged convs:', Object.keys(_cm).length);
    } catch(e){console.warn('[ADMIN] Sheets err:',e.message);}
  }

  all.sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));

  const stats = {
    total:       all.length,
    converted:   all.filter((u) => u.state === "post_payment" || u.state === "done").length,
    pitched:     all.filter((u) => ["pitched","awaiting_payment","awaiting_commitment"].includes(u.state)).length,
    active:      all.filter((u) => !["new","done","post_payment"].includes(u.state)).length,
    ghosted:     all.filter((u) => u.ghostAttempts > 0).length,
  };
  stats.conversionRate = stats.total ? ((stats.converted / stats.total) * 100).toFixed(1) : "0";
  res.json({ stats, leads: all });
});

// ─── ADMIN API: REPLY ─────────────────────────────────────────
app.post("/admin/reply", async (req, res) => {
  if (req.body.secret !== VERIFY_TOKEN) return res.status(401).json({ error: "Unauthorized" });
  const { userId, platform, message } = req.body;
  if (!userId || !platform || !message) return res.status(400).json({ error: "Missing fields" });
  try {
    await sendMessage(platform, userId, message);
    // Inject into history so it appears in the thread
    if (userData[userId]) {
      userData[userId].history = userData[userId].history || [];
      userData[userId].history.push({ role: "assistant", content: message });
    }
    await logToSheet(userId, platform, userData[userId]?.sinusType || null, "admin_reply", "", message);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── ADMIN DASHBOARD SPA ──────────────────────────────────────
// ─── FOLLOW-UP SCHEDULER ─────────────────────────────────────────────────────
let globalFollowupEnabled = true;
const FU_SCHED = {interested:[1,3,7],pitched:[1,3],ghosted:[14],unknown:[2,5]};
const FU_MSGS = {
  interested:[
    "Hello! 🙏 Just checking in — have you had a chance to think about our sinus treatment program? Many patients see relief in the first week itself. Happy to answer any questions 😊",
    "Hi! One of our patients with similar symptoms recovered completely in 3 weeks with our herbal program. Would you like to know how it could help you too? 🌿",
    "This is our last follow-up. If you'd ever like to explore our sinus treatment, we're always here. Wishing you good health! 🙏 — Ayusomam Herbals"
  ],
  pitched:[
    "Hello! 🙏 Just checking — did you have any questions about the treatment program we discussed? We're here to help you decide with confidence.",
    "Hi! We still have a spot in our current batch. The program has helped 200+ patients with chronic sinus. Would you like to proceed? We can also discuss flexible options 🌿"
  ],
  ghosted:[
    "Hello! 🙏 Hope you're doing well. If your sinus issues are still bothering you, our herbal treatment might be exactly what you need. Many patients who tried everything else found relief with us. Would love to help 😊"
  ],
  unknown:[
    "Hello! 🙏 Following up on your inquiry about our sinus treatment. Are you still interested? We're here to help!",
    "Hi! A gentle check-in from Ayusomam Herbals. If you have questions about our sinus program, feel free to ask anytime 🌿"
  ]
};
function getFUMsg(state,n){const t=FU_MSGS[state]||FU_MSGS.unknown;return t[n]||t[t.length-1];}
function shouldFU(lead){
  if(!globalFollowupEnabled||lead.autoFollowup===false)return false;
  if(lead.state==='converted'||lead.state==='post_payment'||lead.enrolledAt)return false;
  const s=FU_SCHED[lead.state]||FU_SCHED.unknown;const n=lead.followupCount||0;
  if(n>=s.length)return false;
  const last=lead.lastFollowupAt||lead.lastMessageAt;if(!last)return false;
  return(Date.now()-new Date(last).getTime())/86400000>=s[n];
}
async function runFUScheduler(){
  if(!globalFollowupEnabled)return;
  console.log('[FU] Scheduler running...');let sent=0;
  for(const[uid,lead]of Object.entries(userData)){
    if(!shouldFU(lead))continue;
    try{
      const msg=getFUMsg(lead.state,lead.followupCount||0);
      await sendMessage(lead.platform||'messenger',uid,msg);
      lead.followupCount=(lead.followupCount||0)+1;lead.lastFollowupAt=Date.now();
      (lead.history=lead.history||[]).push({role:'assistant',content:'[Auto FU] '+msg});
      sent++;await new Promise(r=>setTimeout(r,1200));
    }catch(e){console.warn('[FU] Failed:',uid,e.message);}
  }
  console.log('[FU] Done, sent:',sent);
}
setInterval(runFUScheduler,6*60*60*1000);
console.log('[FU] Scheduler ready, runs every 6h');
app.post('/admin/toggle-global',(req,res)=>{
  if(req.body.secret!==VERIFY_TOKEN)return res.status(403).json({error:'forbidden'});
  globalFollowupEnabled=!!req.body.enabled;res.json({ok:true,globalFollowupEnabled});
});
app.post('/admin/toggle-followup',(req,res)=>{
  if(req.body.secret!==VERIFY_TOKEN)return res.status(403).json({error:'forbidden'});
  const{userId,enabled}=req.body;
  if(!userId||!userData[userId])return res.status(404).json({error:'not found'});
  userData[userId].autoFollowup=!!enabled;res.json({ok:true,autoFollowup:userData[userId].autoFollowup});
});
app.post('/admin/send-followup',async(req,res)=>{
  if(req.body.secret!==VERIFY_TOKEN)return res.status(403).json({error:'forbidden'});
  const{userId}=req.body;if(!userId||!userData[userId])return res.status(404).json({error:'not found'});
  const lead=userData[userId];
  try{
    const msg=getFUMsg(lead.state,lead.followupCount||0);
    await sendMessage(lead.platform||'messenger',userId,msg);
    lead.followupCount=(lead.followupCount||0)+1;lead.lastFollowupAt=Date.now();
    (lead.history=lead.history||[]).push({role:'assistant',content:'[Manual FU] '+msg});
    res.json({ok:true,message:msg,followupCount:lead.followupCount});
  }catch(e){res.status(500).json({error:e.message});}
});
app.get('/admin/followup-status',(req,res)=>{
  if(req.query.secret!==VERIFY_TOKEN)return res.status(403).json({error:'forbidden'});
  const out={};
  for(const[uid,lead]of Object.entries(userData)){
    const s=FU_SCHED[lead.state]||FU_SCHED.unknown;const n=lead.followupCount||0;
    const last=lead.lastFollowupAt||lead.lastMessageAt;let nextIn=null;
    if(n<s.length&&last){const d=(Date.now()-new Date(last).getTime())/86400000;nextIn=Math.max(0,Math.ceil(s[n]-d));}
    out[uid]={autoFollowup:lead.autoFollowup!==false,followupCount:n,nextInDays:nextIn};
  }
  res.json({globalFollowupEnabled,statuses:out});
});
app.get("/admin", (req, res) => {
  if (req.query.secret !== VERIFY_TOKEN) {
    return res.send(`<!DOCTYPE html><html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f5f5f5">
      <form method="GET" action="/admin" style="background:#fff;padding:32px;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.1);text-align:center">
        <div style="font-size:32px;margin-bottom:8px">🌿</div>
        <h2 style="margin:0 0 20px;color:#1a1a1a">Ayusomam Admin</h2>
        <input name="secret" type="password" placeholder="Enter secret token" style="padding:10px 16px;border:1px solid #ddd;border-radius:8px;font-size:15px;width:220px"/>
        <br/><br/>
        <button type="submit" style="background:#2e7d32;color:#fff;border:none;padding:10px 28px;border-radius:8px;font-size:15px;cursor:pointer">Login</button>
      </form></body></html>`);
  }

  const secret = req.query.secret;
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Ayusomam Admin</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f2f5;color:#1a1a1a;height:100vh;display:flex;flex-direction:column;overflow:hidden}
    .topbar{background:#2e7d32;color:#fff;padding:0 20px;height:52px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;z-index:10}
    .topbar h1{font-size:17px;font-weight:600}
    .topbar-right{display:flex;align-items:center;gap:16px;font-size:13px;opacity:.9}
    .filter-bar{display:flex;gap:8px;padding:10px 16px;background:#fff;border-bottom:1px solid #e8e8e8;flex-shrink:0}
    .filter-btn{padding:5px 14px;border-radius:20px;border:1px solid #ddd;background:#fff;font-size:13px;cursor:pointer;transition:all .15s}
    .filter-btn.active{background:#2e7d32;color:#fff;border-color:#2e7d32}
    .layout{display:flex;flex:1;overflow:hidden}
    .sidebar{width:320px;flex-shrink:0;background:#fff;border-right:1px solid #e8e8e8;display:flex;flex-direction:column;overflow:hidden}
    .sidebar-header{padding:12px 16px;border-bottom:1px solid #f0f0f0;font-size:13px;color:#666;font-weight:500}
    .lead-list{flex:1;overflow-y:auto}
    .lead-item{padding:12px 16px;border-bottom:1px solid #f5f5f5;cursor:pointer;transition:background .1s}
    .lead-item:hover{background:#f9f9f9}
    .lead-item.active{background:#e8f5e9}
    .lead-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px}
    .lead-name{font-size:14px;font-weight:500;color:#1a1a1a}
    .lead-time{font-size:11px;color:#aaa}
    .lead-meta{display:flex;gap:6px;align-items:center}
    .badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:500}
    .badge-fb{background:#e3f2fd;color:#1565c0}
    .badge-wa{background:#e8f5e9;color:#2e7d32}
    .badge-ig{background:#fce4ec;color:#c62828}
    .badge-state{background:#f5f5f5;color:#555}
    .badge-converted{background:#e8f5e9;color:#2e7d32}
    .badge-pitched{background:#fff3e0;color:#e65100}
    .badge-ghosted{background:#fafafa;color:#999}
    .fu-banner{display:flex;align-items:center;justify-content:space-between;background:#e8f5e9;border-bottom:1px solid #c8e6c9;padding:8px 16px;font-size:13px}
    .fu-banner-left{display:flex;align-items:center;gap:8px;color:#2e7d32;font-weight:500}
    .toggle-wrap{display:flex;align-items:center;gap:5px;font-size:12px}
    .toggle-sw{position:relative;display:inline-block;width:38px;height:20px;flex-shrink:0}
    .toggle-sw input{opacity:0;width:0;height:0}
    .toggle-slider{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:#ccc;border-radius:20px;transition:.3s}
    .toggle-slider:before{position:absolute;content:"";height:14px;width:14px;left:3px;bottom:3px;background:#fff;border-radius:50%;transition:.3s}
    input:checked+.toggle-slider{background:#2e7d32}
    input:checked+.toggle-slider:before{transform:translateX(18px)}
    .fu-row{display:flex;align-items:center;justify-content:space-between;margin-top:5px;padding-top:5px;border-top:1px dashed #f0f0f0}
    .fu-info{font-size:11px;color:#999}
    .fu-btn{font-size:11px;padding:3px 9px;border:1px solid #2e7d32;color:#2e7d32;background:#fff;border-radius:12px;cursor:pointer;white-space:nowrap}
    .fu-btn:hover{background:#e8f5e9}.fu-btn:disabled{opacity:.4;cursor:default}
    .chat-panel{flex:1;display:flex;flex-direction:column;overflow:hidden}
    .chat-header{padding:14px 20px;background:#fff;border-bottom:1px solid #e8e8e8;display:flex;align-items:center;gap:12px}
    .chat-header-info h2{font-size:15px;font-weight:600}
    .chat-header-info p{font-size:12px;color:#888;margin-top:2px}
    .stats-bar{display:flex;gap:12px;padding:10px 20px;background:#fff;border-bottom:1px solid #f0f0f0;flex-shrink:0}
    .stat-pill{background:#f4f6f8;border-radius:8px;padding:6px 14px;text-align:center}
    .stat-pill .val{font-size:18px;font-weight:700;color:#2e7d32}
    .stat-pill .lbl{font-size:11px;color:#888;margin-top:1px}
    .messages{flex:1;overflow-y:auto;padding:16px 20px;display:flex;flex-direction:column;gap:10px}
    .msg{max-width:72%;padding:10px 14px;border-radius:14px;font-size:14px;line-height:1.5;white-space:pre-wrap;word-break:break-word}
    .msg-user{background:#e8f5e9;color:#1a1a1a;align-self:flex-start;border-bottom-left-radius:4px}
    .msg-bot{background:#fff;color:#1a1a1a;align-self:flex-end;border-bottom-right-radius:4px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
    .msg-time{font-size:10px;color:#bbb;margin-top:3px;text-align:right}
    .empty-state{flex:1;display:flex;align-items:center;justify-content:center;color:#bbb;flex-direction:column;gap:8px}
    .empty-state span{font-size:40px}
    .reply-box{padding:12px 16px;background:#fff;border-top:1px solid #e8e8e8;display:flex;gap:10px;align-items:flex-end}
    .reply-input{flex:1;border:1px solid #ddd;border-radius:12px;padding:10px 14px;font-size:14px;resize:none;outline:none;font-family:inherit;max-height:120px;min-height:42px;transition:border .15s}
    .reply-input:focus{border-color:#2e7d32}
    .send-btn{background:#2e7d32;color:#fff;border:none;border-radius:12px;padding:10px 20px;font-size:14px;cursor:pointer;white-space:nowrap;font-weight:500;transition:opacity .15s}
    .send-btn:disabled{opacity:.5;cursor:default}
    .platform-icon{font-size:18px}
    .no-convo{flex:1;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;color:#bbb}
    .no-convo .icon{font-size:48px}
    .no-convo p{font-size:15px}
    ::-webkit-scrollbar{width:4px}
    ::-webkit-scrollbar-track{background:transparent}
    ::-webkit-scrollbar-thumb{background:#ddd;border-radius:4px}
  </style>
</head>
<body>
<div class="topbar">
  <h1>🌿 Ayusomam Dashboard</h1>
  <div class="topbar-right">
    <span id="clock"></span>
    <button onclick="loadData()" style="background:rgba(255,255,255,.2);border:none;color:#fff;padding:5px 12px;border-radius:8px;cursor:pointer;font-size:13px">↻ Refresh</button>
  </div>
</div>

<div class="stats-bar" id="statsBar">
  <div class="stat-pill"><div class="val" id="s-total">—</div><div class="lbl">Total</div></div>
  <div class="stat-pill"><div class="val" id="s-active">—</div><div class="lbl">Active</div></div>
  <div class="stat-pill"><div class="val" id="s-pitched" style="color:#e65100">—</div><div class="lbl">In Checkout</div></div>
  <div class="stat-pill"><div class="val" id="s-converted">—</div><div class="lbl">Converted</div></div>
  <div class="stat-pill"><div class="val" id="s-rate">—</div><div class="lbl">Conv. Rate</div></div>
  <div class="stat-pill"><div class="val" id="s-ghosted" style="color:#999">—</div><div class="lbl">Ghosted</div></div>
</div>

<div class="filter-bar">
  <button class="filter-btn active" onclick="setFilter('all',this)">All</button>
  <button class="filter-btn" onclick="setFilter('messenger',this)">📘 Messenger</button>
  <button class="filter-btn" onclick="setFilter('whatsapp',this)">💬 WhatsApp</button>
  <button class="filter-btn" onclick="setFilter('instagram',this)">📸 Instagram</button>
  <button class="filter-btn" onclick="setFilter('post_payment',this)">✅ Converted</button>
  <button class="filter-btn" onclick="setFilter('pitched',this)">🔥 In Checkout</button>
</div>

<div class="fu-banner" id="fuBanner">
  <div class="fu-banner-left">🔔 Auto Follow-ups</div>
  <div class="toggle-wrap">
    <span class="fu-info" id="fuGlobalLabel" style="color:#2e7d32;font-weight:600;margin-right:4px">ON</span>
    <label class="toggle-sw" style="margin:0 6px">
      <input type="checkbox" id="globalFuToggle" checked onchange="toggleGlobal(this.checked)">
      <span class="toggle-slider"></span>
    </label>
    <span class="fu-info">Global</span>
  </div>
</div>
<div class="layout">
  <div class="sidebar">
    <div class="sidebar-header" id="leadCount">Loading...</div>
    <div class="lead-list" id="leadList"></div>
  </div>
  <div class="chat-panel" id="chatPanel">
    <div class="no-convo">
      <div class="icon">💬</div>
      <p>Select a conversation to view</p>
    </div>
  </div>
</div>

<script>
const SECRET = '${secret}';
let allLeads = [];
let activeFilter = 'all';
let activeUserId = null;
let autoRefreshTimer = null;

const platformIcon  = { messenger:'📘', whatsapp:'💬', instagram:'📸', unknown:'💬' };
const platformBadge = { messenger:'badge-fb', whatsapp:'badge-wa', instagram:'badge-ig', unknown:'badge-fb' };
const stateColor    = { post_payment:'badge-converted', awaiting_payment:'badge-pitched', pitched:'badge-pitched', awaiting_commitment:'badge-pitched' };

function timeAgo(ts) {
  if (!ts) return '—';
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return m + 'm ago';
  if (m < 1440) return Math.round(m/60) + 'h ago';
  return Math.round(m/1440) + 'd ago';
}

function setFilter(f, btn) {
  activeFilter = f;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderLeads();
}

async function loadData() {
  try {
    const r = await fetch('/admin/data?secret=' + SECRET);
    const d = await r.json();
    allLeads = d.leads || [];
    const s = d.stats || {};
    document.getElementById('s-total').textContent     = s.total || 0;
    document.getElementById('s-active').textContent    = s.active || 0;
    document.getElementById('s-pitched').textContent   = s.pitched || 0;
    document.getElementById('s-converted').textContent = s.converted || 0;
    document.getElementById('s-rate').textContent      = (s.conversionRate || '0') + '%';
    document.getElementById('s-ghosted').textContent   = s.ghosted || 0;
    renderLeads();
    if (activeUserId) renderChat(activeUserId);
  } catch(e) { console.error(e); }
}

function renderLeads() {
  let leads = allLeads;
  if (activeFilter === 'messenger')   leads = leads.filter(l => l.platform === 'messenger');
  if (activeFilter === 'whatsapp')    leads = leads.filter(l => l.platform === 'whatsapp');
  if (activeFilter === 'instagram')   leads = leads.filter(l => l.platform === 'instagram');
  if (activeFilter === 'post_payment') leads = leads.filter(l => l.state === 'post_payment' || l.state === 'done');
  if (activeFilter === 'pitched')     leads = leads.filter(l => ['pitched','awaiting_payment','awaiting_commitment'].includes(l.state));

  document.getElementById('leadCount').textContent = leads.length + ' conversation' + (leads.length !== 1 ? 's' : '');
  const list = document.getElementById('leadList');
  list.innerHTML = leads.map(l => {
    const icon    = platformIcon[l.platform] || '💬';
    const bCls    = platformBadge[l.platform] || 'badge-fb';
    const sCls    = stateColor[l.state] || 'badge-state';
    const lastMsg = (l.history || []).filter(m => m.role === 'user').slice(-1)[0];
    const preview = lastMsg ? lastMsg.content.substring(0,50) + (lastMsg.content.length > 50 ? '…' : '') : 'No messages yet';
    return \`<div class="lead-item\${l.id === activeUserId ? ' active' : ''}" onclick="selectLead('\${l.id}')">
      <div class="lead-top">
        <span class="lead-name">\${icon} \${l.id.substring(0,12)}…</span>
        <span class="lead-time">\${timeAgo(l.lastMessageAt)}</span>
      </div>
      <div class="lead-meta" style="margin-bottom:4px">
        <span class="badge \${bCls}">\${l.platform}</span>
        <span class="badge \${sCls}">\${l.state}</span>
        \${l.sinusType ? '<span class="badge" style="background:#f3e5f5;color:#6a1b9a">' + l.sinusType.replace(/_/g,' ') + '</span>' : ''}
      </div>
      <div style="font-size:12px;color:#999;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">\${preview}</div>
         <div class="fu-row" onclick="event.stopPropagation()">
        <div class="toggle-wrap">
          <label class="toggle-sw" style="margin:0">
            <input type="checkbox" \${l.autoFollowup!==false?'checked':''} onchange="toggleFU('\${l.id}',this.checked)">
            <span class="toggle-slider"></span>
          </label>
          <span class="fu-info" style="margin:0 5px">Auto FU</span>
          <span class="fu-info" style="color:\${computeFuTxt(l).includes('Due')?'#e65100':'#888'}">\${computeFuTxt(l)}</span>
        </div>
        <button class="fu-btn" data-fu-btn="\${l.id}" onclick="sendFUNow('\${l.id}')">Send now</button>
      </div>
 </div>\`;
  }).join('');
}

function selectLead(id) {
  activeUserId = id;
  renderLeads();
  renderChat(id);
}

function renderChat(id) {
  const lead = allLeads.find(l => l.id === id);
  if (!lead) return;
  const icon  = platformIcon[lead.platform] || '💬';
  const panel = document.getElementById('chatPanel');
  const history = lead.history || [];

  panel.innerHTML = \`
    <div class="chat-header">
      <span class="platform-icon">\${icon}</span>
      <div class="chat-header-info">
        <h2>\${lead.platform.charAt(0).toUpperCase()+lead.platform.slice(1)} · \${lead.id}</h2>
        <p>\${lead.sinusType ? lead.sinusType.replace(/_/g,' ') + ' · ' : ''}\${lead.state} · \${lead.lang || 'hin'}\${lead.duration ? ' · ' + lead.duration : ''}</p>
      </div>
    </div>
    <div class="messages" id="msgArea">
      \${history.length === 0
        ? '<div class="empty-state"><span>💬</span><p>No messages yet</p></div>'
        : history.map(m => \`
          <div>
            <div class="msg \${m.role === 'user' ? 'msg-user' : 'msg-bot'}">\${m.content}</div>
          </div>\`).join('')}
    </div>
    <div class="reply-box">
      <textarea class="reply-input" id="replyInput" placeholder="Type a message to send via \${lead.platform}…" rows="1"
        onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendReply()}"
        oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'"></textarea>
      <button class="send-btn" id="sendBtn" onclick="sendReply()">Send ↗</button>
    </div>\`;

  // Scroll to bottom
  const msgArea = document.getElementById('msgArea');
  if (msgArea) msgArea.scrollTop = msgArea.scrollHeight;
}

async function sendReply() {
  const input = document.getElementById('replyInput');
  const btn   = document.getElementById('sendBtn');
  const msg   = input.value.trim();
  if (!msg || !activeUserId) return;
  const lead = allLeads.find(l => l.id === activeUserId);
  if (!lead) return;

  btn.disabled = true;
  btn.textContent = 'Sending…';
  try {
    const r = await fetch('/admin/reply', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ secret: SECRET, userId: activeUserId, platform: lead.platform, message: msg }),
    });
    const d = await r.json();
    if (d.ok) {
      input.value = '';
      input.style.height = 'auto';
      // Add to local history immediately
      lead.history = lead.history || [];
      lead.history.push({ role: 'assistant', content: msg });
      renderChat(activeUserId);
    } else {
      alert('Send failed: ' + (d.error || 'Unknown error'));
    }
  } catch(e) { alert('Error: ' + e.message); }
  btn.disabled = false;
  btn.textContent = 'Send ↗';
}

// Clock
function toggleGlobal(enabled) {
  fetch('/admin/toggle-global',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret:SEC,enabled})})
    .then(r=>r.json()).then(d=>{
      document.getElementById('fuGlobalLabel').textContent=d.globalFollowupEnabled?'ON':'OFF';
      document.getElementById('fuBanner').style.opacity=d.globalFollowupEnabled?'1':'0.5';
    });
}
function toggleFU(userId,enabled){
  fetch('/admin/toggle-followup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret:SEC,userId,enabled})})
    .then(r=>r.json()).then(()=>loadData());
}
function sendFUNow(userId){
  const btn=document.querySelector('[data-fu-btn="'+userId+'"]');
  if(btn){btn.disabled=true;btn.textContent='Sending...';}
  fetch('/admin/send-followup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret:SEC,userId})})
    .then(r=>r.json())
    .then(d=>{
      if(d.ok){alert('Sent! (Follow-up #'+d.followupCount+')\\n\\n'+d.message.substring(0,100)+'...');loadData();}
      else{alert('Error: '+(d.error||'unknown'));if(btn){btn.disabled=false;btn.textContent='Send now';}}
    }).catch(()=>{if(btn){btn.disabled=false;btn.textContent='Send now';}});
}
function computeFuTxt(l){
  const s={interested:[1,3,7],pitched:[1,3],ghosted:[14],unknown:[2,5]};
  const sched=s[l.state]||s.unknown;const n=l.followupCount||0;
  if(n>=sched.length)return 'Done ✓';
  const last=l.lastFollowupAt||l.lastMessageAt;if(!last)return '—';
  const d=Math.max(0,Math.ceil(sched[n]-(Date.now()-new Date(last).getTime())/86400000));
  return d<=0?'Due now!':'In '+d+'d';
}
function updateClock() {
  document.getElementById('clock').textContent = new Date().toLocaleString('en-IN',{timeZone:'Asia/Kolkata'});
}
updateClock();
setInterval(updateClock, 1000);

// Auto-refresh data every 30s
loadData();
setInterval(loadData, 30000);
</script>
</body>
</html>`);
});

// ─── VIDEO LANDING PAGE — SINUS LEAD CAPTURE ─────────────────
app.get("/sinus", (req, res) => {
  const src = req.query.src || 'direct';
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html><html lang="hi"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Apna Sinus Type Jaano — FREE | Ayusomam Herbals</title>
<meta name="description" content="6 type ke sinus hote hain. Apna sinus type identify karo aur sahi Ayurvedic treatment pao. Free assessment by Ayusomam Herbals.">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',Arial,sans-serif;background:#0a0a0a;color:#fff;min-height:100vh}
.hero{background:linear-gradient(135deg,#1a3a1a 0%,#0d1f0d 50%,#0a0a0a 100%);padding:40px 20px 30px;text-align:center}
.logo{font-size:14px;color:#4caf50;letter-spacing:2px;text-transform:uppercase;margin-bottom:12px}
h1{font-size:28px;line-height:1.3;margin-bottom:12px}
h1 span{color:#4caf50}
.sub{color:#aaa;font-size:15px;line-height:1.5;max-width:340px;margin:0 auto 24px}
.badge{display:inline-block;background:#1b5e20;color:#a5d6a7;padding:6px 16px;border-radius:20px;font-size:13px;margin-bottom:24px}
.types{padding:20px;max-width:400px;margin:0 auto}
.types h2{font-size:18px;margin-bottom:16px;text-align:center;color:#81c784}
.type-card{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;padding:14px 16px;margin-bottom:10px;display:flex;align-items:center;gap:12px}
.type-icon{width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0}
.t1 .type-icon{background:#1a237e20;color:#7986cb}
.t2 .type-icon{background:#01579b20;color:#4fc3f7}
.t3 .type-icon{background:#bf360c20;color:#ff8a65}
.t4 .type-icon{background:#4a148c20;color:#ce93d8}
.t5 .type-icon{background:#33691e20;color:#aed581}
.t6 .type-icon{background:#e6511520;color:#ffab91}
.type-name{font-size:14px;font-weight:600}
.type-hint{font-size:12px;color:#888;margin-top:2px}
.cta-section{padding:30px 20px;text-align:center;max-width:400px;margin:0 auto}
.cta-section h2{font-size:20px;margin-bottom:8px}
.cta-section p{color:#aaa;font-size:14px;margin-bottom:20px}
.cta-btn{display:block;width:100%;padding:16px;border-radius:12px;font-size:16px;font-weight:700;text-decoration:none;text-align:center;margin-bottom:12px;border:none;cursor:pointer}
.wa-btn{background:#25D366;color:#fff}
.wa-btn:hover{background:#1da851}
.chat-btn{background:#1b5e20;color:#fff;border:1px solid #2e7d32}
.chat-btn:hover{background:#2e7d32}
.trust{display:flex;justify-content:center;gap:20px;margin-top:20px;flex-wrap:wrap}
.trust-item{font-size:12px;color:#888;display:flex;align-items:center;gap:4px}
.free-tag{color:#4caf50;font-weight:700}
.footer{text-align:center;padding:20px;color:#555;font-size:12px;border-top:1px solid #1a1a1a;margin-top:20px}
</style></head><body>
<div class="hero">
<div class="logo">Ayusomam Herbals</div>
<h1>Sinus Ka <span>Asli Solution</span><br>Type Se Shuru Hota Hai</h1>
<p class="sub">6 type ke sinus hote hain. Har ek ka treatment alag hai. Pehle apna type jaano — phir sahi protocol lo.</p>
<span class="badge">500+ logon ne apna type jaana</span>
</div>
<div class="types">
<h2>6 Sinus Types</h2>
<div class="type-card t1"><div class="type-icon">🌬</div><div><div class="type-name">Reactive Sensitivity</div><div class="type-hint">Sneezing, watery nose, allergy triggers</div></div></div>
<div class="type-card t2"><div class="type-icon">🔵</div><div><div class="type-name">Chronic Congestion</div><div class="type-hint">Naak band, heavy head, subah zyada</div></div></div>
<div class="type-card t3"><div class="type-icon">🔥</div><div><div class="type-name">Deep Inflammation</div><div class="type-hint">Yellow mucus, burning, headache</div></div></div>
<div class="type-card t4"><div class="type-icon">💊</div><div><div class="type-name">Spray Dependency</div><div class="type-hint">Spray ke bina naak nahi khulti</div></div></div>
<div class="type-card t5"><div class="type-icon">🫁</div><div><div class="type-name">Drainage Blockage</div><div class="type-hint">Post-nasal drip, throat mein balgam</div></div></div>
<div class="type-card t6"><div class="type-icon">🦴</div><div><div class="type-name">Structural Congestion</div><div class="type-hint">Deviated septum, one-sided block</div></div></div>
</div>
<div class="cta-section">
<h2>Apna Sinus Type Jaano</h2>
<p><span class="free-tag">FREE</span> — 2 minute mein pata chalega</p>
<a href="https://wa.me/918595160713?text=SINUS" class="cta-btn wa-btn" id="wa-cta">WhatsApp Pe Jaano →</a>
<a href="/widget" class="cta-btn chat-btn" id="chat-cta">Yahan Chat Karo →</a>
<div class="trust">
<div class="trust-item">🌿 100% Ayurvedic</div>
<div class="trust-item">🤖 AI-Powered Assessment</div>
<div class="trust-item">📱 WhatsApp Support</div>
</div>
</div>
<div class="footer">Ayusomam Herbals — Ayurvedic Sinus Treatment Since 2023</div>
<script>
// Track video lead source
(function(){
  var src='${src}';
  var ts=new Date().toISOString();
  fetch('/video-lead',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({source:src,timestamp:ts,page:'sinus-landing',action:'page_view'})
  }).catch(function(){});
  document.getElementById('wa-cta').addEventListener('click',function(){
    fetch('/video-lead',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({source:src,timestamp:ts,page:'sinus-landing',action:'whatsapp_click'})
    }).catch(function(){});
  });
  document.getElementById('chat-cta').addEventListener('click',function(){
    fetch('/video-lead',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({source:src,timestamp:ts,page:'sinus-landing',action:'chat_click'})
    }).catch(function(){});
  });
})();
</script>
</body></html>`);
});

// ─── VIDEO LEAD TRACKING ENDPOINT ────────────────────────────
app.post("/video-lead", async (req, res) => {
  const { source, timestamp, page, action } = req.body || {};
  const leadData = {
    source: source || 'unknown',
    timestamp: timestamp || new Date().toISOString(),
    page: page || 'sinus-landing',
    action: action || 'unknown',
    ip: req.headers['x-forwarded-for'] || req.ip
  };
  console.log(`[VIDEO-LEAD] ${leadData.action} from ${leadData.source} at ${leadData.timestamp}`);

  // Log to Google Sheets if configured
  if (SHEET_URL) {
    try {
      const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
      await fetch(SHEET_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'video_lead',
          source: leadData.source,
          event: leadData.action,
          timestamp: leadData.timestamp,
          page: leadData.page
        })
      });
    } catch(e) { console.error('[VIDEO-LEAD] Sheet log error:', e.message); }
  }

  // Store in Firestore if available
  if (db) {
    try {
      await db.collection('video_leads').add(leadData);
    } catch(e) { console.error('[VIDEO-LEAD] Firestore error:', e.message); }
  }
  res.json({ ok: true });
});

// ─── HEALTH CHECK ─────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    version: "5.0",
    uptime: process.uptime(),
    users: Object.keys(userData).length,
  });
});

// ─── START ────────────────────────────────────────────────────
// ── WEBSITE CHAT WIDGET ─────────────────────────────────────────────
app.get('/widget', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(
    '<!DOCTYPE html><html lang="en"><head>' +
    '<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">' +
    '<title>Ayusomam Herbals Chat</title>' +
    '<style>' +
    '*{margin:0;padding:0;box-sizing:border-box}' +
    'body{font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f5f5f5}' +
    '#chat{width:380px;height:600px;background:#fff;border-radius:16px;box-shadow:0 4px 20px rgba(0,0,0,.15);display:flex;flex-direction:column;overflow:hidden}' +
    '.hd{background:linear-gradient(135deg,#2d5a27,#4a8c42);color:#fff;padding:16px 20px;display:flex;align-items:center;gap:12px}' +
    '.ic{width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.25);display:flex;align-items:center;justify-content:center;font-size:20px}' +
    '.hd h3{font-size:16px;margin:0}.hd p{font-size:12px;opacity:.85;margin:0}' +
    '#msgs{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px}' +
    '.msg{max-width:78%;padding:10px 14px;border-radius:18px;font-size:14px;line-height:1.5}' +
    '.bot{background:#f0f0f0;color:#333;align-self:flex-start;border-bottom-left-radius:4px}' +
    '.usr{background:#2d5a27;color:#fff;align-self:flex-end;border-bottom-right-radius:4px}' +
    '.typ{align-self:flex-start;padding:10px 14px;background:#f0f0f0;border-radius:18px;border-bottom-left-radius:4px}' +
    '.typ span{display:inline-block;width:7px;height:7px;background:#999;border-radius:50%;animation:b 1.2s infinite;margin:0 2px}' +
    '.typ span:nth-child(2){animation-delay:.2s}.typ span:nth-child(3){animation-delay:.4s}' +
    '@keyframes b{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-6px)}}' +
    '#ft{padding:12px 16px;border-top:1px solid #eee;display:flex;gap:8px}' +
    '#inp{flex:1;border:1px solid #ddd;border-radius:24px;padding:10px 16px;font-size:14px;outline:none}' +
    '#inp:focus{border-color:#4a8c42}' +
    '#btn{background:#2d5a27;color:#fff;border:none;border-radius:50%;width:40px;height:40px;cursor:pointer;font-size:18px}' +
    '#btn:hover{background:#4a8c42}' +
    '</style></head><body>' +
    '<div id="chat">' +
    '<div class="hd"><div class="ic">🌿</div><div><h3>Ayusomam Herbals</h3><p>Sinus Treatment Expert</p></div></div>' +
    '<div id="msgs"><div class="msg bot">Namaste! 🌿 How can I help you today?</div></div>' +
    '<div id="ft"><input id="inp" type="text" placeholder="Type your message..." autocomplete="off"><button id="btn">&#9658;</button></div>' +
    '</div>' +
    '<script>' +
    'var sid="ws_"+Math.random().toString(36).substr(2,9)+"_"+Date.now();' +
    'var msgs=document.getElementById("msgs"),inp=document.getElementById("inp");' +
    'function addMsg(t,c){var d=document.createElement("div");d.className="msg "+c;d.textContent=t;msgs.appendChild(d);msgs.scrollTop=msgs.scrollHeight;}' +
    'function showTyping(){var d=document.createElement("div");d.className="typ";d.id="ti";d.innerHTML="<span></span><span></span><span></span>";msgs.appendChild(d);msgs.scrollTop=msgs.scrollHeight;}' +
    'function hideTyping(){var t=document.getElementById("ti");if(t)t.remove();}' +
    'async function send(){var t=inp.value.trim();if(!t)return;inp.value="";addMsg(t,"usr");showTyping();' +
    'try{var r=await fetch("/widget-chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:sid,message:t})});' +
    'var d=await r.json();hideTyping();(d.replies||["Sorry, something went wrong."]).forEach(function(m){addMsg(m,"bot");});}' +
    'catch(e){hideTyping();addMsg("Connection error. Please refresh.","bot");}}' +
    'document.getElementById("btn").onclick=send;' +
    'inp.addEventListener("keydown",function(e){if(e.key==="Enter")send();});' +
    '<\/script></body></html>'
  );
});

app.post('/widget-chat', async (req, res) => {
  try {
    const { sessionId, message } = req.body;
    if (!sessionId || !message) return res.status(400).json({ error: 'Missing fields' });
    widgetPending[sessionId] = [];
    await handleMessage(sessionId, message, 'website');
    await new Promise(resolve => setTimeout(resolve, 3500));
    const replies = widgetPending[sessionId] || [];
    delete widgetPending[sessionId];
    res.json({ replies: replies.length ? replies : ['Thank you! Our team will get back to you shortly.'] });
  } catch (err) {
    console.error('Widget-chat error:', err);
    res.status(500).json({ replies: ['Sorry, something went wrong. Please try again.'] });
  }
});

// ─── FIREBASE LEAD DASHBOARD ──────────────────────────────────────────────────
app.get('/dashboard', async (req, res) => {
  if (!db) return res.send('<h1 style="padding:40px;color:red">Firebase not connected.</h1>');
  try {
    const snap = await db.collection('users').get();
    const leads = [];
    snap.forEach(function(doc) { leads.push(Object.assign({ id: doc.id }, doc.data())); });
    leads.sort(function(a, b) { return (b.lastMessageAt || 0) - (a.lastMessageAt || 0); });

    function stateColor(s) {
      var map = { new: '#3498db', probe: '#9b59b6', pitched: '#e67e22', close: '#e74c3c', enrolled: '#27ae60', closed: '#27ae60' };
      return map[s] || '#95a5a6';
    }
    function fmtTime(ts) {
      if (!ts) return '-';
      var ms = (ts && ts._seconds) ? ts._seconds * 1000 : ts;
      return new Date(ms).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    }
    function esc(v) { return String(v || '-').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    var stats = { total: leads.length, enrolled: 0, pitched: 0, probe: 0 };
    leads.forEach(function(u) {
      var s = u.state || u.convPhase || '';
      if (s === 'enrolled' || s === 'closed') stats.enrolled++;
      else if (s === 'pitched' || s === 'close') stats.pitched++;
      else if (s === 'probe') stats.probe++;
    });

    var histData = [];
    var rows = leads.map(function(u, i) {
      var hist = Array.isArray(u.history) ? u.history.slice(-3) : [];
      histData.push(JSON.stringify(hist).replace(/</g,'&lt;').replace(/>/g,'&gt;'));
      var sc = stateColor(u.state || u.convPhase);
      return '<tr class="lr" data-idx="' + i + '" style="cursor:pointer;border-bottom:1px solid #f0f0f0">' +
        '<td style="padding:10px 12px;font-weight:600">' + esc(u.name) + '</td>' +
        '<td style="padding:10px 8px;font-size:12px;color:#666">' + esc(u.id).replace('whatsapp:','') + '</td>' +
        '<td style="padding:10px 8px"><span style="padding:3px 8px;border-radius:12px;background:' + sc + ';color:#fff;font-size:11px;font-weight:600">' + esc(u.state || '-') + '</span></td>' +
        '<td style="padding:10px 8px;font-size:12px">' + esc(u.convPhase) + '</td>' +
        '<td style="padding:10px 8px;font-size:12px">' + esc(u.platform) + '</td>' +
        '<td style="padding:10px 8px;font-size:12px;color:#6d28d9">' + esc(u.sinusType) + '</td>' +
        '<td style="padding:10px 8px;font-size:12px">' + esc(u.duration) + '</td>' +
        '<td style="padding:10px 8px;font-size:12px;max-width:160px">' + esc(u.symptoms) + '</td>' +
        '<td style="padding:10px 8px;font-size:12px;color:' + (u.usedAllopathy ? '#dc2626' : '#059669') + '">' + (u.usedAllopathy ? 'Yes' : 'No') + '</td>' +
        '<td style="padding:10px 8px;font-size:12px">' + esc(u.selectedPlan || (u.enrolledAt ? 'Enrolled' : '-')) + '</td>' +
        '<td style="padding:10px 8px;font-size:12px;color:#888">' + fmtTime(u.lastMessageAt) + '</td>' +
        '<td style="padding:10px 8px;font-size:12px">' + (Array.isArray(u.history) ? u.history.length : 0) + '</td>' +
        '</tr>' +
        '<tr class="hist-row" id="hist-' + i + '" style="display:none"><td colspan="12" style="padding:8px 16px;background:#fafafa;font-size:12px">Loading...</td></tr>';
    }).join('');

    var histJson = '<script>var HIST=' + JSON.stringify(histData) + ';' +
      'document.addEventListener("click",function(e){' +
      'var row=e.target.closest(".lr");' +
      'if(!row)return;' +
      'var idx=row.getAttribute("data-idx");' +
      'var hrow=document.getElementById("hist-"+idx);' +
      'if(hrow.style.display==="none"){' +
      'var h=JSON.parse(HIST[idx]);' +
      'var html=h.map(function(m){return"<div style=\"margin:2px 0;padding:4px 8px;border-radius:4px;background:"+(m.role==="user"?"#eef2ff":"#f0fdf4")+";\"><b>"+(m.role==="user"?"U":"Bot")+":</b> "+(m.content||"").substring(0,150)+"</div>";}).join("");' +
      'hrow.querySelector("td").innerHTML=html||"No history";' +
      'hrow.style.display="table-row";' +
      '}else{hrow.style.display="none";}' +
      '});' +
      'setTimeout(function(){location.reload();},60000);' +
      '</script>';

    res.send('<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ayusomam Dashboard</title>' +
      '<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#f4f6fb}' +
      '.hdr{background:linear-gradient(135deg,#2d6a4f,#40916c);color:#fff;padding:18px 28px;display:flex;justify-content:space-between;align-items:center}' +
      '.hdr h1{font-size:20px;font-weight:700}.hdr small{opacity:.8;font-size:12px}' +
      '.stats{display:flex;gap:14px;padding:18px 28px;flex-wrap:wrap}' +
      '.stat{background:#fff;border-radius:10px;padding:14px 20px;flex:1;min-width:130px;box-shadow:0 1px 4px rgba(0,0,0,.08)}' +
      '.stat .n{font-size:26px;font-weight:800;color:#2d6a4f}.stat .l{font-size:11px;color:#888;margin-top:2px}' +
      '.tw{padding:0 28px 28px;overflow-x:auto}' +
      'table{width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08)}' +
      'th{background:#2d6a4f;color:#fff;padding:9px 10px;font-size:11px;font-weight:600;text-align:left;white-space:nowrap}' +
      'tr.lr:hover{background:#f9f9f9}</style></head><body>' +
      '<div class="hdr"><div><h1>🌿 Ayusomam Lead Dashboard</h1>' +
      '<small>Auto-refresh 60s • ' + new Date().toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}) + ' IST • Click row = last 3 msgs</small></div>' +
      '<a href="/dashboard" style="color:#fff;font-size:12px">Refresh</a></div>' +
      '<div class="stats">' +
      '<div class="stat"><div class="n">' + stats.total + '</div><div class="l">Total Leads</div></div>' +
      '<div class="stat"><div class="n" style="color:#27ae60">' + stats.enrolled + '</div><div class="l">Enrolled</div></div>' +
      '<div class="stat"><div class="n" style="color:#e67e22">' + stats.pitched + '</div><div class="l">In Pitch</div></div>' +
      '<div class="stat"><div class="n" style="color:#9b59b6">' + stats.probe + '</div><div class="l">In Probe</div></div>' +
      '</div>' +
      '<div class="tw"><table><thead><tr>' +
      '<th>Name</th><th>Phone/ID</th><th>State</th><th>Phase</th><th>Platform</th>' +
      '<th>Sinus Type</th><th>Duration</th><th>Symptoms</th><th>Allopathy</th><th>Plan</th><th>Last Active</th><th>Msgs</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
      histJson + '</body></html>');
  } catch(err) {
    res.status(500).send('<pre style="padding:40px">Dashboard error: ' + err.message + '</pre>');
  }
});
// ──────────────────────────────────────────────────────────────────────────────

app.get('/', (req, res) => res.send('OK'));

app.listen(PORT, () => {
  console.log(`SALESOM v5.0 running on port ${PORT}`);
  console.log(`  Sinus types: Reactive Sensitivity, Chronic Congestion, Deep Inflammation, Spray Dependency, Drainage Blockage, Structural Congestion`);
  console.log(`  Structured flow: Duration menu > Symptom multi-select > Insights > Type reveal > Hope pitch > Commitment > Payment`);
  console.log(`  Ghosting recovery: 24hr and 72hr`);
  console.log(`  Day milestones: Day 5, 7, 10, 13`);
  console.log(`  Plans: 7-Day Sinus Reset Rs. 499 | 14-Day Sinus Restoration Rs. 1299`);

  // Start Playwright Instagram DM poller (runs only if credentials are set)
  if (INSTAGRAM_USERNAME) setTimeout(async () => {
    try {
      const igMod = require('./instagram-pw');
      sendInstagramMessagePW = await igMod.init({ db, handleMessage, sleep, INSTAGRAM_USERNAME, INSTAGRAM_PASSWORD });
      console.log('[IG-PW] Module loaded and ready');
    } catch(e) { console.error('[IG-PW] Module load error:', e.message); }
  }, 8000);
});
