# Ayusomam Herbals — Google Flow Video Workflow Guide

## Quick Start (No API Key Needed)

### Step 1: Open Flow
Go to **https://flow.google** and sign in with Google account.

### Step 2: Get Google AI Pro ($19.99/mo)
Required for Veo 3.1 video generation. Yeh investment first week mein wapas aa jayega.

### Step 3: Generate Videos
Run this command to see all prompts:
```bash
node video-scripts/generate-videos.js list
```
Copy any prompt → Paste in Flow → Set 9:16 → Generate → Download

---

## Content Calendar (1 Week = 8 Reels)

| Day | Video | Goal |
|-----|-------|------|
| Mon | Sinus 3+ Saal Se Hai? | Hook — grab attention |
| Tue | Spray Liya, Tablet Khayi | Agitate the problem |
| Wed | 6 Types of Sinus | Educate — build authority |
| Thu | AI Se Pata Karo Sinus Type | Show the solution |
| Fri | Nasal Spray Chhodni Hai? | Target spray users |
| Sat | 7 Din Mein Sinus Reset | Sell the protocol |
| Sun | 500+ Logon Ne Try Kiya | Social proof |
| Mon | Sinus Mein Yeh Galti Mat Karna | Educational + CTA |

---

## Flow UI Step-by-Step (Manual Process)

### For Each Video:

1. **Open Flow** → https://flow.google
2. **Create New Project** → Name it "Ayusomam - [Video Title]"
3. **Generate Keyframe Images First** (better results):
   - Use Nano Banana (built into Flow) to create still images
   - Example: "Indian woman holding nose in pain, cinematic lighting, 9:16"
   - Save 2-3 keyframes as reference images
4. **Generate Video**:
   - Click "Create Video"
   - Paste the prompt from `generate-videos.js list`
   - Attach keyframe images as reference (use @ to reference)
   - Set aspect ratio: **9:16 (Portrait)**
   - Click Generate
5. **Generate 2-3 Variations** → Pick the best one
6. **Download** → MP4 format

### Post-Production (CapCut/YouTube Create):
1. Import Flow video into CapCut (free) or YouTube Create
2. Add **Hindi text overlays** (from caption in script)
3. Add **CTA end card**: "WhatsApp pe SINUS bhejo: 8595160713"
4. Add **background music** (trending audio for more reach)
5. Export at 1080x1920 (9:16)

---

## Posting Strategy

### Instagram Reels:
- Post time: **8 AM or 8 PM IST**
- Use ALL 30 hashtags (from caption files)
- Add location: India
- Caption mein WhatsApp number daalo
- Reply to EVERY comment within 1 hour (algorithm boost)
- Stories pe reshare with "DM me SINUS" sticker

### YouTube Shorts:
- Same video, add description from `sinus-short-script.md`
- Title mein "sinus" aur "Hindi" zaroor daalo
- Tags: sinus, sinus treatment, sinus ka ilaj, ayurveda

### WhatsApp Status:
- 30 second version upload karo
- Contact list mein sab dekhenge
- Direct lead generation

### Facebook Reels:
- Same content cross-post karo
- Groups mein bhi share karo (health groups)

---

## Pro Tips for Viral Hindi Content

1. **Hook first 2 seconds** — Sabse important. Text overlay BOLD aur readable rakho
2. **Hindi mein baat karo** — English nahi, pure Hindi/Hinglish
3. **Pain point pe focus** — "Spray se thak gaye?" > "Humara product best hai"
4. **CTA har video mein** — WhatsApp number ya "Link in bio"
5. **Consistency > Quality** — Daily 1 reel > weekly 1 perfect reel
6. **Comment replies** — Bot se bhi karo, manually bhi karo
7. **Trending audio** — Flow video pe trending Hindi audio lagao for extra reach
8. **Batch create** — Sunday ko 7 videos banao, daily schedule karo

---

## API Automation (When Ready)

```bash
# Set your Google AI API key
export GOOGLE_AI_API_KEY=your-key-here

# Generate single video
node video-scripts/generate-videos.js hook-sinus-suffering

# Generate all 8 videos at once
node video-scripts/generate-videos.js all

# Videos saved in video-scripts/generated/
```

Pricing: ~$0.15-0.40/second via API. 10 second video = $1.50-4.00
Monthly budget for 30 videos: ~$50-120 (Rs 4,000-10,000)

---

## ROI Calculation

- Video creation cost: Rs 4,000/month (API) or Rs 1,700/month (Google AI Pro manual)
- If 1 video gets 10,000 views → ~100 WhatsApp leads
- If 10% convert to Rs 499 plan = 10 sales = Rs 4,990
- **ROI: 3x-10x on first month itself**

Even 1 viral reel can bring 500+ leads to your bot.
