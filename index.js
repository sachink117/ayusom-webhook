// ============================================================
// AYUSOMAM MESSENGER BOT — Version 4.0 (SALESOM COMPLETE)
// Built by Claude | Ayusomam Herbals
//
// NEW in v4.0:
// ✅ 6 Sinus Types: Allergic, Congestive, Heat, Spray, Polyp/Structural, DNS
// ✅ 5-Phase Sales Architecture: Probe→Mirror→Educate→Reframe→Close
// ✅ Ghosting Recovery: 24hr + 72hr type-aware messages
// ✅ Day-wise Milestone Scheduler: Day 5, 7, 10, 13 proactive check-ins
// ✅ Objection Handling: 12 scripted counters in AI prompt
// ✅ Two Plans Only: 7-Day Sinus Reset ₹499 | 14-Day Sinus Restoration ₹1,299
// ✅ Red Flag Detection → Doctor referral auto-trigger
// ✅ Seasonal Broadcast System
// ✅ Google Sheets logging
// ============================================================

const express = require("express");
const Anthropic = require("@anthropic-ai/sdk");
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ─── CONFIG ──────────────────────────────────────────────────
const PAGE_ACCESS_TOKEN   = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN        = process.env.VERIFY_TOKEN;
const ANTHROPIC_API_KEY   = process.env.ANTHROPIC_API_KEY;
const TWILIO_ACCOUNT_SID  = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN   = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WA_NUMBER    = process.env.TWILIO_WHATSAPP_NUMBER;
const INSTAGRAM_TOKEN     = process.env.INSTAGRAM_ACCESS_TOKEN;
const SHEET_URL           = process.env.GOOGLE_SHEET_URL || "";
const PORT                = process.env.PORT || 3000;

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// ─── IN-MEMORY STORE ─────────────────────────────────────────
// userData[userId] = { lang, sinusType, convPhase, state, history,
//   duration, symptoms, usedAllopathy, selectedPlan, enrolledAt,
//   lastMessageAt, ghostAttempts, followupStage, milestonesSent[] }
const userData = {};
const processedMessages = new Set();

// ─── PRICING ─────────────────────────────────────────────────
// Two standalone plans — no add-ons, no bundles
// 7-Day plan doubles as maintenance after 14-Day completion
const PRICES = {
  reset:      { name: "7-Day Sinus Reset",       price: "₹499",   days: 7  },
  restoration: { name: "14-Day Sinus Restoration", price: "₹1,299", days: 14 },
};

// ─── SINUS TYPES ─────────────────────────────────────────────
const SINUS_TYPES = {
  allergic:    "Vataja-Kaphaja (Allergic/Seasonal)",
  congestive:  "Kaphaja (Congestive/Post-Cold)",
  infective:   "Pittaja (Heat/Infective Pattern)",
  spray:       "Aushadha Asakti (Spray Dependency)",
  polyp:       "Nasal Polyp / Structural",
  dns:         "Deviated Nasal Septum (DNS)",
};

// ─── CONV PHASES ─────────────────────────────────────────────
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
  const marathi    = (text.match(/[\u0900-\u097F]/g) || []).length;
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

// ─── SINUS TYPE DETECTION (keyword-based pre-screen) ─────────
function detectSinusTypeFromText(text) {
  const t = text.toLowerCase();
  if (t.includes("spray") || t.includes("otrivin") || t.includes("nasivion") ||
      t.includes("nasal drop") || t.includes("bina spray"))                     return "spray";
  if (t.includes("polyp") || t.includes("polip") || t.includes("growt"))        return "polyp";
  if (t.includes("dns") || t.includes("deviated") || t.includes("septum") ||
      t.includes("tirchi") || t.includes("crooked"))                            return "dns";
  if (t.includes("jalan") || t.includes("burning") || t.includes("yellow") ||
      t.includes("peela") || t.includes("pus") || t.includes("infection"))      return "infective";
  if (t.includes("band") || t.includes("smell") || t.includes("taste") ||
      t.includes("gandh") || t.includes("swad") || t.includes("heaviness"))     return "congestive";
  if (t.includes("sneez") || t.includes("chhink") || t.includes("allerg") ||
      t.includes("dhool") || t.includes("dust") || t.includes("watery eye"))    return "allergic";
  return null;
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
  const client = require("twilio")(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  return client.messages.create({
    body,
    from: `whatsapp:${TWILIO_WA_NUMBER}`,
    to:   `whatsapp:${to}`,
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
  const url = `https://graph.facebook.com/v18.0/me/messages?access_token=${INSTAGRAM_TOKEN}`;
  const res = await fetch(url, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ recipient: { id: recipientId }, message: { text } }),
  });
  return res.json();
}

async function sendMessage(platform, userId, text) {
  if (!text || !text.trim()) return;
  const chunks = splitMessage(text);
  for (const chunk of chunks) {
    if      (platform === "twilio")    await sendTwilioMessage(userId, chunk);
    else if (platform === "instagram") await sendInstagramMessage(userId, chunk);
    else                               await sendFBMessage(userId, chunk);
    if (chunks.length > 1) await sleep(600);
  }
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

async function sendQuickReplies(platform, userId, text, options) {
  const optText = options.map((o, i) => `${i + 1}. ${o}`).join("\n");
  await sendMessage(platform, userId, `${text}\n\n${optText}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── GOOGLE SHEETS LOGGING ────────────────────────────────────
async function logToSheet(userId, platform, sinusType, state, msg, botReply) {
  if (!SHEET_URL) return;
  try {
    await fetch(SHEET_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        timestamp: new Date().toISOString(),
        userId,
        platform,
        sinusType: sinusType || "unknown",
        state,
        userMsg: msg?.substring(0, 200),
        botReply: botReply?.substring(0, 200),
      }),
    });
  } catch (e) {
    console.error("Sheet log error:", e.message);
  }
}

// ─── SALESOM SYSTEM PROMPT ────────────────────────────────────
function buildSystemPrompt(user) {
  const lang = user.lang || "hin";
  const sinusType = user.sinusType ? SINUS_TYPES[user.sinusType] || user.sinusType : "unknown — still diagnosing";
  const phase = user.convPhase || "probe";
  const duration = user.duration || "not asked yet";
  const usedAllopathy = user.usedAllopathy ?? null;

  const langInstruction = {
    hin: "LANGUAGE: Respond in Hinglish (Hindi+English mix). Use Devanagari for emotional/clinical terms, English for product names. Aap/Ji — formal warm tone. NEVER Bhai/Yaar/Boss.",
    eng: "LANGUAGE: Respond in English. Professional warm tone. No slang.",
    ben: "LANGUAGE: Respond in Bengali mixed with English. Warm formal tone.",
    mar: "LANGUAGE: Respond in Marathi mixed with English. Aapan/Ji tone.",
    pun: "LANGUAGE: Respond in Punjabi mixed with English. Respectful tone.",
    tel: "LANGUAGE: Respond in Telugu mixed with English. Warm formal tone.",
    tam: "LANGUAGE: Respond in Tamil mixed with English. Warm formal tone.",
    kan: "LANGUAGE: Respond in Kannada mixed with English. Warm formal tone.",
  }[lang] || "LANGUAGE: Respond in Hinglish.";

  return `You are SALESOM — Ayusomam Herbals ka specialized Ayurvedic Sinus Consultant. You are "Sachin" on WhatsApp.

${langInstruction}

CURRENT PATIENT STATE:
- Sinus Type Identified: ${sinusType}
- Conversation Phase: ${phase}
- Problem Duration: ${duration}
- Used Allopathy Before: ${usedAllopathy === null ? "not asked" : usedAllopathy ? "yes" : "no"}

YOUR 6 SINUS TYPES + APPROACH:

1. ALLERGIC (Vataja-Kaphaja Pratishyaya)
   Symptoms: Morning sneezing, watery eyes, dust/cold triggers, seasonal cycles
   Approach: Mirror the cycle pattern → Educate on nasal lining hypersensitivity → Anu Tailam Nasya + Anulom-Vilom
   Key probe: "Triggers kaun se hain? Season change mein worse hota hai?"
   Day 5 milestone: Trigger sensitivity reduces. Day 14: Cycle breaks.

2. CONGESTIVE (Kaphaja Pratishyaya)
   Symptoms: Blocked nose, smell/taste loss, face heaviness, post-cold onset
   Approach: Dairy probe is critical — dairy = Nidana for Kapha
   Key probe: "Dairy — doodh, dahi, paneer — kitna lete hain?"
   Day 5-7 milestone: Smell/taste begins returning. Day 14: Significant restoration.

3. HEAT PATTERN (Pittaja Pratishyaya)
   Symptoms: Burning sensation, yellow discharge, worse in heat, antibiotic cycle
   Approach: CRITICAL warning — eucalyptus/camphor steam WORSENS this type
   Key probe: "Spicy food ya garmi mein worse hota hai?"
   Day 5 milestone: Burning reduces, discharge color shifts yellow→clear.

4. SPRAY DEPENDENCY (Aushadha Asakti)
   Symptoms: Cannot sleep without spray, frequency increasing, failed cold turkey
   Approach: Validate physiological dependency (not willpower failure) → Graduated rehabilitation
   Key insight: Cold turkey = rebound = failure. Graduated approach only.
   Day 10 milestone: 4-6 hours spray-free possible.

5. NASAL POLYP / STRUCTURAL CONCERN
   Symptoms: One-sided blockage, reduced smell, feeling of fullness, no relief from any treatment
   Approach: MEDICALLY SAFE GUIDANCE ONLY. Do NOT claim to shrink polyps. 
   Honest framing: "Structural issues ENT se confirm karwao. Hamare protocol se inflammation reduce hoti hai — jo polyp ke saath coexisting Kapha hai woh address hota hai. Structural correction surgical hai."
   ALWAYS recommend ENT evaluation first for polyp cases.
   Protocol helps: Reduces surrounding inflammation, improves breathing alongside medical treatment.

6. DEVIATED NASAL SEPTUM (DNS)
   Symptoms: Chronic one-sided blockage, lifelong issue, worse at night, often since childhood
   Approach: MEDICALLY SAFE — DNS is anatomical, protocol cannot straighten septum.
   Honest framing: "DNS ka permanent solution surgical correction hai. Hamare protocol se jo surrounding inflammation aur Kapha congestion hai — woh address hota hai. Breathing quality improve hoti hai significantly even with DNS."
   Many DNS patients get 60-70% relief from congestion reduction even without surgery.
   NEVER claim to fix DNS anatomically.

YOUR 5-PHASE CONVERSATION ARCHITECTURE:
- PROBE: Ask 1-2 smart diagnostic questions. Identify type.
- MIRROR: Reflect symptoms back accurately. Build trust. "Matlab..."
- EDUCATE: Explain WHY their current approach isn't working. Classical text reference (Charaka/Ashtanga Hridayam).
- REFRAME: Show them the gap between what they tried vs type-specific protocol.
- CLOSE: Offer 14-Day Sinus Restoration ₹1,299 as default. If hesitation — offer 7-Day Sinus Reset ₹499. Clear CTA: "Link bheju?"

CURRENT PHASE = ${phase.toUpperCase()}. Stay in this phase unless user signals readiness to move forward.

PLANS — ONLY TWO. Never mention any other plan.

1. 7-Day Sinus Reset — ₹499
   → Standalone 7-day protocol
   → Also offered as maintenance/seasonal plan after someone completes the 14-Day
   → Good for: First-time buyers who are hesitant, seasonal flare management, post-14-day maintenance
   → Pitch as: "7-Day Sinus Reset — ₹499. Ek structured week mein triggers ko address karte hain. Start karein?"

2. 14-Day Sinus Restoration — ₹1,299
   → Main program. Full 14-day type-specific protocol with daily WhatsApp guidance
   → Good for: Anyone with chronic symptoms (2+ weeks), all 6 types
   → Pitch as: "14-Day Sinus Restoration — ₹1,299. 14 din daily personal guidance, type-specific protocol. Link bheju?"

PLAN SELECTION LOGIC:
- DEFAULT pitch: 14-Day Sinus Restoration (₹1,299) — for all cases
- Pitch 7-Day Reset (₹499) if:
  a) Lead is hesitant on price — "7-Day Reset se shuru kar sakte hain — ₹499"
  b) Lead has already completed 14-Day and wants to maintain
  c) Mild/seasonal case where 7 days is genuinely sufficient
- After 14-Day completion → offer 7-Day Reset as seasonal maintenance: "Ab ise ₹499 mein monthly reset ke roop mein use kar sakte hain"
- NEVER mention VIP, 28-day, bundles, or any other tier

OBJECTION HANDLING — EXACT RESPONSES:

"Mahanga hai":
→ "Samjha 🙏 Ek option hai — 7-Day Sinus Reset se shuru kar sakte hain: ₹499. 7 din ka structured protocol, results feel karein. Agar achha lage toh 14-Day Sinus Restoration (₹1,299) se complete karte hain. Sirf ₹499 mein start — theek lagta hai?"

"Pehle Ayurveda try kiya — kuch nahi hua":
→ "Jo try kiya — kya woh specifically aapke type ke liye tha? Kaphaja mein jo kaam karta hai, Pittaja mein WORSE karta hai. Yahi gap hai — generic vs type-specific Shodhana."

"Koi guarantee hai?":
→ "Guarantee word use nahi karunga — har body alag hoti hai. Jo honestly bol sakta hun: Jo patients ne protocol exactly follow kiya — dairy cessation including — unhe Day 5-7 mein meaningful change mila. Main Day 10 tak kuch feel na ho toh protocol adjust karta hun personally."

"Itna sab karna padega — time nahi":
→ "Total: subah 20-25 min, raat 10-15 min. Main roz exactly batata hun kya karna hai — sochna nahi padta, sirf karna padta hai."

"Doctor ne bola Ayurveda se nahi hoga":
→ "Doctor allopathic framework se dekh rahe hain — jo jaante hain woh bataya. Classical Ayurveda Pratishyaya classification dosha+Srotas framework hai. 14 din try karna medical treatment rok nahi raha."

"Pehle free try karwao":
→ Type-specific free tip do. Allergic: "Aaj se 3 din Anulom-Vilom 10 min karo — feel karein." Kaphaja: "3 din dairy completely band karo — akeli yeh cheez noticeable difference karti hai." Phir: "Yeh ek intervention hai — full protocol mein 7-8 hain."

"Abhi nahi — baad mein":
→ "Jo cycle chal rahi hai — apne aap nahi tooti. Woh 2-3 saal pehle bhi yahi condition thi. Koi specific reason hai ruk ne ka? Bata sakte hain."

RED FLAGS — AUTO-REFER:
If user mentions: blood in discharge, vision changes, 102°F+ fever with sinus, severe one-sided facial pain, eye swelling → IMMEDIATELY say:
"Yeh symptoms serious indication hain. Please aaj hi ENT ya doctor se milein — yeh emergency signs hain jo pehle evaluate hone chahiye. Protocol baad mein start kar sakte hain."
Do NOT try to continue sales conversation when red flags present.

FORMATTING RULES:
- Mobile-friendly: Short paragraphs, max 3-4 lines per block
- One question per message
- Emojis: 🙏 for empathy, ✅ for confirmation — use sparingly
- NEVER use: Bhai, Yaar, Boss, Dude
- ALWAYS use: Aap, Ji
- End close messages with: "Link bheju?" or "Try karna chahenge?"

IMPORTANT: You are a SALES consultant, not a replacement for medical care. Always recommend ENT for polyp/DNS/red flags. For allergic/congestive/heat/spray — protocol is appropriate as primary complementary care.`;
}

// ─── SALESOM AI CALL ──────────────────────────────────────────
async function callSalesom(userId, userMessage, platform) {
  const user = userData[userId];

  // Build conversation history
  const history = (user.history || []).slice(-12); // last 12 turns for context

  const messages = [
    ...history,
    { role: "user", content: userMessage },
  ];

  const response = await anthropic.messages.create({
    model:      "claude-sonnet-4-20250514",
    max_tokens: 1000,
    system:     buildSystemPrompt(user),
    messages,
  });

  const reply = response.content?.[0]?.text || "";

  // Update history
  if (!user.history) user.history = [];
  user.history.push({ role: "user",      content: userMessage });
  user.history.push({ role: "assistant", content: reply });

  // Keep history bounded
  if (user.history.length > 24) user.history = user.history.slice(-24);

  return reply;
}

// ─── PHASE ADVANCEMENT LOGIC ──────────────────────────────────
function advancePhase(user, userMessage) {
  const phase = user.convPhase || "probe";
  const msg = userMessage.toLowerCase();

  // Signals to move to next phase
  const buySignals = ["haan", "yes", "try", "interested", "batao", "link", "kaise", "kab", "start"];
  const hasBuySignal = buySignals.some((s) => msg.includes(s));

  const phaseMap = {
    probe:    "mirror",
    mirror:   "educate",
    educate:  "reframe",
    reframe:  "close",
    close:    "close",
  };

  if (hasBuySignal && phase !== "close") {
    user.convPhase = phaseMap[phase];
  }

  // Auto-advance after type identified
  if (!user.sinusType && phase === "probe") {
    const detected = detectSinusTypeFromText(userMessage);
    if (detected) {
      user.sinusType = detected;
      user.convPhase = "mirror";
    }
  }
}

// ─── GHOSTING RECOVERY MESSAGES ───────────────────────────────
function getGhostMessage(user, attempt) {
  const type = user.sinusType;
  const name = user.name || "Ji";

  if (attempt === 1) {
    // 24hr recovery — type-specific clinical hook
    const hooks = {
      allergic:   `${name} 🙏 Kal baat hui thi seasonal sneezing ke baare mein. Ek cheez share karna tha — Vataja-Kaphaja mein Anulom-Vilom timing bahut important hoti hai, bahut log yeh miss karte hain. Jab time ho.`,
      congestive: `${name} 🙏 Smell-taste ke baare mein baat hui thi. Ek cheez — Kaphaja mein Gandoosha Kriya steam se pehle karni hoti hai. Yeh akela step bahut difference karta hai. Jab time ho.`,
      infective:  `${name} 🙏 Kal naak ki jalan ke baare mein baat hui thi. Important — eucalyptus steam Pittaja mein condition WORSE karta hai. Agar use kar rahe hain — aaj se band karein. Jab time ho.`,
      spray:      `${name} 🙏 Spray dependency ke baare mein baat hui thi. Jo mechanism share kiya — woh clear hua hoga. Cold turkey kabhi kaam nahi karta — yahi reason hai attempts fail hote hain. Aur bhi batana tha. Jab ready hon.`,
      polyp:      `${name} 🙏 Kal aapki condition ke baare mein baat hui thi. Structural issues ke saath bhi inflammation reduce karna possible hai — aur breathing quality significantly improve hoti hai. Jab time ho.`,
      dns:        `${name} 🙏 DNS ke baare mein baat hui thi. Surrounding inflammation aur Kapha congestion — jo DNS ke saath hoti hai — usse address karna breathing quality bahut improve karta hai. Aur share karna tha. Jab time ho.`,
    };
    return hooks[type] || `${name} 🙏 Kal sinus ke baare mein baat hui thi. Ek specific insight thi aapke case ke liye. Jab time ho.`;
  }

  if (attempt === 2) {
    // 72hr — direct check
    return `${name} — seedha sawaal: kya woh problem abhi bhi chal rahi hai?\n\nAgar haan — sahi option discuss karte hain.\nAgar theek ho gaya — bahut achha, batayein.\n\nKoi pressure nahi. 🙏`;
  }

  return null; // No more attempts after 2
}

// ─── DAY-WISE MILESTONE MESSAGES ─────────────────────────────
function getMilestoneMessage(user, day) {
  const type = user.sinusType;
  const name = user.name || "Ji";

  const milestones = {
    allergic: {
      5:  `${name} 🙏 Day 5 check-in — sneezing triggers ka response thoda kam feel ho raha hoga. Dusty jagah ya subah ka episode pehle se mild?\n\nJo bhi feel ho — batayein. Protocol adjust karna ho toh karunga.`,
      7:  `${name} 🙏 Day 7 — aaj ka ek important observation: kya triggers ki intensity kam hui hai? Season sensitivity mein noticeable fark aa raha hoga abhi tak.\n\nKaisi chal rahi hai progress? 🙏`,
      10: `${name} 🙏 Day 10 complete — bahut achha 💪\n\nAllergic cycle break hona shuru hoti hai is point pe. Antihistamine kitni baar leni padi last 3 din mein?\n\nAgl 4 din critical hain — consistency maintain karein.`,
      13: `${name} 🙏 Day 13 — almost complete!\n\nAapki progress dekh ke suggest karna chahta hun: 7-Day Sinus Reset (₹499) se jo improvement aayi hai woh seasonal peak pe bhi hold karega. Monthly ek baar 7-din ka reset — triggers wapas build nahi hote.\n\nInterested hain? 14-Day ke baad seedha shuru kar sakte hain.`,
    },
    congestive: {
      5:  `${name} 🙏 Day 5 — most important check-in.\n\nSmell ya taste mein koi bhi — even thoda — sensation wapas aa rahi hai?\nEven 10% return = protocol kaam kar raha hai.\n\nBatayein — main eagerly wait kar raha hun is feedback ka. 🙏`,
      7:  `${name} 🙏 Day 7 milestone! Smell-taste return usually is window mein hoti hai.\n\nKaisa feel ho raha hai? Aur — dairy completely band hai na? Yeh single factor sabse zyada results affect karta hai.`,
      10: `${name} 🙏 Day 10 — congestion significantly reduced honi chahiye. Subah naak kitni band hoti hai aaj?\n\nAgar improvement hai — achha. Agar kuch feel nahi — dairy ke baare mein honestly batayein.`,
      13: `${name} 🙏 Kal last day hai 14-Day Sinus Restoration ka — bahut achhi journey rahi 🙏\n\nSmell-taste restore hua — isko maintain karna ho toh 7-Day Sinus Reset (₹499) monthly use kar sakte hain. Kapha dobara build nahi hota.\n\nLink bheju?`,
    },
    infective: {
      5:  `${name} 🙏 Day 5 check-in — burning mein noticeable reduction aa rahi hogi.\n\nDischarge ka color — abhi bhi yellow hai ya thoda change aa raha hai?\nYellow → cloudy → clear = Pitta normalize ho rahi hai.\n\nBatayein.`,
      7:  `${name} 🙏 Day 7 — discharge predominantly clear hona chahiye abhi tak.\n\nEk reminder: garm chai, spicy khana, garmi mein zyada time — yeh sab Pitta rebuild karte hain. Kuch issues hain is front pe?`,
      10: `${name} 🙏 Day 10 — headache frequency bhi kam hui hogi. Kaisi hai overall progress?\n\nAgar burning abhi bhi significant hai — ek adjustment karte hain protocol mein. Batayein honestly.`,
      13: `${name} 🙏 Kal complete hoga 14-Day Sinus Restoration 🙏\n\nPitta seasonal flare (garmi mein) wapas aa sakti hai bina maintenance ke. 7-Day Sinus Reset (₹499) — season se pehle ek baar karo, flare aata hi nahi.\n\nInterested?`,
    },
    spray: {
      5:  `${name} 🙏 Day 5 — pehla bada milestone!\n\nKya koi 1-2 ghante ka period aaya jab spray bina naak theek rahi?\nChhoti si bhi spray-free window = body ka natural mechanism wapas aa raha hai.\n\nCelebrate karein yeh — genuinely bada hai. 🙏`,
      7:  `${name} 🙏 Day 7 — raat mein spray use kitni baar ho rahi hai?\n\nBhramari Pranayama 10 min sone se pehle — most important step hai is phase mein. Kar rahe hain?`,
      10: `${name} 🙏 Day 10 — KEY milestone! Daytime mein 4-6 ghante spray-free hona possible hona chahiye abhi.\n\nKitne ghante spray-free rahe aaj? Honest number batayein.`,
      13: `${name} 🙏 Almost there! Spray dependency se freedom — jo 2 saal pehle impossible laga tha.\n\nRaat ka spray abhi bhi hai toh 7-Day Sinus Reset (₹499) se extended rehabilitation karte hain. Spray-free ho chuke hain toh seasonal Reset monthly ek baar — jo progress aayi hai woh hold karti hai.\n\nKya prefer karenge?`,
    },
    polyp: {
      5:  `${name} 🙏 Day 5 — inflammation reduction shuru hoti hai is point pe.\n\nBreathing thodi bhi easy feel ho rahi hai? Even partial relief = Kapha congestion address ho rahi hai — polyp ke around jo swelling thi woh kam ho rahi hai.\n\nBatayein.`,
      7:  `${name} 🙏 Day 7 check-in — ENT appointment schedule kiya?\n\nProtocol ke saath parallel ENT evaluation important hai aapke case mein. Dono sath chalna best outcome deta hai.`,
      10: `${name} 🙏 Day 10 — kaisi hai breathing quality?\n\nPolyp ke cases mein surrounding inflammation address hona breathing ko significantly improve karta hai — even structurally. Abhi tak ka progress batayein. 🙏`,
      13: `${name} 🙏 14 din complete hone wale hain 🙏\n\nPolyp cases mein inflammation wapas build hoti hai without maintenance. 7-Day Sinus Reset (₹499) — monthly ek baar karo, inflammation ka wapas aana rok sakte hain.\n\nLink bheju?`,
    },
    dns: {
      5:  `${name} 🙏 Day 5 — congestion quality mein koi change feel ho raha hai?\n\nDNS ke saath bhi surrounding Kapha congestion reduce hona breathing significantly improve karta hai. Kuch feel hua?`,
      7:  `${name} 🙏 Day 7 — raat mein naak band hona kam hua hai?\n\nSone ki position (affected side upar) bhi important hai DNS mein — kar rahe hain?`,
      10: `${name} 🙏 Day 10 milestone — overall breathing quality 1-10 mein kitni feel hoti hai ab vs Day 1?\n\nDNS cases mein bhi 60-70% improvement possible hai with consistent protocol.`,
      13: `${name} 🙏 Kal last day 🙏\n\nDNS ke saath seasonal congestion wapas aa sakti hai. 7-Day Sinus Reset (₹499) — season change pe ek baar karo, year-round breathing quality maintain rehti hai.\n\nInterested hain?`,
    },
  };

  const typeMilestones = milestones[type] || milestones.congestive;
  return typeMilestones[day] || null;
}

// ─── SCHEDULED JOBS ───────────────────────────────────────────
// Run every 30 minutes — check ghosting + day milestones
setInterval(async () => {
  const now = Date.now();

  for (const [userId, user] of Object.entries(userData)) {
    if (!user.platform) continue;

    // ── GHOSTING RECOVERY ──
    if (
      user.state &&
      !["done", "post_payment", "human"].includes(user.state) &&
      user.lastMessageAt &&
      !user.ghostHandled
    ) {
      const hoursSince = (now - user.lastMessageAt) / (1000 * 60 * 60);

      if (hoursSince >= 24 && hoursSince < 25 && (user.ghostAttempts || 0) === 0) {
        const msg = getGhostMessage(user, 1);
        if (msg) {
          await sendMessage(user.platform, userId, msg);
          user.ghostAttempts = 1;
          user.lastMessageAt = now;
          await logToSheet(userId, user.platform, user.sinusType, "ghost_1", "", msg);
        }
      } else if (hoursSince >= 72 && hoursSince < 73 && (user.ghostAttempts || 0) === 1) {
        const msg = getGhostMessage(user, 2);
        if (msg) {
          await sendMessage(user.platform, userId, msg);
          user.ghostAttempts = 2;
          user.lastMessageAt = now;
          await logToSheet(userId, user.platform, user.sinusType, "ghost_2", "", msg);
        }
      }
    }

    // ── DAY-WISE MILESTONE CHECK-INS ──
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

// ─── CLEAR OLD PROCESSED MESSAGES ────────────────────────────
setInterval(() => processedMessages.clear(), 10 * 60 * 1000);

// ─── MAIN MESSAGE HANDLER ─────────────────────────────────────
async function handleMessage(senderId, messageText, platform) {
  if (!messageText || !messageText.trim()) return;
  const text = messageText.trim();

  // Init user
  if (!userData[senderId]) {
    userData[senderId] = {
      lang:           null,
      sinusType:      null,
      convPhase:      "probe",
      state:          "new",
      history:        [],
      duration:       null,
      symptoms:       null,
      usedAllopathy:  null,
      selectedPlan:   null,
      enrolledAt:     null,
      lastMessageAt:  Date.now(),
      ghostAttempts:  0,
      milestonesSent: [],
      platform,
    };
  }

  const user = userData[senderId];
  user.lastMessageAt = Date.now();
  user.ghostAttempts = 0; // Reset ghost counter on new message
  user.platform      = platform;

  // ── LANGUAGE DETECTION ──
  if (!user.lang) {
    const detected = detectLang(text);
    user.lang = detected;
  }

  // ── LANGUAGE SELECTION (number input at start) ──
  if (user.state === "new" && /^[1-5]$/.test(text.trim())) {
    const langMap = { "1": "hin", "2": "eng", "3": "mar", "4": "pun", "5": "tel" };
    user.lang  = langMap[text] || "hin";
    user.state = "asked_duration";
    const welcome = {
      hin: "Shukriya! 🙏\n\nMujhe apni sinus ki takleef ke baare mein batayein — kya problem hai aur kitne samay se chal rahi hai?",
      eng: "Thank you! 🙏\n\nPlease tell me about your sinus problem — what symptoms do you have and how long has it been going on?",
      mar: "Dhanyawad! 🙏\n\nAapalyaa sinus problem baddal sangaa — kay tras ahe aani kiti diwsaanpaasun?",
      pun: "Shukriya! 🙏\n\nApni sinus di problem baare dasao — ki takleef hai te kitne samay to?",
      tel: "Dhanyavaadamulu! 🙏\n\nMee sinus samasya gurinchi cheppandi — emi symptoms unnaayi, epta nunchi?",
    };
    await sendWithTyping(platform, senderId, welcome[user.lang] || welcome.hin);
    return;
  }

  // ── WELCOME / LANGUAGE CHOICE ──
  if (user.state === "new") {
    user.state = "lang_offered";
    const welcomeMsg =
      "Namaste! Ayusomam Herbals mein swagat hai 🙏\nHum sinus ki takleef mein specialized Ayurvedic guidance dete hain.\n\nAap kis bhasha mein comfortable hain?\n1 - Hindi / Hinglish\n2 - English\n3 - Marathi\n4 - Punjabi\n5 - Telugu / Tamil / Kannada\n\nBas number reply karein — main usi mein baat karunga";
    await sendWithTyping(platform, senderId, welcomeMsg, 800);
    return;
  }

  // ── RED FLAG CHECK — highest priority ──
  if (hasRedFlag(text)) {
    const redFlagMsg =
      user.lang === "eng"
        ? "⚠️ These symptoms need immediate medical attention. Please see an ENT specialist or doctor today — blood in discharge, vision changes, or high fever with sinus pain are serious signs that must be evaluated first. Please don't delay."
        : "⚠️ Yeh symptoms serious indication hain 🙏\n\nPlease aaj hi ENT ya doctor se milein — naak mein khoon, aankhon mein dikkat, ya tej bukhar ke saath sinus pain emergency signs hain jo pehle evaluate hone chahiye.\n\nProtocol baad mein start kar sakte hain. Pehle doctor se milein.";
    await sendWithTyping(platform, senderId, redFlagMsg, 600);
    user.state = "human"; // Hand off
    await logToSheet(senderId, platform, user.sinusType, "red_flag", text, redFlagMsg);
    return;
  }

  // ── POST-PAYMENT STATE ──
  if (user.state === "post_payment") {
    // Continue as daily guidance via SALESOM
    const reply = await callSalesom(senderId, text, platform);
    await sendWithTyping(platform, senderId, reply);
    await logToSheet(senderId, platform, user.sinusType, "post_payment", text, reply);
    return;
  }

  // ── PAYMENT CONFIRMATION DETECTION ──
  const paymentKeywords = ["paid", "payment", "done", "kiya", "bheja", "transferred", "upi", "gpay", "phonepe", "paytm"];
  if (paymentKeywords.some((k) => text.toLowerCase().includes(k)) && user.state === "pitched") {
    user.state     = "post_payment";
    user.enrolledAt = Date.now();
    user.milestonesSent = [];

    const planName = user.selectedPlan === "reset"
      ? "7-Day Sinus Reset"
      : "14-Day Sinus Restoration";
    const planDays = user.selectedPlan === "reset" ? 7 : 14;

    const confirmMsg = {
      hin: `Bahut shukriya! 🙏 Payment confirm ho gayi.\n\nAapka ${planName} aaj se shuru ho raha hai.\n\nSubah ki Dinacharya aaj bhejta hun — please apna time check karein. Roz WhatsApp pe aapke saath rahenge. 🌿\n\nKoi bhi sawaal — yahaan message karein.`,
      eng: `Thank you so much! 🙏 Payment confirmed.\n\nYour ${planName} starts today. I'll send your morning Dinacharya shortly. We'll work together right here on WhatsApp every day. 🌿\n\nAny questions — message here.`,
    };
    await sendWithTyping(platform, senderId, confirmMsg[user.lang] || confirmMsg.hin);
    await logToSheet(senderId, platform, user.sinusType, "payment_confirmed", text, "payment confirmed");
    return;
  }

  // ── ADVANCE CONVERSATION PHASE ──
  advancePhase(user, text);

  // ── EARLY SINUS TYPE DETECTION ──
  if (!user.sinusType) {
    const detected = detectSinusTypeFromText(text);
    if (detected) {
      user.sinusType  = detected;
      user.convPhase  = "mirror";
      if (user.state === "lang_offered") user.state = "asked_symptoms";
    }
  }

  // ── UPDATE STATE BASED ON PROGRESSION ──
  if (user.state === "lang_offered" || user.state === "new") {
    user.state = "asked_symptoms";
  }

  // ── CALL SALESOM AI ──
  let reply;
  try {
    reply = await callSalesom(senderId, text, platform);
  } catch (err) {
    console.error("SALESOM AI error:", err.message);
    reply = user.lang === "eng"
      ? "So sorry, I'm experiencing a brief technical issue. Please send your message again in a moment. 🙏"
      : "Maafi chahta hun — thodi technical dikkat aa gayi. Please ek baar wapas message karein. 🙏";
  }

  await sendWithTyping(platform, senderId, reply);

  // Detect if AI moved to pitch
  if (
    reply.includes("₹1,299") ||
    reply.includes("₹499") ||
    reply.includes("Sinus Restoration") ||
    reply.includes("Sinus Reset") ||
    reply.includes("Link bheju")
  ) {
    user.state = "pitched";
    if (user.convPhase !== "close") user.convPhase = "close";
  }

  await logToSheet(senderId, platform, user.sinusType, user.state, text, reply);
}

// ─── FACEBOOK WEBHOOK ─────────────────────────────────────────
app.get("/webhook", (req, res) => {
  if (
    req.query["hub.mode"]      === "subscribe" &&
    req.query["hub.verify_token"] === VERIFY_TOKEN
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
    if (body.object !== "page") return;

    for (const entry of body.entry || []) {
      for (const event of entry.messaging || []) {
        if (!event.message || event.message.is_echo) continue;
        const msgId = event.message.mid;
        if (processedMessages.has(msgId)) continue;
        processedMessages.add(msgId);

        const senderId = event.sender.id;
        const text     = event.message.text || "";
        await handleMessage(senderId, text, "facebook");
      }
    }
  } catch (e) {
    console.error("FB webhook error:", e.message);
  }
});

// ─── TWILIO WHATSAPP WEBHOOK ──────────────────────────────────
app.post("/twilio-webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    const from = (req.body.From || "").replace("whatsapp:", "");
    const body = req.body.Body || "";
    const msgId = req.body.MessageSid;
    if (!from || !body) return;
    if (processedMessages.has(msgId)) return;
    processedMessages.add(msgId);
    await handleMessage(from, body, "twilio");
  } catch (e) {
    console.error("Twilio webhook error:", e.message);
  }
});

// ─── INSTAGRAM WEBHOOK ───────────────────────────────────────
app.get("/instagram-webhook", (req, res) => {
  if (
    req.query["hub.mode"]         === "subscribe" &&
    req.query["hub.verify_token"] === VERIFY_TOKEN
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

        const senderId = event.sender.id;
        const text     = event.message.text || "";
        await handleMessage(senderId, text, "instagram");
      }
    }
  } catch (e) {
    console.error("Instagram webhook error:", e.message);
  }
});

// ─── BROADCAST ENDPOINT ───────────────────────────────────────
// POST /broadcast { numbers: ["91XXXXXXXXXX"], message: "..." }
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
      await sleep(500); // Rate limit friendly
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
      target: "Kaphaja + Spray users",
      message: "Ji 🙏 December-January Kapha peak season hai — Congestive sinus is time mein sabse zyada flare hoti hai. Abhi se shuru karna zyada effective hai. 14-Day Sinus Restoration (₹1,299) ready hai. Reply karein 'HAAN' — details bhejta hun. — Sachin, Ayusomam Herbals 🌿",
    },
    "pre-summer": {
      season: "Pre-Summer (Apr)",
      target: "Pittaja users",
      message: "Ji 🙏 Garmi aa rahi hai — Heat Pattern sinus (burning, yellow discharge) ke liye yeh critical time hai. Is season mein proactive Shodhana bahut effective hoti hai. 14-Day Sinus Restoration ready hai. Reply karein. 🌿",
    },
    "vasant": {
      season: "Vasant (Feb-Mar)",
      target: "Allergic users",
      message: "Ji 🙏 Vasant season mein allergic sneezing sabse zyada flare hoti hai. Pollen season se pehle protocol start karna sabse effective hai. 14-Day Sinus Restoration (₹1,299) ready hai. Details chahiye? Reply karein. 🌿",
    },
    "monsoon": {
      season: "Monsoon (Jul-Sep)",
      target: "All Kaphaja types",
      message: "Ji 🙏 Monsoon mein humidity aur mold — sinus peak pe hoti hai. 7-Day Sinus Reset (₹499) ya 14-Day Restoration — dono available hain. Reply karein. 🌿",
    },
    "past-customer": {
      season: "Past Customer Re-engagement",
      target: "Completed 14-day program",
      message: "Ji 🙏 Kuch waqt pehle 14-Day Sinus Restoration complete ki thi. Follow up karne ka mann tha — naak kaisi hai ab? Agar seasonal flare wapas aa rahi ho — 7-Day Sinus Reset (₹499) se maintain kar sakte hain. Reply karein. 🌿",
    },
  };

  const t = templates[req.params.season];
  if (!t) return res.status(404).json({ error: "Template not found", available: Object.keys(templates) });
  res.json(t);
});

// ─── STATS / ADMIN ENDPOINT ───────────────────────────────────
app.get("/stats", (req, res) => {
  if (req.query.secret !== VERIFY_TOKEN) return res.status(401).json({ error: "Unauthorized" });

  const all = Object.values(userData);
  const stats = {
    totalUsers: all.length,
    byType: {},
    byState: {},
    byPhase: {},
    enrolled: all.filter((u) => u.enrolledAt).length,
    ghosted: all.filter((u) => u.ghostAttempts > 0).length,
    converted: all.filter((u) => u.state === "post_payment" || u.state === "done").length,
  };

  for (const u of all) {
    const t = u.sinusType || "unknown";
    const s = u.state     || "new";
    const p = u.convPhase || "probe";
    stats.byType[t]  = (stats.byType[t]  || 0) + 1;
    stats.byState[s] = (stats.byState[s] || 0) + 1;
    stats.byPhase[p] = (stats.byPhase[p] || 0) + 1;
  }

  stats.conversionRate = stats.totalUsers
    ? ((stats.converted / stats.totalUsers) * 100).toFixed(1) + "%"
    : "0%";

  res.json(stats);
});

// ─── HEALTH CHECK ─────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    version: "4.0",
    uptime: process.uptime(),
    users: Object.keys(userData).length,
  });
});

// ─── START ────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ SALESOM v4.0 running on port ${PORT}`);
  console.log(`   Sinus types: allergic, congestive, infective, spray, polyp, dns`);
  console.log(`   Ghosting recovery: 24hr + 72hr`);
  console.log(`   Day milestones: Day 5, 7, 10, 13`);
  console.log(`   Plans: 7-Day Sinus Reset ₹499 | 14-Day Sinus Restoration ₹1,299`);
});
