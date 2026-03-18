# Social Media Automation + AI Stack Recommendations

## For: Ayusom Webhook (Instagram, Facebook, WhatsApp, Lead Gen, Campaigns, Data Storage)

---

## Current Stack Analysis

| Layer | Current | Status |
|-------|---------|--------|
| Backend | Node.js + Express | OK - keep |
| AI | Claude Sonnet (Anthropic SDK) | OK - keep |
| DB | Firebase/Firestore | Limited - needs upgrade path |
| Instagram | Playwright scraping + Graph API | Fragile - needs official API |
| WhatsApp | Graph API v18.0 + MSG91 | OK - upgrade to v21.0 |
| Facebook | Partial (page token only) | Needs full Conversions API |
| Payments | Razorpay | OK - keep |
| Email/SMS | Nodemailer + MSG91 | OK - keep |
| Video | Google Veo 3.1 | Good - keep |
| Campaigns | None | Needs building |
| CRM/Leads | Basic Firestore | Needs structured pipeline |
| Analytics | None | Needs building |
| Deployment | Render free tier | Needs upgrade for reliability |

---

## Recommended Stack (Tier-Based)

### TIER 1: Budget-Friendly (Your current resources + upgrades)
**Best if**: You want to maximize what you have, spend < Rs 5K/month

| Component | Tool | Cost | Why |
|-----------|------|------|-----|
| **Backend** | Node.js + Express (keep) | Free | Already built |
| **AI Chat** | Claude Sonnet 4.6 (keep) | ~$10-30/mo | Best for Hinglish conversations |
| **AI Leads Scoring** | Claude Haiku 4.5 | ~$2-5/mo | Fast, cheap for classification |
| **Database** | Firebase Firestore (keep) | Free tier | Already integrated |
| **Instagram** | Meta Graph API (official) | Free | Replace Playwright - more stable |
| **Facebook** | Meta Conversions API | Free | Lead tracking + retargeting |
| **WhatsApp** | WhatsApp Cloud API (official) | Free (1K convos/mo) | Already using, upgrade version |
| **Campaigns** | Custom Node.js scheduler | Free | Build in-app |
| **Landing Pages** | Existing chatbot widget | Free | Already built |
| **Deployment** | Render Starter ($7/mo) | ~Rs 600/mo | No sleep, better uptime |
| **Analytics** | Firestore + Admin Dashboard | Free | Enhance existing dashboard |

**Total: ~Rs 2,000-4,000/month**

---

### TIER 2: Growth Stack (Best balance of power + cost)
**Best if**: You want serious automation, spend Rs 5K-15K/month

| Component | Tool | Cost | Why |
|-----------|------|------|-----|
| **Backend** | Node.js + Express + BullMQ | Free | Job queues for campaigns |
| **AI Chat** | Claude Sonnet 4.6 | ~$20/mo | Conversations |
| **AI Scoring** | Claude Haiku 4.5 | ~$5/mo | Lead scoring, classification |
| **AI Content** | Claude + Veo 3.1 | ~$10/mo | Auto-generate reels, posts |
| **Database** | Supabase (PostgreSQL) | Free-$25/mo | Better queries, real-time, auth |
| **Redis** | Upstash Redis | Free tier | Queue + caching |
| **Instagram** | Meta Graph API + Content Publishing API | Free | Posts, stories, reels |
| **Facebook** | Conversions API + Lead Ads | Free (API) | Capture leads from FB ads |
| **WhatsApp** | WhatsApp Cloud API + Flows | Free-$$ | Interactive menus, forms |
| **Campaigns** | BullMQ + node-cron | Free | Drip campaigns, follow-ups |
| **CRM** | Custom pipeline (Supabase) | Free | Kanban-style lead stages |
| **Email Marketing** | Resend or Brevo | Free tier | Drip email sequences |
| **Analytics** | PostHog (self-hosted) or Mixpanel | Free tier | Funnels, retention |
| **Deployment** | Railway or Render Pro | $5-20/mo | Auto-scaling |

**Total: ~Rs 5,000-12,000/month**

---

### TIER 3: Scale Stack (Full enterprise automation)
**Best if**: You're ready to scale to 1000+ leads/month, spend Rs 15K+

| Component | Tool | Cost | Why |
|-----------|------|------|-----|
| **Backend** | NestJS (Node.js) | Free | Better structure at scale |
| **AI Orchestration** | LangChain/LangGraph + Claude | ~$50/mo | Multi-step AI workflows |
| **Database** | Supabase + TimescaleDB | $25/mo | Transactional + time-series |
| **Cache/Queue** | Redis (Upstash Pro) | $10/mo | Rate limiting, sessions |
| **All Meta** | Full Meta Business Suite API | Free | Unified IG/FB/WA |
| **WhatsApp** | Official BSP (Gupshup/Wati) | Rs 5K+/mo | Templates, broadcasts, flows |
| **Campaigns** | Temporal.io workflows | Free (self-hosted) | Complex campaign orchestration |
| **CRM** | Twenty CRM (open-source) | Free | Full CRM, API-first |
| **Analytics** | PostHog + Metabase | Free (self-hosted) | Full BI dashboards |
| **CDN/Media** | Cloudflare R2 | Free tier | Store images, videos |
| **Deployment** | AWS/GCP with Docker | $30-50/mo | Full control |

**Total: ~Rs 15,000-30,000/month**

---

## Recommended Architecture (Tier 2 - Best for You)

```
                    +------------------+
                    |   Meta Webhooks  |
                    | (IG + FB + WA)   |
                    +--------+---------+
                             |
                    +--------v---------+
                    |  Express Server  |
                    |  (Unified API)   |
                    +--------+---------+
                             |
              +--------------+--------------+
              |              |              |
     +--------v---+  +------v------+  +----v--------+
     | AI Engine  |  | Campaign    |  | Lead        |
     | (Claude)   |  | Engine      |  | Pipeline    |
     | - Chat     |  | (BullMQ)    |  | - Scoring   |
     | - Scoring  |  | - Drips     |  | - Stages    |
     | - Content  |  | - Follow-up |  | - Assignment|
     +--------+---+  +------+------+  +----+--------+
              |              |              |
              +--------------+--------------+
                             |
                    +--------v---------+
                    |    Supabase      |
                    | (PostgreSQL)     |
                    | - leads          |
                    | - conversations  |
                    | - campaigns      |
                    | - payments       |
                    | - analytics      |
                    +------------------+
```

---

## Key APIs & Resources

### Meta/Facebook

| API | Use | Link |
|-----|-----|------|
| **Instagram Graph API** | Send/receive DMs, post content | https://developers.facebook.com/docs/instagram-api |
| **Instagram Content Publishing** | Auto-post reels, stories | https://developers.facebook.com/docs/instagram-platform/content-publishing |
| **WhatsApp Cloud API** | Messages, templates, flows | https://developers.facebook.com/docs/whatsapp/cloud-api |
| **WhatsApp Flows** | Interactive forms in WhatsApp | https://developers.facebook.com/docs/whatsapp/flows |
| **Facebook Conversions API** | Track leads from FB ads | https://developers.facebook.com/docs/marketing-api/conversions-api |
| **Facebook Lead Ads** | Capture leads directly | https://developers.facebook.com/docs/marketing-api/guides/lead-ads |
| **Meta Business Suite API** | Unified management | https://developers.facebook.com/docs/pages-api |

### AI & Content

| Tool | Use | Link |
|------|-----|------|
| **Anthropic Claude API** | Chat, scoring, content | https://docs.anthropic.com/en/api |
| **Claude Haiku** | Fast lead scoring | Use model: claude-haiku-4-5-20251001 |
| **Google Veo 3.1** | Video generation | Already integrated |
| **Replicate** | Image generation for posts | https://replicate.com |

### Database & Infrastructure

| Tool | Use | Link |
|------|-----|------|
| **Supabase** | PostgreSQL + Auth + Realtime | https://supabase.com |
| **Upstash Redis** | Queues + rate limiting | https://upstash.com |
| **BullMQ** | Job scheduling | https://docs.bullmq.io |
| **Cloudflare R2** | Media storage | https://developers.cloudflare.com/r2 |

### Campaign & Marketing

| Tool | Use | Link |
|------|-----|------|
| **Resend** | Transactional + marketing email | https://resend.com |
| **MSG91** | SMS + WhatsApp templates | Already integrated |
| **node-cron** | Scheduled tasks | https://www.npmjs.com/package/node-cron |

### Analytics & CRM

| Tool | Use | Link |
|------|-----|------|
| **PostHog** | Product analytics | https://posthog.com |
| **Mixpanel** | Event analytics | https://mixpanel.com (free tier) |
| **Twenty CRM** | Open-source CRM | https://twenty.com |

---

## Implementation Priority (What to Build First)

### Phase 1: Fix Foundations (Week 1-2)
1. Replace Playwright Instagram with official Graph API
2. Upgrade WhatsApp API to v21.0
3. Add structured lead pipeline stages in Firestore
4. Add AI lead scoring with Claude Haiku

### Phase 2: Campaign Engine (Week 3-4)
1. Add BullMQ for job scheduling
2. Build drip campaign system (auto follow-ups)
3. Build broadcast messaging (WhatsApp templates)
4. Add campaign analytics tracking

### Phase 3: Facebook + Leads (Week 5-6)
1. Integrate Facebook Conversions API
2. Set up Facebook Lead Ads webhook
3. Unified inbox (IG + FB + WA in one dashboard)
4. Enhanced admin dashboard with charts

### Phase 4: Content Automation (Week 7-8)
1. Auto-generate reels with Veo 3.1 on schedule
2. Auto-post to Instagram via Content Publishing API
3. AI-generated captions and hashtags (Claude)
4. Content calendar in dashboard

### Phase 5: Scale (Week 9-10)
1. Migrate to Supabase if Firestore limits hit
2. Add PostHog analytics
3. A/B testing for message templates
4. Multi-language support expansion

---

## Quick Wins (Do This Week)

### 1. AI Lead Scoring (add to index.js)
```javascript
// Use Claude Haiku for fast, cheap lead scoring
async function scoreLeadWithAI(messages) {
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 100,
    system: `Score this lead 1-10 based on: intent to buy, problem severity,
             engagement level. Return JSON: {score, reason, nextAction}`,
    messages: [{ role: 'user', content: messages.join('\n') }]
  });
  return JSON.parse(response.content[0].text);
}
```

### 2. Auto Follow-Up (add cron job)
```javascript
// Follow up with leads who went quiet for 24 hours
const cron = require('node-cron');
cron.schedule('0 10 * * *', async () => {  // Every day at 10 AM
  const staleLeads = await getStaleLeads(24); // hours
  for (const lead of staleLeads) {
    await sendFollowUp(lead);
  }
});
```

### 3. Lead Pipeline Stages
```
New -> Engaged -> Qualified -> Payment Sent -> Converted -> Member
                                    |
                                    v
                              Follow-up needed
```

---

## Free/Open-Source Alternatives

| Paid Tool | Free Alternative | Notes |
|-----------|-----------------|-------|
| Wati/Gupshup | WhatsApp Cloud API (direct) | Free 1K convos/mo |
| HubSpot CRM | Twenty CRM (open source) | Self-hosted |
| Mixpanel | PostHog (open source) | Self-hosted |
| Mailchimp | Listmonk (open source) | Self-hosted email |
| Hootsuite | Your own scheduler (BullMQ) | Custom built |
| ManyChat | Your existing bot (Claude) | Already better |
| Zapier | n8n (open source) | Self-hosted automation |

---

## Summary: My Recommendation

**Go with Tier 2 (Growth Stack)** because:

1. You already have 80% of the foundation built
2. Claude AI is already your best asset - use Haiku for scoring (cheap + fast)
3. Replace Playwright with official APIs - much more reliable
4. Add BullMQ for campaigns - one npm package transforms your capabilities
5. Keep Firestore for now, migrate to Supabase only when needed
6. Total investment: ~Rs 5K-8K/month for a system that rivals Rs 50K+/month SaaS tools

**Your biggest ROI moves:**
- AI lead scoring (converts 2-3x more leads)
- Auto follow-ups (catches 40% of leads that would go cold)
- WhatsApp broadcast campaigns (80%+ open rates)
- Auto-posting reels (already have Veo 3.1 - just schedule it)
