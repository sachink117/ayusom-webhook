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
const PAYMENT_1299 = 'https://rzp.io/rzp/qu8zhQT';
const PAYMENT_499 = 'https://rzp.io/rzp/Re2W26iX';
const WHATSAPP_NUM = '+91 85951 60713';

// ============================================================
// IN-MEMORY STATE
// ============================================================
const userState = {};
const userProfile = {};
const convHistory = {};
const followUpTracker = {}; // { senderId: { pitchedAt, followUp1Sent, followUp2Sent, platform, sendFnType } }

// ============================================================
// IST TIME HELPER
// ============================================================
function getISTHour() {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return ist.getUTCHours();
}
function getTimeSlot() {
  const h = getISTHour();
  return (h >= 5 && h < 14) ? 'morning' : 'night';
}

// ============================================================
// FREE STEPS
// ============================================================
const FREE_STEPS = {
  morning: {
    allergic: `✅ Vataja-Kaphaja Pratishyaya 🌿
Type: Allergic Rhinosinusitis | Dosha: Vata + Kapha

Aaj ke 2 steps subah try karein — ek doosre ke complementary hain:

1️⃣ *Tulsi-Ginger Steam* — Subah uthte hi, khaana khaane se pehle
Ek bhagona paani mein 4-5 fresh tulsi patte + adha inch kuch adrak daalen. Ubaal lein, phir towel sar pe odh ke 8-10 min steam lein. Muh band, sirf naak se saans lein.

⏱️ 15-20 min baad —

2️⃣ *Saline Nasal Rinse*
1 cup gunguna paani + ½ tsp saindhav namak (sendha namak). Haath ki hatheli mein leke ek naak se kheenchein, doosri se bahar aane dein. Dono taraf.
Steam ne mucus dhila kiya — rinse usse bahar karta hai.

⚠️ Yeh steps aaj ke liye temporary surface relief hain. Allergy ka root — sensitized naak ki lining — sirf structured protocol se address hoti hai. Shaam ko zaroor batana — kuch fark mehsoos hua? 🙏`,

    congestive: `✅ Kaphaja Pratishyaya 🔵
Type: Congestive Sinusitis | Dosha: Kapha dominant

Aaj ke 2 steps subah try karein:

1️⃣ *Adrak-Saunth Steam* — khaali pet, uthte hi
Paani mein 1 inch kuchi adrak + ½ tsp saunth (dry ginger powder) daalen. Ubaal ke 10 min steam lein, towel sar pe. Balgam loose hoga andar se.

⏱️ 20-25 min baad —

2️⃣ *Warm Jal Neti / Saline Rinse*
1 cup gunguna paani + ½ tsp saindhav namak. Naak mein dono taraf rinse karein — gently, force nahi. Loose hua balgam bahar nikalega.

⚠️ Yeh sirf aaj ke liye temporary relief hai. Andar ki congestion ka source structured approach se hi address hota hai. Shaam ko batana zaroor — kitna fark aaya? 🙏`,

    heat: `✅ Pittaja Pratishyaya 🔥
Type: Inflammatory Sinusitis | Dosha: Pitta aggravation

Aaj ke 2 steps subah try karein:

1️⃣ *Dhaniya-Saunf Infusion* — khaali pet, subah uthke
1 tsp dhaniya (coriander seeds) + 1 tsp saunf ko raat bhar paani mein bhigo ke rakhein. Subah chhan ke thanda hi peeyein. Pitta ko andar se shant karta hai.

⏱️ 30-40 min baad khaana khaane ke baad —

2️⃣ *Ghee Nasya* (medicated nasal application)
Dono naak mein 1-1 boond pure desi ghee (garm nahi — room temp). 5 min bilkul still baith ke rakhein. Burning sensation aur inflammation mein seedha kaam karta hai.

⚠️ Yeh andar ki pitta vitiation ka root address nahi karti — sirf aaj ke liye relief hai. Shaam ko zaroor batana 🙏`,

    dependency: `✅ Dushta Pratishyaya ⚠️
Type: Chronic Rebound Sinusitis | Dosha: Vata + Srotas blockage

Aaj ke 2 steps subah try karein:

1️⃣ *Pre-Spray Steam Replacement*
Spray use karne se pehle 10 min steam karein — plain paani, koi additive nahi. Agar naak khul jaaye toh spray ki zaroorat na padhe. Agar padhe toh sirf ek naak mein — doosri naak open rahe.

⏱️ Dono ke beech minimum 30 min ka gap —

2️⃣ *Anu Taila / Desi Ghee Nasya*
Steam ke 30 min baad, dono naak mein 1-1 boond desi ghee ya anu taila (Ayurvedic nasal drops — easily available). Naak ki lining ko nourish karta hai — spray ki harshness se healing shuru hoti hai.

⚠️ Spray ne jo mucosal damage kiya hai — yeh ghee se thodi healing karta hai, lekin dependency todne ke liye structured protocol chahiye. Shaam ko zaroor batana 🙏`
  },
  night: {
    allergic: `✅ Vataja-Kaphaja Pratishyaya 🌿
Type: Allergic Rhinosinusitis | Dosha: Vata + Kapha

Aaj raat ke 2 steps try karein:

1️⃣ *Haldi-Ghee Nasal Protocol* — Khana khaane ke 1 hour baad
Ek cup garm doodh mein ½ tsp haldi + ½ tsp ghee milaen. Dhire dhire peeyein. Saath mein — dono naak mein 1-1 boond desi ghee nasya karein. Andar ki inflammation pe kaam karta hai.

⏱️ 45-60 min baad, sone se 20-30 min pehle —

2️⃣ *Sone se Pehle Steam*
4-5 tulsi patte paani mein, 8 min steam. Towel sar pe. Raat ko dustbits aur allergens naak mein settle hote hain — yeh flush karta hai. Steam ke baad seedha so jaayein, bahar hawa mein mat niklein.

⚠️ Yeh raat ke liye surface relief hai — allergy ki root cause waise ki waisi hai. Subah uthke zaroor batana — neend kaisi aayi, naak khuli thi ya band? 🙏`,

    congestive: `✅ Kaphaja Pratishyaya 🔵
Type: Congestive Sinusitis | Dosha: Kapha dominant

Aaj raat ke 2 steps try karein:

1️⃣ *Adrak-Haldi Kadha* — Raat ke khane ke 30-40 min baad
½ inch adrak + ½ tsp haldi + 1 cup paani — 5 min ubaalein. Thoda thanda karke peeyein. Balgam ko andar se loose karta hai overnight.

⏱️ 40-50 min baad, sone se 15-20 min pehle —

2️⃣ *Steam + Ghee Nasya*
10 min steam (towel sar pe). Phir 5 min baith ke — dono naak mein 1-1 boond desi ghee. Steam ne balgam dhila kiya, ghee nasal lining ko coat karta hai taki raat ko throat mein na girta rahe.

⚠️ Yeh sirf aaj raat ke liye temporary relief hai. Subah uthke naak ki condition zaroor batana 🙏`,

    heat: `✅ Pittaja Pratishyaya 🔥
Type: Inflammatory Sinusitis | Dosha: Pitta aggravation

Aaj raat ke 2 steps try karein:

1️⃣ *Cooling Drink Before Dinner*
Khana khaane se 20-30 min pehle — 1 glass room-temp nariyal paani ya saunf-dhaniya infusion (raat bhar bhigo ke). Fried, spicy, fermented khana aaj avoid karein — pitta raat ko badhta hai.

⏱️ Khana khaane ke 1 hour baad —

2️⃣ *Chandan-Ghee Nasya*
Dono naak mein 1-1 boond desi ghee. Sone se pehle 5 min bilkul still baith ke rakhein. Ghee cooling + anti-inflammatory hota hai — pitta-based burning pe seedha kaam karta hai.

⚠️ Yeh raat ke liye surface-level relief hai. Pitta ka root internally address karna padega. Subah kaise feel hua zaroor batana 🙏`,

    dependency: `✅ Dushta Pratishyaya ⚠️
Type: Chronic Rebound Sinusitis | Dosha: Vata + Srotas blockage

Aaj raat ke 2 steps try karein:

1️⃣ *Spray se Pehle Steam Trial*
Sone se pehle 10 min steam — plain paani. Naak kholne ki koshish spray ki jagah steam se karein. Agar zaroorat pad hi jaaye toh sirf ek naak, minimum amount.

⏱️ Steam ke 30-40 min baad —

2️⃣ *Ghee Nasya + Correct Sleeping Position*
Dono naak mein 1-1 boond desi ghee. Sone ki position: jis taraf naak zyada khuli ho — us taraf nahi, doosri taraf karwat lein. Gravity se dono naak ko equally breathe karne ka mauka milta hai.

⚠️ Spray dependency mein mucosal damage heal hone mein time lagta hai — yeh raat ke liye thodi madad hai. Subah zaroor batana — spray lena pada ya nahi? 🙏`
  }
};

// ============================================================
// ASSESSMENT INSIGHTS
// ============================================================
const DURATION_INSIGHT = {
  short: '📌 Short-term mein body abhi reactive phase mein hai — sahi approach se results zyada fast aate hain.',
  medium: '📌 6 mahine–1 saal mein pattern set hone lagta hai — structured intervention sahi time pe hai.',
  long: '📌 1–3 saal mein problem chronic hone ki taraf jaati hai — root cause pe kaam karna zaroori ho jaata hai.',
  verylong: '📌 3+ saal ki chronic condition mein repeated stress hua hai — deep protocol hi kaam karta hai.'
};

const TRIED_INSIGHT = {
  'kuch nahi': '📌 Abhi tak kuch try nahi kiya — body naturally respond karti hai structured approach se jab already medicated na ho.',
  allopathy: '📌 Allopathy symptoms suppress karti hai — inflammation temporarily thami, root cause waise ka waisa rehta hai. Isliye band karne pe symptoms wapas aate hain.',
  'nasal spray': '📌 Nasal spray naak ki lining constrict karti hai — temporary open hoti hai. Regular use se mucosal damage aur dependency badhti hai.',
  'sab try kiya': '📌 Root cause pe seedha kaam nahi hua isliye wapas aaya. Ayurvedic approach underlying imbalance pe kaam karti hai, sirf symptoms pe nahi.'
};

const SEVERITY_INSIGHT = {
  mild: '📌 Abhi flare mode mild hai — sahi time hai tackle karne ka before it becomes moderate.',
  moderate: '📌 Moderate impact matlab body already compensating kar rahi hai daily — structured intervention needed.',
  severe: '📌 Severe impact mein sleep, focus, energy sab affected — yeh sirf sinus nahi, quality of life issue hai.'
};

const SYMPTOM_INSIGHT = {
  congestive: '📌 Yeh Kaphaja Pratishyaya ka pattern hai — Kapha dosha vitiated hone se nasal passages mein ama accumulate hoti hai, srotas block hote hain. Subah zyada hona is ka classic sign hai.',
  allergic: '📌 Yeh Vataja-Kaphaja Pratishyaya hai — Vata aur Kapha dono vitiated hain. Sneezing Vata ka naak se bahar nikalna hai, watery discharge bhi Vata-Kapha imbalance ka sign.',
  heat: '📌 Yeh Pittaja Pratishyaya hai — Pitta dosha vitiated hone se nasal lining mein heat aur inflammation badh jaati hai. Yellow-green discharge aur burning Pitta aggravation ke clear signs hain.',
  dependency: '📌 Yeh Dushta Pratishyaya ka pattern hai — prolonged external substance se nasal mucosa ki natural functioning disturb ho gayi hai. Srotas chronically block hain, Vata movement irregular hai.'
};

// ============================================================
// FOLLOW-UP MESSAGE
// ============================================================
const SURFACE_MSG = `☝️ Yeh steps temporary relief ke liye hain — root cause pe kaam nahi karte.

Agar sinus baar baar aata hai ya months se chal raha hai — toh andar ka dosha imbalance address karna padega. Warna yeh cycle chalti rahegi 🔄

Aap batayein:
1️⃣ Haan, structured protocol dekhna hai
2️⃣ Pehle steps try karti/karta hun, baad mein bataungi/bataunga`;

// ============================================================
// FOLLOW-UP MESSAGES (24hr & 48hr)
// ============================================================
const FOLLOWUP_24HR = {
  allergic: `Hey 👋 Kal aapne assessment kiya tha na?

Steps try kiye? Kuch fark aaya? 🤔

Ek insight dein — allergic sinus mein naak ki lining har trigger ke saath aur sensitive hoti jaati hai. Matlab jitna late karein, utna zyada react karegi 📈

Typically jo log protocol follow karte hain — Day 5-6 tak sneezing noticeably kam hoti hai ✅

Agar ready hain — bas 1 ya 2 reply karein, kal se shuru 🙏
1 — ₹499 (7-day)
2 — ₹1,299 (14-day)`,

  congestive: `Hey 👋 Kal assessment hua tha na aapka?

Steam/rinse se kuch relief aaya? 🤔

Ek zaroori baat — congestion mein srotas (nasal channels) jitne din block rehte hain, utne zyada thick hote jaate hain. Recovery mein har din ka delay matter karta hai 📈

Typically protocol follow karne pe Day 3-4 se naak khulni start hoti hai ✅

Ready hain toh bas reply karein — kal se Day 1 🙏
1 — ₹499 (7-day)
2 — ₹1,299 (14-day)`,

  heat: `Hey 👋 Kal assessment hua tha aapka

Steps se kuch fark laga? 🤔

Ek important baat — Pitta-based inflammation aise nahi rukti, time ke saath surrounding areas mein failti hai. Jitni jaldi address karein, utna kam damage 📈

Protocol follow karne wale logon ko typically Week 1 mein clear reduction dikhta hai ✅

Shuru karna hai toh bas reply karein 🙏
1 — ₹499 (7-day)
2 — ₹1,299 (14-day)`,

  dependency: `Hey 👋 Kal assessment hua tha na aapka?

Steam try kiya? Spray thodi kam lagi? 🤔

Ek seedhi baat — har baar spray lagane se naak ki lining aur patli hoti jaati hai. Yeh dependency ka cycle hai — jitni jaldi todein, utna acha 📈

Protocol follow karne wale log typically 10-12 din mein spray significantly kam kar paate hain ✅

Ready hain toh bas reply karein 🙏
1 — ₹499 (7-day)
2 — ₹1,299 (14-day)`
};

const FOLLOWUP_48HR = {
  allergic: `🙏 Last message aapke liye —

Sochiye — har mahine ENT pe ₹500-800 jaate hain, medicines alag. Phir bhi mausam badle toh wapas shuru.

₹499 mein 7 din ka complete protocol milta hai — daily guidance ke saath. Aur ₹1,299 mein 14 din ka deep protocol jo root dosha imbalance pe kaam karta hai.

Iske baad hum aapko message nahi karenge ✋
Jab mann ho tab reply karein:
1 — ₹499 (7-day)
2 — ₹1,299 (14-day)
3 — Sachin Ji se baat`,

  congestive: `🙏 Last message aapke liye —

Monthly medicines pe ₹1,500-3,000 lagte hain — phir bhi naak band ki band. Kyunki wo sirf symptoms pe kaam karti hain, root cause pe nahi.

₹499 mein 7 din ka structured protocol. ₹1,299 mein 14 din ka deep protocol — dosha level pe kaam karta hai.

Iske baad hum aapko message nahi karenge ✋
Jab chahein reply karein:
1 — ₹499 (7-day)
2 — ₹1,299 (14-day)
3 — Sachin Ji se baat`,

  heat: `🙏 Last message aapke liye —

Inflammation jab tak andar se address nahi hoti — tablets se temporary suppress hoke wapas aati hai. Yahi cycle chal raha hai.

₹499 mein 7 din ka protocol. ₹1,299 mein 14 din ka deep protocol — Pitta dosha ko root se balance karta hai.

Iske baad hum message nahi karenge ✋
Jab ready hon reply karein:
1 — ₹499 (7-day)
2 — ₹1,299 (14-day)
3 — Sachin Ji se baat`,

  dependency: `🙏 Last message aapke liye —

Spray se naak khulti hai — lekin band karo toh double block. Yeh rebound cycle hai. Medicines isse nahi todti — naak ki lining ko heal karna padta hai.

₹499 mein 7 din ka protocol. ₹1,299 mein 14 din ka deep protocol — mucosal healing + spray withdrawal dono cover karta hai.

Iske baad hum message nahi karenge ✋
Jab chahein reply karein:
1 — ₹499 (7-day)
2 — ₹1,299 (14-day)
3 — Sachin Ji se baat`
};

// ============================================================
// DUAL PLAN PITCH
// ============================================================
function buildPlanMsg(sinusType) {
  const TYPE_LABEL_MAP = {
    allergic: 'Vataja-Kaphaja Pratishyaya | Allergic Rhinosinusitis | Dosha: Vata + Kapha',
    congestive: 'Kaphaja Pratishyaya | Congestive Sinusitis | Dosha: Kapha dominant',
    heat: 'Pittaja Pratishyaya | Inflammatory Sinusitis | Dosha: Pitta aggravation',
    dependency: 'Dushta Pratishyaya | Chronic Rebound Sinusitis | Dosha: Vata + Srotas'
  };
  const typeLabel = TYPE_LABEL_MAP[sinusType] || 'Pratishyaya';

  const INSIGHT = {
    allergic: '💡 Allergic sinus mein naak ki lining oversensitive ho jaati hai — har trigger pe react karti hai. Jab tak yeh sensitivity address nahi hoti, sneeze-runny nose ka cycle nahi rukega.',
    congestive: '💡 Congestive sinus mein srotas (nasal channels) mein kapha jamta jaata hai — jitna time jaaye, utna thick ho. Jab tak andar se saaf nahi hoga, naak khulegi nahi properly.',
    heat: '💡 Inflammatory sinus mein pitta dosha naak ki lining mein heat create karta hai — burning, yellow mucus, headache sab isi ka sign hai. Jab tak pitta balance nahi hoga, yeh repeat hota rahega.',
    dependency: '💡 Spray naak ki lining ko artificially constrict karti hai — temporary khulti hai, phir double block. Jab tak lining heal nahi hogi, spray chhutegi nahi.'
  };

  const insight = INSIGHT[sinusType] || INSIGHT.congestive;

  return `Aapka assessment complete hua ✅

*${typeLabel}*

${insight}

Aapke liye 2 protocols hain 👇

━━━━━━━━━━━━━━━━━━━━━

⚡ *PROTOCOL 1 — ₹499*
*7-Day Sinus Stabilization*

✔ Naya problem hai (6 months–1 saal)
✔ Pehli baar structured try karna hai
✔ Sirf 15-20 min daily

📅 7 din — roz clear steps
📲 Sachin Ji WhatsApp pe personally guide karenge
🌿 Ghar ke cheezein + herbal support

💰 Ek ENT visit = ₹500-800 sirf consultation
Yahan ₹499 mein 7 din ka poora protocol + daily guidance

━━━━━━━━━━━━━━━━━━━━━

🔥 *PROTOCOL 2 — ₹1,299*
*14-Day Deep Sinus Protocol*
⭐ Sabse zyada log yahi lete hain

✔ Purani problem — 1+ saal
✔ Spray/medicine pe depend hain
✔ Pehle try kiya — temporary hi raha
✔ Root cause se permanently theek karna hai

📅 14 din — subah + raat personalized routine
📊 Daily tracking — aapke progress ke saath adjust hota hai
🌿 Herbal support included + personalized
🩺 Dosha ke hisaab se diet guidance
📲 Sachin Ji se direct WhatsApp access

💰 Monthly medicines = ₹1,500-3,000 — phir bhi wapas aata hai
Yahan ₹1,299 mein root cause pe seedha kaam

━━━━━━━━━━━━━━━━━━━━━
         ₹499      |  ₹1,299
━━━━━━━━━━━━━━━━━━━━━
Din      7          |  14
Routine  1x/day     |  2x/day
Tracking Basic      |  Full
Herbal   Optional   |  Included
Diet     ✗          |  ✓
━━━━━━━━━━━━━━━━━━━━━

🕐 Aaj reply karein — kal subah Day 1 aapke WhatsApp pe

Bas number reply karein:
1 — ₹499 (7-day)
2 — ₹1,299 (14-day)
3 — Fark samjhna hai
4 — Sachin Ji se baat`;
}

// ============================================================
// HELPERS
// ============================================================
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
          to,
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
// AI FALLBACK
// ============================================================
async function getAIResponse(senderId, userText) {
  if (!CLAUDE_API_KEY) return null;
  const sinusType = userProfile[senderId]?.symptom || 'unknown';
  const stage = userState[senderId] || 'new';
  const TYPE_NAMES = {
    allergic: 'Vataja-Kaphaja Pratishyaya (Allergic Rhinosinusitis)',
    congestive: 'Kaphaja Pratishyaya (Congestive Sinusitis)',
    heat: 'Pittaja Pratishyaya (Inflammatory Sinusitis)',
    dependency: 'Dushta Pratishyaya (Chronic Rebound Sinusitis)'
  };
  const system = `Tu Ayusomam Herbals ka Ayurvedic sinus specialist hai. Hinglish mein jawab de — simple, warm, clinical. 2-3 lines max.
User ki sinus type: ${TYPE_NAMES[sinusType] || 'assessment pending'}
Current stage: ${stage}
Rules:
- Sirf sinus aur Ayurveda ke baare mein baat kar
- Protocol 1 (Rs.499, 7-day) aur Protocol 2 (Rs.1299, 14-day) offer kar sakte ho
- Off-topic ho toh politely redirect kar
- Kabhi bhi doosre brands ya allopathy recommend mat kar
- Payment links mat dena — sirf batana ki "1 ya 2 reply karo"`;

  if (!convHistory[senderId]) convHistory[senderId] = [];
  convHistory[senderId].push({ role: 'user', content: userText });
  if (convHistory[senderId].length > 10) convHistory[senderId] = convHistory[senderId].slice(-10);

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        system,
        messages: convHistory[senderId]
      })
    });
    const data = await res.json();
    const reply = data.content?.[0]?.text || null;
    if (reply) convHistory[senderId].push({ role: 'assistant', content: reply });
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
  if (state === 'human_takeover') return true;

  // ── NEW ──
  if (state === 'new') {
    if (!userProfile[senderId]) userProfile[senderId] = {};
    userState[senderId] = 'q1_duration';
    await updateLead(senderId, '🟡 Warm', 'assessment_started', '', '', '', 'Facebook');
    await sendFn(senderId,
      `Namaste 🙏 Ayusomam Herbals mein aapka swagat hai.\n\nSinus ki problem hai? Aap bilkul sahi jagah aaye hain ✅\n\nPehle aapki condition samajhte hain — 4 chhote sawaal hain, sirf 2 min lagenge.\n\nYeh problem kitne samay se hai?\n1️⃣ 1–6 mahine\n2️⃣ 6 mahine–1 saal\n3️⃣ 1–3 saal\n4️⃣ 3 saal se zyada\n\nBas number reply karein 👇`
    );
    return true;
  }

  // ── Q1: DURATION ──
  if (state === 'q1_duration') {
    const num = extractFirstNumber(text);
    const detected = detectDuration(text);
    const ans = detected || (num === 1 ? 'short' : num === 2 ? 'medium' : num >= 3 ? 'long' : null);
    if (!ans) {
      await sendFn(senderId, 'Thoda aur clearly batayein — kitne mahine ya saal se hai? 🙏');
      return true;
    }
    userProfile[senderId].duration = ans;
    userState[senderId] = 'q2_symptom';
    const dInsight = DURATION_INSIGHT[ans] || '';
    if (dInsight) await sendFn(senderId, dInsight);
    await sendFn(senderId,
      `Noted ✅\n\nAb batayein — sabse zyada kya hota hai?\n1️⃣ Naak band, chehra bhaari, pressure 😤\n2️⃣ Sneezing, runny nose, dust/mausam se trigger 🤧\n3️⃣ Burning, thick mucus, sar dard 🔥\n4️⃣ Nasal spray ke bina saans nahi aati 😰\n\nNumber reply karein 👇`
    );
    return true;
  }

  // ── Q2: SYMPTOM ──
  if (state === 'q2_symptom') {
    const num = extractFirstNumber(text);
    const detected = detectSymptom(text);
    const map = { 1: 'congestive', 2: 'allergic', 3: 'heat', 4: 'dependency' };
    const ans = detected || map[num] || null;
    if (!ans) {
      await sendFn(senderId, 'Apna main symptom batayein — ek number reply karein 🙏');
      return true;
    }
    userProfile[senderId].symptom = ans;
    userState[senderId] = 'q3_tried';
    const sInsight = SYMPTOM_INSIGHT[ans] || '';
    if (sInsight) await sendFn(senderId, sInsight);
    await sendFn(senderId,
      `Samajh aaya ✅\n\nIske liye pehle kuch try kiya?\n1️⃣ Nahi, kuch nahi kiya abhi tak\n2️⃣ Allopathy / antibiotic li\n3️⃣ Nasal spray use ki\n4️⃣ Sab try kiya — kuch permanent nahi hua 😔\n\nNumber reply karein 👇`
    );
    return true;
  }

  // ── Q3: TRIED ──
  if (state === 'q3_tried') {
    const num = extractFirstNumber(text);
    if (!num || num < 1 || num > 4) {
      await sendFn(senderId, '1 se 4 ke beech number reply karein 🙏');
      return true;
    }
    const map = { 1: 'kuch nahi', 2: 'allopathy', 3: 'nasal spray', 4: 'sab try kiya' };
    const triedVal = map[num];
    userProfile[senderId].tried = triedVal;
    userState[senderId] = 'q4_severity';
    const tInsight = TRIED_INSIGHT[triedVal] || '';
    if (tInsight) await sendFn(senderId, tInsight);
    await sendFn(senderId,
      `Last sawaal 👇\n\nDaily life mein kitna affect karta hai?\n1️⃣ Thoda — manage ho jaata hai\n2️⃣ Kaafi — regularly dikkat hoti hai 😣\n3️⃣ Bahut zyada — neend, kaam, sab affected 😫\n\nNumber reply karein 👇`
    );
    return true;
  }

  // ── Q4: SEVERITY → FREE STEPS ──
  if (state === 'q4_severity') {
    const num = extractFirstNumber(text);
    if (!num || num < 1 || num > 3) {
      await sendFn(senderId, '1, 2 ya 3 reply karein 🙏');
      return true;
    }
    const sevVal = { 1: 'mild', 2: 'moderate', 3: 'severe' }[num];
    userProfile[senderId].severity = sevVal;
    const sevInsight = SEVERITY_INSIGHT[sevVal] || '';
    if (sevInsight) await sendFn(senderId, sevInsight);
    const type = userProfile[senderId].symptom || 'congestive';
    const timing = getTimeSlot();
    userProfile[senderId].freeStepTiming = timing;
    await updateLead(senderId, '🔴 Hot', 'assessment_complete', type, '', '', 'Facebook');
    userState[senderId] = 'after_steps';
    const stepMsg = (FREE_STEPS[timing] && FREE_STEPS[timing][type]) || FREE_STEPS[timing]['congestive'];
    await sendFn(senderId, stepMsg);
    await sendFn(senderId, SURFACE_MSG);
    return true;
  }

  // ── AFTER STEPS ──
  if (state === 'after_steps') {
    const t = text.toLowerCase().trim();
    const wantsTry = t === '2' || t.match(/pehle|try|baad|steps/);
    if (wantsTry) {
      userState[senderId] = 'try_first';
      await updateLead(senderId, '🟡 Warm', 'try_first', userProfile[senderId].symptom, '', '', 'Facebook');
      followUpTracker[senderId] = { pitchedAt: Date.now(), followUp1Sent: false, followUp2Sent: false, platform: userProfile[senderId].platform || 'facebook' };
      await sendFn(senderId, `Bilkul 🙏 Steps try karein — subah aur raat dono.\n\nKuch bhi sawaal ho ya result share karna ho — yahan reply karein.\n\nJab ready ho tab protocol ke liye batayein.`);
      return true;
    }
    userState[senderId] = 'pitched';
    const sinusType = userProfile[senderId].symptom || 'congestive';
    await updateLead(senderId, '🔴 Hot', 'plans_shown', sinusType, '', '', 'Facebook');
    followUpTracker[senderId] = { pitchedAt: Date.now(), followUp1Sent: false, followUp2Sent: false, platform: userProfile[senderId].platform || 'facebook' };
    await sendFn(senderId, buildPlanMsg(sinusType));
    return true;
  }

  // ── PLAN SELECTION ──
  if (state === 'pitched') {
    const t = text.toLowerCase().trim();

    // Protocol 1
    if (t === '1' || t.match(/\b499\b|protocol 1|plan 1/)) {
      userState[senderId] = 'plan_selected';
      delete followUpTracker[senderId];
      await updateLead(senderId, '🔴 Hot', 'protocol_1_selected', userProfile[senderId]?.symptom, '', '', 'Facebook');
      await sendFn(senderId,
        `Sahi decision 🙏\n\nPayment link:\n${PAYMENT_499}\n\nPayment ke baad screenshot yahan bhejein.\n\nAyusomam Herbals 🌿`
      );
      return true;
    }

    // Protocol 2
    if (t === '2' || t.match(/\b1299\b|protocol 2|plan 2/)) {
      userState[senderId] = 'plan_selected';
      delete followUpTracker[senderId];
      await updateLead(senderId, '🔴 Hot', 'protocol_2_selected', userProfile[senderId]?.symptom, '', '', 'Facebook');
      await sendFn(senderId,
        `Bahut achha 🙏\n\nPayment link:\n${PAYMENT_1299}\n\nPayment ke baad screenshot yahan bhejein.\n\nAyusomam Herbals 🌿`
      );
      return true;
    }

    // Difference
    if (t === '3' || t.match(/kaun sa|fark|difference|confused|dono mein|samajh/)) {
      await sendFn(senderId,
        `Key difference:\n\nProtocol 1 — 7 din, ek time daily, acute/new cases. Body ko stabilize karna goal.\n\nProtocol 2 — 14 din, subah + raat dono, chronic/old ya spray dependent cases. Root dosha imbalance address karna goal.\n\nDono fundamentally alag hain — ek ka extension nahi.\n\nSeedha batayein — 1 ya 2?`
      );
      return true;
    }

    // Specialist
    if (t === '4' || t.match(/specialist|sachin|baat|call/)) {
      userState[senderId] = 'human_takeover';
      await updateLead(senderId, '🔴 Hot', 'requested_specialist', userProfile[senderId]?.symptom, '', '', 'Facebook');
      await sendFn(senderId,
        `Bilkul 🙏 Sachin Ji personally baat karenge.\n📱 ${WHATSAPP_NUM}\n\nAyusomam Herbals 🌿`
      );
      return true;
    }

    await sendFn(senderId,
      `Reply karein:\n1 — Protocol 1 (Rs.499)\n2 — Protocol 2 (Rs.1,299)\n3 — Dono mein kya fark hai?\n4 — Specialist se baat 🙏`
    );
    return true;
  }

  // ── POST PAYMENT ──
  if (state === 'plan_selected' || state === 'done' || state === 'try_first') {
    await sendFn(senderId, `Kisi bhi madad ke liye seedha WhatsApp karein:\n📱 ${WHATSAPP_NUM}\nAyusomam Herbals 🌿`);
    return true;
  }

  return false;
}

// ============================================================
// MAIN PROCESSOR
// ============================================================
async function processMessage(senderId, text, sendFn, platform) {
  if (userState[senderId] === 'human_takeover') {
    console.log(`SILENT — human takeover: ${senderId}`);
    return;
  }

  console.log(`[${platform}] ${senderId}: ${text}`);
  if (!userProfile[senderId]) userProfile[senderId] = {};
  userProfile[senderId].platform = platform === 'WhatsApp' ? 'whatsapp' : 'facebook';
  const t = text.toLowerCase();
  const state = userState[senderId] || 'new';

  // Payment query intercept
  const isPaymentQuery = t.match(/payment|kaise karu|kitna hai|price|cost|1299|499|buy|lena hai|link do|gpay|phonepe|paytm|order/);
  if (isPaymentQuery && (state === 'pitched' || state === 'after_steps' || state === 'plan_selected')) {
    await sendFn(senderId,
      `Payment links:\n\nProtocol 1 (Rs.499) — 7 din:\n${PAYMENT_499}\n\nProtocol 2 (Rs.1,299) — 14 din:\n${PAYMENT_1299}\n\nPayment ke baad screenshot bhejein 🙏`
    );
    return;
  }

  // WhatsApp contact
  if (t.match(/whatsapp|watsapp|contact|call|seedha baat/)) {
    await sendFn(senderId, `Seedha baat karein:\n📱 ${WHATSAPP_NUM}\n\nAyusomam Herbals 🌿`);
    return;
  }

  const handled = await handleRuleBased(senderId, text, sendFn);
  if (!handled) {
    const aiReply = await getAIResponse(senderId, text);
    if (aiReply) {
      await sendFn(senderId, aiReply);
    } else {
      await sendFn(senderId, `Sachin Ji se seedha baat karein:\n📱 ${WHATSAPP_NUM}\n\nAyusomam Herbals 🌿`);
    }
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
          await processMessage(from, text, sendWAMessage, 'WhatsApp');
        }
      }
    }
  } catch (e) {
    console.error('WA webhook error:', e.message);
  }
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
      const expectedSig = crypto
        .createHmac('sha256', RAZORPAY_WEBHOOK_SECRET)
        .update(rawBody)
        .digest('hex');
      if (expectedSig !== signature) {
        console.error('❌ Razorpay signature mismatch');
        return;
      }
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
          timestamp: new Date().toISOString(),
          platform: 'Razorpay',
          senderId: phone || email,
          name,
          message: `PAID ₹${amount} | Order: ${orderId}`,
          temperature: '✅ Paid',
          lastStage: 'payment_complete',
          symptom: '',
          email,
          orderId,
          amount: `₹${amount}`
        })
      });
    }

    if (phone && WHATSAPP_TOKEN && WHATSAPP_PHONE_ID) {
      const waPhone = `91${phone}`;
      await sendWAMessage(waPhone,
        `✅ *Payment Confirmed!*\n\nOrder ID: ${orderId}\nAmount: ₹${amount}\n\n*${name} Ji, aapka order register ho gaya hai.* 🙏\n\nKal subah tak aapko Day 1 protocol milega.\n\n— *Sachin, Ayusomam Herbals* 🌿`
      );
      setTimeout(async () => {
        await sendWAMessage(waPhone,
          `Namaskar *${name} Ji* 🙏\n\nAapne sahi decision liya.\n\nAbhi ke liye ek kaam: subah uthke 1 glass gunguna paani peeyein — khaali pet.\n\nKal main personally aapka Day 1 routine bhejunga. 🌿`
        );
      }, 8000);
    }
  } catch (e) {
    console.error('Razorpay webhook error:', e.message);
  }
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
  } else {
    res.status(400).json({ error: 'action must be BOT_ON or BOT_OFF' });
  }
});

// ============================================================
// WEBSITE CHATBOT LEAD ENDPOINT
// ============================================================
app.post('/website-lead', async (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  try {
    const { name, phone, sinusType, stage, message } = req.body;
    const senderId = phone ? `WEB_${String(phone).replace(/\D/g, '')}` : `WEB_${Date.now()}`;
    console.log(`WEBSITE LEAD: ${name} | ${phone} | ${sinusType} | ${stage}`);
    await updateLead(
      senderId, '🟡 Warm', stage || 'website_chat', sinusType || '',
      name || 'Website Visitor',
      (name ? name + ' — ' : '') + (sinusType || 'website lead'),
      'Website'
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
// FOLLOW-UP ENGINE (runs every 30 min)
// ============================================================
const HOUR_24 = 24 * 60 * 60 * 1000;
const HOUR_48 = 48 * 60 * 60 * 1000;

setInterval(async () => {
  const now = Date.now();
  for (const [userId, tracker] of Object.entries(followUpTracker)) {
    const state = userState[userId];
    const sinusType = userProfile[userId]?.symptom || 'congestive';
    const sendFn = tracker.platform === 'whatsapp' ? sendWAMessage : sendMessage;

    // Skip if user already converted or in human takeover
    if (['plan_selected', 'done', 'human_takeover'].includes(state)) {
      delete followUpTracker[userId];
      continue;
    }

    const elapsed = now - tracker.pitchedAt;

    // 24hr follow-up
    if (!tracker.followUp1Sent && elapsed >= HOUR_24) {
      const msg = FOLLOWUP_24HR[sinusType] || FOLLOWUP_24HR.congestive;
      await sendFn(userId, msg);
      tracker.followUp1Sent = true;
      await updateLead(userId, '🟡 Warm', 'followup_24hr', sinusType, '', '', tracker.platform);
      console.log(`📩 24hr follow-up sent: ${userId} [${tracker.platform}]`);
    }

    // 48hr follow-up
    if (!tracker.followUp2Sent && elapsed >= HOUR_48) {
      const msg = FOLLOWUP_48HR[sinusType] || FOLLOWUP_48HR.congestive;
      await sendFn(userId, msg);
      tracker.followUp2Sent = true;
      await updateLead(userId, '🟡 Warm', 'followup_48hr_final', sinusType, '', '', tracker.platform);
      console.log(`📩 48hr final follow-up sent: ${userId} [${tracker.platform}]`);
      // Remove after last follow-up
      delete followUpTracker[userId];
    }
  }
}, 30 * 60 * 1000); // Check every 30 minutes

// ============================================================
// START
// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ayusomam Herbals Bot v3 — Running
Port      : ${PORT}
Mode      : ✅ Rule-Based (Strict)
Facebook  : /webhook
WhatsApp  : /whatsapp
Razorpay  : /razorpay-webhook
Website   : /website-lead
Plans     : ₹499 (P1) + ₹1,299 (P2)
Follow-up : ✅ 24hr + 48hr auto (every 30 min check)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);
});
