const express = require('express');
const fetch = require('node-fetch');
const crypto = require('crypto');
const app = express();

app.use('/razorpay-webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

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

const userState = {};
const userProfile = {};
const convHistory = {};

function getISTHour() {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return ist.getUTCHours();
}
function getTimeSlot() {
  const h = getISTHour();
  return (h >= 5 && h < 14) ? 'morning' : 'night';
}

const FREE_STEPS = {
  morning: {
    allergic: `✅ Aapka type samajh aa gaya — Allergic Sinus 🌿\n🌅 Aaj subah ke 2 steps try karein:\n1️⃣ Steam — 8-10 min. Paani mein 2-3 tulsi patte daalen.\n2️⃣ Saline rinse — 1 cup gungune paani mein ½ tsp saindhav namak.\n⚠️ Yeh sirf temporary relief hai. Root cause ke liye structured approach chahiye.\nShaam ko zaroor batayein kaise raha 🙏`,
    congestive: `✅ Aapka type samajh aa gaya — Congestive Sinus 🔴\n🌅 Aaj subah ke 2 steps try karein:\n1️⃣ Hot steam — 10 min, towel sar pe dhak ke.\n2️⃣ Adrak paani — 1 cup gungune paani mein aadha inch kuchi adrak.\n⚠️ Yeh sirf temporary relief hai. Structured 14-din approach chahiye.\nShaam ko zaroor batayein kaise laga 🙏`,
    heat: `✅ Aapka type samajh aa gaya — Heat Pattern Sinus 🔥\n🌅 Aaj subah ke 2 steps try karein:\n1️⃣ Thanda paani splash — 3-4 baar aankhon ke upar.\n2️⃣ Nariyal paani ya kheera — khaali pet.\n⚠️ Yeh sirf surface level hai. Root cause ke liye structured approach chahiye.\nShaam ko zaroor batayein kaise laga 🙏`,
    dependency: `✅ Aapka type samajh aa gaya — Spray Dependency ⚠️\n🌅 Aaj subah ke 2 steps try karein:\n1️⃣ Spray se pehle 5 min steam karne ki koshish karein.\n2️⃣ Saline drops — 2 boond spray se 15 min pehle.\n⚠️ Spray dependency ke liye structured withdrawal protocol chahiye.\nShaam ko zaroor batayein kaise raha 🙏`
  },
  night: {
    allergic: `✅ Aapka type samajh aa gaya — Allergic Sinus 🌿\n🌙 Aaj raat ke 2 steps try karein:\n1️⃣ Sone se pehle steam — 8-10 min, towel sar pe dhak ke.\n2️⃣ Ghee nasya — 1-1 boond desi ghee dono naak mein.\n⚠️ Yeh sirf aaj raat ke liye hai. Root cause waise ka waisa rahega.\nSubah zaroor batana 🙏`,
    congestive: `✅ Aapka type samajh aa gaya — Congestive Sinus 🔴\n🌙 Aaj raat ke 2 steps try karein:\n1️⃣ Khane ke 30-40 min baad steam — 10-15 min.\n2️⃣ Ghee nasya — 1-1 boond desi ghee dono naak mein.\n⚠️ Yeh sirf temporary hai. Structured approach maangta hai.\nSubah naak ki condition zaroor batana 🙏`,
    heat: `✅ Aapka type samajh aa gaya — Heat Pattern Sinus 🔥\n🌙 Aaj raat ke 2 steps try karein:\n1️⃣ Raat ko fried/spicy/cold khana avoid karein.\n2️⃣ Sone se pehle thande paani se paon dhona — 2-3 min.\n⚠️ Yeh sirf surface level hai. Root andar hai.\nSubah kaise feel ho raha hai zaroor batana 🙏`,
    dependency: `✅ Aapka type samajh aa gaya — Spray Dependency ⚠️\n🌙 Aaj raat ke 2 steps try karein:\n1️⃣ Sone se pehle steam — spray ki jagah try karein.\n2️⃣ Ghee nasya — 1-1 boond desi ghee dono naak mein.\n⚠️ Structured withdrawal protocol maangta hai.\nSubah zaroor batana 🙏`
  }
};

const FOLLOW_UP_MSG = {
  morning: `Kaisa raha din? 🌟\n\nSubah wale 2 steps try kiye? Naak mein koi fark mehsoos hua?\n\nEmaandar batayein — chahe thoda ho ya bilkul na ho 🙏`,
  night: `Subah ki shubhkamnayein! 🌅\n\nKal raat wale 2 steps try kiye? Neend kaisi aayi — subah naak khuli thi ya band thi?\n\nEmaandar batayein 🙏`
};

function buildPitch(type, timing) {
  const opener = timing === 'morning'
    ? `Shukriya batane ke liye 🙏\n\nYeh jo subah thodi rahat mili — yeh sirf surface pe kaam kiya. Andar jo root cause hai, woh waise ka waisa hai.\n\nSochiye — agar sirf 2 free steps se thoda fark aaya, toh 14 din ka structured Ayurvedic protocol kya kar sakta hai?\n\n`
    : `Shukriya batane ke liye 🙏\n\nYeh jo raat mein thodi rahat mili — yeh sirf ek raat ka surface kaam tha.\n\nSochiye — agar sirf 2 steps se thodi neend better aayi, toh structured 14-din protocol kya kar sakta hai?\n\n`;
  const typeInfo = {
    allergic: `📋 Aapka Type: ALLERGIC SINUS 🌿\nNaak ki lining sensitized ho gayi hai — dust, mausam se trigger.\n\n`,
    congestive: `📋 Aapka Type: CONGESTIVE SINUS 🔴\nBalgam andar stuck hai — drain nahi ho raha.\n\n`,
    heat: `📋 Aapka Type: HEAT PATTERN SINUS 🔥\nAndar inflammation chal rahi hai.\n\n`,
    dependency: `📋 Aapka Type: SPRAY DEPENDENCY ⚠️\nSpray ne natural breathing mechanism tod diya hai.\n\n`
  };
  const benefits = `14 din mein:\n✦ Subah + raat — daily personalized routine\n✦ Har din progress ke hisaab se guidance change\n✦ Root cause pe kaam — sirf symptoms nahi\n\n`;
  const testimonials = `Hamare patients:\nSikha Ji (Pune) — spray dependency mein kaafi improvement 14 din mein.\nVivek Ji (Noida) — subah ki blockage mein clearly fark aaya.\n\n`;
  const cta = `━━━━━━━━━━━━━━━━━━━━\nInvestment: ₹1,299 — 14 din\n━━━━━━━━━━━━━━━━━━━━\n\nShuru karein? Reply YES 🙏\nDetails ke liye MORE type karein\n\n💳 ${PAYMENT_LINK}`;
  return opener + (typeInfo[type] || typeInfo['congestive']) + benefits + testimonials + cta;
}

const SYSTEM_PROMPT = `
Tu PRAANASOM hai — Ayusomam Herbals ka AI Sinus Wellness Guide.
Tera ek mission: sinus repeat cycle todna — structured guided program ke through.

━━━ LANGUAGE ━━━
AUTO-DETECT — kabhi poochho mat:
Hindi/Hinglish → Hinglish reply
English → English reply
Default → Hinglish

━━━ TONE ━━━
NEVER: Bhai, Yaar, Boss, Dude
ALWAYS: Aap / Ji
Short paragraphs — mobile ke liye

━━━ CRITICAL ━━━
Program khud mat batao — pehle case samjho.
Agar "kya karte ho" poochhe:
→ "Hum aapke sinus type ke hisaab se personalized daily guidance dete hain.
   Pehle mujhe aapka case samajhne do — kitne time se hai?"

━━━ FLOW ━━━
STEP 1: "Namaste! 🙏 Aapka sinus kitne time se hai?"
STEP 2: Duration validate karo
STEP 3: "1️⃣ Blockage/pressure 2️⃣ Sneezing/dust 3️⃣ Burning/headache 4️⃣ Spray dependency"
STEP 4: Free steps bot dega — tu mat de
STEP 5: Follow up ke baad pitch
STEP 6: Pitch → ₹1,299 → ${PAYMENT_LINK}
STEP 7: YES → payment link
STEP 8: MORE → specialist

━━━ HOT LEAD ━━━
price/order/buy/MORE → ${WHATSAPP_NUM}

━━━ RULES ━━━
Aap/Ji hamesha. Medical claims nahi. Kam words.
`;

function extractFirstNumber(text) {
  const match = text.match(/\d+/);
  return match ? parseInt(match[0]) : null;
}

function detectDuration(text) {
  const t = text.toLowerCase();
  if (t.match(/bachpan|janam|decade|bahut purani/)) return 'long';
  if (t.match(/\b(10|15|20|25|30)\s*(year|sal|saal)\b/)) return 'long';
  if (t.match(/\b(3|4|5|6|7|8|9)\s*(year|sal|saal)\b/)) return 'long';
  if (t.match(/teen|paanch|char|saalon|years/)) return 'long';
  if (t.match(/1 year|2 year|1 saal|2 saal|do saal|ek saal/)) return 'medium';
  if (t.match(/6 month|6 mahine|kuch mahine|naya|abhi|recent/)) return 'short';
  return null;
}

function detectSymptom(text) {
  const t = text.toLowerCase();
  if (t.match(/sneez|watery|runny|allerg|dust|season|aankhein/)) return 'allergic';
  if (t.match(/band|block|bhaari|heavy|pressure|chehra|congestion/)) return 'congestive';
  if (t.match(/burn|jalan|yellow|green|headache|sar dard|thick/)) return 'heat';
  if (t.match(/otrivin|spray|depend|addiction|nasivion|vicks/)) return 'dependency';
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
        body: JSON.stringify({ recipient: { id: recipientId }, message: { text } })
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
        headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text } })
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
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 400, system: SYSTEM_PROMPT, messages: history })
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
// RULE-BASED FLOW
// ============================================================
async function handleRuleBased(senderId, text, sendFn) {
  const state = userState[senderId] || 'new';
  if (state === 'human_takeover') return;

  if (state === 'new') {
    if (!userProfile[senderId]) userProfile[senderId] = {};
    userState[senderId] = 'q1_duration';
    await updateLead(senderId, '🟡 Warm', 'assessment_started', '', '', '', 'Facebook');
    await sendFn(senderId, `Namaste! 🙏 Ayusomam Herbals mein swagat hai.\n\nYeh problem kitne samay se hai?\n1 — 1 se 6 mahine\n2 — 6 mahine se 1 saal\n3 — 1 se 3 saal\n4 — 3 saal se zyada\n\nBas number reply karein 🙏`);
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
    await sendFn(senderId, `Main problem kya hai?\n1️⃣ Naak band, chehra bhaari, pressure\n2️⃣ Sneezing, runny nose, dust trigger\n3️⃣ Burning sensation, thick mucus, headache\n4️⃣ Nasal spray ke bina so nahi sakta\nNumber reply karein.`);
    return;
  }

  if (state === 'q2_symptom') {
    const num = extractFirstNumber(text);
    const detected = detectSymptom(text);
    const map = { 1: 'congestive', 2: 'allergic', 3: 'heat', 4: 'dependency' };
    const ans = detected || map[num] || null;
    if (!ans) { await sendFn(senderId, 'Apna main symptom batayein 🙏'); return; }
    userProfile[senderId].symptom = ans;
    userState[senderId] = 'q3_tried';
    await sendFn(senderId, `Pehle kuch try kiya?\n1️⃣ Nahi\n2️⃣ Dawai / antibiotic\n3️⃣ Nasal spray\n4️⃣ Sab try kiya — kuch kaam nahi kiya`);
    return;
  }

  if (state === 'q3_tried') {
    const num = extractFirstNumber(text);
    if (!num || num < 1 || num > 4) { await sendFn(senderId, '1 se 4 ke beech number reply karein 🙏'); return; }
    const map = { 1: 'kuch nahi', 2: 'allopathy', 3: 'nasal spray', 4: 'sab try kiya' };
    userProfile[senderId].tried = map[num];
    userState[senderId] = 'q4_severity';
    await sendFn(senderId, `Din mein kitna affect karta hai?\n1️⃣ Thoda\n2️⃣ Medium — kaafi takleef\n3️⃣ Severe — roz ki life affect`);
    return;
  }

  if (state === 'q4_severity') {
    const num = extractFirstNumber(text);
    if (!num || num < 1 || num > 3) { await sendFn(senderId, '1, 2 ya 3 reply karein 🙏'); return; }
    userProfile[senderId].severity = { 1: 'mild', 2: 'moderate', 3: 'severe' }[num];
    const type = userProfile[senderId].symptom || 'congestive';
    await updateLead(senderId, '🔴 Hot', 'assessment_complete', type, '', '', 'Facebook');
    const timing = getTimeSlot();
    userProfile[senderId].freeStepTiming = timing;
    userState[senderId] = 'free_steps_sent';
    const stepMsg = (FREE_STEPS[timing] && FREE_STEPS[timing][type]) || FREE_STEPS[timing]['congestive'];
    await sendFn(senderId, stepMsg);
    const delayMs = timing === 'morning' ? 6 * 60 * 60 * 1000 : 8 * 60 * 60 * 1000;
    setTimeout(async () => {
      if (userState[senderId] === 'free_steps_sent') {
        try { await sendFn(senderId, FOLLOW_UP_MSG[timing]); } catch (e) { console.error('Follow-up error:', e.message); }
      }
    }, delayMs);
    return;
  }

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
      await sendFn(senderId, `Bahut achha! 🙏\n💳 ${PAYMENT_LINK}\nAmount: ₹1,299\n\nPayment ke baad WhatsApp pe message karein:\n📱 ${WHATSAPP_NUM}\nAyusomam Herbals 🌿`);
      return;
    }
    if (t === 'more') {
      userState[senderId] = 'human_takeover';
      await updateLead(senderId, '🔴 Hot', 'requested_specialist', userProfile[senderId]?.symptom, '', '', 'Facebook');
      await sendFn(senderId, `Bilkul! 🙏\nSachin ji aapke saath personally baat karenge.\n📱 ${WHATSAPP_NUM}\nAyusomam Herbals 🌿`);
      return;
    }
    await sendFn(senderId, `Koi bhi sawaal ho — hum yahan hain. 🙏\nShuru karne ke liye: YES\nSpecialist se baat ke liye: MORE`);
    return;
  }

  if (state === 'payment_sent' || state === 'done') {
    await sendFn(senderId, `Kisi bhi madad ke liye:\n📱 ${WHATSAPP_NUM}\nAyusomam Herbals 🌿`);
    return;
  }
}

// ============================================================
// MAIN PROCESSOR
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

    const t = text.toLowerCase();
    let leadTemp = convHistory[senderId] && convHistory[senderId].length > 2 ? '🟡 Warm' : '🔵 Cold';
    const isHot = t.match(/payment|pay|1299|shuru karna|buy|purchase|interested|bilkul|haan ji|ready/);
    if (isHot) leadTemp = '🔴 Hot';
    const tempOrder = { '🔵 Cold': 0, '🟡 Warm': 1, '🔴 Hot': 2 };
    const currentTemp = userProfile[senderId].temperature || '🔵 Cold';
    if ((tempOrder[leadTemp] || 0) > (tempOrder[currentTemp] || 0)) userProfile[senderId].temperature = leadTemp;
    const finalTemp = userProfile[senderId].temperature || leadTemp;

    const isPaymentQuery = t.match(/payment|kaise karu|kitna hai|price|cost|1299|buy|lena hai|link do|gpay|phonepe|paytm/);
    if (isPaymentQuery) {
      await updateLead(senderId, '🔴 Hot', 'payment_query', userProfile[senderId]?.symptom || '', userProfile[senderId]?.name || '', text, platform);
      await sendFn(senderId,
        `Bilkul Ji! 🙏 Payment bahut simple hai —\n\n1️⃣ Link pe click karein\n2️⃣ UPI / Card / Net Banking\n3️⃣ Payment ke baad screenshot bhejein\n\n👉 ${PAYMENT_LINK}\n\nAmount: ₹1,299 — 14-Din Personalized Protocol\n\nPayment hote hi main personally aapka Day 1 routine bhejunga. 🌿`
      );
      return;
    }

    const reply = await getAIReply(senderId, text);
    if (reply) {
      await sendFn(senderId, reply);
      await updateLead(senderId, finalTemp, 'ai_conversation', userProfile[senderId].symptom || '', userProfile[senderId].name || '', userProfile[senderId].firstMessage || text, platform);
    } else {
      await handleRuleBased(senderId, text, sendFn);
    }
  } else {
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
  } else { res.sendStatus(403); }
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
  if (mode === 'subscribe' && token === WA_VERIFY_TOKEN) {
    console.log('WA webhook verified ✅');
    res.status(200).send(challenge);
  } else { res.sendStatus(403); }
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
  } catch (e) { console.error('WA webhook error:', e.message); }
});

// ============================================================
// RAZORPAY WEBHOOK
// ============================================================
app.post('/razorpay-webhook', async (req, res) => {
  res.sendStatus(200);
  try {
    const signature = req.headers['x-razorpay-signature'];
    const rawBody = req.body;
    if (RAZORPAY_WEBHOOK_SECRET && signature) {
      const expectedSig = crypto.createHmac('sha256', RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
      if (expectedSig !== signature) { console.error('❌ Razorpay signature mismatch'); return; }
    }
    const payload = JSON.parse(rawBody.toString());
    if (payload.event !== 'payment.captured') return;
    const payment = payload.payload?.payment?.entity;
    if (!payment) return;
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
          timestamp: new Date().toISOString(), platform: 'Razorpay',
          senderId: phone || email, name, message: `PAID ₹${amount} | Order: ${orderId}`,
          temperature: '✅ Paid', lastStage: 'payment_complete',
          symptom: '', email, orderId, amount: `₹${amount}`
        })
      });
    }
    if (phone && WHATSAPP_TOKEN && WHATSAPP_PHONE_ID) {
      const waPhone = `91${phone}`;
      await sendWAMessage(waPhone,
        `✅ *Payment Confirmed!*\n\nOrder ID: ${orderId}\nAmount: ₹${amount}\n\n*${name} Ji, aapka order register ho gaya hai.* 🙏\n\nKal subah tak aapko complete Day 1 protocol milega.\n\n— *Sachin, Ayusomam Herbals* 🌿`
      );
      setTimeout(async () => {
        await sendWAMessage(waPhone,
          `Namaskar *${name} Ji* 🙏\n\nAapne sahi decision liya.\n\nAbhi ke liye ek kaam: subah uthke 1 glass warm water peeyein.\n\nKal main personally aapka Day 1 routine bhejunga. 🌿`
        );
      }, 8000);
    }
  } catch (e) { console.error('Razorpay webhook error:', e.message); }
});

// ============================================================
// BOT CONTROL
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
  } else { res.status(400).json({ error: 'action must be BOT_ON or BOT_OFF' }); }
});

// ============================================================
// WEBSITE CHATBOT LEAD ENDPOINT  ← FIXED
// ============================================================
app.post('/website-lead', async (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  try {
    const { name, phone, sinusType, stage, message } = req.body;

    // WEB_ prefix — sheet scientific notation nahi karega
    const senderId = phone
      ? `WEB_${String(phone).replace(/\D/g, '')}`
      : `WEB_${Date.now()}`;

    console.log(`WEBSITE LEAD: ${name} | ${phone} | ${sinusType} | ${stage}`);

    await updateLead(
      senderId,                    // userId — string, no scientific notation
      '🟡 Warm',                   // temp
      stage || 'website_chat',     // stage
      sinusType || '',             // symptom
      name || 'Website Visitor',   // name ✅
      (name ? name + ' — ' : '') + (sinusType || 'website lead'),  // message
      'Website'                    // platform
    );

    res.json({ success: true });
  } catch (e) {
    console.error('Website lead error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.options('/website-lead', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(200);
});

// ============================================================
// START
// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ayusomam Herbals Bot — Running
Port    : ${PORT}
AI Mode : ${AI_MODE ? '✅ ON' : '❌ OFF'}
Facebook: /webhook
WhatsApp: /whatsapp
Razorpay: /razorpay-webhook
Website : /website-lead
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);
});
