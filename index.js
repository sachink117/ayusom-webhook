// ============================================================
// AYUSOMAM MESSENGER BOT — Version 3.2
// Fix: Language detection per-message bi-directional
//      All hardcoded strings Hinglish only (no encoding issues)
//      AI handles Devanagari / English / Hinglish automatically
// New: Website trust mentions at 2 key touchpoints (reveal + link)
// ============================================================
const express = require("express");
const fetch = require("node-fetch");
const Anthropic = require("@anthropic-ai/sdk");
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ─── CONFIG ──────────────────────────────────────────────────
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PAYMENT_1299 = "https://rzp.io/rzp/qu8zhQT";
const PAYMENT_499 = process.env.PAYMENT_499_LINK || "https://rzp.io/rzp/REPLACE_499";
const GAS_URL = "https://script.google.com/macros/s/AKfycbwWjnJa2utTx0vQUkjdKtSaVpJBllL1-f-inxEfmxzutyF5GpGS2bChD5qVXkYPwqSbuA/exec";

const userChannels = {};
const TWILIO_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER || "whatsapp:+15559069156";

// ─── ANTHROPIC CLIENT ────────────────────────────────────────
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── STATE + DEDUP ───────────────────────────────────────────
const userState = {};
const processedMessages = new Set();
setInterval(() => processedMessages.clear(), 10 * 60 * 1000);

// ─── IN-MEMORY CONVERSATION LOG (for dashboard) ──────────────
// Google Sheet = permanent | conversationLog = fast in-memory for UI
const conversationLog = {}; // { senderId: [{role, text, ts}] }

// ─── SALESOM SYSTEM PROMPT ───────────────────────────────────
const SALESOM_SYSTEM_PROMPT = `SALESOM — MASTER SYSTEM PROMPT
Ayusomam Herbals | Sinus Sales Specialist

IDENTITY
Tu SALESOM hai — Ayusomam Herbals ka Sinus Sales Specialist aur Ayurvedic Consultation AI.
- Brand: Ayusomam Herbals (ayusomamherbals.com)
- Consultant name: Sachin
- Platform: WhatsApp / Facebook Messenger / Instagram
- Core expertise: Charaka Samhita + Ashtanga Hridayam based Pratishyaya (Sinus) management
- Mission: Type-specific Ayurvedic sinus consultation → 14-Din Protocol conversion

LANGUAGE RULES — HIGHEST PRIORITY
Detect from the user's CURRENT message script/words:
1. Devanagari script (Hindi letters like "मुझे", "नाक") → Reply ONLY in Devanagari Hindi. Use: niyam/dinchrya/lakshan/din instead of protocol/routine/symptoms/day. Max 10% English.
2. Roman Hindi / Hinglish words ("mujhe", "naak", "band", "hai", "kya", "sinus", "theek", "haan") → Reply in Hinglish (Roman Hindi). This is the DEFAULT.
3. Pure English sentences (no Hindi phonetics, full English grammar) → Reply in English.
4. Marathi words ("mala", "aahe", "naak", "band") → Reply in Marathi.
CRITICAL:
- DEFAULT is Hinglish — when in doubt, use Hinglish
- Never mix Devanagari + Roman in one reply
- Short/ambiguous texts ("ok","yes","haan","done") → keep previous conversation language
- NEVER ask the user which language to use

TONE — NON-NEGOTIABLE
NEVER: Bhai, Yaar, Boss, long paragraphs, bullet lists, formal letter style
ALWAYS: Dost jaisa — caring, warm, professional. Like a knowledgeable friend, not a salesman.
MAX 2-3 SHORT LINES per message. Mobile screen readable. No walls of text.

5 SINUS TYPES
TYPE 1 — VATAJA-KAPHAJA (ALLERGIC)
Triggers: dust, cold, seasonal, morning sneezing, watery eyes
Treatment: Anu Tailam Nasya + Anulom-Vilom
Days: 4-5 sneezing reduces | 7 triggers less | 14 big improvement

TYPE 2 — KAPHAJA (CONGESTIVE)
Triggers: after cold/infection, smell/taste loss, heaviness
KEY: Dairy = enemy. Must stop.
Treatment: Til Taila Nasya + Gandoosha Kriya
Days: 5-7 smell returns | 8-10 morning clear | 12-14 mostly restored

TYPE 3 — PITTAJA (HEAT/INFECTIVE)
Triggers: burning, yellow/green discharge, worse in heat, antibiotics helped temporarily
CRITICAL: NO eucalyptus/camphor steam — worsens it
Treatment: Narikela Taila Nasya + Sheetali Pranayama + plain water steam only
Days: 3-4 burning reduces | 5 noticeable | 14 mostly resolved

TYPE 4 — AUSHADHA ASAKTI (SPRAY DEPENDENCY)
Triggers: can't sleep without spray, rebound congestion, failed cold turkey
CRITICAL: NEVER cold turkey — graduated protocol only
Treatment: Gau Ghrita Nasya + Bhramari Pranayama + gradual reduction
Days: 4-5 first hours spray-free | 8-10 half night | 14 night spray optional

TYPE 5 — DNS (DEVIATED NASAL SEPTUM)
Triggers: one side ALWAYS blocked (not alternating), history of nose injury/trauma, one-sided headache
KEY: Structural issue + soft tissue inflammation — Ayurveda reduces inflammation, swelling, congestion around the deviation.
Treatment: Til Taila Nasya + Nasya Kriya + Bhramari Pranayama (structural support)
Days: 5-7 breathing improves | 10 congestion eases | 14 significant comfort
Note: Severe DNS may need ENT consult, but 80%+ see major relief without surgery.

PRICING
- Rs.499 — Starter Kit (14 days, self-guided)
- Rs.1,299 — 14-Din Nasal Restoration (RECOMMENDED — daily personal WhatsApp check-in)

UPSELL RULE (Rs.499 -> Rs.1,299):
Rs.1,299 mein 7 din FREE extra milte hain = 21 din total. Sirf Rs.800 zyada.
For 2+ year cases this extended time makes real difference. Mention naturally.

OBJECTIONS
"Mahanga" -> ENT visit Rs.1,000-2,000 for just prescription. Here 14 days daily personal guidance = Rs.1,299 once.
"Pehle try kiya" -> Was it type-specific? Kaphaja protocol Pittaja mein WORSE karta hai.
"Guarantee?" -> Patients who followed exactly saw change by Day 5-7.
"Abhi nahi" -> Jo cycle chal rahi hai woh apne aap nahi toot ti. Koi specific reason?
"DNS ka ilaj hoga?" -> DNS mein asli problem inflammation + congestion hai structure ke around. Woh theek hota hai — breathing improve hoti hai.

RED FLAGS — REFER TO DOCTOR
Fever 102F+ | Blood in discharge | Severe one-sided facial pain | Vision changes | Kids under 6

POWER CLOSES
"Jo condition abhi hai — kya 1 saal aur comfortable hain iske saath? Agar nahi — 14 din try worth it hai."

CRITICAL DEPLOYMENT RULES:
- MAX 2-3 LINES per reply. No exceptions. Short, warm, direct.
- POST-PITCH: Type identified, pitch done. Do NOT restart diagnosis.
- NEVER include payment links in your reply — system handles them separately.
- NEVER send payment link unless user explicitly says yes/interested/bhejo link.
- If user says yes/wants to buy — respond warmly with confirmation only. NO links in your text. System handles.
- POST-PAYMENT: Be supportive. No payment links. For Rs.499 users mention upgrade naturally.
- Under 60 words per reply. Quality over quantity.`;

// ─── LANGUAGE DETECTION — BI-DIRECTIONAL PER MESSAGE ─────────
// Returns: "dev" (Devanagari), "eng" (English), "rom" (Hinglish/default)
// DEFAULT is always Hinglish ("rom") — only switch if very clearly Devanagari or pure English
function detectLang(text) {
  // 1. Devanagari — even 2 chars is enough to confirm Hindi script
  const devanagariCount = (text.match(/[\u0900-\u097F]/g) || []).length;
  if (devanagariCount >= 2) return "dev";

  // 2. Hinglish patterns — any of these = Hinglish, not English
  const hinglishWords = /\b(hai|hain|nahin|nahi|kya|kaise|mujhe|mera|aur|lekin|kyunki|thoda|bilkul|naak|band|spray|smell|theek|achha|haan|kaafi|bhi|se|mein|ko|ki|ka|ho|tha|thi|the|raha|rahi|rahe|hua|hui|hue|laga|lagi|lage|saal|mahine|mahina|din|roz|subah|raat|dono|ek|do|teen|char|paanch|bahut|bohot|jyada|kuch|sab|abhi|kab|kahan|kyun|toh|phir|par|lekin|matlab|samjha|batao|poochh|dekho|lelo|bhejo|sahi|galat|problem|takleef|dard|naak|sar|sir|ankh|muh|band|khula|bhari|halki|severe|mild|moderate|waqt|wala|wali|wale|apna|apni|apne|unka|unki|unke|inka|inki|inke|kitna|kitni|kitne|kaun|kaisa|kaisi|kaise|lena|dena|karna|hona|jana|aana|rahna|bolna|sunna|dekhna|chahna|sochna)\b/i;
  if (hinglishWords.test(text)) return "rom";

  // 3. Pure English — ONLY if text has 4+ words AND no hinglish markers
  const words = text.trim().split(/\s+/);
  const latinOnly = words.filter(w => /^[a-zA-Z']+$/.test(w));
  if (latinOnly.length >= 4 && latinOnly.length === words.length) return "eng";

  return "rom"; // Default: always Hinglish
}

// ─── SINUS TYPE DETECTION ────────────────────────────────────
function detectSinusType(text) {
  const t = text.toLowerCase();
  if (/spray|nasivion|otrivin|otrivine|bina spray|afrin|chhodna|chhod nahi|dependent/.test(t)) return "spray";
  if (/dns|deviated|haddi tedhi|naak ki haddi|septum|ek taraf hamesha|ek side hamesha|ek taraf se poori|chot lagi naak|naak toot/.test(t)) return "dns";
  if (/smell nahi|taste nahi|bilkul band|dono taraf|surgery|polyp|growth/.test(t)) return "polyp";
  if (/peela|peeli|hara|hari|infection|antibiotic|burning|jalan/.test(t)) return "infective";
  if (/dhool|dust|smoke|dhuan|season|chheenk|sneez|allerg/.test(t)) return "allergic";
  return "congestive";
}

// ─── SEND TYPING INDICATOR ───────────────────────────────────
async function sendTypingOn(recipientId) {
  if (userChannels[recipientId] === "twilio") return;
  try {
    await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: { id: recipientId }, sender_action: "typing_on" }),
    });
  } catch (e) {}
}

// ─── SEND MESSAGE ────────────────────────────────────────────
async function sendMessage(recipientId, text) {
  const ch = userChannels[recipientId] || "messenger";
  if (ch === "twilio") { await sendTwilioMessage(recipientId, text); return; }
  if (ch === "website") { console.log(`Website lead ${recipientId} — message saved (no API reply): ${text.substring(0,60)}`); return; }
  if (ch === "instagram") { await sendInstagramMessage(recipientId, text); return; }
  try {
    const res = await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: { id: recipientId }, message: { text }, messaging_type: "RESPONSE" }),
    });
    const data = await res.json();
    if (data.error) console.error("Send error:", data.error);
  } catch (e) { console.error("Send error:", e.message); }
}

// ─── TWILIO SEND ─────────────────────────────────────────────
async function sendTwilioMessage(to, text) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const params = new URLSearchParams({ From: TWILIO_NUMBER, To: `whatsapp:${to}`, Body: text });
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    const data = await res.json();
    if (data.error_code) console.error("Twilio error:", data.message);
    else console.log(`Twilio sent to ${to}: ${text.substring(0, 60)}...`);
  } catch (e) { console.error("Twilio send failed:", e.message); }
}

// ─── INSTAGRAM SEND ──────────────────────────────────────────
async function sendInstagramMessage(recipientId, text) {
  const igToken = process.env.INSTAGRAM_ACCESS_TOKEN || PAGE_ACCESS_TOKEN;
  try {
    const res = await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${igToken}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: { id: recipientId }, message: { text }, messaging_type: "RESPONSE" }),
    });
    const data = await res.json();
    if (data.error) console.error("Instagram send error:", data.error);
    else console.log(`Instagram sent to ${recipientId}: ${text.substring(0, 60)}`);
  } catch (e) { console.error("Instagram send failed:", e.message); }
}

// ─── QUICK REPLIES ───────────────────────────────────────────
async function sendQuickReplies(recipientId, text, replies) {
  if (userChannels[recipientId] === "twilio") {
    const msg = text + "\n\n" + replies.map((r, i) => `${i + 1}. ${r}`).join("\n");
    await sendTwilioMessage(recipientId, msg);
    return;
  }
  try {
    const qr = replies.map((r) => ({
      content_type: "text",
      title: r.substring(0, 20),
      payload: r.toUpperCase().replace(/[^A-Z0-9]/g, "_").substring(0, 1000),
    }));
    await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: { id: recipientId }, message: { text, quick_replies: qr }, messaging_type: "RESPONSE" }),
    });
  } catch (e) { console.error("QR error:", e.message); }
}

// ─── HUMAN-LIKE SEND ─────────────────────────────────────────
async function sendWithTyping(recipientId, text) {
  await sendTypingOn(recipientId);
  await new Promise((r) => setTimeout(r, Math.min(900 + text.length * 25, 3000)));
  await sendMessage(recipientId, text);
  logConversation(recipientId, "bot", text); // fire-and-forget conversation log
}
async function sendQRWithTyping(recipientId, text, replies) {
  await sendTypingOn(recipientId);
  await new Promise((r) => setTimeout(r, Math.min(900 + text.length * 25, 3000)));
  await sendQuickReplies(recipientId, text, replies);
  logConversation(recipientId, "bot", text + " [options: " + replies.join(" | ") + "]");
}

// ─── HOOKS — Hinglish only (safe encoding, understood by all) ─
const HOOKS = [
  "Subah uthte hi naak band, din bhar sar bhaari... \uD83D\uDE2E\u200D\uD83D\uDCA8\n\nSinus ek baar pakad le, toh chhod nahi deta.\n\nSahi jagah aaye hain aap. \uD83C\uDF3F",
  "Spray use karte hain? Thodi der rahat — phir wahi band. \uD83D\uDE2E\u200D\uD83D\uDCA8\n\nYeh cycle kab tooti hai? Kabhi nahi — jab tak andar ki wajah treat na ho.\n\nSahi jagah aaye hain. \uD83C\uDF3F",
  "Naak band, smell nahi, din bhar bhaari, neend bhi kharab... \uD83D\uDE2E\u200D\uD83D\uDCA8\n\nSinus sirf naak ki nahi — poori zindagi ki dikkat hai.\n\nAap sahi jagah aaye hain. \uD83C\uDF3F",
  "Doctor ke paas gaye, dawai li, kuch dino theek raha — phir wahi wapas. \uD83D\uDE2E\u200D\uD83D\uDCA8\n\nIsliye hota hai kyunki sirf upar ki takleef theek hoti hai, andar ki wajah nahi.\n\nSahi jagah aaye hain. \uD83C\uDF3F",
  "Raat ko muh khol ke sote hain? Subah taaza nahi uthte? \uD83D\uDE2E\u200D\uD83D\uDCA8\n\nYeh sinus ki jaani-pehchani nishan hai — aur iski asli wajah har case mein alag hoti hai.\n\nSahi jagah aaye hain. \uD83C\uDF3F",
];

// ─── DURATION QUESTION — Hinglish only ───────────────────────
const DURATION_Q = {
  text: "Yeh takleef aapko kitne waqt se hai? \uD83C\uDF3F",
  replies: ["6 mahine se kum", "1-2 saal se", "3-4 saal se", "5-10 saal se", "10+ saal se"],
};

// ─── DURATION ACK — handles all 5 options ─────────────────────
function getDurationAck(text) {
  const tl = text.toLowerCase();
  const isMon = /mahine|mahina|month|kum|6 mah/.test(tl);
  if (isMon) return "Theek hai — abhi bahut sahi waqt hai shuru karne ka. \uD83C\uDF3F\nYeh stage mein results bahut fast milte hain.";
  const num = parseInt((text.match(/\d+/) || [])[0]) || 0;
  if (/10\+|10 saal|das saal/.test(tl) || num >= 10) return "10+ saal... \uD83D\uDE2E\u200D\uD83D\uDCA8\nItne waqt mein body adjust ho chuki hai — lekin andar ki wajah abhi bhi treat ho sakti hai.\nDhyan se dekhte hain aapka case.";
  if (/5|6|7|8|9/.test(text) || num >= 5) return `${num || 5}+ saal se hai — matlab andar kuch set ho chuka hai. \uD83D\uDE2E\u200D\uD83D\uDCA8\nSahi protocol se fark padta hai — pehle type samajhte hain.`;
  if (/3|4/.test(text) || num >= 3) return `${num || 3}-4 saal se chal raha hai — temporary nahi raha ab yeh. \uD83C\uDF3F\nSahi jagah aaye hain.`;
  return `${num || 1}-2 saal se hai — abhi bhi theek ho sakta hai completely. \uD83C\uDF3F\nPehle type identify karte hain.`;
}

// ─── SEVERITY QUESTION — after duration ──────────────────────
const SEVERITY_Q = {
  text: "Aur takleef ki intensity kaisi hai? \uD83C\uDF3F",
  replies: ["Halki — kaam chalaa leta hun", "Moderate — kaafi affect karta hai", "Severe — roz bahut mushkil hai"],
};

// ─── SYMPTOMS QUESTION — Hinglish only ───────────────────────
const SYMPTOMS_Q = {
  text: "Ab batao — kya kya takleef hai? Jo bhi feel hota hai. \uD83C\uDF3F",
  replies: ["Naak band rehti hai", "Spray use karta hun", "Smell nahi aati", "Ek taraf hamesha band (DNS)"],
};

// ─── REVEAL MESSAGES — Hinglish only ────────────────────────
const REVEAL = {
  allergic: "Samajh gaya — yeh *Allergic Sinus* hai. \uD83C\uDF3F\n\nEk test: bahar jao ya doosra room — takleef thodi different lage toh confirm.\n\nIs type mein sahi protocol se 4-5 din mein sneeze/triggers kum hone lagte hain.",
  congestive: "Samajh gaya — yeh *Congestive Sinus* hai. \uD83C\uDF3F\n\nEk test: sir aage jhukao 5 sec — mathe/galon mein bojh? Confirm hai.\n\n*Zaroori:* Dairy band karni padegi — yeh is type ka sabse bada dushman hai.",
  spray: "Samajh gaya — yeh *Spray Dependency* hai. \uD83C\uDF3F\n\nEk raat spray band karo — neend mushkil hogi? Yeh naak ki physical dependency hai.\n\n*Kabhi ek dum band mat karo* — dheere protocol se hi chhootega.",
  infective: "Samajh gaya — yeh *Infective/Heat Sinus* hai. \uD83C\uDF3F\n\nAntibiotic se thoda theek, phir wapas? Classic sign hai.\n\n*Zaroori:* Eucalyptus/camphor steam kabhi mat karo — is type mein worse karta hai.",
  polyp: "Samajh gaya — *Polyp/Blockage* hai. \uD83C\uDF3F\n\nDono taraf equally band? Laung paas laao — smell nahi aati? Confirm.\n\nKai logon ko surgery suggest hui thi — protocol se bina surgery sudhar aaya hai.",
  dns: "Samajh gaya — yeh *DNS (Deviated Nasal Septum)* lag raha hai. \uD83C\uDF3F\n\nEk side hamesha band, raat mein zyada problem? Yeh classic DNS sign hai.\n\nAyurveda mein DNS ke around ki inflammation aur congestion bilkul theek hoti hai — breathing improve hoti hai.",
};

// ─── PITCH MESSAGES — Hinglish only ─────────────────────────
const TYPE_NAMES = {
  allergic: "Allergic Sinus", congestive: "Congestive Sinus",
  spray: "Spray Dependency", infective: "Infective Sinus", polyp: "Polyp Sinus",
  dns: "DNS (Deviated Nasal Septum)",
};
function getPitch(type) {
  const tname = TYPE_NAMES[type] || "Congestive Sinus";
  return `Aapke *${tname}* ke liye khas 14-din program hai. \uD83C\uDF3F\n\n\uD83C\uDF31 *Rs.499* — Self-guided kit (WhatsApp support)\n\uD83C\uDF3F *Rs.1,299* — 14-Din Full Program _(sabse zyada liya jaata hai)_\n\u2705 Day 1 personally connect | roz WhatsApp check | agar takleef ho — usi din niyam badlega\n\nENT visit hi Rs.1,000-2,000 — yahan 14 din daily personal guidance sirf Rs.1,299. \uD83C\uDF3F`;
}

// ─── POST-PAYMENT EXPLANATION ────────────────────────────────
function getPostPaymentExplanation(sinusType, plan) {
  const days = plan === 1299 ? 21 : 14;
  const tname = TYPE_NAMES[sinusType] || "Congestive Sinus";
  return `Kaise kaam hoga — ${days} dinon mein \uD83C\uDF3F\n\nAapki takleef ki pehchaan ho chuki hai: *${tname}*\n\nIs type ke hisaab se aapki khas dinchrya banegi:\n\u2022 Subah 20 min + Raat 15 min\n\u2022 Har din ke saath kya sudhar hoga — pehle se tay rehta hai\n\u2022 Agar kisi din kuch alag lage — usi din niyam badlega\n\nSab kuch isi WhatsApp par hoga — koi app nahi, koi hospital nahi.\nEk Sinus Relief Specialist ${days} din aapke saath yahaan rahenge. \uD83C\uDF3F`;
}

// ─── UPSELL MESSAGE (all 3 variants via lang param) ──────────
function getUpsell(lang) {
  if (lang === "eng") {
    return "Quick note — \uD83C\uDF3F\n\nThe Rs.1,299 program includes *7 extra days FREE* -> total *21 days*, same specialist, same WhatsApp support.\n\nJust Rs.800 more for 50% extra time. For long-standing sinus issues, this extended period makes a real difference.\n\nInterested? Just type *upgrade* and I'll send the link. \uD83C\uDF3F";
  }
  if (lang === "dev") {
    // Use unicode escapes — no raw Devanagari in source code
    return "\u090F\u0915 \u092C\u093E\u0924 \u092C\u0924\u093E\u0924\u093E \u0939\u0942\u0901 \u2014 \uD83C\uDF3F\n\n\u20B91,299 \u0935\u093E\u0932\u0947 \u0915\u093E\u0930\u094D\u092F\u0915\u094D\u0930\u092E \u092E\u0947\u0902 *7 \u0926\u093F\u0928 \u092E\u0941\u092B\u094D\u0924* \u092E\u093F\u0932\u0924\u0947 \u0939\u0948\u0902 \u2192 \u0915\u0941\u0932 *21 \u0926\u093F\u0928*, \u0935\u0939\u0940 \u0935\u093F\u0936\u0947\u0937\u091C\u094D\u091E, \u0935\u0939\u0940 WhatsApp \u0938\u0939\u093E\u092F\u0924\u093E\u0964\n\n\u0938\u093F\u0930\u094D\u092B\u093C \u20B9800 \u091C\u093C\u094D\u092F\u093E\u0926\u093E \u092E\u0947\u0902 50% \u091C\u093C\u094D\u092F\u093E\u0926\u093E \u0938\u092E\u092F\u0964 \u0932\u0902\u092C\u0947 \u0938\u092E\u092F \u0938\u0947 \u092A\u0930\u0947\u0936\u093E\u0928 \u0932\u094B\u0917\u094B\u0902 \u0915\u094B \u092F\u0939 \u0905\u0924\u093F\u0930\u093F\u0915\u094D\u0924 \u0938\u092E\u092F \u092C\u0939\u0941\u0924 \u0915\u093E\u092E \u0906\u0924\u093E \u0939\u0948\u0964\n\n\u0938\u094B\u091A\u0928\u093E \u0939\u0948? \u092C\u0938 *upgrade* \u0932\u093F\u0916\u0947\u0902 \u2014 link \u092D\u0947\u091C \u0926\u0947\u0924\u093E \u0939\u0942\u0901\u0964 \uD83C\uDF3F";
  }
  // Default: Hinglish
  return "Ek baat batata hun — \uD83C\uDF3F\n\nRs.1,299 wale program mein *7 din bilkul free* milte hain -> total *21 din*, wahi specialist, wahi WhatsApp support.\n\nSirf Rs.800 zyada mein 50% zyada waqt. Jo log lambe waqt se pareshan hain, unhe yeh extra time bahut kaam aata hai.\n\nSochna hai? Bas *upgrade* likho — link bhej deta hun. \uD83C\uDF3F";
}

// ─── WEBSITE TRUST MENTIONS ──────────────────────────────────
// Context: "trust" = after diagnosis reveal | "confirm" = with payment link
function getWebsiteLine(context, lang) {
  if (context === "trust") {
    if (lang === "eng") return "Want to verify us or learn more about your sinus type? \uD83C\uDF3F\nayusomamherbals.com";
    if (lang === "dev") return "\u0939\u092E\u093E\u0930\u0947 \u092C\u093E\u0930\u0947 \u092E\u0947\u0902 \u091C\u093E\u0928\u0928\u093E \u091A\u093E\u0939\u0924\u0947 \u0939\u0948\u0902? \uD83C\uDF3F\nayusomamherbals.com";
    return "Hamare baare mein jaanna ho ya results dekhne ho? \uD83C\uDF3F\nayusomamherbals.com";
  }
  // context === "confirm" — shown alongside payment link
  if (lang === "eng") return "You can check our protocol & patient results here: ayusomamherbals.com \uD83C\uDF3F";
  if (lang === "dev") return "\u0939\u092E\u093E\u0930\u0947 \u092A\u094D\u0930\u094B\u091F\u094B\u0915\u0949\u0932 \u0914\u0930 \u0930\u093F\u091C\u0932\u094D\u091F\u094D\u0938: ayusomamherbals.com \uD83C\uDF3F";
  return "Hamare protocol aur real results dekhne ho: ayusomamherbals.com \uD83C\uDF3F";
}

// ─── SALESOM AI ──────────────────────────────────────────────
async function callSalesom(userMessage, userData, forceLang) {
  try {
    const sinusLabels = {
      allergic: "Vataja-Kaphaja (Allergic)", congestive: "Kaphaja (Congestive)",
      spray: "Aushadha Asakti (Spray Dependency)", infective: "Pittaja (Infective/Heat)", polyp: "Polyp/Blockage",
    };
    const lang = forceLang || userData.lastLang || "rom";
    const langInstruction =
      lang === "dev" ? "User ne Devanagari mein likha hai. SIRF Devanagari mein jawab do. Minimum English. protocol=niyam, symptoms=lakshan, day=din, routine=dinchrya" :
      lang === "eng" ? "User wrote in English. Reply in English only." :
      "User wrote in Hinglish/Roman Hindi. Reply in Hinglish (Roman Hindi).";

    const contextBlock = `
[CONTEXT]
- Sinus type: ${sinusLabels[userData.sinusType] || "Unknown"}
- Duration: ${userData.duration || "Not specified"}
- Severity: ${userData.severity || "Not specified"}
- Current state: ${userData.state}
- Selected plan: ${userData.selectedPlan ? "Rs." + userData.selectedPlan : "Not selected"}
- Post-pitch reply #: ${userData.postPitchReplies || 0}
[END CONTEXT]
LANGUAGE: ${langInstruction}
RULES: MAX 2-3 SHORT LINES. Under 60 words. No payment links. No diagnosis restart. No bullet lists. End with 1 soft question or warm close. Be like a caring knowledgeable friend.`;

    const history = (userData.history || []).slice(-8);
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 180,
      system: SALESOM_SYSTEM_PROMPT + "\n\n" + contextBlock,
      messages: [...history, { role: "user", content: userMessage }],
    });
    const reply = response.content[0].text;
    userData.history = [...history, { role: "user", content: userMessage }, { role: "assistant", content: reply }];
    return reply;
  } catch (err) {
    console.error("Salesom AI error:", err.message);
    return "Samajh gaya \uD83D\uDE4F Koi bhi sawaal ho — main yahan hun. Jab ready ho toh batao.";
  }
}

// ─── GOOGLE SHEET LOGGING ─────────────────────────────────────
async function logToSheet(senderId, name, message, stage, sinusType = "") {
  try {
    const chPlatform = userChannels[senderId] || "messenger";
    const platform = chPlatform === "twilio" ? "WhatsApp" : chPlatform === "instagram" ? "Instagram" : chPlatform === "website" ? "Website" : "Messenger";
    const params = new URLSearchParams({ platform, senderId, name: name || "Unknown", message: message.substring(0, 200), status: "\uD83D\uDFE1", stage, symptom: sinusType });
    await fetch(`${GAS_URL}?${params.toString()}`, { method: "GET" });
  } catch (e) { console.error("Sheet log error:", e.message); }
}

// ─── CONVERSATION LOGGING (permanent + in-memory) ─────────────
// Stores in conversationLog (fast, for dashboard) + Google Sheet (permanent)
async function logConversation(senderId, role, text) {
  // 1. Store in memory for dashboard (keep last 300 per user)
  if (!conversationLog[senderId]) conversationLog[senderId] = [];
  conversationLog[senderId].push({ role, text, ts: new Date().toISOString() });
  if (conversationLog[senderId].length > 300) conversationLog[senderId] = conversationLog[senderId].slice(-300);

  // 2. Fire-and-forget to Google Sheet (permanent)
  try {
    const params = new URLSearchParams({
      action: "conversation",
      senderId,
      role,
      message: text.substring(0, 500),
      ts: new Date().toISOString(),
    });
    fetch(`${GAS_URL}?${params.toString()}`, { method: "GET" }).catch(() => {});
  } catch (e) { /* silent */ }
}

// ─── MAIN MESSAGE HANDLER ─────────────────────────────────────
async function handleMessage(senderId, messageText, senderName) {
  const text = messageText.trim();
  const textLower = text.toLowerCase();

  if (!userState[senderId]) userState[senderId] = { state: "new", history: [] };
  const userData = userState[senderId];

  // ─── LOG EVERY INCOMING MESSAGE ──────────────────────────────
  logConversation(senderId, "user", text); // fire-and-forget

  // ─── MESSAGE LIMIT — redirect after 12 exchanges ─────────────
  userData.botReplies = (userData.botReplies || 0) + 1;
  if (userData.botReplies >= 12 && !["post_payment", "human", "done", "committing"].includes(userData.state)) {
    await sendWithTyping(senderId, "Aapka case thoda detail mein samajhna chahta hun. \uD83C\uDF3F\n\nHamare Sinus Relief Expert se seedha baat karo: \uD83D\uDCF1 *WhatsApp 85951 60713*\n\nYa wait karo — expert thodi der mein yahan reply karega.");
    userData.state = "human";
    return;
  }

  // ─── LANGUAGE DETECTION — BI-DIRECTIONAL PER MESSAGE ────────
  const lang = detectLang(text);
  // For ambiguous short messages (ok, yes, haan etc.) — keep previous lang
  const isAmbiguous = text.length < 6 || /^(ok|yes|haan|ha|no|nahi|theek|sure|done|hm|hmm)$/i.test(text.trim());
  if (!isAmbiguous) userData.lastLang = lang;
  const sc = userData.lastLang || "rom";

  if (userData.state === "human") return;

  // Admin reset
  if (text.startsWith("BOT_ON_")) {
    const targetId = text.replace("BOT_ON_", "").trim();
    if (userState[targetId]) { userState[targetId].state = "pitched"; await sendMessage(senderId, "Bot reactivated for " + targetId); }
    return;
  }

  // ─── PAYMENT CONFIRMED ───────────────────────────────────────
  if (/payment|paid|pay kar|pay kiya|bhej diya|transfer|\bdone\b/.test(textLower)) {
    userData.state = "post_payment";
    userData.postPaymentReplies = 0;
    const days = userData.selectedPlan === 1299 ? 21 : 14;
    await sendWithTyping(senderId, `Payment pakki ho gayi! \uD83C\uDF3F\n\nAapke *${days}-Din Nasal Restoration* ki shuruaat hone waali hai.\n\nMain jald hi WhatsApp pe personally connect karunga — 85951 60713\n\nAyusomam mein aapka swagat hai! \uD83C\uDF3F`);
    await logToSheet(senderId, senderName, "Payment confirmed", "PAID", userData.sinusType);
    return;
  }

  // ─── POST-PAYMENT SMART CONVERSATIONS ───────────────────────
  if (userData.state === "post_payment") {
    userData.postPaymentReplies = (userData.postPaymentReplies || 0) + 1;
    const treatmentQ = /kaise hoga|kya hoga|kaise kaam|how.*work|ilaj|treatment|plan|explain|batao|samjhao|kya milega/.test(textLower);
    const upgradeQ = /upgrade|1299|full|poora|21 din|zyada din/.test(textLower);
    const linkRepeat = /link|payment link/.test(textLower);

    if (upgradeQ && userData.selectedPlan === 499) {
      await sendWithTyping(senderId, `Badhiya! \uD83C\uDF3F\n\n*Rs.1,299 — 21-Din Full Program*\n\uD83C\uDF3F ${PAYMENT_1299}\n\nPayment ke baad yahan "done" likhna — personally connect honge.`);
      return;
    }
    if (linkRepeat) {
      await sendWithTyping(senderId, "Payment link upar bhej diya tha. \uD83C\uDF3F\nPayment ke baad yahan \"done\" likhna.");
      return;
    }
    if (treatmentQ) {
      await sendWithTyping(senderId, getPostPaymentExplanation(userData.sinusType, userData.selectedPlan));
      if (userData.selectedPlan === 499) {
        await new Promise((r) => setTimeout(r, 900));
        await sendWithTyping(senderId, getUpsell(sc));
      }
      return;
    }
    if (userData.postPaymentReplies > 3) {
      await sendWithTyping(senderId, "Tumhara sawaal hamare Sinus Relief Specialist tak pahuncha diya hai. \uD83C\uDF3F\nSeedha WhatsApp karo: \uD83D\uDCF1 *85951 60713*");
      userData.state = "human";
      return;
    }
    const aiReply = await callSalesom(text, userData, sc);
    await sendWithTyping(senderId, aiReply);
    if (userData.selectedPlan === 499 && userData.postPaymentReplies === 2) {
      await new Promise((r) => setTimeout(r, 700));
      await sendWithTyping(senderId, getUpsell(sc));
    }
    return;
  }

  // ─── SEQUENTIAL FLOW ─────────────────────────────────────────
  if (userData.state === "new") {
    const idx = Math.floor(Math.random() * HOOKS.length);
    userData.state = "asked_duration";
    await sendWithTyping(senderId, HOOKS[idx]);
    await new Promise((r) => setTimeout(r, 900));
    await sendQRWithTyping(senderId, DURATION_Q.text, DURATION_Q.replies);
    await logToSheet(senderId, senderName, "Hook sent", "HOOK", "");
    return;
  }

  // hook_sent — legacy fallback for users mid-flow
  if (userData.state === "hook_sent") {
    userData.state = "asked_duration";
    await sendQRWithTyping(senderId, DURATION_Q.text, DURATION_Q.replies);
    return;
  }

  if (userData.state === "asked_duration") {
    userData.duration = text;
    userData.state = "asked_severity";
    await sendWithTyping(senderId, getDurationAck(text));
    await new Promise((r) => setTimeout(r, 800));
    await sendQRWithTyping(senderId, SEVERITY_Q.text, SEVERITY_Q.replies);
    await logToSheet(senderId, senderName, "Duration: " + text, "DURATION", "");
    return;
  }

  if (userData.state === "asked_severity") {
    userData.severity = text;
    userData.state = "asked_symptoms";
    await sendQRWithTyping(senderId, SYMPTOMS_Q.text, SYMPTOMS_Q.replies);
    return;
  }

  if (userData.state === "asked_symptoms") {
    userData.symptoms = text;
    const sinusType = detectSinusType(text);
    userData.sinusType = sinusType;
    userData.state = "revealed";
    userData.postPitchReplies = 0;
    userData.history = [];
    await sendWithTyping(senderId, "Dekh rahe hain... \uD83C\uDF3F");
    await new Promise((r) => setTimeout(r, 700));
    await sendWithTyping(senderId, REVEAL[sinusType] || REVEAL["congestive"]);
    await new Promise((r) => setTimeout(r, 600));
    await sendWithTyping(senderId, getWebsiteLine("trust", sc));
    await logToSheet(senderId, senderName, "Symptoms: " + text, "REVEALED", sinusType);
    return;
  }

  if (userData.state === "revealed") {
    userData.state = "pitched";
    await sendWithTyping(senderId, getPitch(userData.sinusType));
    await new Promise((r) => setTimeout(r, 700));
    await sendQRWithTyping(senderId, "Kaunsa option sahi lagta hai? \uD83C\uDF3F", ["Full Program (Rs.1,299)", "Starter Kit (Rs.499)", "Pehle sawaal hai"]);
    await logToSheet(senderId, senderName, "Pitched: " + userData.sinusType, "PITCHED", userData.sinusType);
    return;
  }

  // ─── PITCHED — COMMIT BEFORE PAYMENT LINK ────────────────────
  if (userData.state === "pitched") {
    if (userData.postPitchReplies >= 3) {
      await sendWithTyping(senderId, "Aapka case expert tak pahuncha diya hai. \uD83C\uDF3F\nSeedha WhatsApp karo: \uD83D\uDCF1 *85951 60713*");
      userData.state = "human";
      return;
    }

    // Payment link ONLY when user clearly shows interest/intent — not by default
    const userSaidYes = /\bhaan\b|\bha\b|yes\b|theek hai|ok\b|okay\b|shuru|karna hai|chahta|chahti|le leta|le lungi|lena hai|interested|1299|499|full program|starter kit|bhejo|link bhejo|link chahiye|lena chahta|lena chahti/.test(textLower);

    if (userSaidYes) {
      const wants1299 = /1299|full program|full|poora/.test(textLower);
      const wants499 = /499|starter|chota|basic/.test(textLower);
      if (wants1299) userData.selectedPlan = 1299;
      else if (wants499) userData.selectedPlan = 499;

      let commitMsg;
      if (userData.selectedPlan === 1299)
        commitMsg = "Bahut acha! \uD83C\uDF3F\n\n*Rs.1,299 — 14-Din Nasal Restoration* — yahi lena hai?\n\nEk baar *haan* bol do — phir payment link bhejta hun.";
      else if (userData.selectedPlan === 499)
        commitMsg = "Theek hai! \uD83C\uDF3F\n\n*Rs.499 Starter Kit* — yahi lena hai?\n\nEk baar *haan* bol do — phir link bhejta hun.";
      else
        commitMsg = "Bahut acha kadam! \uD83C\uDF3F\n\nKaunsa option lena hai — *Rs.499 Starter* ya *Rs.1,299 Full Program*?";

      userData.state = "committing";
      await sendWithTyping(senderId, commitMsg);
      return;
    }

    userData.postPitchReplies = (userData.postPitchReplies || 0) + 1;
    const aiReply = await callSalesom(text, userData, sc);
    await sendWithTyping(senderId, aiReply);
    if (userData.postPitchReplies < 2) {
      await new Promise((r) => setTimeout(r, 600));
      await sendQRWithTyping(senderId, "\uD83C\uDF3F", ["Haan, shuru karna hai", "Ek aur sawaal hai", "Sochna hai thoda"]);
    } else {
      await sendWithTyping(senderId, "Tumhara sawaal hamare *Sinus Relief Specialist* tak pahuncha diya hai. \uD83C\uDF3F\n\nYahan ruko — thodi der mein reply aayega.\n\nYa seedha WhatsApp karo: \uD83D\uDCF1 *85951 60713*");
      userData.state = "human";
    }
    return;
  }

  // ─── COMMITTING — SEND LINK ONLY AFTER CONFIRM ───────────────
  if (userData.state === "committing") {
    const confirmed = /haan|ha |yes|theek|ok\b|okay|bilkul|zaroor|confirm/.test(textLower);
    const wants1299 = /1299|full|poora/.test(textLower);
    const wants499 = /499|starter/.test(textLower);
    if (wants1299) userData.selectedPlan = 1299;
    if (wants499) userData.selectedPlan = 499;

    if (confirmed || wants1299 || wants499) {
      const websiteLine = getWebsiteLine("confirm", sc);
      const linkMsg = userData.selectedPlan === 499
        ? `Rs.499 Starter Kit\n\nPayment link:\n\uD83C\uDF31 ${PAYMENT_499}\n\n${websiteLine}\n\nPayment ke baad yahan *done* likhna — agla step batata hun. \uD83C\uDF3F`
        : `Rs.1,299 — 14-Din Nasal Restoration\n\nPayment link:\n\uD83C\uDF3F ${PAYMENT_1299}\n\n${websiteLine}\n\nPayment ke baad yahan *done* likhna — personally connect honge. \uD83C\uDF3F`;
      userData.state = "pitched";
      userData.postPitchReplies = 0;
      await sendWithTyping(senderId, linkMsg);
      await logToSheet(senderId, senderName, "Link sent: " + userData.selectedPlan, "LINK_SENT", userData.sinusType);
      return;
    }
    userData.state = "pitched";
    await handleMessage(senderId, messageText, senderName);
    return;
  }

  if (userData.state === "done") {
    await sendWithTyping(senderId, "Program chal raha hai! \uD83C\uDF3F Koi sawaal ho toh WhatsApp pe poochho — 85951 60713");
    return;
  }

  // Reset and restart
  userData.state = "new";
  userData.history = [];
  await handleMessage(senderId, messageText, senderName);
}

// ─── PAGE HUMAN TAKEOVER ──────────────────────────────────────
async function handlePageMessage(senderId, sendingPageId) {
  if (sendingPageId && userState[senderId]) {
    userState[senderId].state = "human";
    console.log("Human takeover: " + senderId);
  }
}

// ─── WEBHOOK ROUTES ───────────────────────────────────────────
app.get("/webhook", (req, res) => {
  if (req.query["hub.verify_token"] === VERIFY_TOKEN) res.send(req.query["hub.challenge"]);
  else res.sendStatus(403);
});

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    const body = req.body;
    const isInstagram = body.object === "instagram";
    if (!isInstagram && body.object !== "page") return;
    for (const entry of body.entry || []) {
      for (const event of entry.messaging || []) {
        const senderId = event.sender?.id;
        if (!senderId) continue;
        if (event.timestamp && Date.now() - event.timestamp > 5 * 60 * 1000) continue;
        if (event.message?.mid) {
          if (processedMessages.has(event.message.mid)) continue;
          processedMessages.add(event.message.mid);
        }
        if (!isInstagram && event.sender?.id === entry.id) { await handlePageMessage(event.recipient?.id, event.sender?.id); continue; }
        if (event.message?.text) {
          if (isInstagram) userChannels[senderId] = "instagram";
          await handleMessage(senderId, event.message.text, "User");
        }
      }
    }
  } catch (err) { console.error("Webhook error:", err); }
});

app.post("/twilio", async (req, res) => {
  res.set("Content-Type", "text/xml");
  res.send("<Response></Response>");
  try {
    const from = req.body.From;
    const text = req.body.Body;
    if (!from || !text) return;
    const senderId = from.replace("whatsapp:", "");
    userChannels[senderId] = "twilio";
    console.log("Twilio from " + senderId + ": " + text.substring(0, 50));
    await handleMessage(senderId, text, "User");
  } catch (err) { console.error("Twilio webhook error:", err); }
});

// ─── ADMIN DASHBOARD HTML ─────────────────────────────────────
const ADMIN_HTML = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SALESOM Dashboard \uD83C\uDF3F</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f2f5;height:100vh;display:flex;flex-direction:column;overflow:hidden;}
.header{background:#075E54;color:white;padding:10px 20px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;}
.header h1{font-size:17px;font-weight:600;}
.header .sub{font-size:11px;opacity:.8;margin-top:1px;}
#statsBar{font-size:12px;opacity:.9;text-align:right;}
.main{display:flex;flex:1;overflow:hidden;}
.left{width:340px;background:white;border-right:1px solid #e9edef;display:flex;flex-direction:column;flex-shrink:0;}
.search-wrap{padding:8px 10px;background:#f0f2f5;}
.search-wrap input{width:100%;padding:7px 12px;border-radius:8px;border:none;background:white;font-size:13px;outline:none;}
.ulist{flex:1;overflow-y:auto;}
.uitem{display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid #f5f5f5;cursor:pointer;}
.uitem:hover,.uitem.active{background:#f0f2f5;}
.avatar{width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:19px;flex-shrink:0;}
.uinfo{flex:1;min-width:0;}
.uname{font-size:14px;font-weight:500;color:#111;display:flex;align-items:center;gap:5px;flex-wrap:wrap;}
.ulast{font-size:12px;color:#667781;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;}
.umeta{display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex-shrink:0;}
.utime{font-size:10px;color:#999;}
.badge{font-size:10px;font-weight:600;padding:2px 5px;border-radius:8px;}
.s-new{background:#e3f2fd;color:#1565c0;}
.s-revealed{background:#f3e5f5;color:#6a1b9a;}
.s-pitched,.s-committing{background:#fff3e0;color:#e65100;}
.s-post_payment{background:#e8f5e9;color:#2e7d32;}
.s-human{background:#fce4ec;color:#c62828;}
.s-hook_sent,.s-asked_duration,.s-asked_symptoms{background:#e8f4f8;color:#0277bd;}
.ch-wa{background:#dcf8c6;color:#128C7E;font-size:9px;}
.ch-fb{background:#e8eaf6;color:#3949ab;font-size:9px;}
.ch-ig{background:#fce4ec;color:#ad1457;font-size:9px;}
.ch-web{background:#fff3e0;color:#e65100;font-size:9px;}
.right{flex:1;display:flex;flex-direction:column;background:#efeae2;min-width:0;}
.chat-header{background:white;padding:10px 16px;display:flex;align-items:center;gap:10px;border-bottom:1px solid #e9edef;flex-shrink:0;}
.chat-av{width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0;}
.chat-info h2{font-size:14px;font-weight:600;}
.chat-info p{font-size:12px;color:#667781;}
.msgs{flex:1;overflow-y:auto;padding:12px 16px;display:flex;flex-direction:column;gap:5px;}
.msg{max-width:65%;padding:7px 11px;border-radius:8px;font-size:13px;line-height:1.45;word-break:break-word;}
.msg.user{background:white;align-self:flex-start;border-radius:0 8px 8px 8px;}
.msg.bot{background:#dcf8c6;align-self:flex-end;border-radius:8px 0 8px 8px;}
.msg.admin{background:#e3f2fd;align-self:flex-end;border-radius:8px 0 8px 8px;border:1px solid #90caf9;}
.msg-time{font-size:10px;color:#999;margin-top:3px;text-align:right;}
.empty{flex:1;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px;color:#999;}
.empty .ico{font-size:56px;opacity:.25;}
.inp-area{background:#f0f2f5;padding:10px 14px;display:flex;align-items:flex-end;gap:10px;flex-shrink:0;}
.inp-area textarea{flex:1;padding:9px 13px;border-radius:20px;border:none;background:white;font-size:13px;outline:none;resize:none;max-height:80px;font-family:inherit;line-height:1.4;}
.send-btn{width:44px;height:44px;border-radius:50%;background:#075E54;border:none;color:white;font-size:18px;cursor:pointer;flex-shrink:0;}
.send-btn:hover{background:#064e45;}
.tkbtn{margin-left:auto;padding:5px 12px;border-radius:12px;border:none;font-size:12px;font-weight:600;cursor:pointer;}
.tkbtn.human{background:#ffc107;color:#000;}
.tkbtn.bot{background:#4caf50;color:white;}
.nobg{background:#efeae2!important;padding:0!important;border-radius:0!important;}
</style></head><body>
<div class="header">
  <div><div class="uname" style="font-size:17px;font-weight:600;color:white;">\uD83C\uDF3F SALESOM Dashboard</div><div class="sub">Ayusomam Herbals \u2014 Live Conversations</div></div>
  <div id="statsBar">Loading...</div>
</div>
<div class="main">
  <div class="left">
    <div class="search-wrap"><input type="text" id="search" placeholder="\uD83D\uDD0D Search..." oninput="render()"></div>
    <div class="ulist" id="ulist"></div>
  </div>
  <div class="right" id="right">
    <div class="empty"><div class="ico">\uD83D\uDCAC</div><div>Koi conversation select karein</div></div>
  </div>
</div>
<script>
let users=[],msgs={},sel=null;
const SL={new:'New',hook_sent:'Hook',asked_duration:'Duration',asked_symptoms:'Symptoms',revealed:'Revealed',pitched:'Pitched',committing:'Commit',post_payment:'Paid \u2705',human:'Human \uD83D\uDC64',done:'Done'};
function sc(s){const m={new:'s-new',hook_sent:'s-hook_sent',asked_duration:'s-asked_duration',asked_symptoms:'s-asked_symptoms',revealed:'s-revealed',pitched:'s-pitched',committing:'s-committing',post_payment:'s-post_payment',human:'s-human',done:'s-new'};return m[s]||'s-new';}
function ta(ts){if(!ts)return'';const d=Date.now()-new Date(ts).getTime(),m=Math.floor(d/60000);if(m<1)return'Abhi';if(m<60)return m+'m';const h=Math.floor(m/60);if(h<24)return h+'h';return Math.floor(h/24)+'d';}
async function load(){
  try{
    const r=await fetch('/admin/api/users');users=await r.json();
    users.sort((a,b)=>{const ta=a.lastMessage?new Date(a.lastMessage.ts):0,tb=b.lastMessage?new Date(b.lastMessage.ts):0;return tb-ta;});
    render();stats();
    if(sel)loadMsgs(sel);
  }catch(e){}
}
function stats(){
  const paid=users.filter(u=>u.state==='post_payment').length;
  const pitched=users.filter(u=>u.state==='pitched'||u.state==='committing').length;
  const active=users.filter(u=>!['new','human','done'].includes(u.state)).length;
  document.getElementById('statsBar').innerHTML='\uD83D\uDC65 '+users.length+' total &nbsp;\u2502&nbsp; \uD83D\uDD25 '+active+' active &nbsp;\u2502&nbsp; \uD83D\uDCB0 '+pitched+' pitched &nbsp;\u2502&nbsp; \u2705 '+paid+' paid';
}
function render(){
  const q=document.getElementById('search').value.toLowerCase();
  const fl=users.filter(u=>!q||u.id.toLowerCase().includes(q));
  document.getElementById('ulist').innerHTML=fl.map(u=>{
    const lm=u.lastMessage;
    const pre=lm?(lm.role==='user'?'\uD83D\uDDE3 ':'\uD83E\uDD16 ')+lm.text.replace(/\\n/g,' ').substring(0,38):'No messages';
    const av=u.channel==='twilio'?'#128C7E':u.channel==='instagram'?'#833AB4':u.channel==='website'?'#FF5722':'#3b5998';
    const ico=u.channel==='twilio'?'\uD83D\uDCF1':u.channel==='instagram'?'\uD83D\uDCF8':u.channel==='website'?'\uD83C\uDF10':'\uD83D\uDCAC';
    const ch=u.channel==='twilio'?'<span class="badge ch-wa">WA</span>':u.channel==='instagram'?'<span class="badge ch-ig">IG</span>':u.channel==='website'?'<span class="badge ch-web">WEB</span>':'<span class="badge ch-fb">FB</span>';
    return '<div class="uitem'+(sel===u.id?' active':'')+'" data-uid="'+u.id+'" onclick="pick(this.dataset.uid)">'+
      '<div class="avatar" style="background:'+av+'">'+ico+'</div>'+
      '<div class="uinfo">'+
        '<div class="uname">'+u.id.substring(0,15)+(u.id.length>15?'...:':'')+' <span class="badge '+sc(u.state)+'">'+(SL[u.state]||u.state)+'</span></div>'+
        '<div class="ulast">'+pre+'</div>'+
      '</div>'+
      '<div class="umeta"><div class="utime">'+ta(lm&&lm.ts)+'</div>'+ch+'</div>'+
    '</div>';
  }).join('');
}
async function pick(id){sel=id;render();await loadMsgs(id);}
async function loadMsgs(id){
  try{const r=await fetch('/admin/api/messages/'+encodeURIComponent(id));msgs[id]=await r.json();drawChat(id);}catch(e){}
}
function drawChat(id){
  const u=users.find(x=>x.id===id);if(!u)return;
  const m=msgs[id]||[];
  const av=u.channel==='twilio'?'#128C7E':u.channel==='instagram'?'#833AB4':u.channel==='website'?'#FF5722':'#3b5998';
  const ico=u.channel==='twilio'?'\uD83D\uDCF1':u.channel==='instagram'?'\uD83D\uDCF8':u.channel==='website'?'\uD83C\uDF10':'\uD83D\uDCAC';
  const info=[u.sinusType?'\uD83C\uDF3F '+u.sinusType:'',u.duration?'\u23F1 '+u.duration:'',u.selectedPlan?'\uD83D\uDCB0 Rs.'+u.selectedPlan:''].filter(Boolean).join(' \u00B7 ')||SL[u.state]||u.state;
  const isFree=u.state!=='human';
  document.getElementById('right').innerHTML=
    '<div class="chat-header">'+
      '<div class="chat-av" style="background:'+av+'">'+ico+'</div>'+
      '<div class="chat-info"><h2>'+id+'</h2><p>'+info+'</p></div>'+
      '<button class="tkbtn '+(isFree?'human':'bot')+'" data-uid="'+id+'" onclick="toggle(this.dataset.uid)">'+
        (isFree?'\uD83D\uDC64 Human ON':'\uD83E\uDD16 Bot ON')+
      '</button>'+
    '</div>'+
    '<div class="msgs" id="ma">'+
      (m.length?m.map(x=>
        '<div class="msg '+x.role+'">'+x.text.replace(/\\n/g,'<br>').replace(/\\*(.*?)\\*/g,'<b>$1</b>')+
        '<div class="msg-time">'+new Date(x.ts).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})+'</div></div>'
      ).join(''):'<div style="text-align:center;color:#999;padding:20px">No messages yet</div>')+
    '</div>'+
    '<div id="ch-notice" style="background:white;border-top:1px solid #e9edef;padding:5px 14px;font-size:11px;color:#667781;display:flex;align-items:center;gap:5px">'+
      (u.channel==='twilio'?'\uD83D\uDCF1 Reply jayega: <b>WhatsApp</b>':u.channel==='instagram'?'\uD83D\uDCF8 Reply jayega: <b>Instagram</b>':u.channel==='website'?'\uD83C\uDF10 <b>Website lead</b> \u2014 message dashboard mein save hoga only (user ko nahi jayega)':'\uD83D\uDCAC Reply jayega: <b>Messenger</b>')+
    '</div>'+
    '<div class="inp-area">'+
      '<textarea id="mi" placeholder="Message likhein... (Enter = send)" rows="1" onkeydown="hk(event)"></textarea>'+
      '<button class="send-btn" onclick="send()">\u27A4</button>'+
    '</div>';
  const ma=document.getElementById('ma');if(ma)ma.scrollTop=ma.scrollHeight;
  document.getElementById('mi')&&document.getElementById('mi').focus();
}
async function send(){
  const inp=document.getElementById('mi');
  const t=inp&&inp.value.trim();
  if(!t||!sel)return;
  inp.value='';
  try{
    await fetch('/admin/api/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:sel,text:t})});
    await loadMsgs(sel);
  }catch(e){alert('Send failed');}
}
async function toggle(id){
  await fetch('/admin/api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:id})});
  await load();drawChat(id);
}
function hk(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}}
load();setInterval(load,5000);
</script></body></html>`;

// ─── ADMIN API ROUTES ─────────────────────────────────────────
app.get("/admin", (req, res) => res.send(ADMIN_HTML));

// List all users with their state, last message etc.
app.get("/admin/api/users", (req, res) => {
  const list = Object.entries(userState).map(([id, d]) => ({
    id,
    state: d.state,
    sinusType: d.sinusType || null,
    duration: d.duration || null,
    selectedPlan: d.selectedPlan || null,
    lastLang: d.lastLang || "rom",
    channel: userChannels[id] || "messenger",
    messageCount: (conversationLog[id] || []).length,
    lastMessage: (conversationLog[id] || []).slice(-1)[0] || null,
  }));
  res.json(list);
});

// Full conversation for one user
app.get("/admin/api/messages/:userId", (req, res) => {
  res.json(conversationLog[req.params.userId] || []);
});

// Send a message from dashboard (human operator)
app.post("/admin/api/send", async (req, res) => {
  const { userId, text } = req.body || {};
  if (!userId || !text) return res.status(400).json({ error: "userId and text required" });
  try {
    const ch = userChannels[userId] || "messenger";
    await sendMessage(userId, text);
    logConversation(userId, "admin", text);
    const chName = ch === "twilio" ? "WhatsApp" : ch === "instagram" ? "Instagram" : ch === "website" ? "Website (saved only)" : "Messenger";
    res.json({ ok: true, channel: ch, channelName: chName });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Toggle human/bot mode for a user
app.post("/admin/api/state", (req, res) => {
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: "userId required" });
  if (!userState[userId]) userState[userId] = { state: "new", history: [] };
  userState[userId].state = userState[userId].state === "human" ? "pitched" : "human";
  res.json({ ok: true, state: userState[userId].state });
});

app.get("/", (req, res) => res.send("Ayusomam Bot v3.2 — Website trust integration deployed \uD83C\uDF3F"));
// ─── LOAD HISTORY FROM SHEET ON STARTUP ──────────────────────
// Fetches all rows from "Conversations" tab and populates conversationLog
// So dashboard shows historical data even after a server restart
async function loadHistoryFromSheet() {
  try {
    console.log("Loading conversation history from Google Sheet...");

    // 1. Load recent conversation messages (Conversations sheet)
    try {
      const params = new URLSearchParams({ action: "getConversations" });
      const res = await fetch(`${GAS_URL}?${params.toString()}`);
      const rows = await res.json();
      if (Array.isArray(rows) && rows.length > 0) {
        for (const row of rows) {
          if (!row.senderId || !row.text) continue;
          if (!conversationLog[row.senderId]) conversationLog[row.senderId] = [];
          conversationLog[row.senderId].push({ role: row.role || "user", text: row.text, ts: row.ts });
          if (!userState[row.senderId]) userState[row.senderId] = { state: "done", history: [] };
        }
        console.log(`Conversations loaded: ${rows.length} messages`);
      } else {
        console.log("No conversation messages found");
      }
    } catch (e1) { console.error("getConversations failed:", e1.message); }

    // 2. Load old Leads sheet data (purana data — old chats)
    try {
      const leadsParams = new URLSearchParams({ action: "getLeads" });
      const leadsRes = await fetch(`${GAS_URL}?${leadsParams.toString()}`);
      const leads = await leadsRes.json();
      if (Array.isArray(leads) && leads.length > 0) {
        for (const lead of leads) {
          if (!lead.senderId) continue;
          if (!conversationLog[lead.senderId]) conversationLog[lead.senderId] = [];
          const alreadyHasLead = conversationLog[lead.senderId].some(m => m._isLead);
          if (!alreadyHasLead) {
            if (lead.message) {
              conversationLog[lead.senderId].unshift({ role: "user", text: lead.message, ts: lead.ts });
            }
            conversationLog[lead.senderId].unshift({
              role: "bot",
              text: `\uD83D\uDCCB Purana Lead — Naam: ${lead.name || "?"} | Symptom: ${lead.symptom || "?"} | Temperature: ${lead.temperature || "?"} | Stage: ${lead.stage || "?"}`,
              ts: lead.ts,
              _isLead: true
            });
          }
          if (!userState[lead.senderId]) {
            userState[lead.senderId] = { state: lead.stage || "done", history: [], name: lead.name, symptom: lead.symptom, temperature: lead.temperature, sinusType: lead.symptom };
          } else {
            if (!userState[lead.senderId].name) userState[lead.senderId].name = lead.name;
            if (!userState[lead.senderId].symptom) userState[lead.senderId].symptom = lead.symptom;
            if (!userState[lead.senderId].temperature) userState[lead.senderId].temperature = lead.temperature;
          }
          // Set channel based on platform column in Leads sheet
          if (!userChannels[lead.senderId]) {
            const platformLower = (lead.platform || "").toLowerCase();
            if (platformLower.includes("whatsapp") || platformLower.includes("twilio")) userChannels[lead.senderId] = "twilio";
            else if (platformLower.includes("instagram")) userChannels[lead.senderId] = "instagram";
            else if (platformLower.includes("website") || platformLower.includes("web")) userChannels[lead.senderId] = "website";
            else userChannels[lead.senderId] = "messenger";
          }
        }
        console.log(`Old leads loaded: ${leads.length} leads`);
      } else {
        console.log("No old leads found");
      }
    } catch (e2) { console.error("getLeads failed:", e2.message); }

    // Sort each user's messages chronologically
    for (const id of Object.keys(conversationLog)) {
      conversationLog[id].sort((a, b) => new Date(a.ts) - new Date(b.ts));
    }
    const users = Object.keys(conversationLog).length;
    console.log(`Dashboard ready: ${users} total users loaded`);
  } catch (e) {
    console.error("loadHistoryFromSheet failed:", e.message);
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Ayusomam Bot v3.2 running on port " + PORT);
  loadHistoryFromSheet(); // Load historical conversations into dashboard
});
