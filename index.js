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
// ✅ Commitment first, UPI second (no pushy payment drops)
// ✅ Diet always last in program description
// ✅ No dashes — full stops and line breaks only
// ✅ All 6 sinus types with wellness naming for reveals
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
const TWILIO_WA_NUMBER   = process.env.TWILIO_WHATSAPP_NUMBER;
const INSTAGRAM_TOKEN    = process.env.INSTAGRAM_ACCESS_TOKEN;
const SHEET_URL          = process.env.GOOGLE_SHEET_URL || "";
const PORT               = process.env.PORT || 3000;

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

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
    if (chunks.length > 1) await sleep(700);
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
        userId, platform,
        sinusType: sinusType || user.sinusType || "unknown",
        state:     state     || user.state     || "new",
        phase:     user.convPhase || "probe",
        userMsg:   (msg      || "").substring(0, 300),
        botReply:  (botReply || "").substring(0, 300),
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
    hin: "LANGUAGE: Respond in Hinglish (Hindi and English mix). Aap always. NEVER Bhai, Yaar, Boss, Didi.",
    eng: "LANGUAGE: Respond in English. Professional warm tone. No slang.",
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
1. NO dashes of any kind. No em dash. No hyphen used as a pause. Use a full stop or line break instead.
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
NEVER send UPI details without getting a yes first.

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
          await logToSheet(userId, user.platform, user.sinusType, "ghost_1", "", msg);
        }
      } else if (hoursSince >= 72 && hoursSince < 73 && (user.ghostAttempts || 0) === 1) {
        const msg = getGhostMessage(user, 2);
        if (msg) {
          await sendMessage(user.platform, userId, msg);
          user.ghostAttempts  = 2;
          user.lastMessageAt  = now;
          await logToSheet(userId, user.platform, user.sinusType, "ghost_2", "", msg);
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

  // Detect language if not set
  if (!user.lang) user.lang = detectLang(text);

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

  // ── WELCOME / LANGUAGE SELECTION ─────────────────────────
  if (user.state === "new") {
    user.state = "lang_offered";
    const welcomeMsg =
      "Namaste! Ayusomam Herbals mein swagat hai 🙏\nHum sinus ki takleef mein specialized Ayurvedic guidance dete hain.\n\nAap kis bhasha mein comfortable hain?\n1. Hindi / Hinglish\n2. English\n3. Marathi\n4. Punjabi\n5. Telugu / Tamil / Kannada\n\nBas number reply karein.";
    await sendWithTyping(platform, senderId, welcomeMsg, 800);
    return;
  }

  if (user.state === "lang_offered" && /^[1-5]$/.test(text.trim())) {
    const langMap = { "1": "hin", "2": "eng", "3": "mar", "4": "pun", "5": "tel" };
    user.lang  = langMap[text] || "hin";
    user.state = "asked_duration";
    await sendWithTyping(platform, senderId, buildDurationMenu(user.lang));
    user.durationMenuSent = true;
    return;
  }

  // If still in lang_offered but typed something else, detect and move on
  if (user.state === "lang_offered") {
    user.lang  = detectLang(text) || "hin";
    user.state = "asked_duration";
    await sendWithTyping(platform, senderId, buildDurationMenu(user.lang));
    user.durationMenuSent = true;
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
      const planPrice = PRICES[user.selectedPlan || "restoration"].price;
      const paymentMsg = user.lang === "eng"
        ? `Payment details:\nUPI: [YOUR_UPI_ID]\nAmount: Rs. ${planPrice}\n\nSend the payment screenshot here. Your program starts the same day.`
        : `Payment details:\nUPI: [YOUR_UPI_ID]\nAmount: Rs. ${planPrice}\n\nPayment ka screenshot yahaan bhej dein. Program usi din shuru hoga.`;
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
    console.error("FB webhook error:", e.message);
  }
});

// ─── TWILIO WHATSAPP WEBHOOK ──────────────────────────────────
app.post("/twilio-webhook", async (req, res) => {
  res.sendStatus(200);
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
app.listen(PORT, () => {
  console.log(`SALESOM v5.0 running on port ${PORT}`);
  console.log(`  Sinus types: Reactive Sensitivity, Chronic Congestion, Deep Inflammation, Spray Dependency, Drainage Blockage, Structural Congestion`);
  console.log(`  Structured flow: Duration menu > Symptom multi-select > Insights > Type reveal > Hope pitch > Commitment > Payment`);
  console.log(`  Ghosting recovery: 24hr and 72hr`);
  console.log(`  Day milestones: Day 5, 7, 10, 13`);
  console.log(`  Plans: 7-Day Sinus Reset Rs. 499 | 14-Day Sinus Restoration Rs. 1299`);
});
