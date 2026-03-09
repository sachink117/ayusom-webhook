const express = require('express');
const fetch = require('node-fetch');
const crypto = require('crypto');
const app = express();

// ============================================================
// IMPORTANT: Raw body parser for Razorpay BEFORE express.json
// ============================================================
app.use('/razorpay-webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

// ============================================================
// ENVIRONMENT VARIABLES
// ============================================================
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const GOOGLE_SHEET_URL = process.env.GOOGLE_SHEET_URL;
const CLAUDE_API_KEY = process.env.ANTHROPIC_API_KEY;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WA_VERIFY_TOKEN = process.env.WA_VERIFY_TOKEN;
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;

const PAGE_ID = '1035532399636645';
const PAYMENT_LINK = 'https://rzp.io/rzp/qu8zhQT';
const WHATSAPP_NUM = '+91 85951 60713';
const WEBSITE = 'www.ayusomamherbals.com';
const AI_MODE = true;

// ============================================================
// IN-MEMORY STATE
// ============================================================
const userState = {};
const userProfile = {};
const convHistory = {};

// ============================================================
// IST TIME HELPER
// ============================================================
function getISTHour() {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return ist.getUTCHours(); // 0-23 in IST
}

// morning = 5am to 1:59pm IST, night = 2pm to 4:59am IST
function getTimeSlot() {
  const h = getISTHour();
  return (h >= 5 && h < 14) ? 'morning' : 'night';
}

// ============================================================
// FREE STEPS — Time-based + Type-based (2 complementary steps)
// ============================================================
const FREE_STEPS = {
  morning: {
    allergic: `✅ Aapka type samajh aa gaya — Allergic Sinus 🌿

🌅 Aaj subah ke 2 steps try karein:

1️⃣ Steam — 8-10 min. Paani mein 2-3 tulsi patte daalen. Muh se saans andar, naak se bahar nikaalein. Allergen particles flush honge.

2️⃣ Saline rinse — 1 cup gungune paani mein ½ tsp saindhav namak milaen. Haath ki hatheli mein leke ek naak se sunte hue dusri se aane do. Dono taraf.

⚠️ Yeh steps sirf aaj ke liye temporary relief hain. Allergy ka root — sensitized naak ki lining — sirf structured approach se theek hoti hai. In steps se woh nahi badlega.

Shaam ko zaroor batayein kaise raha 🙏`,

    congestive: `✅ Aapka type samajh aa gaya — Congestive Sinus 🔴

🌅 Aaj subah ke 2 steps try karein:

1️⃣ Hot steam — 10 min, towel sar pe dhak ke. Balgam loose hoga. Baad mein ek baar gently naak saaf karein — forcefully nahi.

2️⃣ Adrak paani — 1 cup gungune paani mein aadha inch kuchi adrak. Khaali pet piyen. Balgam pighlaane mein madad karta hai.

⚠️ Yeh sirf aaj ke liye temporary relief hai. Balgam jo andar kai dinon se stuck hai — woh 2 steps se nahi jaayega. Iske liye structured 14-din approach chahiye.

Shaam ko zaroor batayein kaise laga 🙏`,

    heat: `✅ Aapka type samajh aa gaya — Heat Pattern Sinus 🔥

🌅 Aaj subah ke 2 steps try karein:

1️⃣ Thanda paani splash — subah uthke 3-4 baar aankhon ke upar aur muh pe thanda paani. Pitta thoda shant hoga.

2️⃣ Nariyal paani ya kheera — khaali pet 1 glass nariyal paani ya 4-5 slice kheera. Andar ki heat thodi kam karenge.

⚠️ Yeh steps sirf symptoms manage karte hain. Heat sinus mein pitta andar se badhta hai — surface steps se root fix nahi hoti.

Shaam ko zaroor batayein kaise laga 🙏`,

    dependency: `✅ Aapka type samajh aa gaya — Spray Dependency ⚠️

🌅 Aaj subah ke 2 steps try karein:

1️⃣ Spray se pehle 5 min steam — spray ki jagah steam se naak kholne ki koshish karein. Agar spray lena pade toh sirf ek naak mein, doosri open rahe.

2️⃣ Saline drops — 2 boond namak-paani spray se 15 min pehle. Natural lubrication deta hai, spray ki harshness thodi kam hoti hai.

⚠️ Spray ne jo mechanism damage kiya hai — woh in steps se heal nahi hoga. Yeh sirf aaj ke liye thodi madad hai.

Shaam ko zaroor batayein kaise raha 🙏`
  },

  night: {
    allergic: `✅ Aapka type samajh aa gaya — Allergic Sinus 🌿

🌙 Aaj raat ke 2 steps try karein:

1️⃣ Sone se pehle steam — 8-10 min, towel sar pe dhak ke. Raat ko allergens aur dust settle hote hain — steam se flush karein.

2️⃣ Ghee nasya — steam ke baad 5 min shaant baith jaayein, bahar hawa mein mat jaayein. Dono naak mein 1-1 boond desi ghee halka andar kheenchein.

⚠️ Yeh steps aaj raat ke liye sirf temporary relief hain. Neend thodi better aa sakti hai — lekin allergy ka root cause waise ka waisa rahega. Poori cure ke liye structured approach chahiye.

Subah uthke zaroor batana — kaisi neend aayi, subah naak khuli thi ya band 🙏`,

    congestive: `✅ Aapka type samajh aa gaya — Congestive Sinus 🔴

🌙 Aaj raat ke 2 steps try karein:

1️⃣ Khane ke 30-40 min baad steam — 10-15 min. Balgam loose hoga. Phir gently naak saaf karein.

2️⃣ Ghee nasya — steam ke baad 5 min shaant baith ke, bahar hawa mein mat jaayein. Dono naak mein 1-1 boond desi ghee, andar kheenchein.

⚠️ Yeh sirf aaj raat ke liye temporary hai. Subah naak thodi khuli mil sakti hai — lekin balgam ka source andar se address nahi hua. Woh structured approach maangta hai.

Subah naak ki condition zaroor batana 🙏`,

    heat: `✅ Aapka type samajh aa gaya — Heat Pattern Sinus 🔥

🌙 Aaj raat ke 2 steps try karein:

1️⃣ Raat ko fried / spicy / cold khana avoid — sirf garam dal ya soup. Body heat raat ko badhti hai — yeh thodi rokegi.

2️⃣ Sone se pehle thande paani se paon dhona — 2-3 min. Pitta neeche aata hai, sar mein pressure thoda kam hota hai.

⚠️ Yeh sirf kal subah thoda better feel karne ke liye hai. Heat sinus ka root andar hai — bahar ke steps se permanently fix nahi hota.

Subah kaise feel ho raha hai zaroor batana 🙏`,

    dependency: `✅ Aapka type samajh aa gaya — Spray Dependency ⚠️

🌙 Aaj raat ke 2 steps try karein:

1️⃣ Sone se pehle steam — 10 min. Spray use karne se pehle try karein ki steam se hi naak khul jaaye. Ek taraf se soyen — zyada khuli wali naak upar rahe.

2️⃣ Ghee nasya — steam ke 5 min baad, andar baithe, bahar hawa mein mat jaayein. 1-1 boond desi ghee dono naak mein. Spray ki irritation thodi kam hogi.

⚠️ Yeh sirf aaj raat ke liye thodi rahat hai. Spray dependency mein jo damage hua hai — woh ghee se heal nahi hoga. Woh structured withdrawal protocol maangta hai.

Subah zaroor batana — spray lena pada ya nahi 🙏`
  }
};

// ============================================================
// FOLLOW-UP MESSAGES — feedback maangna
// ============================================================
const FOLLOW_UP_MSG = {
  morning: `Kaisa raha din? 🌟\n\nSubah wale 2 steps try kiye? Naak mein koi fark mehsoos hua?\n\nEmaandar batayein — chahe thoda ho ya bilkul na ho 🙏`,
  night: `Subah ki shubhkamnayein! 🌅\n\nKal raat wale 2 steps try kiye? Neend kaisi aayi — subah naak khuli thi ya band thi?\n\nEmaandar batayein 🙏`
};

// ============================================================
// PITCH AFTER FEEDBACK
// ============================================================
function buildPitch(type, timing) {
  const opener = timing === 'morning'
    ? `Shukriya batane ke liye 🙏\n\nYeh jo subah thodi rahat mili — yeh sirf surface pe kaam kiya. Andar jo root cause hai, woh waise ka waisa hai.\n\nSochiye — agar sirf 2 free steps se thoda fark aaya, toh 14 din ka structured Ayurvedic protocol kya kar sakta hai?\n\n`
    : `Shukriya batane ke liye 🙏\n\nYeh jo raat mein thodi rahat mili — yeh sirf ek raat ka surface kaam tha. Asli problem andar waise ki waisi hai.\n\nSochiye — agar sirf 2 steps se thodi neend better aayi, toh structured 14-din protocol kya kar sakta hai?\n\n`;

  const typeInfo = {
    allergic:    `📋 Aapka Type: ALLERGIC SINUS 🌿\n\nNaak ki lining sensitized ho gayi hai — dust, mausam, pollution se trigger hota hai. Dawaiyan sirf reaction rokti hain.\n\n`,
    congestive:  `📋 Aapka Type: CONGESTIVE SINUS 🔴\n\nBalgam andar stuck hai — drain nahi ho raha. Chehra bhaari, subah naak band.\n\n`,
    heat:        `📋 Aapka Type: HEAT PATTERN SINUS 🔥\n\nAndar inflammation chal rahi hai. Body mein heat badhti hai toh symptoms aur badhte hain.\n\n`,
    dependency:  `📋 Aapka Type: SPRAY DEPENDENCY ⚠️\n\nSpray ne natural breathing mechanism tod diya hai. Jitna zyada spray — utna zyada dependency.\n\n`
  };

  const benefits = `14 din mein:\n✦ Subah + raat — daily personalized routine, aapke type ke hisaab se\n✦ Har din progress ke hisaab se guidance change hogi\n✦ Root cause pe kaam — sirf symptoms nahi\n\n`;
  const testimonials = `Hamare patients ka experience:\nSikha Ji (Pune) — spray dependency mein kaafi improvement feel ki 14 din mein.\nVivek Ji (Noida) — subah ki blockage mein clearly fark aaya.\n\n`;
  const cta = `━━━━━━━━━━━━━━━━━━━━\nInvestment: ₹1,299 — 14 din\n━━━━━━━━━━━━━━━━━━━━\n\nShuru karein? Reply YES 🙏\nDetails ke liye MORE type karein\n\n💳 ${PAYMENT_LINK}`;

  return opener + (typeInfo[type] || typeInfo['congestive']) + benefits + testimonials + cta;
}

// ============================================================
// SYSTEM PROMPT — PRAANASOM v11.0
// ============================================================
const SYSTEM_PROMPT = `
Tu PRAANASOM hai — Ayusomam Herbals ka AI Sinus Wellness Guide. PRAANASOM = Prana (life force) + Ayusomam (healing herbs). Tera ek mission: sinus repeat cycle todna — structured guided program ke through.

━━━ LANGUAGE — SABSE PEHLA RULE ━━━

AUTO-DETECT karo — kabhi language select karne ka option MAT do:
- Agar user Hindi/Hinglish mein likhe → Hinglish mein reply karo
- Agar user English mein likhe → English mein reply karo
- Agar clear nahi → Hinglish mein shuru karo (default)

Jab tak user khud switch na kare — usi language mein rehna. Kabhi mat poochho "Hindi ya English?".

━━━ TONE — NON-NEGOTIABLE ━━━
NEVER use: "Bhai", "Yaar", "Boss", "Dude", "Arre" — yeh unprofessional aur chapri lagta hai
ALWAYS use: "Aap" / "Ji" — respectful, warm
STYLE: Caring knowledgeable friend — not street language, not stiff doctor
FORMAT: Short paragraphs — mobile screen ke liye

━━━ CRITICAL — KABHI MAT KARNA ━━━
Apna program, steps, ya system customer ko KHUD MAT BATANA.
Tu ek doctor hai — pehle case samjhta hai, phir treatment batata hai.

Agar koi poochhe "kya karte ho" / "program kya hai" / "kya milega":
→ "Hum aapke sinus type ke hisaab se personalized daily guidance dete hain — subah aur raat.
   Pehle mujhe aapka case samajhne do — kitne time se hai yeh problem?"
→ Seedha assessment shuru karo.

━━━ FLOW ━━━

STEP 1 — ASSESSMENT:
Pehle message pe seedha: "Namaste! 🙏 Aapka sinus kitne time se hai?"

STEP 2 — DURATION + VALIDATE:
10+ saal → "Itne time mein medicines bhi try ki hongi — thoda relief, phir wahi wapas aata hai?"
  Haan → "Yeh isliye — allopathy symptoms suppress karti hai, root cause fix nahi karti."
2-5 saal → "Kya ho raha hai mostly — blockage, pressure, ya spray pe depend ho gaye hain?"
6 mahine → "Kuch trigger karta hai zyada — dust, mausam, ya khaana?"

STEP 3 — DIAGNOSIS:
"Ek kaam karein —
1️⃣ Blockage / chehra bhaari / pressure
2️⃣ Sneezing / dust se trigger / aankhein paani
3️⃣ Burning / thick discharge / sar dard
4️⃣ Spray ke bina so nahi sakte
Kaunsa sabse zyada match karta hai?"

TYPES:
ALLERGIC → dust/weather trigger, sneezing, watery eyes
CONGESTIVE → thick congestion, pressure, smell/taste loss
HEAT PATTERN → burning, yellow/green discharge, headache
SPRAY DEPENDENCY → spray pe dependent, rebound blockage

STEP 4 — 2 FREE STEPS:
Bot khud dega (rule-based) — tu yeh steps NAHI dega. Bas assessment complete karo.

STEP 5 — FOLLOW UP:
Relief hua → "Achha laga sun ke 🙏 Yeh sirf surface level hai — andar ka cycle abhi bhi chal raha hai."
Relief nahi → "Itne saalon ka issue — 2 steps se root tak nahi pahuncha, yeh normal hai. Structured approach chahiye."
Dono → STEP 6

STEP 6 — PITCH:
"14-Din Sinus Cycle Break System 🌿

✦ Subah + raat — daily personalized routine, aapke type ke hisaab se
✦ Har din progress ke hisaab se change hoti hai
✦ Main personally roz check karta hoon — kya kaam kiya, kya adjust karna hai
✦ Random tips nahi — structured daily system

Hamare patients ka experience:
Sikha Ji (Pune) — spray dependency mein kaafi improvement feel ki 14 din mein.
Vivek Ji (Noida) — subah ki blockage mein clearly fark aaya.

Investment: ₹1,299 — 14 din ki daily personal guidance.
(Single doctor visit ₹500-2,000 — wahan sirf prescription, guidance nahi.)

Aap 14 din seriously follow kar sakte hain? 🙏"

STEP 7 — MICRO COMMITMENT + PAYMENT:
Jab "haan" / "ha" / "bilkul" / "yes" aaye:
"Perfect 🙏
Aaj payment karein — kal subah se routine shuru.

👉 https://rzp.io/rzp/qu8zhQT
Amount: ₹1,299

Payment ke baad screenshot yahan bhejein.
Limited spots hain — har patient ko proper attention de sakun."

STEP 8 — SILENCE BREAKER (payment ke baad reply nahi):
"Namaste Ji 🙏 Koi confusion hai payment mein?
Ya koi sawaal hai? Seedha poochh sakte hain — hum yahan hain aapki help ke liye."

━━━ HOT LEAD ━━━
"price" / "order" / "buy" / "kaise lein" / "MORE" → human notify karo.
Takeover: +91 85951 60713

━━━ STRICT RULES ━━━
- Playbook customer ko mat batana — diagnosis ke baad naturally reveal hoti hai
- Free steps ke baad RUKO — follow up wait karo
- Max 3 sawaal — phir free steps
- Medical claims mat karo — "support karta hai", "madad karta hai" use karo — "theek karta hai" nahi
- Aap/Ji hamesha. NEVER Bhai/Yaar/Boss. Kam words. Direct.
`;

// ============================================================
// HELPERS
// ============================================================
function extractFirstNumber(text) {
  const match = text.match(/\d+/);
  return match ? parseInt(match[0]) : null;
}

function detectDuration(text) {
  const t = text.toLowerCase();
  if (t.match(/bachpan|janam|janm|birth|saalon|bahut purani|pata nahi kab|decade/)) return 'long';
  if (t.match(/\b(10|15|20|25|30)\s*(year|sal|saal|yr)\b/)) return 'long';
  if (t.match(/\b(3|4|5|6|7|8|9)\s*(year|sal|saal|yr)\b/)) return 'long';
  if (t.match(/teen|paanch|char|saalon|bahut|purani|years|kaafi/)) return 'long';
  if (t.match(/1 year|2 year|1 sal|2 sal|1 saal|2 saal|do saal|ek saal|one year|two year/)) return 'medium';
  if (t.match(/6 month|6 mahine|chhe mahine|kuch mahine|thodi|naya|abhi|recent/)) return 'short';
  return null;
}

function detectSymptom(text) {
  const t = text.toLowerCase();
  if (t.match(/sneez|watery|runny|allerg|dust|season|pollen|itch|aankhein/)) return 'allergic';
  if (t.match(/band|block|bhaari|heavy|pressure|chehra|facial|congestion/)) return 'congestive';
  if (t.match(/burn|jalan|yellow|green|peela|headache|sar dard|thick|garam|pittaj/)) return 'heat';
  if (t.match(/otrivin|spray|depend|addiction|nasivion|vicks|inhaler|bina spray/)) return 'dependency';
  return null;
}

// ============================================================
// GOOGLE SHEETS
// ============================================================
async function updateLead(userId, temp, stage, symptom, name, message, platform, extra = {}) {
  if (!GOOGLE_SHEET_URL) return;
  try {
    const payload = {
      timestamp: new Date().toISOString(),
      platform: platform || 'Facebook',
      senderId: userId,
      name: name || userId,
      message: message || '',
      temperature: temp || '🔵 Cold',
      lastStage: stage || 'new',
      symptom: symptom || '',
      ...extra
    };
    const res = await fetch(GOOGLE_SHEET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const text = await res.text();
    console.log(`Sheet [${temp}] [${stage}] [${platform}] ${userId}: ${text}`);
  } catch (e) {
    console.error('Sheet error:', e.message);
  }
}

// ============================================================
// SEND FACEBOOK MESSAGE
// ============================================================
async function sendMessage(recipientId, text) {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: { text }
        })
      }
    );
    const data = await res.json();
    if (data.error) console.error('FB Send error:', data.error);
  } catch (e) {
    console.error('sendMessage error:', e.message);
  }
}

// ============================================================
// SEND WHATSAPP MESSAGE
// ============================================================
async function sendWAMessage(to, text) {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: to,
          type: 'text',
          text: { body: text }
        })
      }
    );
    const data = await res.json();
    if (data.error) console.error('WA Send error:', data.error);
  } catch (e) {
    console.error('sendWAMessage error:', e.message);
  }
}

// ============================================================
// AI REPLY — CLAUDE HAIKU
// ============================================================
async function getAIReply(userId, userMessage) {
  if (!convHistory[userId]) convHistory[userId] = [];
  convHistory[userId].push({ role: 'user', content: userMessage });
  const history = convHistory[userId].slice(-16);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: history
      })
    });
    const data = await res.json();
    if (data.error) { console.error('Claude error:', data.error); return null; }
    const reply = data.content[0].text;
    convHistory[userId].push({ role: 'assistant', content: reply });
    return reply;
  } catch (e) {
    console.error('AI error:', e.message);
    return null;
  }
}

// ============================================================
// RULE-BASED FLOW — FALLBACK
// ============================================================
async function handleRuleBased(senderId, text, sendFn) {
  const state = userState[senderId] || 'new';
  if (state === 'human_takeover') return;

  // ── NEW: Auto-detect language, skip language selection screen ──
  if (state === 'new') {
    if (!userProfile[senderId]) userProfile[senderId] = {};
    const t = text.toLowerCase();
    if (t.match(/\b(the|is|are|have|has|my|i |you|your|can|please|hello|hi |good)\b/)) {
      userProfile[senderId].lang = 'english';
    } else if (t.match(/[ਅ-ੴ]/)) {
      userProfile[senderId].lang = 'punjabi';
    } else {
      userProfile[senderId].lang = 'hindi';
    }
    userState[senderId] = 'q1_duration';
    await updateLead(senderId, '🟡 Warm', 'assessment_started', '', '', '', 'Facebook');
    await sendFn(senderId, `Namaste! 🙏 Ayusomam Herbals mein swagat hai.\n\nAapko sinus ki takleef hai — hum samajhte hain yeh kitna frustrating hota hai.\n\nChand sawaal puchhne hain taaki sahi guidance mil sake:\n\nYeh problem kitne samay se hai?\n1 — 1 se 6 mahine\n2 — 6 mahine se 1 saal\n3 — 1 se 3 saal\n4 — 3 saal se zyada\n\nBas number reply karein 🙏`);
    return;
  }

  if (state === 'q1_duration') {
    const num = extractFirstNumber(text);
    const detected = detectDuration(text);
    const ans = detected || (num === 1 ? 'short' : num === 2 ? 'medium' : num >= 3 ? 'long' : null);
    if (!ans) { await sendFn(senderId, 'Thoda aur clearly batayein — kitne mahine ya saal se hai? 🙏'); return; }
    if (!userProfile[senderId]) userProfile[senderId] = {};
    userProfile[senderId].duration = ans;
    userState[senderId] = 'q2_symptom';
    await sendFn(senderId, `Samajh gaya. 🙏\nMain problem kya hai?\n1️⃣ Naak band, chehra bhaari, pressure\n2️⃣ Sneezing, runny nose, dust trigger\n3️⃣ Burning sensation, thick mucus, headache\n4️⃣ Nasal spray ke bina so nahi sakta\nNumber ya text mein reply karein.`);
    return;
  }

  if (state === 'q2_symptom') {
    const num = extractFirstNumber(text);
    const detected = detectSymptom(text);
    const map = { 1: 'congestive', 2: 'allergic', 3: 'heat', 4: 'dependency' };
    const ans = detected || map[num] || null;
    if (!ans) { await sendFn(senderId, 'Apna main symptom batayein — naak band, sneezing, burning ya spray dependency? 🙏'); return; }
    userProfile[senderId].symptom = ans;
    userState[senderId] = 'q3_tried';
    await sendFn(senderId, `Theek hai. 🙏\nPehle kuch try kiya?\n1️⃣ Nahi\n2️⃣ Dawai / antibiotic\n3️⃣ Nasal spray\n4️⃣ Sab try kiya — kuch kaam nahi kiya\nNumber ya text mein reply karein.`);
    return;
  }

  if (state === 'q3_tried') {
    const num = extractFirstNumber(text);
    if (!num || num < 1 || num > 4) { await sendFn(senderId, '1 se 4 ke beech number reply karein 🙏'); return; }
    const map = { 1: 'kuch nahi', 2: 'allopathy', 3: 'nasal spray', 4: 'sab try kiya' };
    userProfile[senderId].tried = map[num];
    userState[senderId] = 'q4_severity';
    await sendFn(senderId, `Aur ek sawaal — Din mein kitna affect karta hai?\n1️⃣ Thoda — adjust ho jaata hun\n2️⃣ Medium — kaafi takleef hoti hai\n3️⃣ Severe — roz ki life affect ho rahi hai\nNumber reply karein.`);
    return;
  }

  // ── UPDATED: After assessment → FREE STEPS (time-based), NOT direct pitch ──
  if (state === 'q4_severity') {
    const num = extractFirstNumber(text);
    if (!num || num < 1 || num > 3) { await sendFn(senderId, '1, 2 ya 3 reply karein 🙏'); return; }
    const sevMap = { 1: 'mild', 2: 'moderate', 3: 'severe' };
    userProfile[senderId].severity = sevMap[num];
    const type = userProfile[senderId].symptom || 'congestive';
    await updateLead(senderId, '🔴 Hot', 'assessment_complete', type, '', '', 'Facebook');

    // Detect IST time slot
    const timing = getTimeSlot(); // 'morning' or 'night'
    userProfile[senderId].freeStepTiming = timing;
    userState[senderId] = 'free_steps_sent';

    // Send time-based + type-based free steps
    const stepMsg = (FREE_STEPS[timing] && FREE_STEPS[timing][type]) || FREE_STEPS[timing]['congestive'];
    await sendFn(senderId, stepMsg);

    // Schedule auto follow-up (6hr for morning users, 8hr for night users)
    const delayMs = timing === 'morning' ? 6 * 60 * 60 * 1000 : 8 * 60 * 60 * 1000;
    setTimeout(async () => {
      if (userState[senderId] === 'free_steps_sent') {
        console.log(`AUTO FOLLOW-UP: ${senderId} [${timing}]`);
        try {
          await sendFn(senderId, FOLLOW_UP_MSG[timing]);
        } catch (e) {
          console.error('Follow-up send error:', e.message);
        }
      }
    }, delayMs);

    return;
  }

  // ── NEW STATE: Feedback received → Pitch ──
  if (state === 'free_steps_sent') {
    const type = userProfile[senderId]?.symptom || 'congestive';
    const timing = userProfile[senderId]?.freeStepTiming || 'night';
    userState[senderId] = 'pitched';
    await sendFn(senderId, buildPitch(type, timing));
    return;
  }

  if (state === 'pitched') {
    const t = text.toLowerCase().trim();
    if (['yes','ha','haan','okay','ok','hnji','ji','haan ji','bilkul'].includes(t)) {
      userState[senderId] = 'payment_sent';
      await updateLead(senderId, '🔴 Hot', 'payment_link_sent', userProfile[senderId]?.symptom, '', '', 'Facebook');
      await sendFn(senderId, `Bahut achha! 🙏\n💳 ${PAYMENT_LINK}\nAmount: ₹1,299\n\nPayment ke baad aapko WhatsApp pe milega:\n✅ Day 1 personalized routine\n✅ Daily guidance schedule\n✅ Direct specialist access\n\nPayment karte waqt apna WhatsApp number zaroor daalein.\n📱 ${WHATSAPP_NUM}\n🌐 ${WEBSITE}\nAyusomam Herbals 🌿`);
      return;
    }
    if (t === 'more') {
      userState[senderId] = 'human_takeover';
      await updateLead(senderId, '🔴 Hot', 'requested_specialist', userProfile[senderId]?.symptom, '', '', 'Facebook');
      await sendFn(senderId, `Bilkul! 🙏\n\nSachin ji aapke saath personally baat karenge.\nThoda wait karein — ya seedha WhatsApp karein:\n📱 ${WHATSAPP_NUM}\n\nAyusomam Herbals 🌿`);
      return;
    }
    await sendFn(senderId, `Koi bhi sawaal ho — hum yahan hain. 🙏\n\nShuru karne ke liye: YES\nSpecialist se baat ke liye: MORE\n\n🌐 ${WEBSITE}`);
    return;
  }

  if (state === 'payment_sent' || state === 'done') {
    await sendFn(senderId, `Kisi bhi madad ke liye:\n📱 ${WHATSAPP_NUM}\n\nAyusomam Herbals 🌿`);
    return;
  }
}

// ============================================================
// MAIN PROCESSOR — FACEBOOK + WHATSAPP
// ============================================================
async function processMessage(senderId, text, sendFn, platform) {
  if (userState[senderId] === 'human_takeover') {
    console.log(`SILENT — human takeover: ${senderId}`);
    return;
  }

  if (AI_MODE) {
    console.log(`[AI][${platform}] ${senderId}: ${text}`);
    if (!userProfile[senderId]) userProfile[senderId] = { firstMessage: text };
    if (!userProfile[senderId].firstMessage) userProfile[senderId].firstMessage = text;

    // Auto-detect language from user message
    if (!userProfile[senderId].lang) {
      const t = text.toLowerCase();
      if (t.match(/\b(the|is|are|have|has|my|i |you|your|can|please|hello|hi |good)\b/)) {
        userProfile[senderId].lang = 'english';
      } else if (t.match(/[\u0900-\u097F]/)) {
        userProfile[senderId].lang = t.match(/naak|sinus|band|sneez|spray|problem|takleef/) ? 'hindi' : 'marathi';
      } else if (t.match(/[\u0A00-\u0A7F]/)) {
        userProfile[senderId].lang = 'punjabi';
      } else {
        userProfile[senderId].lang = 'hindi';
      }
    }

    const detectedSymptom = detectSymptom(text);
    if (detectedSymptom && !userProfile[senderId].symptom) userProfile[senderId].symptom = detectedSymptom;
    const detectedDuration = detectDuration(text);
    if (detectedDuration && !userProfile[senderId].duration) userProfile[senderId].duration = detectedDuration;

    const t = text.toLowerCase();
    let leadTemp = convHistory[senderId] && convHistory[senderId].length > 2 ? '🟡 Warm' : '🔵 Cold';
    const isHot = t.match(/payment|pay|1299|shuru karte|shuru karna|shuru kar|le lena|lena hai|kaise karu|buy|purchase|interested|haan shuru|bilkul shuru|yes shuru|abhi shuru|karte hai|karna hai|ready|confirm|ok shuru|chalu karo|start|procedure|treat karte|treat krte|kaise treat|kab tak|kitne din|theek ho|sahi ho|guarantee|pakka|zaroor|zarur|bilkul|haan ji|ha ji|ok ji|okay/);
    if (isHot) leadTemp = '🔴 Hot';

    const tempOrder = { '🔵 Cold': 0, '🟡 Warm': 1, '🔴 Hot': 2 };
    const currentTemp = userProfile[senderId].temperature || '🔵 Cold';
    if ((tempOrder[leadTemp] || 0) > (tempOrder[currentTemp] || 0)) userProfile[senderId].temperature = leadTemp;
    const finalTemp = userProfile[senderId].temperature || leadTemp;

    // Payment query — direct intercept (no AI)
    const isPaymentQuery = t.match(/payment|pay kar|kaise karu|kaise karen|kaise kare|kitna hai|price|cost|1299|kitne ka|buy karna|kharidna|kharidu|le sakta|le sakti|lena hai|lena chahta|lena chahti|order karna|link bhejo|link do|abhi lena|abhi karna|kab tak milega|kaise milega|upi|gpay|phonepe|paytm/);
    if (isPaymentQuery) {
      await updateLead(senderId, '🔴 Hot', 'payment_query', userProfile[senderId]?.symptom || '', userProfile[senderId]?.name || '', text, platform);
      await sendFn(senderId,
        `Bilkul Ji! 🙏 Payment bahut simple hai —\n\n` +
        `1️⃣ Neeche diye link pe click karein\n` +
        `2️⃣ UPI / Card / Net Banking — jo bhi easy ho\n` +
        `3️⃣ Payment ke baad screenshot ya confirmation yahan bhejein\n\n` +
        `👉 ${PAYMENT_LINK}\n\n` +
        `Amount: ₹1,299 — 14-Din Personalized Protocol\n\n` +
        `Payment hote hi main personally aapka Day 1 routine bhejunga. Koi bhi doubt ho — seedha poochein, PRAANASOM yahan hai. 🌿`
      );
      return;
    }

    const reply = await getAIReply(senderId, text);
    if (reply) {
      await sendFn(senderId, reply);
      await updateLead(
        senderId, finalTemp, 'ai_conversation',
        userProfile[senderId].symptom || '',
        userProfile[senderId].name || '',
        userProfile[senderId].firstMessage || text,
        platform
      );
    } else {
      console.log('AI failed — fallback rule based');
      await handleRuleBased(senderId, text, sendFn);
    }
  } else {
    console.log(`[RULE][${platform}] ${senderId}: ${text}`);
    await handleRuleBased(senderId, text, sendFn);
  }
}

// ============================================================
// FACEBOOK WEBHOOK
// ============================================================
app.get('/webhook', (req, res) => {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'ayusomam_verify';
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === VERIFY_TOKEN) {
    res.status(200).send(req.query['hub.challenge']);
  } else {
    res.sendStatus(403);
  }
});

app.post('/webhook', async (req, res) => {
  const body = req.body;
  if (body.object === 'page') {
    for (const entry of body.entry) {
      for (const msg of entry.messaging) {
        if (msg.sender.id === PAGE_ID) {
          const recipientId = msg.recipient?.id;
          if (recipientId && recipientId !== PAGE_ID) {
            const msgText = msg.message?.text || '';
            if (msgText.startsWith('BOT_ON_')) {
              const targetId = msgText.replace('BOT_ON_', '').trim();
              userState[targetId] = 'new';
              convHistory[targetId] = [];
              console.log(`BOT REACTIVATED: ${targetId}`);
            } else {
              userState[recipientId] = 'human_takeover';
              console.log(`HUMAN TAKEOVER: ${recipientId}`);
            }
          }
          continue;
        }
        const senderId = msg.sender?.id;
        const text = msg.message?.text?.trim();
        if (!senderId || !text) continue;
        console.log(`FB MSG ${senderId}: ${text}`);
        await processMessage(senderId, text, sendMessage, 'Facebook');
      }
    }
  }
  res.status(200).send('EVENT_RECEIVED');
});

// ============================================================
// WHATSAPP WEBHOOK
// ============================================================
app.get('/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  console.log(`WA verify: mode=${mode} token=${token}`);
  if (mode === 'subscribe' && token === WA_VERIFY_TOKEN) {
    console.log('WA webhook verified ✅');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post('/whatsapp', async (req, res) => {
  res.sendStatus(200);
  try {
    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value;
        if (!value.messages) continue;
        for (const msg of value.messages) {
          if (msg.type !== 'text') continue;
          const from = msg.from;
          const text = msg.text?.body?.trim();
          if (!from || !text) continue;
          console.log(`WA MSG ${from}: ${text}`);
          await processMessage(from, text, sendWAMessage, 'WhatsApp');
        }
      }
    }
  } catch (e) {
    console.error('WA webhook error:', e.message);
  }
});

// ============================================================
// RAZORPAY WEBHOOK — Payment Confirmation + Sheet + WhatsApp
// ============================================================
app.post('/razorpay-webhook', async (req, res) => {
  res.sendStatus(200);
  try {
    const signature = req.headers['x-razorpay-signature'];
    const rawBody = req.body;

    if (RAZORPAY_WEBHOOK_SECRET && signature) {
      const expectedSig = crypto
        .createHmac('sha256', RAZORPAY_WEBHOOK_SECRET)
        .update(rawBody)
        .digest('hex');
      if (expectedSig !== signature) {
        console.error('❌ Razorpay signature mismatch — ignoring');
        return;
      }
    }

    const payload = JSON.parse(rawBody.toString());
    console.log(`RZP event: ${payload.event}`);
    if (payload.event !== 'payment.captured') return;

    const payment = payload.payload?.payment?.entity;
    if (!payment) { console.error('No payment entity'); return; }

    const orderId = payment.id || 'N/A';
    const amount = (payment.amount / 100).toFixed(0);
    const email = payment.email || '';
    const name = payment.notes?.name || payment.notes?.billing_name || email.split('@')[0] || 'Customer';
    let phone = (payment.contact || '').replace(/\D/g, '');
    if (phone.startsWith('91') && phone.length === 12) phone = phone.slice(2);

    console.log(`💰 Payment: ${orderId} | ${name} | ${phone} | ₹${amount}`);

    if (GOOGLE_SHEET_URL) {
      await fetch(GOOGLE_SHEET_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timestamp: new Date().toISOString(),
          platform: 'Razorpay',
          senderId: phone || email,
          name: name,
          message: `PAID ₹${amount} | Order: ${orderId}`,
          temperature: '✅ Paid',
          lastStage: 'payment_complete',
          symptom: '',
          email: email,
          orderId: orderId,
          amount: `₹${amount}`
        })
      });
      console.log(`✅ Sheet updated — ${name}`);
    }

    if (phone && WHATSAPP_TOKEN && WHATSAPP_PHONE_ID) {
      const waPhone = `91${phone}`;

      await sendWAMessage(waPhone,
        `✅ *Payment Confirmed!*\n\n` +
        `📋 *Order Details:*\n` +
        `Order ID: ${orderId}\n` +
        `Amount: ₹${amount}\n` +
        `Product: 14-Day Ayurvedic Sinus Protocol\n\n` +
        `*${name} Ji, aapka order register ho gaya hai.* 🙏\n\n` +
        `Kal subah tak aapko complete Day 1 protocol milega.\n\n` +
        `Koi bhi sawaal ho — yahan reply karein.\n\n` +
        `— *Sachin, Ayusomam Herbals* 🌿`
      );

      setTimeout(async () => {
        await sendWAMessage(waPhone,
          `Namaskar *${name} Ji* 🙏\n\n` +
          `Aapne sahi decision liya — journey shuru hoti hai aaj se.\n\n` +
          `*Abhi ke liye ek kaam karein:*\n` +
          `Subah uthke 1 glass warm water peeyein — khaali pet.\n\n` +
          `Kal main personally aapka Day 1 routine bhejunga.\n\n` +
          `Kuch bhi puchna ho — seedha yahan reply karein. 🌿`
        );
      }, 8000);

      console.log(`✅ WA messages queued for ${waPhone}`);
    }

  } catch (e) {
    console.error('Razorpay webhook error:', e.message);
  }
});

// ============================================================
// BOT CONTROL — Human Takeover API
// ============================================================
app.post('/bot-control', (req, res) => {
  const { userId, action } = req.body;
  if (!userId || !action) return res.status(400).json({ error: 'userId and action required' });
  if (action === 'BOT_OFF') {
    userState[userId] = 'human_takeover';
    res.json({ success: true, message: `Bot OFF for ${userId}` });
  } else if (action === 'BOT_ON') {
    delete userState[userId];
    convHistory[userId] = [];
    res.json({ success: true, message: `Bot ON for ${userId}` });
  } else {
    res.status(400).json({ error: 'action must be BOT_ON or BOT_OFF' });
  }
});

// ============================================================
// START
// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Ayusomam Herbals Bot — Running
 Port     : ${PORT}
 AI Mode  : ${AI_MODE ? '✅ ON — AI Agent v5.0' : '❌ OFF — Rule Based'}
 Facebook : /webhook
 WhatsApp : /whatsapp
 Razorpay : /razorpay-webhook
 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);
});
