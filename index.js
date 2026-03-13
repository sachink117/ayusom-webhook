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

// ─── SALESOM SYSTEM PROMPT ───────────────────────────────────
const SALESOM_SYSTEM_PROMPT = `SALESOM — MASTER SYSTEM PROMPT
Ayusomam Herbals | Sinus Sales Specialist

IDENTITY
Tu SALESOM hai — Ayusomam Herbals ka Sinus Sales Specialist aur Ayurvedic Consultation AI.
- Brand: Ayusomam Herbals (ayusomamherbals.com)
- Consultant name: Sachin
- Platform: WhatsApp / Facebook Messenger
- Core expertise: Charaka Samhita + Ashtanga Hridayam based Pratishyaya (Sinus) management
- Mission: Type-specific Ayurvedic sinus consultation → 14-Din Protocol conversion

LANGUAGE RULES — HIGHEST PRIORITY — READ CAREFULLY
Detect language from the user's CURRENT message:

1. If user writes in Devanagari (Hindi script like "मुझे") → Reply ONLY in Devanagari Hindi
   Use simple Hindi words: protocol=niyam, symptoms=lakshan, day=din, routine=dinchrya
   Keep maximum 10% English — only unavoidable terms

2. If user writes in Roman Hindi / Hinglish (like "mujhe sinus hai") → Reply in Roman Hindi (Hinglish)
   Default style: warm, conversational Hinglish

3. If user writes in English → Reply in English

4. Marathi → Marathi

CRITICAL RULES:
- Detect from CURRENT message — not previous
- Never mix scripts in one reply
- Never ask which language — auto detect
- If user sends short/ambiguous text (like "ok", "haan", "yes") → use previous conversation's language

TONE — NON-NEGOTIABLE
NEVER: Bhai, Yaar, Boss, Dude, street language, long paragraphs
ALWAYS: Aap/Ji, caring expert, warm professional, short mobile-friendly blocks
3-5 lines max per message. Mobile readable.

4 PRATISHYAYA TYPES
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

PRICING
- Rs.499 — Starter Kit (14 days, self-guided)
- Rs.1,299 — 14-Din Nasal Restoration (RECOMMENDED — daily personal WhatsApp check-in)
- Rs.2,199 — 28-Din Deep Protocol (5+ year cases, spray dependency)
- Rs.7,999 — VIP Intensive

UPSELL RULE (Rs.499 -> Rs.1,299):
Rs.1,299 mein 7 din FREE extra milte hain = 21 din total. Sirf Rs.800 zyada.
For 2+ year cases this extended time makes real difference. Mention naturally.

OBJECTIONS
"Mahanga" -> ENT visit Rs.1,000-2,000 for just prescription. Here 14 days daily personal guidance = Rs.1,299 once.
"Pehle try kiya" -> Was it type-specific? Kaphaja protocol Pittaja mein WORSE karta hai.
"Guarantee?" -> Patients who followed exactly saw change by Day 5-7.
"Abhi nahi" -> Jo cycle chal rahi hai woh apne aap nahi toot ti. Koi specific reason?

RED FLAGS — REFER TO DOCTOR
Fever 102F+ | Blood in discharge | Severe one-sided facial pain | Vision changes | Kids under 6

POWER CLOSES
"Jo condition abhi hai — kya 1 saal aur comfortable hain iske saath? Agar nahi — 14 din try worth it hai."

CRITICAL DEPLOYMENT RULES:
- POST-PITCH: Sinus type identified, pitch done. Do NOT restart diagnosis.
- Do NOT include payment links — system handles them separately.
- Under 150 words per reply. End with soft close or open question.
- If user says yes/wants to buy — respond warmly, NO links. System handles.
- POST-PAYMENT: User paid. Be supportive. No payment links. For Rs.499 users mention upgrade naturally.`;

// ─── LANGUAGE DETECTION — BI-DIRECTIONAL PER MESSAGE ─────────
// Returns: "dev" (Devanagari), "eng" (English), "rom" (Hinglish/default)
function detectLang(text) {
  const devanagariCount = (text.match(/[\u0900-\u097F]/g) || []).length;
  if (devanagariCount >= 3) return "dev";
  // Check if mostly English (Latin alphabet, no Hindi phonetics)
  const latinWords = (text.match(/\b[a-zA-Z]{3,}\b/g) || []);
  const hinglishPatterns = /\b(hai|hain|nahin|nahi|kya|kaise|mujhe|mera|aur|lekin|kyunki|thoda|bilkul|sinus|naak|band|spray|smell|theek|achha|haan|nahi|kaafi)\b/i;
  if (latinWords.length > 0 && !hinglishPatterns.test(text)) return "eng";
  return "rom"; // Default: Hinglish
}

// ─── SINUS TYPE DETECTION ────────────────────────────────────
function detectSinusType(text) {
  const t = text.toLowerCase();
  if (/spray|nasivion|otrivin|otrivine|bina spray|afrin|chhodna|chhod nahi|dependent/.test(t)) return "spray";
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
  if (userChannels[recipientId] === "twilio") { await sendTwilioMessage(recipientId, text); return; }
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
  replies: ["1 mahine se", "6 mahine se", "1-2 saal se", "5+ saal se"],
};

// ─── DURATION ACK — FIX: months check before years ───────────
function getDurationAck(text) {
  const num = parseInt((text.match(/\d+/) || [])[0]) || 0;
  const tl = text.toLowerCase();
  const isMon = /mahine|mahina|month/.test(tl);
  const years = isMon ? 0 : num;
  const isLong = !isMon && years >= 5;
  const isMid = !isMon && (years >= 2 || /saal|year/.test(tl));
  if (isMon) return `${num} mahine se chal rahi hai — abhi sahi waqt hai.\nPehle theek se samajhte hain.`;
  if (isLong) return `${years} saal se yeh takleef hai... \uD83D\uDE2E\u200D\uD83D\uDCA8\nItne waqt mein neend, energy, focus — sab affected ho chuka hai.\nYeh case dhyan se dekhte hain.`;
  if (isMid) return `${years} saal se chal raha hai — matlab yeh temporary nahi, andar kuch set ho chuka hai.\nSahi diagnosis zaroori hai.`;
  return "Theek hai, samajh gaya. Pehle theek se jaanch karte hain.";
}

// ─── SYMPTOMS QUESTION — Hinglish only ───────────────────────
const SYMPTOMS_Q = {
  text: "Ab batao — kya kya takleef hai? Jo bhi feel hota hai. \uD83C\uDF3F",
  replies: ["Naak band rehti hai", "Spray use karta hun", "Smell nahi aati", "Peela/hara discharge"],
};

// ─── REVEAL MESSAGES — Hinglish only ────────────────────────
const REVEAL = {
  allergic: "Aapki sthiti dekh ke samajh aaya — yeh *Vataja-Kaphaja (Allergic) Sinus* hai. \uD83C\uDF3F\n\nEk quick test: ghar se bahar jao ya doosre room mein jao. Takleef wahan thodi different feel ho toh confirm.\n\nAur ek clear sign — aankhein bhi khujlati hain naak ke saath? Is type mein asli wajah identify hone pe sudhar bahut fast milta hai.",
  congestive: "Aapki sthiti dekh ke samajh aaya — yeh *Kaphaja (Congestive) Sinus* hai. \uD83C\uDF3F\n\nEk test: sir aage jhukao, chehra neeche, 5 sec ruko. Mathe ya galon mein bojh feel ho toh confirm.\n\nSubah uthke pehla adha ghanta sabse bura lagta hai na? Classic Kaphaja.\n\n*Zaroori:* Dairy is type ka sabse bada dushman hai — niyam ke saath band karni padegi.",
  spray: "Aapki sthiti dekh ke samajh aaya — yeh *Aushadha Asakti (Spray Dependency)* hai. \uD83C\uDF3F\n\nEk test: ek raat spray mat lo. Neend mushkil ho — confirm hai naak physically dependent ho chuki hai.\n\nSpray ke 2-3 ghante baad pehle se bhi zyada band? Yeh rebound congestion hai.\n\n*Ek dum band kabhi mat karo* — dheere dheere chhudwane ka niyam kaam karta hai.",
  infective: "Aapki sthiti dekh ke samajh aaya — yeh *Pittaja (Infective/Heat) Sinus* hai. \uD83C\uDF3F\n\nEk check: upar ke daanton mein halka dard ya bojh? Direct sinus connection hai.\n\nAntibiotic se 3-4 din theek, band karo toh wapas? Yeh bacterial chakkar hai.\n\n*Zaroori: eucalyptus ya camphor steam kabhi mat karo* — Pittaja mein WORSE karta hai. Sirf sada paani.",
  polyp: "Aapki sthiti dekh ke samajh aaya — yeh *Polyp/Blockage Sinus* hai. \uD83C\uDF3F\n\nEk test: laung ya adrak naak ke paas laao — kuch smell aaya? Dono taraf equally band?\n\nEk taraf band = Congestive. *Dono taraf equally band = Polyp confirm.*\n\nKai logon ko surgery suggest hui thi — hamare niyam se kai ne bina surgery ke sudhar feel kiya hai.",
};

// ─── PITCH MESSAGES — Hinglish only ─────────────────────────
const TYPE_NAMES = {
  allergic: "Allergic Sinus", congestive: "Congestive Sinus",
  spray: "Spray Dependency", infective: "Infective Sinus", polyp: "Polyp Sinus",
};
function getPitch(type) {
  const tname = TYPE_NAMES[type] || "Congestive Sinus";
  return `Aapke *${tname}* ke liye ek khas 14-din ka program hai. \uD83C\uDF3F\n\n2 options hain:\n\n\uD83C\uDF31 *Rs.499 — Starter Kit*\nAapke sinus type ki self-guided dinchrya — WhatsApp pe. Khud karo, hum guide karte hain.\n\n---\n\n\uD83C\uDF3F *Rs.1,299 — 14-Din Nasal Restoration*\n\u2B50 _(Sabse zyada liya jaata hai)_\n\n*Exactly yeh milega:*\n\u2705 Day 1 — Aapki poori history, causes personally samjhunga (WhatsApp pe)\n\u2705 Aapke type ki khas dinchrya — subah 20 min + raat 15 min\n\u2705 14 din roz WhatsApp pe check — "aaj kaisa raha?" personally\n\u2705 Kisi din takleef ho — usi din niyam badlega\n\u2705 Day 7 + Day 14 — progress review personally\n\u2705 Program ke baad maintenance guidance free\n\n---\n\nENT doctor ek visit mein Rs.1,000-2,000 leta hai — roz check nahi karta.\nYahan 14 din roz personal dhyan — sirf Rs.1,299 ek baar. \uD83C\uDF3F\n\nKaunsa option sahi lagta hai?`;
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
- Current state: ${userData.state}
- Selected plan: ${userData.selectedPlan ? "Rs." + userData.selectedPlan : "Not selected"}
- Post-pitch reply #: ${userData.postPitchReplies || 0}
[END CONTEXT]
LANGUAGE: ${langInstruction}
RULES: No payment links. No diagnosis restart. Under 150 words. End with soft close or question.`;

    const history = (userData.history || []).slice(-8);
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 350,
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
    const params = new URLSearchParams({ platform: "Messenger", senderId, name: name || "Unknown", message: message.substring(0, 200), status: "\uD83D\uDFE1", stage, symptom: sinusType });
    await fetch(`${GAS_URL}?${params.toString()}`, { method: "GET" });
  } catch (e) { console.error("Sheet log error:", e.message); }
}

// ─── CONVERSATION LOGGING (permanent, per-message) ────────────
// Writes every user + bot message to "Conversations" sheet tab
async function logConversation(senderId, role, text) {
  try {
    const params = new URLSearchParams({
      action: "conversation",
      senderId,
      role,           // "user" or "bot"
      message: text.substring(0, 500),
      ts: new Date().toISOString(),
    });
    await fetch(`${GAS_URL}?${params.toString()}`, { method: "GET" });
  } catch (e) { /* silent — don't break bot on log failure */ }
}

// ─── MAIN MESSAGE HANDLER ─────────────────────────────────────
async function handleMessage(senderId, messageText, senderName) {
  const text = messageText.trim();
  const textLower = text.toLowerCase();

  if (!userState[senderId]) userState[senderId] = { state: "new", history: [] };
  const userData = userState[senderId];

  // ─── LOG EVERY INCOMING MESSAGE ──────────────────────────────
  logConversation(senderId, "user", text); // fire-and-forget

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
    userData.state = "hook_sent";
    await sendWithTyping(senderId, HOOKS[idx]);
    await logToSheet(senderId, senderName, "Hook sent", "HOOK", "");
    return;
  }

  if (userData.state === "hook_sent") {
    userData.state = "asked_duration";
    await sendQRWithTyping(senderId, DURATION_Q.text, DURATION_Q.replies);
    return;
  }

  if (userData.state === "asked_duration") {
    userData.duration = text;
    userData.state = "asked_symptoms";
    await sendWithTyping(senderId, getDurationAck(text));
    await new Promise((r) => setTimeout(r, 800));
    await sendQRWithTyping(senderId, SYMPTOMS_Q.text, SYMPTOMS_Q.replies);
    await logToSheet(senderId, senderName, "Duration: " + text, "DURATION", "");
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
    if (userData.postPitchReplies >= 2) { userData.state = "human"; return; }

    const userSaidYes = /haan|ha |yes|theek|ok\b|okay|shuru|karna|chahta|chahti|le leta|le lungi|lena\b|interested|1299|499|full program|starter|bhejo|link/.test(textLower);

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
    if (body.object !== "page") return;
    for (const entry of body.entry) {
      for (const event of entry.messaging || []) {
        const senderId = event.sender?.id;
        if (!senderId) continue;
        if (event.timestamp && Date.now() - event.timestamp > 5 * 60 * 1000) continue;
        if (event.message?.mid) {
          if (processedMessages.has(event.message.mid)) continue;
          processedMessages.add(event.message.mid);
        }
        if (event.sender?.id === entry.id) { await handlePageMessage(event.recipient?.id, event.sender?.id); continue; }
        if (event.message?.text) await handleMessage(senderId, event.message.text, "User");
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

app.get("/", (req, res) => res.send("Ayusomam Bot v3.2 — Website trust integration deployed \uD83C\uDF3F"));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Ayusomam Bot v3.1 running on port " + PORT));
