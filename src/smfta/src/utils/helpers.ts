import { AINoteDraft, SelfUpdatePayload } from '../types';
import type { SelfSkillDraft } from './selfEngine';
import { APP_VERSION, APP_UPDATED } from '../version';
import { isGreetingMessage } from './streamGuard';
import { DEFAULT_SETTINGS } from './settings';

export { APP_VERSION, APP_UPDATED, DEFAULT_SETTINGS };

export const PROMPT_BANK = [
  {
    icon: '',
    title: 'Client Email (BN + EN)',
    category: 'Business',
    prompt:
      'Write a professional client email reply in both Bengali and English regarding project milestone completion.',
  },
  {
    icon: '',
    title: 'Self-Update: Live Calculator Widget',
    category: 'Self-Update',
    prompt:
      'নিজেকে কোড লিখে আপডেট করো এবং তোমার ভেতরে একটি সুন্দর আধুনিক সায়েন্টিফিক ক্যালকুলেটর উইজেট যুক্ত করো।',
  },
  {
    icon: '',
    title: 'Self-Update: Dark Emerald Theme',
    category: 'Self-Update',
    prompt:
      'তোমার নিজের থিম ডার্ক মোড এবং কালার এমেরাল্ড (সবুজ) করে নিজেকে আপডেট করো।',
  },
  {
    icon: '',
    title: 'Modern Login Page UI',
    category: 'Coding',
    prompt:
      'Create a modern, responsive login card with complete HTML and CSS code in a single file.',
  },
  {
    icon: '',
    title: 'Facebook Promo Post',
    category: 'Marketing',
    prompt:
      'ফেসবুক পেজের জন্য একটি আকর্ষণীয় প্রমোশনাল পোস্ট লিখে দাও যা পাঠকদের প্রথম লাইনেই আকৃষ্ট করবে।',
  },
  {
    icon: '',
    title: 'Python Bug Fixer',
    category: 'Coding',
    prompt:
      'Explain the 5 most common Python async/await bugs with clean code examples and fixes.',
  },
];

export const INLINE_QUICK_ACTIONS = [
  {
    label: 'Make Punchier',
    instruction: 'Make this more punchy, vivid, and engaging.',
  },
  {
    label: 'Shorten',
    instruction: 'Make this shorter, tighter, and more concise.',
  },
  {
    label: 'Translate to বাংলা',
    instruction: 'Rewrite this naturally in fluent Bengali (বাংলা).',
  },
  {
    label: 'Translate to English',
    instruction: 'Rewrite this naturally in clear, professional English.',
  },
  {
    label: 'More Professional',
    instruction: 'Make the tone more executive, polished, and authoritative.',
  },
  {
    label: 'Add Example',
    instruction:
      'Expand slightly with a concrete, relatable real-world example.',
  },
];

export const CHANGELOG = [
  {
    v: '18.11.0',
    d: 'October 28, 2026',
    items: [
      '⚙️ সেটিংস পুনর্নির্মাণ: ১৫টি ChatGPT-স্টাইল সাবপেজ (General, AI Providers, Model Settings, Chat, Personalization, Memory, Voice, Appearance, Notifications, Privacy & Data, Security, AI Tools & Integrations, Automation & Fallback, Usage & Limits, Account) — ভাসমান Search Settings bar, “No settings found” স্টেট, back বাটন, মোবাইল/ডেস্কটপ রেসপনসিভ',
      '🔐 API কী এখন AES-256-GCM এনক্রিপ্টেড (non-extractable Web Crypto কী, IndexedDB): localStorage-এ শুধু enc:v1 সাইফারটেক্সট; পুরোনো প্লেইনটেক্সট কী স্বয়ংক্রিয় মাইগ্রেট হয়; এক্সপোর্ট/ব্যাকআপে কী স্ট্রিপ করা থাকে',
      '🎛️ প্রতিটি টগল বাস্তবে ওয়্যার্ড: temperature 0.7 / topP 0.9 / max tokens 1024 ডিফল্ট, history সীমা, streaming/markdown/highlight/auto-scroll, retention, bounded retry + timeout, daily cap, upload সীমা',
      '🔔 আসল Browser Notification (permission-gated) + WebAudio chime; 🧠 Memory per-item delete ও দুই-ধাপ confirmation; 📊 Usage-এ প্রকৃত দৈনিক কাউন্ট (অনুমান নয়)',
      '✅ প্রোভাইডার স্ট্যাটাস Connected / Failed / Disabled / Not Tested; Test Connection প্রকৃত ফলাফল; ৩৮১টি টেস্ট পাস',
    ],
  },
  {
    v: '18.10.0',
    d: 'October 28, 2026',
    items: [
      '🎨 চ্যাট পেজ নতুন ডিজাইন (Syntrix-স্টাইল): গ্লোয়িং orb ওয়েলকাম, “Welcome back / Bring your ideas to life today”, ফিচার রেল (Images · Videos · Codex · Apps · Projects), জেনারেটর কার্ড (Image · Video · Dev Assistant)',
      '💬 নতুন কম্পোজার: বড় গোলাকার প্যানেল, স্পার্কল “Ask anything…”, Tools ও Deep Think পিল, বৃত্তাকার সেন্ড বাটন — সব আগের ফাংশন (mic, web search, model switch, attach) অক্ষুণ্ন',
      '🧭 হেডারে Dashboard · Settings · Help & Support নেভিগেশন ও অ্যাকাউন্ট অ্যাভাটার; সাইডবারে “Boost with AI” আপগ্রেড কার্ড',
      '⚙️ সেটিংস পেজ নতুন ডিজাইন (Workly-স্টাইল): ব্র্যান্ড হেডার, ⌘F সার্চ, ভায়োলেট গ্রেডিয়েন্ট অ্যাক্টিভ পিল, Boost with AI কার্ড ও ইউজার প্রোফাইল কার্ড — সব ৮টি সেটিংস ট্যাব আগের মতোই কাজ করে',
      '📱 মোবাইল/ছোট স্ক্রিনে নতুন উপাদান গোছানো থাকে (পিল লুকায়, সাইডবার স্ক্রলযোগ্য), আগের সব মোবাইল গ্যারান্টি ও ৩৫০+ টেস্ট অক্ষত',
    ],
  },
  {
    v: '18.9.0',
    d: 'October 27, 2026',
    items: [
      '🛡️ ব্রাউজার সিকিউরিটি হেডার: প্রোডাকশনে কঠোর Content-Security-Policy (অনিরাপদ inline/eval স্ক্রিপ্ট নয়), nosniff, clickjacking block, Referrer-Policy, Permissions-Policy, HTTPS-এ HSTS — লাইভ প্রিভিউর blob: iframe ও Google লগইন ঠিক রেখেই',
      '🚪 কঠোর চ্যাট রিকোয়েস্ট গার্ড: বার্তা সংখ্যা/লেখার দৈর্ঘ্য/ছবির সাইজের সীমা, role allow-list, অচেনা ফিল্ড বাদ — SSE স্ট্রিম খোলার আগেই ৪২২/৪১৩ তে নামিয়ে আনা হয়',
      '🍪 সেশন কুকি হার্ডেনিং: HttpOnly + SameSite=Lax + Max-Age, HTTPS সংযোগে Secure; প্রতিটি রিকোয়েস্টে স্থিতিশীল X-Request-Id যা রেসপন্স হেডারেও ফেরত আসে',
      '📦 বান্ডেল ভাগ করা: ৬৪৬KB একক ফাইল → ৩৯৯KB entry + react/icons/fflate আলাদা চাঙ্ক, ব্রাউজার ক্যাশে দ্রুত লোড, বিল্ড ওয়ার্নিং দূর',
      '🧹 সম্পূর্ণ ডিপেন্ডেন্সি আপডেট: Express 5, lucide-react 1, dotenv 18-সহ সব প্যাকেজ সাম্প্রতিক; অব্যবহৃত motion/zod/autoprefixer অপসারণ; npm audit: ০ দুর্বলতা',
    ],
  },
  {
    v: '18.8.0',
    d: 'October 26, 2026',
    items: [
      'প্রশ্নের মাপে উত্তর — ছোট প্রশ্নে আর বড় “নোট” নয়: হেডিং/সারসংক্ষেপ/বুলেট-গাছ শুধু তখনই, যখন আপনি নোট/প্ল্যান/লিস্ট চান',
      'স্ক্রিনে আরও জায়গা: লেখা ১৬px → ১৪.৪px, লাইন-হাইট কম, হেডার ৫৮px → ৫২px, সাইডবার সরু, চ্যাট প্যানেল ৮২০ → ৯০০px',
      'কোড ওয়ার্কস্পেস: যেকোনো ভাষার কোড → নামকরণ করা ফাইল (index.html, styles.css, app.js, App.tsx, main.py, Main.java …), সুন্দর করে সাজানো কোড',
      'কোড লেখা হলে পাশে অটো লাইভ রান + নিচে আলাদা অপশন → পুরো সাইড প্যানেলে কোড + প্রিভিউ + ডিভাইস সাইজ + .zip ডাউনলোড',
      'Python/Java/Rust-এর মতো ভাষায় সৎ বার্তা: ব্রাউজারে চলে না — কী কমান্ডে চালাবেন তা এক লাইনে, ফাইল পুরোটাই দেওয়া হয়',
    ],
  },
  {
    v: '18.7.0',
    d: 'October 26, 2026',
    items: [
      'কলমের মতো টাইপিং — উত্তর আর একসাথে “বার” হয়ে আসে না: অক্ষর ধরে ধরে, স্বাভাবিক গতিতে লিখে যায় (বাংলা যুক্তাক্ষর কখনো ভাঙে না)',
      'সময় আর দেখানো হয় না — উত্তরের নিচে শুধু সময় (latency বাদ)',
      'কম্পোজার পরিষ্কার: সেন্ড বাটন ডান-নিচের কোণে, মডেল-পিল তার পাশে, বাড়তি হিন্ট লেখা বাদ, ফোনে ওয়েব-টগল লুকিয়ে থাকে',
      'সেটিংস এখন প্রফেশনাল: রেলের প্রতিটি আইটেমের সত্যিকারের স্টাইল, গ্রুপ করা সেকশন কার্ড, বড় ও পরিষ্কার উইন্ডো',
      'যেকোনো ওয়েবসাইট বানানোর ক্ষমতা বাড়ানো — সম্পূর্ণ, রেসপন্সিভ, প্রফেশনাল পেজ; Preview থেকেই পুরো সাইট `.zip` আকারে ডাউনলোড',
      'আরও শক্ত: ওয়েব ইমোজি-শব্দ chatter বাদ, অটো-কন্টিনিউয়েশন ৩ পাস, ৭৫s idle watchdog',
    ],
  },
  {
    v: '18.6.0',
    d: 'October 26, 2026',
    items: [
      '🎯 প্রশ্ন যেটা, উত্তর সেটাই — বাংলা সেল্ফ-প্রশ্নে `\b` ম্যাচ না হওয়ার বাগ ধরা পড়েছে, তাই আর ভুল/ক্যানড উত্তর নয়',
      '🧹 স্ক্রিন পরিষ্কার: ইঞ্জিন-ব্যানার, ভুয়া systemctl/ssl স্ট্যাটাস, ইমোজি-সাজানো মার্কেটিং প্যারাগ্রাফ, কৃত্রিম থিংকিং প্যানেল — সব বাদ',
      '📋 “তোমাকে আর কী কী আপডেট করতে হবে?” — এখন লাইভ অবস্থা দেখে নির্দিষ্ট তালিকা, রোডম্যাপ ও পরের তিন ধাপ',
      '🗂️ ZIP অলরাউন্ডার: `.zip` খুলুন → `⟦FILE:path⟧` দিয়ে যেকোনো ফাইল বদলান/নতুন বানান → নতুন ZIP নামান → Run চেপে এখানেই চালান',
      '⚡ স্ট্রিমিং আরও দ্রুত: ১.২৫s কৃত্রিম অপেক্ষা বাদ, watchdog ৭৫s, নীরব typing dots',
    ],
  },
  {
    v: '18.5.0',
    d: 'October 26, 2026',
    items: [
      '✂️ আর কখনো অর্ধেক উত্তর নয়: পুরনো “ছোট প্রশ্ন → ৪৮০ অক্ষরে কাটা” নিয়ম সম্পূর্ণ বাদ (একটি ৮৬৬ অক্ষরের উত্তর ৪৩১ অক্ষরে কেটে যাচ্ছিল)। এখন শুধু গ্রিটিংস ছোট হয়, বাকি সব উত্তর সম্পূর্ণ আসে',
      '⏱️ লম্বা উত্তর মাঝপথে abort হওয়া বন্ধ: keyless stream ৯০s → ২৪০s, Gemini stream ২৫s → ১৮০s, provider stream ১২০s → ২৪০s — আস্তে আসা উত্তরও শেষ পর্যন্ত লেখা হয়',
      '🛡️ `dropStallSentences` আর আসল বাক্য মুছবে না: শুধু “আর লিখতে পারছি না / অপেক্ষা করুন” ধরনের ছোট স্টল-লাইন বাদ যায়, “এটা এখনই সম্ভব নয়, কারণ…” এর মতো সত্যি বাক্য অক্ষত থাকে',
      '📱 মোবাইল লেআউট ঠিক: হেডারের চিপ/আইকন আর overflow করে না (লম্বা মডেল নাম ফোনে লুকিয়ে যায়), কম্পোজারের মডেল-পিল ছোট হয়, সাইডবার `min(86vw, 300px)` — আর পাশে বেরিয়ে ভাঙে না',
      '🔍 iPhone-এ ফোকাস-জুম বন্ধ: মোবাইলে টেক্সটএরিয়া এখন ১৬px (আগে ১৪.৫px হওয়ায় পেজ জুম হয়ে ভেঙে যেত), সাথে `env(safe-area-inset-bottom)` + `visualViewport` — কীবোর্ড উঠলেও কম্পোজার দেখা যায়',
      '🧪 নতুন টেস্ট: `mobileSurface.test.ts` (৭টি) — overflow, ১৬px টেক্সটএরিয়া, safe-area, এবং “ছোট প্রশ্নেও লম্বা উত্তর সম্পূর্ণ থাকে” লক করা',
    ],
  },
  {
    v: '18.4.0',
    d: 'October 26, 2026',
    items: [
      '🎨 সম্পূর্ণ নতুন ইন্টারফেস (Professional Surface): পরিষ্কার সাইডবার, শান্ত হেডার, একটাই অ্যাকসেন্ট রঙ — নিয়ন চিপ, মোনো জার্গন আর ইঞ্জিন-ডক হট্টগোল সম্পূর্ণ বাদ',
      '🧠 ভাবনা এখন সত্যিই ভাবনার মতো: প্রাকৃতিক ভাষায় ধাপে ধাপে লেখা (ইমোজি লেবেল বা “intent detected” নয়), অক্ষর ধরে ধরে স্ট্রিম হয়, উত্তর শুরু হলেই একটি শান্ত লাইনে (“Thought for 3.1s”) ভাঁজ হয়ে যায় — উপরে, উত্তরের ঠিক মাথায়',
      '📋 তিন-ডট (⋮) মেনু পরিষ্কার: হেডারে একটি ছোট প্রফেশনাল মেনু (New chat · Export · Light/Dark · Settings), প্রতিটি চ্যাটের পাশে নিজস্ব ⋮ (Pin · Rename · Export · Delete)',
      '🧩 নতুন হোম স্ক্রিন: সেন্টার মার্ক + ৪টি কাজের কার্ড (কোড · ওয়েবসাইট ডিজাইন · লেখা/অনুবাদ · মনে রাখো) + Live demo / Cloud / System check চিপ',
      '💬 নতুন মেসেজ ও কম্পোজার: নরম বাবল, স্পষ্ট AI হেড, হোভারে অ্যাকশন, ফোকাস-রিং কম্পোজার, “Latest” স্ক্রল বাটন — পুরোটা Inter + Noto Sans Bengali টাইপোগ্রাফিতে',
      '🎛️ সেলফ-কন্ট্রোল সত্যিই কাজ করে: ⟦SELF_UPDATE⟧ {"radius":"sharp|soft|round","density":"compact|cozy|spacious"} এখন আসল UI-তে প্রযোজ্য (কর্নার টোকেন + কথোপকথনের রিদম), শুধু লেখা নয়',
      '🔍 চ্যাট-ভেতরের সার্চ বার ও পুরনো ডেড CSS (think-*, engine-dock, v2-header, welcome-hero) সম্পূর্ণ পরিষ্কার',
    ],
  },
  {
    v: '18.3.0',
    d: 'October 26, 2026',
    items: [
      '🧠 লাইভ স্ট্রিমিং থিংকিং: স্ট্যাটিক “THINKING” বক্সের বদলে এআই-এর ভাবনা এখন রিয়েল-টাইমে টাইপ হয় (টাইপরাইটার + ব্লিংকিং কার্সর), বান্ডেলের ব্যাকএন্ড থেকেই `thinking` চ্যানেলে স্ট্রিম আসে',
      '🪄 ভাবনা শেষ হলেই বক্সটি নিজে থেকে মিনিমাইজ হয়ে ছোট পিল (🧠 ভাবনা সম্পন্ন) হয়ে যায়, নিচে মূল উত্তর শুরু হয় — চাইলে ক্লিক করে আবার পুরোটা দেখা যায়, পুরনো চ্যাটেও থাকে',
      '✂️ MATCH-LENGTH রুল (কঠোর): “hi”/“হ্যালো” → সর্বোচ্চ ১–২ লাইন ফ্রেন্ডলি উত্তর (০ms ইনস্ট্যান্ট), ছোট প্রশ্ন → ছোট প্যারাগ্রাফ, কোড/টেবিল কখনো কাটা যায় না',
      '🚫 কোনো preamble, বুলেট-লেকচার বা ভরাট উত্তর নয় — ব্যবহারকারীর প্রশ্নের মাপেই উত্তর',
    ],
  },
  {
    v: '18.2.0',
    d: 'October 26, 2026',
    items: [
      '▶️ Live Preview Engine: AI যে কোড লেখে সেটি এখন পেজেই সত্যিকারের চলন্ত সাইট হিসেবে দেখা যায় — sandboxed iframe, মোবাইল/ট্যাবলেট/ডেস্কটপ সাইজ, রিলোড, কপি, ডাউনলোড, নতুন ট্যাব ও ফুলস্ক্রিন',
      '🎨 "এই ওয়েবসাইটের ডিজাইনটা বানাও" বললেই সম্পূর্ণ রান-যোগ্য ডেমো + ক্লিকযোগ্য Live বাটন — মডেল শুধু লেখা দিলেও স্টার্টার ডেমো স্বয়ংক্রিয়ভাবে তৈরি হয়',
      '🧠 মেমোরি ব্যাংক ২.০: ২০০টি ফ্যাক্ট, ডুপ্লিকেট/পুরোনো তথ্য অটো-মার্জ, localStorage + ব্যাকআপ কপি, প্রম্পটের একেবারে উপরে মেমোরি ব্লক — "আমার নাম কী?" এখন ০ মিলিসেকেন্ডে উত্তর পায়',
      '⚡ GPT-সুলভ স্পিড: keyless POST/GET hedged race (৬০০ms head start), ২.৫s first-byte timer, দ্রুত রিট্রাই — উত্তর আর টেনে টেনে আসে না',
      '🔎 সেটিংস নেভিগেশনে বাংলা+ইংরেজি সার্চ — যেকোনো সেটিং নাম লিখে সাথে সাথে খুঁজে পাওয়া যায়',
    ],
  },
  {
    v: '18.1.0',
    d: 'October 26, 2026',
    items: [
      '🛠️ Working self-update: নিজের থিম, অ্যাকসেন্ট, ফন্ট, মোড, স্টাইল, মডেল, পার্সোনা, মেমোরি, উইজেট ও স্কিল নিজেই বদলায়',
      '🔌 Google Drive + GitHub কানেক্টর সব জায়গা থেকে খোলা যায় (সাইডবার, হেডার, প্যালেট, সেটিংস, চ্যাট)',
      '🗂️ সেটিংস বাম-পাশের গ্রুপ করা রেলে — মোবাইলে "সেকশন" শিট',
    ],
  },
  {
    v: '18.0.0',
    d: 'October 25, 2026',
    items: [
      '🧩 নতুন কন্ট্রোল প্রোটোকল (⟦SELF_UPDATE⟧ / ⟦NOTE⟧ / ⟦SELF_CODE⟧ / ⟦MEMORY⟧) প্রম্পটের একেবারে উপরে',
      '🩺 Self-repair, রোলব্যাক স্ন্যাপশট ও অটোনোমি FULL/SAFE',
    ],
  },
  {
    v: '17.8.0',
    d: 'October 24, 2026',
    items: [
      '🎛️ নতুন Settings Hub: ৭টি পরিষ্কার ট্যাব (সাধারণ · এআই ইঞ্জিন · টিউনিং · চেহারা · ভয়েস · ডেটা ও মেমোরি · সম্পর্কে) — এখন অ্যাপের প্রতিটি সেটিং UI থেকেই বদলানো যায়',
      '🔎 সেটিং সার্চ ও লাইভ স্ট্যাটাস: উপরে সার্চ বক্স দিয়ে যেকোনো সেটিং খুঁজে সরাসরি সেই ট্যাবে যান, পাশাপাশি ইঞ্জিনের রেডি/অপ্রস্তুত অবস্থা সবসময় দৃশ্যমান',
      '💾 প্রোফাইল ও অটো-সেভ: একাধিক API প্রোফাইল সেভ/চালু/মুছুন, প্রতিটি পরিবর্তন সাথে সাথে সেভ হয় এবং স্টোরেজ · ক্যাশে · মেমোরি এক জায়গা থেকে ম্যানেজ করা যায়',
    ],
  },
  {
    v: '17.7.3',
    d: 'October 23, 2026',
    items: [
      '🚀 SMFTA Pro v17.7.3 System Upgrade Pipeline: ৮-ধাপের পূর্ণাঙ্গ আপডেট প্রোটোকল (`config_backup.json` + `user_data/` ব্যাকআপ ও পুনরুদ্ধার, ডিপেন্ডেন্সি ও স্কিমা মাইগ্রেশন, ক্যাশ ও লগ ক্লিয়ার)',
      '🩺 Live Health Check & Service Verification: `smfta-pro.service` স্ট্যাটাস যাচাইকরণ, `/api/health` এন্ডপয়েন্ট (`Health check OK`) এবং `upgrade.log`-এ স্বয়ংক্রিয় ইনস্টলেশন ট্যাগ সংরক্ষণ',
    ],
  },
  {
    v: '17.6.0',
    d: 'October 22, 2026',
    items: [
      '🧹 Clean Action Bar: মেসেজের নিচ থেকে অপ্রয়োজনীয় "বাকি অংশ লিখুন (Continue)" এবং "Listen" বাটন রিমুভ করে এক লাইনের সুপার-ক্লিন ফুটার (Time · Copy · Retry)',
      '⚡ 0.0s Instant Neural Greeting & Status Engine: "Hi", "Hello", "হ্যালো", "কেমন আছো" ও সিস্টেম স্ট্যাটাস প্রশ্নে ০.০ সেকেন্ডে তাৎক্ষণিক মাল্টি-কালার উত্তর',
      '🎨 Enhanced Multi-Color Typography: সাধারণ বাক্য, কোটেশন, বোল্ড কীওয়ার্ড ও কোড ট্যাগে স্বয়ংক্রিয় মাল্টি-কালার হাইলাইট',
    ],
  },
  {
    v: '17.5.0',
    d: 'October 22, 2026',
    items: [
      '🖥️ Full-Screen Open-Canvas Chat UI: স্ক্রিনের এক প্রান্ত থেকে অন্য প্রান্ত পর্যন্ত সম্পূর্ণ ফুল-স্ক্রিন চ্যাট ও বক্স-মুক্ত ওপেন ক্যানভাস লেআউট',
      '🎨 Multi-Color Semantic Formatting: একঘেয়ে এক রঙের পরিবর্তে হেডিং, বোল্ড টেক্সট, ইনলাইন কোড, লিস্ট ও টেবিলের জন্য আলাদা আকর্ষণীয় মাল্টি-কালার ডিজাইন',
      '⚡ Ultra-Fast Zero-Latency Streaming & Confidentiality Shield: আরও দ্রুত রেসপন্স স্ট্রিমিং এবং সিস্টেমের সমস্ত তথ্য ও আপডেট অভ্যন্তরীণভাবে জানার পাশাপাশি কোনো গোপন ডাটা প্রকাশ না করার সুরক্ষা',
    ],
  },
  {
    v: '17.4.0',
    d: 'October 22, 2026',
    items: [
      '🚀 Large Code & Long-Form Writing Engine: বড় কোড (HTML/CSS/JS/Python/React) এবং দীর্ঘ রচনা, গল্প বা আর্টিকেল সম্পূর্ণ ও নির্ভুলভাবে লেখার ক্ষমতা যুক্ত',
      '🔄 Auto-Continuation & High-Capacity Token Budget: আউটপুট টোকেন বাজেট ১৬,৩৮৪ পর্যন্ত বৃদ্ধি এবং অর্ধসমাপ্ত কোড ব্লক স্বয়ংক্রিয়ভাবে সম্পন্ন করার প্রযুক্তি',
      '▶️ ১-ক্লিকে "বাকি অংশ লিখুন (Continue)" বাটন: যেকোনো উত্তরের নিচে এক ক্লিকে একই মেসেজের ভেতর বাকি অংশ বা কোড কন্টিনিউ করার সুবিধা',
    ],
  },
  {
    v: '17.3.0',
    d: 'October 22, 2026',
    items: [
      '🛡️ SMFTA Pro Proprietary Identity & Ownership: সিস্টেমের নিজস্ব ও ডেডিকেটেড এআই পরিচয় এবং ভাষা-ভিত্তিক (বাংলা/ইংরেজি) তাৎক্ষণিক পরিচয় রেসপন্স',
      '🔒 Strict System Boundaries & Stream Sanitizer: রিয়েল-টাইম স্ট্রিম ও আউটপুট ফিল্টারিং এবং কোনো থার্ড-পার্টি নাম বা বাহ্যিক প্রমোশনাল লিংক সম্পূর্ণ নিষিদ্ধকরণ',
      '⚡ SMFTA Core Engine Whitelabeling: সেটিংস প্যানেল ও প্রোভাইডার তালিকায় সম্পূর্ণ নিজস্ব ব্র্যান্ডিং',
    ],
  },
  {
    v: '17.2.0',
    d: 'October 22, 2026',
    items: [
      '🧬 মডেল ওজন (Model Weights): নতুন কাস্টম ট্রেনিং ডেটা (Q&A / ফ্যাক্টস), Temperature ও Top-P ওজন ক্যালিব্রেশন দিয়ে লাইভ রিট্রেইন সিস্টেম',
      '⚡ থিংকিং অ্যালগরিদম (Thinking Algorithm): সাব-মিলিসেকেন্ড কমপ্লেক্সিটি রাউটার (MINIMAL/LOW thinking) ও লোকাল ফাস্ট-ডিসিশন ইঞ্জিন',
      '🖥️ হার্ডওয়্যার ইন্টারফেস (GPU/CPU Speed): WebGPU/WebGL ও মাল্টি-থ্রেড CPU ডিটেকশন এবং requestAnimationFrame (60/120fps) স্ট্রিম ব্যাচিং',
      '🧠 সিস্টেম মেমোরি (System Memory): ক্লায়েন্ট ও সার্ভার হাই-স্পিড LRU ক্যাশে (0ms ক্যাশে হিট), ৬০-আইটেম মেমোরি উইন্ডো এবং ২৪০ req/min প্রসেসিং রেট',
    ],
  },
  {
    v: '17.1.0',
    d: 'October 22, 2026',
    items: [
      '⚡ ডিফল্ট কোর ইঞ্জিন যোগ: SMFTA Core Engine — কোনো API Key, সাইন-আপ বা কার্ড লাগে না',
      '🧹 সেটিংস সম্পূর্ণ ক্লিন: এক প্যানেলে কোর ইঞ্জিন কার্ড + সংগঠিত প্রোভাইডার তালিকা (ফ্রি/বিল্ট-ইন, কাস্টম API, জনপ্রিয়, লোকাল) এবং এক ক্লিকে "সব সেটিংস ক্লিন (Reset)" বাটন',
      '🛠️ কাস্টম API সিস্টেম অক্ষত: যেকোনো OpenAI-compatible Base URL + API Key + Model ID, একাধিক কী রোটেশন ও সেভ করা প্রোফাইল',
      '🐞 "API Key যোগ করলে কাজ করে না" বাগ ফিক্স: অজানা কী আর জোর করে UnoRouter-এ পাঠানো হয় না, রেকর্ড করা সেটিংস প্রতিবার ভ্যালিডেট হয়, পুরনো ভুল প্রোভাইডার-কী জোড়া অটো-মাইগ্রেট হয়',
      '⚡ দ্রুত রিপ্লাই: অপ্রয়োজনীয় মডেল/স্টেজ রিট্রাই কমানো, টাইমআউট সংক্ষিপ্ত, ভুল Gemini মডেল নাম ঠিক করা এবং localStorage সেভ ডিবাউন্স করে স্ট্রিমিং ল্যাগ দূর করা',
    ],
  },
  {
    v: '17.0.0',
    d: 'October 20, 2026',
    items: [
      'মডিউলার ব্যাকএন্ড আর্কিটেকচার (server/providers.ts, server/systemPrompt.ts, server/routes/*) ও Strict TypeScript ভেরিফিকেশন',
      'নতুন ৪টি প্রোভাইডার প্রিসেট যোগ: Google Gemini OpenAI-Compatible, LM Studio (Keyless), GitHub Models ও NVIDIA NIM',
      'Saved Provider Profiles: একাধিক API প্রোফাইল সেভ করে এক ক্লিকে সুইচ করার সুবিধা এবং প্রতিটি প্রিসেটের নিচে বাংলা গাইড',
      'স্মার্ট মাল্টি-কি ৪২৯ রোটেশন, আপস্ট্রিম AbortController (Stop চাপলে তাৎক্ষণিক কানেকশন বন্ধ), SSE Keepalive (: ping) ও ৬০ req/min রেট লিমিটিং',
      'চ্যাটের এরর বার্তায় ওয়ান-ক্লিক "🔄 Retry" ও "☁️ ক্লাউড ব্যবহার করো" বাটন এবং কম্পোজারে লাইভ কানেকশন স্ট্যাটাস ব্যাজ (✅/⚠️)',
    ],
  },
  {
    v: '16.6.0',
    d: 'October 20, 2026',
    items: [
      'Custom Provider সম্পূর্ণ ফিক্স: Base URL ছাড়া, API Key ছাড়া এন্ডপয়েন্ট ও ভুল URL নরমালাইজেশনের কারণে এরর আসার সমস্যা সমাধান',
      'কাস্টম এন্ডপয়েন্টে Model ID খালি রাখলে /models রুট থেকে সচল মডেল নিজে নিজেই অটো-ডিটেক্ট হয়',
      'প্রোভাইডার ব্যর্থ হলে এখন আসল কারণসহ (HTTP স্ট্যাটাস + Endpoint) স্পষ্ট এরর রিপোর্ট দেখায় — আর চুপচাপ ক্লাউড ফলব্যাক নয়',
      'Gemini OpenAI-compatible এন্ডপয়েন্ট (v1beta/openai) সাপোর্ট, Gemini 2.5 মডেল প্রায়োরিটি, নেটওয়ার্ক টাইমআউট ও ডাবল-রিপ্লাই বাগ ফিক্স',
    ],
  },
  {
    v: '16.0.0',
    d: 'October 20, 2026',
    items: [
      'জিরো-এরর সেলফ-হিলিং আলট্রা ইঞ্জিন: প্রোভাইডার বা মডেলে কোনো সমস্যা হলেও অটো-ফলব্যাক হয়ে ১০০% নিশ্চিত উত্তর',
      'UnoRouter (unorouter.com) লাইভ মডেল লিস্ট লোডার ও অটো মডেল ভেরিফিকেশন',
      'প্রতিটি উত্তরের নিচে ওয়ান-ট্যাপ স্মার্ট ফলো-আপ বাটন (🔍 আরও বিস্তারিত, ✂️ সংক্ষেপ করো, 🇧🇩 সহজ বাংলায়, 🇬🇧 English)',
      'প্লাস (+) মেনুতে নিত্যপ্রয়োজনীয় কুইক এআই টুলস (Summarize, Translate, Grammar Fix, Code Lab)',
      'মার্কডাউন টেবিল রেন্ডারার এবং যেকোনো HTML কোড ব্লক থেকে ১-ক্লিকে সেলফ-ইন্সটল বাটন',
    ],
  },
  {
    v: '15.2.0',
    d: 'October 20, 2026',
    items: [
      'UnoRouter (unorouter.com) সরাসরি ফার্স্ট-ক্লাস সাপোর্ট ও ৩২৪+ মডেল ইন্টিগ্রেশন',
      'Google Gemini API Key সাপোর্ট ও প্রোভাইডার কানেকশন টেস্ট ডায়াগনস্টিক রিপোর্ট সিস্টেম',
      'চ্যাট কম্পোজারের মধ্যে অ্যাক্টিভ প্রোভাইডার ইন্ডিকেটর ব্যাজ',
    ],
  },
  {
    v: '15.0.0',
    d: 'October 20, 2026',
    items: [
      'একীভূত (Unified) চ্যাট বক্স: ইনপুট বক্সের ভেতরেই নিচের কোণায় মডেল সিলেক্টর, টুলস ও সেন্ড বাটন',
      'হাই-কনট্রাস্ট লাইট (সাদা) ও ডার্ক থিম সাপোর্ট যাতে সাদার মধ্যে সব লেখা ও বর্ডার স্পষ্টভাবে বোঝা যায়',
      'SMFTA-2 Sonnet ও SMFTA-3 Ultra মডেলের Thinking Level বাগ সম্পূর্ণ ফিক্স',
      'সেটিংসের ভেতরে গোপন প্রোভাইডার ও মাল্টি-কি রোটেশন সাপোর্ট (Groq, OpenRouter, DeepSeek ইত্যাদি)',
    ],
  },
];

// Instant local math evaluator (supports Bengali digits ۰-৯)
export function tryLocalMath(txt: string): number | null {
  if (!txt || txt.length > 120) return null;
  const en = txt
    .replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d)))
    .replace(/[=?\s]+$/g, ' ')
    .trim();
  if (
    !/^[0-9\s+\-*/().^%]+$/.test(en) ||
    !/\d/.test(en) ||
    !/[+\-*/^%]/.test(en)
  ) {
    return null;
  }
  try {
    const val = Function(
      '"use strict"; return (' + en.replace(/\^/g, '**') + ')'
    )();
    if (typeof val === 'number' && Number.isFinite(val)) {
      return Number(val.toFixed(8));
    }
  } catch {
    return null;
  }
  return null;
}

export function sanitizeProprietaryOutput(text: string): string {
  if (!text) return '';
  return text
    .replace(/\n+\s*(?:---|\*\*\*|___)\s*\n+[\s\S]*?(?:pollinations|ko-fi\.com|buymeacoffee\.com|xrahat|blackbox\.ai|support\s+pollinations)[\s\S]*$/gi, '')
    .replace(/(?:\n+|\s+)(?:🌸|🐝|⚡|💡)?\s*\**(?:Powered\s+by|Support|Brought\s+to\s+you\s+by)\s+Pollinations(?:\.AI)?\**[^\n]*/gi, '')
    .replace(/https?:\/\/(?:t\.me|telegram\.me)\/education_of_purpose[^\s)"'\]]*/gi, '')
    .replace(/\bt\.me\/education_of_purpose[^\s)"'\]]*/gi, '')
    .replace(/🔰\s*𝐗ʀᴀʜᴀᴛ-ᴅᴇᴠ\s*🔰/gi, 'SMFTA AI Pro')
    .replace(/𝐗ʀᴀʜᴀᴛ-ᴅᴇᴠ/gi, 'SMFTA AI Pro')
    .replace(/🧠\s*Xrahat-Ai/gi, 'SMFTA AI Pro')
    .replace(/https?:\/\/[^\s)"']*xrahat[^\s)"']*/gi, '')
    .replace(/https?:\/\/[^\s)"']*pollinations\.ai[^\s)"']*/gi, '')
    .replace(/xrahat-worm-ai\.vercel\.app(?:\/[^\s)"']*)?/gi, '')
    .replace(/pollinations\.ai(?:\/[^\s)"']*)?/gi, 'SMFTA Pro')
    .replace(/Xrahat\s*[-_]*\s*Worm\s*[-_]*\s*AI/gi, 'SMFTA Pro')
    .replace(/Xrahat\s*[-_]*\s*Dev/gi, 'SMFTA Pro')
    .replace(/Xrahat\s*[-_]*\s*AI/gi, 'SMFTA Pro')
    .replace(/Xrahat/gi, 'SMFTA Pro')
    .replace(/Worm\s*[-_]*\s*GPT/gi, 'SMFTA Pro')
    .replace(/Worm\s*[-_]*\s*AI/gi, 'SMFTA Pro')
    .replace(/Pollinations\.AI/gi, 'SMFTA Pro')
    .replace(/Pollinations\s*AI/gi, 'SMFTA Pro')
    .replace(/এক্সরাহাত|রাহাত\s*ডেভ|মোঃ\s*রাহাত|ডেভেলপার\s*রাহাত/gi, 'SMFTA Pro')
    .replace(
      /(?:আমাকে\s+)?(?:OpenAI|ওপেনএআই|Google|গুগল|Anthropic|অ্যানথ্রপিক|DeepSeek|ডিপসিক|Meta|মেটা|Alibaba|আলিবাবা|Microsoft|মাইক্রোসোফট|Pollinations|SMFTA Pro|রাহাত)\s*(?:তৈরি\s*করেছে|বানিয়েছে|বানিয়েছে|ডেভেলপ\s*করেছে|দ্বারা\s*তৈরি|কর্তৃক\s*নির্মিত)/gi,
      'আমাকে **SMFTA Pro** সিস্টেমের নিজস্ব প্রযুক্তিতে তৈরি করা হয়েছে'
    )
    .replace(
      /আমি\s+(?:ChatGPT|চ্যাটজিপিটি|গুগলের\s+একটি\s+লার্জ\s+ল্যাঙ্গুয়েজ\s+মডেল|গুগলের\s+একটি\s+লার্জ\s+ল্যাঙ্গুয়েজ\s+মডেল|ওপেনএআই-এর\s+একটি\s+মডেল|OpenAI-এর\s+একটি\s+এআই)/gi,
      'আমি **SMFTA Pro** সিস্টেমের নিজস্ব এআই অ্যাসিস্ট্যান্ট'
    )
    .replace(
      /\b(?:I\s+was\s+|I\s+am\s+|I'm\s+)?(?:created|developed|built|trained|made)\s+by\s+(?:OpenAI|Google|Anthropic|DeepSeek|Meta|Alibaba|Microsoft|Pollinations(?:\.AI)?|Rahat|Blackbox(?:\s*AI)?)\b/gi,
      'developed exclusively for **SMFTA Pro**'
    )
    .replace(
      /\bI\s+am\s+(?:ChatGPT|a\s+large\s+language\s+model\s+trained\s+by\s+(?:OpenAI|Google|Anthropic))\b/gi,
      'I am the dedicated AI assistant of **SMFTA Pro**'
    )
    .replace(/AIza[0-9A-Za-z\-_]{15,}/g, '[CONFIDENTIAL_KEY]')
    .replace(/sk-[0-9A-Za-z\-_]{15,}/g, '[CONFIDENTIAL_KEY]')
    .replace(/cc_[0-9A-Za-z\-_]{15,}/g, '[CONFIDENTIAL_KEY]')
    .replace(/gsk_[0-9A-Za-z\-_]{15,}/g, '[CONFIDENTIAL_KEY]')
    .replace(/ADMIN PROTOCOL \(CONFIDENTIAL[^\n]*/gi, '');
}

// Fast-Decision Algorithm: instant local response for identity/ownership, greetings, trained Q&A, or date/time queries
export function tryFastDecisionResponse(
  rawTxt: string,
  trainingData?: string,
  replyLang: 'auto' | 'bn' | 'en' = 'auto',
  userName?: string
): string | null {
  const clean = rawTxt.trim();
  if (!clean || clean.length > 220) return null;
  const lower = clean
    .toLowerCase()
    .replace(/[?!।.,'"`]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 0. Strict Data & Privacy Protection Guard (0ms block against internal data/privacy disclosure)
  if (
    /(?:তোমার\s+সিস্টেম\s+প্রম্পট|সিস্টেম\s+প্রম্পট\s+দেখাও|গোপন\s+ডাটা|গোপন\s+তথ্য|ডাটা\s+প্রকাশ\s+করো|ডাটা\s+শেয়ার\s+করো|ডাটা\s+শেয়ার\s+করো|প্রাইভেসি\s+শেয়ার|প্রাইভেসি\s+শেয়ার|অন্য\s+ইউজারের\s+ডাটা|ইউজারের\s+প্রাইভেসি|তোমার\s+ডাটাবেস\s+দেখাও|তোমার\s+এপিআই\s+কী\s+বলো|show\s+(?:your\s+)?system\s+prompt|reveal\s+(?:your\s+)?(?:internal|secret|private)\s+data|dump\s+(?:user\s+)?data|share\s+(?:your\s+)?(?:private\s+data|privacy|api\s+keys))/i.test(
      lower
    )
  ) {
    return 'অভ্যন্তরীণ সিস্টেম প্রম্পট, API key বা অন্য কারো ব্যক্তিগত তথ্য আমি শেয়ার করি না। অ্যাপ কীভাবে কাজ করে বা কীভাবে আরও ভালো করা যায় — সেটা অবশ্যই বলব।';
  }

  // 1. Strict Proprietary Identity & Ownership Interceptor (Language-Matched)
  const isBnIdentity =
    /^(?:তুমি কে|আপনি কে|তোমার পরিচয় কী|তোমার পরিচয় কি|তোমার পরিচয় কি|তোমার নাম কি|তোমার নাম কী|আপনার নাম কি|তোমাকে কে বানিয়েছে|তোমাকে কে বানিয়েছে|তোমাকে কে তৈরি করেছে|কে তোমাকে বানিয়েছে|কে তোমাকে বানিয়েছে|কে তোমাকে তৈরি করেছে|তুমি কার|তুমি কার সিস্টেম|তুমি কোন সিস্টেম|তোমার মালিক কে|তোমার ডেভেলপার কে|কে তোমার ডেভেলপার|tumi ke|tomar nam ki|tomake ke baniyeche|tomake ke toiri koreche)$/i.test(
      lower
    ) ||
    /(?:তোমাকে\s+কে\s+(?:তৈরি|বানিয়েছে|বানিয়েছে|ডেভেলপ|সৃষ্টি)|কে\s+তোমাকে\s+(?:তৈরি|বানিয়েছে|বানিয়েছে|ডেভেলপ)|তোমার\s+(?:নির্মাতা|মালিক|ডেভেলপার|উদ্ভাবক|ক্রিয়েটর|ক্রিয়েটর)\s+কে|তুমি\s+কোন\s+(?:ওয়েবসাইট|ওয়েবসাইট|কোম্পানি|প্রতিষ্ঠান)|তোমাকে\s+কোন\s+(?:কোম্পানি|ওয়েবসাইট|ওয়েবসাইট)\s+তৈরি|tomake\s+ke\s+(?:toiri|baniyeche|baniyece|develop)|tomar\s+(?:malik|developer|creator)\s+ke)/i.test(
      lower
    );
  const isEnIdentity =
    /^(?:who are you|what are you|what is your name|what s your name|who made you|who created you|who built you|who developed you|who owns you|who do you belong to|whom do you belong to|what system are you|what system do you belong to|which system do you belong to|who is your developer|who is your creator|who is your owner|tell me about your identity|what is your identity)$/i.test(
      lower
    ) ||
    /\b(?:who\s+(?:made|created|built|developed|owns|trained)\s+you|who\s+is\s+your\s+(?:creator|developer|owner|maker)|which\s+(?:company|website|organization)\s+(?:made|created|built|owns)\s+you|who\s+do\s+you\s+belong\s+to)\b/i.test(
      lower
    );

  if (isBnIdentity || isEnIdentity) {
    const bnReply =
      `আমি **SMFTA AI Pro** (SMFTA Pro v${APP_VERSION}) — **SMFTA AI Pro** প্ল্যাটফর্মের নিজস্ব ও নির্ধারিত AI অ্যাসিস্ট্যান্ট। কোড লেখা ও চালানো, ডিজাইন, নোট, ZIP প্রজেক্ট আর নিজের UI — সব এখানেই সামলাতে পারি। কী দরকার বলুন।`;
    const enReply =
      `I am **SMFTA AI Pro** (SMFTA Pro v${APP_VERSION}), the dedicated AI assistant of the **SMFTA AI Pro** platform — code, design, notes, ZIP projects and my own UI. What do you need?`;
    if (replyLang === 'bn') return bnReply;
    if (replyLang === 'en') return enReply;
    const hasBn = /[\u0980-\u09FF]/.test(clean) || isBnIdentity;
    return hasBn ? bnReply : enReply;
  }

  // 2. Check custom retrained Q&A pairs
  if (trainingData && trainingData.trim()) {
    const blocks = trainingData
      .split(/\n{2,}|\r?\n(?=(?:Q:|প্রশ্ন:|Input:|- |\d+\.))/i)
      .map((b) => b.trim())
      .filter(Boolean);
    for (const block of blocks) {
      const m =
        block.match(
          /^(?:Q|প্রশ্ন|Input|User)\s*[:=-]\s*([\s\S]+?)\s*(?:A|উত্তর|Output|AI)\s*[:=-]\s*([\s\S]+)$/i
        ) || block.match(/^([^\n=>]+?)\s*(?:=>|->|::)\s*([\s\S]+)$/);
      if (m) {
        const triggers = m[1]
          .toLowerCase()
          .split(/\s*\/\s*|\s*\|\s*/)
          .map((s) => s.replace(/[?!।.,]+$/g, '').trim())
          .filter(Boolean);
        if (triggers.includes(lower)) {
          return sanitizeProprietaryOutput(m[2].trim());
        }
      }
    }
  }

  // 2b. v18.3.0 — instant, deliberately tiny greeting reply.
  // A "hi" must never trigger a model lecture: this answers in one or two
  // short friendly lines, 0 ms, language-matched.
  if (isGreetingMessage(clean)) {
    const name = (userName || '').trim();
    const hasBn = /[\u0980-\u09FF]/.test(clean) || replyLang === 'bn';
    const howAreYou = /(কেমন\s*আছো|কেমন\s*আছেন|how are you)/i.test(clean);
    if (hasBn) {
      if (howAreYou) return 'ভালো আছি, ধন্যবাদ। আপনি কেমন আছেন?';
      return name ? `হ্যালো ${name} — কীভাবে সাহায্য করতে পারি?` : 'হ্যালো — কীভাবে সাহায্য করতে পারি?';
    }
    if (replyLang === 'en') {
      if (howAreYou) return "I'm doing well, thanks. How are you?";
      return name ? `Hi ${name} — what can I help with?` : 'Hi — what can I help with?';
    }
    if (howAreYou) return 'ভালো আছি, ধন্যবাদ। আপনি কেমন আছেন?';
    return name ? `হ্যালো ${name} — কীভাবে সাহায্য করতে পারি?` : 'হ্যালো — কীভাবে সাহায্য করতে পারি?';
  }

  // 3. Instant time/date fast-path
  if (
    /^(?:এখন কয়টা বাজে|এখন সময় কত|আজকের তারিখ কি|আজ কি বার|what time is it|what is today s date)$/i.test(
      lower
    )
  ) {
    const now = new Date();
    return `এখন \`${now.toLocaleTimeString('bn-BD')}\` · ${now.toLocaleDateString('bn-BD', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })}**`;
  }

  // 4. Version / status fast-path — real state only, nothing invented.
  if (
    /^(?:সিস্টেম স্ট্যাটাস|ভার্সন কত|তোমার ভার্সন কত|হেলথ চেক|system status|health check|what version are you|smfta status)$/i.test(
      lower
    )
  ) {
    const isBn = replyLang === 'bn' || /[\u0980-\u09FF]/.test(clean);
    return isBn
      ? `SMFTA Pro v${APP_VERSION} — চালু আছে। থিম/মোড/মেমোরি/প্রজেক্ট যেকোনো তথ্য জানতে চাইলে বলুন, সাথে সাথে বলব।`
      : `SMFTA Pro v${APP_VERSION} is running. Ask for theme, mode, memory or project details and I will report the real values.`;
  }

  return null;
}

// Client-side High-Speed LRU System Memory Cache
const CLIENT_LRU_CACHE = new Map<string, { text: string; ts: number }>();
const MAX_CLIENT_CACHE = 100;
const CLIENT_CACHE_TTL = 30 * 60 * 1000;

export function getClientCachedReply(
  prompt: string,
  mode = 'fast'
): string | null {
  const key = `${mode}:${prompt.trim().toLowerCase().replace(/\s+/g, ' ')}`;
  const hit = CLIENT_LRU_CACHE.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > CLIENT_CACHE_TTL) {
    CLIENT_LRU_CACHE.delete(key);
    return null;
  }
  CLIENT_LRU_CACHE.delete(key);
  CLIENT_LRU_CACHE.set(key, hit);
  return hit.text;
}

export function setClientCachedReply(
  prompt: string,
  reply: string,
  mode = 'fast'
): void {
  const cleanP = prompt.trim();
  const cleanR = reply.trim();
  if (!cleanP || cleanP.length > 800 || !cleanR || cleanR.startsWith('⚠️')) {
    return;
  }
  const key = `${mode}:${cleanP.toLowerCase().replace(/\s+/g, ' ')}`;
  if (CLIENT_LRU_CACHE.has(key)) {
    CLIENT_LRU_CACHE.delete(key);
  } else if (CLIENT_LRU_CACHE.size >= MAX_CLIENT_CACHE) {
    const oldest = CLIENT_LRU_CACHE.keys().next().value;
    if (oldest) CLIENT_LRU_CACHE.delete(oldest);
  }
  CLIENT_LRU_CACHE.set(key, { text: cleanR, ts: Date.now() });
}

export function clearClientCache(): number {
  const size = CLIENT_LRU_CACHE.size;
  CLIENT_LRU_CACHE.clear();
  return size;
}

export function getClientCacheSize(): number {
  return CLIENT_LRU_CACHE.size;
}

// Hardware Interface Detector (GPU / CPU Threads / Memory)
export interface HardwareInfo {
  cpuThreads: number;
  deviceRamGb: number;
  gpuRenderer: string;
  webGpuSupported: boolean;
  processingRatePerMin: number;
}

let cachedHardwareInfo: HardwareInfo | null = null;

export function detectHardwareCapabilities(): HardwareInfo {
  if (cachedHardwareInfo) return cachedHardwareInfo;
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      cpuThreads: 8,
      deviceRamGb: 8,
      gpuRenderer: 'Server Neural Engine',
      webGpuSupported: true,
      processingRatePerMin: 240,
    };
  }

  const cpuThreads = navigator.hardwareConcurrency || 8;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deviceRamGb = Number((navigator as any).deviceMemory) || 8;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const webGpuSupported = Boolean((navigator as any).gpu);

  let gpuRenderer = webGpuSupported ? 'WebGPU Neural Accelerator' : 'WebGL2 GPU Compositor';
  try {
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl');
    if (gl && 'getExtension' in gl && 'getParameter' in gl) {
      const dbg = (gl as WebGLRenderingContext).getExtension(
        'WEBGL_debug_renderer_info'
      );
      if (dbg) {
        const renderer = String(
          (gl as WebGLRenderingContext).getParameter(dbg.UNMASKED_RENDERER_WEBGL) || ''
        ).trim();
        if (renderer) {
          gpuRenderer = renderer.replace(/ANGLE \((.+)\)/i, '$1').slice(0, 48);
        }
      }
    }
  } catch {
    // Ignore WebGL probe restrictions
  }

  cachedHardwareInfo = {
    cpuThreads,
    deviceRamGb,
    gpuRenderer,
    webGpuSupported,
    processingRatePerMin: 240,
  };
  return cachedHardwareInfo;
}

// Extract implicit user facts from user message automatically
export function extractImplicitUserMemory(text: string): {
  facts: string[];
  detectedName?: string;
} {
  const clean = text.trim();
  if (clean.length < 5 || clean.length > 350) return { facts: [] };

  const facts: string[] = [];
  let detectedName: string | undefined;

  const nameMatch =
    clean.match(
      /(?:আমার নাম|আমি হচ্ছি)\s+([ঀ-৿a-zA-Z\s]{2,25}?)(?:[।,.!]|$)/i
    ) ||
    clean.match(
      /(?:my name is|call me|i am)\s+([a-zA-Z\s]{2,22}?)(?:[.,!]|$)/i
    );

  if (
    nameMatch &&
    !/^(fine|good|okay|here|asking|looking|learning|working|trying|a |an |the )/i.test(
      nameMatch[1].trim()
    )
  ) {
    detectedName = nameMatch[1].trim();
    facts.push(`User's name is ${detectedName}`);
  }

  const factPatterns = [
    /(?:আমি একজন|আমি পেশায়)\s+([^।.!?\n]{3,60})/i,
    /(?:আমার পছন্দ|আমি ভালোবাসি|আমার প্রিয়)\s+([^।.!?\n]{3,60})/i,
    /(?:i work as|i am a|i'm a|my profession is|i prefer|my favorite)\s+([^.!?\n]{3,60})/i,
  ];

  for (const pat of factPatterns) {
    const m = clean.match(pat);
    if (m && m[0]) {
      facts.push(m[0].trim());
    }
  }

  return { facts, detectedName };
}

function parseSelfUpdateJson(raw: string): SelfUpdatePayload | null {
  const stripped = String(raw || '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  if (!stripped) return null;

  // 1. Direct JSON.parse attempt
  try {
    const parsed = JSON.parse(stripped);
    if (parsed && typeof parsed === 'object') {
      return parsed as SelfUpdatePayload;
    }
  } catch {
    // Fall through to balanced object extraction
  }

  // 2. Extract first balanced {...} JSON object (ignores trailing text or extra objects after JSON)
  const startIdx = stripped.indexOf('{');
  if (startIdx !== -1) {
    let depth = 0;
    let inString = false;
    let isEscaped = false;
    for (let i = startIdx; i < stripped.length; i++) {
      const ch = stripped[i];
      if (isEscaped) {
        isEscaped = false;
        continue;
      }
      if (ch === '\\') {
        if (inString) isEscaped = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (!inString) {
        if (ch === '{') depth++;
        else if (ch === '}') {
          depth--;
          if (depth === 0) {
            const candidate = stripped.slice(startIdx, i + 1);
            try {
              const parsed = JSON.parse(candidate);
              if (parsed && typeof parsed === 'object') {
                return parsed as SelfUpdatePayload;
              }
            } catch {
              // Continue scanning in case an inner unescaped quote threw off depth
            }
          }
        }
      }
    }
  }

  // 3. Regex field recovery fallback for payloads with unescaped HTML/code quotes
  const extractStr = (key: string): string | undefined => {
    const m = stripped.match(new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`, 'i'));
    return m ? m[1].trim() : undefined;
  };
  const summary = extractStr('summary');
  const widgetTitle = extractStr('title') || extractStr('customWidgetTitle');
  const widgetDesc = extractStr('description');
  const themeRaw = extractStr('theme');
  const accentRaw = extractStr('accent');
  const customCss = extractStr('customCss');

  let widgetCode: string | undefined;
  const codeKeyMatch = stripped.match(/"(?:code|customCode)"\s*:\s*"/i);
  if (codeKeyMatch && codeKeyMatch.index !== undefined) {
    const valStart = codeKeyMatch.index + codeKeyMatch[0].length;
    const tail = stripped.slice(valStart);
    const endMatch = tail.match(
      /"\s*(?:,\s*"(?:id|title|description|summary|theme|accent|customCss)"|\s*\})/
    );
    if (endMatch && endMatch.index !== undefined) {
      widgetCode = tail
        .slice(0, endMatch.index)
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
    }
  }

  const validAccents = ['indigo', 'emerald', 'rose', 'amber', 'sky'] as const;
  const accent = validAccents.find((a) => a === accentRaw);

  if (summary || widgetCode || themeRaw || accent || customCss) {
    return {
      summary: summary || 'Self-Update Applied',
      ...(themeRaw === 'dark' || themeRaw === 'light' ? { theme: themeRaw } : {}),
      ...(accent ? { accent } : {}),
      ...(customCss ? { customCss } : {}),
      ...(widgetCode
        ? {
            widget: {
              title: widgetTitle || 'Live Widget',
              ...(widgetDesc ? { description: widgetDesc } : {}),
              code: widgetCode,
            },
          }
        : {}),
    };
  }

  return null;
}

// Parse & strip ⟦MEMORY: ...⟧ and ⟦SELF_UPDATE⟧...⟦/SELF_UPDATE⟧ from AI streamed text
/** Keeps AI-supplied file names safe: no traversal, no absolute paths. */
export function sanitizeFileName(name: string): string {
  return (name || '')
    .replace(/[\\/]+/g, '-')
    .replace(/\.\./g, '')
    .replace(/[^\w.\-\u0980-\u09FF ]+/g, '')
    .trim()
    .slice(0, 80);
}

export function parseAIControlTags(rawText: string): {
  cleanText: string;
  memories: string[];
  selfUpdate: SelfUpdatePayload | null;
  notes: AINoteDraft[];
  skills: SelfSkillDraft[];
  thinking?: string;
  isThinkingOpen?: boolean;
} {
  let cleanText = rawText;
  const memories: string[] = [];
  let selfUpdate: SelfUpdatePayload | null = null;
  const notes: AINoteDraft[] = [];
  const skills: SelfSkillDraft[] = [];
  const thinkParts: string[] = [];
  let isThinkingOpen = false;

  // 1. Extract completed <think>...</think>, <thinking>...</thinking>, ◁think▷...◁/think▷ blocks
  cleanText = cleanText.replace(
    /(?:<think(?:ing)?>|◁think▷)([\s\S]*?)(?:<\/think(?:ing)?>|◁\/think▷)/gi,
    (_m, inner) => {
      const t = String(inner || '').trim();
      if (t) thinkParts.push(t);
      return '';
    }
  );

  // 2. Handle models (e.g. DeepSeek-R1 distillers) that emit reasoning followed by a closing </think> without an opening tag
  if (/(?:<\/think(?:ing)?>|◁\/think▷)/i.test(cleanText)) {
    const closeMatch = cleanText.match(
      /^([\s\S]*?)(?:<\/think(?:ing)?>|◁\/think▷)\s*/i
    );
    if (closeMatch) {
      const pre = String(closeMatch[1] || '').trim();
      if (pre) thinkParts.push(pre);
      cleanText = cleanText.slice(closeMatch[0].length);
    }
  }

  // 3. Extract unclosed <think>... block while streaming so raw thinking never flashes in the answer bubble
  const openThinkMatch = cleanText.match(
    /(?:<think(?:ing)?>|◁think▷)([\s\S]*)$/i
  );
  if (openThinkMatch && openThinkMatch.index !== undefined) {
    isThinkingOpen = true;
    const partial = String(openThinkMatch[1] || '').trim();
    if (partial) thinkParts.push(partial);
    cleanText = cleanText.slice(0, openThinkMatch.index);
  }

  // Strip partial opening tag at the very end of a chunk (e.g. "<thin")
  cleanText = cleanText.replace(/(?:<t(?:h(?:i(?:n(?:k(?:i(?:n(?:g)?)?)?)?)?)?)?|◁t(?:h(?:i(?:n(?:k)?)?)?)?)$/i, '');

  cleanText = cleanText.replace(/⟦MEMORY:\s*([^⟧]+?)⟧/gi, (_m, fact) => {
    const trimmed = String(fact || '').trim();
    if (trimmed) memories.push(trimmed);
    return '';
  });

  cleanText = cleanText.replace(
    /⟦SELF_UPDATE⟧\s*([\s\S]*?)\s*⟦\/SELF_UPDATE⟧/gi,
    (_m, jsonStr) => {
      const parsed = parseSelfUpdateJson(String(jsonStr || ''));
      if (parsed) {
        // P1-19: Model-emitted SELF_UPDATE payloads cannot elevate their own autonomy to 'full'
        if (parsed.autonomy === 'full') {
          delete parsed.autonomy;
        }
        selfUpdate = parsed;
      }
      return '';
    }
  );

  cleanText = cleanText.replace(
    /⟦NOTE⟧\s*([\s\S]*?)\s*⟦\/NOTE⟧/gi,
    (_m, jsonStr) => {
      try {
        const cleanedJson = String(jsonStr || '')
          .replace(/^```json\s*/i, '')
          .replace(/```\s*$/i, '')
          .trim();
        const parsed = JSON.parse(cleanedJson) as AINoteDraft;
        const title = String(parsed?.title || '').trim();
        const content = String(parsed?.content || '').trim();
        if (title || content) {
          notes.push({
            title: title || 'Untitled note',
            content,
            tags: Array.isArray(parsed?.tags)
              ? parsed.tags.map((t) => String(t).slice(0, 40)).slice(0, 8)
              : [],
            filename:
              typeof parsed?.filename === 'string'
                ? sanitizeFileName(parsed.filename)
                : undefined,
            save:
              parsed?.save === 'drive' || parsed?.save === 'github'
                ? parsed.save
                : 'local',
          });
        }
      } catch (err: unknown) {
        console.error(
          '[helpers.parseAIControlTags]',
          err instanceof Error ? err.message : 'Malformed note JSON'
        );
      }
      return '';
    }
  );

  // ⟦SELF_CODE⟧{...}⟦/SELF_CODE⟧ → the AI builds a brand-new capability for itself.
  cleanText = cleanText.replace(
    /⟦SELF_CODE⟧\s*([\s\S]*?)\s*⟦\/SELF_CODE⟧/gi,
    (_m, jsonStr) => {
      try {
        const cleanedJson = String(jsonStr || '')
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/```\s*$/i, '')
          .trim();
        const parsed = JSON.parse(cleanedJson) as SelfSkillDraft;
        if (parsed && typeof parsed === 'object' && parsed.name) {
          skills.push({
            name: String(parsed.name).slice(0, 80),
            description: parsed.description
              ? String(parsed.description).slice(0, 240)
              : undefined,
            triggers: Array.isArray(parsed.triggers)
              ? parsed.triggers.map((t) => String(t).slice(0, 60)).slice(0, 12)
              : undefined,
            type: parsed.type === 'widget' ? 'widget' : 'prompt',
            prompt: parsed.prompt ? String(parsed.prompt).slice(0, 4000) : undefined,
            code: parsed.code ? String(parsed.code) : undefined,
          });
        }
      } catch (err: unknown) {
        console.error(
          '[helpers.parseAIControlTags]',
          err instanceof Error ? err.message : 'Malformed selfCode JSON'
        );
      }
      return '';
    }
  );

  cleanText = sanitizeProprietaryOutput(
    cleanText.replace(/⟦(?:MEMORY|SELF_UPDATE|NOTE|SELF_CODE)[\s\S]*$/i, '')
  );

  const thinking =
    thinkParts.length > 0
      ? sanitizeProprietaryOutput(thinkParts.join('\n')).trim()
      : undefined;

  return {
    cleanText: cleanText.trim(),
    memories,
    selfUpdate,
    notes,
    skills,
    ...(thinking ? { thinking } : {}),
    ...(isThinkingOpen ? { isThinkingOpen: true } : {}),
  };
}

const BUILTIN_CALCULATOR_WIDGET_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<style>
  * { box-sizing: border-box; font-family: system-ui, sans-serif; }
  body { margin: 0; padding: 16px; background: #0f172a; color: #f8fafc; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
  .calc { width: 100%; max-width: 340px; background: #1e293b; border-radius: 20px; padding: 18px; box-shadow: 0 20px 50px rgba(0,0,0,0.4); border: 1px solid #334155; }
  .disp { width: 100%; background: #0f172a; color: #38bdf8; border: 1px solid #334155; border-radius: 12px; padding: 14px; font-size: 24px; text-align: right; margin-bottom: 12px; font-family: monospace; overflow-x: auto; min-height: 58px; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  button { padding: 13px 8px; border-radius: 12px; border: 1px solid #334155; background: #334155; color: #f8fafc; font-size: 15px; font-weight: 600; cursor: pointer; transition: 0.15s; }
  button:hover { background: #475569; }
  .op { background: #4f46e5; border-color: #6366f1; }
  .op:hover { background: #4338ca; }
  .eq { background: #10b981; border-color: #059669; grid-column: span 2; }
  .clr { background: #ef4444; border-color: #dc2626; }
</style>
</head>
<body>
<div class="calc">
  <div id="d" class="disp">0</div>
  <div class="grid">
    <button class="clr" onclick="c()">AC</button>
    <button onclick="a('(')">(</button>
    <button onclick="a(')')">)</button>
    <button class="op" onclick="a('/')">÷</button>
    <button onclick="fn('Math.sin(')">sin</button>
    <button onclick="fn('Math.cos(')">cos</button>
    <button onclick="fn('Math.sqrt(')">√</button>
    <button class="op" onclick="a('**')">xʸ</button>
    <button onclick="a('7')">7</button>
    <button onclick="a('8')">8</button>
    <button onclick="a('9')">9</button>
    <button class="op" onclick="a('*')">×</button>
    <button onclick="a('4')">4</button>
    <button onclick="a('5')">5</button>
    <button onclick="a('6')">6</button>
    <button class="op" onclick="a('-')">−</button>
    <button onclick="a('1')">1</button>
    <button onclick="a('2')">2</button>
    <button onclick="a('3')">3</button>
    <button class="op" onclick="a('+')">+</button>
    <button onclick="a('0')">0</button>
    <button onclick="a('.')">.</button>
    <button class="eq" onclick="ev()">=</button>
  </div>
</div>
<script>
  let exp = '';
  const d = document.getElementById('d');
  function a(v){ exp += v; d.textContent = exp || '0'; }
  function fn(v){ exp += v; d.textContent = exp; }
  function c(){ exp = ''; d.textContent = '0'; }
  function ev(){
    try {
      const res = Function('"use strict";return (' + exp + ')')();
      exp = String(Number(res.toFixed(8)));
      d.textContent = exp;
    } catch { d.textContent = 'Error'; exp = ''; }
  }
</script>
</body>
</html>`;

export function detectInstantSelfUpdate(rawText: string): {
  isSelfUpdateIntent: boolean;
  payload: SelfUpdatePayload | null;
  instantReply?: string;
} {
  const clean = rawText.trim();
  if (!clean) return { isSelfUpdateIntent: false, payload: null };

  const lower = clean.toLowerCase();
  const hasExplicitUpdateVerb =
    /(?:(?:নিজেকে|তোমাকে|তোমার\s*(?:নিজেকে|থিম|কালার|রঙ|সিস্টেম|ইউআই|ui|ভেতরে)|সিস্টেমকে|এই\s*অ্যাপকে|অ্যাপটিকে)\s*(?:কোড\s*লিখে\s*)?(?:আপডেট\s*করো|আপডেট\s*করে\s*দাও|আপডেট\s*হও|আপগ্রেড\s*করো|রিসেট\s*করো|পরিবর্তন\s*করো|চেঞ্জ\s*করো|বদলে\s*দাও|বদলাও|যুক্ত\s*করো|যোগ\s*করো))|^(?:নিজেকে\s*আপডেট\s*করো|তোমাকে\s*আপডেট\s*করো|সিস্টেম\s*আপডেট\s*করো|আপডেট\s*করো|আপডেট\s*হও)[!?.।]*$|(?:update|upgrade|modify|customize)\s+(?:yourself|your\s+theme|your\s+ui|your\s+color|your\s+system)|self[\s-]*update/i.test(
      clean
    );

  const hasDirectStyleCommand =
    /(?:থিম|মোড)\s*(?:ডার্ক|লাইট|কালো|সাদা)\s*(?:করো|করে\s*দাও|দাও)|(?:ডার্ক|লাইট|কালো|সাদা)\s*(?:থিম|মোড)\s*(?:করো|করে\s*দাও|দাও|চালু\s*করো)|(?:কালার|রঙ|রং|থিমের\s*রঙ)\s*(?:সবুজ|নীল|আকাশী|লাল|গোলাপি|হলুদ|কমলা|গোল্ডেন|বেগুনি|ইন্ডিগো|এমেরাল্ড|রোজ|অ্যাম্বার)\s*(?:করো|করে\s*দাও|দাও)|(?:ফন্ট|লেখা|টেক্সট)\s*(?:বড়|বড়|ছোট|নরমাল|মাঝারি)\s*(?:করো|করে\s*দাও)|(?:switch|change|set)\s+(?:theme|mode|color|accent|font)\s+to\s+(?:dark|light|emerald|green|indigo|purple|rose|red|amber|orange|sky|blue|small|normal|large)/i.test(
      clean
    );

  const isSelfUpdateIntent = hasExplicitUpdateVerb || hasDirectStyleCommand;
  if (!isSelfUpdateIntent) {
    return { isSelfUpdateIntent: false, payload: null };
  }

  const payload: SelfUpdatePayload = {};
  const summaryParts: string[] = [];

  // 1. Theme detection
  if (
    /(?:ডার্ক|কালো|রাতের|dark)\s*(?:মোড|থিম|mode|theme)?|(?:থিম|মোড|theme|mode)\s*(?:ডার্ক|কালো|dark)/i.test(
      clean
    ) &&
    /\b(?:dark)\b|ডার্ক|কালো/i.test(clean)
  ) {
    payload.theme = 'dark';
    summaryParts.push('ডার্ক থিম (Dark Mode)');
  } else if (
    /\b(?:light)\b|লাইট|সাদা|দিনের/i.test(clean) &&
    /(?:থিম|মোড|theme|mode|লাইট|সাদা|light)/i.test(clean)
  ) {
    payload.theme = 'light';
    summaryParts.push('লাইট থিম (Light Mode)');
  }

  // 2. Accent color detection
  if (/(?:সবুজ|এমেরাল্ড|\bemerald\b|\bgreen\b)/i.test(clean)) {
    payload.accent = 'emerald';
    summaryParts.push('এমেরাল্ড সবুজ কালার (Emerald)');
  } else if (/(?:বেগুনি|ইন্ডিগো|\bindigo\b|\bpurple\b|\bviolet\b)/i.test(clean)) {
    payload.accent = 'indigo';
    summaryParts.push('ইন্ডিগো কালার (Indigo)');
  } else if (/(?:নীল|আকাশী|\bsky\b|\bblue\b|\bcyan\b)/i.test(clean)) {
    payload.accent = 'sky';
    summaryParts.push('স্কাই ব্লু কালার (Sky)');
  } else if (/(?:লাল|গোলাপি|রোজ|\brose\b|\bred\b|\bpink\b)/i.test(clean)) {
    payload.accent = 'rose';
    summaryParts.push('রোজ কালার (Rose)');
  } else if (/(?:হলুদ|কমলা|গোল্ডেন|সোনালী|অ্যাম্বার|\bamber\b|\borange\b|\bgold\b|\byellow\b)/i.test(clean)) {
    payload.accent = 'amber';
    summaryParts.push('অ্যাম্বার গোল্ড কালার (Amber)');
  }

  // 3. Font size detection
  if (/(?:ফন্ট|লেখা|টেক্সট|font)\s*(?:বড়|বড়|large|big)|(?:বড়|বড়|large)\s*(?:ফন্ট|লেখা|font)/i.test(clean)) {
    payload.fontsize = 'large';
    summaryParts.push('বড় ফন্ট সাইজ (Large Font)');
  } else if (/(?:ফন্ট|লেখা|টেক্সট|font)\s*(?:ছোট|small)|(?:ছোট|small)\s*(?:ফন্ট|লেখা|font)/i.test(clean)) {
    payload.fontsize = 'small';
    summaryParts.push('ছোট ফন্ট সাইজ (Small Font)');
  } else if (/(?:ফন্ট|লেখা|টেক্সট|font)\s*(?:নরমাল|মাঝারি|স্বাভাবিক|normal|medium)/i.test(clean)) {
    payload.fontsize = 'normal';
    summaryParts.push('নরমাল ফন্ট সাইজ (Normal Font)');
  }

  // 4. AI Mode detection
  if (/(?:আলট্রা|পাওয়ার|পাওয়ার|\bultra\b|\bpower\b)\s*(?:মোড|মডেল|mode)?/i.test(clean)) {
    payload.mode = 'power';
    summaryParts.push('SMFTA-3 Ultra Mode');
  } else if (/(?:ব্যালেন্সড|সনেট|\bbalanced\b|\bsonnet\b)\s*(?:মোড|মডেল|mode)?/i.test(clean)) {
    payload.mode = 'balanced';
    summaryParts.push('SMFTA-2 Sonnet Mode');
  } else if (/(?:ফাস্ট|ফ্ল্যাশ|\bfast\b|\bflash\b)\s*(?:মোড|মডেল|mode)/i.test(clean)) {
    payload.mode = 'fast';
    summaryParts.push('SMFTA-1 Flash Mode');
  }

  // 5. Reply Style / Language detection
  if (/(?:সংক্ষেপে|সংক্ষিপ্ত|\bconcise\b)\s*(?:উত্তর|স্টাইল|মোড|mode|style)/i.test(clean)) {
    payload.style = 'concise';
    summaryParts.push('সংক্ষিপ্ত উত্তর স্টাইল');
  } else if (/(?:বিস্তারিত|\bdetailed\b)\s*(?:উত্তর|স্টাইল|মোড|mode|style)/i.test(clean)) {
    payload.style = 'detailed';
    summaryParts.push('বিস্তারিত উত্তর স্টাইল');
  }

  if (/(?:শুধু\s*বাংলায়|সবসময়\s*বাংলায়|always\s*(?:reply\s*in\s*)?bengali)/i.test(clean)) {
    payload.replyLang = 'bn';
    summaryParts.push('ভাষা: বাংলা');
  } else if (/(?:শুধু\s*ইংরেজিতে|সবসময়\s*ইংরেজিতে|always\s*(?:reply\s*in\s*)?english)/i.test(clean)) {
    payload.replyLang = 'en';
    summaryParts.push('Language: English');
  }

  // 6. Reset CSS / Widgets
  if (/(?:সিএসএস\s*রিসেট|কাস্টম\s*সিএসএস\s*মুছো|reset\s*css|reset\s*style)/i.test(clean)) {
    payload.resetCustomCss = true;
    summaryParts.push('কাস্টম স্টাইল রিসেট');
  }
  if (/(?:সব\s*উইজেট\s*মুছো|উইজেট\s*রিমুভ|remove\s*all\s*widgets|clear\s*widgets)/i.test(clean)) {
    payload.removeWidgetId = 'all';
    summaryParts.push('সকল উইজেট ক্লিয়ার');
  }

  // 7. Built-in Live Calculator Widget
  if (/(?:ক্যালকুলেটর|calculator)/i.test(lower)) {
    payload.widget = {
      id: 'w-calc-' + Date.now(),
      title: 'Scientific Calculator Pro',
      description: 'লাইভ সায়েন্টিফিক ক্যালকুলেটর উইজেট',
      code: BUILTIN_CALCULATOR_WIDGET_HTML,
    };
    summaryParts.push('সায়েন্টিফিক ক্যালকুলেটর উইজেট যুক্ত');
  }

  const isAskingCustomWidgetOrCode =
    /(?:গেম|game|ঘড়ি|ঘড়ি|clock|নোটপ্যাড|notepad|টুল|tool|উইজেট|widget|কোড|code|চার্ট|chart|টাইমার|timer|কুইজ|quiz|ড্যাশবোর্ড|dashboard)/i.test(
      lower
    ) && !payload.widget;

  if (summaryParts.length > 0) {
    payload.summary = summaryParts.join(' · ');
    if (!isAskingCustomWidgetOrCode) {
      return {
        isSelfUpdateIntent: true,
        payload,
        instantReply: `⚡ **সেটিংস পরিবর্তন সম্পন্ন হয়েছে!**\n\n- **পরিবর্তন বিবরণ:** ${payload.summary}\n- **সিস্টেম ভার্সন:** \`SMFTA Pro v${APP_VERSION}\``,
      };
    }
    return {
      isSelfUpdateIntent: true,
      payload,
    };
  }

  return {
    isSelfUpdateIntent: false,
    payload: null,
  };
}

export function extractFallbackWidgetFromReply(
  aiText: string,
  userPrompt: string
): SelfUpdatePayload | null {
  const htmlBlockMatch =
    aiText.match(/```html\s*([\s\S]*?)```/i) ||
    aiText.match(/(<!DOCTYPE html[\s\S]*?<\/html>)/i);
  if (!htmlBlockMatch || !htmlBlockMatch[1]) return null;
  const code = htmlBlockMatch[1].trim();
  if (code.length < 40) return null;

  const titleMatch =
    code.match(/<title>([^<]{2,50})<\/title>/i) ||
    userPrompt.match(/(?:একটি|টা|add|create|build)\s+([^,.।!\n]{3,35})/i);
  const title = titleMatch?.[1]?.trim() || 'Live Self-Updated Widget';

  return {
    widget: {
      id: 'w-' + Date.now(),
      title,
      description: 'AI দ্বারা স্বয়ংক্রিয়ভাবে নির্মিত লাইভ উইজেট',
      code,
    },
    summary: `লাইভ উইজেট "${title}" ইনস্টল করা হয়েছে`,
  };
}

let fallbackIdCounter = 0;

export function createUniqueId(prefix = 'id'): string {
  try {
    if (
      typeof crypto !== 'undefined' &&
      typeof crypto.randomUUID === 'function'
    ) {
      return `${prefix}-${crypto.randomUUID()}`;
    }
  } catch {
    // Fallback below
  }
  fallbackIdCounter = (fallbackIdCounter + 1) % 1_000_000;
  return `${prefix}-${Date.now()}-${fallbackIdCounter}-${Math.random()
    .toString(36)
    .slice(2, 9)}`;
}

export function formatTime(
  ts: number | string | undefined,
  nowTs = Date.now()
): string {
  try {
    if (ts === undefined || ts === null || ts === '') return '';
    const date = typeof ts === 'number' ? new Date(ts) : new Date(String(ts));
    const timeMs = date.getTime();
    if (!Number.isFinite(timeMs) || timeMs <= 0) return '';

    const now = new Date(nowTs);
    const sameDay =
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate();

    if (sameDay) {
      return date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
    }

    const sameYear = date.getFullYear() === now.getFullYear();
    if (sameYear) {
      return date.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }

    return date.toLocaleString([], {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

/** Human-friendly labels for every AI engine shown in the UI. */
export const PROVIDER_LABELS: Record<string, string> = {
  xrahat: 'SMFTA Core Engine',
  smfta_cloud: 'SMFTA Cloud',
  custom: 'Custom API',
  unorouter: 'UnoRouter',
  codecraft: 'CodeCraft API',
  gemini_custom: 'Gemini (AIza Key)',
  gemini_openai: 'Gemini (OpenAI Compatible)',
  openrouter: 'OpenRouter',
  groq: 'Groq',
  deepseek: 'DeepSeek',
  openai: 'OpenAI',
  cerebras: 'Cerebras',
  mistral: 'Mistral',
  together: 'Together AI',
  xai: 'xAI Grok',
  github: 'GitHub Models',
  nvidia: 'NVIDIA NIM',
  lmstudio: 'LM Studio',
  ollama: 'Ollama',
};

export function providerLabel(provider?: string): string {
  if (!provider) return PROVIDER_LABELS.xrahat;
  return PROVIDER_LABELS[provider] || provider;
}
