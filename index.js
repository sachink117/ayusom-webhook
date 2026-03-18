"use strict";
const express=require("express"),crypto=require("crypto"),fetch=require("node-fetch"),Anthropic=require("@anthropic-ai/sdk"),path=require("path");
const firebase=require("./firebase"),notifications=require("./notifications");
const {persona,language,style,conversion}=require("./prompts/system");
const {terms}=require("./prompts/glossary");
const app=express(), claude=new Anthropic({apiKey:process.env.ANTHROPIC_API_KEY});
app.use(express.json());

// QR code helper — generates scannable PNG from any URL via qrserver.com
function getQRUrl(link){ return `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(link)}`; }
const QR_499  = ()=>getQRUrl(process.env.PAYMENT_499_LINK);
const QR_1299 = ()=>getQRUrl(process.env.PAYMENT_1299_LINK);

app.get("/health",(req,res)=>res.json({status:"ok",version:"2.1",time:new Date().toISOString()}));

app.get("/webhook",(req,res)=>{
  if(req.query["hub.mode"]==="subscribe"&&req.query["hub.verify_token"]===process.env.WEBHOOK_VERIFY_TOKEN)
    return res.send(req.query["hub.challenge"]);
  res.sendStatus(403);
});

app.post("/webhook",async(req,res)=>{
  res.sendStatus(200);
  try {
    const body=req.body;
    if(!body.object) return;
    for(const entry of body.entry||[]) {
      for(const msg of entry.messaging||[])
        if(msg.message&&!msg.message.is_echo) await handleIG(msg);
      for(const change of entry.changes||[])
        if(change.field==="messages") await handleWA(change.value);
    }
  } catch(e){ console.error("[Webhook]",e.message); }
});

async function handleIG(event) {
  const userId=event.sender.id, text=event.message?.text;
  if(!text) return;
  await processMessage({userId,text,source:"instagram",platform:"instagram"});
}

async function handleWA(value) {
  const contact=value.contacts?.[0]||{};
  for(const msg of value.messages||[]) {
    if(msg.type!=="text") continue;
    await processMessage({userId:msg.from,text:msg.text.body,source:"whatsapp",platform:"whatsapp",name:contact.profile?.name||""});
  }
}

async function processMessage({userId,text,source,platform,name=""}) {
  try {
    let lead=await firebase.getLead(userId);
    if(!lead){ await firebase.createLead(userId,{name,source,platform}); lead={id:userId,name,source,platform,status:"new"}; }
    await firebase.saveMessage(userId,"user",text);
    const history=await firebase.getHistory(userId,20);
    const reply=await getAIReply(lead,history);
    await firebase.saveMessage(userId,"assistant",reply);
    await firebase.updateLead(userId,{lastMessage:text,name:lead.name||name});

    if(platform==="instagram") {
      await sendIGReply(userId,reply);
    } else if(platform==="whatsapp") {
      await sendWAReply(userId,reply);
      // Auto-send QR image when a payment link appears in the reply
      if(process.env.PAYMENT_499_LINK && reply.includes(process.env.PAYMENT_499_LINK)) {
        await sendWAImage(userId, QR_499(), "📲 Scan karke pay karo — 7-Day Sinus Reset Plan (Rs.499)");
      } else if(process.env.PAYMENT_1299_LINK && reply.includes(process.env.PAYMENT_1299_LINK)) {
        await sendWAImage(userId, QR_1299(), "📲 Scan karke pay karo — 14-Day Deep Relief Plan (Rs.1299)");
      }
    }
  } catch(e){ console.error("[ProcessMessage]",e.message); }
}

async function getAIReply(lead,history) {
  const glossary=Object.entries(terms).map(([w,r])=>`- Never say "${w}" - say "${r}"`).join("\n");
  const system=`${persona}\n${language}\n${style}\n${conversion}\n\nGLOSSARY:\n${glossary}\n\nLEAD: Name=${lead.name||"Unknown"}, Source=${lead.source}, Status=${lead.status}\nPLANS: Basic Rs.499 = ${process.env.PAYMENT_499_LINK} | Complete Rs.1299 = ${process.env.PAYMENT_1299_LINK}`;
  const response=await claude.messages.create({model:"claude-sonnet-4-6",max_tokens:500,system,messages:history.map(m=>({role:m.role,content:m.content}))});
  return response.content[0].text;
}

async function sendIGReply(userId,text) {
  try {
    await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${process.env.INSTAGRAM_TOKEN}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({recipient:{id:userId},message:{text}})});
  } catch(e){ console.error("[IG Reply]",e.message); }
}

async function sendWAReply(phone,text) {
  try {
    await fetch(`https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,{method:"POST",headers:{Authorization:`Bearer ${process.env.WHATSAPP_TOKEN}`,"Content-Type":"application/json"},body:JSON.stringify({messaging_product:"whatsapp",to:phone,type:"text",text:{body:text}})});
  } catch(e){ console.error("[WA Reply]",e.message); }
}

async function sendWAImage(phone,imageUrl,caption) {
  try {
    await fetch(`https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,{method:"POST",headers:{Authorization:`Bearer ${process.env.WHATSAPP_TOKEN}`,"Content-Type":"application/json"},body:JSON.stringify({messaging_product:"whatsapp",to:phone,type:"image",image:{link:imageUrl,caption}})});
  } catch(e){ console.error("[WA Image]",e.message); }
}

app.post("/payment/webhook",express.raw({type:"application/json"}),async(req,res)=>{
  try {
    const sig=req.headers["x-razorpay-signature"];
    const exp=crypto.createHmac("sha256",process.env.RAZORPAY_WEBHOOK_SECRET).update(req.body).digest("hex");
    if(sig!==exp) return res.status(400).json({error:"Invalid signature"});
    res.sendStatus(200);
    const event=JSON.parse(req.body);
    if(event.event!=="payment.captured") return;
    const p=event.payload.payment.entity;
    const amount=p.amount/100, plan=amount>=1299?"Complete (Rs.1299)":"Basic (Rs.499)";
    await firebase.savePayment({razorpayId:p.id,name:p.name,email:p.email,phone:p.contact,amount,plan,status:"captured"});
    await firebase.createMember({name:p.name,email:p.email,phone:p.contact,plan,amount,paymentId:p.id,userId:p.contact});
    await notifications.notifyPaymentReceived({name:p.name,phone:p.contact,email:p.email,amount,plan});
    console.log(`[Payment] Rs.${amount} from ${p.name}`);
  } catch(e){ console.error("[Payment]",e.message); }
});

app.post("/api/lead",async(req,res)=>{
  try {
    const{name,phone,email,problem,source="website"}=req.body;
    if(!phone) return res.status(400).json({error:"Phone required"});
    const uid=`web_${phone}`;
    if(!await firebase.getLead(uid)) await firebase.createLead(uid,{name,phone,email,problem,source});
    res.json({ok:true});
    if(problem) await processMessage({userId:uid,text:problem,source:"website",platform:"whatsapp",name});
  } catch(e){ console.error("[Lead API]",e.message); res.status(500).json({error:e.message}); }
});

function adminAuth(req,res,next){
  const key=req.query.key||req.headers["x-admin-key"];
  if(key!==process.env.ADMIN_PASSWORD) return res.status(401).send("<h2>Access denied. Add ?key=YOUR_PASSWORD to URL</h2>");
  next();
}
app.get("/admin",adminAuth,(req,res)=>res.sendFile(path.join(__dirname,"admin","dashboard.html")));
app.get("/admin/data",adminAuth,async(req,res)=>{
  const[leads,members,payments]=await Promise.all([firebase.getAllLeads(),firebase.getAllMembers(),firebase.getAllPayments()]);
  res.json({leads,members,payments});
});
app.get("/admin/lead/:uid/history",adminAuth,async(req,res)=>res.json(await firebase.getHistory(req.params.uid,100)));
app.use("/public",express.static(path.join(__dirname,"public")));

const PORT=process.env.PORT||3000;
app.listen(PORT,()=>console.log(`[Ayusomam v2.1] Running on port ${PORT}`));
