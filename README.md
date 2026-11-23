# Codebase Revival

SMFTA AI workspace built with TypeScript, TanStack Start, Supabase/Lovable Cloud and multiple AI provider integrations.

## AI platform upgrade

The `feature/ai-platform-upgrade` branch introduces resilient AI orchestration utilities for context management, retries, timeouts, structured output parsing and deterministic usage estimation. Provider-specific routing remains in `src/smfta/server/providers.ts`; shared server-side helpers live in `src/smfta/server/aiPlatform.ts`.

## Development

```sh
bun install
bun run dev
```

## Validation

```sh
bun run lint
bun run typecheck
bun run test
bun run build
```

Never commit `.env` or provider credentials. Configure secrets in the deployment environment and use `.env.example` only as a variable-name template.

---

## ডেপ্লয় চেকলিস্ট (বাংলা)

লাইভ সাইটে (Vercel, Cloud Run, Lovable বা অন্য কোনো হোস্টিংয়ে) ডেপ্লয় করার সময় সব ফিচার সচল রাখতে নিচের ধাপগুলো অনুসরণ করুন:

### ১. প্রয়োজনীয় এনভায়রনমেন্ট ভেরিয়েবল (Environment Variables)
হোস্টিং ড্যাশবোর্ডের **Settings → Environment Variables / Secrets**-এ নিচের ভেরিয়েবলগুলো সেট করুন:

- **`GEMINI_API_KEY`** *(অত্যাবশ্যক)*: সার্ভারের চ্যাট, ভয়েস ট্রান্সক্রিপশন (`/api/voice/transcribe`), এবং ন্যাচারাল বাংলা/ইংরেজি TTS ভয়েস (`/api/voice/tts` ও `/api/voice/tts-stream`) চালানোর জন্য।
- **`APP_URL`** *(প্রস্তাবিত)*: আপনার লাইভ সাইটের মূল ঠিকানা (যেমন `https://your-domain.app`)। এটি না থাকলে প্রক্সি হেডার থেকে অরিজিন নেওয়া হয়, তবে `APP_URL` সেট করলে OAuth রিডাইরেক্ট সবসময় শতভাগ নির্ভুল থাকে।
- **`AI_ADMIN_TOKEN`** *(প্রোডাকশনে অত্যাবশ্যক)*: `NODE_ENV=production` অবস্থায় `/api/ai/health` এবং `/api/ai/kill-switch` এন্ডপয়েন্টগুলো নিরাপত্তার স্বার্থে এই টোকেন ছাড়া বন্ধ (`503`) থাকে।
- **`SUPABASE_URL` এবং `SUPABASE_SERVICE_ROLE_KEY`**: সার্ভার থেকে শেয়ার্ড ওয়েবসাইট প্রিভিউ (`/preview/:id`) সেভ ও লোড করার জন্য।
- **`VITE_SUPABASE_URL` এবং `VITE_SUPABASE_PUBLISHABLE_KEY`**: ব্রাউজার থেকে ইউজার প্রোফাইল, সেটিংস ও চ্যাট সেশন ক্লাউডে সিঙ্ক করার জন্য।
- **`GOOGLE_CLIENT_ID` ও `GOOGLE_CLIENT_SECRET`** এবং **`GITHUB_CLIENT_ID` ও `GITHUB_CLIENT_SECRET`**: Google এবং GitHub OAuth কানেকশন ব্যবহারের জন্য।

### ২. `VITE_*` ভেরিয়েবল সেট করার পর কেন রিডেপ্লয় (Redeploy) জরুরি?
`VITE_SUPABASE_URL` এবং `VITE_SUPABASE_PUBLISHABLE_KEY` হলো **Build-time** ভেরিয়েবল। Vite যখন `bun run build` / `npm run build` চালায়, তখন এই মানগুলো সরাসরি ফ্রন্টএন্ড জাভাস্ক্রিপ্ট বান্ডেলে যুক্ত হয়। তাই হোস্টিং প্যানেলে `VITE_*` ভেরিয়েবল যোগ বা পরিবর্তন করার পর অবশ্যই **নতুন করে বিল্ড ও রিডেপ্লয় (Rebuild & Redeploy)** করতে হবে।

### ৩. OAuth Callback URL আপডেট করা
নতুন ডোমেইনে ডেপ্লয় করার পর আপনার OAuth অ্যাপের অনুমোদিত কলব্যাক ঠিকানা (Authorized Redirect URI) আপডেট করুন:
- **GitHub OAuth App**: `https://<আপনার-ডোমেইন>/api/auth/github/callback`
- **Supabase / Vercel OAuth**: `https://<আপনার-ডোমেইন>/api/auth/supabase/callback`, `https://<আপনার-ডোমেইন>/api/auth/vercel/callback`
- **Google OAuth Console**: `https://<আপনার-ডোমেইন>/auth/callback`

### ৪. নতুন ডোমেইনে ব্রাউজারে সেভ করা কাস্টম API কী আবার দেওয়া
নিরাপত্তার জন্য ইউজারের নিজস্ব কাস্টম প্রোভাইডার API কী ব্রাউজারের ওই নির্দিষ্ট ডোমেইনের (Origin-bound) IndexedDB-তে থাকা AES-256-GCM মাস্টার কী দিয়ে এনক্রিপ্ট (`enc:v1:...`) করা থাকে। ডোমেইন বা ঠিকানা বদলালে নতুন ডোমেইনের ব্রাউজারে আগের ডোমেইনের মাস্টার কী থাকে না। তাই নতুন ঠিকানায় গেলে **"এই ঠিকানায় আগের সেভ করা কী পড়া যায় না, আবার দিন।"** বার্তা দেখালে **Settings → Custom Providers → আবার কী দিন** বাটনে ক্লিক করে কী-টি একবার নতুন করে সেভ করে নিন।

### ৫. সংযোগ পরীক্ষা (Connection Diagnostics)
ডেপ্লয় শেষে অ্যাপের **Settings → Connections → সংযোগ পরীক্ষা** প্যানেলে গিয়ে দেখে নিন কোন কোন ভেরিয়েবল `✓ সংযুক্ত` আছে এবং **"লাইভ সংযোগ পরীক্ষা চালান"** বাটনে চাপ দিয়ে Gemini Chat, Gemini TTS ও Supabase সংযোগ যাচাই করে নিন।

