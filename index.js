// ============================================================
// AYUSOMAM MESSENGER BOT — COMPLETE NEW FLOW
// Version 2.2 — Payment links only sent after user says yes
// Flow: Hook → Duration → Symptoms → Type Detect → Reveal+SelfTest → Pitch → Payment
// ============================================================

const express = require("express");
const fetch = require("node-fetch");
const app = express();
app.use(express.json());

// ─── CONFIG ──────────────────────────────────────────────────
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PAYMENT_1299 = "https://rzp.io/rzp/qu8zhQT";
const PAYMENT_499 = process.env.PAYMENT_499_LINK || "https://rzp.io/rzp/REPLACE_499"; // Add ₹499 link in env
const GAS_URL = "https://script.google.com/macros/s/AKfycbwWjnJa2utTx0vQUkjdKtSaVpJBllL1-f-inxEfmxzutyF5GpGS2bChD5qVXkYPwqSbuA/exec";
const WHATSAPP_NUMBER = "918595160713";
const SACHIN_PAGE_ID = process.env.SACHIN_PAGE_ID || ""; // Set in env to enable auto-OFF

// ─── STATE STORE ─────────────────────────────────────────────
// state: 'new' | 'asked_duration' | 'asked_symptoms' | 'pitched' | 'done' | 'human'
const userState = {}; // { senderId: { state, duration, symptoms, sinusType, hookIndex, postPitchReplies } }

// ─── DEDUPLICATION (FIX: prevents bulk replay on restart) ────
const processedMessages = new Set();
// Clear processed IDs every 10 minutes to avoid memory buildup
setInterval(() => processedMessages.clear(), 10 * 60 * 1000);

// ─── HOOK ROTATION (5 hooks, random) ─────────────────────────
const HOOKS = [
  // Hook 1 — Subah wali feeling
  `😮‍💨 Subah uthte hi naak band... sar bhaari... aur din shuru hone se pehle hi thaka hua feel?\n\nYeh sinus ki takleef hai — aur yeh isse zyada exhaust karti hai jitna log samajhte hain.\n\nSahi jagah aaye hain aap. 🌿`,
  // Hook 2 — Spray frustration
  `Spray laate ho... thodi der rahat... phir wahi haal. 😮‍💨\n\nSaalon se yeh cycle chal rahi hai — aur andar se pata hai yeh koi solution nahi.\n\nSahi jagah aaye hain aap. 🌿`,
  // Hook 3 — Akele nahi ho
  `Naak band, neend kharab, smell nahi aati, din bhar sar bhaari... 😮‍💨\n\nSinus ke saath jeena bahut mushkil hota hai — aur log sochte hain "ab toh aadat ho gayi."\n\nAap akele nahi hain is mein. Sahi jagah aaye hain. 🌿`,
  // Hook 4 — Baar baar wapas aana
  `Doctor ke paas gaye, dawai li, thodi rahat mili... phir wahi problem wapas. 😮‍💨\n\nYeh baar baar isliye hota hai kyunki sirf symptoms treat hote hain — andar ki wajah nahi.\n\nSahi jagah aaye hain aap. 🌿`,
  // Hook 5 — Neend barbad
  `Raat ko muh khol ke sote hain... subah fresh nahi uthte... din bhar dimag mein buhaari. 😮‍💨\n\nSinus sirf naak ki nahi — poori zindagi ki quality kharab karta hai.\n\nSahi jagah aaye hain aap. 🌿`,
];

// ─── SINUS TYPE DETECTION ─────────────────────────────────────
function detectSinusType(text) {
  const t = text.toLowerCase();
  // Spray Dependency (check first — most specific)
  if (/spray|nasivion|otrivin|otrivine|bina spray|naso|afrin|chhodna|chhod nahi|dependent/.test(t)) {
    return "spray";
  }
  // Polyp
  if (/smell nahi|taste nahi|bilkul band|dono taraf|surgery|operation|polyp|nasal polyp|growth/.test(t)) {
    return "polyp";
  }
  // Infective
  if (/peela|peeli|hara|hari|infection|antibiotic|chehra dard|daant dard|daant me|pus|fever|bukhar|green/.test(t)) {
    return "infective";
  }
  // Allergic
  if (/dhool|dust|smoke|dhuan|mausam|season|chheenk|chheenkna|sneez|aankhein|aankh khujlati|pollen|pet|bahar niklo/.test(t)) {
    return "allergic";
  }
  // Congestive (default — most common)
  return "congestive";
}

// ─── SINUS TYPE REVEAL MESSAGES ───────────────────────────────
function getRevealMessage(type) {
  const reveals = {
    allergic: `Tumhara pattern dekh ke lag raha hai — yeh *Allergic Sinus* hai. 🌿\n\n✅ *Abhi ek kaam karo:* Ghar se bahar niklo ya doosre room mein jao. Agar wahan symptoms thode different feel hon — ya ghar mein ek jagah zyada problem ho — yeh confirm karta hai.\n\nAur ek aur sign — *aankhein bhi khujlaati hain* naak ke saath? Congestive mein kabhi nahi hota. Yeh Allergic ka clear signal hai.\n\n3,000+ logon mein jinhe yeh pattern tha — inhe trigger-based protocol se sabse fast results mile. 🌿`,
    congestive: `Tumhara pattern dekh ke lag raha hai — yeh *Congestive Sinus* hai. 🌿\n\n✅ *Abhi ek kaam karo:* Sir aage jhukao, chehra neeche karo, 5 second ruko. Agar mathe ya galon mein thoda bhaari ya pressure feel ho — confirm hai. Yeh fluid accumulation ka sign hai.\n\nAur subah uthke *pehla adha ghanta sabse bura* lagta hai? Raat bhar flat letne se mucus jam jaati hai — yeh classic Congestive pattern hai.\n\nHamare sabse common clients Congestive wale hain — aur inhe sabse *predictable results* milte hain. 🌿`,
    spray: `Tumhara pattern dekh ke lag raha hai — yeh *Spray Dependency Sinus* hai. 🌿\n\n✅ *Abhi ek test karo:* Ek raat spray mat lo. Agar neend mushkil ho, restless feel ho, naak pehle se bhi buri tarah band lage — confirm hai. Spray ne naak ko physically dependent bana diya hai.\n\nAur ek shocking fact — spray ke 2-3 ghante baad *pehle se bhi zyada band* ho jaati hai naak? Yeh rebound congestion hai — spray hi problem ban gaya hai.\n\nIs type mein sirf sinus nahi — *spray se safely bahar nikalna* bhi protocol ka part hota hai. Kai log saalon se is cycle mein hain. 🌿`,
    infective: `Tumhara pattern dekh ke lag raha hai — yeh *Infective Sinus* hai. 🌿\n\n✅ *Abhi ek kaam karo:* Apne upar ke daanton mein dhyan do. Kabhi kabhi bina kisi reason ke halka dard ya heaviness feel hoti hai wahan? Yeh sinus infection ka direct sign hai — daant nahi, sinus problem hai.\n\nAntibiotic lete ho toh 3-4 din better lagta hai — band karte ho toh wapas? Yeh bacterial cycle confirm karta hai — antibiotic root cause nahi pakad raha.\n\nIs type mein *infection ka cycle todna* zaroori hai — warna bar bar aata rahega. 🌿`,
    polyp: `Tumhara pattern dekh ke lag raha hai — yeh *Polyp/Blockage Sinus* hai. 🌿\n\n✅ *Abhi ek kaam karo:* Laung ya adrak naak ke paas laao. Kuch smell aaya? Ya khaate waqt taste barely feel hota hai?\n\nDono taraf equally band hai naak? Ek taraf band = Congestive. *Dono taraf equally band = Polyp pattern confirm.*\n\nKai logon ko surgery suggest hui hoti hai — hamare protocol mein kai logon ne *bina surgery ke bhi improvement* feel ki hai. 🌿`,
  };
  return reveals[type] || reveals["congestive"];
}

// ─── PITCH MESSAGE ─────────────────────────────────────────────
function getPitchMessage(type) {
  const typeNames = {
    allergic: "Allergic Sinus",
    congestive: "Congestive Sinus",
    spray: "Spray Dependency Sinus",
    infective: "Infective Sinus",
    polyp: "Polyp/Blockage Sinus",
  };
  const typeName = typeNames[type] || "Sinus";
  return `Tumhare liye ek *personalized protocol* ready kar sakte hain — ${typeName} ke liye specifically. 🌿\n\n*Yeh 2 options hain:*\n\n🌱 *₹499 — Starter Kit*\nTumhare sinus type ka self-guided protocol deliver hoga WhatsApp pe.\n\n---\n\n🌿 *₹1,299 — 14-Din Sinus Recovery Program*\n⭐ _(Sabse zyada liya jaata hai)_\n\n*Exactly yeh milega:*\n✅ Pehle din — tumhari symptoms, history, triggers main personally samjhunga\n✅ Tumhare liye custom daily routine — subah + raat\n✅ 14 din roz mera WhatsApp check-in — "aaj kaisa raha?" personally\n✅ Koi din bura gaya — turant protocol adjust\n✅ Day 7 + Day 14 — progress review personally\n✅ Protocol complete hone ke baad — maintenance guidance free\n\n---\n\nEk ENT doctor 5 visits mein yeh deta hai — ₹3,000-5,000 mein. Aur woh roz check nahi karta.\n\n⚠️ *Ek important baat:* Har din delay matlab andar ka inflammation aur set hota jaata hai. Jo 14 din mein theek ho sakta tha, 3 mahine baad zyada waqt leta hai.\n\n*Guarantee:* Agar Day 7 tak koi bhi fark feel na ho — main khud personally baat karke protocol adjust karunga.\n\nKaunsa option choose karoge? 🌿`;
}

// ─── OBJECTION HANDLER ────────────────────────────────────────
function getObjectionResponse(text, sinusType) {
  const t = text.toLowerCase();

  // Price objection
  if (/mahanga|expensive|kam karo|discount|price|paisa|kitna|zyada|budget|afford/.test(t)) {
    return `Samajh aata hai bilkul. 🌿\n\nSochte hain ek baar —\nDoctor visit = ₹500-1,000 (ek baar, generic)\nAntibiotic course = ₹300-500 (waqti rahat)\nSpray har mahine = ₹200-300 (problem badhaata hai)\nSaal mein total = ₹8,000-10,000+ — aur problem wapas aati hai.\n\n₹1,299 — ek baar. 14 din main personally. Root cause pe kaam.\n\nAur ₹499 wala option bhi hai agar budget tight ho — starter protocol milega.\n\nKaunsa prefer karoge? 🌿`;
  }
  // Free/Google objection
  if (/free|google|youtube|chatgpt|internet|online milta|free mein/.test(t)) {
    return `Bilkul sahi baat hai — sinus ke baare mein internet pe bahut kuch hai. 🌿\n\nProblem yeh hai ki woh sab *generic* hai — na tumhara sinus type jaanta hai, na tumhari history.\n\n${sinusType === "allergic" ? "Allergic" : sinusType === "spray" ? "Spray Dependency" : sinusType === "infective" ? "Infective" : sinusType === "polyp" ? "Polyp" : "Congestive"} Sinus ke liye jo padha, woh doosre type pe kaam nahi karega. Galat routine se ulta nuksaan bhi hota hai.\n\nTumhara type abhi identify ho chuka hai — protocol usi ke liye specifically bana hai. *Yeh Google ya ChatGPT nahi de sakta.* 🌿\n\nShuru karein?`;
  }
  // Proof/result objection
  if (/proof|result|guarantee|kaam karta|sach mein|real|testimonial|review|trust/.test(t)) {
    return `Bilkul samajh aata hai — itne products try kar chuke ho. 🌿\n\n3,000+ clients is protocol se guzar chuke hain. Inme se bahut log pehle doctor, antibiotic, spray — sab kar chuke the.\n\nEk kaam karo — hamare kisi active client se directly baat karo. Real person, real result. Main connect kara sakta hun.\n\nYa fir ₹499 se shuru karo — agar 7 din mein koi fark na aaye, main personally dekhunga kya ho raha hai.\n\nKya karna chahoge? 🌿`;
  }
  // Time/busy objection
  if (/time nahi|busy|kaam|later|baad mein|sochta hun|sochungi/.test(t)) {
    return `Koi pressure nahi bilkul. 🌿\n\nBas ek baat — yeh kitne time se chal raha hai? Jitna purana hoga, utna andar set ho chuka hai. 14 din mein reverse possible hai — 6 mahine baad aur waqt lagega.\n\nJab ready ho tab batana — main yahan hun. 🌿`;
  }

  // Default follow-up
  return `Koi sawaal hai toh poochho bilkul — yahan hun. 🌿\n\nWarna seedha shuru karte hain — kaunsa option prefer karoge?`;
}

// ─── LANGUAGE DETECTION ───────────────────────────────────────
function isDevanagari(text) {
  return /[\u0900-\u097F]/.test(text);
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

// ─── SEND MESSAGE ──────────────────────────────────────────────
async function sendMessage(recipientId, text) {
  try {
    const response = await fetch(
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
    const data = await response.json();
    if (data.error) console.error("Send error:", data.error);
  } catch (e) {
    console.error("Fetch error:", e.message);
  }
}

// ─── SEND QUICK REPLIES (Smart Reply buttons) ─────────────────
// replies = array of strings (max 13 items, each max 20 chars)
async function sendQuickReplies(recipientId, text, replies) {
  try {
    const quick_replies = replies.map((r) => ({
      content_type: "text",
      title: r.substring(0, 20), // FB limit: 20 chars per button
      payload: r.toUpperCase().replace(/[^A-Z0-9]/g, "_").substring(0, 1000),
    }));
    const response = await fetch(
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
    const data = await response.json();
    if (data.error) console.error("Quick reply error:", data.error);
  } catch (e) {
    console.error("Quick reply fetch error:", e.message);
  }
}

// ─── NUMBER EXTRACTOR ──────────────────────────────────────────
function extractFirstNumber(text) {
  const match = text.match(/\d+/);
  return match ? parseInt(match[0]) : null;
}

// ─── POST-PITCH CURIOSITY HANDLER ─────────────────────────────
function getPostPitchResponse(text, sinusType) {
  const t = text.toLowerCase();

  if (/theek|ठीक|work|karega|karegi|guarantee|pakka|sure|sach mein|really|result|fark|difference|improvement/.test(t)) {
    return `Bilkul samajh aata hai yeh sawaal. 🌿\n\n3,000+ clients mein se — jo consistently follow karte hain — unka average experience:\n→ *Day 3-5:* Subah naak thodi better\n→ *Day 7:* Breathing mein noticeable difference\n→ *Day 10-14:* Sleep better, sar halka, smell wapas aane lagi\n\nYeh ek honest picture hai — 100% log alag hote hain, aur isliye main *personally* 14 din check karta hun. Jo kisi pe kaam nahi kiya, unka protocol adjust kiya — woh bhi theek hue.\n\n*Meri guarantee simple hai:* Day 7 tak koi bhi fark feel na ho — main personally baat karunga aur protocol change karunga.\n\nShuru karte hain? 🌿`;
  }
  if (/din|day|daily|roz|subah|raat|routine|schedule|time|kitna time|kab|kitne ghante|waqt/.test(t)) {
    return `Ek typical din lagbhag *15-20 minute* ka kaam hai — subah aur raat. 🌿\n\n*Subah (8-10 min):* Steam + ek simple nasya routine — naak clear ho jaati hai din ke liye\n*Raat (5-7 min):* Ek warm drink + breathing — raat ki neend better ho jaati hai\n*Din mein:* Kuch food avoid karne hote hain — main list dunga personally (bahut simple hai, ghar ka khana)\n\nKoi gym nahi, koi complicated cheez nahi. Ghar mein jo hota hai usi se — laung, adrak, ghee.\n\nAur main *har roz* ek message bhejna — "aaj kaisa raha?" — personally check karta hun. 🌿\n\nReady ho?`;
  }
  if (/kya milega|kya hai|exactly|detail|include|andar kya|program mein|content|material|kit/.test(t)) {
    return `Yeh exactly milega program mein: 🌿\n\n✅ *Day 1 pe* — tumse personally baat — symptoms, history, triggers\n✅ *Tumhara custom routine* — subah + raat, specifically tumhare sinus type ke liye\n✅ *14 din roz mera WhatsApp* — "aaj kaisa raha?" personally\n✅ *Koi din bura gaya* — turant protocol adjust\n✅ *Day 7 + Day 14* — progress review personally\n✅ *Post-protocol* — maintenance guidance free\n\nSab WhatsApp pe hota hai — koi app download nahi, koi website login nahi. Bas ek payment → main khud connect karta hun teri WhatsApp pe. 🌿\n\nShuru karein?`;
  }
  if (/cheez|ingredient|oil|herb|nasya|steam|laung|ghee|adrak|kya pina|kya khana|kya lagana|medicine|dawai|tablet/.test(t)) {
    return `Sab ghar mein milne wali cheezein hain — koi expensive supplement nahi. 🌿\n\nMain inhe use karta hun primarily:\n→ *Laung* — steam mein\n→ *Ghee* — nasya ke liye (desi ghee)\n→ *Adrak + tulsi* — morning drink\n→ *Saindhav namak* — gargling\n\nExact quantities aur method main *personally* bhejta hun Day 1 pe — tumhare sinus type ke hisaab se adjust karke.\n\n₹499 ya ₹1,299 — dono mein yeh included hai. Shuru karein? 🌿`;
  }
  if (/spray|chhodni|chhodna|dependent|otrivin|nasivion|without spray/.test(t)) {
    return `Bahut important sawaal hai yeh. 🌿\n\nSpray ek din mein nahi chhodti — protocol gradually wean karta hai. Pehle ek nostril, phir dono. Aur spray ki jagah natural alternatives deta hun jo nasal tissue heal karte hain.\n\nAksar Day 5-7 tak log spray ki zaroorat khatam feel karte hain — bina withdrawal ke.\n\nYeh exact process main personally guide karta hun. Shuru karein? 🌿`;
  }

  return `Samajh aata hai. 🌿\n\nKoi bhi sawaal ho toh poochho — main yahan hun. Jab ready ho batana! 🌿`;
}

// ─── MAIN MESSAGE HANDLER ──────────────────────────────────────
async function handleMessage(senderId, messageText, senderName) {
  const text = messageText.trim();
  const textLower = text.toLowerCase();

  // Init state
  if (!userState[senderId]) {
    userState[senderId] = { state: "new" };
  }
  const userData = userState[senderId];

  // ── HUMAN TAKEOVER CHECK ─────────────────────────────────────
  if (userData.state === "human") {
    return;
  }

  // ── REACTIVATION COMMAND ─────────────────────────────────────
  if (text.startsWith("BOT_ON_")) {
    const targetId = text.replace("BOT_ON_", "").trim();
    if (userState[targetId]) {
      userState[targetId].state = "pitched";
      await sendMessage(senderId, `✅ Bot reactivated for ${targetId}`);
    }
    return;
  }

  // ── PAYMENT CONFIRMATION ─────────────────────────────────────
  if (/payment|paid|pay kar|pay kiya|done|bhej diya|transfer/.test(textLower)) {
    userData.state = "done";
    await sendMessage(
      senderId,
      `✅ Payment confirm ho gaya! 🌿\n\nMain tumse personally WhatsApp pe connect karunga — 85951 60713\n\nWahan se protocol shuru karenge. Welcome to Ayusomam! 🌿`
    );
    await logToSheet(senderId, senderName, "Payment confirmed", "PAID", userData.sinusType);
    return;
  }

  // ── STATE MACHINE ────────────────────────────────────────────

  // STATE: NEW → Send hook + Q1 (with quick reply buttons for duration)
  if (userData.state === "new") {
    const hookIndex = Math.floor(Math.random() * HOOKS.length);
    userData.hookIndex = hookIndex;
    userData.state = "asked_duration";
    const hook = HOOKS[hookIndex];
    await sendMessage(senderId, hook);
    await new Promise((r) => setTimeout(r, 1200));
    // ✅ SMART REPLY: Duration options as quick reply buttons
    await sendQuickReplies(
      senderId,
      `Yeh takleef aapko kitne time se hai? 🌿`,
      ["1 mahina se", "6 mahine se", "1-2 saal se", "5+ saal se"]
    );
    await logToSheet(senderId, senderName, "New user — hook sent", "HOOK", "");
    return;
  }

  // STATE: ASKED_DURATION → Echo duration empathetically + ask symptoms (with quick replies)
  if (userData.state === "asked_duration") {
    userData.duration = text;
    userData.state = "asked_symptoms";
    const years = extractFirstNumber(text);
    const tl = text.toLowerCase();
    let durationAck;
    if (years >= 10 || (years >= 5 && /saal|year|sal/.test(tl))) {
      durationAck = `${years} saal se yeh takleef hai aapko... 😮\u200d💨\n\nItne lambe waqt mein body andar se bahut kuch jhel chuki hoti hai — sirf naak nahi, sleep, energy, concentration — sab affect hota hai.\n\nYeh case serious hai aur properly diagnose karna zaroori hai.`;
    } else if (years >= 2 || /saal|year/.test(tl)) {
      durationAck = `${years || "Kai"} saal se chal raha hai yeh — iska matlab yeh temporary nahi, andar kuch set ho chuka hai.\n\nSahi diagnosis ke bina treatment kaam nahi karti.`;
    } else if (/mahine|month|mahina/.test(tl)) {
      durationAck = `Kaafi waqt se chal rahi hai yeh takleef — is stage pe sahi protocol se jaldi theek ho sakta hai.\n\nPehle thoda aur samajhte hain.`;
    } else {
      durationAck = `Okay, samajh gaya. Pehle properly diagnose karte hain — symptoms ke hisaab se sinus ka type alag hota hai aur treatment bhi.`;
    }
    await sendMessage(senderId, durationAck);
    await new Promise((r) => setTimeout(r, 1000));
    // ✅ SMART REPLY: Common symptom options as quick reply buttons
    await sendQuickReplies(
      senderId,
      `Aur symptoms kya hain? Jo bhi feel hota hai select karo ya apne words mein batao. 🌿`,
      ["Naak band rehti hai", "Spray use karta hun", "Smell nahi aati", "Peela/hara discharge"]
    );
    await logToSheet(senderId, senderName, "Duration: " + text, "DURATION", "");
    return;
  }

  // STATE: ASKED_SYMPTOMS → Echo symptoms, reveal type, pitch
  if (userData.state === "asked_symptoms") {
    userData.symptoms = text;
    const sinusType = detectSinusType(text);
    userData.sinusType = sinusType;
    userData.state = "pitched";

    const dur = userData.duration || "";
    const summaryAck =
      `Theek hai, note kar liya. 🌿\n\n` +
      `*Aapki situation:*\n` +
      `📅 Takleef: ${dur} se\n` +
      `🔍 Symptoms: ${text}\n\n` +
      `Yeh details dekh ke diagnosis kar raha hun...`;
    await sendMessage(senderId, summaryAck);
    await new Promise((r) => setTimeout(r, 1500));

    const reveal = getRevealMessage(sinusType);
    await sendMessage(senderId, reveal);
    await new Promise((r) => setTimeout(r, 1500));

    const pitch = getPitchMessage(sinusType);
    await sendMessage(senderId, pitch);
    await new Promise((r) => setTimeout(r, 800));

    // ✅ SMART REPLY: Interest check — NO payment links yet, just intent buttons
    await sendQuickReplies(
      senderId,
      `Kaunsa option sahi lagta hai tumhe? 🌿`,
      ["Full Program (₹1,299)", "Starter Kit (₹499)", "Pehle sawaal hai"]
    );

    await logToSheet(senderId, senderName, `Symptoms: ${text}`, "PITCHED", sinusType);
    userData.postPitchReplies = 0;
    return;
  }

  // STATE: PITCHED → Handle objections or follow up (max 2 bot replies then human takeover)
  if (userData.state === "pitched") {
    if (userData.postPitchReplies >= 2) {
      userData.state = "human";
      console.log(`🔴 Auto human takeover for ${senderId} — 2 post-pitch replies done`);
      await logToSheet(senderId, senderName, `Auto handoff after 2 replies`, "HUMAN_TAKEOVER", userData.sinusType);
      return;
    }

    // If they said yes / want to proceed
    if (/haan|ha |yes|theek|ok|okay|shuru|karein|karna|chahta|chahti|le leta|le lungi|lena|interested|1299|499|full program|starter/.test(textLower)) {
      userData.postPitchReplies = (userData.postPitchReplies || 0) + 1;
      // ✅ SMART REPLY: After confirming interest
      await sendQuickReplies(
        senderId,
        `Bahut acha! 🌿\n\nYeh links hain:\n\n🌱 *₹499 Starter:* ${PAYMENT_499}\n\n🌿 *₹1,299 Full Program:* ${PAYMENT_1299}\n\nPayment ke baad confirm karna — main personally WhatsApp pe connect karunga. 🌿`,
        ["Payment kar diya ✅", "Sawaal poochhunga"]
      );
      return;
    }

    // Handle post-pitch curiosity questions
    const curiosityReply = getPostPitchResponse(text, userData.sinusType);
    if (curiosityReply !== null && !/mahanga|expensive|free|google|proof|time nahi|busy/.test(textLower)) {
      userData.postPitchReplies = (userData.postPitchReplies || 0) + 1;
      await sendMessage(senderId, curiosityReply);
      if (userData.postPitchReplies < 2) {
        await new Promise((r) => setTimeout(r, 600));
        await sendQuickReplies(senderId, `Kuch aur sawaal hai? 🌿`, [
          "Haan, shuru karna hai",
          "Ek aur sawaal hai",
          "Sochna hai thoda",
        ]);
      }
      await logToSheet(senderId, senderName, `Post-pitch Q: ${text}`, "CURIOSITY", userData.sinusType);
      return;
    }

    // Handle objections — increment counter
    userData.postPitchReplies = (userData.postPitchReplies || 0) + 1;
    const objectionReply = getObjectionResponse(text, userData.sinusType);

    if (userData.postPitchReplies >= 2) {
      await sendMessage(senderId, objectionReply);
      await new Promise((r) => setTimeout(r, 800));
      await sendMessage(
        senderId,
        `Tumhara sawaal hamare *Sinus Relief Specialist* tak pahuncha diya hai. 🌿\n\nYahan wait karo — thodi der mein reply aayega.\n\nYa seedha WhatsApp karo:\n📱 *85951 60713*`
      );
      userData.state = "human";
      await logToSheet(senderId, senderName, `Handoff after 2 replies: ${text}`, "HUMAN_TAKEOVER", userData.sinusType);
    } else {
      await sendMessage(senderId, objectionReply);
      await new Promise((r) => setTimeout(r, 600));
      await sendQuickReplies(senderId, `Kaunsa option prefer karoge? 🌿`, [
        "₹1,299 Full Program",
        "₹499 Starter Kit",
        "Aur sawaal hai",
      ]);
      await logToSheet(senderId, senderName, `Objection: ${text}`, "OBJECTION", userData.sinusType);
    }
    return;
  }

  // STATE: DONE → Warm follow-up
  if (userData.state === "done") {
    await sendMessage(
      senderId,
      `Protocol chal raha hai! 🌿 Koi sawaal ho toh WhatsApp pe poochho — 85951 60713`
    );
    return;
  }

  // FALLBACK — restart if stuck
  userData.state = "new";
  await handleMessage(senderId, messageText, senderName);
}

// ─── HUMAN TAKEOVER — Page reply detection ────────────────────
async function handlePageMessage(senderId, sendingPageId) {
  if (sendingPageId && userState[senderId]) {
    userState[senderId].state = "human";
    console.log(`🔴 Human takeover activated for ${senderId}`);
  }
}

// ─── WEBHOOK ROUTES ───────────────────────────────────────────

// Verify webhook
app.get("/webhook", (req, res) => {
  if (req.query["hub.verify_token"] === VERIFY_TOKEN) {
    res.send(req.query["hub.challenge"]);
  } else {
    res.sendStatus(403);
  }
});

// Receive messages
app.post("/webhook", async (req, res) => {
  res.sendStatus(200); // Respond immediately

  try {
    const body = req.body;
    if (body.object !== "page") return;

    for (const entry of body.entry) {
      for (const event of entry.messaging || []) {
        const senderId = event.sender?.id;
        if (!senderId) continue;

        // ── FIX: SKIP OLD MESSAGES (prevents bulk replay on bot restart) ──
        // When Render restarts, Facebook re-sends queued messages.
        // We skip any message older than 5 minutes to avoid the "sab kuch ek sath" problem.
        const MSG_AGE_LIMIT_MS = 5 * 60 * 1000; // 5 minutes
        if (event.timestamp && Date.now() - event.timestamp > MSG_AGE_LIMIT_MS) {
          console.log(
            `⏭️ Skipped old message (${Math.round((Date.now() - event.timestamp) / 1000)}s old) from ${senderId}`
          );
          continue;
        }

        // ── FIX: DEDUPLICATION (prevents processing same message twice) ──
        if (event.message?.mid) {
          if (processedMessages.has(event.message.mid)) {
            console.log(`⏭️ Duplicate message skipped: ${event.message.mid}`);
            continue;
          }
          processedMessages.add(event.message.mid);
        }

        // Detect if this message is FROM the page (Sachin) — human takeover
        if (event.sender?.id === entry.id) {
          await handlePageMessage(event.recipient?.id, event.sender?.id);
          continue;
        }

        // Regular user message
        if (event.message?.text) {
          const messageText = event.message.text;
          const senderName = "User";
          await handleMessage(senderId, messageText, senderName);
        }
      }
    }
  } catch (err) {
    console.error("Webhook error:", err);
  }
});

// Health check
app.get("/", (req, res) => res.send("Ayusomam Bot v2.1 — Running 🌿"));

// ─── START ────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌿 Ayusomam Bot v2.0 running on port ${PORT}`));
