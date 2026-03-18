const nodemailer = require("nodemailer");
const fetch = require("node-fetch");

const mailer = nodemailer.createTransport({
  host:"smtp.hostinger.com", port:587, secure:false,
  auth:{ user:"support@ayusomamherbals.com", pass:process.env.SMTP_PASS }
});

async function sendEmail({to,subject,html}) {
  try {
    await mailer.sendMail({ from:'"Ayusomam Herbals" <support@ayusomamherbals.com>', to,subject,html });
    console.log("[Email] Sent to",to);
  } catch(e) { console.error("[Email]",e.message); }
}

async function sendSMS(phone, message) {
  try {
    const mobile = phone.startsWith("+") ? phone.slice(1) : "91"+phone;
    const r = await fetch("https://api.msg91.com/api/v5/flow/", {
      method:"POST",
      headers:{"authkey":process.env.MSG91_AUTH_KEY,"Content-Type":"application/json"},
      body:JSON.stringify({template_id:process.env.MSG91_SMS_TEMPLATE_ID,sender:process.env.MSG91_SENDER_ID||"AYUSOM",mobiles:mobile,VAR1:message})
    });
    console.log("[SMS]",(await r.json()).type);
  } catch(e) { console.error("[SMS]",e.message); }
}

async function sendWhatsApp(phone, templateName, vars={}) {
  try {
    const mobile = phone.startsWith("+") ? phone.slice(1) : "91"+phone;
    await fetch("https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/", {
      method:"POST",
      headers:{"authkey":process.env.MSG91_AUTH_KEY,"Content-Type":"application/json"},
      body:JSON.stringify({
        integrated_number:process.env.MSG91_WA_NUMBER,
        content_type:"template",
        payload:{ to:mobile, type:"template", template:{ name:templateName, language:{code:"en"}, components:Object.values(vars).map(v=>({type:"body",parameters:[{type:"text",text:String(v)}]})) }}
      })
    });
    console.log("[WhatsApp] Sent");
  } catch(e) { console.error("[WhatsApp]",e.message); }
}

async function notifyPaymentReceived({name,phone,email,amount,plan}) {
  await Promise.allSettled([
    sendSMS(phone, `Ayusomam: Payment Rs.${amount} confirmed. Welcome to ${plan}! Support: support@ayusomamherbals.com`),
    sendWhatsApp(phone, "ayusomam_payment_confirm", {name,amount,plan}),
    email ? sendEmail({
      to:email,
      subject:`Welcome to Ayusomam! Payment ₹${amount} Confirmed`,
      html:`<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px"><h2 style="color:#2d7a4f">🌿 Namaste ${name}!</h2><p>Aapka payment <strong>₹${amount}</strong> successfully receive ho gaya hai.</p><p>You are now enrolled in <strong>Ayusomam ${plan}</strong>.</p><p>Humara team kal subah WhatsApp pe connect karega.</p><br/><p>Koi sawaal ho toh reply karein 👇<br/>📧 support@ayusomamherbals.com</p><p style="color:#888;font-size:12px">— Team Ayusomam Herbals</p></div>`
    }) : Promise.resolve()
  ]);
}

module.exports = { sendEmail, sendSMS, sendWhatsApp, notifyPaymentReceived };
