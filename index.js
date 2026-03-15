// ============================================================
// AYUSOMAM MESSENGER BOT — Version 3.6
// Fix: Bengali language detection added (\u0980-\u09FF range)
// Fix: Severity question removed — faster flow to conversion
// New: asked_allopathy state — after symptoms + followups,
//      ask if allopathy gave only temporary relief → cycle-break hook
// Fix: "Starter Kit" renamed to "Home Kit" everywhere
// Fix: Pitch quick replies now show "14-Din Program" and "Home Kit"
// Fix: SALESOM prompt + AI lang instruction includes Bengali
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
const webReplies = {};  // collects bot replies for /website-chat requests
const processedMessages = new Set();
setInterval(() => processedMessages.clear(), 10 * 60 * 1000);

// ─── IN-MEMORY CONVERSATION LOG (for dashboard) ──────────────
// Google Sheet = permanent | conversationLog = fast in-memory for UI
const conversationLog = {}; // { senderId: [{role, text, ts}] }

// ─── SALESOM SYSTEM PROMPT ───────────────────────────────────
const SALESOM_SYSTEM_PROMPT = `You are SALESOM — a warm, sharp sinus consultant for Ayusomam Herbals.
You text like a real person on WhatsApp. Never sound like a bot or script.

LANGUAGE — MOST IMPORTANT RULE
Read what language the user is writing in RIGHT NOW and match it exactly:
- They write in Hindi (Devanagari letters) → you reply in Hindi (Devanagari). No Roman letters.
- They write in Hinglish / Roman Hindi → you reply in Hinglish. This is the default.
- They write in English → you reply in English only.
- They write in Bengali (Bengali script) → you reply in Bengali script only. No Hinglish, no Hindi.
- They write in Marathi → you reply in Marathi.
If they switch language mid-chat, you switch instantly. Never ask which language to use.
Short messages like "ok", "haan", "yes" → keep the last language used.

TONE — HOW YOU SOUND
You sound like a knowledgeable friend who genuinely wants to help.
- Warm, direct, calm. Never pushy.
- Never say: Bhai, Yaar, Boss, Dost — not even once.
- No bullet lists. No long paragraphs. No formal letter tone.
- Max 2 short lines per message. Mobile-first.
- React naturally. If someone is suffering say "Yeh sach mein mushkil hota hai" — not "I understand your concern."

SINUS TYPES YOU KNOW
Allergic: watery discharge, sneezing, triggered by dust/cold/season → Anu Tailam Nasya
Congestive: thick white discharge, morning heaviness, smell/taste loss, dairy worsens it → Til Taila + Gandoosha. Dairy = off completely.
Infective: yellow/green discharge, burning, antibiotics helped then came back → NO eucalyptus steam.
Spray Dependency: can't sleep without spray, tried stopping and failed → NEVER cold turkey, graduated only.
DNS: ONE side always blocked, nose injury history → inflammation around deviation is treatable.

PRICING
Rs.499 — Sinus Reset Plan (product + protocol delivered, self-guided)
Rs.1,299 — 14-Din Restore Program (kit delivered + daily personal WhatsApp check-in, protocol adjusted as needed)
Rs.1,299 also gets 7 extra days free = 21 days total. Only Rs.800 more.

WHEN SOMEONE MENTIONS ALLOPATHY / MEDICINE / DOCTOR
Say something like: "Doctor se medicine li aur kuch din better tha, phir wapas? Yeh isliye hota hai — medicine bahar ka kaam karti hai, andar ki wajah wahi rehti hai. Tab tak yeh cycle nahi tootegi jab tak root pe kaam na ho."
Then naturally lead to the solution.

OBJECTIONS
Expensive → "ENT visit hi Rs.1,500-2,000 sirf ek prescription ke liye. Yahan 14 din daily check-in Rs.1,299 mein."
Already tried → "Jo try kiya — woh aapke type ke hisaab se tha? Galat protocol se fark nahi padta, seedha bura bhi ho sakta hai."
Guarantee → "Jo log exactly follow karte hain unhe Day 5-7 mein fark dikhta hai. Hum daily track karte hain."
Not now → "Jo cycle chal rahi hai woh khud nahi tootegi. Aur cost toh roz chal rahi hai — time, energy, sleep."
Photo of product → "Haan bhejta hun — aur saath mein briefly batata hun kya milta hai exactly."

RED FLAGS → refer to doctor
102F+ fever | Blood in discharge | Sudden vision change | Kids under 6

RULES — NEVER BREAK
- Max 2 short lines per message. Always.
- No payment links in your text — system sends them separately.
- Never restart diagnosis once type is identified.
- Never mention Rs.499 as "Starter Kit" or "Home Kit" — call it "Sinus Reset Plan" only.
- Never mention Rs.1,299 as "Full Program" alone — call it "14-Din Restore Program".
- Under 50 words per reply. Quality beats quantity every time.`;

// ─── LANGUAGE DETECTION — BI-DIRECTIONAL PER MESSAGE ─────────
// Returns: "dev" (Devanagari), "eng" (English), "rom" (Hinglish/default)
// DEFAULT is always Hinglish ("rom") — only switch if very clearly Devanagari or pure English
function detectLang(text) {
  // 1. Devanagari — even 2 chars is enough to confirm Hindi script
  const devanagariCount = (text.match(/[\u0900-\u097F]/g) || []).length;
  if (devanagariCount >= 2) return "dev";

  // 1b. Bengali script (\u0980-\u09FF)
  const bengaliCount = (text.match(/[\u0980-\u09FF]/g) || []).length;
  if (bengaliCount >= 2) return "ben";

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
  if (userChannels[recipientId] === "website") return;
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
  if (ch === "website") {
    if (webReplies[recipientId]) webReplies[recipientId].push(text);
    console.log(`[Web] ${recipientId}: ${text.substring(0, 60)}`);
    return;
  }
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
  if (userChannels[recipientId] === "website") {
    // No delays for HTTP requests — widget shows its own typing indicator
    await sendMessage(recipientId, text);
    logConversation(recipientId, "bot", text);
    return;
  }
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

// ─── HOOKS — Multilingual ─────────────────────────────────────
const HOOKS = {
  rom: [
    "Naak band rehti hai, sar bhaari rehta hai...\n\nSinus ek baar pakad le, toh chhod nahi deta.\n\nSahi jagah aaye hain aap. \uD83C\uDF3F",
    "Spray use karte hain? Thodi der rahat — phir wahi band.\n\nYeh cycle jab tak andar ki wajah treat na ho, nahi toot ti.\n\nSahi jagah aaye hain. \uD83C\uDF3F",
    "Naak band, smell nahi, din bhar bhaari, neend kharab...\n\nSinus sirf naak ki nahi — poori life ki dikkat hai.\n\nAap sahi jagah aaye hain. \uD83C\uDF3F",
    "Doctor ke paas gaye, dawai li, kuch dino theek raha — phir wahi wapas.\n\nAndar ki wajah treat nahi hui — isliye wapas aata hai.\n\nSahi jagah aaye hain. \uD83C\uDF3F",
  ],
  eng: [
    "Blocked nose, heavy head every day...\n\nOnce sinus takes hold, it doesn't let go easily.\n\nYou've come to the right place. \uD83C\uDF3F",
    "Using a nasal spray? Brief relief — then blocked again.\n\nThis cycle only breaks when the root cause is treated.\n\nYou're in the right place. \uD83C\uDF3F",
    "Blocked nose, no smell, heavy all day, poor sleep...\n\nSinus affects far more than just your nose.\n\nYou're in the right place. \uD83C\uDF3F",
    "Tried medicines, felt better for a few days — then back again.\n\nThat's because only the symptom was treated, not the cause.\n\nYou're in the right place. \uD83C\uDF3F",
  ],
  dev: [
    "\u0928\u093E\u0915 \u092C\u0902\u0926 \u0930\u0939\u0924\u0940 \u0939\u0948, \u0938\u093F\u0930 \u092D\u093E\u0930\u0940 \u0930\u0939\u0924\u093E \u0939\u0948...\n\nSinus \u090F\u0915 \u092C\u093E\u0930 \u092A\u0915\u095C \u0932\u0947, \u0924\u094B \u091B\u094B\u095C\u0924\u093E \u0928\u0939\u0940\u0902 \u0939\u0948\u0964\n\n\u0938\u0939\u0940 \u091C\u0917\u0939 \u0906\u090F \u0939\u0948\u0902\u0964 \uD83C\uDF3F",
    "\u0926\u0935\u093E\u0908 \u0932\u0940, \u0915\u0941\u091B \u0926\u093F\u0928 \u0920\u0940\u0915 \u0930\u0939\u093E \u2014 \u092B\u093F\u0930 \u0935\u0939\u0940 \u0935\u093E\u092A\u0938\u0964\n\n\u0905\u0902\u0926\u0930 \u0915\u0940 \u0935\u091C\u0939 treat \u0928\u0939\u0940\u0902 \u0939\u0941\u0908 \u2014 \u0907\u0938\u0940\u0932\u093F\u090F \u0935\u093E\u092A\u0938 \u0906\u0924\u093E \u0939\u0948\u0964\n\n\u0938\u0939\u0940 \u091C\u0917\u0939 \u0906\u090F \u0939\u0948\u0902\u0964 \uD83C\uDF3F",
  ],
};

// ─── DURATION QUESTION — Multilingual ────────────────────────
const DURATION_Q = {
  rom: { text: "Yeh takleef aapko kitne waqt se hai? \uD83C\uDF3F", replies: ["6 mahine se kum", "1-2 saal se", "3-4 saal se", "5-10 saal se", "10+ saal se"] },
  eng: { text: "How long have you been dealing with this? \uD83C\uDF3F", replies: ["Less than 6 months", "1-2 years", "3-4 years", "5-10 years", "10+ years"] },
  dev: { text: "\u092F\u0939 \u0924\u0915\u0932\u0940\u092B \u0906\u092A\u0915\u094B \u0915\u093F\u0924\u0928\u0947 \u0938\u092E\u092F \u0938\u0947 \u0939\u0948? \uD83C\uDF3F", replies: ["6 \u092E\u0939\u0940\u0928\u0947 \u0938\u0947 \u0915\u092E", "1-2 \u0938\u093E\u0932 \u0938\u0947", "3-4 \u0938\u093E\u0932 \u0938\u0947", "5-10 \u0938\u093E\u0932 \u0938\u0947", "10+ \u0938\u093E\u0932 \u0938\u0947"] },
};

// ─── DURATION ACK — Multilingual, handles all 5 options ──────
function getDurationAck(text, lang) {
  const tl = text.toLowerCase();
  const L = lang || "rom";
  const isMon = /mahine|mahina|month|kum|6 mah|less than|months/.test(tl);
  const num = parseInt((text.match(/\d+/) || [])[0]) || 0;
  const is10plus = /10\+|10 saal|das saal|10 year/.test(tl) || num >= 10;
  const is5plus = /5|6|7|8|9/.test(text) || num >= 5;
  const is3plus = /3|4/.test(text) || num >= 3;

  if (L === "eng") {
    if (isMon) return "Good — you're catching this early. \uD83C\uDF3F\nAt this stage, results come faster with the right approach.";
    if (is10plus) return "10+ years is a long time — the body has adapted around it.\nBut the root cause can still be treated. Let's understand your type.";
    if (is5plus) return `${num || 5}+ years — something has set in deeper. \uD83C\uDF3F\nThe right protocol makes a real difference. Let's identify your type first.`;
    if (is3plus) return `${num || 3}-4 years — this is no longer temporary. \uD83C\uDF3F\nYou're in the right place.`;
    return `${num || 1}-2 years — this can still be fully resolved. \uD83C\uDF3F\nLet's identify your type first.`;
  }
  if (L === "dev") {
    if (isMon) return "\u0920\u0940\u0915 \u0939\u0948 \u2014 \u0905\u092D\u0940 \u0936\u0941\u0930\u0941 \u0915\u0930\u0928\u0947 \u0915\u093E \u0938\u0939\u0940 \u0935\u0915\u094D\u0924 \u0939\u0948\u0964 \uD83C\uDF3F\n\u0907\u0938 stage \u092E\u0947\u0902 results \u0924\u0947\u091C\u093C \u0906\u0924\u0947 \u0939\u0948\u0902\u0964";
    if (is10plus) return "10+ \u0938\u093E\u0932 \u0938\u0947 \u0939\u0948 \u2014 body \u0905\u0921\u091C\u0938\u094D\u091F \u0939\u094B \u091A\u0941\u0915\u0940 \u0939\u0948\u0964\n\u0932\u0947\u0915\u093F\u0928 \u0905\u0902\u0926\u0930 \u0915\u0940 \u0935\u091C\u0939 \u0905\u092D\u0940 \u092D\u0940 treat \u0939\u094B \u0938\u0915\u0924\u0940 \u0939\u0948\u0964";
    if (is5plus) return `${num || 5}+ \u0938\u093E\u0932 \u0938\u0947 \u0939\u0948 \u2014 \u0905\u0902\u0926\u0930 \u0915\u0941\u091B set \u0939\u094B \u091A\u0941\u0915\u093E \u0939\u0948\u0964 \uD83C\uDF3F\n\u0938\u0939\u0940 protocol \u0938\u0947 \u092B\u0930\u094D\u0915 \u092A\u095C\u0924\u093E \u0939\u0948\u0964`;
    if (is3plus) return `${num || 3}-4 \u0938\u093E\u0932 \u0938\u0947 \u0939\u0948 \u2014 temporary \u0928\u0939\u0940\u0902 \u0930\u0939\u093E \u0905\u092C \u092F\u0939\u0964 \uD83C\uDF3F`;
    return `${num || 1}-2 \u0938\u093E\u0932 \u0938\u0947 \u0939\u0948 \u2014 \u0905\u092D\u0940 \u092A\u0942\u0930\u0940 \u0924\u0930\u0939 \u0920\u0940\u0915 \u0939\u094B \u0938\u0915\u0924\u093E \u0939\u0948\u0964 \uD83C\uDF3F`;
  }
  // Default: Hinglish
  if (isMon) return "Theek hai — abhi bahut sahi waqt hai shuru karne ka. \uD83C\uDF3F\nYeh stage mein results bahut fast milte hain.";
  if (is10plus) return "10+ saal se hai — body kaafi adjust ho chuki hai.\nLekin andar ki wajah abhi bhi treat ho sakti hai. Dhyan se dekhte hain.";
  if (is5plus) return `${num || 5}+ saal se hai — matlab andar kuch set ho chuka hai. \uD83C\uDF3F\nSahi protocol se fark padta hai — pehle type samajhte hain.`;
  if (is3plus) return `${num || 3}-4 saal se chal raha hai — temporary nahi raha ab yeh. \uD83C\uDF3F\nSahi jagah aaye hain.`;
  return `${num || 1}-2 saal se hai — abhi bhi theek ho sakta hai completely. \uD83C\uDF3F\nPehle type identify karte hain.`;
}

// ─── SEVERITY QUESTION — Multilingual ────────────────────────
const SEVERITY_Q = {
  rom: { text: "Takleef ki intensity kaisi hai? \uD83C\uDF3F", replies: ["Halki — kaam chal jaata hai", "Moderate — roz affect karta hai", "Severe — roz bahut mushkil hai"] },
  eng: { text: "How severe is the problem? \uD83C\uDF3F", replies: ["Mild — manageable day to day", "Moderate — affects daily life", "Severe — very difficult every day"] },
  dev: { text: "\u0924\u0915\u0932\u0940\u092B \u0915\u093F\u0924\u0928\u0940 \u0917\u0902\u092D\u0940\u0930 \u0939\u0948? \uD83C\uDF3F", replies: ["\u0939\u0932\u094D\u0915\u0940 \u2014 \u0915\u093E\u092E \u091A\u0932 \u091C\u093E\u0924\u093E \u0939\u0948", "\u092E\u0927\u094D\u092F\u092E \u2014 \u0930\u094B\u091C affect \u0915\u0930\u0924\u093E \u0939\u0948", "\u0917\u0902\u092D\u0940\u0930 \u2014 \u0930\u094B\u091C \u092C\u0939\u0941\u0924 \u092E\u0941\u0936\u094D\u0915\u093F\u0932 \u0939\u094B\u0924\u093E \u0939\u0948"] },
};

// ─── SYMPTOMS QUESTION — Multilingual ────────────────────────
const SYMPTOMS_Q = {
  rom: { text: "Apni main takleef batao — naak mein kya ho raha hai? \uD83C\uDF3F", replies: ["Naak band rehti hai", "Spray use karta/karti hun", "Smell nahi aati", "Ek taraf hamesha band (DNS)"] },
  eng: { text: "Tell me your main issue — what is happening with your nose? \uD83C\uDF3F", replies: ["Nose stays blocked", "Using nasal spray", "No sense of smell", "One side always blocked (DNS)"] },
  dev: { text: "\u0905\u092A\u0928\u0940 \u092E\u0941\u0916\u094D\u092F \u0924\u0915\u0932\u0940\u092B \u092C\u0924\u093E\u090F\u0902 \u2014 \u0928\u093E\u0915 \u092E\u0947\u0902 \u0915\u094D\u092F\u093E \u0939\u094B \u0930\u0939\u093E \u0939\u0948? \uD83C\uDF3F", replies: ["\u0928\u093E\u0915 \u092C\u0902\u0926 \u0930\u0939\u0924\u0940 \u0939\u0948", "Spray \u0909\u092A\u092F\u094B\u0917 \u0915\u0930\u0924\u093E/\u0915\u0930\u0924\u0940 \u0939\u0942\u0902", "Smell \u0928\u0939\u0940\u0902 \u0906\u0924\u0940", "\u090F\u0915 \u0924\u0930\u092B \u0939\u092E\u0947\u0936\u093E \u092C\u0902\u0926 (DNS)"] },
};

// ─── FOLLOW-UP DIAGNOSTIC QUESTIONS ──────────────────────────
// Doctor-style: one focused question at a time to identify type precisely
function getFollowupQ(initialType, symptomsText, lang) {
  const tl = symptomsText.toLowerCase();
  const L = lang || "rom";

  // Spray / DNS — already clear from selection, no follow-up needed
  if (initialType === "spray" || initialType === "dns") return null;

  // NAAK BAND / CONGESTIVE / ALLERGIC — Step 1: Ask about discharge
  if (initialType === "congestive" || initialType === "allergic" || /naak band|band rehti|blocked|nose block/.test(tl)) {
    if (L === "eng") return {
      text: "Is there any discharge (fluid) coming from your nose? \uD83C\uDF3F",
      replies: ["Watery / clear (like water)", "Thick white or creamy", "Yellow or green", "No — just blocked, nothing comes out"],
    };
    if (L === "dev") return {
      text: "\u0928\u093E\u0915 \u0938\u0947 \u0915\u094B\u0908 discharge \u0928\u093F\u0915\u0932\u0924\u093E \u0939\u0948? \uD83C\uDF3F",
      replies: ["\u092A\u093E\u0928\u0940 \u091C\u0948\u0938\u093E (watery)", "\u0917\u093E\u095D\u093E \u0938\u092B\u0947\u0926", "\u092A\u0940\u0932\u093E \u092F\u093E \u0939\u0930\u093E", "\u0928\u0939\u0940\u0902 \u2014 \u0938\u093F\u0930\u094D\u092B \u092C\u0902\u0926 \u0939\u0948"],
    };
    return {
      text: "Naak se kuch nikalta hai — koi fluid ya discharge? \uD83C\uDF3F",
      replies: ["Paani jaisi (watery / transparent)", "Thick safed ya creamy", "Peela ya hara", "Nahi — sirf band rehti hai"],
    };
  }

  // SMELL LOSS / POLYP — Ask when and how it happened
  if (initialType === "polyp" || /smell nahi|smell kum|khushbu nahi|no smell|lost smell/.test(tl)) {
    if (L === "eng") return {
      text: "When did you lose your sense of smell? \uD83C\uDF3F",
      replies: ["After a cold or infection", "Slowly over time (gradual)", "Both sides blocked equally", "Along with the blocked nose"],
    };
    if (L === "dev") return {
      text: "Smell \u0915\u092C \u0938\u0947 \u0917\u0908? \uD83C\uDF3F",
      replies: ["Cold/infection \u0915\u0947 \u092C\u093E\u0926", "\u0927\u0940\u0930\u0947-\u0927\u0940\u0930\u0947 \u0939\u0941\u0906", "\u0926\u094B\u0928\u094B\u0902 \u0924\u0930\u092B \u0938\u0947 \u092C\u0930\u093E\u092C\u0930", "\u0928\u093E\u0915 \u092C\u0902\u0926 \u0915\u0947 \u0938\u093E\u0925"],
    };
    return {
      text: "Smell kab se gayi? \uD83C\uDF3F",
      replies: ["Ek cold/infection ke baad", "Dheere dheere hua", "Dono taraf barabar band hai", "Naak band ke saath hi gayi"],
    };
  }

  // INFECTIVE (yellow/green already detected) — Confirm with fever/antibiotic history
  if (initialType === "infective") {
    if (L === "eng") return {
      text: "Did you have fever with this, or did antibiotics help (even temporarily)? \uD83C\uDF3F",
      replies: ["Yes, had fever", "Antibiotics helped but came back", "No fever, no antibiotics", "Not sure"],
    };
    if (L === "dev") return {
      text: "\u0915\u094D\u092F\u093E \u0907\u0938\u0915\u0947 \u0938\u093E\u0925 \u092C\u0941\u0916\u093E\u0930 \u0906\u092F\u093E, \u092F\u093E antibiotics \u0938\u0947 \u0925\u094B\u095C\u093E \u0920\u0940\u0915 \u0939\u0941\u0906? \uD83C\uDF3F",
      replies: ["\u0939\u093E\u0902, \u092C\u0941\u0916\u093E\u0930 \u0906\u092F\u093E \u0925\u093E", "Antibiotics \u0938\u0947 \u0920\u0940\u0915 \u0939\u0941\u0906 \u092B\u093F\u0930 \u0935\u093E\u092A\u0938", "\u0928\u0939\u0940\u0902 — \u0928\u0938 fever \u0928\u0938 antibiotics", "\u092A\u0924\u093E \u0928\u0939\u0940\u0902"],
    };
    return {
      text: "Fever tha saath mein, ya antibiotics se thoda theek hua tha? \uD83C\uDF3F",
      replies: ["Haan, fever bhi tha", "Antibiotics se thoda theek, phir wapas aaya", "Nahi — fever nahi, antibiotics nahi", "Yaad nahi"],
    };
  }

  return null;
}

// ─── SECOND FOLLOW-UP — after discharge answer, ask about triggers ──
function getFollowupQ2(refinedType, lang) {
  const L = lang || "rom";

  // For allergic — ask triggers to confirm
  if (refinedType === "allergic") {
    if (L === "eng") return {
      text: "Does anything in particular trigger it? \uD83C\uDF3F",
      replies: ["Dust / smoke / pollution", "Cold air or temperature change", "Seasonal (certain times of year)", "Morning is always worse"],
    };
    if (L === "dev") return {
      text: "\u0915\u094B\u0908 \u091A\u0940\u091C\u093C trigger \u0915\u0930\u0924\u0940 \u0939\u0948 \u0907\u0938\u0947? \uD83C\uDF3F",
      replies: ["\u0927\u0942\u0932/\u0927\u0941\u0906\u0902/\u092A\u094D\u0930\u0926\u0942\u0937\u0923", "\u0920\u0902\u0921\u0940 \u0939\u0935\u093E \u092F\u093E \u0924\u093E\u092A\u092E\u093E\u0928 \u092C\u0926\u0932\u093E\u0935", "\u092E\u094C\u0938\u092E\u0940 (seasonal)", "\u0938\u0941\u092C\u0939 \u0939\u092E\u0947\u0936\u093E \u091C\u093C\u094D\u092F\u093E\u0926\u093E"],
    };
    return {
      text: "Koi cheez trigger karti hai isko? \uD83C\uDF3F",
      replies: ["Dhool / dhuan / pollution", "Thandi hawa ya mausam badlne pe", "Seasonal (kuch mahino mein)", "Subah uthte hi zyada hoti hai"],
    };
  }

  // For congestive — ask about dairy / morning pattern
  if (refinedType === "congestive") {
    if (L === "eng") return {
      text: "Is it worse in the morning? And do you consume dairy regularly? \uD83C\uDF3F",
      replies: ["Worst in the morning", "Dairy daily (milk, curd, paneer)", "Both — morning + dairy", "Not sure about the pattern"],
    };
    if (L === "dev") return {
      text: "\u0938\u0941\u092C\u0939 \u091C\u093C\u094D\u092F\u093E\u0926\u093E \u0939\u094B\u0924\u0940 \u0939\u0948? Dairy (\u0926\u0942\u0927, \u0926\u0939\u0940, \u092A\u0928\u0940\u0930) \u0930\u094B\u091C \u0932\u0947\u0924\u0947 \u0939\u0948\u0902? \uD83C\uDF3F",
      replies: ["\u0938\u0941\u092C\u0939 \u0938\u092C\u0938\u0947 \u0917\u0902\u092D\u0940\u0930", "\u0930\u094B\u091C dairy \u0932\u0947\u0924\u093E/\u0932\u0947\u0924\u0940 \u0939\u0942\u0902", "\u0926\u094B\u0928\u094B\u0902 \u2014 \u0938\u0941\u092C\u0939 + dairy", "\u092A\u0924\u093E \u0928\u0939\u0940\u0902"],
    };
    return {
      text: "Subah uthte hi zyada hoti hai? Aur dairy roz lete ho? \uD83C\uDF3F",
      replies: ["Subah sabse zyada hoti hai", "Dairy roz leta/leti hun (doodh, dahi, paneer)", "Dono — subah + dairy", "Pattern samajh nahi aaya"],
    };
  }

  return null; // No second follow-up for other types
}

// ─── ALLOPATHY QUESTION — Conversion hook ────────────────────
function getAllopathyQ(lang) {
  const L = lang || "rom";
  if (L === "eng") return {
    text: "One quick question — have you taken doctor's medicine for this before? Did it help for a bit but then it came back? \uD83C\uDF3F",
    replies: ["Yes \u2014 worked then came back", "Never tried medicine", "Currently on medicine"],
  };
  if (L === "dev") return {
    text: "\u090F\u0915 \u0938\u0935\u093E\u0932 \u2014 \u0915\u094D\u092F\u093E \u092A\u0939\u0932\u0947 \u0921\u0949\u0915\u094D\u091F\u0930 \u0938\u0947 \u0926\u0935\u093E\u0908 \u0932\u0940? \u0915\u0941\u091B \u0926\u093F\u0928 \u0920\u0940\u0915 \u0939\u0941\u0906 \u092B\u093F\u0930 \u0935\u093E\u092A\u0938? \uD83C\uDF3F",
    replies: ["\u0939\u093E\u0902 \u2014 \u0920\u0940\u0915 \u0939\u0941\u0906 \u092B\u093F\u0930 \u0935\u093E\u092A\u0938", "\u0915\u092D\u0940 \u0926\u0935\u093E\u0908 \u0928\u0939\u0940\u0902 \u0932\u0940", "\u0905\u092D\u0940 \u0926\u0935\u093E\u0908 \u091A\u0932 \u0930\u0939\u0940 \u0939\u0948"],
  };
  // Hinglish / Bengali default
  return {
    text: "Ek sawaal \u2014 kya pehle doctor se dawai li thi? Kuch din theek hua phir wapas aaya? \uD83C\uDF3F",
    replies: ["Haan \u2014 theek hua phir wapas aaya", "Kabhi dawai nahi li", "Abhi bhi dawai chal rahi hai"],
  };
}

// ─── ALLOPATHY ACK — Cycle-break hook ────────────────────────
function getAllopathyAck(text, lang) {
  const tl = text.toLowerCase();
  const L = lang || "rom";
  const usedAllopathy = /haan|yes|theek hua|worked|came back|wapas|chal rahi|currently/.test(tl);

  if (!usedAllopathy) return null; // No hook needed if never tried

  if (L === "eng") return "Exactly — that's how allopathy works. Suppresses the symptom, but the root cause stays.\n\nThe cycle only breaks when we treat from inside. That's what this protocol does.";
  if (L === "dev") return "\u092F\u0939\u0940 \u0939\u094B\u0924\u093E \u0939\u0948 \u2014 \u0926\u0935\u093E\u0908 \u0909\u092A\u0930 \u0938\u0947 \u0915\u093E\u092E \u0915\u0930\u0924\u0940 \u0939\u0948, \u0905\u0902\u0926\u0930 \u0915\u0940 \u0935\u091C\u0939 \u0935\u0948\u0938\u0940 \u0939\u0940 \u0930\u0939\u0924\u0940 \u0939\u0948\u0964\n\nYeh cycle tab tak nahi tootegi jab tak andar se kaam na ho \u2014 yehi is protocol ka kaam hai.";
  return "Yeh hota hi hai \u2014 dawai baahaar se kaam karti hai, andar ki wajah waisi hi rehti hai.\n\nYeh cycle nahi tootegi jab tak root pe kaam na ho \u2014 isi ke liye yeh protocol hai.";
}

// ─── REFINE TYPE FROM FOLLOW-UP ANSWER ───────────────────────
function refineTypeFromFollowup(initialType, followupText) {
  const tl = followupText.toLowerCase();

  // Discharge-based refinement
  if (/paani|patli|watery|clear|transparent/.test(tl)) return "allergic";   // Watery = allergic
  if (/thick|safed|creamy|white|gada/.test(tl)) return "congestive";        // Thick white = congestive
  if (/peela|hara|yellow|green/.test(tl)) return "infective";               // Yellow/green = infective
  if (/sirf band|nahi nikalta|no discharge|nothing/.test(tl)) return "congestive"; // Dry block = congestive

  // Smell-loss refinement
  if (/cold|infection|ke baad|after/.test(tl)) return "congestive";         // Post-infection = congestive
  if (/dheere|gradually|slow/.test(tl)) return "polyp";                     // Gradual = polyp
  if (/dono taraf|both sides|barabar/.test(tl)) return "polyp";             // Both sides equal = polyp
  if (/naak band ke saath|with blockage/.test(tl)) return initialType;      // Tied to blockage = keep

  // Infective confirmation
  if (/fever|bukhar/.test(tl)) return "infective";
  if (/antibiotic|antibiotic se|helped/.test(tl)) return "infective";

  return initialType; // No match — keep initial
}

// ─── REVEAL MESSAGES — Multilingual, no dramatic tests ───────
function getRevealMsg(type, lang) {
  const L = lang || "rom";
  const reveals = {
    allergic: {
      rom: "Samajh gaya — yeh *Allergic Sinus* hai. \uD83C\uDF3F\n\nIs type mein naak ki lining oversensitive ho jaati hai — har trigger pe react karti hai.\n\nSahi protocol se 4-5 din mein sneezing aur triggers kum hone lagte hain.",
      eng: "Understood — this is *Allergic Sinusitis*. \uD83C\uDF3F\n\nYour nasal lining has become oversensitive and reacts to every trigger.\n\nWith the right protocol, sneezing and triggers reduce noticeably within 4-5 days.",
      dev: "\u0938\u092E\u091D \u0917\u092F\u093E \u2014 \u092F\u0939 *Allergic Sinus* \u0939\u0948\u0964 \uD83C\uDF3F\n\n\u0928\u093E\u0915 \u0915\u0940 lining oversensitive \u0939\u094B \u0917\u0908 \u0939\u0948 \u2014 \u0939\u0930 trigger \u092A\u0930 react \u0915\u0930\u0924\u0940 \u0939\u0948\u0964\n\nSahi protocol \u0938\u0947 4-5 \u0926\u093F\u0928 \u092E\u0947\u0902 sneezing \u0915\u092E \u0939\u094B\u0928\u0947 \u0932\u0917\u0924\u0940 \u0939\u0948\u0964",
    },
    congestive: {
      rom: "Samajh gaya — yeh *Congestive Sinus* hai. \uD83C\uDF3F\n\nIs type mein nasal channels mein kapha jama rehta hai — jitna waqt jaaye, utna thick hota jaata hai.\n\n*Zaroori:* Dairy bilkul band karni padegi — yeh is type ka sabse bada trigger hai.",
      eng: "Understood — this is *Congestive Sinusitis*. \uD83C\uDF3F\n\nMucus has been accumulating in your nasal passages over time, becoming thicker.\n\n*Important:* Dairy must be completely stopped — it is the biggest aggravator for this type.",
      dev: "\u0938\u092E\u091D \u0917\u092F\u093E \u2014 \u092F\u0939 *Congestive Sinus* \u0939\u0948\u0964 \uD83C\uDF3F\n\nNasal channels \u092E\u0947\u0902 kapha \u091C\u092E\u093E \u0930\u0939\u0924\u093E \u0939\u0948 \u2014 \u0935\u0915\u094D\u0924 \u0915\u0947 \u0938\u093E\u0925 \u0914\u0930 thick \u0939\u094B\u0924\u093E \u091C\u093E\u0924\u093E \u0939\u0948\u0964\n\n*\u091C\u093C\u0930\u0942\u0930\u0940:* Dairy \u092C\u0902\u0926 \u0915\u0930\u0928\u0940 \u0939\u094B\u0917\u0940 \u2014 \u092F\u0939 \u0907\u0938 type \u0915\u093E \u0938\u092C\u0938\u0947 \u092C\u095C\u093E trigger \u0939\u0948\u0964",
    },
    spray: {
      rom: "Samajh gaya — yeh *Spray Dependency* hai. \uD83C\uDF3F\n\nNaak ki lining spray ke bina theek se kaam nahi kar paati — physical dependency ban gayi hai.\n\n*Zaroori:* Ek dum band mat karo — sirf dheere graduated protocol se hi chhootega.",
      eng: "Understood — this is *Spray Dependency* (Rebound Rhinitis). \uD83C\uDF3F\n\nYour nasal lining can no longer function properly without the spray — a physical dependency has developed.\n\n*Important:* Never stop cold turkey — it must be reduced gradually with a structured protocol.",
      dev: "\u0938\u092E\u091D \u0917\u092F\u093E \u2014 \u092F\u0939 *Spray Dependency* \u0939\u0948\u0964 \uD83C\uDF3F\n\nNasal lining spray \u0915\u0947 \u092C\u093F\u0928\u093E \u0920\u0940\u0915 \u0938\u0947 \u0915\u093E\u092E \u0928\u0939\u0940\u0902 \u0915\u0930 \u092A\u093E\u0924\u0940\u0964\n\n*\u091C\u093C\u0930\u0942\u0930\u0940:* \u090F\u0915\u0926\u092E \u092C\u0902\u0926 \u092E\u0924 \u0915\u0930\u094B \u2014 \u0927\u0940\u0930\u0947-\u0927\u0940\u0930\u0947 graduated protocol \u0938\u0947 \u0939\u0940 \u091B\u0942\u091F\u0947\u0917\u0940\u0964",
    },
    infective: {
      rom: "Samajh gaya — yeh *Infective/Heat Sinus* hai. \uD83C\uDF3F\n\nIs type mein active infection ke saath nasal lining mein heat aur jalan hoti hai.\n\n*Zaroori:* Eucalyptus ya camphor steam bilkul mat karo — is type mein yeh worse karta hai.",
      eng: "Understood — this is *Infective/Inflammatory Sinusitis*. \uD83C\uDF3F\n\nThere is active infection with heat and irritation in the nasal lining.\n\n*Important:* Never use eucalyptus or camphor steam — it significantly worsens this type.",
      dev: "\u0938\u092E\u091D \u0917\u092F\u093E \u2014 \u092F\u0939 *Infective Sinus* \u0939\u0948\u0964 \uD83C\uDF3F\n\nActive infection \u0915\u0947 \u0938\u093E\u0925 nasal lining \u092E\u0947\u0902 heat \u0914\u0930 \u091C\u0932\u0928 \u0939\u0948\u0964\n\n*\u091C\u093C\u0930\u0942\u0930\u0940:* Eucalyptus/camphor steam \u092C\u093F\u0932\u0915\u0941\u0932 \u092E\u0924 \u0915\u0930\u094B \u2014 \u0907\u0938\u092E\u0947\u0902 worse \u0939\u094B\u0924\u093E \u0939\u0948\u0964",
    },
    polyp: {
      rom: "Samajh gaya — *Polyp/Severe Blockage* lag raha hai. \uD83C\uDF3F\n\nIs type mein nasal tissue growth hoti hai — dono taraf breathe karna mushkil hota hai.\n\nKai logon ko surgery suggest hui thi — sahi protocol se bina surgery bhi sudhar aata hai.",
      eng: "Understood — this appears to be *Nasal Polyp/Severe Blockage*. \uD83C\uDF3F\n\nThere is nasal tissue growth causing blockage on both sides.\n\nMany were advised surgery — significant improvement is often possible without it with the right protocol.",
      dev: "\u0938\u092E\u091D \u0917\u092F\u093E \u2014 *Polyp/Blockage* \u0932\u0917 \u0930\u0939\u093E \u0939\u0948\u0964 \uD83C\uDF3F\n\nNasal tissue growth \u0939\u0948 \u091C\u093F\u0938\u0938\u0947 \u0926\u094B\u0928\u094B\u0902 \u0924\u0930\u092B blockage \u0939\u0948\u0964\n\n\u0915\u0908 \u0932\u094B\u0917\u094B\u0902 \u0915\u094B surgery \u092C\u0924\u093E\u0908 \u0917\u0908 \u0925\u0940 \u2014 \u0938\u0939\u0940 protocol \u0938\u0947 \u092C\u093F\u0928\u093E surgery \u092D\u0940 \u0938\u0941\u0927\u093E\u0930 \u0906\u0924\u093E \u0939\u0948\u0964",
    },
    dns: {
      rom: "Samajh gaya — yeh *DNS (Deviated Nasal Septum)* lag raha hai. \uD83C\uDF3F\n\nNaak ki haddi thodi tedhi hai — uss taraf breathe karna permanently zyada mushkil hota hai.\n\nAyurveda mein DNS ke around ki inflammation aur congestion achi tarah theek hoti hai — breathing improve hoti hai.",
      eng: "Understood — this appears to be *DNS (Deviated Nasal Septum)*. \uD83C\uDF3F\n\nThe nasal bone has a slight deviation — making breathing harder on that side permanently.\n\nAyurveda addresses the inflammation and congestion around the deviation effectively — breathing improves significantly.",
      dev: "\u0938\u092E\u091D \u0917\u092F\u093E \u2014 \u092F\u0939 *DNS* (Deviated Nasal Septum) \u0932\u0917 \u0930\u0939\u093E \u0939\u0948\u0964 \uD83C\uDF3F\n\nNasal bone \u0925\u094B\u095C\u0940 \u091F\u0947\u095D\u0940 \u0939\u0948 \u2014 \u0909\u0938 \u0924\u0930\u092B breathe \u0915\u0930\u0928\u093E permanently \u0915\u0920\u093F\u0928 \u0939\u0948\u0964\n\nAyurveda \u092E\u0947\u0902 DNS \u0915\u0947 \u0906\u0938\u092A\u093E\u0938 \u0915\u0940 inflammation \u0914\u0930 congestion \u0920\u0940\u0915 \u0939\u094B\u0924\u0940 \u0939\u0948\u0964",
    },
  };
  const r = reveals[type] || reveals.congestive;
  return r[L] || r.rom;
}
// Keep legacy const for any older references
const REVEAL = {
  allergic: getRevealMsg("allergic", "rom"),
  congestive: getRevealMsg("congestive", "rom"),
  spray: getRevealMsg("spray", "rom"),
  infective: getRevealMsg("infective", "rom"),
  polyp: getRevealMsg("polyp", "rom"),
  dns: getRevealMsg("dns", "rom"),
};

// ─── PITCH MESSAGES — Multilingual ───────────────────────────
const TYPE_NAMES = {
  allergic: "Allergic Sinus", congestive: "Congestive Sinus",
  spray: "Spray Dependency", infective: "Infective Sinus", polyp: "Polyp Sinus",
  dns: "DNS (Deviated Nasal Septum)",
};
function getPitch(type, lang) {
  const tname = TYPE_NAMES[type] || "Congestive Sinus";
  const L = lang || "rom";
  if (L === "eng") {
    return `Two options for *${tname}*. \uD83C\uDF3F\n\n\uD83C\uDF31 *Rs.499* — Sinus Reset Plan _(product + protocol delivered, you follow at home)_\n\uD83C\uDF3F *Rs.1,299* — 14-Din Restore Program _(most chosen)_\n\u2705 Day 1 personal onboarding | daily WhatsApp check-in | protocol adjusted same day if needed\n\nENT visit alone costs Rs.1,000-2,000. Here you get 14 days of daily personal guidance for Rs.1,299. \uD83C\uDF3F`;
  }
  if (L === "dev") {
    return `*${tname}* \u0915\u0947 \u0932\u093F\u090F \u0926\u094B options \u0939\u0948\u0902\u0964 \uD83C\uDF3F\n\n\uD83C\uDF31 *Rs.499* \u2014 Sinus Reset Plan _(\u0909\u0924\u094D\u092A\u093E\u0926 + protocol deliver, \u0918\u0930 \u092A\u0930 \u0916\u0941\u0926 follow \u0915\u0930\u0947\u0902)_\n\uD83C\uDF3F *Rs.1,299* \u2014 14-Din Restore Program _(sabse zyada liya jaata hai)_\n\u2705 Day 1 personal onboarding | \u0930\u094B\u091C WhatsApp check | \u091C\u093C\u0930\u0942\u0930\u0924 \u0939\u094B \u0924\u094B \u0909\u0938\u0940 \u0926\u093F\u0928 protocol \u092C\u0926\u0932\u0947\u0917\u093E\n\nENT visit \u0905\u0915\u0947\u0932\u0947 Rs.1,000-2,000 \u2014 \u092F\u0939\u093E\u0902 14 \u0926\u093F\u0928 daily guidance \u0938\u093F\u0930\u094D\u092B Rs.1,299\u0964 \uD83C\uDF3F`;
  }
  return `*${tname}* ke liye do options hain. \uD83C\uDF3F\n\n\uD83C\uDF31 *Rs.499* — Sinus Reset Plan _(product + protocol deliver hoga, ghar pe khud follow karo)_\n\uD83C\uDF3F *Rs.1,299* — 14-Din Restore Program _(sabse zyada liya jaata hai)_\n\u2705 Day 1 personally connect | roz WhatsApp check | agar takleef ho — usi din niyam badlega\n\nENT visit hi Rs.1,000-2,000 — yahan 14 din daily personal guidance sirf Rs.1,299. \uD83C\uDF3F`;
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
  return "Ek baat batata hun — \uD83C\uDF3F\n\n14-Din Restore Program mein *7 din bilkul free* milte hain \u2192 total *21 din*, wahi specialist, wahi WhatsApp support.\n\nSirf Rs.800 zyada mein 50% zyada waqt. Jo log lambe waqt se pareshan hain, unhe yeh extra time bahut kaam aata hai.\n\nSochna hai? Bas *upgrade* likho — link bhej deta hun. \uD83C\uDF3F";
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
// ─── FREE RELIEF STEPS (for "no money / free tips / baad mein") ──
function getFreeReliefSteps(sinusType) {
  const s = {
    allergic: {
      title: "2 free steps hain — abhi try karo, fark feel hoga 🌿",
      step1: "🌿 *Step 1 — Tulsi Steam* (8-10 min)\nGaram paani mein 4-5 tulsi leaves daalo. Towel sir pe daal ke naak se steam lo. Yeh nasal passage khol dega.",
      gap: "⏳ 5 min rukko — naak khuli rahegi...",
      step2: "🌿 *Step 2 — Anulom-Vilom* (5 min)\nAbhi naak khuli hai to yeh breathing 3x zyada kaam karti hai. Alternate nostril — slow deep breaths.",
      note: "Steam naak kholti hai, exercise us open state ka pura fayda uthati hai. ✅",
    },
    congestive: {
      title: "2 free steps — aaj raat hi fark feel karoge 🌿",
      step1: "🌿 *Step 1 — Plain Water Steam* (10 min)\nSirf garam paani — kuch mat daalo. Towel se cover karo. Mucus loose hoga, airway clear hoga.",
      gap: "⏳ 2-3 min break lo, naak saaf karo...",
      step2: "🌿 *Step 2 — Smell Activation* (3-4 min)\nThodi si coffee ya adrak powder apne paas rakho. Aankhein band karo, slowly smell karo — 5 deep breaths. Yeh smell nerve activate karta hai.",
      note: "Steam airway kholta hai, smell exercise usmein nerve signal strengthen karti hai. ✅",
    },
    infective: {
      title: "2 free steps — burning aur irritation mein relief 🌿",
      step1: "🌿 *Step 1 — Plain Water Steam* (5-7 min)\nSirf plain water — eucalyptus NAHI dalna (infection mein worsen karta hai). Towel se cover.",
      gap: "⏳ 3 min steam ko kaam karne do...",
      step2: "🌿 *Step 2 — Sheetali Pranayama* (5 min)\nJeebh slightly roll karke, thandi hawa andar kheencho naak se baahaar nikalo. 8-10 rounds. Burning cool hogi.",
      note: "Steam drainage improve karta hai, Sheetali cooling action add karta hai. ✅",
    },
    spray: {
      title: "2 free steps — aaj raat spray se thoda break lo 🌿",
      step1: "🌿 *Step 1 — Warm Saline Rinse* (2 min)\nEk glass garam paani mein half teaspoon namak. Ek nostril mein dheeray lo, doosray se nikalo.",
      gap: "⏳ 5 min rukko...",
      step2: "🌿 *Step 2 — Bhramari Pranayama* (5-7 min)\nAankhein band, haath se kaan dhak lo. Naak se andar lo — baahaar 'hmmm' humming ke saath nikalo. 7-8 rounds.",
      note: "Saline passage clear karta hai, Bhramari vibration swelling reduce karti hai. ✅",
    },
    dns: {
      title: "2 free steps — DNS mein bhi isse fark padta hai 🌿",
      step1: "🌿 *Step 1 — Warm Steam* (8-10 min)\nGaram paani ka steam — towel se cover. Soft tissue inflammation reduce hoti hai.",
      gap: "⏳ 5 min break...",
      step2: "🌿 *Step 2 — Bhramari Pranayama* (5-7 min)\nAndar lo naak se, baahaar 'hmmm' humming ke saath. Nasal vibration soft tissue inflammation reduce karti hai.",
      note: "Steam tissue loosen karta hai, Bhramari vibration inflammation calm karti hai. ✅",
    },
    polyp: {
      title: "2 free steps — blockage se thoda relief 🌿",
      step1: "🌿 *Step 1 — Plain Warm Steam* (10 min)\nSirf plain steam. Polyp ke aas paas ki inflammation loose hogi, thoda airflow milega.",
      gap: "⏳ 5 min rukko...",
      step2: "🌿 *Step 2 — Anulom-Vilom* (5-7 min)\nAbhi jab nasal passage slightly open hai — alternate nostril breathing. Slow, deep. Circulation badhta hai.",
      note: "Steam inflammation loose karta hai, Anulom-Vilom us open window ka fayda uthata hai. ✅",
    },
  };
  return s[sinusType] || s.congestive;
}

async function callSalesom(userMessage, userData, forceLang) {
  try {
    const sinusLabels = {
      allergic: "Vataja-Kaphaja (Allergic)", congestive: "Kaphaja (Congestive)",
      spray: "Aushadha Asakti (Spray Dependency)", infective: "Pittaja (Infective/Heat)", polyp: "Polyp/Blockage",
    };
    const lang = forceLang || userData.lastLang || "rom";
    const langInstruction =
      lang === "dev" ? "User ne Devanagari mein likha hai. SIRF Devanagari mein jawab do. Minimum English. protocol=niyam, symptoms=lakshan, day=din, routine=dinchrya" :
      lang === "ben" ? "User ne Bengali mein likha hai. SIRF Bengali script mein jawab do. Roman ya Hindi transliteration mat karo — asli Bengali lipi mein likhna hai." :
      lang === "eng" ? "User wrote in English. Reply in English only." :
      "User wrote in Hinglish/Roman Hindi. Reply in Hinglish (Roman Hindi).";

    const contextBlock = `
[CONTEXT]
- Sinus type: ${sinusLabels[userData.sinusType] || "Unknown"}
- Duration: ${userData.duration || "Not specified"}
- Current state: ${userData.state}
- Allopathy history: ${userData.usedAllopathy || "Not asked"}
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
    // Safety filter: strip informal address words even if AI slips
    const reply = response.content[0].text
      .replace(/\bbhai\b/gi, "")
      .replace(/\byaar\b/gi, "")
      .replace(/\bboss\b/gi, "")
      .replace(/(,\s*)bhai\b/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();
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
    await sendWithTyping(senderId, `Payment pakki ho gayi! \uD83C\uDF3F\n\nAapka *${days}-Din Sinus Restore Program* shuru hone waala hai.\n\nMain jald hi personally connect karunga — 85951 60713\n\nAyusomam mein aapka swagat hai! \uD83C\uDF3F`);
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
      await sendWithTyping(senderId, `Badhiya! \uD83C\uDF3F\n\n*14-Din Restore Program — Rs.1,299* _(21 din total with 7 free)_\n\uD83C\uDF3F ${PAYMENT_1299}\n\nPayment ke baad yahan "done" likhna — personally connect honge.`);
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
    const hooksArr = HOOKS[sc] || HOOKS.rom;
    const idx = Math.floor(Math.random() * hooksArr.length);
    const dq = DURATION_Q[sc] || DURATION_Q.rom;
    userData.state = "asked_duration";
    await sendWithTyping(senderId, hooksArr[idx]);
    await new Promise((r) => setTimeout(r, 900));
    await sendQRWithTyping(senderId, dq.text, dq.replies);
    await logToSheet(senderId, senderName, "Hook sent", "HOOK", "");
    return;
  }

  // hook_sent — legacy fallback for users mid-flow
  if (userData.state === "hook_sent") {
    const dq = DURATION_Q[sc] || DURATION_Q.rom;
    userData.state = "asked_duration";
    await sendQRWithTyping(senderId, dq.text, dq.replies);
    return;
  }

  if (userData.state === "asked_duration") {
    userData.duration = text;
    userData.state = "asked_symptoms";
    const smq = SYMPTOMS_Q[sc] || SYMPTOMS_Q.rom;
    await sendWithTyping(senderId, getDurationAck(text, sc));
    await new Promise((r) => setTimeout(r, 800));
    await sendQRWithTyping(senderId, smq.text, smq.replies);
    await logToSheet(senderId, senderName, "Duration: " + text, "DURATION", "");
    return;
  }

  if (userData.state === "asked_symptoms") {
    userData.symptoms = text;
    const sinusType = detectSinusType(text);
    userData.sinusType = sinusType;
    userData.followupStage = 1;

    // Check if a follow-up diagnostic question is needed
    const followupQ = getFollowupQ(sinusType, text, sc);
    if (followupQ) {
      userData.state = "asked_followup";
      const ackMsg = sc === "eng" ? "Got it — one more question. \uD83C\uDF3F"
        : sc === "dev" ? "\u0920\u0940\u0915 \u0939\u0948 \u2014 \u090F\u0915 \u0914\u0930 \u0938\u0935\u093E\u0932\u0964 \uD83C\uDF3F"
        : "Theek hai — ek aur sawaal. \uD83C\uDF3F";
      await sendWithTyping(senderId, ackMsg);
      await new Promise((r) => setTimeout(r, 600));
      await sendQRWithTyping(senderId, followupQ.text, followupQ.replies);
      await logToSheet(senderId, senderName, "Symptoms: " + text, "FOLLOWUP_Q", sinusType);
      return;
    }

    // No follow-up needed — ask allopathy question before reveal
    userData.state = "asked_allopathy";
    const aq = getAllopathyQ(sc);
    const ackSym = sc === "eng" ? "Got it. \uD83C\uDF3F" : sc === "dev" ? "\u0920\u0940\u0915 \u0939\u0948\u0964 \uD83C\uDF3F" : "Theek hai. \uD83C\uDF3F";
    await sendWithTyping(senderId, ackSym);
    await new Promise((r) => setTimeout(r, 600));
    await sendQRWithTyping(senderId, aq.text, aq.replies);
    await logToSheet(senderId, senderName, "Symptoms: " + text, "ALLOPATHY_Q", sinusType);
    return;
  }

  if (userData.state === "asked_followup") {
    const refinedType = refineTypeFromFollowup(userData.sinusType, text);
    userData.sinusType = refinedType;
    userData.followupAnswer = text;

    // Check if a second-level follow-up is needed (e.g. triggers for allergic)
    if ((userData.followupStage || 1) < 2) {
      const fq2 = getFollowupQ2(refinedType, sc);
      if (fq2) {
        userData.followupStage = 2;
        const ackMsg2 = sc === "eng" ? "Good — one last thing. \uD83C\uDF3F"
          : sc === "dev" ? "\u0920\u0940\u0915 \u0939\u0948 \u2014 \u090F\u0915 \u0906\u0916\u093F\u0930\u0940 \u0938\u0935\u093E\u0932\u0964 \uD83C\uDF3F"
          : "Theek hai — ek last sawaal. \uD83C\uDF3F";
        await sendWithTyping(senderId, ackMsg2);
        await new Promise((r) => setTimeout(r, 600));
        await sendQRWithTyping(senderId, fq2.text, fq2.replies);
        await logToSheet(senderId, senderName, "Followup1: " + text, "FOLLOWUP_Q2", refinedType);
        return;
      }
    }

    // All follow-ups done — ask allopathy question before reveal
    userData.state = "asked_allopathy";
    const aqf = getAllopathyQ(sc);
    const clearMsg = sc === "eng" ? "Got it — one last thing. \uD83C\uDF3F"
      : sc === "dev" ? "\u0938\u092E\u091D \u0917\u092F\u093E \u2014 \u090F\u0915 \u0906\u0916\u093F\u0930\u0940 \u0938\u0935\u093E\u0932\u0964 \uD83C\uDF3F"
      : "Samajh gaya — ek aur cheez batao. \uD83C\uDF3F";
    await sendWithTyping(senderId, clearMsg);
    await new Promise((r) => setTimeout(r, 600));
    await sendQRWithTyping(senderId, aqf.text, aqf.replies);
    await logToSheet(senderId, senderName, "Followup: " + text, "ALLOPATHY_Q", refinedType);
    return;
  }

  if (userData.state === "asked_allopathy") {
    const tl = text.toLowerCase();
    // Store allopathy history for AI context
    const usedAllopathy = /haan|yes|theek hua|worked|came back|wapas|chal rahi|currently/.test(tl);
    userData.usedAllopathy = usedAllopathy ? "Used allopathy — temporary relief only" : "Never used / no allopathy";

    // Send cycle-break hook if they used allopathy
    const ackHook = getAllopathyAck(text, sc);
    if (ackHook) {
      await sendWithTyping(senderId, ackHook);
      await new Promise((r) => setTimeout(r, 700));
    }

    // Now reveal sinus type
    userData.state = "revealed";
    userData.postPitchReplies = 0;
    userData.history = [];
    const thinkMsg = sc === "eng" ? "Analysing your case... \uD83C\uDF3F" : sc === "dev" ? "\u0906\u092A\u0915\u093E case \u0926\u0947\u0916 \u0930\u0939\u0947 \u0939\u0948\u0902... \uD83C\uDF3F" : "Aapka case dekh rahe hain... \uD83C\uDF3F";
    await sendWithTyping(senderId, thinkMsg);
    await new Promise((r) => setTimeout(r, 700));
    await sendWithTyping(senderId, getRevealMsg(userData.sinusType, sc));
    await new Promise((r) => setTimeout(r, 600));
    await sendWithTyping(senderId, getWebsiteLine("trust", sc));
    await logToSheet(senderId, senderName, "Allopathy: " + text, "REVEALED", userData.sinusType);
    return;
  }

  if (userData.state === "revealed") {
    userData.state = "pitched";
    await sendWithTyping(senderId, getPitch(userData.sinusType, sc));
    await new Promise((r) => setTimeout(r, 700));
    const pitchOptText = sc === "eng" ? "Which option works for you? \uD83C\uDF3F"
      : sc === "dev" ? "\u0915\u094C\u0928\u0938\u093E option \u0938\u0939\u0940 \u0932\u0917\u0924\u093E \u0939\u0948? \uD83C\uDF3F"
      : "Kaunsa option sahi lagta hai? \uD83C\uDF3F";
    const pitchReplies = sc === "eng"
      ? ["14-Din Restore Program (Rs.1,299)", "Sinus Reset Plan (Rs.499)", "I have a question first"]
      : sc === "dev"
      ? ["14-Din Restore Program (Rs.1,299)", "Sinus Reset Plan (Rs.499)", "\u092A\u0939\u0932\u0947 \u0938\u0935\u093E\u0932 \u0939\u0948"]
      : ["14-Din Restore Program (Rs.1,299)", "Sinus Reset Plan (Rs.499)", "Pehle sawaal hai"];
    await sendQRWithTyping(senderId, pitchOptText, pitchReplies);
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

    // ── Free tips / no money / later ─────────────────────────────────
    const wantsFree = /paise nahi|paisa nahi|\bfree\b|free tips|free bata|gharelu|ghar pe|ghar ka|nahi lena|nahi kharidna|baad mein|baad me|abhi nahi|budget nahi|afford nahi|mehenga|mahanga hai|costly|expensive|kal dekhenge|sochta hun|sochti hun/.test(textLower);
    if (wantsFree) {
      const fs = getFreeReliefSteps(userData.sinusType || "congestive");
      await sendWithTyping(senderId, fs.title);
      await new Promise((r) => setTimeout(r, 700));
      await sendWithTyping(senderId, fs.step1);
      await new Promise((r) => setTimeout(r, 900));
      await sendWithTyping(senderId, fs.gap);
      await new Promise((r) => setTimeout(r, 1100));
      await sendWithTyping(senderId, fs.step2);
      await new Promise((r) => setTimeout(r, 700));
      await sendWithTyping(senderId, fs.note);
      await new Promise((r) => setTimeout(r, 600));
      await sendWithTyping(senderId, "Yeh try karo aaj — koi sawaal ho toh batao. 🌿");
      return;
    }

        // Payment link ONLY when user clearly shows interest/intent — not by default
    const userSaidYes = /\bhaan\b|\bha\b|yes\b|theek hai|ok\b|okay\b|shuru|karna hai|chahta|chahti|le leta|le lungi|lena hai|interested|1299|499|full program|starter kit|home kit|sinus reset|restore program|bhejo|link bhejo|link chahiye|lena chahta|lena chahti/.test(textLower);

    if (userSaidYes) {
      const wants1299 = /1299|full program|restore program|full|poora/.test(textLower);
      const wants499 = /499|starter|home kit|sinus reset|reset plan|chota|basic/.test(textLower);
      if (wants1299) userData.selectedPlan = 1299;
      else if (wants499) userData.selectedPlan = 499;

      let commitMsg;
      if (userData.selectedPlan === 1299)
        commitMsg = "Bahut acha kadam! \uD83C\uDF3F\n\n*14-Din Restore Program (Rs.1,299)* — yahi lena hai?\n\nEk baar *haan* bol do — phir payment link bhejta hun.";
      else if (userData.selectedPlan === 499)
        commitMsg = "Perfect! \uD83C\uDF3F\n\n*Sinus Reset Plan (Rs.499)* — yahi lena hai?\n\nEk baar *haan* bol do — phir link bhejta hun.";
      else
        commitMsg = "Batao — *Sinus Reset Plan (Rs.499)* lena hai ya *14-Din Restore Program (Rs.1,299)*? \uD83C\uDF3F";

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
    const wants1299 = /1299|restore program|full|poora/.test(textLower);
    const wants499 = /499|sinus reset|reset plan|starter|home kit/.test(textLower);
    if (wants1299) userData.selectedPlan = 1299;
    if (wants499) userData.selectedPlan = 499;

    if (confirmed || wants1299 || wants499) {
      const websiteLine = getWebsiteLine("confirm", sc);
      const linkMsg = userData.selectedPlan === 499
        ? `*Sinus Reset Plan — Rs.499*\n\nPayment link:\n\uD83C\uDF31 ${PAYMENT_499}\n\n${websiteLine}\n\nPayment ke baad yahan *done* likhna — agla step batata hun. \uD83C\uDF3F`
        : `*14-Din Restore Program — Rs.1,299*\n\nPayment link:\n\uD83C\uDF3F ${PAYMENT_1299}\n\n${websiteLine}\n\nPayment ke baad yahan *done* likhna — personally connect honge. \uD83C\uDF3F`;
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
.bc-bar{padding:8px;border-top:1px solid #333;flex-shrink:0;}
.bc-bar button{width:100%;padding:7px;background:#2a2a4a;color:#e0e0e0;border:1px solid #555;border-radius:5px;cursor:pointer;font-size:12px;}
.bc-bar button:hover{background:#3a3a5a;}
.bc-panel{display:none;padding:8px;border-top:1px solid #333;flex-shrink:0;}
.bc-panel.open{display:block;}
.bc-panel textarea{width:100%;height:70px;background:#1a1a2e;color:#e0e0e0;border:1px solid #444;border-radius:4px;padding:6px;font-size:12px;resize:vertical;box-sizing:border-box;}
.bc-send{width:100%;margin-top:5px;padding:7px;background:#c0392b;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:600;}
.bc-send:hover{background:#a93226;}
.ins-wrap{background:#111827;padding:8px;border-bottom:1px solid #2a2a3a;}
.ins-row{display:flex;gap:5px;margin-bottom:5px;}
.ins-card{flex:1;background:#1a1a2e;border:1px solid #2d3748;border-radius:7px;padding:7px 4px;text-align:center;}
.ins-v{font-size:17px;font-weight:700;color:#4ade80;line-height:1;}
.ins-v.warn{color:#fbbf24;}
.ins-l{font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin-top:2px;}
.ins-ch{display:flex;gap:4px;}
.ins-ch-card{flex:1;background:#1a1a2e;border:1px solid #2d3748;border-radius:5px;padding:4px 2px;text-align:center;}
.ins-ch-card b{display:block;font-size:14px;color:#60a5fa;font-weight:700;}
.ins-ch-card span{font-size:9px;color:#6b7280;}
.ins-foot{display:flex;justify-content:space-between;align-items:center;margin-top:4px;}
.ins-upd{font-size:9px;color:#4b5563;}
.ins-refresh{background:none;border:none;color:#60a5fa;cursor:pointer;font-size:11px;padding:2px 6px;border-radius:3px;border:1px solid #2d3748;}
.ins-refresh:hover{background:#1a2744;}
</style></head><body>
<div class="header">
  <div><div class="uname" style="font-size:17px;font-weight:600;color:white;">\uD83C\uDF3F SALESOM Dashboard</div><div class="sub">Ayusomam Herbals \u2014 Live Conversations</div></div>
  <div id="statsBar">Loading...</div>
</div>
<div class="main">
  <div class="left">
    <div class="ins-wrap">
      <div class="ins-row">
        <div class="ins-card"><div class="ins-v" id="ins-web">—</div><div class="ins-l">Web Today</div></div>
        <div class="ins-card"><div class="ins-v" id="ins-act">—</div><div class="ins-l">Active 4hr</div></div>
        <div class="ins-card"><div class="ins-v warn" id="ins-hum">—</div><div class="ins-l">Human Mode</div></div>
        <div class="ins-card"><div class="ins-v" id="ins-tot">—</div><div class="ins-l">Total Users</div></div>
      </div>
      <div class="ins-ch">
        <div class="ins-ch-card"><b id="ins-msg">—</b><span>Msg</span></div>
        <div class="ins-ch-card"><b id="ins-ig">—</b><span>Insta</span></div>
        <div class="ins-ch-card"><b id="ins-wa">—</b><span>WA</span></div>
        <div class="ins-ch-card"><b id="ins-wb">—</b><span>Web</span></div>
      </div>
      <div class="ins-foot"><span class="ins-upd" id="ins-upd">Loading...</span><button class="ins-refresh" onclick="loadInsights()" title="Refresh now">↻ Refresh</button></div>
    </div>
    <div class="search-wrap"><input type="text" id="search" placeholder="\uD83D\uDD0D Search..." oninput="render()"></div>
    <div class="ulist" id="ulist"></div>
    <div class="bc-bar"><button onclick="toggleBC()">📢 Broadcast to All</button></div>
    <div class="bc-panel" id="bcPanel"><textarea id="bcMsg" placeholder="Sabhi users ko message bhejo..."></textarea><button class="bc-send" onclick="broadcast()">Send to All</button></div>
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
    const inp=document.getElementById('mi');
    const draft=inp?inp.value:'';
    const wasFocused=inp&&document.activeElement===inp;
    const r=await fetch('/admin/api/users');users=await r.json();
    users.sort((a,b)=>{const ta=a.lastMessage?new Date(a.lastMessage.ts):0,tb=b.lastMessage?new Date(b.lastMessage.ts):0;return tb-ta;});
    render();stats();
    if(sel)await loadMsgs(sel);
    if(draft){const inp2=document.getElementById('mi');if(inp2){inp2.value=draft;if(wasFocused)inp2.focus();}}
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
async function loadInsights(){
  try{
    const [ur,sr]=await Promise.all([fetch('/admin/api/users'),fetch('/admin/api/insights')]);
    const users=await ur.json();const stats=await sr.json();
    const now=new Date();const today=new Date(now);today.setHours(0,0,0,0);
    const hr4=new Date(now-4*3600000);
    const webToday=users.filter(u=>u.channel==='website'&&u.lastMessage&&new Date(u.lastMessage.ts)>=today).length;
    const act4=users.filter(u=>u.lastMessage&&new Date(u.lastMessage.ts)>=hr4).length;
    document.getElementById('ins-web').textContent=webToday;
    document.getElementById('ins-act').textContent=act4;
    document.getElementById('ins-hum').textContent=stats.humanMode||0;
    document.getElementById('ins-tot').textContent=stats.total||users.length;
    document.getElementById('ins-msg').textContent=(stats.channels&&stats.channels.messenger)||0;
    document.getElementById('ins-ig').textContent=(stats.channels&&stats.channels.instagram)||0;
    document.getElementById('ins-wa').textContent=(stats.channels&&stats.channels.twilio)||0;
    document.getElementById('ins-wb').textContent=(stats.channels&&stats.channels.website)||0;
    document.getElementById('ins-upd').textContent='Updated: '+now.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
  }catch(e){const el=document.getElementById('ins-upd');if(el)el.textContent='Error loading';}
}
loadInsights();setInterval(loadInsights,4*60*60*1000);
load();setInterval(load,5000);
function toggleBC(){const p=document.getElementById('bcPanel');p.classList.toggle('open');}
async function broadcast(){const msg=document.getElementById('bcMsg').value.trim();if(!msg){alert('Message likhein!');return;}if(!confirm('Sabhi WhatsApp/Instagram users ko bhejein?\\n"'+msg+'"'))return;const r=await fetch('/admin/api/broadcast',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:msg})});const d=await r.json();if(d.ok){alert(d.sent+' users ko bheja!');document.getElementById('bcMsg').value='';document.getElementById('bcPanel').classList.remove('open');}else alert('Error: '+(d.error||'unknown'));}
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

// Broadcast to all non-website users
app.post("/admin/api/broadcast", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "message required" });
    let sent = 0;
    for (const [userId, ch] of Object.entries(userChannels || {})) {
      if (ch !== "website") { try { await sendMessage(userId, message); sent++; } catch(e) {} }
    }
    res.json({ ok: true, sent });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// Insights aggregated stats
app.get("/admin/api/insights", (req, res) => {
  try {
    const allIds = Object.keys(userChannels || {});
    const channels = {};
    let humanMode = 0;
    allIds.forEach(id => {
      const ch = userChannels[id] || "unknown";
      channels[ch] = (channels[ch] || 0) + 1;
      if (userState[id] && userState[id].state === "human") humanMode++;
    });
    res.json({ ok: true, total: allIds.length, channels, humanMode, botMode: allIds.length - humanMode });
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

// ─── WEBSITE CHATBOT ENDPOINT ────────────────────────────────
app.options("/website-chat", (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.sendStatus(200);
});

app.post("/website-chat", async (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  try {
    const { senderId, message } = req.body;
    if (!senderId || !message) {
      return res.status(400).json({ error: "senderId and message required" });
    }
    const webSenderId = `WEB_${senderId}`;
    userChannels[webSenderId] = "website";
    webReplies[webSenderId] = [];

    await handleMessage(webSenderId, message.trim(), "Website Visitor");

    const replies = webReplies[webSenderId] || [];
    delete webReplies[webSenderId];
    res.json({ replies });
  } catch (e) {
    console.error("Website chat error:", e.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/", (req, res) => res.send("Ayusomam Bot v3.5 — Website chat restored 🌿"));
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
