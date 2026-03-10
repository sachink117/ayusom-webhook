import React, { useState, useRef, useEffect } from 'react';

// ── CONFIG ──
const RENDER_URL = "https://bot.ayusomamherbals.com/website-lead";
const PAYMENT_1299 = 'https://rzp.io/rzp/qu8zhQT';
const PAYMENT_499 = 'https://rzp.io/rzp/Re2W26iX';
const WHATSAPP_NUM = '+91 85951 60713';
const WHATSAPP_LINK = 'https://wa.me/918595160713';

// ── SINUS TYPE LABELS ──
const TYPE_LABEL = {
  allergic: 'Vataja-Kaphaja Pratishyaya | Allergic Rhinosinusitis | Dosha: Vata + Kapha',
  congestive: 'Kaphaja Pratishyaya | Congestive Sinusitis | Dosha: Kapha dominant',
  heat: 'Pittaja Pratishyaya | Inflammatory Sinusitis | Dosha: Pitta aggravation',
  dependency: 'Dushta Pratishyaya | Chronic Rebound Sinusitis | Dosha: Vata + Srotas'
};

// ── PLAN DETAILS BY TYPE ──
const PLAN_DETAILS_BY_TYPE = {
  allergic: "💡 Allergic sinus mein naak ki lining oversensitive ho jaati hai - har trigger pe react karti hai. Jab tak yeh sensitivity address nahi hoti, sneeze-runny nose ka cycle nahi rukega.",
  congestive: "💡 Congestive sinus mein srotas (nasal channels) mein kapha jamta jaata hai - jitna time jaaye, utna thick ho. Jab tak andar se saaf nahi hoga, naak khulegi nahi properly.",
  heat: "💡 Inflammatory sinus mein pitta dosha naak ki lining mein heat create karta hai - burning, yellow mucus, headache sab isi ka sign hai. Jab tak pitta balance nahi hoga, yeh repeat hota rahega.",
  dependency: "💡 Spray naak ki lining ko artificially constrict karti hai - temporary khulti hai, phir double block. Jab tak lining heal nahi hogi, spray chhutegi nahi."
};

// ── DURATION INSIGHTS ──
const DURATION_INSIGHT = {
  short: '📌 Short-term mein body abhi reactive phase mein hai - sahi approach se results zyada fast aate hain.',
  medium: '📌 6 mahine-1 saal mein pattern set hone lagta hai - structured intervention sahi time pe hai.',
  long: '📌 1-3 saal mein problem chronic hone ki taraf jaati hai - root cause pe kaam karna zaroori ho jaata hai.',
  verylong: '📌 3+ saal ki chronic condition mein repeated stress hua hai - deep protocol hi kaam karta hai.'
};

// ── SYMPTOM INSIGHTS ──
const SYMPTOM_INSIGHT = {
  congestive: '📌 Yeh Kaphaja Pratishyaya ka pattern hai - Kapha dosha vitiated hone se nasal passages mein ama accumulate hoti hai, srotas block hote hain. Subah zyada hona is ka classic sign hai.',
  allergic: '📌 Yeh Vataja-Kaphaja Pratishyaya hai - Vata aur Kapha dono vitiated hain. Sneezing Vata ka naak se bahar nikalna hai, watery discharge bhi Vata-Kapha imbalance ka sign.',
  heat: '📌 Yeh Pittaja Pratishyaya hai - Pitta dosha vitiated hone se nasal lining mein heat aur inflammation badh jaati hai. Yellow-green discharge aur burning Pitta aggravation ke clear signs hain.',
  dependency: '📌 Yeh Dushta Pratishyaya ka pattern hai - prolonged external substance se nasal mucosa ki natural functioning disturb ho gayi hai. Srotas chronically block hain, Vata movement irregular hai.'
};

// ── TRIED INSIGHTS ──
const TRIED_INSIGHT = {
  'kuch nahi': '📌 Abhi tak kuch try nahi kiya - body naturally respond karti hai structured approach se jab already medicated na ho.',
  allopathy: '📌 Allopathy symptoms suppress karti hai - inflammation temporarily thami, root cause waise ka waisa rehta hai. Isliye band karne pe symptoms wapas aate hain.',
  'nasal spray': '📌 Nasal spray naak ki lining constrict karti hai - temporary open hoti hai. Regular use se mucosal damage aur dependency badhti hai.',
  'sab try kiya': '📌 Root cause pe seedha kaam nahi hua isliye wapas aaya. Ayurvedic approach underlying imbalance pe kaam karti hai, sirf symptoms pe nahi.'
};

// ── SEVERITY INSIGHTS ──
const SEVERITY_INSIGHT = {
  mild: '📌 Abhi flare mode mild hai - sahi time hai tackle karne ka before it becomes moderate.',
  moderate: '📌 Moderate impact matlab body already compensating kar rahi hai daily - structured intervention needed.',
  severe: '📌 Severe impact mein sleep, focus, energy sab affected - yeh sirf sinus nahi, quality of life issue hai.'
};

// ── FREE STEPS ──
function getTimeSlot() {
  const now = new Date();
  const istHour = (now.getUTCHours() + 5 + Math.floor((now.getUTCMinutes() + 30) / 60)) % 24;
  return (istHour >= 5 && istHour < 14) ? 'morning' : 'night';
}

const FREE_STEPS = {
  morning: {
    allergic: `✅ Vataja-Kaphaja Pratishyaya 🌿
Type: Allergic Rhinosinusitis | Dosha: Vata + Kapha

Aaj ke 2 steps subah try karein - ek doosre ke complementary hain:

1. *Tulsi-Ginger Steam* - Subah uthte hi, khaana khaane se pehle
Ek bhagona paani mein 4-5 fresh tulsi patte + adha inch kuch adrak daalen. Ubaal lein, phir towel sar pe odh ke 8-10 min steam lein. Muh band, sirf naak se saans lein.

⏱ 15-20 min baad -

2. *Saline Nasal Rinse*
1 cup gunguna paani + 1/2 tsp saindhav namak (sendha namak). Haath ki hatheli mein leke ek naak se kheenchein, doosri se bahar aane dein. Dono taraf.
Steam ne mucus dhila kiya - rinse usse bahar karta hai.

⚠ Yeh steps aaj ke liye temporary surface relief hain. Allergy ka root - sensitized naak ki lining - sirf structured protocol se address hoti hai. Shaam ko zaroor batana - kuch fark mehsoos hua? 🙏`,

    congestive: `✅ Kaphaja Pratishyaya 🔵
Type: Congestive Sinusitis | Dosha: Kapha dominant

Aaj ke 2 steps subah try karein:

1. *Adrak-Saunth Steam* - khaali pet, uthte hi
Paani mein 1 inch kuchi adrak + 1/2 tsp saunth (dry ginger powder) daalen. Ubaal ke 10 min steam lein, towel sar pe. Balgam loose hoga andar se.

⏱ 20-25 min baad -

2. *Warm Jal Neti / Saline Rinse*
1 cup gunguna paani + 1/2 tsp saindhav namak. Naak mein dono taraf rinse karein - gently, force nahi. Loose hua balgam bahar nikalega.

⚠ Yeh sirf aaj ke liye temporary relief hai. Andar ki congestion ka source structured approach se hi address hota hai. Shaam ko batana zaroor - kitna fark aaya? 🙏`,

    heat: `✅ Pittaja Pratishyaya 🔥
Type: Inflammatory Sinusitis | Dosha: Pitta aggravation

Aaj ke 2 steps subah try karein:

1. *Dhaniya-Saunf Infusion* - khaali pet, subah uthke
1 tsp dhaniya (coriander seeds) + 1 tsp saunf ko raat bhar paani mein bhigo ke rakhein. Subah chhan ke thanda hi peeyein. Pitta ko andar se shant karta hai.

⏱ 30-40 min baad khaana khaane ke baad -

2. *Ghee Nasya* (medicated nasal application)
Dono naak mein 1-1 boond pure desi ghee (garm nahi - room temp). 5 min bilkul still baith ke rakhein. Burning sensation aur inflammation mein seedha kaam karta hai.

⚠ Yeh andar ki pitta vitiation ka root address nahi karti - sirf aaj ke liye relief hai. Shaam ko zaroor batana 🙏`,

    dependency: `✅ Dushta Pratishyaya ⚠
Type: Chronic Rebound Sinusitis | Dosha: Vata + Srotas blockage

Aaj ke 2 steps subah try karein:

1. *Pre-Spray Steam Replacement*
Spray use karne se pehle 10 min steam karein - plain paani, koi additive nahi. Agar naak khul jaaye toh spray ki zaroorat na padhe. Agar padhe toh sirf ek naak mein - doosri naak open rahe.

⏱ Dono ke beech minimum 30 min ka gap -

2. *Anu Taila / Desi Ghee Nasya*
Steam ke 30 min baad, dono naak mein 1-1 boond desi ghee ya anu taila (Ayurvedic nasal drops - easily available). Naak ki lining ko nourish karta hai - spray ki harshness se healing shuru hoti hai.

⚠ Spray ne jo mucosal damage kiya hai - yeh ghee se thodi healing karta hai, lekin dependency todne ke liye structured protocol chahiye. Shaam ko zaroor batana 🙏`
  },
  night: {
    allergic: `✅ Vataja-Kaphaja Pratishyaya 🌿
Type: Allergic Rhinosinusitis | Dosha: Vata + Kapha

Aaj raat ke 2 steps try karein:

1. *Haldi-Ghee Nasal Protocol* - Khana khaane ke 1 hour baad
Ek cup garm doodh mein 1/2 tsp haldi + 1/2 tsp ghee milaen. Dhire dhire peeyein. Saath mein - dono naak mein 1-1 boond desi ghee nasya karein. Andar ki inflammation pe kaam karta hai.

⏱ 45-60 min baad, sone se 20-30 min pehle -

2. *Sone se Pehle Steam*
4-5 tulsi patte paani mein, 8 min steam. Towel sar pe. Raat ko dustbits aur allergens naak mein settle hote hain - yeh flush karta hai. Steam ke baad seedha so jaayein, bahar hawa mein mat niklein.

⚠ Yeh raat ke liye surface relief hai - allergy ki root cause waise ki waisi hai. Subah uthke zaroor batana - neend kaisi aayi, naak khuli thi ya band? 🙏`,

    congestive: `✅ Kaphaja Pratishyaya 🔵
Type: Congestive Sinusitis | Dosha: Kapha dominant

Aaj raat ke 2 steps try karein:

1. *Adrak-Haldi Kadha* - Raat ke khane ke 30-40 min baad
1/2 inch adrak + 1/2 tsp haldi + 1 cup paani - 5 min ubaalein. Thoda thanda karke peeyein. Balgam ko andar se loose karta hai overnight.

⏱ 40-50 min baad, sone se 15-20 min pehle -

2. *Steam + Ghee Nasya*
10 min steam (towel sar pe). Phir 5 min baith ke - dono naak mein 1-1 boond desi ghee. Steam ne balgam dhila kiya, ghee nasal lining ko coat karta hai taki raat ko throat mein na girta rahe.

⚠ Yeh sirf aaj raat ke liye temporary relief hai. Subah uthke naak ki condition zaroor batana 🙏`,

    heat: `✅ Pittaja Pratishyaya 🔥
Type: Inflammatory Sinusitis | Dosha: Pitta aggravation

Aaj raat ke 2 steps try karein:

1. *Cooling Drink Before Dinner*
Khana khaane se 20-30 min pehle - 1 glass room-temp nariyal paani ya saunf-dhaniya infusion (raat bhar bhigo ke). Fried, spicy, fermented khana aaj avoid karein - pitta raat ko badhta hai.

⏱ Khana khaane ke 1 hour baad -

2. *Chandan-Ghee Nasya*
Dono naak mein 1-1 boond desi ghee. Sone se pehle 5 min bilkul still baith ke rakhein. Ghee cooling + anti-inflammatory hota hai - pitta-based burning pe seedha kaam karta hai.

⚠ Yeh raat ke liye surface-level relief hai. Pitta ka root internally address karna padega. Subah kaise feel hua zaroor batana 🙏`,

    dependency: `✅ Dushta Pratishyaya ⚠
Type: Chronic Rebound Sinusitis | Dosha: Vata + Srotas blockage

Aaj raat ke 2 steps try karein:

1. *Spray se Pehle Steam Trial*
Sone se pehle 10 min steam - plain paani. Naak kholne ki koshish spray ki jagah steam se karein. Agar zaroorat pad hi jaaye toh sirf ek naak, minimum amount.

⏱ Steam ke 30-40 min baad -

2. *Ghee Nasya + Correct Sleeping Position*
Dono naak mein 1-1 boond desi ghee. Sone ki position: jis taraf naak zyada khuli ho - us taraf nahi, doosri taraf karwat lein. Gravity se dono naak ko equally breathe karne ka mauka milta hai.

⚠ Spray dependency mein mucosal damage heal hone mein time lagta hai - yeh raat ke liye thodi madad hai. Subah zaroor batana - spray lena pada ya nahi? 🙏`
  }
};

// ── BUILD PLAN PITCH MESSAGE ──
function buildPlanMsg(sinusType) {
  const typeLabel = TYPE_LABEL[sinusType] || 'Pratishyaya';
  const insight = PLAN_DETAILS_BY_TYPE[sinusType] || PLAN_DETAILS_BY_TYPE.congestive;

  return `Aapka assessment complete hua ✅

${typeLabel}

${insight}

Aapke liye 2 protocols hain 👇

---------------------

⚡ *PROTOCOL 1 - Rs.499*
7-Day Sinus Stabilization

✔ Naya problem hai (6 months-1 saal)
✔ Pehli baar structured try karna hai
✔ Sirf 15-20 min daily

📅 7 din - roz clear steps
📲 Sachin Ji WhatsApp pe personally guide karenge
🌿 Ghar ke cheezein + herbal support

💰 Ek ENT visit = Rs.500-800 sirf consultation
Yahan Rs.499 mein 7 din ka poora protocol + daily guidance

---------------------

🔥 *PROTOCOL 2 - Rs.1,299*
14-Day Deep Sinus Protocol
⭐ Sabse zyada log yahi lete hain

✔ Purani problem - 1+ saal
✔ Spray/medicine pe depend hain
✔ Pehle try kiya - temporary hi raha
✔ Root cause se permanently theek karna hai

📅 14 din - subah + raat personalized routine
📊 Daily tracking - aapke progress ke saath adjust hota hai
🌿 Herbal support included + personalized
🩺 Dosha ke hisaab se diet guidance
📲 Sachin Ji se direct WhatsApp access

💰 Monthly medicines = Rs.1,500-3,000 - phir bhi wapas aata hai
Yahan Rs.1,299 mein root cause pe seedha kaam

---------------------
         Rs.499      |  Rs.1,299
---------------------
Din      7          |  14
Routine  1x/day     |  2x/day
Tracking Basic      |  Full
Herbal   Optional   |  Included
Diet     ✗          |  ✓
---------------------

🕐 Aaj reply karein - kal subah Day 1 aapke WhatsApp pe`;
}

// ── SURFACE MESSAGE ──
const SURFACE_MSG = `☝ Yeh steps temporary relief ke liye hain - root cause pe kaam nahi karte.

Agar sinus baar baar aata hai ya months se chal raha hai - toh andar ka dosha imbalance address karna padega. Warna yeh cycle chalti rahegi 🔄

Aap batayein:`;

const SURFACE_OPTIONS = [
  "Haan, structured protocol dekhna hai",
  "Pehle steps try karti/karta hun, baad mein bataungi/bataunga"
];

// ── SEND LEAD TO BACKEND ──
async function sendLead(data) {
  try {
    await fetch(RENDER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  } catch (e) {
    console.error('Lead send error:', e);
  }
}

// ── TRANSLATE VIA BACKEND ──
const TRANSLATE_URL = 'https://bot.ayusomamherbals.com/translate';
async function translateText(text, lang) {
  if (!lang || lang === 'hinglish') return text;
  try {
    const r = await fetch(TRANSLATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, lang })
    });
    const data = await r.json();
    return data.translated || text;
  } catch (e) {
    return text;
  }
}

async function translateOptions(opts, lang) {
  if (!lang || lang === 'hinglish') return opts;
  const results = await Promise.all(opts.map(o => translateText(o, lang)));
  return results;
}

// ── MAIN COMPONENT ──
export default function AIChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [stage, setStage] = useState('init');
  const [answers, setAnswers] = useState({});
  const [lang, setLang] = useState('hinglish');
  const langRef = useRef('hinglish');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const initialized = useRef(false);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Add bot message with typing delay + auto-translate
  const addBotMessage = async (text, options = null, delay = 600) => {
    setIsTyping(true);
    const curLang = langRef.current;
    const [translatedText, translatedOpts] = await Promise.all([
      translateText(text, curLang),
      options ? translateOptions(options, curLang) : Promise.resolve(null)
    ]);
    return new Promise((resolve) => {
      setTimeout(() => {
        setIsTyping(false);
        setMessages(prev => [...prev, { sender: 'bot', text: translatedText, options: translatedOpts }]);
        resolve();
      }, delay);
    });
  };

  // Add multiple bot messages sequentially
  const addBotMessages = async (msgs) => {
    for (let i = 0; i < msgs.length; i++) {
      const msg = msgs[i];
      const delay = i === 0 ? 600 : 800;
      await addBotMessage(msg.text, msg.options || null, delay);
    }
  };

  // Initialize chat on first open
  const handleOpen = async () => {
    setIsOpen(true);
    if (!initialized.current) {
      initialized.current = true;
      sendLead({ stage: 'chat_opened', sinusType: '', name: '', phone: '' });
      setStage('select_lang');
      // Language selection - don't translate this one
      setIsTyping(true);
      setTimeout(() => {
        setIsTyping(false);
        setMessages(prev => [...prev, {
          sender: 'bot',
          text: "Namaste 🙏 Ayusomam Herbals mein aapka swagat hai.\n\nApni language choose karein / Choose your language:",
          options: [
            "Hinglish (Hindi-English)",
            "English",
            "हिंदी (Hindi)",
            "తెలుగు (Telugu)",
            "தமிழ் (Tamil)",
            "ಕನ್ನಡ (Kannada)"
          ]
        }]);
      }, 600);
    }
  };

  // Process user response
  const handleUserMessage = async (text) => {
    // Add user message
    setMessages(prev => [...prev, { sender: 'user', text }]);
    setInput('');

    const t = text.toLowerCase().trim();

    // ── LANGUAGE SELECTION ──
    if (stage === 'select_lang') {
      let selectedLang = 'hinglish';
      if (t.includes('english') && !t.includes('hindi')) selectedLang = 'english';
      else if (t.includes('हिंदी') || t.includes('hindi)')) selectedLang = 'hindi';
      else if (t.includes('తెలుగు') || t.includes('telugu')) selectedLang = 'telugu';
      else if (t.includes('தமிழ்') || t.includes('tamil')) selectedLang = 'tamil';
      else if (t.includes('ಕನ್ನಡ') || t.includes('kannada')) selectedLang = 'kannada';
      else if (t.includes('hinglish')) selectedLang = 'hinglish';

      setLang(selectedLang);
      langRef.current = selectedLang;
      setStage('q1_duration');
      await addBotMessage(
        "Sinus ki problem hai? Aap bilkul sahi jagah aaye hain ✅\n\nHum aapki condition ka FREE Ayurvedic assessment karenge - sirf 2 min lagenge.\n\nYeh problem kitne samay se hai?",
        [
          "1-6 mahine",
          "6 mahine-1 saal",
          "1-3 saal",
          "3 saal se zyada"
        ]
      );
      return;
    }

    // ── Q1: DURATION ──
    if (stage === 'q1_duration') {
      let duration = null;
      if (t.includes('1') && !t.includes('3') && (t.includes('6') || t.includes('mahine') || t.includes('month'))) duration = 'short';
      else if (t === '1' || t.includes('1-6') || t.includes('1-6')) duration = 'short';
      else if (t === '2' || t.includes('6 mahine') || t.includes('1 saal')) duration = 'medium';
      else if (t === '3' || t.includes('1-3') || t.includes('1-3') || t.includes('2 saal') || t.includes('3 saal')) duration = 'long';
      else if (t === '4' || t.includes('zyada') || t.includes('3+') || t.includes('bahut') || t.includes('bachpan')) duration = 'verylong';
      else {
        // Try to detect from text
        if (t.match(/bachpan|janam|decade|bahut purani/)) duration = 'verylong';
        else if (t.match(/\b(3|4|5|6|7|8|9|10|15|20)\s*(year|sal|saal)\b/) || t.match(/teen|paanch|char|saalon|years/)) duration = 'long';
        else if (t.match(/1 year|2 year|1 saal|2 saal|do saal|ek saal/)) duration = 'medium';
        else if (t.match(/6 month|6 mahine|kuch mahine|naya|abhi|recent/)) duration = 'short';
      }

      if (!duration) {
        await addBotMessage('Thoda aur clearly batayein - kitne mahine ya saal se hai? 🙏', [
          "1-6 mahine",
          "6 mahine-1 saal",
          "1-3 saal",
          "3 saal se zyada"
        ]);
        return;
      }

      const newAnswers = { ...answers, duration };
      setAnswers(newAnswers);
      setStage('q2_symptom');

      const msgs = [];
      const dInsight = DURATION_INSIGHT[duration];
      if (dInsight) msgs.push({ text: dInsight });
      msgs.push({
        text: "Noted ✅\n\nAb batayein - sabse zyada kya hota hai?",
        options: [
          "Naak band, chehra bhaari, pressure 😤",
          "Sneezing, runny nose, dust/mausam se trigger 🤧",
          "Burning, thick mucus, sar dard 🔥",
          "Nasal spray ke bina saans nahi aati 😰"
        ]
      });
      await addBotMessages(msgs);
      return;
    }

    // ── Q2: SYMPTOM ──
    if (stage === 'q2_symptom') {
      let symptom = null;
      const symptomMap = { '1': 'congestive', '2': 'allergic', '3': 'heat', '4': 'dependency' };

      if (symptomMap[t]) {
        symptom = symptomMap[t];
      } else if (t.match(/naak band|band|block|bhaari|heavy|pressure|chehra|congestion/)) {
        symptom = 'congestive';
      } else if (t.match(/sneez|watery|runny|allerg|dust|season|aankhein|trigger|mausam/)) {
        symptom = 'allergic';
      } else if (t.match(/burn|jalan|yellow|green|headache|sar dard|thick|mucus/)) {
        symptom = 'heat';
      } else if (t.match(/spray|depend|addiction|saans|otrivin|nasivion|vicks/)) {
        symptom = 'dependency';
      }

      if (!symptom) {
        await addBotMessage('Apna main symptom batayein - ek number reply karein 🙏', [
          "Naak band, chehra bhaari, pressure 😤",
          "Sneezing, runny nose, dust/mausam se trigger 🤧",
          "Burning, thick mucus, sar dard 🔥",
          "Nasal spray ke bina saans nahi aati 😰"
        ]);
        return;
      }

      const newAnswers = { ...answers, symptom };
      setAnswers(newAnswers);
      setStage('ask_naam');

      const msgs = [];
      const sInsight = SYMPTOM_INSIGHT[symptom];
      if (sInsight) msgs.push({ text: sInsight });
      msgs.push({
        text: "Samajh aaya ✅\n\nAssessment result aapko bhejne ke liye aapka naam bata dijiye 🙏"
      });
      await addBotMessages(msgs);
      return;
    }

    // ── Q3: TRIED ──
    if (stage === 'q3_tried') {
      const triedMap = { '1': 'kuch nahi', '2': 'allopathy', '3': 'nasal spray', '4': 'sab try kiya' };
      let tried = triedMap[t] || null;

      if (!tried) {
        if (t.match(/nahi|kuch nahi|nothing/)) tried = 'kuch nahi';
        else if (t.match(/allopathy|antibiotic|doctor|medicine/)) tried = 'allopathy';
        else if (t.match(/spray|nasal/)) tried = 'nasal spray';
        else if (t.match(/sab|everything|bahut|permanent nahi/)) tried = 'sab try kiya';
      }

      if (!tried) {
        await addBotMessage('1 se 4 ke beech number reply karein 🙏', [
          "Nahi, kuch nahi kiya abhi tak",
          "Allopathy / antibiotic li",
          "Nasal spray use ki",
          "Sab try kiya - kuch permanent nahi hua 😔"
        ]);
        return;
      }

      const newAnswers = { ...answers, tried };
      setAnswers(newAnswers);
      setStage('q4_severity');

      const msgs = [];
      const tInsight = TRIED_INSIGHT[tried];
      if (tInsight) msgs.push({ text: tInsight });
      msgs.push({
        text: "Last sawaal 👇\n\nDaily life mein kitna affect karta hai?",
        options: [
          "Thoda - manage ho jaata hai",
          "Kaafi - regularly dikkat hoti hai 😣",
          "Bahut zyada - neend, kaam, sab affected 😫"
        ]
      });
      await addBotMessages(msgs);
      return;
    }

    // ── Q4: SEVERITY → FREE STEPS ──
    if (stage === 'q4_severity') {
      const sevMap = { '1': 'mild', '2': 'moderate', '3': 'severe' };
      let severity = sevMap[t] || null;

      if (!severity) {
        if (t.match(/thoda|manage|mild|kam/)) severity = 'mild';
        else if (t.match(/kaafi|regular|moderate|dikkat/)) severity = 'moderate';
        else if (t.match(/bahut|zyada|severe|neend|kaam|affected/)) severity = 'severe';
      }

      if (!severity) {
        await addBotMessage('1, 2 ya 3 reply karein 🙏', [
          "Thoda - manage ho jaata hai",
          "Kaafi - regularly dikkat hoti hai 😣",
          "Bahut zyada - neend, kaam, sab affected 😫"
        ]);
        return;
      }

      const newAnswers = { ...answers, severity };
      setAnswers(newAnswers);

      const sinusType = answers.symptom || 'congestive';
      const timing = getTimeSlot();

      const ENGLISH_TYPE = {
        allergic: 'Allergic Rhinosinusitis',
        congestive: 'Congestive Sinusitis',
        heat: 'Inflammatory Sinusitis',
        dependency: 'Chronic Rebound Sinusitis (Spray Dependency)'
      };
      const AYURVEDIC_TYPE = {
        allergic: 'Vataja-Kaphaja Pratishyaya',
        congestive: 'Kaphaja Pratishyaya',
        heat: 'Pittaja Pratishyaya',
        dependency: 'Dushta Pratishyaya'
      };

      sendLead({
        stage: 'assessment_complete',
        sinusType,
        name: answers.name || '',
        phone: answers.phone || '',
        message: `Duration: ${answers.duration}, Symptom: ${sinusType}, Tried: ${answers.tried}, Severity: ${severity}`
      });

      setStage('after_steps');

      const msgs = [];
      const sevInsight = SEVERITY_INSIGHT[severity];
      if (sevInsight) msgs.push({ text: sevInsight });

      // Show assessment result with English + Ayurvedic name
      msgs.push({
        text: `${answers.name} Ji, aapka assessment complete hua ✅\n\n🎯 Aapki condition:\n📋 English: *${ENGLISH_TYPE[sinusType] || 'Sinusitis'}*\n🌿 Ayurvedic: *${AYURVEDIC_TYPE[sinusType] || 'Pratishyaya'}*\n\nAb hum aapko aaj ke liye 2 immediate relief steps de rahe hain 👇`
      });

      const stepMsg = (FREE_STEPS[timing] && FREE_STEPS[timing][sinusType]) || FREE_STEPS[timing]['congestive'];
      msgs.push({ text: stepMsg });
      msgs.push({
        text: SURFACE_MSG,
        options: SURFACE_OPTIONS
      });
      await addBotMessages(msgs);
      return;
    }

    // ── AFTER STEPS ──
    if (stage === 'after_steps') {
      const wantsTry = t === '2' || t.match(/pehle|try|baad|steps|karti|karta/);

      if (wantsTry) {
        setStage('try_first');
        sendLead({ stage: 'try_first', sinusType: answers.symptom || '', name: answers.name || '', phone: answers.phone || '' });
        await addBotMessage(
          "Bilkul 🙏 Steps try karein - subah aur raat dono.\n\nKuch bhi sawaal ho - yahan type karein ya seedha WhatsApp karein:",
          [`WhatsApp: ${WHATSAPP_NUM}`]
        );
        return;
      }

      // Wants to see protocol
      setStage('pitched');
      const sinusType = answers.symptom || 'congestive';
      sendLead({ stage: 'plans_shown', sinusType, name: answers.name || '', phone: answers.phone || '' });
      await addBotMessage(buildPlanMsg(sinusType), [
        "Rs.499 - 7-Day Protocol",
        "Rs.1,299 - 14-Day Protocol",
        "Fark samjhna hai",
        "Sachin Ji se baat"
      ]);
      return;
    }

    // ── PITCHED / PLAN SELECTION ──
    if (stage === 'pitched') {
      // Protocol 1
      if (t === '1' || t.match(/\b499\b|protocol 1|plan 1|7.day/i)) {
        setAnswers(prev => ({ ...prev, selectedPlan: '499' }));
        sendLead({ stage: 'protocol_1_selected', sinusType: answers.symptom || '', name: answers.name || '', phone: answers.phone || '' });
        setStage('plan_selected');
        const paymentLink = PAYMENT_499;
        await addBotMessage(
          `Bahut achha decision ${answers.name} Ji 🙏✅\n\nProtocol 1 (Rs.499 - 7-Day) ke liye payment link:\n${paymentLink}\n\nPayment ke baad screenshot WhatsApp pe bhejein.\n\n📱 ${WHATSAPP_NUM}\n\nSachin Ji kal subah aapko Day 1 routine personally bhejenge 🌿`,
          [`WhatsApp pe message karein`]
        );
        return;
      }

      // Protocol 2
      if (t === '2' || t.match(/\b1299\b|protocol 2|plan 2|14.day/i)) {
        setAnswers(prev => ({ ...prev, selectedPlan: '1299' }));
        sendLead({ stage: 'protocol_2_selected', sinusType: answers.symptom || '', name: answers.name || '', phone: answers.phone || '' });
        setStage('plan_selected');
        const paymentLink = PAYMENT_1299;
        await addBotMessage(
          `Bahut achha decision ${answers.name} Ji 🙏✅\n\nProtocol 2 (Rs.1,299 - 14-Day) ke liye payment link:\n${paymentLink}\n\nPayment ke baad screenshot WhatsApp pe bhejein.\n\n📱 ${WHATSAPP_NUM}\n\nSachin Ji kal subah aapko Day 1 routine personally bhejenge 🌿`,
          [`WhatsApp pe message karein`]
        );
        return;
      }

      // Difference
      if (t === '3' || t.match(/fark|difference|confused|dono mein|samajh|kaun sa/)) {
        await addBotMessage(
          "Seedhi baat 👇\n\nProtocol 1 (Rs.499) - 7 din, 1x daily. Naya problem hai toh yeh sahi hai. Body ko stabilize karta hai.\n\nProtocol 2 (Rs.1,299) - 14 din, 2x daily. Purana ya chronic problem, spray dependency. Root dosha imbalance pe kaam karta hai.\n\nDono fundamentally alag hain - ek ka extension nahi.\n\nBatayein - 1 ya 2?",
          [
            "Rs.499 - 7-Day Protocol",
            "Rs.1,299 - 14-Day Protocol"
          ]
        );
        return;
      }

      // Specialist / Sachin Ji
      if (t === '4' || t.match(/specialist|sachin|baat|call/)) {
        setStage('human_takeover');
        sendLead({ stage: 'requested_specialist', sinusType: answers.symptom || '', name: answers.name || '', phone: answers.phone || '' });
        await addBotMessage(
          `Bilkul 🙏 Sachin Ji personally baat karenge.\n\n📱 ${WHATSAPP_NUM}\n\nAyusomam Herbals 🌿`,
          [`WhatsApp pe message karein`]
        );
        return;
      }

      // Fallback
      await addBotMessage(
        "Reply karein:\n1 - Protocol 1 (Rs.499)\n2 - Protocol 2 (Rs.1,299)\n3 - Dono mein kya fark hai?\n4 - Specialist se baat 🙏",
        [
          "Rs.499 - 7-Day Protocol",
          "Rs.1,299 - 14-Day Protocol",
          "Fark samjhna hai",
          "Sachin Ji se baat"
        ]
      );
      return;
    }

    // ── ASK NAAM (after symptoms) ──
    if (stage === 'ask_naam') {
      const name = text.trim();
      const newAnswers = { ...answers, name };
      setAnswers(newAnswers);
      setStage('ask_phone');
      await addBotMessage(
        `${name} Ji 🙏 Aapka WhatsApp number bata dijiye - FREE assessment result wahan bhej denge.`
      );
      return;
    }

    // ── ASK PHONE (then continue assessment) ──
    if (stage === 'ask_phone') {
      let phone = text.replace(/\D/g, '');
      // Strip country code
      if (phone.startsWith('91') && phone.length === 12) phone = phone.slice(2);
      if (phone.startsWith('091') && phone.length === 13) phone = phone.slice(3);
      if (phone.startsWith('0') && phone.length === 11) phone = phone.slice(1);
      if (phone.length !== 10) {
        await addBotMessage('Sirf 10 digit ka WhatsApp number daalein 🙏\n\nJaise: 9876543210');
        return;
      }
      const newAnswers = { ...answers, phone };
      setAnswers(newAnswers);

      sendLead({ stage: 'contact_collected', sinusType: answers.symptom || '', name: answers.name || '', phone });

      setStage('q3_tried');
      await addBotMessage(
        `Shukriya ${answers.name} Ji ✅ Assessment result aapke WhatsApp pe bhi bhejenge.\n\nBas 2 aur chhote sawaal hain.\n\nIske liye pehle kuch try kiya?`,
        [
          "Nahi, kuch nahi kiya abhi tak",
          "Allopathy / antibiotic li",
          "Nasal spray use ki",
          "Sab try kiya - kuch permanent nahi hua 😔"
        ]
      );
      return;
    }

    // ── ASK PHONE FOR PAYMENT (after plan selection) ──
    if (stage === 'ask_phone_payment') {
      let phone = text.replace(/\D/g, '');
      if (phone.startsWith('91') && phone.length === 12) phone = phone.slice(2);
      if (phone.startsWith('091') && phone.length === 13) phone = phone.slice(3);
      if (phone.startsWith('0') && phone.length === 11) phone = phone.slice(1);
      if (phone.length !== 10) {
        await addBotMessage('Sirf 10 digit ka WhatsApp number daalein 🙏\n\nJaise: 9876543210');
        return;
      }
      const newAnswers = { ...answers, phone };
      setAnswers(newAnswers);
      setStage('plan_selected');

      const selectedPlan = answers.selectedPlan || '499';
      const paymentLink = selectedPlan === '1299' ? PAYMENT_1299 : PAYMENT_499;
      const planLabel = selectedPlan === '1299' ? 'Protocol 2 (Rs.1,299 - 14-Day)' : 'Protocol 1 (Rs.499 - 7-Day)';

      sendLead({
        stage: 'plan_selected_with_contact',
        sinusType: answers.symptom || '',
        name: answers.name || '',
        phone,
        message: `${answers.name} | ${phone} | ${planLabel} | ${answers.symptom}`
      });

      await addBotMessage(
        `Shukriya ${answers.name} Ji 🙏\n\n${planLabel} ke liye payment link:\n${paymentLink}\n\nPayment ke baad screenshot WhatsApp pe bhejein.\n\n📱 ${WHATSAPP_NUM}\n\nSachin Ji kal subah aapko Day 1 routine personally bhejenge 🌿`,
        [`WhatsApp pe message karein`]
      );
      return;
    }

    // ── TRY FIRST ──
    if (stage === 'try_first') {
      if (t.match(/ready|protocol|plan|haan|start|shuru|chahiye|dekhna/)) {
        setStage('pitched');
        const sinusType = answers.symptom || 'congestive';
        sendLead({ stage: 'plans_shown_after_try', sinusType, name: answers.name || '', phone: answers.phone || '' });
        await addBotMessage(buildPlanMsg(sinusType), [
          "Rs.499 - 7-Day Protocol",
          "Rs.1,299 - 14-Day Protocol",
          "Fark samjhna hai",
          "Sachin Ji se baat"
        ]);
        return;
      }
      await addBotMessage(
        `Kisi bhi madad ke liye seedha WhatsApp karein:\n📱 ${WHATSAPP_NUM}\n\nJab ready ho protocol ke liye - yahan "ready" type karein 🙏`,
        [`WhatsApp pe message karein`, `Ready - protocol dekhna hai`]
      );
      return;
    }

    // ── PLAN SELECTED / POST-PAYMENT ──
    if (stage === 'plan_selected' || stage === 'done') {
      await addBotMessage(
        `Kisi bhi madad ke liye seedha WhatsApp karein:\n📱 ${WHATSAPP_NUM}\nAyusomam Herbals 🌿`,
        [`WhatsApp pe message karein`]
      );
      return;
    }

    // ── HUMAN TAKEOVER ──
    if (stage === 'human_takeover') {
      await addBotMessage(
        `Sachin Ji se seedha baat karein:\n📱 ${WHATSAPP_NUM}\nAyusomam Herbals 🌿`,
        [`WhatsApp pe message karein`]
      );
      return;
    }

    // ── FALLBACK ──
    await addBotMessage(
      `Sachin Ji se seedha baat karein:\n📱 ${WHATSAPP_NUM}\nAyusomam Herbals 🌿`,
      [`WhatsApp pe message karein`]
    );
  };

  // Handle option button click
  const handleOptionClick = (option) => {
    if (option === `WhatsApp: ${WHATSAPP_NUM}` || option === 'WhatsApp pe message karein') {
      window.open(WHATSAPP_LINK, '_blank');
      return;
    }
    if (option === 'Ready - protocol dekhna hai') {
      handleUserMessage('ready');
      return;
    }
    handleUserMessage(option);
  };

  // Handle send
  const handleSend = () => {
    if (input.trim()) {
      handleUserMessage(input.trim());
    }
  };

  // Handle enter key
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* ── STYLES ── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

        .ayusomam-widget * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .ayusomam-fab {
          position: fixed;
          bottom: 24px;
          right: 24px;
          width: 64px;
          height: 64px;
          border-radius: 50%;
          background: linear-gradient(135deg, #2E7D32 0%, #1B5E20 100%);
          border: none;
          cursor: pointer;
          box-shadow: 0 4px 20px rgba(46, 125, 50, 0.4), 0 2px 8px rgba(0,0,0,0.15);
          z-index: 999999;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease;
          animation: ayusomam-pulse 3s ease-in-out infinite;
        }

        .ayusomam-fab:hover {
          transform: scale(1.1);
          box-shadow: 0 6px 28px rgba(46, 125, 50, 0.5), 0 4px 12px rgba(0,0,0,0.2);
        }

        .ayusomam-fab.open {
          animation: none;
        }

        @keyframes ayusomam-pulse {
          0%, 100% { box-shadow: 0 4px 20px rgba(46, 125, 50, 0.4), 0 2px 8px rgba(0,0,0,0.15); }
          50% { box-shadow: 0 4px 20px rgba(46, 125, 50, 0.6), 0 2px 8px rgba(0,0,0,0.15), 0 0 0 8px rgba(46, 125, 50, 0.1); }
        }

        .ayusomam-fab svg {
          width: 30px;
          height: 30px;
          fill: #fff;
          transition: transform 0.3s ease, opacity 0.3s ease;
        }

        .ayusomam-window {
          position: fixed;
          bottom: 100px;
          right: 24px;
          width: 390px;
          height: 560px;
          max-height: calc(100vh - 130px);
          border-radius: 20px;
          background: #fff;
          box-shadow: 0 12px 48px rgba(0,0,0,0.15), 0 4px 16px rgba(0,0,0,0.1);
          z-index: 999998;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          opacity: 0;
          transform: translateY(20px) scale(0.95);
          pointer-events: none;
          transition: opacity 0.35s ease, transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .ayusomam-window.visible {
          opacity: 1;
          transform: translateY(0) scale(1);
          pointer-events: auto;
        }

        .ayusomam-header {
          background: linear-gradient(135deg, #2E7D32 0%, #1B5E20 100%);
          padding: 18px 20px;
          display: flex;
          align-items: center;
          gap: 14px;
          flex-shrink: 0;
        }

        .ayusomam-header-avatar {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: rgba(255,255,255,0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 22px;
          flex-shrink: 0;
        }

        .ayusomam-header-info h3 {
          color: #fff;
          font-size: 16px;
          font-weight: 700;
          line-height: 1.3;
        }

        .ayusomam-header-info p {
          color: rgba(255,255,255,0.85);
          font-size: 12px;
          font-weight: 400;
          margin-top: 2px;
        }

        .ayusomam-header-status {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #69F0AE;
          margin-left: auto;
          flex-shrink: 0;
          animation: ayusomam-status-pulse 2s ease-in-out infinite;
        }

        @keyframes ayusomam-status-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        .ayusomam-messages {
          flex: 1;
          overflow-y: auto;
          padding: 16px 16px 8px;
          background: linear-gradient(180deg, #FAFAFA 0%, #F5F5F5 100%);
          scroll-behavior: smooth;
        }

        .ayusomam-messages::-webkit-scrollbar {
          width: 4px;
        }

        .ayusomam-messages::-webkit-scrollbar-track {
          background: transparent;
        }

        .ayusomam-messages::-webkit-scrollbar-thumb {
          background: #C8E6C9;
          border-radius: 4px;
        }

        .ayusomam-msg {
          display: flex;
          margin-bottom: 10px;
          animation: ayusomam-msg-in 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        @keyframes ayusomam-msg-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .ayusomam-msg-bot {
          justify-content: flex-start;
        }

        .ayusomam-msg-user {
          justify-content: flex-end;
        }

        .ayusomam-bubble {
          max-width: 82%;
          padding: 12px 16px;
          font-size: 14px;
          line-height: 1.55;
          word-wrap: break-word;
          white-space: pre-wrap;
        }

        .ayusomam-msg-bot .ayusomam-bubble {
          background: #fff;
          color: #333;
          border-radius: 4px 18px 18px 18px;
          box-shadow: 0 1px 4px rgba(0,0,0,0.06);
          border: 1px solid #E8F5E9;
        }

        .ayusomam-msg-user .ayusomam-bubble {
          background: linear-gradient(135deg, #2E7D32 0%, #388E3C 100%);
          color: #fff;
          border-radius: 18px 4px 18px 18px;
          box-shadow: 0 2px 8px rgba(46, 125, 50, 0.25);
        }

        .ayusomam-options {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 10px;
          margin-bottom: 10px;
          padding: 0 4px;
        }

        .ayusomam-option-btn {
          background: #E8F5E9;
          color: #2E7D32;
          border: 1.5px solid #A5D6A7;
          border-radius: 20px;
          padding: 8px 16px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          line-height: 1.4;
          text-align: left;
        }

        .ayusomam-option-btn:hover {
          background: #C8E6C9;
          border-color: #2E7D32;
          transform: translateY(-1px);
        }

        .ayusomam-option-btn:active {
          transform: translateY(0);
        }

        .ayusomam-typing {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 14px 20px;
        }

        .ayusomam-typing-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #A5D6A7;
          animation: ayusomam-dot-bounce 1.4s ease-in-out infinite;
        }

        .ayusomam-typing-dot:nth-child(2) { animation-delay: 0.16s; }
        .ayusomam-typing-dot:nth-child(3) { animation-delay: 0.32s; }

        @keyframes ayusomam-dot-bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-6px); opacity: 1; }
        }

        .ayusomam-input-area {
          padding: 12px 16px;
          background: #fff;
          border-top: 1px solid #E8E8E8;
          display: flex;
          gap: 10px;
          align-items: center;
          flex-shrink: 0;
        }

        .ayusomam-input {
          flex: 1;
          border: 2px solid #E0E0E0;
          border-radius: 24px;
          padding: 11px 18px;
          font-size: 14px;
          outline: none;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          color: #333;
        }

        .ayusomam-input::placeholder {
          color: #999;
        }

        .ayusomam-input:focus {
          border-color: #2E7D32;
          box-shadow: 0 0 0 3px rgba(46, 125, 50, 0.1);
        }

        .ayusomam-send-btn {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: linear-gradient(135deg, #2E7D32 0%, #1B5E20 100%);
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: transform 0.2s ease, opacity 0.2s ease;
        }

        .ayusomam-send-btn:hover {
          transform: scale(1.08);
        }

        .ayusomam-send-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
        }

        .ayusomam-send-btn svg {
          width: 20px;
          height: 20px;
          fill: #fff;
        }

        .ayusomam-footer {
          text-align: center;
          padding: 6px;
          background: #FAFAFA;
          border-top: 1px solid #F0F0F0;
          flex-shrink: 0;
        }

        .ayusomam-footer span {
          font-size: 10px;
          color: #999;
          letter-spacing: 0.3px;
        }

        @media (max-width: 480px) {
          .ayusomam-window {
            bottom: 0;
            right: 0;
            left: 0;
            width: 100%;
            height: 100%;
            max-height: 100vh;
            border-radius: 0;
          }
          .ayusomam-fab {
            bottom: 16px;
            right: 16px;
            width: 56px;
            height: 56px;
          }
          .ayusomam-fab svg {
            width: 26px;
            height: 26px;
          }
        }
      `}</style>

      <div className="ayusomam-widget">
        {/* ── FAB BUTTON ── */}
        <button
          className={`ayusomam-fab ${isOpen ? 'open' : ''}`}
          onClick={() => isOpen ? setIsOpen(false) : handleOpen()}
          aria-label="Chat with us"
        >
          {isOpen ? (
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/>
              <path d="M7 9h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2z"/>
            </svg>
          )}
        </button>

        {/* ── CHAT WINDOW ── */}
        <div className={`ayusomam-window ${isOpen ? 'visible' : ''}`}>
          {/* Header */}
          <div className="ayusomam-header">
            <div className="ayusomam-header-avatar">{"🌿"}</div>
            <div className="ayusomam-header-info">
              <h3>Ayusomam Herbals</h3>
              <p>Ayurvedic Sinus Specialist</p>
            </div>
            <div className="ayusomam-header-status"></div>
          </div>

          {/* Messages */}
          <div className="ayusomam-messages">
            {messages.map((msg, i) => (
              <React.Fragment key={i}>
                <div className={`ayusomam-msg ayusomam-msg-${msg.sender}`}>
                  <div className="ayusomam-bubble">{msg.text}</div>
                </div>
                {msg.options && msg.sender === 'bot' && i === messages.length - 1 && (
                  <div className="ayusomam-options">
                    {msg.options.map((opt, j) => (
                      <button
                        key={j}
                        className="ayusomam-option-btn"
                        onClick={() => handleOptionClick(opt)}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}
              </React.Fragment>
            ))}

            {/* Typing indicator */}
            {isTyping && (
              <div className="ayusomam-msg ayusomam-msg-bot">
                <div className="ayusomam-bubble ayusomam-typing">
                  <div className="ayusomam-typing-dot"></div>
                  <div className="ayusomam-typing-dot"></div>
                  <div className="ayusomam-typing-dot"></div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="ayusomam-input-area">
            <input
              ref={inputRef}
              className="ayusomam-input"
              type="text"
              placeholder="Apna jawab yahan likhen..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              autoComplete="off"
            />
            <button
              className="ayusomam-send-btn"
              onClick={handleSend}
              disabled={!input.trim() || isTyping}
              aria-label="Send message"
            >
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
              </svg>
            </button>
          </div>

          {/* Footer */}
          <div className="ayusomam-footer">
            <span>Ayusomam Herbals {"🌿"} Ayurvedic Wellness</span>
          </div>
        </div>
      </div>
    </>
  );
}
