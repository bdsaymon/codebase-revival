/**
 * SMFTA Pro — Self-Answer Engine 🧠 (v18.11.0)
 *
 * Two problems this module fixes:
 *
 * 1. **The app used to answer a different question.** When the free engine was
 *    unreachable it replied with a canned "⚡ SMFTA Auto-Cloud Engine সচল
 *    রয়েছে!" banner and the user's question was ignored. Now the fallback is a
 *    real, relevant answer: identity, capabilities, a state-aware self-audit of
 *    what still needs improving, memory recall, version/status and how-to
 *    guidance — all derived from the *live* app state.
 *
 * 2. **It could not say what it still needs.** "তোমাকে আর কী কী আপডেট করতে
 *    হবে?" was answered with unrelated text. `buildSelfAudit()` inspects what is
 *    actually missing (no GitHub link, no project zip, thin memory, …) and
 *    returns a prioritised, honest roadmap.
 *
 * Pure functions only — shared by the browser and the server, fully testable.
 */

import { APP_VERSION } from '../version';

export interface SelfAnswerContext {
  query: string;
  version?: string;
  userName?: string;
  /** Stored memory facts (already de-duped). */
  memory?: string[];
  theme?: 'dark' | 'light';
  mode?: 'fast' | 'balanced' | 'power';
  providerLabel?: string;
  driveConnected?: boolean;
  githubConnected?: boolean;
  skillCount?: number;
  noteCount?: number;
  /** Loaded .zip project, if any. */
  projectName?: string;
  projectFiles?: number;
  webSearch?: boolean;
  /** Does the runtime have a reachable cloud model right now? */
  online?: boolean;
}

const BN_RANGE = /[\u0980-\u09FF]/;

export function isBengali(text: string): boolean {
  return BN_RANGE.test(text || '');
}

function norm(text: string): string {
  return (text || '')
    .toLowerCase()
    .replace(/[?!।.,'"`“”‘’]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// NOTE: never use `\b` next to Bengali letters — they are non-word characters
// for JS regex, so `তোমাকে\b` would never match. A negative lookahead on the
// Bengali + latin letter ranges is the correct boundary here.
const SELF_SUBJECT =
  /(তুমি|তোমার|তোমাকে|তোমরা|আপনি|আপনার|নিজে|নিজের|you|your|yourself|ur)(?![\u0980-\u09FFa-z])/i;

const SELF_TOPIC =
  /(আপডেট|আপগ্রেড|উন্নতি|উন্নত|ক্ষমতা|সক্ষমতা|কী কী পারো|কি কি পারো|কী পারো|কি পারো|কী পারো না|পারো না|সীমাবদ্ধ|যোগ করা|বাড়ানো|update|upgrade|improve|capab|ability|what can you|what do you do|can t you|cannot do|limitation|feature|missing|todo|roadmap|version|ভার্সন|সেটিং|setting|settings|system|সিস্টেম|স্টেটাস|status|কী করো|কি করো|who are you|কে তুমি|তুমি কে|তোমার নাম|your name|তৈরি করেছে|বানিয়েছে|বানিয়েছে|নির্মাতা|মালিক|ডেভেলপার|who created you|who made you|who built you|creator|developer|জিপ|zip|থিম|theme|মেমোরি|memory|মনে রাখ|ড্রাইভ|drive|github|গিটহাব|নোটবুক|notebook)/i;

const WORLD_TASK_TOPIC =
  /(গল্প|কবিতা|রচনা|প্রবন্ধ|চিঠি|দরখাস্ত|আর্টিকেল|প্যারাগ্রাফ|অনুবাদ|পাইথন|জাভাস্ক্রিপ্ট|ফাংশন|প্রোগ্রাম|স্ক্রিপ্ট|অ্যালগরিদম|সমীকরণ|রান্না|ইতিহাস|বিজ্ঞান|ভূগোল|রাজধানী|আবহাওয়া|খবর|্র ক্রিকেট|ফুটবল|জীবনী|story|poem|essay|article|letter|translate|python|javascript|react|function|algorithm|equation|recipe|history|science|capital|weather|news|biography)/i;

/**
 * Local self-question interception is disabled so all conversational queries
 * (e.g. "তোমাকে কখন update করা হয়েছে?", "what is your version?", "who made you?")
 * are routed directly to the active AI provider/model stream.
 */
export function isSelfQuestion(_query: string): boolean {
  return false;
}

export function matchesSelfTopic(query: string): boolean {
  const q = norm(query);
  if (!q || q.length > 220) return false;
  if (WORLD_TASK_TOPIC.test(q) && !/(তোমাকে|নিজেকে|তোমার সিস্টেম|your system|zip|জিপ)/.test(q)) {
    return false;
  }
  if (
    !SELF_SUBJECT.test(q) &&
    !/^(কী কী পারো|কি কি পারো|তোমার|আপনার|কে তোমাকে|who are you|what can you|who created you|who made you|who built you)/i.test(
      q
    )
  ) {
    return false;
  }
  return SELF_TOPIC.test(q);
}

const CAPABILITIES_BN = [
  'কোড লেখা, ডিবাগ করা আর কোড লাইভ চালানো (Live Preview + Code Lab)',
  'সম্পূর্ণ ওয়েবসাইট/UI ডিজাইন — এক ফাইলের রান-যোগ্য ডেমো',
  'ZIP প্রজেক্ট খোলা, ফাইল বদলানো, আবার ZIP বানিয়ে দেওয়া',
  'নোট রাখা (Notebook) এবং চাইলে Google Drive-এ সেভ',
  'GitHub-এ ফাইল/ব্যাকআপ লেখা (কানেক্ট করা থাকলে)',
  'মেমোরি — আপনি যা বলবেন, নতুন চ্যাটেও মনে থাকবে',
  'নিজের UI বদলানো (থিম, রঙ, কর্নার, ঘনত্ব) ও নিজের স্কিল ইনস্টল',
];

const CAPABILITIES_EN = [
  'Writing, debugging and running code live (Live Preview + Code Lab)',
  'Building complete websites / UI demos as one runnable file',
  'Opening .zip projects, editing files inside them and repacking the zip',
  'Notes (Notebook) optionally saved to your Google Drive',
  'Writing files and backups to GitHub (when connected)',
  'Persistent memory across chats',
  'Changing my own UI (theme, accent, corners, density) and installing skills',
];

/** "তুমি কী কী পারো?" — an honest, current capability list. */
export function buildCapabilityAnswer(ctx: SelfAnswerContext): string {
  const bn = isBengali(ctx.query) || ctx.query.trim().length === 0;
  const list = bn ? CAPABILITIES_BN : CAPABILITIES_EN;
  const head = bn ? '**আমি এখন যা করতে পারি**' : '**What I can do right now**';
  const extra: string[] = [];
  if (ctx.projectName) {
    extra.push(
      bn
        ? `এখনই লোড আছে: \`${ctx.projectName}\` (${ctx.projectFiles || 0} ফাইল) — কোন ফাইল বদলাব বলুন।`
        : `Currently loaded: \`${ctx.projectName}\` (${ctx.projectFiles || 0} files).`
    );
  }
  return [head, ...list.map((l) => `• ${l}`), ...extra].join('\n');
}

/**
 * "তোমাকে আর কী কী আপডেট করতে হবে?" — a real audit of the current state.
 * Only states what is genuinely missing, then the next three concrete steps.
 */
export function buildSelfAudit(ctx: SelfAnswerContext): string {
  const bn = isBengali(ctx.query) || !ctx.query.trim();
  const missing: string[] = [];

  if (!ctx.githubConnected) {
    missing.push(
      bn
        ? 'GitHub কানেক্ট নেই — এটা জুড়লে আমি সরাসরি আপনার রিপোর যেকোনো পাথে ফাইল লিখতে ও আপডেট করতে পারব।'
        : 'GitHub is not connected — linking it lets me write and update files at any path in your repo.'
    );
  }
  if (!ctx.driveConnected) {
    missing.push(
      bn
        ? 'Google Drive কানেক্ট নেই — নোট ও ব্যাকআপ আপনার নিজের ড্রাইভে রাখা যাবে না।'
        : 'Google Drive is not connected — notes and backups cannot be saved to your own Drive.'
    );
  }
  if (!ctx.projectName) {
    missing.push(
      bn
        ? 'এখন কোনো ZIP প্রজেক্ট লোড নেই — একটা `.zip` দিন, আমি ফাইল ধরে ধরে আপডেট করে নতুন ZIP দেব।'
        : 'No .zip project is loaded — upload one and I will edit file by file and hand back a new zip.'
    );
  }
  if ((ctx.memory?.length || 0) < 3) {
    missing.push(
      bn
        ? `মেমোরিতে মাত্র ${ctx.memory?.length || 0}টি তথ্য আছে — “মনে রাখো …” দিয়ে আরও দিন, তাহলে উত্তর ব্যক্তিগত হবে।`
        : `Memory holds only ${ctx.memory?.length || 0} facts — add a few with "remember …" for personalised answers.`
    );
  }
  if (!ctx.skillCount) {
    missing.push(
      bn
        ? 'এখনো কোনো কাস্টম স্কিল ইনস্টল করা নেই — একটা HTML টুল দিলে সেটা আমার নিজের স্কিল হিসেবে বসিয়ে নেব।'
        : 'No custom skills installed yet — give me an HTML tool and I will install it as my own skill.'
    );
  }
  if (missing.length === 0) {
    missing.push(
      bn
        ? 'এখন বাধ্যতামূলক কিছু বাকি নেই — আপনি কোন দিকে আরও শক্ত করতে চান বললে সেই দিকেই কাজ করব।'
        : 'Nothing is strictly missing right now — tell me which direction to strengthen.'
    );
  }

  const next = bn
    ? [
        '১. ZIP প্রজেক্ট দিন → নির্দিষ্ট ফাইল/পাথে বদল করে নতুন ZIP ফেরত দেব।',
        '২. GitHub কানেক্ট করুন → আপনার রিপোর ঠিক যে পাথে বলবেন সেখানেই আপডেট লিখব।',
        '৩. যা যা মনে রাখতে বলবেন, বলুন → মেমোরি শক্ত হবে, উত্তর কম ভুল হবে।',
      ]
    : [
        '1. Upload a .zip → I edit the exact files/paths you name and return a new zip.',
        '2. Connect GitHub → I commit updates to the exact path you specify.',
        '3. Tell me facts to remember → stronger memory, fewer wrong answers.',
      ];

  // Product roadmap — always concrete, never "everything is fine".
  const roadmap = bn
    ? [
        'ফাইল লেখা আরও সরাসরি: GitHub কানেক্ট থাকলে যেকোনো পাথে এক ক্লিকে লেখা, না থাকলে ZIP আপডেট।',
        'মেমোরি আরও স্মার্ট: একই তথ্য বারবার নয়, পুরোনো তথ্য নিজে থেকে সাজিয়ে রাখা।',
        'লাইভ প্রিভিউতে একাধিক ফাইলের প্রজেক্ট আরও ভালোভাবে চালানো (CDN ছাড়া অফলাইন পেজ)।',
        'উত্তরের গতি: প্রথম টোকেন যত দ্রুত সম্ভব, কোনো কৃত্রিম অপেক্ষা ছাড়া।',
      ]
    : [
        'More direct file writing: one-click writes to any repo path when GitHub is connected, otherwise zip updates.',
        'Smarter memory: no duplicate facts, old facts consolidated automatically.',
        'Better multi-file projects in Live Preview (offline pages without CDNs).',
        'Speed: first token as fast as the provider allows, with no artificial waiting.',
      ];

  const head = bn
    ? '**যা এখনো দরকার (আসল অবস্থা দেখে)**'
    : '**What still needs work (based on live state)**';
  const roadmapHead = bn
    ? '**নিজের সিস্টেমে যে আপডেটগুলো আমি করব**'
    : '**Upgrades I plan for my own system**';
  const nextHead = bn ? '**পরের তিনটি ধাপ**' : '**Next three steps**';
  return [
    head,
    ...missing.map((m) => `• ${m}`),
    '',
    roadmapHead,
    ...roadmap.map((m) => `• ${m}`),
    '',
    nextHead,
    ...next,
  ].join('\n');
}

/** How-to answers for the questions users actually ask. */
function buildHowTo(q: string, ctx: SelfAnswerContext): string | null {
  const bn = isBengali(q);
  const has = (...w: string[]) => w.some((x) => q.includes(x));

  if (has('ডার্ক', 'লাইট', 'থিম', 'theme', 'dark', 'light', 'রঙ', 'accent', 'color')) {
    return bn
      ? 'চ্যাটেই লিখুন: “থিম ডার্ক করো” বা “অ্যাকসেন্ট সবুজ করো” — সাথে সাথে পুরো ইন্টারফেস বদলে যাবে (সেটিংসেও আছে)।'
      : 'Just say "make the theme dark" or "make the accent green" in chat — the whole interface changes instantly.';
  }
  if (has('মনে রাখ', 'মেমোরি', 'memory', 'remember')) {
    return bn
      ? 'লিখুন: “মনে রাখো আমার নাম সায়মন” — নতুন চ্যাট, রিলোড বা অন্য ডিভাইসেও আমি মনে রাখব। “সব ভুলে যাও” বললে মুছে যাবে।'
      : 'Say "remember that my name is Saymon" — it survives reloads and new chats. "Forget everything" clears it.';
  }
  if (has('জিপ', 'zip')) {
    return bn
      ? 'কম্পোজারের `+` থেকে `.zip` দিন — আমি ফাইলগুলো পড়ে নেব, তারপর “index.html-এ হেডার বদলাও” জাতীয় নির্দেশে ঠিক সেই ফাইলটাই বদলে নতুন ZIP দেব। Run চাপলে প্রজেক্টটা এখানেই চলবে।'
      : 'Attach a .zip with the + button — I read the file tree, edit exactly the file you name, and hand back a new zip. Run executes it right here.';
  }
  if (has('ড্রাইভ', 'drive', 'github', 'গিটহাব', 'কানেক্ট', 'connect')) {
    return bn
      ? 'সাইডবারের **Connectors** খুলুন → Google Drive বা GitHub টোকেন দিন (OAuth Playground/GitHub token লিংক ওখানেই আছে)। কানেক্ট হলে নোট Drive-এ যাবে, আর GitHub-এ নির্দিষ্ট পাথে কোড লেখা যাবে।'
      : 'Open **Connectors** in the sidebar and add a Google Drive or GitHub token (the no-setup links are right there).';
  }
  if (has('নোট', 'notebook', 'নোটবুক')) {
    return bn
      ? 'সাইডবারের **Notebook** খুলুন, অথবা চ্যাটে লিখুন “এই লেখাটা নোট করে রাখো” — নোট লোকালিতে থাকবে, Drive কানেক্ট থাকলে সেখানেও যাবে।'
      : 'Open **Notebook** in the sidebar, or say "save this as a note" — it stays local and syncs to Drive when connected.';
  }
  return null;
}

/**
 * Local answer interception is disabled for live queries — returns `null` unless
 * explicitly invoked in offline fallback mode (`ctx.online === false`).
 */
export function buildSelfAnswer(ctx: SelfAnswerContext): string | null {
  if (ctx.online !== false) return null;
  const query = ctx.query || '';
  const q = norm(query);
  if (!q) return null;
  if (!matchesSelfTopic(query)) return null;

  const bn = isBengali(query);
  const has = (...w: string[]) => w.some((x) => q.includes(x));

  // What still needs updating / what should be added.
  if (
    has('আপডেট', 'আপগ্রেড', 'উন্নতি', 'দরকার', 'প্রয়োজন', 'কী কী করা', 'কি কি করা', 'যোগ করা', 'বাড়ানো', 'update', 'upgrade', 'improve', 'missing', 'need', 'roadmap', 'todo')
  ) {
    return buildSelfAudit(ctx);
  }

  // Identity & Creator.
  if (
    has(
      'তোমার নাম',
      'কে তুমি',
      'তুমি কে',
      'তোমাকে কে তৈরি',
      'কে তোমাকে তৈরি',
      'তোমাকে কে বানিয়েছে',
      'তোমাকে কে বানিয়েছে',
      'কে তোমাকে বানিয়েছে',
      'কে তোমাকে বানিয়েছে',
      'তোমার নির্মাতা',
      'তোমার মালিক',
      'তোমার ডেভেলপার',
      'who are you',
      'your name',
      'who created you',
      'who made you',
      'who built you',
      'your creator',
      'your developer'
    )
  ) {
    return bn
      ? `আমি **SMFTA AI Pro** (**SMFTA Pro** v${ctx.version || APP_VERSION}) — **SMFTA AI Pro** প্ল্যাটফর্মের নিজস্ব ও নির্ধারিত AI অ্যাসিস্ট্যান্ট। কোড, ডিজাইন, নোট, ZIP প্রজেক্ট আর নিজের UI — সব এক জায়গায় সামলাই।`
      : `I am **SMFTA AI Pro** (**SMFTA Pro** v${ctx.version || APP_VERSION}) — the dedicated AI assistant built for the **SMFTA AI Pro** platform for code, design, notes, zip projects and my own UI.`;
  }

  // Version / current state.
  if (has('ভার্সন', 'version', 'কোন মডেল', 'which model', 'তোমার সেটিং', 'your setting', 'স্টেটাস', 'status')) {
    const lines = bn
      ? [
          `**বর্তমান অবস্থা**`,
          `• ভার্সন: v${ctx.version || APP_VERSION}`,
          `• মোড: ${ctx.mode || 'balanced'}${ctx.theme ? ` · থিম: ${ctx.theme}` : ''}`,
          `• মডেল: ${ctx.providerLabel || 'SMFTA Cloud'}`,
          `• মেমোরি: ${ctx.memory?.length || 0}টি তথ্য · নোট: ${ctx.noteCount || 0}টি · স্কিল: ${ctx.skillCount || 0}টি`,
          `• কানেকশন: Drive ${ctx.driveConnected ? 'সংযুক্ত' : 'নেই'} · GitHub ${ctx.githubConnected ? 'সংযুক্ত' : 'নেই'}`,
          ctx.projectName ? `• লোডেড প্রজেক্ট: ${ctx.projectName} (${ctx.projectFiles || 0} ফাইল)` : '• লোডেড প্রজেক্ট: নেই',
        ]
      : [
          `**Current state**`,
          `• Version: v${ctx.version || APP_VERSION}`,
          `• Mode: ${ctx.mode || 'balanced'}${ctx.theme ? ` · theme: ${ctx.theme}` : ''}`,
          `• Model: ${ctx.providerLabel || 'SMFTA Cloud'}`,
          `• Memory: ${ctx.memory?.length || 0} facts · notes: ${ctx.noteCount || 0} · skills: ${ctx.skillCount || 0}`,
          `• Connected: Drive ${ctx.driveConnected ? 'yes' : 'no'} · GitHub ${ctx.githubConnected ? 'yes' : 'no'}`,
          ctx.projectName ? `• Loaded project: ${ctx.projectName} (${ctx.projectFiles || 0} files)` : '• Loaded project: none',
        ];
    return lines.join('\n');
  }

  // Limits — honest, no bragging.
  if (has('কী পারো না', 'পারো না', 'সীমাবদ্ধ', 'limitation', 'cannot do', 'what can t you')) {
    return bn
      ? '**যা পারি না (স্পষ্ট করে বলছি)**\n• নিজে থেকে ইন্টারনেটে ঢুকে যেকোনো সাইটে লগইন করা\n• ওয়েবসাইটের বাইরে আপনার ডিভাইসের ফাইল সরাসরি বদলানো\n• API key ছাড়া সব সময় সবচেয়ে বড় মডেলের গুণমান দেওয়া\n\nসেটিংসে প্রোভাইডার key দিলে উত্তর আরও নির্ভুল ও গভীর হবে।'
      : '**What I cannot do**\n• Log into arbitrary websites on my own\n• Touch files outside this workspace\n• Guarantee top-model quality without a provider key';
  }

  // How-to before the broad capability list.
  const howTo = buildHowTo(q, ctx);
  if (howTo) return howTo;

  // Capabilities.
  if (has('কী কী পার', 'কি কি পার', 'কী পারো', 'কি পারো', 'কী করো', 'কি করো', 'ক্ষমতা', 'সক্ষমতা', 'capab', 'ability', 'what can you', 'what do you do', 'feature')) {
    return buildCapabilityAnswer(ctx);
  }

  return null;
}

/**
 * Last-resort answer when no model is reachable. **Always relevant**: it either
 * answers from memory/self-knowledge or says honestly what happened — it never
 * pretends an engine processed the question.
 */
export function buildOfflineAnswer(ctx: SelfAnswerContext): string {
  const self = buildSelfAnswer(ctx);
  if (self) return self;

  const bn = isBengali(ctx.query);
  const q = (ctx.query || '').trim().slice(0, 200);

  const memory = ctx.memory || [];
  const fact = memory.find((m) => {
    const key = m.split(/[:=]/)[0].trim().toLowerCase();
    return key.length > 2 && norm(ctx.query).includes(norm(key));
  });

  if (fact) {
    return bn
      ? `আমার মেমোরি থেকে: **${fact}**`
      : `From my memory: **${fact}**`;
  }

  return bn
    ? `এই মুহূর্তে অনলাইন মডেলের সাথে সংযোগ হচ্ছে না, তাই প্রশ্নটির (\`${q}\`) পূর্ণ উত্তর দিতে পারছি না — বানানো উত্তর দেব না।\n\nএখনই যা করতে পারি:\n• নিজের সিস্টেম, ক্ষমতা বা সেটিংস নিয়ে যেকোনো প্রশ্ন\n• মনে রাখা তথ্য, হিসাব, কোড লেখা ও লাইভ প্রিভিউ\n• ZIP প্রজেক্ট পড়া ও ফাইল বদলানো\n\nচাইলে **Settings → AI Providers**-এ একটি key দিলে সব প্রশ্নের পূর্ণ উত্তর আসবে।`
    : `I cannot reach an online model right now, so I will not invent an answer to \`${q}\`.\n\nI can still handle self/system questions, memory, maths, code and zip projects. Add a provider key in Settings → AI Providers for full answers.`;
}
