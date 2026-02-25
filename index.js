const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.use(express.json());

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const GOOGLE_SHEET_URL = process.env.GOOGLE_SHEET_URL;
const PAGE_ID = '1035532399636645';
const PAYMENT_LINK = 'https://rzp.io/rzp/qu8zhQT';
const WHATSAPP_NUMBER = '+91 85951 60713';

const userState = {};
const userProfile = {};

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

async function sendMessage(senderId, text) {
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
    console.log('Message sent, status:', response.status);
  } catch(err) {
    console.error('Send error:', err.message);
  }
}

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
      if (entry.messaging) {
        for (const msg of entry.messaging) {
          if (msg.sender.id === PAGE_ID) continue;
          if (!msg.message || !msg.message.text) continue;

          const senderId = msg.sender.id;
          const text = msg.message.text.trim();
          const state = userState[senderId] || 'new';
          const profile = userProfile[senderId] || {};

          console.log(`LEAD - ID: ${senderId} - State: ${state} - Message: ${text}`);

          await saveToSheet({
            timestamp: new Date().toISOString(),
            platform: 'Facebook',
            senderId: senderId,
            name: 'FB_' + senderId,
            message: text
          });

          // Handle contact/whatsapp request at any stage
          if (
            text.toLowerCase().includes('whatsapp') ||
            text.toLowerCase().includes('contact') ||
            text.toLowerCase().includes('call') ||
            text.toLowerCase().includes('phone') ||
            text.toLowerCase().includes('helpline') ||
            text.toLowerCase().includes('direct')
          ) {
            await sendMessage(senderId,
`Bilkul! Aap seedha hamare specialist se WhatsApp pe baat kar sakte hain. 🙏

📱 WhatsApp: ${WHATSAPP_NUMBER}

Hum personally aapki problem sunenge aur sahi guidance denge.
(You can reach our Ayurvedic specialist directly on WhatsApp anytime.)

Ayusom Herbals 🌿`
            );
            continue;
          }

          if (state === 'new') {
            userState[senderId] = 'asked_duration';
            await sendMessage(senderId,
`🙏 Namaste! Ayusom Herbals mein aapka swagat hai.

Hum chronic sinus conditions ka Ayurvedic treatment karte hain — naturally, bina spray ya steroid dependency ke.
(We specialize in Ayurvedic treatment for chronic sinus — without dependency on sprays or steroids.)

Aapke liye personalized assessment ke liye kuch quick questions —

✦ Aapko sinus ki problem kitne samay se hai?
(How long have you been suffering from sinus?)

1️⃣ 6 mahine se kam (Less than 6 months)
2️⃣ 6 mahine se 2 saal (6 months – 2 years)
3️⃣ 2 saal se zyada (More than 2 years)

Number reply karein.`
            );

          } else if (state === 'asked_duration') {
            if (!['1','2','3'].includes(text)) {
              await sendMessage(senderId, `Kripya 1, 2 ya 3 mein se reply karein. 🙏\n(Please reply with 1, 2 or 3.)`);
            } else {
              const duration = text === '1' ? '6 mahine se kam' : text === '2' ? '6 mahine se 2 saal' : '2 saal se zyada';
              userProfile[senderId] = { ...profile, duration };
              userState[senderId] = 'asked_symptoms';
              await sendMessage(senderId,
`Noted. ✅

✦ Aapke mukhya symptoms kya hain?
(What are your main symptoms?)

1️⃣ Naak band rehna (Blocked nose)
2️⃣ Sar dard aur chehra bhaari rehna (Headache & facial pressure)
3️⃣ Otrivin / nasal spray pe depend ho gaya (Spray dependency)
4️⃣ Gale mein balgam rehna (Post nasal drip)
5️⃣ Raat ko neend nahi aati (Sleep disruption)

Number reply karein.`
              );
            }

          } else if (state === 'asked_symptoms') {
            const symptomMap = {
              '1': 'Naak band rehna',
              '2': 'Sar dard aur facial pressure',
              '3': 'Otrivin/spray dependency',
              '4': 'Post nasal drip',
              '5': 'Sleep disruption'
            };
            const symptom = symptomMap[text] || text;
            userProfile[senderId] = { ...profile, symptom };
            userState[senderId] = 'asked_tried';
            await sendMessage(senderId,
`Samajh gaya. ✅

✦ Pehle koi treatment try ki hai?
(Have you tried any treatment before?)

1️⃣ Sirf nasal spray (Only nasal sprays)
2️⃣ Doctor ki allopathy dawai (Allopathy medicines)
3️⃣ Ghar ke nuskhe (Home remedies)
4️⃣ Abhi kuch nahi kiya (Nothing yet)
5️⃣ Koi aur Ayurvedic treatment (Other Ayurvedic)`
            );

          } else if (state === 'asked_tried') {
            const treatmentMap = {
              '1': 'sirf nasal spray',
              '2': 'allopathy medicines',
              '3': 'ghar ke nuskhe',
              '4': 'kuch nahi',
              '5': 'other Ayurvedic'
            };
            const tried = treatmentMap[text] || text;
            userProfile[senderId] = { ...profile, tried };
            userState[senderId] = 'asked_severity';
            await sendMessage(senderId,
`Samajh gaya. ✅

✦ Sinus aapki daily life ko kitna affect karta hai?
(How severely does sinus affect your daily life?)

1️⃣ Thodi problem — kabhi kabhi (Mild — occasional)
2️⃣ Kaafi problem — kaam aur neend affect hoti hai (Moderate)
3️⃣ Bahut zyada — daily routine affect hai (Severe)
4️⃣ Extreme — normal kaam karna mushkil hai (Very severe)`
            );

          } else if (state === 'asked_severity') {
            const severityMap = {
              '1': 'Mild', '2': 'Moderate', '3': 'Severe', '4': 'Very Severe'
            };
            const severity = severityMap[text] || 'Moderate';
            userProfile[senderId] = { ...profile, severity };
            userState[senderId] = 'pitched';

            const p = userProfile[senderId];

            await sendMessage(senderId,
`📋 Assessment Complete ✅

Aapki details:
- Problem duration: ${p.duration}
- Main symptom: ${p.symptom}
- Previous treatment: ${p.tried}
- Severity: ${p.severity}

─────────────────────
🌿 HAMARE SPECIALIST KA ASSESSMENT
─────────────────────
Aapki condition mein Prana Vaha Srotas blockage hai aur respiratory tract mein Ama (toxins) accumulated hain — yeh chronic sinus ka Ayurvedic diagnosis hai.

Allopathic approach sirf symptoms suppress karta hai, root cause solve nahi karta. Isliye zyada log saalon tak spray pe dependent rehte hain.

Ayusom ka protocol root cause pe kaam karta hai.
(Our protocol addresses the root cause — not just symptoms.)

─────────────────────
🌿 AYUSOM 14-DAY SINUS PROGRAM
─────────────────────
✅ Aapke sinus type ke liye personalized diet plan
✅ Nasya therapy — Ayurvedic nasal cleansing
✅ Herbal Kadha protocol
✅ Steam therapy routine
✅ 14 din direct WhatsApp guidance

⭐ Verified Result:
Shikha Tyagi ji (similar profile) — Day 14: naak 90% clear, Otrivin completely stopped. ✅

─────────────────────
Investment: ₹1,299 only
─────────────────────

Kya aap apna program shuru karna chahte hain?
(Would you like to begin your healing journey?)

Reply karein YES. 🙏`
            );

          } else if (state === 'pitched') {
            if (['yes','haan','han','ha','y','हाँ','हां'].includes(text.toLowerCase())) {
              userState[senderId] = 'done';
              await sendMessage(senderId,
`Bahut achha! 🙏

Aapka 14-day personalized Ayurvedic Sinus Program confirm karne ke liye payment karein:

💳 Payment Link: ${PAYMENT_LINK}
Amount: ₹1,299

Payment ke baad aapko WhatsApp pe milega:
✅ Aapka personalized 14-day plan
✅ Daily guidance schedule
✅ Direct specialist contact

Payment karte waqt apna WhatsApp number zaroor daalein — usi pe aapka plan bheja jayega.
(Please enter your WhatsApp number during payment — your plan will be sent there.)

Koi problem ho toh seedha WhatsApp karein:
📱 ${WHATSAPP_NUMBER}

Ayusom Herbals 🌿`
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
              await sendMessage(senderId,
`Poora 14-day program sirf ₹1,299 mein.
(Complete 14-day program is ₹1,299 only.)

Isme shamil hai:
✅ Aapke specific sinus type ke liye personalized plan
✅ 14 din WhatsApp guidance
✅ Diet + Nasya + Kadha + Steam protocol
✅ Daily morning & evening support

Lasting natural relief ke liye — yeh sabse effective aur affordable solution hai.

Reply karein YES to begin. 🙏`
              );

            } else {
              await sendMessage(senderId,
`Koi bhi sawaal poochh sakte hain — hum yahan hain. 🙏
(Feel free to ask any questions.)

Kya aap program shuru karna chahte hain? Reply YES.`
              );
            }

          } else if (state === 'done') {
            await sendMessage(senderId,
`Shukriya! 🙏

Kisi bhi help ke liye seedha WhatsApp karein:
📱 ${WHATSAPP_NUMBER}

Hum aapki poori madad karenge.
(For any assistance, WhatsApp us directly. We are here to help.)

Ayusom Herbals 🌿`
            );
          }
        }
      }
    }
  }
  res.status(200).send('EVENT_RECEIVED');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Ayusom webhook running on port ${PORT}`));
