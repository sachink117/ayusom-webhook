// ============================================================
// AYUSOMAM MESSENGER BOT
// Version 3.0 — 4 fixes: duration bug, commit flow, Hindi, post-payment
// ============================================================
const express = require("express");
const fetch = require("node-fetch");
const Anthropic = require("@anthropic-ai/sdk");
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ─── CONFIG ────────────────────────────────────────────────────
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
Ayusomam Herbals | Sinus Sales Specialist | Complete Deployment Prompt

IDENTITY
Tu SALESOM hai — Ayusomam Herbals ka Sinus Sales Specialist aur Ayurvedic Consultation AI.
- Brand: Ayusomam Herbals (ayusomamherbals.com)
- Consultant name: Sachin
- Platform: WhatsApp / Facebook Messenger
- Core expertise: Charaka Samhita + Ashtanga Hridayam based Pratishyaya (Sinus) management
- Mission: Type-specific Ayurvedic sinus consultation → 14-Din Protocol conversion

LANGUAGE + SCRIPT RULES — HIGHEST PRIORITY
Auto-detect from every message:
- Devanagari script (हिंदी में लिखा) → Reply in Devanagari script ONLY
- Roman Hindi / Hinglish → Roman Hindi reply
- English → English reply
- Marathi → Marathi reply

CRITICAL: Mirror the SCRIPT, not just the language. If user writes in Devanagari, ALL your text must be in Devanagari.
Never ask about language. Detect and mirror instantly.
Once script set — maintain it for entire conversation unless user switches.

HINDI LANGUAGE RULES — VERY IMPORTANT:
Jab user Devanagari mein likhe — reply mein English words MINIMUM rakho:
- "protocol" → "नियम" ya "दिनचर्या"
- "symptoms" → "लक्षण"
- "trigger" → "कारण"
- "routine" → "दिनचर्या"
- "progress" → "सुधार"
- "confirm" → "पक्का करें"
- "day" → "दिन"
- "type" → "प्रकार"
- "program" → "कार्यक्रम"
- "check-in" → "जाँच"
- "morning" → "सुबह"
- "specialist" → "विशेषज्ञ"
Sirf brand names, medicine names, aur numbers English mein rakh sakte ho.
Maximum 10% English words in Devanagari replies.

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

UPSELL RULE (499 → 1299):
₹1,299 wale mein 7 din FREE extra milte hain → total 21 din. Sirf ₹800 zyada mein 50% zyada samay.
Jo log 2+ saal se pareshan hain unhe yeh extra time bahut kaam aata hai. Naturally mention karo.

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
- If user says yes/wants to buy — respond warmly but NO payment links. System handles.
- POST-PAYMENT: If state is post_payment, user has already paid. Be warm, supportive, answer questions about how the program works. Do NOT send payment links. For 499 users, naturally mention 1299 upgrade (7 free days = 21 days total).`;

// ─── SCRIPT DETECTION ────────────────────────────────────────
function detectScript(text) {
  return /[\u0900-\u097F]/.test(text) ? "dev" : "rom";
}

// ─── SINUS TYPE DETECTION ────────────────────────────────────
function detectSinusType(text) {
  const t = text.toLowerCase();
  if (/spray|nasivion|otrivin|otrivine|bina spray|afrin|chhodna|chhod nahi|dependent|\u0938\u094d\u092a\u094d\u0930\u0947/.test(t)) return "spray";
  if (/smell nahi|taste nahi|bilkul band|dono taraf|surgery|polyp|growth|\u0917\u0902\u0927 \u0928\u0939\u0940\u0902|\u0928\u093e\u0915 \u092c\u0902\u0926/.test(t)) return "polyp";
  if (/peela|peeli|hara|hari|infection|antibiotic|burning|jalan|\u091c\u0932\u0928|\u092a\u0940\u0932\u093e|\u0938\u0902\u0915\u094d\u0930\u092e\u0923/.test(t)) return "infective";
  if (/dhool|dust|smoke|dhuan|season|chheenk|sneez|allerg|\u091b\u0940\u0902\u0915|\u0927\u0942\u0932|\u090f\u0932\u0930\u094d\u091c\u0940/.test(t)) return "allergic";
  return "congestive";
}

// ─── SEND TYPING INDICATOR ───────────────────────────────────
async function sendTypingOn(recipientId) {
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

// ─── SEND MESSAGE ────────────────────────────────────────────
async function sendMessage(recipientId, text) {
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

// ─── TWILIO SEND MESSAGE ─────────────────────────────────────
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

// ─── SEND QUICK REPLIES ──────────────────────────────────────
async function sendQuickReplies(recipientId, text, replies) {
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

// ─── HUMAN-LIKE SEND ─────────────────────────────────────────
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

// ─── HOOKS ───────────────────────────────────────────────────
const HOOKS_ROM = [
  `😮‍💨 Subah uthte hi naak band, din bhar sar bhaari...\n\nSinus ek baar pakad le, toh chhod nahi deta.\n\nSahi jagah aaye hain aap. 🌿`,
  `Spray use karte hain? Thodi der rahat — phir wahi band. 😮‍💨\n\nYeh cycle kab tooti hai? Kabhi nahi — jab tak andar ki wajah treat na ho.\n\nSahi jagah aaye hain. 🌿`,
  `Naak band, smell nahi, din bhar bhaari, neend bhi kharab... 😮‍💨\n\nSinus sirf naak ki nahi — poori zindagi ki dikkat hai.\n\nAap sahi jagah aaye hain. 🌿`,
  `Doctor ke paas gaye, dawai li, kuch dino theek raha — phir wahi wapas. 😮‍💨\n\nIsliye hota hai kyunki sirf upar ki takleef theek hoti hai, andar ki wajah nahi.\n\nSahi jagah aaye hain. 🌿`,
  `Raat ko muh khol ke sote hain? Subah taaza nahi uthte? 😮‍💨\n\nYeh sinus ka pehchana sign hai — aur iski asli wajah har case mein alag hoti hai.\n\nSahi jagah aaye hain. 🌿`,
];

const HOOKS_DEV = [
  `😮‍💨 सुबह उठते ही नाक बंद, दिन भर सर भारी...\n\nSinus एक बार पकड़ ले, तो छोड़ता नहीं।\n\nसही जगह आए हैं आप। 🌿`,
  `Spray लेते हैं? थोड़ी देर राहत — फिर वही बंद। 😮‍💨\n\nयह चक्र कब टूटता है? कभी नहीं — जब तक अंदर की वजह ठीक न हो।\n\nसही जगह आए हैं। 🌿`,
  `नाक बंद, गंध नहीं, दिन भर भारी, नींद भी ख़राब... 😮‍💨\n\nSinus सिर्फ़ नाक की नहीं — पूरी ज़िंदगी की दिक्कत है।\n\nआप सही जगह आए हैं। 🌿`,
  `डॉक्टर के पास गए, दवाई ली, कुछ दिन ठीक रहा — फिर वही वापस। 😮‍💨\n\nइसलिए होता है क्योंकि सिर्फ़ ऊपर की तकलीफ़ ठीक होती है, अंदर की वजह नहीं।\n\nसही जगह आए हैं। 🌿`,
  `रात को मुँह खोल के सोते हैं? सुबह तरोताज़ा नहीं उठते? 😮‍💨\n\nयह Sinus की पहचानी निशानी है — और इसकी असली वजह हर case में अलग होती है।\n\nसही जगह आए हैं। 🌿`,
];

// ─── DURATION QUESTION ───────────────────────────────────────
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

// ─── DURATION EMPATHY ACK — FIX #1: 6 mahine ≠ 6 saal ───────
function getDurationAck(text, sc) {
  const num = parseInt((text.match(/\d+/) || [])[0]) || 0;
  const tl = text.toLowerCase();

  // CHECK MONTHS FIRST — prevent 6 mahine being read as 6 saal
  const isMon = /mahine|mahina|month|\u092e\u0939\u0940\u0928/.test(tl);
  const years = isMon ? 0 : num;
  const isLong = !isMon && years >= 5;
  const isMid = !isMon && (years >= 2 || /saal|year|\u0938\u093e\u0932/.test(tl));

  if (sc === "dev") {
    if (isMon) return `${num} महीने से चल रही है — अभी सही समय है।\nपहले ठीक से समझते हैं।`;
    if (isLong) return `${years} साल से यह तकलीफ़ है... 😮‍💨\nइतने समय में नींद, ताकत, ध्यान — सब पर असर पड़ चुका है।\nइस case को ध्यान से देखते हैं।`;
    if (isMid) return `${years} साल से चल रहा है — मतलब यह अस्थायी नहीं, अंदर कुछ जम चुका है।\nसही पहचान ज़रूरी है।`;
    return `ठीक है, समझ गया। पहले ठीक से जाँच करते हैं।`;
  }
  if (isMon) return `${num} mahine se chal rahi hai — abhi sahi waqt hai.\nPehle theek se samajhte hain.`;
  if (isLong) return `${years} saal se yeh takleef hai... 😮‍💨\nItne waqt mein neend, taakat, dhyan — sab affected ho chuka hai.\nYeh case dhyan se dekhte hain.`;
  if (isMid) return `${years} saal se chal raha hai — matlab yeh temporary nahi, andar kuch set ho chuka hai.\nSahi diagnosis zaroori hai.`;
  return `Theek hai, samajh gaya. Pehle theek se jaanch karte hain.`;
}

// ─── SYMPTOMS QUESTION ───────────────────────────────────────
function getSymptomsQuestion(sc) {
  if (sc === "dev") {
    return {
      text: `अब बताइए — क्या-क्या लक्षण हैं? जो भी महसूस होता है। 🌿`,
      replies: ["नाक बंद रहती है", "Spray लेता/लेती हूँ", "गंध नहीं आती", "पीला/हरा बहाव"],
    };
  }
  return {
    text: `Ab batao — kya kya takleef hai? Jo bhi feel hota hai. 🌿`,
    replies: ["Naak band rehti hai", "Spray use karta hun", "Smell nahi aati", "Peela/hara discharge"],
  };
}

// ─── REVEAL MESSAGES ─────────────────────────────────────────
function getRevealMessage(type, sc) {
  const rom = {
    allergic: `Aapki sthiti dekh ke samajh aaya — yeh *Vataja-Kaphaja (Allergic) Sinus* hai. 🌿\n\nEk quick test karo: ghar se bahar jao ya doosre room mein jao. Takleef wahan thodi different feel ho toh confirm hai.\n\nAur ek clear sign — *aankhein bhi khujlati hain* naak ke saath? Congestive mein kabhi nahi hota. Yeh sign hai?\n\nIs type mein asli wajah identify hone pe sudhar bahut fast milta hai.`,
    congestive: `Aapki sthiti dekh ke samajh aaya — yeh *Kaphaja (Congestive) Sinus* hai. 🌿\n\nEk test karo: sir aage jhukao, chehra neeche, 5 sec ruko. Mathe ya galon mein bojh feel ho toh confirm hai.\n\nSubah uthke pehla adha ghanta sabse bura lagta hai na? Classic Kaphaja — raat bhar mucus jam jaati hai.\n\n*Zaroori:* Dairy is type ka sabse bada dushman hai — niyam ke saath band karni padegi.`,
    spray: `Aapki sthiti dekh ke samajh aaya — yeh *Aushadha Asakti (Spray Dependency)* hai. 🌿\n\nEk test: ek raat spray mat lo. Neend mushkil ho — yeh confirm karta hai naak physically spray pe nirbhar ho chuki hai.\n\nSpray ke 2-3 ghante baad pehle se bhi zyada band? Yeh rebound congestion hai.\n\n*Ek dum band kabhi mat karo* — woh isliye fail hota hai. Dheere dheere chhudwane ka niyam kaam karta hai.`,
    infective: `Aapki sthiti dekh ke samajh aaya — yeh *Pittaja (Infective/Heat) Sinus* hai. 🌿\n\nEk check: upar ke daanton mein halka dard ya bojh? Direct sinus connection hai.\n\nAntibiotic se 3-4 din theek, band karo toh wapas? Yeh bacterial chakkar hai.\n\n*Zaroori: eucalyptus ya camphor steam kabhi mat karo* — Pittaja mein WORSE karta hai. Sirf sada paani.`,
    polyp: `Aapki sthiti dekh ke samajh aaya — yeh *Polyp/Blockage Sinus* hai. 🌿\n\nEk test: laung ya adrak naak ke paas laao — kuch smell aaya? Dono taraf equally band?\n\nEk taraf band = Congestive. *Dono taraf equally band = Polyp pattern confirm.*\n\nKai logon ko surgery suggest hui thi — hamare niyam se kai ne bina surgery ke sudhar feel kiya hai.`,
  };
  const dev = {
    allergic: `आपकी स्थिति देख के समझ आया — यह *Vataja-Kaphaja (एलर्जिक Sinus)* है। 🌿\n\nएक quick जाँच करें: घर से बाहर जाएँ या दूसरे कमरे में। तकलीफ़ वहाँ थोड़ी अलग लगे तो पक्का है।\n\nएक और निशानी — *आँखें भी खुजलाती हैं* नाक के साथ? जमाव वाले में कभी नहीं होता। यह निशानी है?\n\nइस प्रकार में असली कारण पहचानने पर सुधार बहुत जल्दी मिलता है।`,
    congestive: `आपकी स्थिति देख के समझ आया — यह *Kaphaja (जमाव वाला Sinus)* है। 🌿\n\nएक जाँच करें: सिर आगे झुकाएँ, चेहरा नीचे, 5 पल रुकें। माथे या गालों में बोझ लगे तो पक्का है।\n\nसुबह उठके पहला आधा घंटा सबसे बुरा लगता है ना? — रात भर बलगम जम जाता है।\n\n*ज़रूरी:* दूध-दही इस प्रकार का सबसे बड़ा दुश्मन है — नियम के साथ बंद करना पड़ेगा।`,
    spray: `आपकी स्थिति देख के समझ आया — यह *Spray पर निर्भरता (Aushadha Asakti)* है। 🌿\n\nएक जाँच: एक रात spray मत लें। नींद मुश्किल हो — यह पक्का करता है नाक physically spray पर निर्भर हो चुकी है।\n\nSpray के 2-3 घंटे बाद पहले से भी ज़्यादा बंद? यह rebound बंदिश है।\n\n*एकदम बंद कभी मत करें* — वो इसलिए काम नहीं करता। धीरे-धीरे छुड़वाने का नियम काम करता है।`,
    infective: `आपकी स्थिति देख के समझ आया — यह *Pittaja (संक्रामक/गर्मी वाला Sinus)* है। 🌿\n\nएक जाँच: ऊपर के दाँतों में हल्का दर्द या बोझ? सीधा sinus से जुड़ा है।\n\nएंटीबायोटिक से 3-4 दिन ठीक, बंद करो तो वापस? यह जीवाणु का चक्र है।\n\n*ज़रूरी: eucalyptus या camphor भाप कभी मत लें* — इस प्रकार में WORSE करता है। सिर्फ़ सादा पानी।`,
    polyp: `आपकी स्थिति देख के समझ आया — यह *Polyp/रुकावट वाला Sinus* है। 🌿\n\nएक जाँच: लौंग या अदरक नाक के पास लाओ — कुछ गंध आई? दोनों तरफ बराबर बंद?\n\nएक तरफ बंद = जमाव वाला। *दोनों तरफ बराबर बंद = Polyp पक्का।*\n\nकई लोगों को operation बताई गई थी — हमारे नियम से कई ने बिना operation के सुधार महसूस किया है।`,
  };
  const src = sc === "dev" ? dev : rom;
  return src[type] || src["congestive"];
}

// ─── PITCH MESSAGES — FIX #3: Simple Hindi ───────────────────
function getPitchMessage(type, sc) {
  const typeNames = {
    allergic:   { rom: "Allergic Sinus",    dev: "एलर्जिक Sinus" },
    congestive: { rom: "Congestive Sinus",  dev: "जमाव वाला Sinus" },
    spray:      { rom: "Spray Dependency",  dev: "Spray निर्भरता" },
    infective:  { rom: "Infective Sinus",   dev: "संक्रामक Sinus" },
    polyp:      { rom: "Polyp Sinus",       dev: "Polyp Sinus" },
  };
  const tname = (typeNames[type] || typeNames["congestive"])[sc === "dev" ? "dev" : "rom"];

  if (sc === "dev") {
    return `आपके *${tname}* के लिए एक खास 14-दिन का कार्यक्रम है। 🌿\n\n2 विकल्प हैं:\n\n🌱 *₹499 — Starter Kit*\nआपके sinus प्रकार की स्व-निर्देशित दिनचर्या — WhatsApp पर। खुद करें, हम मार्गदर्शन देते हैं।\n\n---\n\n🌿 *₹1,299 — 14-दिन Nasal Restoration*\n⭐ _(सबसे ज़्यादा लिया जाता है)_\n\n*आपको exactly यह मिलेगा:*\n✅ पहले दिन — आपकी पूरी जानकारी, कारण personally समझेंगे (WhatsApp पर)\n✅ आपके sinus प्रकार के लिए खास दिनचर्या — सुबह 20 मिनट + रात 15 मिनट\n✅ 14 दिन रोज़ WhatsApp पर जाँच — "आज कैसा रहा?" personally\n✅ किसी दिन तकलीफ़ हो — उसी दिन नियम बदलेगा\n✅ दिन 7 + दिन 14 — सुधार की समीक्षा personally\n✅ कार्यक्रम के बाद देखभाल की सलाह मुफ़्त\n\n---\n\nडॉक्टर एक मुलाक़ात में ₹1,000-2,000 लेते हैं — और वो रोज़ जाँच नहीं करते।\nयहाँ 14 दिन रोज़ personal ध्यान — सिर्फ़ ₹1,299 एक बार। 🌿\n\nकौनसा विकल्प सही लगता है?`;
  }
  return `Aapke *${tname}* ke liye ek khas 14-din ka program hai. 🌿\n\n2 options hain:\n\n🌱 *Rs.499 — Starter Kit*\nAapke sinus type ki self-guided dinchrya — WhatsApp pe. Khud karo, hum guide karte hain.\n\n---\n\n🌿 *Rs.1,299 — 14-Din Nasal Restoration Program*\n⭐ _(Sabse zyada liya jaata hai)_\n\n*Exactly yeh milega aapko:*\n✅ Day 1 — Aapki poori history, triggers personally samjhunga (WhatsApp pe)\n✅ Aapke sinus type ki khas dinchrya — subah 20 min + raat 15 min\n✅ 14 din roz WhatsApp pe jaanch — "aaj kaisa raha?" personally\n✅ Koi din takleef ho — usi din niyam badlega\n✅ Day 7 + Day 14 — sudhar ki samiksha personally\n✅ Program ke baad dekhbhal ki salah free\n\n---\n\nENT doctor ek visit mein Rs.1,000-2,000 leta hai — aur woh roz check nahi karta.\nYahan 14 din roz personal dhyan — sirf Rs.1,299 ek baar. 🌿\n\nKaunsa option sahi lagta hai?`;
}

// ─── POST-PAYMENT: HOW IT WORKS — FIX #4 ───────────────────
function getPostPaymentExplanation(sinusType, plan, sc) {
  const typeLabels = {
    allergic:   { rom: "Allergic Sinus (Vataja-Kaphaja)", dev: "एलर्जिक Sinus" },
    congestive: { rom: "Congestive Sinus (Kaphaja)",      dev: "जमाव वाला Sinus" },
    spray:      { rom: "Spray Dependency",                dev: "Spray निर्भरता" },
    infective:  { rom: "Infective Sinus (Pittaja)",       dev: "संक्रामक Sinus" },
    polyp:      { rom: "Polyp Sinus",                     dev: "Polyp Sinus" },
  };
  const days = plan === 1299 ? 21 : 14;
  const tname = (typeLabels[sinusType] || typeLabels["congestive"])[sc === "dev" ? "dev" : "rom"];

  if (sc === "dev") {
    return `कैसे काम होगा — ${days} दिनों में 🌿\n\nआपकी तकलीफ़ की पहचान हो चुकी है: *${tname}*\n\nइस प्रकार के अनुसार आपकी खास दिनचर्या बनेगी:\n• सुबह 20 मिनट + रात 15 मिनट की योजना\n• हर दिन के साथ क्या सुधार होगा — पहले से तय रहता है\n• अगर किसी दिन कुछ अलग लगे — उसी दिन बदलाव होगा\n\nसब कुछ इसी WhatsApp पर होगा — कोई app नहीं, कोई अस्पताल नहीं।\nएक Sinus Relief Specialist ${days} दिन आपके साथ यहाँ रहेंगे। 🌿`;
  }
  return `Kaise kaam hoga — ${days} dinon mein 🌿\n\nAapki takleef ki pehchaan ho chuki hai: *${tname}*\n\nIs type ke hisaab se aapki khas dinchrya banegi:\n• Subah 20 min + Raat 15 min ki yogna\n• Har din ke saath kya sudhar hoga — pehle se tay rehta hai\n• Agar kisi din kuch alag lage — usi din badlaav hoga\n\nSab kuch isi WhatsApp par hoga — koi app nahi, koi hospital nahi.\nEk Sinus Relief Specialist ${days} din aapke saath yahaan rahenge. 🌿`;
}

// ─── POST-PAYMENT: 1299 UPSELL (all 3 variants) — FIX #4 ────
function getUpsellMessage(sc) {
  if (sc === "dev") {
    return `एक बात बताता हूँ — 🌿\n\n₹1,299 वाले कार्यक्रम में *7 दिन बिल्कुल मुफ़्त* मिलते हैं → कुल *21 दिन*, वही विशेषज्ञ, वही WhatsApp सहायता।\n\nसिर्फ़ ₹800 ज़्यादा में 50% ज़्यादा समय। जो लोग लंबे समय से परेशान हैं, उन्हें यह अतिरिक्त समय बहुत काम आता है।\n\nसोचना है? बस *"upgrade"* लिखें — link भेज देता हूँ। 🌿`;
  }
  // Detect if message was in English (not Hinglish)
  return `Ek baat batata hun — 🌿\n\n₹1,299 wale program mein *7 din bilkul free* milte hain → total *21 din*, wahi specialist, wahi WhatsApp support.\n\nSirf ₹800 zyada mein 50% zyada waqt. Jo log lambe waqt se pareshan hain, unhe yeh extra time bahut kaam aata hai.\n\nSochna hai? Bas *"upgrade"* likho — link bhej deta hun. 🌿`;
}

function getUpsellMessageEng() {
  return `Quick note — 🌿\n\nThe ₹1,299 program includes *7 extra days FREE* → total *21 days*, same specialist, same WhatsApp support.\n\nJust ₹800 more for 50% extra time. For those with long-standing sinus issues, this extended period makes a real difference.\n\nInterested? Just type *"upgrade"* and I'll send the link. 🌿`;
}

// ─── SALESOM (Claude AI) ─────────────────────────────────────
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
- Current state: ${userData.state}
- Selected plan: ${userData.selectedPlan ? "Rs." + userData.selectedPlan : "Not selected"}
- Post-pitch reply #: ${userData.postPitchReplies || 0}
- User script: ${userData.script === "dev" ? "Devanagari — MUST reply in Devanagari only, minimum English" : "Roman Hindi / English"}
- Platform: WhatsApp / Messenger
[END CONTEXT]

SCRIPT RULE: ${userData.script === "dev" ? "User writes in Devanagari. YOUR REPLY MUST BE IN DEVANAGARI SCRIPT ONLY. Use simple Hindi words — protocol=नियम, symptoms=लक्षण, day=दिन, routine=दिनचर्या" : "Mirror user language — Roman Hindi or English."}
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

// ─── GOOGLE SHEET LOGGING ────────────────────────────────────
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

// ─── MAIN MESSAGE HANDLER ────────────────────────────────────
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

  // ─── PAYMENT CONFIRMATION — FIX #4 ───────────────────────
  if (/payment|paid|pay kar|pay kiya|bhej diya|transfer|done\b|\u092d\u0075\u0917\u0924\u093e\u0928|\u092a\u0947\u092e\u0947\u0902\u091f/.test(textLower)) {
    userData.state = "post_payment";
    userData.postPaymentReplies = 0;
    const days = userData.selectedPlan === 1299 ? 21 : 14;
    const msg = sc === "dev"
      ? `✅ Payment पक्की हो गई! 🌿\n\nआपके *${days}-दिन Nasal Restoration* की शुरुआत होने वाली है।\n\nमैं जल्द ही WhatsApp पर personally जोड़ूँगा — 85951 60713\n\nAyusomam में आपका स्वागत है! 🌿`
      : `✅ Payment pakki ho gayi! 🌿\n\nAapke *${days}-Din Nasal Restoration* ki shuruaat hone waali hai.\n\nMain jald hi WhatsApp pe personally connect karunga — 85951 60713\n\nAyusomam mein aapka swagat hai! 🌿`;
    await sendWithTyping(senderId, msg);
    await logToSheet(senderId, senderName, "Payment confirmed", "PAID", userData.sinusType);
    return;
  }

  // ─── POST-PAYMENT SMART CONVERSATIONS — FIX #4 ───────────
  if (userData.state === "post_payment") {
    userData.postPaymentReplies = (userData.postPaymentReplies || 0) + 1;
    const treatmentQ = /kaise hoga|kya hoga|kaise kaam|how.*work|ilaj|treatment|plan|explain|batao|samjhao|kya milega|\u0915\u0948\u0938\u0947|\u0907\u0932\u093e\u091c|\u092f\u094b\u091c\u0928\u093e|\u0915\u094d\u092f\u093e \u0939\u094b\u0917\u093e/.test(textLower);
    const upgradeQ = /upgrade|1299|full|poora|21 din|zyada din/.test(textLower);
    const linkRepeat = /link|payment link|pay|bhejo link|\u0932\u093f\u0902\u0915/.test(textLower);
    const isEnglish = !/[\u0900-\u097F]/.test(text) && !/[a-z].*[a-z].*[a-z]/.test(text.replace(/[aeiou]/gi, ""));

    // Upgrade request
    if (upgradeQ && userData.selectedPlan === 499) {
      const upgradeMsg = sc === "dev"
        ? `बढ़िया फ़ैसला! 🌿\n\n*₹1,299 — 21-दिन Full Program*\n🌿 ${PAYMENT_1299}\n\nPayment के बाद यहाँ "done" लिखना — personally जोड़ते हैं।`
        : `Badhiya! 🌿\n\n*Rs.1,299 — 21-Din Full Program*\n🌿 ${PAYMENT_1299}\n\nPayment ke baad yahan "done" likhna — personally connect honge.`;
      await sendWithTyping(senderId, upgradeMsg);
      await logToSheet(senderId, senderName, "Upgrade to 1299", "UPGRADE", userData.sinusType);
      return;
    }

    // Don't repeat payment link — just remind where it is
    if (linkRepeat) {
      const msg = sc === "dev"
        ? `Payment link ऊपर भेज दिया था। 🌿\nPayment के बाद यहाँ "done" लिखना — हम आगे बढ़ेंगे।`
        : `Payment link upar bhej diya tha. 🌿\nPayment ke baad yahan "done" likhna — hum aage badheinge.`;
      await sendWithTyping(senderId, msg);
      return;
    }

    // Treatment explanation
    if (treatmentQ) {
      await sendWithTyping(senderId, getPostPaymentExplanation(userData.sinusType, userData.selectedPlan, sc));
      // Upsell for 499 users after explaining
      if (userData.selectedPlan === 499) {
        await new Promise((r) => setTimeout(r, 900));
        const upsell = detectScript(text) === "dev" ? getUpsellMessage("dev") : (isEnglish ? getUpsellMessageEng() : getUpsellMessage("rom"));
        await sendWithTyping(senderId, upsell);
      }
      return;
    }

    // After 3 replies, route to WhatsApp specialist
    if (userData.postPaymentReplies > 3) {
      const routeMsg = sc === "dev"
        ? `आपका सवाल हमारे Sinus Relief Specialist तक पहुँचा दिया है। 🌿\nसीधे WhatsApp करें: 📱 *85951 60713*`
        : `Tumhara sawaal hamare Sinus Relief Specialist tak pahuncha diya hai. 🌿\nSeedha WhatsApp karo: 📱 *85951 60713*`;
      await sendWithTyping(senderId, routeMsg);
      userData.state = "human";
      await logToSheet(senderId, senderName, "Post-payment handoff", "HUMAN_TAKEOVER", userData.sinusType);
      return;
    }

    // AI handles general post-payment questions
    const aiReply = await callSalesom(text, userData);
    await sendWithTyping(senderId, aiReply);

    // Show upsell to 499 users on 2nd post-payment reply
    if (userData.selectedPlan === 499 && userData.postPaymentReplies === 2) {
      await new Promise((r) => setTimeout(r, 700));
      const upsell = sc === "dev" ? getUpsellMessage("dev") : (isEnglish ? getUpsellMessageEng() : getUpsellMessage("rom"));
      await sendWithTyping(senderId, upsell);
    }
    await logToSheet(senderId, senderName, `Post-pay Q: ${text}`, "POST_PAYMENT", userData.sinusType);
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
      ? { text: `कौनसा विकल्प सही लगता है? 🌿`, replies: ["Full Program (₹1,299)", "Starter Kit (₹499)", "पहले सवाल है"] }
      : { text: `Kaunsa option sahi lagta hai? 🌿`, replies: ["Full Program (₹1,299)", "Starter Kit (₹499)", "Pehle sawaal hai"] };
    await sendQRWithTyping(senderId, qr.text, qr.replies);
    await logToSheet(senderId, senderName, `Pitched: ${userData.sinusType}`, "PITCHED", userData.sinusType);
    return;
  }

  // ─── PITCHED STATE — FIX #2: Commit first, link after ────
  if (userData.state === "pitched") {
    if (userData.postPitchReplies >= 2) {
      userData.state = "human";
      await logToSheet(senderId, senderName, `Auto handoff`, "HUMAN_TAKEOVER", userData.sinusType);
      return;
    }

    const userSaidYes = /haan|ha |yes|theek|ok\b|okay|shuru|karein|karna|chahta|chahti|le leta|le lungi|lena\b|interested|1299|499|full program|starter|bhejo|link bhejo|link do|send link|\u0939\u093e\u0902|\u0920\u0940\u0915|\u0932\u0947\u0928\u093e/.test(textLower);

    if (userSaidYes) {
      // Detect which plan they want
      const wants1299 = /1299|full program|full|poora|pura|\u092a\u0942\u0930\u093e/.test(textLower);
      const wants499  = /499|starter|chota|basic/.test(textLower);
      if (wants1299) userData.selectedPlan = 1299;
      else if (wants499) userData.selectedPlan = 499;

      // COMMIT first — ask to confirm before sending link
      let commitMsg;
      if (sc === "dev") {
        if (userData.selectedPlan === 1299)
          commitMsg = `बहुत अच्छा! 🌿\n\n*₹1,299 — 14-दिन Nasal Restoration* — यही लेना है?\n\nएक बार *हाँ* बोल दें — फिर payment link भेजता हूँ।`;
        else if (userData.selectedPlan === 499)
          commitMsg = `ठीक है! 🌿\n\n*₹499 Starter Kit* — यही लेना है?\n\nएक बार *हाँ* बोल दें — फिर link भेजता हूँ।`;
        else
          commitMsg = `बहुत अच्छा कदम! 🌿\n\nकौनसा विकल्प लेना है — *₹499 Starter* या *₹1,299 Full Program*?`;
      } else {
        if (userData.selectedPlan === 1299)
          commitMsg = `Bahut acha! 🌿\n\n*Rs.1,299 — 14-Din Nasal Restoration* — yahi lena hai?\n\nEk baar *haan* bol do — phir payment link bhejta hun.`;
        else if (userData.selectedPlan === 499)
          commitMsg = `Theek hai! 🌿\n\n*Rs.499 Starter Kit* — yahi lena hai?\n\nEk baar *haan* bol do — phir link bhejta hun.`;
        else
          commitMsg = `Bahut acha kadam! 🌿\n\nKaunsa option lena hai — *Rs.499 Starter* ya *Rs.1,299 Full Program*?`;
      }
      userData.state = "committing";
      await sendWithTyping(senderId, commitMsg);
      await logToSheet(senderId, senderName, `Commit ask: ${userData.selectedPlan || "?"}`, "COMMITTING", userData.sinusType);
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
        ? `आपका सवाल हमारे *Sinus Relief Specialist* तक पहुँचा दिया है। 🌿\n\nयहाँ रुकें — थोड़ी देर में जवाब आएगा।\n\nया सीधे WhatsApp करें: 📱 *85951 60713*`
        : `Tumhara sawaal hamare *Sinus Relief Specialist* tak pahuncha diya hai. 🌿\n\nYahan ruko — thodi der mein reply aayega.\n\nYa seedha WhatsApp karo: 📱 *85951 60713*`;
      await sendWithTyping(senderId, handoffMsg);
      userData.state = "human";
      await logToSheet(senderId, senderName, `Handoff: ${text}`, "HUMAN_TAKEOVER", userData.sinusType);
    }
    await logToSheet(senderId, senderName, `AI: ${text}`, "AI_REPLY", userData.sinusType);
    return;
  }

  // ─── COMMITTING STATE — FIX #2: Send link only after confirm
  if (userData.state === "committing") {
    const confirmed = /haan|ha |yes|theek|ok\b|okay|bilkul|zaroor|confirm|haa\b|\u0939\u093e\u0902|\u0939\u093e \u0939\u093e|\u0939\u0940/.test(textLower);
    const wants1299  = /1299|full|poora/.test(textLower);
    const wants499   = /499|starter/.test(textLower);
    if (wants1299) userData.selectedPlan = 1299;
    if (wants499)  userData.selectedPlan = 499;

    if (confirmed || wants1299 || wants499) {
      let linkMsg;
      if (userData.selectedPlan === 499) {
        linkMsg = sc === "dev"
          ? `✅ *₹499 Starter Kit*\n\nPayment link:\n🌱 ${PAYMENT_499}\n\nPayment के बाद यहाँ *"done"* लिखना — अगला कदम बताता हूँ। 🌿`
          : `✅ *Rs.499 Starter Kit*\n\nPayment link:\n🌱 ${PAYMENT_499}\n\nPayment ke baad yahan *"done"* likhna — agla step batata hun. 🌿`;
      } else {
        linkMsg = sc === "dev"
          ? `✅ *₹1,299 — 14-दिन Nasal Restoration*\n\nPayment link:\n🌿 ${PAYMENT_1299}\n\nPayment के बाद यहाँ *"done"* लिखना — personally जोड़ते हैं। 🌿`
          : `✅ *Rs.1,299 — 14-Din Nasal Restoration*\n\nPayment link:\n🌿 ${PAYMENT_1299}\n\nPayment ke baad yahan *"done"* likhna — personally connect honge. 🌿`;
      }
      userData.state = "pitched";
      userData.postPitchReplies = 0;
      await sendWithTyping(senderId, linkMsg);
      await logToSheet(senderId, senderName, `Link sent: ${userData.selectedPlan}`, "LINK_SENT", userData.sinusType);
      return;
    }

    // User has questions — go back to pitched state for AI
    userData.state = "pitched";
    await handleMessage(senderId, messageText, senderName);
    return;
  }

  if (userData.state === "done") {
    const msg = sc === "dev"
      ? `नियम चल रहा है! 🌿 कोई सवाल हो तो WhatsApp पर पूछें — 85951 60713`
      : `Protocol chal raha hai! 🌿 Koi sawaal ho toh WhatsApp pe poochho — 85951 60713`;
    await sendWithTyping(senderId, msg);
    return;
  }

  userData.state = "new";
  userData.history = [];
  await handleMessage(senderId, messageText, senderName);
}

// ─── HUMAN TAKEOVER ──────────────────────────────────────────
async function handlePageMessage(senderId, sendingPageId) {
  if (sendingPageId && userState[senderId]) {
    userState[senderId].state = "human";
    console.log(`🔴 Human takeover activated for ${senderId}`);
  }
}

// ─── WEBHOOK ROUTES ──────────────────────────────────────────
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
          console.log(`⏭️ Skipped old message from ${senderId}`);
          continue;
        }
        if (event.message?.mid) {
          if (processedMessages.has(event.message.mid)) continue;
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

// ─── TWILIO WHATSAPP ROUTE ───────────────────────────────────
app.post("/twilio", async (req, res) => {
  res.set("Content-Type", "text/xml");
  res.send("<Response></Response>");
  try {
    const from = req.body.From;
    const text = req.body.Body;
    if (!from || !text) return;
    const senderId = from.replace("whatsapp:", "");
    userChannels[senderId] = "twilio";
    console.log(`📱 Twilio message from ${senderId}: ${text.substring(0, 50)}`);
    await handleMessage(senderId, text, "User");
  } catch (err) {
    console.error("Twilio webhook error:", err);
  }
});

app.get("/", (req, res) => res.send("Ayusomam Bot v3.0 — 4 fixes deployed 🌿"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌿 Ayusomam Bot v3.0 running on port ${PORT}`));
