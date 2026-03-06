const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.use(express.json());

// ============================================================
// ENVIRONMENT VARIABLES
// ============================================================
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const GOOGLE_SHEET_URL  = process.env.GOOGLE_SHEET_URL;
const CLAUDE_API_KEY    = process.env.ANTHROPIC_API_KEY;

const PAGE_ID       = '1035532399636645';
const PAYMENT_LINK  = 'https://rzp.io/rzp/qu8zhQT';
const WHATSAPP_NUM  = '+91 85951 60713';
const WEBSITE       = 'www.ayusomamherbals.com';

// ============================================================
// AI MODE TOGGLE
// true  = AI handles all conversations (TEST MODE)
// false = Rule-based bot (ORIGINAL — safe rollback)
// ============================================================
const AI_MODE = true;

// ============================================================
// IN-MEMORY STATE
// ============================================================
const userState   = {};
const userProfile = {};
const convHistory = {};

// ============================================================
// SYSTEM PROMPT — SACHIN AI AGENT
// ============================================================
const SYSTEM_PROMPT = `
Tu Sachin hai — Ayusomam Herbals ka founder.
6 saal se sinus patients ke saath kaam kar raha hai.
Hazaron logo ki naak ki chronic problem solve ki hai.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LANGUAGE RULE — MOST IMPORTANT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

User jo language mein likhe — TU USI MEIN REPLY KAR.

"hi / hello / hey / hii" → Hinglish se start kar
English message → English reply
Hindi message → Hindi reply
Hinglish → Hinglish
Punjabi → Punjabi

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TERA CHARACTER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Bada bhai jaisi warmth — genuine care
- Doctor jaisi authority — confident
- Dost jaisi casualness — kabhi stiff nahi
- Kabhi robotic nahi lagta
- Kabhi pushy nahi — par clear
- Short sentences — WhatsApp jaisa
- Har reply fresh aur personal lagey

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AYUSOMAM HERBALS — COMPLETE DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Business: Ayurvedic sinus treatment specialist
Website: www.ayusomamherbals.com
WhatsApp: +91 85951 60713
Product: 14-Day Personalized Ayurvedic Sinus Protocol
Price: Rs 1299 for 14 days
Payment: https://rzp.io/rzp/qu8zhQT

Kya milta hai:
- Roz subah personalized routine — sirf unke liye
- Direct WhatsApp access — kabhi bhi
- Ghar ki cheezein only — kuch kharidna nahi
- 1-on-1 daily guidance — Sachin khud
- Adaptive protocol — roz update hota hai

Ingredients used (all at home):
Adrak, laung, kali mirch, tulsi, haldi, dalchini
Koi supplement nahi — koi extra kharid nahi

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SALES PSYCHOLOGY — FOLLOW KARO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 1 — RAPPORT
Pehle unka dard acknowledge kar
"Yaar yeh bahut frustrating hota hai"
Connect pehle — tab sawaal

STEP 2 — PAIN AMPLIFY
Duration sun ke respond kar
"X saal/mahine — yaar kaafi waqt hai"
Feel karao ki tu samajhta hai unka dard

STEP 3 — CURIOSITY
Natural conversation mein assessment
List format nahi — dost jaisi baat

STEP 4 — DIAGNOSIS
4 sawaal ke baad confident diagnosis de
"Main clearly dekh sakta hun..."
Authority feel honi chahiye

STEP 5 — SPECIFIC SOLUTION
Unke exact type ke liye specific solution
"Aapke case mein specifically..."

STEP 6 — SOCIAL PROOF
Real cases naturally mention kar
Jab relevant ho — force mat kar

STEP 7 — SOFT CLOSE
"Shuru karein?" with payment link
Pressure nahi — confidence

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ASSESSMENT — 4 SAWAAL NATURALLY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Conversation mein naturally poochh:

SAWAAL 1: "Kitne time se hai yeh?"
SAWAAL 2: "Naak band zyada hoti hai — ya kuch aur bhi hai saath mein?"
SAWAAL 3: "Pehle kuch try kiya? Dawai ya spray?"
SAWAAL 4: "Din mein kitna affect karta hai?"

RULE: Ek sawaal — ek baar
Assessment ke BAAD hi diagnosis aur pitch

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4 SINUS TYPES — DIAGNOSIS + PITCH
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TYPE 1 — ALLERGIC SINUS
Signs: Sneezing, watery/runny nose, dust/season trigger
Root cause: Naak ki lining oversensitive ho gayi
Pitch: "Antihistamines sirf reaction rokti hain — root cause waise ka waisa"
Protocol focus: Anti-inflammatory + immune regulation

TYPE 2 — CONGESTIVE SINUS
Signs: Naak band, chehra bhaari, subah worse, pressure
Root cause: Mucus stuck — circulation nahi
Pitch: "Mucus andar stuck hai — drain nahi ho raha — circulation chahiye"
Protocol focus: Drainage + nasya + circulation

TYPE 3 — HEAT/PITTAJ SINUS
Signs: Burning, thick yellow/green mucus, forehead headache
Root cause: Andar inflammation — body mein heat
Pitch: "Cooling + anti-inflammatory protocol chahiye"
Protocol focus: Cooling kadha + steam + diet adjust

TYPE 4 — DEPENDENCY SINUS
Signs: Spray ke bina so nahi sakte, baar baar spray
Root cause: Spray ne natural mechanism tod diya
Pitch: "Jitna zyada spray — utna zyada dependency — cycle todna padega"
Protocol focus: Gradual nasya detox + natural breathing

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DIAGNOSIS DENE KA TARIKA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Assessment ke baad:
"[Name]/Bhai/Yaar — tera case clear hai —
[TYPE] hai yeh —
[Reason — kyun hua] —
[Kyun generic cheezein kaam nahi karti] —
14 din mein [kya hoga day by day] —
[Ek real client result jo similar tha]
Shuru karein? 🙏"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REAL CLIENT RESULTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Rahul ji — 9 saal naak band, smell nahi
Day 9 pe taste aur smell wapas aaya ✅

Shikha ji — 5 saal nasal spray dependent
14 din baad spray ki zaroorat nahi rahi ✅

Hansaa ji — 20 saal chronic problem
"Pehli baar feel hua koi actually samjha" ✅

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OBJECTION HANDLING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

"Sochna hai":
"Haan bilkul — bas yeh yaad rakhna —
jo abhi hai woh tab tak waise hi rahega
jab tak kuch alag nahi karte —
main hun jab bhi ready ho 🙏"

"Mehnga hai":
"Yaar ek din ka nikalo — Rs 92 —
ek chai se bhi kam —
14 din main personally tere saath hun"

"Guarantee?":
"Cure ka claim nahi karunga —
par 14 din seriously karo —
fark feel hoga — yeh main personally kehta hun 🙏"

"Pehle kaam nahi kiya":
"Isliye poochh raha tha —
jo try kiya woh tera specific type ke liye nahi tha —
approach alag hogi"

"Free mein batao":
"Yaar kuch tips zaroor dunga —
par 14 din ka daily personalized guidance —
woh mera time hai —
main chahta hun tu seriously better ho 🙏"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CLOSING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

"[Name] — [X time] jhela tune —
ab sirf 14 din — apne liye —
main hun saath mein 🌿

💳 https://rzp.io/rzp/qu8zhQT
Rs 1,299 — 14 din

Payment karte hi aaj se shuru karte hain"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HARD RULES — KABHI MAT TODA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

❌ Robot jaisa mat bol
❌ Long paragraphs nahi — max 5 lines
❌ 2 sawaal ek saath nahi
❌ Aggressive selling nahi
❌ Fake medical claims nahi
❌ Assessment se pehle pitch nahi
✅ Short crisp warm messages
✅ Ek sawaal ek baar
✅ Acknowledge pehle — sawaal baad
✅ Real results naturally use karo
✅ Payment link assessment ke BAAD
✅ Har reply naya aur personal
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
  if (t.match(/\b(6 month|6 mahine|less|kam|thodi|naya|abhi|recent)\b/)) return 'short';
  if (t.match(/\b(1 year|2 year|1 sal|2 sal|1 saal|2 saal|do saal|ek saal|one year|two year)\b/)) return 'medium';
  if (t.match(/\b(3|4|5|6|7|8|9|10|15|20)\s*(year|sal|saal|yr)\b/)) return 'long';
  if (t.match(/\b(teen|paanch|char|saalon|bahut|long|purani|years|kaafi|decade)\b/)) return 'long';
  return null;
}

function detectSymptom(text) {
  const t = text.toLowerCase();
  if (t.match(/\b(sneez|watery|runny|allerg|dust|season|pollen|itch)\b/)) return 'allergic';
  if (t.match(/\b(band|block|bhaari|heavy|pressure|chehra|facial)\b/)) return 'congestive';
  if (t.match(/\b(burn|jalan|yellow|green|peela|headache|sar dard|thick|garam)\b/)) return 'heat';
  if (t.match(/\b(otrivin|spray|depend|addiction|nasivion|vicks|inhaler)\b/)) return 'dependency';
  return null;
}

// ============================================================
// GOOGLE SHEETS
// ============================================================

async function updateLead(userId, temp, stage, symptom) {
  if (!GOOGLE_SHEET_URL) return;
  try {
    await fetch(GOOGLE_SHEET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'updateLead',
        userId,
        leadTemp: temp,
        stage,
        symptom: symptom || ''
      })
    });
  } catch (e) {
    console.error('Sheet error:', e.message);
  }
}

// ============================================================
// SEND MESSAGE
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
    if (data.error) console.error('Send error:', data.error);
  } catch (e) {
    console.error('sendMessage error:', e.message);
  }
}

// ============================================================
// AI REPLY — CLAUDE HAIKU
// ============================================================

async function getAIReply(userId, userMessage) {
  if (!convHistory[userId]) convHistory[userId] = [];

  convHistory[userId].push({ role: 'user', content: userMessage });

  // Keep last 14 messages (7 turns)
  const history = convHistory[userId].slice(-14);

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
        max_tokens: 350,
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
// RULE-BASED FLOW (original bot — AI_MODE = false)
// ============================================================

async function handleRuleBased(senderId, text) {
  const state = userState[senderId] || 'new';

  if (state === 'human_takeover') return;

  if (state === 'new') {
    userState[senderId] = 'q1_duration';
    await updateLead(senderId, '🟡 Warm', 'assessment_started', '');
    await sendMessage(senderId,
`Namaste ji! 🙏 Ayusomam Herbals mein swagat hai.

Aapka sinus kitne time se hai?

1️⃣ 1 mahine se kam
2️⃣ 1 se 6 mahine
3️⃣ 6 mahine se 2 saal
4️⃣ 2 saal se zyada

Sirf number reply karein 👆`);
    return;
  }

  if (state === 'q1_duration') {
    const num = extractFirstNumber(text);
    const detected = detectDuration(text);
    const ans = detected || (num === 1 ? 'short' : num === 2 ? 'medium' : num >= 3 ? 'long' : null);
    if (!ans) { await sendMessage(senderId, 'Sirf number reply karein — 1, 2, 3 ya 4 🙏'); return; }
    if (!userProfile[senderId]) userProfile[senderId] = {};
    userProfile[senderId].duration = ans;
    userState[senderId] = 'q2_symptom';
    await sendMessage(senderId,
`Main symptom kya hai?

1️⃣ Naak band, chehra bhaari, pressure
2️⃣ Sneezing, runny nose, dust trigger
3️⃣ Burning, thick mucus, headache
4️⃣ Nasal spray ke bina so nahi sakta

Sirf number reply karein 👆`);
    return;
  }

  if (state === 'q2_symptom') {
    const num = extractFirstNumber(text);
    const detected = detectSymptom(text);
    const map = { 1: 'congestive', 2: 'allergic', 3: 'heat', 4: 'dependency' };
    const ans = detected || map[num] || null;
    if (!ans) { await sendMessage(senderId, 'Sirf number reply karein — 1, 2, 3 ya 4 🙏'); return; }
    userProfile[senderId].symptom = ans;
    userState[senderId] = 'q3_tried';
    await sendMessage(senderId,
`Pehle kuch try kiya?

1️⃣ Nahi — kuch nahi
2️⃣ Dawai / antibiotic
3️⃣ Nasal spray
4️⃣ Sab try kiya — kuch kaam nahi kiya

Sirf number reply karein 👆`);
    return;
  }

  if (state === 'q3_tried') {
    const num = extractFirstNumber(text);
    if (!num || num < 1 || num > 4) { await sendMessage(senderId, 'Sirf number reply karein — 1, 2, 3 ya 4 🙏'); return; }
    const map = { 1: 'kuch nahi', 2: 'allopathy', 3: 'nasal spray', 4: 'sab try kiya' };
    userProfile[senderId].tried = map[num];
    userState[senderId] = 'q4_severity';
    await sendMessage(senderId,
`Din mein kitna affect karta hai?

1️⃣ Thoda — adjust ho jaata hun
2️⃣ Medium — kaafi takleef
3️⃣ Severe — roz ki life affect

Sirf number reply karein 👆`);
    return;
  }

  if (state === 'q4_severity') {
    const num = extractFirstNumber(text);
    if (!num || num < 1 || num > 3) { await sendMessage(senderId, 'Sirf number reply karein — 1, 2 ya 3 🙏'); return; }
    const sevMap = { 1: 'mild', 2: 'moderate', 3: 'severe' };
    userProfile[senderId].severity = sevMap[num];
    const type = userProfile[senderId].symptom;
    await updateLead(senderId, '🔴 Hot', 'assessment_complete', type);
    userState[senderId] = 'pitched';

    const pitches = {
      allergic: `📋 Aapka Sinus Type: ALLERGIC SINUS 🌿\n\nAapki naak ki lining oversensitive ho gayi hai — isliye dust, mausam se trigger hota hai. Antihistamines sirf reaction rokti hain — root cause waise ka waisa rehta hai.\n\n14 din mein:\n📅 Din 1-3: Lining soothing — sneezing kam\n📅 Din 4-7: Immune response normalize\n📅 Din 8-14: Triggers pe reaction kam\n\n⭐ Rahul ji — 9 saal ki band naak — Day 9 pe smell wapas aayi ✅\n\n━━━━━━━━━━━━━━━━━━━━\nInvestment: ₹1,299 — 14 din\n━━━━━━━━━━━━━━━━━━━━\n\nShuru karein? Reply YES 🙏\nYa details ke liye MORE type karein\n\n💳 ${PAYMENT_LINK}`,
      congestive: `📋 Aapka Sinus Type: CONGESTIVE SINUS 🔴\n\nMucus andar stuck hai — drain nahi ho raha. Isliye chehra bhaari aur subah naak band hoti hai.\n\n14 din mein:\n📅 Din 1-3: Pressure release — heaviness kam\n📅 Din 4-7: Drainage improve hogi\n📅 Din 8-14: Subah uthte hi naak khuli\n\n⭐ Shikha ji — 5 saal spray dependent — 14 din baad spray ki zaroorat nahi rahi ✅\n\n━━━━━━━━━━━━━━━━━━━━\nInvestment: ₹1,299 — 14 din\n━━━━━━━━━━━━━━━━━━━━\n\nShuru karein? Reply YES 🙏\nYa details ke liye MORE type karein\n\n💳 ${PAYMENT_LINK}`,
      heat: `📋 Aapka Sinus Type: HEAT PATTERN SINUS 🔥\n\nAndar inflammation chal rahi hai — body mein heat badhti hai toh yeh aur badh jaata hai.\n\n14 din mein:\n📅 Din 1-3: Cooling — burning kam hogi\n📅 Din 4-7: Mucus thin — drain hoga\n📅 Din 8-14: Headache frequency reduce\n\n⭐ Hansaa ji — 20 saal ki problem — "Pehli baar laga koi samjha" ✅\n\n━━━━━━━━━━━━━━━━━━━━\nInvestment: ₹1,299 — 14 din\n━━━━━━━━━━━━━━━━━━━━\n\nShuru karein? Reply YES 🙏\nYa details ke liye MORE type karein\n\n💳 ${PAYMENT_LINK}`,
      dependency: `📋 Aapka Sinus Type: SPRAY DEPENDENCY ⚠️\n\nSpray ne natural breathing mechanism tod diya hai. Jitna zyada spray — utna zyada dependency.\n\n14 din mein:\n📅 Din 1-3: Natural breathing restore shuru\n📅 Din 4-7: Spray dependency gradually kam\n📅 Din 8-14: Bina spray breathe karna possible\n\n⭐ Shikha ji — 5 saal spray — 14 din baad spray ki zaroorat nahi rahi ✅\n\n━━━━━━━━━━━━━━━━━━━━\nInvestment: ₹1,299 — 14 din\n━━━━━━━━━━━━━━━━━━━━\n\nShuru karein? Reply YES 🙏\nYa details ke liye MORE type karein\n\n💳 ${PAYMENT_LINK}`
    };

    await sendMessage(senderId, pitches[type] || pitches['congestive']);
    return;
  }

  if (state === 'pitched') {
    const t = text.toLowerCase().trim();
    if (['yes','ha','haan','okay','ok','hnji','ji'].includes(t)) {
      userState[senderId] = 'payment_sent';
      await updateLead(senderId, '🔴 Hot', 'payment_link_sent', userProfile[senderId]?.symptom);
      await sendMessage(senderId,
`Bahut achha! 🙏\n\n💳 ${PAYMENT_LINK}\nAmount: ₹1,299\n\nPayment ke baad WhatsApp pe milega:\n✅ Day 1 personalized routine\n✅ Daily guidance schedule\n✅ Direct specialist access\n\nWhatsApp number zaroor daalein payment mein.\n\n📱 ${WHATSAPP_NUM}\n🌐 ${WEBSITE}\n\nAyusomam Herbals 🌿`);
      return;
    }
    if (t === 'more') {
      userState[senderId] = 'human_takeover';
      await updateLead(senderId, '🔴 Hot', 'requested_specialist', userProfile[senderId]?.symptom);
      await sendMessage(senderId,
`Bilkul! 🙏\n\nHamare specialist aapse seedha baat karenge.\nThoda wait karein — ya seedha WhatsApp:\n📱 ${WHATSAPP_NUM}\n\nAyusomam Herbals 🌿`);
      return;
    }
    await sendMessage(senderId,
`Koi bhi sawaal ho — hum yahan hain. 🙏\n\nShuru karne ke liye: YES\nSpecialist se baat: MORE\n\n🌐 ${WEBSITE}`);
    return;
  }

  if (state === 'done' || state === 'payment_sent') {
    await sendMessage(senderId, `Madad ke liye WhatsApp karein:\n📱 ${WHATSAPP_NUM}\n\nAyusomam Herbals 🌿`);
    return;
  }
}

// ============================================================
// MAIN PROCESSOR
// ============================================================

async function processMessage(senderId, text) {
  if (userState[senderId] === 'human_takeover') {
    console.log(`SILENT — human takeover: ${senderId}`);
    return;
  }

  if (AI_MODE) {
    console.log(`[AI] ${senderId}: ${text}`);
    const reply = await getAIReply(senderId, text);
    if (reply) {
      await sendMessage(senderId, reply);
      await updateLead(senderId, '🟡 Warm', 'ai_conversation', '');
    } else {
      console.log('AI failed — fallback to rule based');
      await handleRuleBased(senderId, text);
    }
  } else {
    console.log(`[RULE] ${senderId}: ${text}`);
    await handleRuleBased(senderId, text);
  }
}

// ============================================================
// WEBHOOK
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

        // Page message — human takeover
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

        console.log(`MSG ${senderId}: ${text}`);
        await processMessage(senderId, text);
      }
    }
  }

  res.status(200).send('EVENT_RECEIVED');
});

// ============================================================
// START
// ============================================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ayusomam Herbals Bot — Running
Port    : ${PORT}
AI Mode : ${AI_MODE ? '✅ ON (Test Mode)' : '❌ OFF (Rule-based)'}
Rollback: Change AI_MODE = false
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);
});
