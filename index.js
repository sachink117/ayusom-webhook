"use strict";
const express=require("express"),crypto=require("crypto"),fetch=require("node-fetch"),Anthropic=require("@anthropic-ai/sdk"),path=require("path");
const firebase=require("./firebase"),notifications=require("./notifications");
const {persona,language,style,conversion}=require("./prompts/system");
const {terms}=require("./prompts/glossary");
const app=express(), claude=new Anthropic({apiKey:process.env.ANTHROPIC_API_KEY});
app.use(express.json());

// Dedup: prevent double-processing same message (Instagram sends via both entry.messaging AND entry.changes)
const processedMessageIds = new Set();
function isDuplicate(mid) {
    if(!mid) return false;
    if(processedMessageIds.has(mid)) return true;
    processedMessageIds.add(mid);
    if(processedMessageIds.size > 1000) processedMessageIds.delete(processedMessageIds.values().next().value);
    return false;
}

// QR code helper - generates scannable PNG from any URL via qrserver.com
function getQRUrl(link){ return `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(link)}`; }
const QR_499 = ()=>getQRUrl(process.env.PAYMENT_499_LINK);
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
                  for(const msg of entry.messaging||[]) {
                            if(msg.message&&!msg.message.is_echo) {
                                        if(isDuplicate(msg.message.mid)) continue;
                                        await handleIG(msg);
                            }
                  }
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
          if(isDuplicate(msg.id)) continue;
          await processMessage({userId:msg.from,text:msg.text.body,source:"whatsapp",platform:"whatsapp",name:contact.profile?.name||""});
    }
}

async function processMessage({userId,text,source,platform,name=""}) {
    try {
          let lead=await firebase.getLead(userId);
          if(!lead){
                  await firebase.createLead(userId,{name,source,platform});
                  lead={id:userId,name,source,platform,status:"new"};
          }
          await firebase.saveMessage(userId,"user",text);
          const history=await firebase.getHistory(userId,20);
          const reply=await getAIReply(lead,history);
          await firebase.saveMessage(userId,"assistant",reply);
          await firebase.updateLead(userId,{lastMessage:text,name:lead.name||name});
          if(platform==="instagram") {
                  await sendIGReply(userId,reply);
          } else if(platform==="whatsapp") {
                  await sendWAReply(userId,reply);
                  if(process.env.PAYMENT_499_LINK && reply.includes(process.env.PAYMENT_499_LINK)) {
                            await sendWAImage(userId, QR_499(), "Scan karke pay karo - 7-Day Sinus Reset Plan (Rs.499)");
                  } else if(process.env.PAYMENT_1299_LINK && reply.includes(process.env.PAYMENT_1299_LINK)) {
                            await sendWAImage(userId, QR_1299(), "Scan karke pay karo - 14-Day Deep Relief Plan (Rs.1299)");
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
          const token=process.env.PAGE_ACCESS_TOKEN||process.env.INSTAGRAM_TOKEN;
          console.log("[IG] Sending reply to",userId,"token starts:",token?.substring(0,10));
          const r=await fetch(`https://graph.facebook.com/v22.0/me/messages?access_token=${token}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({recipient:{id:userId},message:{text}})});
          const data=await r.json();
          if(data.error) console.error("[IG Reply Error]",JSON.stringify(
