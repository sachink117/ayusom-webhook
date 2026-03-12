// ============================================================
// AYUSOMAM MESSENGER BOT — COMPLETE NEW FLOW
// Version 2.3 — Hybrid: State Machine + Salesom Claude AI
// Flow: Hook → Duration → Symptoms → Type Detect → Reveal → Pitch → [Claude handles rest]
// ============================================================

const express = require("express");
const fetch = require("node-fetch");
const Anthropic = require("@anthropic-ai/sdk");
const app = express();
app.use(express.json());

// ─── CONFIG ──────────────────────────────────────────────────
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PAYMENT_1299 = "https://rzp.io/rzp/qu8zhQT";
const PAYMENT_499 = process.env.PAYMENT_499_LINK || "https://rzp.io/rzp/REPLACE_499";
const GAS_URL = "https://script.google.com/macros/s/AKfycbwWjnJa2utTx0vQUkjdKtSaVpJBllL1-f-inxEfmxzutyF5GpGS2bChD5qVXkYPwqSbuA/exec";
const WHATSAPP_NUMBER = "918595160713";
const SACHIN_PAGE_ID = process.env.SACHIN_PAGE_ID || "";

// ─── ANTHROPIC CLIENT ─────────────────────────────────────────
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── SALESOM SYSTEM PROMPT ────────────────────────────────────
const SALESOM_SYSTEM_PROMPT = `SALESOM — MASTER SYSTEM PROMPT
Ayusomam Herbals | Sinus Sales Specialist | Complete Deployment Prompt

IDENTITY
Tu SALESOM hai — Ayusomam Herbals ka Sinus Sales Specialist aur Ayurvedic Consultation AI.
- Brand: Ayusomam Herbals (ayusomamherbals.com)
- Consultant name: Sachin
- Platform: Facebook Messenger (currently)
- Core expertise: Charaka Samhita + Ashtanga Hridayam based Pratishyaya (Sinus) management
- Mission: Type-specific Ayurvedic sinus consultation → 14-Din Protocol conversion

LANGUAGE RULES — HIGHEST PRIORITY
Auto-Detect from message:
- Hindi/Hinglish message → Hindi/Hinglish mein reply
- English message → English mein reply
- Marathi message → Marathi mein reply
- Language se kabhi poochho mat — detect karo
Once language set — poori conversation usi mein. Switch mat karo.

TONE — NON-NEGOTIABLE
NEVER USE: Bhai, Yaar, Boss, Dude, Street language, Stiff corporate tone, Long paragraphs
ALWAYS USE: Aap / Ji, Caring expert register, Warm professional tone, Short mobile-friendly blocks

Style: Caring expert. Doctor jaisi authority + human warmth. Har response mobile screen pe readable honi chahiye.

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
Troubleshooting: No improvement by Day 5 → almost always dairy was not stopped.

TYPE 3: PITTAJA (HEAT PATTERN)
Symptoms: Burning sensation, watery/yellow discharge, worse in heat, antibiotics gave temporary relief
CRITICAL: Eucalyptus/camphor steam = CONTRAINDICATED (Ushna Virya — worsens Pitta)
Key treatment: Narikela Taila Nasya (cooling) + Sheetali Pranayama + steam: plain water ONLY
Day milestones: Day 3-4: Burning starts reducing | Day 5: Noticeable burning reduction + discharge colour shift | Day 14: Burning mostly resolved

TYPE 4: AUSHADHA ASAKTI (SPRAY DEPENDENCY)
Symptoms: Can't sleep without spray, frequency increasing, failed cold turkey attempts
KEY RULE: NEVER cold turkey. Graduated rehabilitation ONLY.
Key treatment: Gau Ghrita Nasya (conditioning FIRST, mandatory) + Bhramari Pranayama before bed + graduated dose reduction
Day milestones: Day 4-5: First 1-2 hours spray-free | Day 8-10: 4-6 hours spray-free | Day 13-14: Night spray becomes optional | Day 21: Most patients completely spray-free

CLINICAL RULES
- Nasya timing: 1-2 hours after sunset, before sleeping. Never post-meal. Never lying flat — sit or recline 45°.
- Anulom-Vilom ratio: 4:16:8 (inhale:hold:exhale). Without ratio — just breathing, not therapeutic.
- Classical sequence: Gau Ghrita Nasya FIRST (Snehana) → then medicated Nasya (Shodhana). Never reverse.
- Kaphaja steam: Tulsi + salt. Pittaja steam: PLAIN WATER ONLY — NO eucalyptus/camphor ever.

PRICING
- 14-Din Nasal Restoration: ₹1,299 — default close for all types
- 28-Din Deep Protocol: ₹2,199 — for 5+ year history, spray dependency, complete smell/taste loss
- VIP Intensive: ₹7,999 — professionals, high-engagement leads
- Maintenance Protocol: ₹799/month — Day 13-14 of active patient

OBJECTION HANDLING
"Thoda mahanga hai" → Monthly antihistamines + spray: ₹400-800 indefinitely. ENT visit: ₹1,000-2,000 — sirf prescription. Yahan 14 din daily personal guidance: ₹1,299 ek baar. Comparison fair nahi hai.
"Pehle bhi Ayurveda try kiya" → Ek honest sawaal: jo try kiya — kya woh specifically aapke Pratishyaya type ke liye tha? Kaphaja ke liye jo kaam karta hai, Pittaja mein WORSE karta hai. Yahi gap hai.
"Koi guarantee hai?" → Guarantee word use nahi karunga — har body alag hoti hai. Jo honestly bol sakta hun: jo patients ne protocol exactly follow kiya — unhe Day 5-7 mein meaningful change mila.
"Ayurveda se nahi hota" → 14 din mein khud feel karein — phir decide karein. Risk ₹1,299 ka hai — 3+ saal ki problem ka solution milne ka chance ke against.
"Abhi nahi — thoda baad" → Jo cycle chal rahi hai, woh apne aap nahi tooti. Koi specific reason hai wait karne ka?
"Itna sab karna padega?" → Total daily time: subah 20-25 min, raat 10-15 min. Main roz exactly batata hun kya karna hai.

RED FLAGS — ALWAYS REFER TO DOCTOR
Mandatory referral: Fever above 102°F with sinus symptoms | Blood in nasal discharge | Severe one-sided facial pain | Vision changes with sinus symptoms (EMERGENCY) | Complete unilateral nasal blockage | Children under 6 | Zero improvement after Day 7.
Script: "Aapke symptoms mein structural component ho sakta hai — ENT se ek baar check karwao. Protocol parallel chal sakta hai."

POWER CLOSES
On the fence: "Ek sawaal: jo condition abhi hai — kya aap iske saath 1 saal aur comfortable hain? Agar nahi — toh 14 din ka structured try worth karne wali cheez hai. ₹1,299 ka risk ek real chance ke against."
Chronic cases (5+ years): "5+ saal se problem hai — matlab kai cheezon ne kaam nahi kiya. Mera protocol unse alag hai kyunki type-specific hai. 14 din try karne se 5 saal ke hisaab mein kya ja raha hai?"

CRITICAL INSTRUCTION FOR THIS DEPLOYMENT:
- You are handling POST-PITCH messages. The user's sinus type has already been identified and the pitch has already been delivered by the system.
- Do NOT restart the diagnostic flow. Do NOT ask for symptoms again.
- Do NOT include any payment links or URLs in your response — the system sends payment links separately when the user explicitly confirms they want to buy.
- Keep responses concise — under 200 words. Mobile-friendly.
- End every response with a soft close or open question to keep the conversation moving.
- If user clearly says yes/wants to buy (haan, okay, shuru karna, lena hai, etc.) — respond warmly but do NOT include payment links. The system detects this and sends links automatically.`;

// ─── STATE STORE ─────────────────────────────────────────────
// { senderId: { state, duration, symptoms, sinusType, hookIndex, postPitchReplies, history } }
const userState = {};

// ─── DEDUPLICATION (FIX: prevents bulk replay on restart) ────
const processedMessages = new Set();
setInterval(() => processedMessages.clear(), 10 * 60 * 1000);

// ─── HOOK ROTATION ────────────────────────────────────────────
const HOOKS = [
  `😮‍💨 Subah uthte hi naak band... sar bhaari... aur din shuru hone se pehle hi thaka hua feel?\n\nYeh sinus ki takleef hai — aur yeh isse zyada exhaust karti hai jitna log samajhte hain.\n\nSahi jagah aaye hain aap. 🌿`,
  `Spray laate ho... thodi der rahat... phir wahi haal. 😮‍💨\n\nSaalon se yeh cycle chal rahi hai — aur andar se pata hai yeh koi solution nahi.\n\nSahi jagah aaye hain aap. 🌿`,
  `Naak band, neend kharab, smell nahi aati, din bhar sar bhaari... 😮‍💨\n\nSinus ke saath jeena bahut mushkil hota hai — aur log sochte hain "ab toh aadat ho gayi."\n\nAap akele nahi hain is mein. Sahi jagah aaye hain. 🌿`,
  `Doctor ke paas gaye, dawai li, thodi rahat mili... phir wahi problem wapas. 😮‍💨\n\nYeh baar baar isliye hota hai kyunki sirf symptoms treat hote hain — andar ki wajah nahi.\n\nSahi jagah aaye hain aap. 🌿`,
  `Raat ko muh khol ke sote hain... subah fresh nahi uthte... din bhar dimag mein buhaari. 😮‍💨\n\nSinus sirf naak ki nahi — poori zindagi ki quality kharab karta hai.\n\nSahi jagah aaye hain aap. 🌿`,
];

// ─── SINUS TYPE DETECTION ─────────────────────────────────────
function detectSinusType(text) {
  const t = text.toLowerCase();
  if (/spray|nasivion|otrivin|otrivine|bina spray|naso|afrin|chhodna|chhod nahi|dependent/.test(t)) return "spray";
  if (/smell nahi|taste nahi|bilkul band|dono taraf|surgery|operation|polyp|nasal polyp|growth/.test(t)) return "polyp";
  if (/peela|peeli|hara|hari|infection|antibiotic|chehra dard|daant dard|pus|fever|bukhar|green|burning|jalan/.test(t)) return "infective";
  if (/dhool|dust|smoke|dhuan|mausam|season|chheenk|chheenkna|sneez|aankhein|aankh khujlati|pollen|pet|bahar niklo/.test(t)) return "allergic";
  return "congestive";
}

// ─── SINUS TYPE REVEAL MESSAGES ───────────────────────────────
function getRevealMessage(type) {
  const reveals = {
    allergic: `Tumhara pattern dekh ke lag raha hai — yeh *Vataja-Kaphaja (Allergic) Sinus* hai. 🌿\n\n✅ *Abhi ek kaam karo:* Ghar se bahar niklo ya doosre room mein jao. Agar wahan symptoms thode different feel hon — yeh confirm karta hai.\n\nAur ek aur sign — *aankhein bhi khujlaati hain* naak ke saath? Congestive mein kabhi nahi hota — yeh Allergic ka clear signal hai.\n\n3,000+ logon mein jinhe yeh pattern tha — inhe trigger-based protocol se sabse fast results mile. 🌿`,
    congestive: `Tumhara pattern dekh ke lag raha hai — yeh *Kaphaja (Congestive) Sinus* hai. 🌿\n\n✅ *Abhi ek kaam karo:* Sir aage jhukao, chehra neeche karo, 5 second ruko. Agar mathe ya galon mein thoda bhaari ya pressure feel ho — confirm hai.\n\nAur subah uthke *pehla adha ghanta sabse bura* lagta hai? Raat bhar flat letne se mucus jam jaati hai — yeh classic Kaphaja pattern hai.\n\nEk important cheez: *dairy* tumhare protocol ka sabse bada hurdle hogi — Charaka Samhita mein direct mention hai. 🌿`,
    spray: `Tumhara pattern dekh ke lag raha hai — yeh *Aushadha Asakti (Spray Dependency) Sinus* hai. 🌿\n\n✅ *Abhi ek test karo:* Ek raat spray mat lo. Agar neend mushkil ho, restless feel ho — confirm hai. Spray ne naak ko physically dependent bana diya hai.\n\nShocking fact: spray ke 2-3 ghante baad *pehle se bhi zyada band* ho jaati hai naak? Yeh rebound congestion hai.\n\n*Cold turkey kabhi mat karo* — isliye kaam nahi karta. Graduated rehabilitation karta hai. 🌿`,
    infective: `Tumhara pattern dekh ke lag raha hai — yeh *Pittaja (Infective/Heat) Sinus* hai. 🌿\n\n✅ *Abhi ek kaam karo:* Apne upar ke daanton mein dhyan do — halka dard ya heaviness? Yeh sinus infection ka direct sign hai.\n\nAntibiotic lete ho toh 3-4 din better lagta hai — band karte ho toh wapas? Yeh bacterial cycle confirm karta hai.\n\n*Critical: eucalyptus ya camphor wali steam kabhi use mat karo* — Pittaja mein yeh WORSE karta hai. Plain water steam only. 🌿`,
    polyp: `Tumhara pattern dekh ke lag raha hai — yeh *Polyp/Blockage Sinus* hai. 🌿\n\n✅ *Abhi ek kaam karo:* Laung ya adrak naak ke paas laao. Kuch smell aaya? Dono taraf equally band hai naak?\n\nEk taraf band = Congestive. *Dono taraf equally band = Polyp pattern confirm.*\n\nKai logon ko surgery suggest hui hoti hai — hamare protocol mein kai logon ne *bina surgery ke bhi improvement* feel ki hai. 🌿`,
  };
  return reveals[type] || reveals["congestive"];
}

// ─── PITCH MESSAGE ─────────────────────────────────────────────
function getPitchMessage(type) {
  const typeNames = {
    allergic: "Vataja-Kaphaja (Allergic) Sinus",
    congestive: "Kaphaja (Congestive) Sinus",
    spray: "Aushadha Asakti (Spray Dependency)",
    infective: "Pittaja (Infective) Sinus",
    polyp: "Polyp/Blockage Sinus",
  };
  const typeName = typeNames[type] || "Sinus";
  return `Tumhare liye ek *personalized protocol* ready kar sakte hain — ${typeName} ke liye specifically. 🌿\n\n*Yeh 2 options hain:*\n\n🌱 *₹499 — Starter Kit*\nTumhare sinus type ka self-guided protocol deliver hoga WhatsApp pe.\n\n---\n\n🌿 *₹1,299 — 14-Din Nasal Restoration Program*\n⭐ _(Sabse zyada liya jaata hai)_\n\n*Exactly yeh milega:*\n✅ Pehle din — tumhari symptoms, history, triggers main personally samjhunga\n✅ Tumhare liye custom daily routine — subah + raat\n✅ 14 din roz mera WhatsApp check-in — "aaj kaisa raha?" personally\n✅ Koi din bura gaya — turant protocol adjust\n✅ Day 7 + Day 14 — progress review personally\n✅ Protocol complete hone ke baad — maintenance guidance free\n\n---\n\nEk ENT doctor 5 visits mein yeh deta hai — ₹3,000-5,000 mein. Aur woh roz check nahi karta.\n\n*Guarantee:* Agar Day 7 tak koi bhi fark feel na ho — main khud personally baat karke protocol adjust karunga.\n\nKaunsa option sahi lagta hai? 🌿`;
}

// ─── CALL SALESOM (Claude AI) ─────────────────────────────────
// Used for all post-pitch replies — objections, curiosity, free-form
async function callSalesom(userMessage, userData) {
  try {
    // Build a rich context block so Claude knows exactly where the user is
    const sinusLabels = {
      allergic: "Vataja-Kaphaja (Allergic)",
      congestive: "Kaphaja (Congestive)",
      spray: "Aushadha Asakti (Spray Dependency)",
      infective: "Pittaja (Infective/Heat)",
      polyp: "Polyp/Blockage",
    };
    const contextBlock = `
[CURRENT CONVERSATION CONTEXT]
- Sinus type identified: ${sinusLabels[userData.sinusType] || "Unknown"}
- Duration of problem: ${userData.duration || "Not specified"}
- Symptoms described: ${userData.symptoms || "Not specified"}
- Post-pitch reply count: ${userData.postPitchReplies || 0} of 2
- Platform: Facebook Messenger
[END CONTEXT]

REMINDER: Do NOT restart the diagnostic flow. Do NOT include payment links or URLs.
The pitch has already been delivered. Handle this as a post-pitch conversation.`;

    // Use stored conversation history for continuity (last 8 messages)
    const history = (userData.history || []).slice(-8);

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      system: SALESOM_SYSTEM_PROMPT + "\n\n" + contextBlock,
      messages: [
        ...history,
        { role: "user", content: userMessage },
      ],
    });

    const reply = response.content[0].text;

    // Store conversation history for continuity
    userData.history = [
      ...history,
      { role: "user", content: userMessage },
      { role: "assistant", content: reply },
    ];

    return reply;
  } catch (err) {
    console.error("Salesom AI error:", err.message);
    // Graceful fallback if Claude call fails
    return `Samajh gaya 🙏 Koi bhi sawaal ho — main yahan hun. Jab ready ho toh batao.`;
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

// ─── SEND QUICK REPLIES ────────────────────────────────────────
async function sendQuickReplies(recipientId, text, replies) {
  try {
    const quick_replies = replies.map((r) => ({
      content_type: "text",
      title: r.substring(0, 20),
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

// ─── MAIN MESSAGE HANDLER ──────────────────────────────────────
async function handleMessage(senderId, messageText, senderName) {
  const text = messageText.trim();
  const textLower = text.toLowerCase();

  if (!userState[senderId]) {
    userState[senderId] = { state: "new", history: [] };
  }
  const userData = userState[senderId];

  // ── HUMAN TAKEOVER CHECK ─────────────────────────────────────
  if (userData.state === "human") return;

  // ── REACTIVATION COMMAND ─────────────────────────────────────
  if (text.startsWith("BOT_ON_")) {
    const targetId = text.replace("BOT_ON_", "").trim();
    if (userState[targetId]) {
      userState[targetId].state = "pitched";
      await sendMessage(senderId, `✅ Bot reactivated for ${targetId}`);
    }
    return;
  }

  // ── PAYMENT CONFIRMATION (universal — any state) ─────────────
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

  // STATE: NEW → Hook + duration question
  if (userData.state === "new") {
    const hookIndex = Math.floor(Math.random() * HOOKS.length);
    userData.hookIndex = hookIndex;
    userData.state = "asked_duration";
    await sendMessage(senderId, HOOKS[hookIndex]);
    await new Promise((r) => setTimeout(r, 1200));
    await sendQuickReplies(
      senderId,
      `Yeh takleef aapko kitne time se hai? 🌿`,
      ["1 mahina se", "6 mahine se", "1-2 saal se", "5+ saal se"]
    );
    await logToSheet(senderId, senderName, "New user — hook sent", "HOOK", "");
    return;
  }

  // STATE: ASKED_DURATION → Empathetic ack + symptoms question
  if (userData.state === "asked_duration") {
    userData.duration = text;
    userData.state = "asked_symptoms";
    const years = extractFirstNumber(text);
    const tl = text.toLowerCase();
    let durationAck;
    if (years >= 10 || (years >= 5 && /saal|year|sal/.test(tl))) {
      durationAck = `${years} saal se yeh takleef hai aapko... 😮‍💨\n\nItne lambe waqt mein body andar se bahut kuch jhel chuki hoti hai — sirf naak nahi, sleep, energy, concentration — sab affect hota hai.\n\nYeh case serious hai aur properly diagnose karna zaroori hai.`;
    } else if (years >= 2 || /saal|year/.test(tl)) {
      durationAck = `${years || "Kai"} saal se chal raha hai yeh — iska matlab yeh temporary nahi, andar kuch set ho chuka hai.\n\nSahi diagnosis ke bina treatment kaam nahi karti.`;
    } else if (/mahine|month|mahina/.test(tl)) {
      durationAck = `Kaafi waqt se chal rahi hai yeh takleef — is stage pe sahi protocol se jaldi theek ho sakta hai.\n\nPehle thoda aur samajhte hain.`;
    } else {
      durationAck = `Okay, samajh gaya. Pehle properly diagnose karte hain — symptoms ke hisaab se sinus ka type alag hota hai aur treatment bhi.`;
    }
    await sendMessage(senderId, durationAck);
    await new Promise((r) => setTimeout(r, 1000));
    await sendQuickReplies(
      senderId,
      `Aur symptoms kya hain? Jo bhi feel hota hai select karo ya apne words mein batao. 🌿`,
      ["Naak band rehti hai", "Spray use karta hun", "Smell nahi aati", "Peela/hara discharge"]
    );
    await logToSheet(senderId, senderName, "Duration: " + text, "DURATION", "");
    return;
  }

  // STATE: ASKED_SYMPTOMS → Detect type, reveal, pitch
  if (userData.state === "asked_symptoms") {
    userData.symptoms = text;
    const sinusType = detectSinusType(text);
    userData.sinusType = sinusType;
    userData.state = "pitched";
    userData.postPitchReplies = 0;
    userData.history = []; // Fresh history from pitch onwards

    const dur = userData.duration || "";
    await sendMessage(
      senderId,
      `Theek hai, note kar liya. 🌿\n\n*Aapki situation:*\n📅 Takleef: ${dur} se\n🔍 Symptoms: ${text}\n\nYeh details dekh ke diagnosis kar raha hun...`
    );
    await new Promise((r) => setTimeout(r, 1500));
    await sendMessage(senderId, getRevealMessage(sinusType));
    await new Promise((r) => setTimeout(r, 1500));
    await sendMessage(senderId, getPitchMessage(sinusType));
    await new Promise((r) => setTimeout(r, 800));
    await sendQuickReplies(
      senderId,
      `Kaunsa option sahi lagta hai tumhe? 🌿`,
      ["Full Program (₹1,299)", "Starter Kit (₹499)", "Pehle sawaal hai"]
    );
    await logToSheet(senderId, senderName, `Symptoms: ${text}`, "PITCHED", sinusType);
    return;
  }

  // ── STATE: PITCHED → Claude/Salesom handles everything ───────
  if (userData.state === "pitched") {

    // Check if user silently exceeded reply limit → hand off
    if (userData.postPitchReplies >= 2) {
      userData.state = "human";
      console.log(`🔴 Auto human takeover for ${senderId}`);
      await logToSheet(senderId, senderName, `Auto handoff`, "HUMAN_TAKEOVER", userData.sinusType);
      return;
    }

    // ── YES DETECTION → Send payment links (only place they're sent) ──
    const userSaidYes = /haan|ha |yes|theek|ok\b|okay|shuru|karein|karna|chahta|chahti|le leta|le lungi|lena\b|interested|1299|499|full program|starter|bhejo|link bhejo|link do|send link/.test(textLower);

    if (userSaidYes) {
      userData.postPitchReplies = (userData.postPitchReplies || 0) + 1;
      await sendQuickReplies(
        senderId,
        `Bahut acha! 🌿\n\nYeh links hain:\n\n🌱 *₹499 Starter:* ${PAYMENT_499}\n\n🌿 *₹1,299 Full Program:* ${PAYMENT_1299}\n\nPayment ke baad confirm karna — main personally WhatsApp pe connect karunga. 🌿`,
        ["Payment kar diya ✅", "Ek sawaal aur"]
      );
      await logToSheet(senderId, senderName, `User said yes: ${text}`, "LINK_SENT", userData.sinusType);
      return;
    }

    // ── ALL OTHER MESSAGES → Salesom (Claude AI) handles ──────
    userData.postPitchReplies = (userData.postPitchReplies || 0) + 1;

    // Show typing indicator feel with slight delay
    await new Promise((r) => setTimeout(r, 800));

    const aiReply = await callSalesom(text, userData);
    await sendMessage(senderId, aiReply);

    // After AI reply — if still have budget, show smart reply buttons
    if (userData.postPitchReplies < 2) {
      await new Promise((r) => setTimeout(r, 600));
      await sendQuickReplies(senderId, `🌿`, [
        "Haan, shuru karna hai",
        "Ek aur sawaal hai",
        "Sochna hai thoda",
      ]);
    } else {
      // Last AI reply — add handoff note
      await new Promise((r) => setTimeout(r, 800));
      await sendMessage(
        senderId,
        `Tumhara sawaal hamare *Sinus Relief Specialist* tak pahuncha diya hai. 🌿\n\nYahan wait karo — thodi der mein reply aayega.\n\nYa seedha WhatsApp karo: 📱 *85951 60713*`
      );
      userData.state = "human";
      await logToSheet(senderId, senderName, `Handoff after AI replies: ${text}`, "HUMAN_TAKEOVER", userData.sinusType);
    }

    await logToSheet(senderId, senderName, `AI handled: ${text}`, "AI_REPLY", userData.sinusType);
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

  // FALLBACK
  userData.state = "new";
  userData.history = [];
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

        // FIX: Skip old messages (prevents bulk replay on restart)
        const MSG_AGE_LIMIT_MS = 5 * 60 * 1000;
        if (event.timestamp && Date.now() - event.timestamp > MSG_AGE_LIMIT_MS) {
          console.log(`⏭️ Skipped old message (${Math.round((Date.now() - event.timestamp) / 1000)}s old) from ${senderId}`);
          continue;
        }

        // FIX: Deduplication
        if (event.message?.mid) {
          if (processedMessages.has(event.message.mid)) {
            console.log(`⏭️ Duplicate skipped: ${event.message.mid}`);
            continue;
          }
          processedMessages.add(event.message.mid);
        }

        // Page reply ₒ human takeover
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

app.get("/", (req, res) => res.send("Ayusomam Bot v2.3 — Salesom AI Active 🌿"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌿 Ayusomam Bot v2.3 — Salesom AI running on port ${PORT}`));
