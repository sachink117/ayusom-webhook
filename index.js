const express = require('express');
const https = require('https');
const http = require('http');
const app = express();

app.use(express.json());

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const GOOGLE_SHEET_URL = process.env.GOOGLE_SHEET_URL;

function saveToSheet(data) {
  const postData = JSON.stringify(data);
  const url = new URL(GOOGLE_SHEET_URL);
  
  const options = {
    hostname: url.hostname,
    path: url.pathname + url.search,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const req = https.request(options, res => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => console.log('Sheet saved:', body));
  });
  req.on('error', e => console.error('Sheet error:', e));
  req.write(postData);
  req.end();
}

function sendMessage(senderId, text) {
  const data = JSON.stringify({
    recipient: { id: senderId },
    message: { text: text }
  });

  const options = {
    hostname: 'graph.facebook.com',
    path: '/v18.0/me/messages?access_token=' + PAGE_ACCESS_TOKEN,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    }
  };

  const req = https.request(options, res => {
    console.log('Message sent, status:', res.statusCode);
  });
  req.on('error', e => console.error('Send error:', e));
  req.write(data);
  req.end();
}

// Meta webhook verification
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === 'ayusom2026') {
    console.log('Webhook verified');
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// Receive messages
app.post('/webhook', (req, res) => {
  const body = req.body;

  if (body.entry) {
    body.entry.forEach(entry => {
      if (entry.messaging) {
        entry.messaging.forEach(msg => {
          if (msg.message && msg.message.text) {
            const senderId = msg.sender.id;
            const text = msg.message.text;
            console.log(`FACEBOOK LEAD - ID: ${senderId} - Message: ${text}`);

            // Save to Google Sheet
            saveToSheet({
              timestamp: new Date().toISOString(),
              platform: 'Facebook',
              senderId: senderId,
              name: 'FB_' + senderId,
              message: text
            });

            // Auto reply
            sendMessage(senderId,
              `Namaste! 🙏 Ayusom Herbals mein aapka swagat hai.\n\nAapki sinus problem kitne samay se hai?\n\n1️⃣ 6 mahine se kam\n2️⃣ 6 mahine - 2 saal\n3️⃣ 2 saal se zyada\n\nBas number reply karein.`
            );
          }
        });
      }
    });
  }

  res.status(200).send('EVENT_RECEIVED');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Ayusom webhook running on port ${PORT}`));
