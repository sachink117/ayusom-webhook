// ============================================================
// AYUSOMAM MESSENGER BOT — COMPLETE NEW FLOW
// Version 2.0 — Redesigned for high conversion
// Flow: Hook → Duration → Symptoms → Type Detect → Reveal+SelfTest → Pitch → Payment
// ============================================================

const express = require("express");
const fetch = require("node-fetch");
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false })); // Twilio sends form-encoded data

// ─── WHATSAPP BOT (Twilio + Claude API) ─────────────────────
const { setupWhatsAppRoutes } = require("./whatsapp-bot");
setupWhatsAppRoutes(app);

// ─── CONFIG ────────────────────────────────────────────────
let PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.WA_VERIFY_TOKEN;

if (!PAGE_ACCESS_TOKEN) {
  console.error("⚠️ WARNING: PAGE_ACCESS_TOKEN is not set! Bot will not be able to send messages.");
}
const PAYMENT_1299 = "https://rzp.io/rzp/qu8zhQT";
const PAYMENT_499 = process.env.PAYMENT_499_LINK || "https://rzp.io/rzp/REPLACE_499"; // Add ₹499 link in env
const GAS_URL = "https://script.google.com/macros/s/AKfycbwWjnJa2utTx0vQUkjdKtSaVpJBllL1-f-inxEfmxzutyF5GpGS2bChD5qVXkYPwqSbuA/exec";
const WHATSAPP_NUMBER = "918595160713";
const SACHIN_PAGE_ID = process.env.SACHIN_PAGE_ID || ""; // Set in env to enable auto-OFF

// ─── STATE STORE ───────────────────────────────────────────
// state: 'new' | 'asked_duration' | 'asked_symptoms' | 'pitched' | 'done' | 'human'
const userState = {}; // { senderId: { state, duration, symptoms, sinusType, hookIndex, postPitchReplies, lastActive } }

// ─── MEMORY CLEANUP — Remove stale users every 30 min ─────
const STATE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
setInterval(() => {
  const now = Date.now();
  for (const id of Object.keys(userState)) {
    if (now - (userState[id].lastActive || 0) > STATE_TTL_MS) {
      delete userState[id];
    }
  }
}, 30 * 60 * 1000);

// ─── HOOK ROTATION (5 hooks, random) ───────────────────────
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

// ─── SINUS TYPE DETECTION ───────────────────────────────────
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

// ─── SINUS TYPE REVEAL MESSAGES ────────────────────────────
function getRevealMessage(type) {
  const reveals = {
    allergic: `Tumhara pattern dekh ke lag raha hai — yeh *Allergic Sinus* hai. 🌿

✅ *Abhi ek kaam karo:* Ghar se bahar niklo ya doosre room mein jao. Agar wahan symptoms thode different feel hon — ya ghar mein ek jagah zyada problem ho — yeh confirm karta hai.

Aur ek aur sign — *aankhein bhi khujlaati hain* naak ke saath? Congestive mein kabhi nahi hota. Yeh Allergic ka clear signal hai.

3,000+ logon mein jinhe yeh pattern tha — inhe trigger-based protocol se sabse fast results mile. 🌿`,

    congestive: `Tumhara pattern dekh ke lag raha hai — yeh *Congestive Sinus* hai. 🌿

✅ *Abhi ek kaam karo:* Sir aage jhukao, chehra neeche karo, 5 second ruko. Agar mathe ya galon mein thoda bhaari ya pressure feel ho — confirm hai. Yeh fluid accumulation ka sign hai.

Aur subah uthke *pehla adha ghanta sabse bura* lagta hai? Raat bhar flat letne se mucus jam jaati hai — yeh classic Congestive pattern hai.

Hamare sabse common clients Congestive wale hain — aur inhe sabse *predictable results* milte hain. 🌿`,

    spray: `Tumhara pattern dekh ke lag raha hai — yeh *Spray Dependency Sinus* hai. 🌿

✅ *Abhi ek test karo:* Ek raat spray mat lo. Agar neend mushkil ho, restless feel ho, naak pehle se bhi buri tarah band lage — confirm hai. Spray ne naak ko physically dependent bana diya hai.

Aur ek shocking fact — spray ke 2-3 ghante baad *pehle se bhi zyada band* ho jaati hai naak? Yeh rebound congestion hai — spray hi problem ban gaya hai.

Is type mein sirf sinus nahi — *spray se safely bahar nikalna* bhi protocol ka part hota hai. Kai log saalon se is cycle mein hain. 🌿`,

    infective: `Tumhara pattern dekh ke lag raha hai — yeh *Infective Sinus* hai. 🌿

✅ *Abhi ek kaam karo:* Apne upar ke daanton mein dhyan do. Kabhi kabhi bina kisi reason ke halka dard ya heaviness feel hoti hai wahan? Yeh sinus infection ka direct sign hai — daant nahi, sinus problem hai.

Antibiotic lete ho toh 3-4 din better lagta hai — band karte ho toh wapas? Yeh bacterial cycle confirm karta hai — antibiotic root cause nahi pakad raha.

Is type mein *infection ka cycle todna* zaroori hai — warna bar bar aata rahega. 🌿`,

    polyp: `Tumhara pattern dekh ke lag raha hai — yeh *Polyp/Blockage Sinus* hai. 🌿

✅ *Abhi ek kaam karo:* Laung ya adrak naak ke paas laao. Kuch smell aaya? Ya khaate waqt taste barely feel hota hai? Dono taraf equally band hai naak?

Ek taraf band = Congestive. *Dono taraf equally band = Polyp pattern confirm.*

Kai logon ko surgery suggest hui hoti hai — hamare protocol mein kai logon ne *bina surgery ke bhi improvement* feel ki hai. 🌿`,
  };
  return reveals[type] || reveals["congestive"];
}

// ─── PITCH MESSAGE ──────────────────────────────────────────
function getPitchMessage(type) {
  const typeNames = {
    allergic: "Allergic Sinus",
    congestive: "Congestive Sinus",
    spray: "Spray Dependency Sinus",
    infective: "Infective Sinus",
    polyp: "Polyp/Blockage Sinus",
  };
  const typeName = typeNames[type] || "Sinus";

  return `Tumhare liye ek *personalized protocol* ready kar sakte hain — ${typeName} ke liye specifically. 🌿

*Yeh 2 options hain:*

🌱 *₹499 — Starter Kit*
Tumhare sinus type ka self-guided protocol deliver hoga WhatsApp pe.

---

🌿 *₹1,299 — 14-Din Sinus Recovery Program* ⭐ _(Sabse zyada liya jaata hai)_

*Exactly yeh milega:*
✅ Pehle din — tumhari symptoms, history, triggers main personally samjhunga
✅ Tumhare liye custom daily routine — subah + raat
✅ 14 din roz mera WhatsApp check-in — "aaj kaisa raha?" personally
✅ Koi din bura gaya — turant protocol adjust
✅ Day 7 + Day 14 — progress review personally
✅ Protocol complete hone ke baad — maintenance guidance free

---

Ek ENT doctor 5 visits mein yeh deta hai — ₹3,000-5,000 mein. Aur woh roz check nahi karta.

⚠️ *Ek important baat:* Har din delay matlab andar ka inflammation aur set hota jaata hai. Jo 14 din mein theek ho sakta tha, 3 mahine baad zyada waqt leta hai.

*Guarantee:* Agar Day 7 tak koi bhi fark feel na ho — main khud personally baat karke protocol adjust karunga.

Shuru karein? 🌿`;
}

// ─── OBJECTION HANDLER ─────────────────────────────────────
function getObjectionResponse(text, sinusType) {
  const t = text.toLowerCase();

  // Price objection
  if (/mahanga|expensive|kam karo|discount|price|paisa|kitna|zyada|budget|afford/.test(t)) {
    return `Samajh aata hai bilkul. 🌿

Sochte hain ek baar —
Doctor visit = ₹500-1,000 (ek baar, generic)
Antibiotic course = ₹300-500 (waqti rahat)
Spray har mahine = ₹200-300 (problem badhaata hai)
Saal mein total = ₹8,000-10,000+ — aur problem wapas aati hai.

₹1,299 — ek baar. 14 din main personally. Root cause pe kaam.

Aur ₹499 wala option bhi hai agar budget tight ho — starter protocol milega.

Kaunsa prefer karoge? 🌿`;
  }

  // Free/Google objection
  if (/free|google|youtube|chatgpt|internet|online milta|free mein/.test(t)) {
    return `Bilkul sahi baat hai — sinus ke baare mein internet pe bahut kuch hai. 🌿

Problem yeh hai ki woh sab *generic* hai — na tumhara sinus type jaanta hai, na tumhari history.

${sinusType === "allergic" ? "Allergic" : sinusType === "spray" ? "Spray Dependency" : sinusType === "infective" ? "Infective" : sinusType === "polyp" ? "Polyp" : "Congestive"} Sinus ke liye jo padha, woh doosre type pe kaam nahi karega. Galat routine se ulta nuksaan bhi hota hai.

Tumhara type abhi identify ho chuka hai — protocol usi ke liye specifically bana hai.

*Yeh Google ya ChatGPT nahi de sakta.* 🌿

Shuru karein?`;
  }

  // Proof/result objection
  if (/proof|result|guarantee|kaam karta|sach mein|real|testimonial|review|trust/.test(t)) {
    return `Bilkul samajh aata hai — itne products try kar chuke ho. 🌿

3,000+ clients is protocol se guzar chuke hain. Inme se bahut log pehle doctor, antibiotic, spray — sab kar chuke the.

Ek kaam karo — hamare kisi active client se directly baat karo. Real person, real result. Main connect kara sakta hun.

Ya fir ₹499 se shuru karo — agar 7 din mein koi fark na aaye, main personally dekhunga kya ho raha hai.

Kya karna chahoge? 🌿`;
  }

  // Time/busy objection
  if (/time nahi|busy|kaam|later|baad mein|sochta hun|sochungi/.test(t)) {
    return `Koi pressure nahi bilkul. 🌿

Bas ek baat — yeh kitne time se chal raha hai? Jitna purana hoga, utna andar set ho chuka hai.

14 din mein reverse possible hai — 6 mahine baad aur waqt lagega.

Jab ready ho tab batana — main yahan hun. 🌿`;
  }

  // Default follow-up
  return `Koi sawaal hai toh poochho bilkul — yahan hun. 🌿

Warna seedha shuru karte hain — kaunsa option prefer karoge?

🌱 *₹499 Starter* — ${PAYMENT_499}
🌿 *₹1,299 Program* — ${PAYMENT_1299}`;
}

// ─── LANGUAGE DETECTION ────────────────────────────────────
function isDevanagari(text) {
  return /[\u0900-\u097F]/.test(text);
}

// ─── GOOGLE SHEET LOGGING ──────────────────────────────────
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

// ─── SEND MESSAGE ───────────────────────────────────────────
async function sendMessage(recipientId, text) {
  if (!PAGE_ACCESS_TOKEN) {
    console.error("❌ Cannot send message — PAGE_ACCESS_TOKEN is missing!");
    return;
  }
  try {
    const response = await fetch(
      `https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
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
    if (data.error) {
      console.error("❌ Send error:", data.error);
      // Token expired or invalid — log clearly
      if (data.error.code === 190 || data.error.type === "OAuthException") {
        console.error("🔴 PAGE_ACCESS_TOKEN expired or invalid! Generate a new one from Facebook Developer Console.");
      }
    }
  } catch (e) {
    console.error("Fetch error:", e.message);
  }
}

// ─── TOKEN REFRESH ENDPOINT — Update token without redeploy ──
app.get("/update-token", (req, res) => {
  const newToken = req.query.token;
  const secret = req.query.secret;
  if (secret !== VERIFY_TOKEN || !newToken) {
    return res.sendStatus(403);
  }
  PAGE_ACCESS_TOKEN = newToken;
  console.log("✅ PAGE_ACCESS_TOKEN updated via /update-token endpoint");
  res.send("Token updated successfully");
});

// ─── NUMBER EXTRACTOR ───────────────────────────────────────
function extractFirstNumber(text) {
  const match = text.match(/\d+/);
  return match ? parseInt(match[0]) : null;
}

// ─── MAIN MESSAGE HANDLER ───────────────────────────────────
async function handleMessage(senderId, messageText, senderName) {
  const text = messageText.trim();
  const textLower = text.toLowerCase();

  // Init state
  if (!userState[senderId]) {
    userState[senderId] = { state: "new" };
  }

  const userData = userState[senderId];
  userData.lastActive = Date.now();

  // ── HUMAN TAKEOVER CHECK ──────────────────────────────────
  if (userData.state === "human") {
    // Bot is OFF — only reactivate on BOT_ON command
    return;
  }

  // ── REACTIVATION COMMAND ──────────────────────────────────
  if (text.startsWith("BOT_ON_")) {
    const targetId = text.replace("BOT_ON_", "").trim();
    if (userState[targetId]) {
      userState[targetId].state = "pitched";
      await sendMessage(senderId, `✅ Bot reactivated for ${targetId}`);
    }
    return;
  }

  // ── PAYMENT CONFIRMATION ──────────────────────────────────
  if (/payment|paid|pay kar|pay kiya|done|bhej diya|transfer/.test(textLower)) {
    userData.state = "done";
    await sendMessage(
      senderId,
      `✅ Payment confirm ho gaya! 🌿\n\nMain tumse personally WhatsApp pe connect karunga — 85951 60713\n\nWahan se protocol shuru karenge. Welcome to Ayusomam! 🌿`
    );
    await logToSheet(senderId, senderName, "Payment confirmed", "PAID", userData.sinusType);
    return;
  }

  // ── POST-PITCH CURIOSITY HANDLER ──────────────────────────
  // Called when user asks questions AFTER payment link has been shared
  function getPostPitchResponse(text, sinusType) {
    const t = text.toLowerCase();

    // REASSURANCE — "theek ho jaunga?" "kaam karega?" "guarantee?"
    if (/theek|ठीक|work|karega|karegi|guarantee|pakka|sure|sach mein|really|result|fark|difference|improvement/.test(t)) {
      return `Bilkul samajh aata hai yeh sawaal. 🌿

3,000+ clients mein se — jo consistently follow karte hain — unka average experience:
→ *Day 3-5:* Subah naak thodi better
→ *Day 7:* Breathing mein noticeable difference
→ *Day 10-14:* Sleep better, sar halka, smell wapas aane lagi

Yeh ek honest picture hai — 100% log alag hote hain, aur isliye main *personally* 14 din check karta hun. Jo kisi pe kaam nahi kiya, unka protocol adjust kiya — woh bhi theek hue.

*Meri guarantee simple hai:* Day 7 tak koi bhi fark feel na ho — main personally baat karunga aur protocol change karunga.

Shuru karte hain? 🌿
🌿 *₹1,299:* ${PAYMENT_1299}
🌱 *₹499 Starter:* ${PAYMENT_499}`;
    }

    // DAY-BY-DAY curiosity — "din kaisa lagta hai?" "daily kya karna hai?"
    if (/din|day|daily|roz|subah|raat|routine|schedule|time|kitna time|kab|kitne ghante|waqt/.test(t)) {
      return `Ek typical din lagbhag *15-20 minute* ka kaam hai — subah aur raat. 🌿

*Subah (8-10 min):*
Steam + ek simple nasya routine — teri nose clear ho jaati hai din ke liye

*Raat (5-7 min):*
Ek warm drink + breathing — raat ki neend better ho jaati hai

*Din mein:*
Kuch food avoid karne hote hain — main list dunga personally (bahut simple hai, ghar ka khana)

Koi gym nahi, koi complicated cheez nahi. Ghar mein jo hota hai usi se — laung, adrak, ghee.

Aur main *har roz* ek message bhejna — "aaj kaisa raha?" — personally check karta hun. 🌿

Ready ho? 
🌿 *₹1,299 Full Program:* ${PAYMENT_1299}
🌱 *₹499 Starter:* ${PAYMENT_499}`;
    }

    // WHAT'S INCLUDED — "kya kya milega?" "program mein kya hai?"
    if (/kya milega|kya hai|exactly|detail|include|andar kya|program mein|content|material|kit/.test(t)) {
      return `Yeh exactly milega program mein: 🌿

✅ *Day 1 pe* — tumse personally baat — symptoms, history, triggers
✅ *Tumhara custom routine* — subah + raat, specifically tumhare sinus type ke liye
✅ *14 din roz mera WhatsApp* — "aaj kaisa raha?" personally
✅ *Koi din bura gaya* — turant protocol adjust
✅ *Day 7 + Day 14* — progress review personally
✅ *Post-protocol* — maintenance guidance free

Sab WhatsApp pe hota hai — koi app download nahi, koi website login nahi.

Bas ek payment → main khud connect karta hun teri WhatsApp pe. 🌿

*₹1,299:* ${PAYMENT_1299}
*₹499 Starter:* ${PAYMENT_499}`;
    }

    // INGREDIENTS / WHAT TO USE — "kya use karna hai?" "konsi cheez?"
    if (/cheez|ingredient|oil|herb|nasya|steam|laung|ghee|adrak|kya pina|kya khana|kya lagana|medicine|dawai|tablet/.test(t)) {
      return `Sab ghar mein milne wali cheezein hain — koi expensive supplement nahi. 🌿

Main inhe use karta hun primarily:
→ *Laung* — steam mein
→ *Ghee* — nasya ke liye (desi ghee)
→ *Adrak + tulsi* — morning drink
→ *Saindhav namak* — gargling

Exact quantities aur method main *personally* bhejta hun Day 1 pe — tumhare sinus type ke hisaab se adjust karke.

₹499 ya ₹1,299 — dono mein yeh included hai. 🌿

Shuru karein?
🌿 *₹1,299:* ${PAYMENT_1299}
🌱 *₹499:* ${PAYMENT_499}`;
    }

    // SPRAY SPECIFIC — "spray kab chodunga?" "spray chhodni padegi?"
    if (/spray|chhodni|chhodna|dependent|otrivin|nasivion|without spray/.test(t)) {
      return `Bahut important sawaal hai yeh. 🌿

Spray ek din mein nahi chhodti — protocol gradually wean karta hai. Pehle ek nostril, phir dono. Aur spray ki jagah natural alternatives deta hun jo nasal tissue heal karte hain.

Aksar Day 5-7 tak log spray ki zaroorat khatam feel karte hain — bina withdrawal ke.

Yeh exact process main personally guide karta hun. 🌿

Shuru karein?
🌿 *₹1,299:* ${PAYMENT_1299}
🌱 *₹499:* ${PAYMENT_499}`;
    }

    // DEFAULT fallback
    return `Samajh aata hai. 🌿

Koi bhi sawaal ho — main personally WhatsApp pe bhi available hun.

Jab ready ho, yeh links hain:
🌿 *₹1,299 Full Program:* ${PAYMENT_1299}
🌱 *₹499 Starter:* ${PAYMENT_499}`;
  }

  // ── STATE MACHINE ─────────────────────────────────────────

  // STATE: NEW → Send hook + Q1
  if (userData.state === "new") {
    const hookIndex = Math.floor(Math.random() * HOOKS.length);
    userData.hookIndex = hookIndex;
    userData.state = "asked_duration";

    const hook = HOOKS[hookIndex];
    await sendMessage(senderId, hook);

    // Small delay for natural feel
    await new Promise((r) => setTimeout(r, 1200));
    await sendMessage(senderId, `Yeh takleef aapko kitne time se hai? 🌿`);

    await logToSheet(senderId, senderName, "New user — hook sent", "HOOK", "");
    return;
  }

  // STATE: ASKED_DURATION → Echo duration empathetically, ask symptoms
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
    await sendMessage(senderId, "Aur symptoms kya hain — subah naak band rehti hai, smell nahi aati, spray pe depend ho, ya kuch aur? Jo bhi feel hota hai apne words mein batao. 🌿");

    await logToSheet(senderId, senderName, "Duration: " + text, "DURATION", "");
    return;
  }

  // STATE: ASKED_SYMPTOMS → Echo duration+symptoms, then reveal type
  if (userData.state === "asked_symptoms") {
    userData.symptoms = text;
    const sinusType = detectSinusType(text);
    userData.sinusType = sinusType;
    userData.state = "pitched";

    // Build summary ack — echo their duration + symptoms back
    const dur = userData.duration || "";
    const summaryAck = `Theek hai, note kar liya. 🌿\n\n` +
      `*Aapki situation:*\n` +
      `📅 Takleef: ${dur} se\n` +
      `🔍 Symptoms: ${text}\n\n` +
      `Yeh details dekh ke diagnosis kar raha hun...`;

    await sendMessage(senderId, summaryAck);
    await new Promise((r) => setTimeout(r, 1500));

    // Send reveal
    const reveal = getRevealMessage(sinusType);
    await sendMessage(senderId, reveal);

    await new Promise((r) => setTimeout(r, 1500));

    // Send pitch
    const pitch = getPitchMessage(sinusType);
    await sendMessage(senderId, pitch);

    await new Promise((r) => setTimeout(r, 800));

    // Send payment options
    await sendMessage(
      senderId,
      `🌱 *₹499 Starter:* ${PAYMENT_499}\n\n🌿 *₹1,299 Recovery Program:* ${PAYMENT_1299}`
    );

    await logToSheet(
      senderId,
      senderName,
      `Symptoms: ${text}`,
      "PITCHED",
      sinusType
    );
    userData.postPitchReplies = 0; // reset counter when pitch first sent
    return;
  }

  // STATE: PITCHED → Handle objections or follow up (max 2 bot replies then human takeover)
  if (userData.state === "pitched") {

    // If already replied twice post-pitch → silent (Sachin handles)
    if (userData.postPitchReplies >= 2) {
      userData.state = "human";
      console.log(`🔴 Auto human takeover for ${senderId} — 2 post-pitch replies done`);
      await logToSheet(senderId, senderName, `Auto handoff after 2 replies`, "HUMAN_TAKEOVER", userData.sinusType);
      return;
    }

    // Check if they said yes / want to proceed
    if (/haan|ha |yes|theek|ok|okay|shuru|karein|karna|chahta|chahti|le leta|le lungi|lena|interested/.test(textLower)) {
      userData.postPitchReplies = (userData.postPitchReplies || 0) + 1;
      await sendMessage(
        senderId,
        `Bahut acha! 🌿\n\nYeh links hain:\n\n🌱 *₹499 Starter:* ${PAYMENT_499}\n\n🌿 *₹1,299 Full Program:* ${PAYMENT_1299}\n\nPayment ke baad confirm karna — main personally WhatsApp pe connect karunga. 🌿`
      );
      return;
    }

    // Handle objections — increment counter
    userData.postPitchReplies = (userData.postPitchReplies || 0) + 1;
    const objectionReply = getObjectionResponse(text, userData.sinusType);

    // If this is the 2nd reply → add handoff message at the end
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

  // FALLBACK — reset to new and send hook (no recursion)
  userData.state = "new";
  const hookIndex = Math.floor(Math.random() * HOOKS.length);
  userData.hookIndex = hookIndex;
  userData.state = "asked_duration";
  await sendMessage(senderId, HOOKS[hookIndex]);
  await new Promise((r) => setTimeout(r, 1200));
  await sendMessage(senderId, `Yeh takleef aapko kitne time se hai? 🌿`);
  await logToSheet(senderId, senderName, "Restart — hook sent", "HOOK", "");
}

// ─── HUMAN TAKEOVER — Page reply detection ─────────────────
// When Sachin replies from the Page → bot turns OFF for that thread
async function handlePageMessage(senderId, sendingPageId) {
  // If message is FROM the page (Sachin replying) → pause bot for this user
  if (sendingPageId && userState[senderId]) {
    userState[senderId].state = "human";
    console.log(`🔴 Human takeover activated for ${senderId}`);
  }
}

// ─── WEBHOOK ROUTES ────────────────────────────────────────

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

        // Detect if this message is FROM the page (Sachin) — human takeover
        if (event.sender?.id === entry.id) {
          await handlePageMessage(event.recipient?.id, event.sender?.id);
          continue;
        }

        // Regular user message
        if (event.message?.text) {
          const messageText = event.message.text;
          const senderName = "User"; // Can enrich with Profile API if needed
          await handleMessage(senderId, messageText, senderName);
        }
      }
    }
  } catch (err) {
    console.error("Webhook error:", err);
  }
});

// Health check
app.get("/", (req, res) => res.send("Ayusomam Bot v2.0 — Running 🌿"));

// ─── CRASH PROTECTION ─────────────────────────────────────
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err.message);
});
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});

// ─── START ─────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌿 Ayusomam Bot v2.0 running on port ${PORT}`);

  // ─── KEEP-ALIVE SELF-PING (prevents Render free tier sleep) ───
  const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
  if (RENDER_URL) {
    setInterval(() => {
      fetch(RENDER_URL).catch(() => {});
    }, 5 * 60 * 1000); // Ping every 5 minutes
  }
});
