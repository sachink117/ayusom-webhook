const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.use(express.json());

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const INSTAGRAM_TOKEN = process.env.INSTAGRAM_TOKEN;
const GOOGLE_SHEET_URL = process.env.GOOGLE_SHEET_URL;
const PAGE_ID = '1035532399636645';
const INSTAGRAM_ID = '17841445309536661';
const PAYMENT_LINK = 'https://rzp.io/rzp/qu8zhQT';
const WHATSAPP_NUMBER = '+91 85951 60713';
const WEBSITE = 'www.ayusomamherbals.com';

const userState = {};
const userProfile = {};

// ─── EXTRACT FIRST NUMBER ─────────────────────────────────────
function extractFirstNumber(text) {
  const match = text.match(/\d+/);
  return match ? match[0] : null;
}

// ─── DETECTION HELPERS ───────────────────────────────────────
function detectDuration(text) {
  const t = text.toLowerCase().trim();
  if (t === '1') return 'short';
  if (t === '2') return 'medium';
  if (t === '3') return 'long';
  if (t.match(/(^|\s)(6|chhe|six)\s*(month|mahine|mah)/)) return 'short';
  if (t.match(/\b(less|kam|thodi|new|naya|abhi|recent)\b/)) return 'short';
  if (t.match(/(^|\s)(1|ek|one)\s*(year|saal|sal|yr)/)) return 'medium';
  if (t.match(/(^|\s)(2|do|two)\s*(year|saal|sal|yr)/)) return 'medium';
  if (t.match(/(^|\s)([3-9]|10)\s*(year|saal|sal|yr)/)) return 'long';
  if (t.match(/\b(bahut|kaafi|purani|saalon|long|zyada)\b/)) return 'long';
  const n = extractFirstNumber(t);
  if (n === '1') return 'short';
  if (n === '2') return 'medium';
  if (n === '3') return 'long';
  return null;
}

function detectSymptom(text) {
  const t = text.toLowerCase().trim();
  if (t === '1') return 'allergic';
  if (t === '2') return 'congestive';
  if (t === '3') return 'heat';
  if (t === '4') return 'dependency';
  if (t === '5') return 'congestive';
  if (t.match(/\b(sneez|watery|runny|allerg|dust|season|pollen)\b/)) return 'allergic';
  if (t.match(/\b(naak band|block|bhaari|heavy|pressure|congestion)\b/)) return 'congestive';
  if (t.match(/\b(burn|jalan|yellow|green|headache|sar dard)\b/)) return 'heat';
  if (t.match(/\b(otrivin|spray|depend|nasivion)\b/)) return 'dependency';
  if (t.match(/\b(neend|sleep|drip|balgam|gala)\b/)) return 'congestive';
  const n = extractFirstNumber(t);
  if (n === '1') return 'allergic';
  if (n === '2') return 'congestive';
  if (n === '3') return 'heat';
  if (n === '4') return 'dependency';
  if (n === '5') return 'congestive';
  return null;
}

function detectTried(text) {
  const t = text.toLowerCase().trim();
  if (t === '1') return 'sirf nasal spray';
  if (t === '2') return 'allopathy medicines';
  if (t === '3') return 'ghar ke nuskhe';
  if (t === '4') return 'kuch nahi';
  if (t === '5') return 'other Ayurvedic';
  if (t.match(/\b(otrivin|nasal spray|nasivion|drop)\b/)) return 'sirf nasal spray';
  if (t.match(/\b(doctor|allopath|medicine|dawai|tablet|antibiotic)\b/)) return 'allopathy medicines';
  if (t.match(/\b(ghar|home|nuskha|gharelu|haldi|shahad)\b/)) return 'ghar ke nuskhe';
  if (t.match(/\b(kuch nahi|nothing|no treatment|nahi kiya)\b/)) return 'kuch nahi';
  if (t.match(/\b(ayurved|patanjali|hamdard|herbal)\b/)) return 'other Ayurvedic';
  const n = extractFirstNumber(t);
  if (n === '1') return 'sirf nasal spray';
  if (n === '2') return 'allopathy medicines';
  if (n === '3') return 'ghar ke nuskhe';
  if (n === '4') return 'kuch nahi';
  if (n === '5') return 'other Ayurvedic';
  return null;
}

function detectSeverity(text) {
  const t = text.toLowerCase().trim();
  if (t === '1') return 'Mild';
  if (t === '2') return 'Moderate';
  if (t === '3') return 'Severe';
  if (t === '4') return 'Very Severe';
  if (t.match(/\b(mild|thoda|kabhi kabhi|sometimes|halka)\b/)) return 'Mild';
  if (t.match(/\b(moderate|kaafi|medium|affect|disturb)\b/)) return 'Moderate';
  if (t.match(/\b(severe|bahut|zyada|daily|har roz|serious)\b/)) return 'Severe';
  if (t.match(/\b(extreme|worst|mushkil|unbearable|critical)\b/)) return 'Very Severe';
  const n = extractFirstNumber(t);
  if (n === '1') return 'Mild';
  if (n === '2') return 'Moderate';
  if (n === '3') return 'Severe';
  if (n === '4') return 'Very Severe';
  return null;
}

// ─── PITCH MESSAGES ──────────────────────────────────────────
function getPitchMessage(sinusType, p) {
  const header = `📋 Aapka Sinus Assessment Complete ✅\n\nAapki details:\n• Problem duration: ${p.duration}\n• Main symptom: ${p.symptom}\n• Previous treatment: ${p.tried}\n• Severity: ${p.severity}\n\n`;

  const specialist = `Yeh koi app nahi. Koi generic PDF nahi.\n\nAapko milega ek dedicated Ayurvedic specialist —\n14 din tak, directly aapke WhatsApp pe.\n\nJab bhi symptoms feel ho — message karein.\nSpecialist personally respond karega aur\naapka protocol usi waqt adjust karega.\n\nDin mein 2 baar. Raat ko. Flare up pe.\nKabhi bhi.\n`;

  const footer = `\n━━━━━━━━━━━━━━━━━━━━\n⭐ CLIENT EXPERIENCE\n━━━━━━━━━━━━━━━━━━━━\n\nShikha Tyagi ji — 5 saal se Otrivin use kar rahi thin. Ayusomam 14-day program ke baad unhone naturally spray reduce kar li.\n\nUnke words: "Pehli baar itne saalon baad khulke saans li." ✅\n\n*Results may vary. Yeh ek personal wellness experience hai.*\n\n━━━━━━━━━━━━━━━━━━━━\nInvestment: ₹1,299\n━━━━━━━━━━━━━━━━━━━━\n\nBaaki programs plan dete hain.\nHum results dete hain — kabhi bhi, daily.\n\nAur jaankari ke liye visit karein:\n🌐 ${WEBSITE}\n\nKya aap apna protocol shuru karna chahte hain?\nReply karein YES. 🙏\n\nAgar plan ke baare mein aur details chahiye — "MORE" type karein.\nHamare specialist khud aapse personally baat karenge.`;

  if (sinusType === 'allergic') {
    return header +
`━━━━━━━━━━━━━━━━━━━━
🌿 AAPKA SINUS TYPE: ALLERGIC SINUS
━━━━━━━━━━━━━━━━━━━━

Aapki condition dust, pollution ya season change se trigger hoti hai. Har baar mausam badla — naak shuru ho gayi.

Yeh generic sinus nahi — yeh Allergic Sinus hai. Isko generic solution se address nahi kar sakte.

━━━━━━━━━━━━━━━━━━━━
🌿 AYUSOMAM ALLERGIC SINUS PROTOCOL
━━━━━━━━━━━━━━━━━━━━

${specialist}
Day 3 — discomfort kam hona shuru.
Day 7 — breathing comfortable feel hogi.
Day 14 — jo har season mein hota tha, woh is baar nahi hua. 🌿
` + footer;
  }

  if (sinusType === 'congestive') {
    return header +
`━━━━━━━━━━━━━━━━━━━━
🔴 AAPKA SINUS TYPE: CONGESTIVE SINUS
━━━━━━━━━━━━━━━━━━━━

Subah uthte hi naak band. Chehra bhaari. Sar mein pressure. Din bhar yahi haal.

Yeh Congestive Sinus hai — nasal passage mein chronic inflammation. Time ke saath yeh aur worsen hoti hai.

Steam aur saline temporary hain — surface pe kaam karte hain. Andar ki inflammation untouched rehti hai.

━━━━━━━━━━━━━━━━━━━━
🌿 AYUSOMAM CONGESTIVE SINUS PROTOCOL
━━━━━━━━━━━━━━━━━━━━

${specialist}
Day 3 — pressure kam hona shuru.
Day 7 — subah breathing better feel hogi.
Day 14 — subah uthke pehli baar khulke saans li — bina kuch kiye. 🌿
` + footer;
  }

  if (sinusType === 'heat') {
    return header +
`━━━━━━━━━━━━━━━━━━━━
🔥 AAPKA SINUS TYPE: HEAT SINUS
━━━━━━━━━━━━━━━━━━━━

Andar se burning feel hoti hai. Headache intense hai. Spicy ya oily khana symptoms worsen kar deta hai.

Yeh sirf nasal problem nahi — yeh Heat Sinus hai. Systemic inflammation jo andar se aa rahi hai.

Isko cooling protocol chahiye — generic decongestant nahi.

━━━━━━━━━━━━━━━━━━━━
🌿 AYUSOMAM HEAT SINUS PROTOCOL
━━━━━━━━━━━━━━━━━━━━

${specialist}
Day 3 — burning sensation kam hona shuru.
Day 7 — headache frequency reduce hogi.
Day 14 — Burning gone. Headache gone. Naak clear. 🌿
` + footer;
  }

  if (sinusType === 'dependency') {
    return header +
`━━━━━━━━━━━━━━━━━━━━
⚠️ AAPKA SINUS TYPE: DEPENDENCY SINUS
━━━━━━━━━━━━━━━━━━━━

Spray ke bina breathe karna mushkil lagta hai. Spray lagate ho — thodi der relief. Phir wahi blockage. Yeh cycle band hone ka naam nahi le raha.

Aap akele nahi hain — yeh bahut common hai. Aur yeh aapki galti nahi.

Spray ne temporarily help ki — lekin ab body uske bina adjust nahi kar pa rahi. Isko naturally reset karna padega.

━━━━━━━━━━━━━━━━━━━━
🌿 AYUSOMAM DEPENDENCY SINUS PROTOCOL
━━━━━━━━━━━━━━━━━━━━

${specialist}
Yeh protocol mein daily guidance sabse zaroori hai — kyunki har din alag hoga. Specialist har step pe aapke saath hoga.

Day 3 — natural breathing improve hona shuru.
Day 7 — spray ki zaroorat kam hogi.
Day 14 — jo spray saalon se chhut nahi rahi, bahut se clients ne 14 din mein naturally reduce kar li. 🌿
` + footer;
  }

  return header +
`━━━━━━━━━━━━━━━━━━━━
🌿 AYUSOMAM SINUS PROTOCOL
━━━━━━━━━━━━━━━━━━━━

${specialist}
Day 3 — discomfort kam hona shuru.
Day 7 — breathing better feel hogi.
Day 14 — significant improvement in comfort. 🌿
` + footer;
}

// ─── SHEET FUNCTIONS ─────────────────────────────────────────
async function saveToSheet(data) {
  try {
    const response = await fetch(GOOGLE_SHEET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      redirect: 'follow'
    });
    const text = await response.text();
    console.log('Sheet saved:', response.status, text.substring(0, 100));
  } catch(err) {
    console.error('Sheet error:', err.message);
  }
}

async function updateLead(senderId, temperature, lastStage, symptom) {
  try {
    const response = await fetch(GOOGLE_SHEET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        update: true,
        senderId,
        temperature,
        lastStage,
        symptom: symptom || ''
      }),
      redirect: 'follow'
    });
    const text = await response.text();
    console.log('Lead updated:', text.substring(0, 100));
  } catch(err) {
    console.error('Update error:', err.message);
  }
}

// ─── SEND MESSAGE ─────────────────────────────────────────────
async function sendFBMessage(senderId, text) {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: senderId },
          message: { text: text }
        })
      }
    );
    console.log('FB message sent, status:', response.status);
  } catch(err) {
    console.error('FB send error:', err.message);
  }
}

async function sendIGMessage(senderId, text) {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${INSTAGRAM_ID}/messages?access_token=${INSTAGRAM_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: senderId },
          message: { text: text }
        })
      }
    );
    console.log('IG message sent, status:', response.status);
  } catch(err) {
    console.error('IG send error:', err.message);
  }
}

// ─── PROCESS MESSAGE ─────────────────────────────────────────
async function processMessage(senderId, text, platform, sendFn, ownId) {
  const state = userState[senderId] || 'new';
  const profile = userProfile[senderId] || {};

  console.log(`LEAD [${platform}] - ID: ${senderId} - State: ${state} - Message: ${text}`);

  if (state === 'human_takeover') {
    console.log(`SILENT - human takeover active for ${senderId}`);
    return;
  }

  if (state === 'new') {
    await saveToSheet({
      timestamp: new Date().toISOString(),
      platform: platform,
      senderId: senderId,
      name: `${platform}_${senderId}`,
      message: text
    });
  }

  // Contact request
  if (
    state !== 'done' &&
    state !== 'human_takeover' &&
    (
      text.toLowerCase().includes('whatsapp') ||
      text.toLowerCase().includes('contact') ||
      text.toLowerCase().includes('call') ||
      text.toLowerCase().includes('phone') ||
      text.toLowerCase().includes('helpline') ||
      text.toLowerCase().includes('direct') ||
      text.toLowerCase().includes('number')
    )
  ) {
    await sendFn(senderId,
`Bilkul! Aap seedha hamare specialist se baat kar sakte hain. 🙏

📱 WhatsApp: ${WHATSAPP_NUMBER}
🌐 Website: ${WEBSITE}

Hum personally aapki problem sunenge aur sahi guidance denge.

Ayusomam Herbals 🌿`
    );
    return;
  }

  if (state === 'new') {
    userState[senderId] = 'asked_duration';
    await updateLead(senderId, '🔴 Cold', 'started', '');
    await sendFn(senderId,
`🙏 Namaste! Ayusomam Herbals mein aapka swagat hai.

Hum chronic sinus conditions ka Ayurvedic treatment karte hain — naturally, bina spray ya steroid dependency ke.
(We specialize in Ayurvedic treatment for chronic sinus — without dependency on sprays or steroids.)

🌐 ${WEBSITE}

Aapke liye personalized assessment ke liye kuch quick questions —

✦ Aapko sinus ki problem kitne samay se hai?
(How long have you been suffering from sinus?)

1️⃣ 6 mahine se kam (Less than 6 months)
2️⃣ 6 mahine se 2 saal (6 months – 2 years)
3️⃣ 2 saal se zyada (More than 2 years)

Number ya text mein reply karein.`
    );

  } else if (state === 'asked_duration') {
    const duration = detectDuration(text);
    if (!duration) {
      await sendFn(senderId,
`Thoda aur clearly batayein — kitne saal ya mahine se hai yeh problem?

1️⃣ 6 mahine se kam
2️⃣ 6 mahine se 2 saal
3️⃣ 2 saal se zyada`
      );
    } else {
      const durationLabel = duration === 'short' ? '6 mahine se kam' : duration === 'medium' ? '6 mahine se 2 saal' : '2 saal se zyada';
      userProfile[senderId] = { ...profile, duration: durationLabel };
      userState[senderId] = 'asked_symptoms';
      await updateLead(senderId, '🔴 Cold', 'asked_duration', '');
      await sendFn(senderId,
`Noted. ✅

✦ Aapke mukhya symptoms kya hain?
(What are your main symptoms?)

1️⃣ Sneezing, watery eyes, runny nose — dust ya season change se worse hota hai
2️⃣ Naak band, chehra bhaari, sar mein pressure
3️⃣ Andar se burning feel, thick mucus, intense headache
4️⃣ Otrivin ya nasal spray pe dependent ho gaya
5️⃣ Raat ko neend nahi, gale mein balgam (post nasal drip)

Number ya describe karein.`
      );
    }

  } else if (state === 'asked_symptoms') {
    const symptom = detectSymptom(text);
    if (!symptom) {
      await sendFn(senderId,
`Thoda aur clearly batayein — aapki main problem kya hai?

1️⃣ Sneezing, watery eyes — dust/season se
2️⃣ Naak band, pressure, heaviness
3️⃣ Burning, thick mucus, headache
4️⃣ Spray/Otrivin dependency
5️⃣ Post nasal drip, sleep problem`
      );
    } else {
      const symptomLabel = {
        allergic: 'Allergic — sneezing, watery, dust triggered',
        congestive: 'Congestive — naak band, pressure, heaviness',
        heat: 'Heat Sinus — burning, thick mucus, headache',
        dependency: 'Dependency — Otrivin/spray dependent'
      }[symptom];
      userProfile[senderId] = { ...profile, symptom: symptomLabel, sinusType: symptom };
      userState[senderId] = 'asked_tried';
      await updateLead(senderId, '🟡 Warm', 'asked_symptoms', symptomLabel);
      await sendFn(senderId,
`Samajh gaya. ✅

✦ Pehle koi treatment try ki hai?
(Have you tried any treatment before?)

1️⃣ Sirf nasal spray
2️⃣ Doctor ki allopathy dawai
3️⃣ Ghar ke nuskhe
4️⃣ Abhi kuch nahi kiya
5️⃣ Koi aur Ayurvedic treatment

Number ya describe karein.`
      );
    }

  } else if (state === 'asked_tried') {
    const tried = detectTried(text);
    if (!tried) {
      await sendFn(senderId,
`Kya treatment try ki thi? Number ya describe karein:

1️⃣ Sirf nasal spray
2️⃣ Doctor ki dawai
3️⃣ Ghar ke nuskhe
4️⃣ Kuch nahi
5️⃣ Ayurvedic treatment`
      );
    } else {
      userProfile[senderId] = { ...profile, tried };
      userState[senderId] = 'asked_severity';
      await updateLead(senderId, '🟡 Warm', 'asked_tried', userProfile[senderId].symptom);
      await sendFn(senderId,
`Samajh gaya. ✅

✦ Sinus aapki daily life ko kitna affect karta hai?
(How severely does sinus affect your daily life?)

1️⃣ Thodi problem — kabhi kabhi (Mild)
2️⃣ Kaafi problem — kaam aur neend affect (Moderate)
3️⃣ Bahut zyada — daily routine affect (Severe)
4️⃣ Extreme — normal kaam karna mushkil (Very Severe)

Number ya describe karein.`
      );
    }

  } else if (state === 'asked_severity') {
    const severity = detectSeverity(text);
    if (!severity) {
      await sendFn(senderId,
`Kitni severe hai problem? Number ya describe karein:

1️⃣ Mild — kabhi kabhi
2️⃣ Moderate — regularly affect hoti hai
3️⃣ Severe — daily routine affect
4️⃣ Very Severe — bahut mushkil`
      );
    } else {
      userProfile[senderId] = { ...profile, severity };
      userState[senderId] = 'pitched';
      const p = userProfile[senderId];
      await updateLead(senderId, '🟡 Warm', 'pitched', p.symptom);
      await sendFn(senderId, getPitchMessage(p.sinusType, p));
    }

  } else if (state === 'pitched') {
    if (['yes','haan','han','ha','y','हाँ','हां'].includes(text.toLowerCase())) {
      userState[senderId] = 'done';
      await updateLead(senderId, '🟢 Hot', 'payment_sent', userProfile[senderId].symptom);
      await sendFn(senderId,
`Bahut achha! 🙏

Aapka 14-day personalized Ayurvedic Sinus Protocol confirm karne ke liye payment karein:

💳 Payment Link: ${PAYMENT_LINK}
Amount: ₹1,299

Payment ke baad aapko WhatsApp pe milega:
✅ Aapka personalized protocol
✅ Daily guidance schedule
✅ Direct specialist WhatsApp access

Payment karte waqt apna WhatsApp number zaroor daalein — usi pe aapka plan bheja jayega.

Koi problem ho toh:
📱 WhatsApp: ${WHATSAPP_NUMBER}
🌐 ${WEBSITE}

Ayusomam Herbals 🌿`
      );

    } else if (text.toLowerCase() === 'more') {
      userState[senderId] = 'human_takeover';
      await updateLead(senderId, '🟢 Hot', 'requested_specialist', userProfile[senderId].symptom);
      await sendFn(senderId,
`Bilkul! 🙏

Hamare Ayurvedic specialist aapse seedha baat karenge — aapke specific sinus type aur protocol ke baare mein personally guide karenge.

Thoda intezaar karein — specialist abhi aapke paas aate hain.
(Our specialist will connect with you personally very shortly.)

🌐 ${WEBSITE}

Ayusomam Herbals 🌿`
      );

    } else if (
      text.toLowerCase().includes('price') ||
      text.toLowerCase().includes('cost') ||
      text.toLowerCase().includes('kitna') ||
      text.toLowerCase().includes('fees') ||
      text.toLowerCase().includes('charge') ||
      text.toLowerCase().includes('paisa') ||
      text.toLowerCase().includes('rate')
    ) {
      await sendFn(senderId,
`Poora 14-day protocol sirf ₹1,299 mein.

Isme shamil hai:
✅ Aapke specific sinus type ke liye personalized protocol
✅ 14 din dedicated specialist — kabhi bhi WhatsApp pe
✅ Daily adaptive guidance — aapke symptoms ke hisaab se
✅ Flare up support — jab bhi zaroorat ho

Aur jaankari ke liye: 🌐 ${WEBSITE}

Reply karein YES to begin. 🙏
Ya plan details ke liye "MORE" type karein.`
      );

    } else {
      await sendFn(senderId,
`Koi bhi sawaal poochh sakte hain — hum yahan hain. 🙏

Agar plan ke baare mein aur details chahiye toh "MORE" type karein — hamare specialist khud aapse 1-on-1 baat karenge.

Ya program shuru karne ke liye Reply karein YES.

🌐 ${WEBSITE}`
      );
    }

  } else if (state === 'done') {
    console.log(`DONE STATE - No reply sent to ${senderId}`);
  }
}

// ─── WEBHOOK ──────────────────────────────────────────────────
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === 'ayusom2026') {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

app.post('/webhook', async (req, res) => {
  const body = req.body;

  if (body.entry) {
    for (const entry of body.entry) {

      // ─── INSTAGRAM MESSAGES ──────────────────────────────
      if (entry.id === INSTAGRAM_ID) {
        if (entry.messaging) {
          for (const msg of entry.messaging) {
            if (msg.sender.id === INSTAGRAM_ID) {
              // Instagram page sent message → human takeover
              const recipientId = msg.recipient && msg.recipient.id;
              if (recipientId && recipientId !== INSTAGRAM_ID) {
                if (msg.message && msg.message.text && msg.message.text.startsWith('BOT_ON_')) {
                  const targetId = msg.message.text.replace('BOT_ON_', '').trim();
                  userState[targetId] = 'new';
                  delete userProfile[targetId];
                  console.log(`BOT REACTIVATED for ${targetId}`);
                } else {
                  userState[recipientId] = 'human_takeover';
                  console.log(`IG HUMAN TAKEOVER for ${recipientId}`);
                }
              }
              continue;
            }
            if (!msg.message || !msg.message.text) continue;
            const senderId = msg.sender.id;
            const text = msg.message.text.trim();
            await processMessage(senderId, text, 'Instagram', sendIGMessage, INSTAGRAM_ID);
          }
        }
        continue;
      }

      // ─── FACEBOOK MESSAGES ───────────────────────────────
      if (entry.messaging) {
        for (const msg of entry.messaging) {
          if (msg.sender.id === PAGE_ID) {
            const recipientId = msg.recipient && msg.recipient.id;
            if (recipientId && recipientId !== PAGE_ID) {
              if (msg.message && msg.message.text && msg.message.text.startsWith('BOT_ON_')) {
                const targetId = msg.message.text.replace('BOT_ON_', '').trim();
                userState[targetId] = 'new';
                delete userProfile[targetId];
                console.log(`BOT REACTIVATED for ${targetId}`);
              } else {
                userState[recipientId] = 'human_takeover';
                console.log(`FB HUMAN TAKEOVER for ${recipientId}`);
              }
            }
            continue;
          }
          if (!msg.message || !msg.message.text) continue;
          const senderId = msg.sender.id;
          const text = msg.message.text.trim();
          await processMessage(senderId, text, 'Facebook', sendFBMessage, PAGE_ID);
        }
      }

    }
  }
  res.status(200).send('EVENT_RECEIVED');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Ayusomam Herbals webhook running on port ${PORT}`));
