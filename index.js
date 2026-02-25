const express = require('express');
const app = express();

app.use(express.json());

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
  console.log('=== NEW LEAD ===');
  console.log(JSON.stringify(body, null, 2));

  if (body.entry) {
    body.entry.forEach(entry => {
      // Facebook Messenger
      if (entry.messaging) {
        entry.messaging.forEach(msg => {
          const senderId = msg.sender.id;
          const text = msg.message && msg.message.text;
          console.log(`FACEBOOK LEAD - ID: ${senderId} - Message: ${text}`);
        });
      }
      // Instagram
      if (entry.changes) {
        entry.changes.forEach(change => {
          const val = change.value;
          const username = val.from && val.from.username;
          const text = val.message || (val.messages && val.messages[0].text);
          console.log(`INSTAGRAM LEAD - Username: ${username} - Message: ${text}`);
        });
      }
    });
  }

  res.status(200).send('EVENT_RECEIVED');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Ayusom webhook running on port ${PORT}`));
