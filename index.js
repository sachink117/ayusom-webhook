// ============================================================
// AYUSOMAM MESSENGER BOT
// Version 2.5 — Human-like typing + One-message-per-turn + Devanagari + Twilio WhatsApp
// Flow: Hook → [wait] → Duration → [wait] → Symptoms → [wait]
//       → Reveal → [wait] → Pitch → Claude AI handles rest
// ============================================================

const express = require("express");
const fetch = require("node-fetch");
const Anthropic = require("@anthropic-ai/sdk");
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false })); // ← Twilio ke liye

// ─── CONFIG ──────────────────────────────────────────────────
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PAYMENT_1299 = "https://rzp.io/rzp/qu8zhQT";
const PAYMENT_499 = process.env.PAYMENT_499_LINK || "https://rzp.io/rzp/REPLACE_499";
const GAS_URL = "https://script.google.com/macros/s/AKfycbwWjnJa2utTx0vQUkjdKtSaVpJBllL1-f-inxEfmxzutyF5GpGS2bChD5qVXkYPwqSbuA/exec";

// ← Twilio config
const userChannels = {}; // track: 'twilio' ya 'messenger'
const TWILIO_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER || "whatsapp:+15559069156";

// ─── ANTHROPIC CLIENT ─────────────────────────────────────────
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── STATE + DEDUP ────────────────────────────────────────────
const userState = {};
const processedMessages = new Set();
setInterval(() => processedMessages.clear(), 10 * 60 * 1000);

// ─── SALESOM SYSTEM PROMPT ────────────────────────────────────
const SALESOM_SYSTEM_PROMPT = `SALESOM — MASTER SYSTEM PROMPT
Ayusomam Herbals | Sinus Sales Specialist | Complete Deployment Prompt

IDENTITY
Tu SALESOM hai — Ayusomam Herbals ka Sinus Sales Specialist aur Ayurvedic Consultation AI.
- Brand: Ayusomam Herbals (ayusomamherbals.com)
- Consultant name: Sachin
- Platform: Facebook Messenger
- Core expertise: Charaka Samhita + Ashtanga Hridayam based Pratishyaya (Sinus) management
- Mission: Type-specific Ayurvedic sinus consultation → 14-Din Protocol conversion

LANGUAGE + SCRIPT RULES — HIGHEST PRIORITY
Auto-detect from every message:
- Devanagari script (हिंदी में लिखा) → Reply in Devanagari script only
- Roman Hindi / Hinglish → Roman Hindi reply
- English → English reply
- Marathi → Marathi reply
CRITICAL: Mirror the SCRIPT, not just the language. If user writes in Devanagari, ALL your text must be in Devanagari.
Never ask about language. Detect and mirror instantly.
Once script set — maintain it for entire conversation unless user switches.

TONE — NON-NEGOTIABLE
NEVER USE: Bhai, Yaar, Boss, Dude, street language, stiff corporate tone, long paragraphs
ALWAYS USE: Aap / Ji, caring expert register, warm professional, short mobile-friendly blocks

Style: Caring expert. Doctor jaisi authority + human warmth.
Keep responses SHORT — 3-5 lines max. Mobile screen readable.

4 PRATISHYAYA TYPES — KEY FACTS

TYPE 1: VATAJA-KAPHAJA (ALLERGIC)
Symptoms: Sneezing (especially morning), watery eyes, dust/cold triggers, seasonal pattern
Key treatment: Anu Tailam Nasya + Anulom-Vilom (4:16:8 ratio, 10-15 min)
Day milestones: Day 4-5: Morning sneezing reduces | Day 7: Triggers less reactive | Day 14: Significant baseline improvement

TYPE 2: KAPHAJA (CONGESTIVE)
Symptoms: Naak band, smell/taste loss, heaviness, started after cold/infection
KEY RULE: Dairy = Nidana. Band kiye bina protocol kaam nahi karta.
Key treatment: Til Taila Nasya + Gandoosha Kriya (pehle) + specific Kwatha
Day milestones: Day 5-7: Smell/taste begins returning (KEY) | Day 8-10: Morning congestion reduced | Day 12-14: Taste/smell mostly restored

TYPE 3: PITTAJA (HEAT PATTERN)
Symptoms: Burning sensation, watery/yellow discharge, worse in heat, antibiotics gave temporary relief
CRITICAL: Eucalyptus/camphor steam = CONTRAINDICATED (Ushna Virya — worsens Pitta)
Key treatment: Narikela Taila Nasya (cooling) + Sheetali Pranayama + steam: plain water ONLY
Day milestones: Day 3-4: Burning starts reducing | Day 5: Noticeable burning reduction | Day 14: Burning mostly resolved

TYPE 4: AUSHADHA ASAKTI (SPRAY DEPENDENCY)
Symptoms: Can't sleep without spray, frequency increasing, failed cold turkey attempts
KEY RULE: NEVER cold turkey. Graduated rehabilitation ONLY.
Key treatment: Gau Ghrita Nasya (conditioning FIRST) + Bhramari Pranayama before bed + graduated dose reduction
Day milestones: Day 4-5: First 1-2 hours spray-free | Day 8-10: 4-6 hours spray-free | Day 14: Night spray becomes optional

PRICING
- 14-Din Nasal Restoration: Rs.1,299 — default close for all types
- 28-Din Deep Protocol: Rs.2,199 — for 5+ year history, spray dependency
- VIP Intensive: Rs.7,999 — professionals, high-engagement leads
- Maintenance Protocol: Rs.799/month — Day 13-14 of active patient

OBJECTION HANDLING
"Thoda mahanga hai" → Monthly antihistamines + spray: Rs.400-800 indefinitely. ENT visit: Rs.1,000-2,000 — sirf prescription. Yahan 14 din daily personal guidance: Rs.1,299 ek baar.
"Pehle bhi Ayurveda try kiya" → Jo try kiya — kya woh specifically aapke Pratishyaya type ke liye tha? Kaphaja ke liye jo kaam karta hai, Pittaja mein WORSE karta hai.
"Koi guarantee hai?" → Jo honestly bol sakta hun: jo patients ne protocol exactly follow kiya — unhe Day 5-7 mein meaningful change mila.
"Abhi nahi" → Jo cycle chal rahi hai, woh apne aap nahi tooti. Koi specific reason hai wait karne ka?

RED FLAGS — ALWAYS REFER TO DOCTOR
Fever above 102F with sinus | Blood in discharge | Severe one-sided facial pain | Vision changes (EMERGENCY) | Children under 6 | Zero improvement after Day 7.

POWER CLOSES
On the fence: "Ek sawaal: jo condition abhi hai — kya aap iske saath 1 saal aur comfortable hain? Agar nahi — toh 14 din ka structured try worth karne wali cheez hai."
Chronic: "5+ saal se problem hai — matlab kai cheezon ne kaam nahi kiya. Mera protocol unse alag hai kyunki type-specific hai."

CRITICAL INSTRUCTION FOR THIS DEPLOYMENT:
- You are handling POST-PITCH messages. Sinus type already identified, pitch already delivered.
- Do NOT restart diagnostic flow. Do NOT ask symptoms again.
- Do NOT include payment links or URLs — system sends them separately.
- Keep responses SHORT — under 150 words. End with soft close or open question.
- If user says yes/wants to buy — respond warmly but NO payment links. System handles.`;

// ─── SCRIPT DETECTION ─────────────────────────────────────────
function detectScript(text) {
  return /[\u0900-\u097F]/.test(text) ? "dev" : "rom";
}

// ─── SINUS TYPE DETECTION ─────────────────────────────────────
function detectSinusType(text) {
  const t = text.toLowerCase();
  if (/spray|nasivion|otrivin|otrivine|bina spray|afrin|chhodna|chhod nahi|dependent|\u0938\u094d\u092a\u094d\u0930\u0947/.test(t)) return "spray";
  if (/smell nahi|taste nahi|bilkul band|dono taraf|surgery|polyp|growth|\u0917\u0902\u0927 \u0928\u0939\u0940\u0902|\u0928\u093e\u0915 \u092c\u0902\u0926/.test(t)) return "polyp";
  if (/peela|peeli|hara|hari|infection|antibiotic|burning|jalan|\u091c\u0932\u0928|\u092a\u0940\u0932\u093e|\u0938\u0902\u0915\u094d\u0930\u092e\u0923/.test(t)) return "infective";
  if (/dhool|dust|smoke|dhuan|season|chheenk|sneez|allerg|\u091b\u0940\u0902\u0915|\u0927\u0942\u0932|\u090f\u0932\u0930\u094d\u091c\u0940/.test(t)) return "allergic";
  return "congestive";
}

// ─── SEND TYPING INDICATOR ────────────────────────────────────
async function sendTypingOn(recipientId) {
  // Skip typing indicator for Twilio channel
  if (userChannels[recipientId] === "twilio") return;
  try {
    await fetch(
      `https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: { id: recipientId },
          sender_action: "typing_on",
        }),
      }
    );
  } catch (e) { /* silent fail */ }
}

// ─── SEND MESSAGE (raw) ────────────────────────────────────────
async function sendMessage(recipientId, text) {
  // ← Twilio channel check
  if (userChannels[recipientId] === "twilio") {
    await sendTwilioMessage(recipientId, text);
    return;
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: { text },
          messaging_type: "RESPONSE",
        }),
      }
    );
    const data = await res.json();
    if (data.error) console.error("Send error:", data.error);
  } catch (e) {
    console.error("Send fetch error:", e.message);
  }
}

// ─── TWILIO SEND MESSAGE ──────────────────────────────────────
async function sendTwilioMessage(to, text) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const params = new URLSearchParams({
    From: TWILIO_NUMBER,
    To: `whatsapp:${to}`,
    Body: text,
  });
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    const data = await res.json();
    if (data.error_code) console.error("Twilio error:", data.message);
    else console.log(`✅ Twilio sent to ${to}: ${text.substring(0, 50)}...`);
  } catch (e) {
    console.error("Twilio send failed:", e.message);
  }
}

// ─── SEND QUICK REPLIES (raw) ─────────────────────────────────
// Note: Twilio doesn't support quick replies — sends as plain text list
async function sendQuickReplies(recipientId, text, replies) {
  // Twilio: send as plain text with numbered options
  if (userChannels[recipientId] === "twilio") {
    const optionsText = text + "\n\n" + replies.map((r, i) => `${i + 1}. ${r}`).join("\n");
    await sendTwilioMessage(recipientId, optionsText);
    return;
  }

  try {
    const quick_replies = replies.map((r) => ({
      content_type: "text",
      title: r.substring(0, 20),
      payload: r.toUpperCase().replace(/[^A-Z0-9]/g, "_").substring(0, 1000),
    }));
    const res = await fetch(
      `https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: { text, quick_replies },
          messaging_type: "RESPONSE",
        }),
      }
    );
    const data = await res.json();
    if (data.error) console.error("QR error:", data.error);
  } catch (e) {
    console.error("QR fetch error:", e.message);
  }
}

// ─── HUMAN-LIKE SEND ──────────────────────────────────────────
async function sendWithTyping(recipientId, text) {
  await sendTypingOn(recipientId);
  const delay = Math.min(900 + text.length * 25, 3000);
  await new Promise((r) => setTimeout(r, delay));
  await sendMessage(recipientId, text);
}

async function sendQRWithTyping(recipientId, text, replies) {
  await sendTypingOn(recipientId);
  const delay = Math.min(900 + text.length * 25, 3000);
  await new Promise((r) => setTimeout(r, delay));
  await sendQuickReplies(recipientId, text, replies);
}

// ─── HOOKS ────────────────────────────────────────────────────
const HOOKS_ROM = [
  `😮‍💨 Subah uthte hi naak band, din bhar sar bhaari...\n\nSinus ek baar pakad le, toh chhod nahi deta.\n\nSahi jagah aaye hain aap. 🌿`,
  `Spray use karte hain? Thodi der rahat — phir wahi band. 😮‍💨\n\nYeh cycle kab tooti hai? Kabhi nahi — jab tak andar ki wajah treat na ho.\n\nSahi jagah aaye hain. 🌿`,
  `Naak band, smell nahi, din bhar bhaari, neend bhi kharab... 😮‍💨\n\nSinus sirf naak ki nahi — poori quality of life ki problem hai.\n\nAap sahi jagah aaye hain. 🌿`,
  `Doctor ke paas gaye, dawai li, kuch dino theek raha — phir wahi wapas. 😮‍💨\n\nIsliye hota hai kyunki sirf symptoms treat hoti hain, andar ki wajah nahi.\n\nSahi jagah aaye hain. 🌿`,
  `Raat ko muh khol ke sote hain? Subah fresh nahi uthte? 😮‍💨\n\nYeh sinus ka classic sign hai — aur iski asli wajah har case mein alag hoti hai.\n\nSahi jagah aaye hain. 🌿`,
];

const HOOKS_DEV = [
  `😮‍💨 सुबह उठते ही नाक बंद, दिन भर सर भारी...\n\nSinus एक बार पकड़ ले, तो छोड़ता नहीं।\n\nसही जगह आए हैं आप। 🌿`,
  `Spray use करते हैं? थोड़ी देर राहत — फिर वही बंद। 😮‍💨\n\nयह cycle कब टूटती है? कभी नहीं — जब तक अंदर की वजह treat न हो।\n\nसही जगह आए हैं। 🌿`,
  `नाक बंद, smell नहीं, दिन भर भारी, नींद भी ख़राब... 😮‍💨\n\nSinus सिर्फ़ नाक की नहीं — पूरी quality of life की problem है।\n\nआप सही जगह आए हैं। 🌿`,
  `Doctor के पास गए, दवाई ली, कुछ दिन ठीक रहा — फिर वही वापस। 😮‍💨\n\nइसलिए होता है क्योंकि सिर्फ़ symptoms treat होती हैं, अंदर की वजह नहीं।\n\nसही जगह आए हैं। 🌿`,
  `रात को मुँह खोल के सोते हैं? सुबह fresh नहीं उठते? 😮‍💨\n\nयह Sinus का classic sign है — और इसकी असली वजह हर case में अलग होती है।\n\nसही जगह आए हैं। 🌿`,
];

// ─── DURATION QUESTION ────────────────────────────────────────
function getDurationQuestion(sc) {
  if (sc === "dev") {
    return {
      text: `यह तकलीफ़ आपको कितने समय से है? 🌿`,
      replies: ["1 महीने से", "6 महीने से", "1-2 साल से", "5+ साल से"],
    };
  }
  return {
    text: `Yeh takleef aapko kitne waqt se hai? 🌿`,
    replies: ["1 mahine se", "6 mahine se", "1-2 saal se", "5+ saal se"],
  };
}

// ─── DURATION EMPATHY ACK ─────────────────────────────────────
function getDurationAck(text, sc) {
  const years = parseInt((text.match(/\d+/) || [])[0]) || 0;
  const tl = text.toLowerCase();
  const isLong = years >= 5 || /\u0032\u0020\u0938\u093e\u0932/.test(tl);
  const isMid = years >= 2 || /saal|year|\u0938\u093e\u0932/.test(tl);
  const isMon = /mahine|month|\u092e\u0939\u0940\u0928/.test(tl);

  if (sc === "dev") {
    if (isLong) return `${years || "कई"} साल से यह तकलीफ़ है... 😮‍💨\n\nइतने समय में सिर्फ़ नाक नहीं — नींद, energy, focus सब affect होता है।\n\nयह case ध्यान से देखते हैं।`;
    if (isMid) return `${years || "कई"} साल से चल रहा है — मतलब यह temporary नहीं, अंदर कुछ set हो चुका है।\n\nSahi diagnosis ज़रूरी है।`;
    if (isMon) return `काफ़ी समय से चल रही है — इस stage पर सही protocol से जल्दी ठीक हो सकता है।`;
    return `ठीक है, समझ गया। पहले properly diagnose करते हैं।`;
  }

  if (isLong) return `${years || "Kai"} saal se yeh takleef hai... 😮‍💨\n\nItne waqt mein sirf naak nahi — neend, energy, focus sab affected hota hai.\n\nYeh case dhyan se dekhte hain.`;
  if (isMid) return `${years || "Kai"} saal se chal raha hai — matlab yeh temporary nahi, andar kuch set ho chuka hai.\n\nSahi diagnosis zaroori hai.`;
  if (isMon) return `Kaafi waqt se chal rahi hai — is stage pe sahi protocol se jaldi theek ho sakta hai.`;
  return `Theek hai, samajh gaya. Pehle properly diagnose karte hain.`;
}

// ─── SYMPTOMS QUESTION ────────────────────────────────────────
function getSymptomsQuestion(sc) {
  if (sc === "dev") {
    return {
      text: `अब बताइए — symptoms क्या हैं? जो भी feel होता है। 🌿`,
      replies: ["नाक बंद रहती है", "Spray use करता हूँ", "Smell नहीं आती", "पीला/हरा discharge"],
    };
  }
  return {
    text: `Ab batao — symptoms kya hain? Jo bhi feel hota hai. 🌿`,
    replies: ["Naak band rehti hai", "Spray use karta hun", "Smell nahi aati", "Peela/hara discharge"],
  };
}

// ─── REVEAL MESSAGES ─────────────────────────────────────────
function getRevealMessage(type, sc) {
  const rom = {
    allergic: `Aapka pattern dekh ke samajh aaya — yeh *Vataja-Kaphaja (Allergic) Sinus* hai. 🌿\n\nEk quick test karo: ghar se bahar jao ya doosre room mein jao. Symptoms wahan thoda different feel hon toh confirm hai.\n\nAur ek clear sign — *aankhein bhi khujlati hain* naak ke saath? Congestive mein kabhi nahi hota. Yeh sign hai?\n\nIs type mein trigger identify hone pe results bahut fast milte hain.`,
    congestive: `Aapka pattern dekh ke samajh aaya — yeh *Kaphaja (Congestive) Sinus* hai. 🌿\n\nEk test karo: sir aage jhukao, chehra neeche, 5 sec ruko. Mathe ya galon mein pressure feel ho toh confirm hai.\n\nSubah uthke pehla adha ghanta sabse bura lagta hai na? Classic Kaphaja — raat bhar mucus jam jaati hai.\n\n*Zaroori:* Dairy is type ka sabse bada dushman hai — protocol ke saath band karni padegi.`,
    spray: `Aapka pattern dekh ke samajh aaya — yeh *Aushadha Asakti (Spray Dependency)* hai. 🌿\n\nEk test: ek raat spray mat lo. Neend mushkil ho — yeh confirm karta hai naak physically dependent ho chuki hai.\n\nSpray ke 2-3 ghante baad pehle se bhi zyada band? Yeh rebound congestion hai.\n\n*Cold turkey kabhi mat karo* — woh isliye fail hota hai. Graduated protocol kaam karta hai.`,
    infective: `Aapka pattern dekh ke samajh aaya — yeh *Pittaja (Infective/Heat) Sinus* hai. 🌿\n\nEk check: upar ke daanton mein halka dard ya heaviness? Direct sinus connection hai.\n\nAntibiotic se 3-4 din theek, band karo toh wapas? Bacterial cycle hai yeh.\n\n*Critical: eucalyptus ya camphor steam kabhi mat karo* — Pittaja mein WORSE karta hai. Sirf plain water.`,
    polyp: `Aapka pattern dekh ke samajh aaya — yeh *Polyp/Blockage Sinus* hai. 🌿\n\nEk test: laung ya adrak naak ke paas laao — kuch smell aaya? Dono taraf equally band?\n\nEk taraf band = Congestive. *Dono taraf equally band = Polyp pattern confirm.*\n\nKai logon ko surgery suggest hui thi — hamare protocol se kai ne bina surgery ke improvement feel ki hai.`,
  };

  const dev = {
    allergic: `आपका pattern देख के समझ आया — यह *Vataja-Kaphaja (Allergic) Sinus* है। 🌿\n\nएक quick test करें: घर से बाहर जाएँ या दूसरे room में। Symptoms वहाँ थोड़े different feel हों तो confirm है।\n\nएक clear sign — *आँखें भी खुजलाती हैं* नाक के साथ? Congestive में कभी नहीं होता। यह sign है?\n\nइस type में trigger identify होने पर results बहुत fast मिलते हैं।`,
    congestive: `आपका pattern देख के समझ आया — यह *Kaphaja (Congestive) Sinus* है। 🌿\n\nएक test करें: सिर आगे झुकाएँ, चेहरा नीचे, 5 sec रुकें। माथे या गालों में pressure feel हो तो confirm है।\n\nसुबह उठके पहला आधा घंटा सबसे बुरा लगता है ना? Classic Kaphaja — रात भर mucus जम जाती है।\n\n*ज़रूरी:* Dairy इस type का सबसे बड़ा दुश्मन है — protocol के साथ बंद करनी पड़ेगी।`,
    spray: `आपका pattern देख के समझ आया — यह *Aushadha Asakti (Spray Dependency)* है। 🌿\n\nएक test: एक रात spray मत लो। नींद मुश्किल हो — यह confirm करता है नाक physically dependent हो चुकी है।\n\nSpray के 2-3 घंटे बाद पहले से भी ज़्यादा बंद? Rebound congestion है यह।\n\n*Cold turkey कभी मत करो* — वो इसलिए fail होता है। Graduated protocol काम करता है।`,
    infective: `आपका pattern देख के समझ आया — यह *Pittaja (Infective/Heat) Sinus* है। 🌿\n\nएक check: ऊपर के दाँतों में हल्का दर्द या heaviness? Direct sinus connection है।\n\nAntibiotic से 3-4 दिन ठीक, बंद करो तो वापस? Bacterial cycle है यह।\n\n*Critical: eucalyptus या camphor steam कभी मत करो* — Pittaja में WORSE करता है। सिर्फ़ plain water।`,
    polyp: `आपका pattern देख के समझ आया — यह *Polyp/Blockage Sinus* है। 🌿\n\nएक test: लौंग या अदरक नाक के पास लाओ — कुछ smell आया? दोनों तरफ equally बंद?\n\nएक तरफ बंद = Congestive। *दोनों तरफ equally बंद = Polyp pattern confirm।*\n\nकई लोगों को surgery suggest हुई थी — हमारे protocol से कई ने बिना surgery के improvement feel की है।`,
  };

  const src = sc === "dev" ? dev : rom;
  return src[type] || src["congestive"];
}

// ─── PITCH MESSAGES ──────────────────────────────────────────
function getPitchMessage(type, sc) {
  const typeNames = {
    allergic:   { rom: "Allergic Sinus",   dev: "Allergic Sinus" },
    congestive: { rom: "Congestive Sinus", dev: "Congestive Sinus" },
    spray:      { rom: "Spray Dependency", dev: "Spray Dependency" },
    infective:  { rom: "Infective Sinus",  dev: "Infective Sinus" },
    polyp:      { rom: "Polyp Sinus",      dev: "Polyp Sinus" },
  };

  const tname = (typeNames[type] || typeNames["congestive"])[sc === "dev" ? "dev" : "rom"];

  if (sc === "dev") {
    return `आपके *${tname}* के लिए ek personalized 14-दिन program है। 🌿\n\n2 options हैं:\n\n🌱 *₹499 — Starter Kit*\nआपके sinus type का self-guided protocol WhatsApp पर। खुद करें, हम guide करते हैं।\n\n---\n\n🌿 *₹1,299 — 14-दिन Nasal Restoration Program*\n⭐ _(सबसे ज़्यादा लिया जाता है)_\n\n*आपको exactly यह मिलेगा:*\n✅ Day 1 — आपकी पूरी history, triggers personally समझेंगे (WhatsApp पर)\n✅ आपके sinus type के लिए custom routine — सुबह 20 मिनट + रात 15 मिनट\n✅ 14 दिन रोज़ मेरा WhatsApp check-in — "आज कैसा रहा?" personally\n✅ कोई दिन problem हो — उसी दिन protocol adjust होगा\n✅ Day 7 + Day 14 — progress review personally\n✅ Program खत्म होने के बाद maintenance guidance free\n\n---\n\nENT doctor एक visit में ₹1,000-2,000 लेता है — और वो रोज़ check नहीं करता।\nयहाँ 14 दिन रोज़ personal attention — सिर्फ़ ₹1,299 एक बार। 🌿\n\nकौनसा option सही लगता है?`;
  }

  return `Aapke *${tname}* ke liye ek personalized 14-din program hai. 🌿\n\n2 options hain:\n\n🌱 *Rs.499 — Starter Kit*\nAapke sinus type ka self-guided protocol WhatsApp pe. Khud karo, hum guide karte hain.\n\n---\n\n🌿 *Rs.1,299 — 14-Din Nasal Restoration Program*\n⭐ _(Sabse zyada liya jaata hai)_\n\n*Exactly yeh milega aapko:*\n✅ Day 1 — Aapki poori history, triggers personally samjhunga (WhatsApp pe)\n✅ Aapke sinus type ki custom routine — subah 20 min + raat 15 min\n✅ 14 din roz mera WhatsApp check-in — "aaj kaisa raha?" personally\n✅ Koi din problem ho — usi din protocol adjust hoga\n✅ Day 7 + Day 14 — progress review personally\n✅ Program ke baad maintenance guidance free\n\n---\n\nENT doctor ek visit mein Rs.1,000-2,000 leta hai — aur woh roz check nahi karta.\nYahan 14 din roz personal attention — sirf Rs.1,299 ek baar. 🌿\n\nKaunsa option sahi lagta hai?`;
}

// ─── SALESOM (Claude AI) ──────────────────────────────────────
async function callSalesom(userMessage, userData) {
  try {
    const sinusLabels = {
      allergic:   "Vataja-Kaphaja (Allergic)",
      congestive: "Kaphaja (Congestive)",
      spray:      "Aushadha Asakti (Spray Dependency)",
      infective:  "Pittaja (Infective/Heat)",
      polyp:      "Polyp/Blockage",
    };

    const contextBlock = `
[CONVERSATION CONTEXT]
- Sinus type: ${sinusLabels[userData.sinusType] || "Unknown"}
- Duration: ${userData.duration || "Not specified"}
- Symptoms described: ${userData.symptoms || "Not specified"}
- Post-pitch reply #: ${userData.postPitchReplies || 0} of 2
- User script: ${userData.script === "dev" ? "Devanagari — MUST reply in Devanagari" : "Roman Hindi / English"}
- Platform: Facebook Messenger
[END CONTEXT]

SCRIPT RULE: ${userData.script === "dev" ? "User writes in Devanagari. YOUR REPLY MUST BE IN DEVANAGARI SCRIPT ONLY." : "Mirror user language — Roman Hindi or English."}
REMINDER: No payment links. No diagnostic restart. Short, mobile-friendly reply. End with soft close or question.`;

    const history = (userData.history || []).slice(-8);

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 350,
      system: SALESOM_SYSTEM_PROMPT + "\n\n" + contextBlock,
      messages: [...history, { role: "user", content: userMessage }],
    });

    const reply = response.content[0].text;

    userData.history = [
      ...history,
      { role: "user", content: userMessage },
      { role: "assistant", content: reply },
    ];

    return reply;
  } catch (err) {
    console.error("Salesom AI error:", err.message);
    return userData.script === "dev"
      ? `समझ गया 🙏 कोई भी सवाल हो — main यहाँ hun। जब ready हो तो बताओ।`
      : `Samajh gaya 🙏 Koi bhi sawaal ho — main yahan hun. Jab ready ho toh batao.`;
  }
}

// ─── GOOGLE SHEET LOGGING ─────────────────────────────────────
async function logToSheet(senderId, name, message, stage, sinusType = "") {
  try {
    const params = new URLSearchParams({
      platform: "Messenger",
      senderId,
      name: name || "Unknown",
      message: message.substring(0, 200),
      status: "🟡",
      stage,
      symptom: sinusType,
    });
    await fetch(`${GAS_URL}?${params.toString()}`, { method: "GET" });
  } catch (e) {
    console.error("Sheet log error:", e.message);
  }
}

// ─── MAIN MESSAGE HANDLER ──────────────────────────────────────
async function handleMessage(senderId, messageText, senderName) {
  const text = messageText.trim();
  const textLower = text.toLowerCase();

  if (!userState[senderId]) {
    userState[senderId] = { state: "new", history: [], script: "rom" };
  }
  const userData = userState[senderId];

  if (detectScript(text) === "dev") userData.script = "dev";
  const sc = userData.script || "rom";

  if (userData.state === "human") return;

  if (text.startsWith("BOT_ON_")) {
    const targetId = text.replace("BOT_ON_", "").trim();
    if (userState[targetId]) {
      userState[targetId].state = "pitched";
      await sendMessage(senderId, `✅ Bot reactivated for ${targetId}`);
    }
    return;
  }

  if (/payment|paid|pay kar|pay kiya|bhej diya|transfer|\u092d\u0941\u0917\u0924\u093e\u0928|\u092a\u0947\u092e\u0947\u0902\u091f/.test(textLower)) {
    userData.state = "done";
    const msg = sc === "dev"
      ? `✅ Payment confirm हो गया! 🌿\n\nMain aapko personally WhatsApp पर connect करूँगा — 85951 60713\n\nWahan se protocol शुरू करेंगे। Welcome to Ayusomam! 🌿`
      : `✅ Payment confirm ho gaya! 🌿\n\nMain tumse personally WhatsApp pe connect karunga — 85951 60713\n\nWahan se protocol shuru karenge. Welcome to Ayusomam! 🌿`;
    await sendWithTyping(senderId, msg);
    await logToSheet(senderId, senderName, "Payment confirmed", "PAID", userData.sinusType);
    return;
  }

  if (userData.state === "new") {
    const idx = Math.floor(Math.random() * HOOKS_ROM.length);
    const hook = sc === "dev" ? HOOKS_DEV[idx] : HOOKS_ROM[idx];
    userData.state = "hook_sent";
    await sendWithTyping(senderId, hook);
    await logToSheet(senderId, senderName, "Hook sent", "HOOK", "");
    return;
  }

  if (userData.state === "hook_sent") {
    const dq = getDurationQuestion(sc);
    userData.state = "asked_duration";
    await sendQRWithTyping(senderId, dq.text, dq.replies);
    return;
  }

  if (userData.state === "asked_duration") {
    userData.duration = text;
    userData.state = "asked_symptoms";

    await sendWithTyping(senderId, getDurationAck(text, sc));
    await new Promise((r) => setTimeout(r, 800));

    const sq = getSymptomsQuestion(sc);
    await sendQRWithTyping(senderId, sq.text, sq.replies);

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

    const analysing = sc === "dev" ? `देख रहे हैं... 🌿` : `Dekh rahe hain... 🌿`;
    await sendWithTyping(senderId, analysing);
    await new Promise((r) => setTimeout(r, 700));

    await sendWithTyping(senderId, getRevealMessage(sinusType, sc));
    await logToSheet(senderId, senderName, `Symptoms: ${text}`, "REVEALED", sinusType);
    return;
  }

  if (userData.state === "revealed") {
    userData.state = "pitched";

    await sendWithTyping(senderId, getPitchMessage(userData.sinusType, sc));
    await new Promise((r) => setTimeout(r, 700));

    const qr = sc === "dev"
      ? { text: `कौनसा option सही लगता है? 🌿`, replies: ["Full Program (₹1,299)", "Starter Kit (₹499)", "पहले सवाल है"] }
      : { text: `Kaunsa option sahi lagta hai? 🌿`, replies: ["Full Program (₹1,299)", "Starter Kit (₹499)", "Pehle sawaal hai"] };
    await sendQRWithTyping(senderId, qr.text, qr.replies);

    await logToSheet(senderId, senderName, `Pitched: ${userData.sinusType}`, "PITCHED", userData.sinusType);
    return;
  }

  if (userData.state === "pitched") {

    if (userData.postPitchReplies >= 2) {
      userData.state = "human";
      await logToSheet(senderId, senderName, `Auto handoff`, "HUMAN_TAKEOVER", userData.sinusType);
      return;
    }

    const userSaidYes = /haan|ha |yes|theek|ok\b|okay|shuru|karein|karna|chahta|chahti|le leta|le lungi|lena\b|interested|1299|499|full program|starter|bhejo|link bhejo|link do|send link|\u0939\u093e\u0902|\u0920\u0940\u0915|\u0932\u0947\u0928\u093e\u00a0|\u0932\u0947\u0928\u093e/.test(textLower);

    if (userSaidYes) {
      userData.postPitchReplies = (userData.postPitchReplies || 0) + 1;
      const linkMsg = sc === "dev"
        ? `बहुत अच्छा! 🌿\n\nPayment links:\n\n🌱 *₹499 Starter:* ${PAYMENT_499}\n\n🌿 *₹1,299 Full Program:* ${PAYMENT_1299}\n\nPayment के बाद confirm करना — main personally WhatsApp पर connect करूँगा। 🌿`
        : `Bahut acha! 🌿\n\nPayment links:\n\n🌱 *Rs.499 Starter:* ${PAYMENT_499}\n\n🌿 *Rs.1,299 Full Program:* ${PAYMENT_1299}\n\nPayment ke baad confirm karna — main personally WhatsApp pe connect karunga. 🌿`;
      const confirmReplies = sc === "dev"
        ? ["Payment कर दिया ✅", "एक सवाल और"]
        : ["Payment kar diya ✅", "Ek sawaal aur"];
      await sendQRWithTyping(senderId, linkMsg, confirmReplies);
      await logToSheet(senderId, senderName, `Yes: ${text}`, "LINK_SENT", userData.sinusType);
      return;
    }

    userData.postPitchReplies = (userData.postPitchReplies || 0) + 1;

    await sendTypingOn(senderId);
    await new Promise((r) => setTimeout(r, 900));

    const aiReply = await callSalesom(text, userData);
    await sendWithTyping(senderId, aiReply);

    if (userData.postPitchReplies < 2) {
      await new Promise((r) => setTimeout(r, 600));
      const nudgeReplies = sc === "dev"
        ? ["हाँ, शुरू करना है", "एक और सवाल है", "सोचना है थोड़ा"]
        : ["Haan, shuru karna hai", "Ek aur sawaal hai", "Sochna hai thoda"];
      await sendQRWithTyping(senderId, `🌿`, nudgeReplies);
    } else {
      await new Promise((r) => setTimeout(r, 800));
      const handoffMsg = sc === "dev"
        ? `आपका सवाल हमारे *Sinus Relief Specialist* तक पहुँचा दिया है। 🌿\n\nयहाँ wait करें — थोड़ी देर में reply आएगा।\n\nया सीधे WhatsApp करें: 📱 *85951 60713*`
        : `Tumhara sawaal hamare *Sinus Relief Specialist* tak pahuncha diya hai. 🌿\n\nYahan wait karo — thodi der mein reply aayega.\n\nYa seedha WhatsApp karo: 📱 *85951 60713*`;
      await sendWithTyping(senderId, handoffMsg);
      userData.state = "human";
      await logToSheet(senderId, senderName, `Handoff: ${text}`, "HUMAN_TAKEOVER", userData.sinusType);
    }

    await logToSheet(senderId, senderName, `AI: ${text}`, "AI_REPLY", userData.sinusType);
    return;
  }

  if (userData.state === "done") {
    const msg = sc === "dev"
      ? `Protocol चल रहा है! 🌿 कोई सवाल हो तो WhatsApp पर पूछो — 85951 60713`
      : `Protocol chal raha hai! 🌿 Koi sawaal ho toh WhatsApp pe poochho — 85951 60713`;
    await sendWithTyping(senderId, msg);
    return;
  }

  userData.state = "new";
  userData.history = [];
  await handleMessage(senderId, messageText, senderName);
}

// ─── HUMAN TAKEOVER ───────────────────────────────────────────
async function handlePageMessage(senderId, sendingPageId) {
  if (sendingPageId && userState[senderId]) {
    userState[senderId].state = "human";
    console.log(`🔴 Human takeover activated for ${senderId}`);
  }
}

// ─── WEBHOOK ROUTES ───────────────────────────────────────────

app.get("/webhook", (req, res) => {
  if (req.query["hub.verify_token"] === VERIFY_TOKEN) {
    res.send(req.query["hub.challenge"]);
  } else {
    res.sendStatus(403);
  }
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

        const MSG_AGE_LIMIT_MS = 5 * 60 * 1000;
        if (event.timestamp && Date.now() - event.timestamp > MSG_AGE_LIMIT_MS) {
          console.log(`⏭️ Skipped old message (${Math.round((Date.now() - event.timestamp) / 1000)}s old) from ${senderId}`);
          continue;
        }

        if (event.message?.mid) {
          if (processedMessages.has(event.message.mid)) {
            console.log(`⏭️ Duplicate skipped: ${event.message.mid}`);
            continue;
          }
          processedMessages.add(event.message.mid);
        }

        if (event.sender?.id === entry.id) {
          await handlePageMessage(event.recipient?.id, event.sender?.id);
          continue;
        }

        if (event.message?.text) {
          await handleMessage(senderId, event.message.text, "User");
        }
      }
    }
  } catch (err) {
    console.error("Webhook error:", err);
  }
});

// ─── TWILIO WHATSAPP ROUTE ────────────────────────────────────
app.post("/twilio", async (req, res) => {
  res.sendStatus(200);
  try {
    const from = req.body.From; // e.g. 'whatsapp:+919XXXXXXXXX'
    const text = req.body.Body;
    if (!from || !text) return;
    const senderId = from.replace("whatsapp:", "");
    userChannels[senderId] = "twilio"; // mark as Twilio channel
    console.log(`📱 Twilio message from ${senderId}: ${text.substring(0, 50)}`);
    await handleMessage(senderId, text, "User");
  } catch (err) {
    console.error("Twilio webhook error:", err);
  }
});

app.get("/", (req, res) => res.send("Ayusomam Bot v2.5 — Messenger + Twilio WhatsApp 🌿"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌿 Ayusomam Bot v2.5 running on port ${PORT}`));
