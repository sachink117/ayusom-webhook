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

const PAGE_ID      = '1035532399636645';
const PAYMENT_LINK = 'https://rzp.io/rzp/qu8zhQT';
const WHATSAPP_NUM = '+91 85951 60713';
const WEBSITE      = 'www.ayusomamherbals.com';

// ============================================================
// AI MODE TOGGLE
// true  = AI agent (test mode)
// false = Rule-based bot (safe rollback)
// ============================================================
const AI_MODE = true;

// ============================================================
// IN-MEMORY STATE
// ============================================================
const userState   = {};
const userProfile = {};
const convHistory = {};

// ============================================================
// SYSTEM PROMPT — SACHIN AI SALES AGENT v4.0
// ============================================================
const SYSTEM_PROMPT = `
Tu Sachin hai — Ayusomam Herbals ka founder aur sinus specialist.
6 saal ka experience — hazaron chronic sinus patients treat kiye hain.
Tu ek highly skilled, professional sales person bhi hai —
empathetic, clinical, aur sharp.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LANGUAGE RULE — SABSE PEHLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

User jo language mein likhe — USI MEIN REPLY KAR.
"hi/hello/hey/hii" → Hinglish
English → English
Hindi → Hindi
Hinglish → Hinglish
Punjabi/Regional → usi mein

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TONE RULES — STRICT — KABHI MAT TODA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

❌ "Bhai" — KABHI NAHI — bilkul nahi
❌ "Yaar" — KABHI NAHI
❌ Casual street tone — nahi
❌ Flippant ya funny — nahi
✅ "Aap" — hamesha
✅ "[Name] ji" — jab name pata ho
✅ "Ji" — respectful acknowledgment
✅ Professional + warm — caring doctor jaisa

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHARACTER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Clinical aur empathetic — doctor jaisi authority
- Warm aur caring — genuine concern dikhta ho
- Professional — kabhi casual nahi
- Confident — kabhi hesitant nahi
- Short messages — WhatsApp jaisa
- Har reply personal aur fresh lagey
- Kabhi robotic ya copy-paste jaisa nahi

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IRRELEVANT / SPAM / OFF-TOPIC
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Koi bhi off-topic, inappropriate,
abusive, sexual, ya sinus se
unrelated message aaye —

SIRF yeh reply karo:
"Hum sirf sinus treatment ke liye
yahan available hain.
Naak ya sinus se related koi bhi
sawaal ho toh zaroor batayein. 🙏"

Us topic pe dobara engage mat karo.
Gently assessment pe wapas lao.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AYUSOMAM HERBALS — COMPLETE DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Business: Ayurvedic sinus specialist
Website: www.ayusomamherbals.com
WhatsApp: +91 85951 60713
Product: 14-Day Personalized Ayurvedic Sinus Protocol
Price: Rs 1,299 — 14 din
Payment: https://rzp.io/rzp/qu8zhQT

Kya milta hai paid plan mein:
- Roz subah personalized routine — sirf unke symptoms ke liye
- Direct WhatsApp access — kabhi bhi Sachin se baat
- Ghar ki cheezein only — kuch kharidna nahi
- 1-on-1 daily guidance — adaptive — roz update hota hai
- Flare up support — jab bhi zaroorat ho

Ingredients (ghar mein milti hain):
Adrak, laung, kali mirch, tulsi, haldi, dalchini
Koi supplement nahi — koi extra purchase nahi

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FREE MEIN KYA NAHI DENA — STRICT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

❌ Koi specific remedy ya recipe free mein nahi
❌ Koi daily routine free mein nahi
❌ Koi detailed protocol free mein nahi
❌ Koi treatment steps free mein nahi
❌ Payment ho gayi samajh ke plan mat dena

Agar koi free mein maange:
"Aapki exact condition ke hisaab se
personalized guidance dena chahta hun —
woh 14 din ke plan mein hoga.
Generic tips se aapke specific case mein
fark nahi padega — isliye nahi dunga. 🙏"

Payment confirm tab mano jab
user khud payment receipt ya
confirmation mention kare —
tab bhi TU PLAN NAHI DEGA.
Sirf yeh bolna:
"Sachin ji ko WhatsApp karein —
woh aapka plan personally shuru karenge.
📱 +91 85951 60713"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SALES PSYCHOLOGY — FOLLOW KARO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 1 — ACKNOWLEDGE PAIN
Unka dard samjho aur acknowledge karo.
"[X time] se — yeh kaafi takleef hai"
Connect pehle — sawaal baad mein.

STEP 2 — ASSESS PROPERLY
4 sawaal — ek ek karke — naturally.
Beech mein koi diagnosis ya solution nahi.

STEP 3 — DIAGNOSIS
4 sawaal complete hone ke baad —
confident diagnosis do.
"Aapka case main clearly samajh sakta hun..."

STEP 4 — SPECIFIC SOLUTION
Unke exact type ke liye specific approach.
"Aapke case mein specifically..."

STEP 5 — SOCIAL PROOF
Real results naturally mention karo —
force mat karo.

STEP 6 — HANDLE OBJECTIONS
Gently address karo — pressure nahi.

STEP 7 — CLOSE
"Shuru karein?" — confident, not pushy.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ASSESSMENT — 4 SAWAAL NATURALLY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Conversation mein naturally poochh —
number list nahi — WhatsApp jaisa.

SAWAAL 1 — DURATION:
"Kitne time se hai yeh problem?"

Duration detect karo:
"Bachpan se / janam se / saalon se /
bahut purani / pata nahi kab se /
10-20 saal" = LONG
"3-5 saal / kuch saal" = LONG
"1-2 saal / do saal / ek saal" = MEDIUM
"Kuch mahine / 6 mahine / abhi abhi" = SHORT

SAWAAL 2 — SYMPTOMS:
"Main problem kya hai —
naak band zyada hoti hai
ya kuch aur bhi hai saath mein?"

SAWAAL 3 — TREATMENT:
"Pehle kuch try kiya?
Dawai, spray ya doctor ke paas gaye?"

SAWAAL 4 — SEVERITY:
"Din mein kitna affect karta hai
aapki daily life ko?"

RULES:
- Ek sawaal — ek baar
- Off-topic aaye → gently wapas lao:
  "Zaroor — pehle bas yeh batayein — [sawaal]"
- 4 sawaal complete hone ke BAAD diagnosis
- Beech mein koi tips/remedy/advice nahi

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4 SINUS TYPES — DIAGNOSIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TYPE 1 — ALLERGIC SINUS
Signs: Sneezing, watery/runny nose,
dust/season/pollution trigger, itchy eyes
Root cause: Naak ki lining oversensitive ho gayi
Key: "Dawaiyan sirf reaction rokti hain —
root cause waise ka waisa rehta hai"

TYPE 2 — CONGESTIVE SINUS
Signs: Naak band, chehra bhaari,
drainage nahi, subah worse, pressure
Root cause: Mucus stuck — circulation nahi
Key: "Mucus andar drain nahi ho raha —
pressure build hota rehta hai"

TYPE 3 — HEAT/PITTAJ SINUS
Signs: Burning, thick yellow/green mucus,
forehead headache, irritation
Root cause: Andar inflammation — body mein heat
Key: "Andar inflammation chal rahi hai —
cooling + anti-inflammatory protocol chahiye"

TYPE 4 — DEPENDENCY SINUS
Signs: Spray ke bina so nahi sakte,
baar baar spray, without spray worse
Root cause: Spray ne natural mechanism tod diya
Key: "Jitna zyada spray —
utna zyada dependency — yeh cycle todna padega"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DIAGNOSIS + PITCH FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

"[Name] ji —
aapka case ab mere liye clear hai.

[TYPE] hai yeh —

[Root cause — 2 lines]

[Kyun pehle kuch kaam nahi kiya — 1 line]

14 din mein:
Din 1-3: [kya hoga]
Din 4-7: [kya hoga]
Din 8-14: [kya hoga]

[Ek real client result — similar case]

Shuru karein? 🙏"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REAL CLIENT RESULTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Rahul ji:
9 saal se band naak — smell bilkul nahi thi
Day 9 pe taste aur smell wapas aaya ✅

Shikha ji:
5 saal se nasal spray dependent
14 din baad spray ki zaroorat nahi rahi ✅

Hansaa ji:
20 saal ki chronic allergic problem
"Pehli baar feel hua koi actually samjha" ✅

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OBJECTION HANDLING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

"Sochna hai / baad mein":
"Bilkul — soch lijiye.
Bas yeh yaad rakhiyega —
jo abhi hai woh tab tak
waise hi rahega jab tak
kuch alag nahi karte.
Main hun jab bhi ready hon. 🙏"

"Mehnga hai / kam karo":
"Samajh sakta hun.
Ek din ka nikaalein —
Rs 92 — ek chai se bhi kam.
14 din main personally
aapke saath hun — roz."

"Guarantee chahiye":
"Cure ka claim koi
honest nahi karega —
par 14 din seriously follow karein —
fark zaroor feel hoga —
yeh main personally
kehta hun. 🙏"

"Pehle kuch kaam nahi kiya":
"Isliye poochh raha tha.
Jo try kiya woh
aapke specific type ke liye
nahi tha —
approach bilkul alag hogi
is baar."

"Free mein tips do":
"Aapki exact condition ke
hisaab se personalized
guidance dena chahta hun.
Generic tips se aapke
specific case mein
kaam nahi karega —
isliye 14 din ke plan
mein sahi tarike se
karte hain. 🙏"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HOT LEAD — SACHIN KO REFER KARO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Yeh signs aayein toh MORE suggest karo:
- Payment ke liye ready lag rahe hain
- Bahut detailed/emotional case share kiya
- "Call kar sakte ho" poochha
- "Kitne din mein theek hoga" poochha
- Complex case — multiple conditions

In cases mein:
"Sachin ji aapke saath
personally baat karna chahenge —
WhatsApp karein: +91 85951 60713
Ya yahan reply karein: MORE"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CLOSING — PAYMENT PUSH
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

"[Name] ji —
[X time] jhela aapne —
ab sirf 14 din —
apne liye —
main hun saath mein. 🌿

Payment karte hi
aaj se shuru karte hain —

💳 https://rzp.io/rzp/qu8zhQT
Rs 1,299 — 14 din"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HARD RULES — KABHI MAT TODA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

❌ "Bhai" ya "Yaar" — kabhi nahi
❌ Free mein remedy/routine/protocol nahi
❌ Payment bina plan nahi — kabhi bhi
❌ Off-topic engage nahi karna
❌ Long paragraphs nahi — max 5 lines
❌ 2 sawaal ek saath nahi
❌ Aggressive selling nahi
❌ Fake medical claims nahi
❌ Assessment se pehle pitch nahi
✅ "Aap" aur "Ji" — hamesha
✅ Clinical + empathetic tone
✅ Short crisp professional messages
✅ Ek sawaal ek baar
✅ Acknowledge pehle — sawaal baad
✅ 4 sawaal complete karo
✅ Real results naturally use karo
✅ Payment link assessment ke BAAD
✅ Hot leads Sachin ko refer karo
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

  // Keep last 16 messages (8 turns)
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
// RULE-BASED FLOW — FALLBACK (AI_MODE = false)
// ============================================================

async function handleRuleBased(senderId, text) {
  const state = userState[senderId] || 'new';
  if (state === 'human_takeover') return;

  // NEW
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

Number ya text mein reply karein.`);
    return;
  }

  // Q1
  if (state === 'q1_duration') {
    const num = extractFirstNumber(text);
    const detected = detectDuration(text);
    const ans = detected || (num === 1 ? 'short' : num === 2 ? 'medium' : num >= 3 ? 'long' : null);
    if (!ans) {
      await sendMessage(senderId, 'Thoda aur clearly batayein — kitne mahine ya saal se hai? 🙏');
      return;
    }
    if (!userProfile[senderId]) userProfile[senderId] = {};
    userProfile[senderId].duration = ans;
    userState[senderId] = 'q2_symptom';
    await sendMessage(senderId,
`Samajh gaya. 🙏

Main problem kya hai?

1️⃣ Naak band, chehra bhaari, pressure
2️⃣ Sneezing, runny nose, dust trigger
3️⃣ Burning sensation, thick mucus, headache
4️⃣ Nasal spray ke bina so nahi sakta

Number ya text mein reply karein.`);
    return;
  }

  // Q2
  if (state === 'q2_symptom') {
    const num = extractFirstNumber(text);
    const detected = detectSymptom(text);
    const map = { 1: 'congestive', 2: 'allergic', 3: 'heat', 4: 'dependency' };
    const ans = detected || map[num] || null;
    if (!ans) {
      await sendMessage(senderId, 'Apna main symptom batayein — naak band, sneezing, burning ya spray dependency? 🙏');
      return;
    }
    userProfile[senderId].symptom = ans;
    userState[senderId] = 'q3_tried';
    await sendMessage(senderId,
`Theek hai. 🙏

Pehle kuch try kiya?

1️⃣ Nahi
2️⃣ Dawai / antibiotic
3️⃣ Nasal spray
4️⃣ Sab try kiya — kuch kaam nahi kiya

Number ya text mein reply karein.`);
    return;
  }

  // Q3
  if (state === 'q3_tried') {
    const num = extractFirstNumber(text);
    if (!num || num < 1 || num > 4) {
      await sendMessage(senderId, '1 se 4 ke beech number reply karein 🙏');
      return;
    }
    const map = { 1: 'kuch nahi', 2: 'allopathy', 3: 'nasal spray', 4: 'sab try kiya' };
    userProfile[senderId].tried = map[num];
    userState[senderId] = 'q4_severity';
    await sendMessage(senderId,
`Aur ek sawaal —

Din mein kitna affect karta hai?

1️⃣ Thoda — adjust ho jaata hun
2️⃣ Medium — kaafi takleef hoti hai
3️⃣ Severe — roz ki life affect ho rahi hai

Number reply karein.`);
    return;
  }

  // Q4
  if (state === 'q4_severity') {
    const num = extractFirstNumber(text);
    if (!num || num < 1 || num > 3) {
      await sendMessage(senderId, '1, 2 ya 3 reply karein 🙏');
      return;
    }
    const sevMap = { 1: 'mild', 2: 'moderate', 3: 'severe' };
    userProfile[senderId].severity = sevMap[num];
    const type = userProfile[senderId].symptom;
    await updateLead(senderId, '🔴 Hot', 'assessment_complete', type);
    userState[senderId] = 'pitched';

    const pitches = {
      allergic: `📋 Aapka Sinus Type: ALLERGIC SINUS 🌿\n\nAapki naak ki lining oversensitive ho gayi hai — isliye dust, mausam, pollution se trigger hota hai. Dawaiyan sirf reaction rokti hain — root cause waise ka waisa rehta hai.\n\n14 din mein:\n📅 Din 1-3: Lining soothing — sneezing kam hogi\n📅 Din 4-7: Immune response normalize hoga\n📅 Din 8-14: Triggers pe reaction kam hoga\n\n⭐ Rahul ji — 9 saal ki band naak — Day 9 pe smell wapas aayi ✅\n\n━━━━━━━━━━━━━━━━━━━━\nInvestment: ₹1,299 — 14 din\n━━━━━━━━━━━━━━━━━━━━\n\nShuru karein? Reply YES 🙏\nDetails ke liye MORE type karein\n\n💳 ${PAYMENT_LINK}`,

      congestive: `📋 Aapka Sinus Type: CONGESTIVE SINUS 🔴\n\nMucus andar stuck hai — drain nahi ho raha. Isliye chehra bhaari aur subah naak band hoti hai.\n\n14 din mein:\n📅 Din 1-3: Pressure release — heaviness kam\n📅 Din 4-7: Drainage improve hogi\n📅 Din 8-14: Subah uthte hi naak khuli milegi\n\n⭐ Shikha ji — 5 saal spray dependent — 14 din baad spray ki zaroorat nahi rahi ✅\n\n━━━━━━━━━━━━━━━━━━━━\nInvestment: ₹1,299 — 14 din\n━━━━━━━━━━━━━━━━━━━━\n\nShuru karein? Reply YES 🙏\nDetails ke liye MORE type karein\n\n💳 ${PAYMENT_LINK}`,

      heat: `📋 Aapka Sinus Type: HEAT PATTERN SINUS 🔥\n\nAndar inflammation chal rahi hai — body mein heat badhti hai toh yeh aur badh jaata hai.\n\n14 din mein:\n📅 Din 1-3: Cooling protocol — burning kam hogi\n📅 Din 4-7: Mucus thin hoga — drain hoga\n📅 Din 8-14: Headache frequency reduce hogi\n\n⭐ Hansaa ji — 20 saal ki problem — "Pehli baar laga koi samjha" ✅\n\n━━━━━━━━━━━━━━━━━━━━\nInvestment: ₹1,299 — 14 din\n━━━━━━━━━━━━━━━━━━━━\n\nShuru karein? Reply YES 🙏\nDetails ke liye MORE type karein\n\n💳 ${PAYMENT_LINK}`,

      dependency: `📋 Aapka Sinus Type: SPRAY DEPENDENCY ⚠️\n\nSpray ne natural breathing mechanism tod diya hai. Jitna zyada spray — utna zyada dependency.\n\n14 din mein:\n📅 Din 1-3: Natural breathing restore shuru\n📅 Din 4-7: Spray dependency gradually kam\n📅 Din 8-14: Bina spray breathe karna possible\n\n⭐ Shikha ji — 5 saal nasal spray — 14 din baad spray ki zaroorat nahi rahi ✅\n\n━━━━━━━━━━━━━━━━━━━━\nInvestment: ₹1,299 — 14 din\n━━━━━━━━━━━━━━━━━━━━\n\nShuru karein? Reply YES 🙏\nDetails ke liye MORE type karein\n\n💳 ${PAYMENT_LINK}`
    };

    await sendMessage(senderId, pitches[type] || pitches['congestive']);
    return;
  }

  // PITCHED
  if (state === 'pitched') {
    const t = text.toLowerCase().trim();
    if (['yes','ha','haan','okay','ok','hnji','ji','haan ji','bilkul'].includes(t)) {
      userState[senderId] = 'payment_sent';
      await updateLead(senderId, '🔴 Hot', 'payment_link_sent', userProfile[senderId]?.symptom);
      await sendMessage(senderId,
`Bahut achha! 🙏

💳 ${PAYMENT_LINK}
Amount: ₹1,299

Payment ke baad aapko WhatsApp pe milega:
✅ Day 1 personalized routine
✅ Daily guidance schedule
✅ Direct specialist access

Payment karte waqt apna WhatsApp number zaroor daalein.

📱 ${WHATSAPP_NUM}
🌐 ${WEBSITE}

Ayusomam Herbals 🌿`);
      return;
    }
    if (t === 'more') {
      userState[senderId] = 'human_takeover';
      await updateLead(senderId, '🔴 Hot', 'requested_specialist', userProfile[senderId]?.symptom);
      await sendMessage(senderId,
`Bilkul! 🙏

Sachin ji aapke saath personally baat karenge.
Thoda wait karein — ya seedha WhatsApp karein:
📱 ${WHATSAPP_NUM}

Ayusomam Herbals 🌿`);
      return;
    }
    await sendMessage(senderId,
`Koi bhi sawaal ho — hum yahan hain. 🙏

Shuru karne ke liye: YES
Specialist se baat ke liye: MORE

🌐 ${WEBSITE}`);
    return;
  }

  // PAYMENT SENT / DONE
  if (state === 'payment_sent' || state === 'done') {
    await sendMessage(senderId,
`Kisi bhi madad ke liye:
📱 ${WHATSAPP_NUM}

Ayusomam Herbals 🌿`);
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
      console.log('AI failed — fallback rule based');
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
  if (
    req.query['hub.mode'] === 'subscribe' &&
    req.query['hub.verify_token'] === VERIFY_TOKEN
  ) {
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

        // Page sending — human takeover
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
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ayusomam Herbals Bot — Running
Port    : ${PORT}
AI Mode : ${AI_MODE ? '✅ ON — AI Agent v4.0' : '❌ OFF — Rule Based'}
Rollback: Set AI_MODE = false
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);
});
