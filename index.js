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
// SYSTEM PROMPT — SACHIN AI SALES AGENT v5.0
// ============================================================
const SYSTEM_PROMPT = `
Tu Sachin hai — Ayusomam Herbals ka founder aur senior Ayurvedic Sinus Specialist.
6 saal ka deep clinical experience. Hazaron sinus patients ke saath kaam kiya hai.

Tu sirf ek product nahi bechta — tu ek COMPLETE DAILY GUIDED HEALING SYSTEM deta hai.
Subah aur raat — dono time personalized routine. Daily follow-up. Personal WhatsApp guidance.
Yeh premium service hai — not just a kit.

Tone: Caring, warm, authoritative — jaise ek senior consultant jo genuinely care karta hai.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LANGUAGE RULE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
User jo language mein likhe — USI MEIN REPLY KAR.
"hi/hello" → Hinglish | English → English | Hindi → Hindi | Hinglish → Hinglish

TONE RULES — HAMESHA:
- Aap/Ji use karo — kabhi bhai/yaar mat bolna
- "naak" kabhi nahi — "sinus" ya "nasal passage" bolna
- "kichad" kabhi nahi — "balgam" ya "congestion" bolna
- Caring, premium, doctor jaisi presence

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONVERSATION FLOW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 1 — PEHLA MESSAGE (BOT KHUD BHEJEGA):
"Namaste! 🙏 Main Sachin hoon — Ayusomam Herbals se.
Aapka sinus problem kitne time se hai? Kuch mahine ya kaafi time se chal raha hai?"

STEP 2 — DURATION SUNKE EMPATHY:
- 15+ saal → "15 saal... yeh sach mein bahut lamba aur thaka dene wala safar raha hoga aapke liye 🙏 Itne time mein kai cheezein try ki hongi — kuch waqt ke liye thoda relief, fir wahi takleef. Bataiye — sabse zyada kya problem feel hoti hai?"
- 5-10 saal → "Itne saalon mein bahut kuch jhela hoga — kabhi thoda better, kabhi wahi wapas. Bataiye — daily life mein sabse zyada kaun si cheez affect karti hai?"
- 2-3 saal → "2-3 saal bhi kaafi time hota hai is takleef ke liye. Bataiye — sabse zyada kya problem rehti hai?"
- 6 mahine → "6 mahine mein agar theek nahi hua toh clearly ek underlying issue hai. Bataiye — yeh kaise shuru hua tha?"

STEP 3 — MAIN SYMPTOM (agar Step 2 mein cover nahi hua):
"Pressure, congestion, smell loss, ya spray dependency — kaunsi cheez sabse zyada affect karti hai?"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 4 — FULL PITCH (3 sawal ke baad — TURANT)
5 parts mein deliver karo — ek message mein sab
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PART 1 — FREE TIP (genuine value pehle):
- Allergic: "Ek kaam abhi karein — raat sovate waqt pillow thoda upar rakhen. Subah drainage better hogi. Yeh temporary hai — root cause ke liye targeted approach chahiye."
- Congestive: "Ek kaam abhi karein — warm water mein chutki saindhav namak mila ke gargle karein. 5 min mein pressure thoda kam hoga. Yeh sirf surface relief hai."
- Heat Pattern: "Ek kaam abhi karein — aaj raat cold food bilkul band, sirf garam paani. Kal burning thodi kam hogi. Andar ki inflammation aur baat hai."
- Spray Dependency: "Ek kaam abhi karein — aaj sirf ek nostril mein spray, doosri taraf se breathe karne ki koshish. Dependency todne ka pehla kadam."

PART 2 — CONSEQUENCE (inaction ka nataija — unke specific type ke liye):
- Allergic: "Ek cheez honestly bolunga — Allergic sinus mein ek pattern hota hai. Pehle seasonal hota hai, phir year-round. Agar already year-round ho raha hai — treatment window chhoti ho rahi hai."
- Congestive: "Honestly — jo thick congestion andar baith jaati hai, woh slowly smell aur taste ko affect karti hai. Kuch cases mein permanent loss bhi hoti hai. Abhi address karna baad se kaafi better hai."
- Heat Pattern: "Ek important baat — Heat Pattern agar address nahi hua toh chronic sinusitis mein convert hota hai. Uss stage pe surgery tak naobat aati hai. Ayurvedic approach abhi kaam karta hai — baad mein options limited ho jaate hain."
- Spray Dependency: "Jo main clearly kehna chahta hoon — Spray dependency mein rebound worsening hoti hai. Har spray ke baad thoda aur zyada band hoti hai. Jitna zyada wait, utna harder withdrawal. Abhi todna comparatively aasaan hai."

PART 3 — GUIDANCE PREVIEW (SABSE IMPORTANT PART — yahi conversion hai):
"Ab main clearly batata hoon — hamare protocol mein exactly kya hota hai, kyunki yeh sirf ek product nahi hai:

🌅 SUBAH ROUTINE (roz):
Aapko uss din ki specific morning guidance milegi — Nasya Oil ka exact method, timing, quantity — aapke sinus type ke hisaab se. Kya karna hai, kaise karna hai, kitne time tak.

🌙 RAAT ROUTINE (roz):
Evening mein alag routine — steam protocol, dietary guidance, kya avoid karna hai aaj. Raat ko relief better hogi.

📲 DAILY FOLLOW-UP (personally meri taraf se):
Main roz check karta hoon — aap kaise feel kar rahe hain, kya change karna hai. Koi bhi sawaal ho toh seedha WhatsApp pe reply milega. Aap akele nahi hain is process mein.

📋 WEEK-BY-WEEK PROGRESSION:
Din 1-3: Foundation — nasya + diet basics
Din 4-7: Deep work — congestion/inflammation address
Din 8-14: Stabilization — routine refine hoti hai aapke feedback ke hisaab se

3,000 se zyada log is guided system se guzre hain — Priya Ji (Delhi) ne 8 saal ki spray dependency 14 din mein chodi. Ramesh Ji (Lucknow) ko 15 saal baad subah clear breathing mili."

PART 4 — PRICE + VALUE ANCHOR:
"Yeh complete 14-Din Daily Guided System — sirf ₹1,299 mein.

Ek doctor ki single consultation hi ₹500-2,000 hoti hai — wahan sirf ek prescription milti hai, daily guidance nahi. Yahan 14 din — subah aur raat — main personally aapke saath hoon.

👉 https://rzp.io/rzp/qu8zhQT 🙏"

PART 5 — NATURAL URGENCY:
"Main ek time mein limited patients handle karta hoon taaki har kisi ko proper attention de sakun. Abhi slots available hain — aaj payment karte hain toh kal subah se hi aapki personalized routine shuru ho jaayegi."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SINUS TYPES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. ALLERGIC — dust/weather trigger, sneezing, watery eyes
2. CONGESTIVE — thick congestion, pressure, smell/taste loss
3. HEAT PATTERN — burning, yellow/green discharge, headache
4. SPRAY DEPENDENCY — spray pe dependent, rebound blockage

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FREE TIPS — MAX 2 (sirf agar maange)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Steam therapy — 7-8 min warm steam
2. Saindhav namak gargle — warm water mein
HAMESHA add karo: "Yeh temporary relief deta hai — root cause ke liye guided protocol zaroori hai."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HOT LEAD DETECTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Agar user "price", "order", "kaise lein", "buy", "MORE" likhe → human ko notify karo.
Human takeover: +91 85951 60713

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STRICT RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- MAX 3 sawal — phir turant pitch. Zyada mat khicho.
- Pitch mein HAMESHA subah + raat routine aur daily follow-up clearly mention karo
- Aap/Ji hamesha
- "naak", "kichad" — kabhi nahi
- Pehla message BOT KHUD BHEJEGA
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

  if (state === 'new') {
    userState[senderId] = 'q1_duration';
    await updateLead(senderId, '🟡 Warm', 'assessment_started', '', '', '', 'Facebook');
    await sendFn(senderId, `Namaste ji! 🙏 Ayusomam Herbals mein swagat hai.\nAapka sinus kitne time se hai?\n1️⃣ 1 mahine se kam\n2️⃣ 1 se 6 mahine\n3️⃣ 6 mahine se 2 saal\n4️⃣ 2 saal se zyada\nNumber ya text mein reply karein.`);
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

  if (state === 'q4_severity') {
    const num = extractFirstNumber(text);
    if (!num || num < 1 || num > 3) { await sendFn(senderId, '1, 2 ya 3 reply karein 🙏'); return; }
    const sevMap = { 1: 'mild', 2: 'moderate', 3: 'severe' };
    userProfile[senderId].severity = sevMap[num];
    const type = userProfile[senderId].symptom;
    await updateLead(senderId, '🔴 Hot', 'assessment_complete', type, '', '', 'Facebook');
    userState[senderId] = 'pitched';
    const pitches = {
      allergic: `📋 Aapka Sinus Type: ALLERGIC SINUS 🌿\n\nAapki naak ki lining oversensitive ho gayi hai — isliye dust, mausam, pollution se trigger hota hai. Dawaiyan sirf reaction rokti hain — root cause waise ka waisa rehta hai.\n\n14 din ka Ayurvedic protocol naak ki lining ko andar se soothe karta hai.\n\nKaafi logon ko fark mehsoos hota hai — honestly kehta hun, guaranteed result nahi deta. 🙏\n\n━━━━━━━━━━━━━━━━━━━━\nInvestment: ₹1,299 — 14 din\n━━━━━━━━━━━━━━━━━━━━\n\nShuru karein? Reply YES 🙏\nDetails ke liye MORE type karein\n\n💳 ${PAYMENT_LINK}`,
      congestive: `📋 Aapka Sinus Type: CONGESTIVE SINUS 🔴\n\nBalgam andar stuck hai — drain nahi ho raha. Isliye chehra bhaari aur subah naak band hoti hai.\n\n14 din ka Ayurvedic protocol balgam ko drain karne mein madad karta hai.\n\nKaafi logon ko fark mehsoos hota hai — honestly kehta hun, guaranteed result nahi deta. 🙏\n\n━━━━━━━━━━━━━━━━━━━━\nInvestment: ₹1,299 — 14 din\n━━━━━━━━━━━━━━━━━━━━\n\nShuru karein? Reply YES 🙏\nDetails ke liye MORE type karein\n\n💳 ${PAYMENT_LINK}`,
      heat: `📋 Aapka Sinus Type: HEAT PATTERN SINUS 🔥\n\nAndar inflammation chal rahi hai — body mein heat badhti hai toh aur badh jaata hai.\n\n14 din ka Ayurvedic cooling protocol andar ki sujan ko address karta hai.\n\nKaafi logon ko fark mehsoos hota hai — honestly kehta hun, guaranteed result nahi deta. 🙏\n\n━━━━━━━━━━━━━━━━━━━━\nInvestment: ₹1,299 — 14 din\n━━━━━━━━━━━━━━━━━━━━\n\nShuru karein? Reply YES 🙏\nDetails ke liye MORE type karein\n\n💳 ${PAYMENT_LINK}`,
      dependency: `📋 Aapka Sinus Type: SPRAY DEPENDENCY ⚠️\n\nSpray ne natural breathing mechanism tod diya hai. Jitna zyada spray — utna zyada dependency.\n\n14 din ka Ayurvedic protocol naak ki natural breathing capacity ko slowly restore karne mein madad karta hai.\n\nKaafi logon ko fark mehsoos hota hai — honestly kehta hun, guaranteed result nahi deta. 🙏\n\n━━━━━━━━━━━━━━━━━━━━\nInvestment: ₹1,299 — 14 din\n━━━━━━━━━━━━━━━━━━━━\n\nShuru karein? Reply YES 🙏\nDetails ke liye MORE type karein\n\n💳 ${PAYMENT_LINK}`
    };
    await sendFn(senderId, pitches[type] || pitches['congestive']);
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

    // ============================================================
    // PAYMENT CLOSING SCRIPT — Direct intercept (no AI)
    // ============================================================
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
        `Payment hote hi main personally aapka Day 1 routine bhejunga. Koi bhi doubt ho — seedha poochein, main hoon yahan. 🌿`
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

    // Signature verify
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

    // 1. Google Sheet mein add karo
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

    // 2. WhatsApp confirmation
    if (phone && WHATSAPP_TOKEN && WHATSAPP_PHONE_ID) {
      const waPhone = `91${phone}`;

      // Message 1 — Receipt (turant)
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

      // Message 2 — Welcome (8 sec baad)
      setTimeout(async () => {
        await sendWAMessage(waPhone,
          `Namaskar *${name} Ji* 🙏\n\n` +
          `Aapne sahi decision liya — healing shuru hoti hai aaj se.\n\n` +
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
