/**
 * SMFTA AI Pro — Self-Command Interpreter ⚡ (v18.1.0)
 *
 * The assistant must never "fail" to change itself just because the underlying
 * model forgot to emit a ⟦SELF_UPDATE⟧ block. This module understands plain
 * Bangla / English orders ("থিম ডার্ক করো", "make the accent green", "মডেল
 * groq করে দাও", "নিজেকে রিপেয়ার করো") and returns concrete, typed actions the
 * app executes deterministically — instantly and offline.
 *
 * Pure functions only (unit-tested).
 */

import { AppSettings, ExternalProviderId } from '../types';
import { DEFAULT_PROVIDER_MODELS, DEFAULT_PROVIDER_BASE_URLS } from './providers';
import type { AutonomyLevel, SelfSkillDraft } from './selfEngine';

export type SelfActionKind =
  | 'settings'
  | 'memory'
  | 'skill'
  | 'connector'
  | 'repair'
  | 'autonomy'
  | 'launch';

export interface SelfAction {
  kind: SelfActionKind;
  label: string;
  patch?: Partial<AppSettings>;
  memory?: string[];
  clearMemory?: boolean;
  skill?: SelfSkillDraft;
  connector?: 'drive' | 'github' | 'notebook' | 'settings';
  autonomy?: AutonomyLevel;
  webSearch?: boolean;
}

const has = (text: string, ...words: string[]) => words.some((w) => text.includes(w));
const hasRe = (text: string, rx: RegExp) => rx.test(text);

/** Verbs that turn a sentence into an order (guards against plain questions). */
const ORDER_RX =
  /(করো|করে\s*দাও|করে\s*দিন|বদলাও|পরিবর্তন|সেট\s*কর|চালু\s*কর|বন্ধ\s*কর|দিয়ে\s*দাও|তৈরি\s*কর|বানাও|কমাও|কমান|বাড়াও|বাড়ান|গোল\s*কর|সোজা\s*কর|রাখো|\bmake\b|\bset\b|\bchange\b|\bswitch\b|\bturn\b|\benable\b|\bdisable\b|\bdo it\b|\bapply\b|\bcreate\b|\bbuild\b|\breduce\b|\bincrease\b)/i;

const OPEN_LAUNCH_RX =
  /(খোলো|ওপেন|দেখাও|যাও|কানেক্ট|যুক্ত|সেটআপ|\bopen\b|\blaunch\b|\bconnect\b|\bsetup\b)/i;

const QUESTION_RX =
  /(?:(?<![\u0980-\u09FF])(?:কী|কি|কেমন|কেন|কোথায়|কীভাবে|কিভাবে|কত)(?![\u0980-\u09FF])|\bhow\b|\bwhat\b|\bwhy\b|\bwhich\b|\bwhere\b|\bwho\b|\bwhen\b|\bcan you\b|\bcould you\b|\bwould you\b|\?)/i;

export function looksLikeOrder(text: string): boolean {
  return ORDER_RX.test(text || '');
}

/** Colour words → accent ids. */
function detectAccent(t: string): AppSettings['accent'] | undefined {
  if (has(t, 'emerald', 'এমারেল্ড', 'সবুজ', 'green')) return 'emerald';
  if (has(t, 'rose', 'রোজ', 'লাল', 'গোলাপি', 'pink', 'red')) return 'rose';
  if (has(t, 'amber', 'অ্যাম্বার', 'হলুদ', 'কমলা', 'orange', 'yellow')) return 'amber';
  if (has(t, 'sky', 'স্কাই', 'আকাশি', 'নীল', 'blue', 'cyan')) return 'sky';
  if (has(t, 'indigo', 'ইন্ডিগো', 'ভায়োলেট', 'বেগুনি', 'purple', 'violet'))
    return 'indigo';
  return undefined;
}

/** Provider aliases → provider ids. */
const PROVIDER_ALIASES: Array<[ExternalProviderId, string[]]> = [
  ['xrahat', ['xrahat', 'ডিফল্ট ইঞ্জিন', 'default engine', 'ফ্রি ইঞ্জিন', 'built-in engine']],
  ['smfta_cloud', ['smfta cloud', 'ক্লাউড ইঞ্জিন']],
  ['codecraft', ['codecraft', 'কোডক্রাফট']],
  ['openai', ['openai', 'gpt-4', 'gpt-5', 'chatgpt']],
  ['gemini_custom', ['gemini', 'জেমিনি']],
  ['openrouter', ['openrouter', 'ওপেনরাউটার']],
  ['groq', ['groq', 'গ্রোক']],
  ['deepseek', ['deepseek', 'ডিপসিক']],
  ['mistral', ['mistral', 'মিস্ট্রাল']],
  ['xai', ['xai', 'grok', 'গ্রোক এআই']],
  ['together', ['together']],
  ['cerebras', ['cerebras']],
  ['github', ['github models', 'গিটহাব মডেল']],
  ['nvidia', ['nvidia', 'এনভিডিয়া']],
  ['ollama', ['ollama', 'ওলামা']],
  ['lmstudio', ['lm studio', 'lmstudio']],
];

/** Common model names the user may say out loud. */
const MODEL_ALIASES: Array<[string, string[]]> = [
  ['gpt-4o-mini', ['gpt-4o-mini', 'gpt 4o mini']],
  ['gpt-4o', ['gpt-4o', 'gpt 4o']],
  ['claude-3.5-sonnet', ['claude 3.5', 'claude sonnet', 'ক্লড']],
  ['gemini-2.5-flash', ['gemini 2.5 flash', 'জেমিনি ফ্ল্যাশ']],
  ['gemini-2.5-pro', ['gemini 2.5 pro', 'জেমিনি প্রো']],
  ['deepseek-chat', ['deepseek chat', 'ডিপসিক চ্যাট']],
  ['deepseek-r1', ['deepseek r1', 'ডিপসিক আর১']],
  ['llama-3.3-70b-versatile', ['llama 3.3', 'লামা']],
  ['qwen-2.5-coder', ['qwen', 'কিউয়েন']],
];

/**
 * Reads a natural-language order and returns every concrete change it implies.
 * Returns an empty array when the text is not a self-update order.
 */
export function interpretSelfCommand(rawText: string): SelfAction[] {
  const text = (rawText || '').toLowerCase();
  if (!text.trim()) return [];
  const actions: SelfAction[] = [];
  const order = looksLikeOrder(text);
  const question = hasRe(text, QUESTION_RX);

  // ── Theme (require UI/theme context or explicit dark/light mode phrasing) ─
  const hasUiThemeTarget = has(
    text,
    'থিম', 'theme', 'মোড', 'mode', 'ব্যাকগ্রাউন্ড', 'background', 'ইন্টারফেস', 'ui', 'স্ক্রিন', 'screen'
  );
  if (
    /(?:ডার্ক\s*মোড|ডার্ক\s*থিম|dark\s*mode|dark\s*theme|কালো\s*থিম)/i.test(text) ||
    (order && hasUiThemeTarget && has(text, 'ডার্ক', 'কালো', 'অন্ধকার', 'dark'))
  ) {
    actions.push({
      kind: 'settings',
      label: 'Theme → dark',
      patch: { theme: 'dark' },
    });
  } else if (
    /(?:লাইট\s*মোড|লাইট\s*থিম|light\s*mode|light\s*theme|সাদা\s*থিম)/i.test(text) ||
    (order && hasUiThemeTarget && has(text, 'লাইট', 'সাদা', 'উজ্জ্বল', 'light'))
  ) {
    actions.push({
      kind: 'settings',
      label: 'Theme → light',
      patch: { theme: 'light' },
    });
  }

  // ── Accent colour ────────────────────────────────────────────────────────
  if (
    order &&
    has(text, 'রঙ', 'রং', 'কালার', 'color', 'colour', 'অ্যাকসেন্ট', 'accent', 'থিম')
  ) {
    const accent = detectAccent(text);
    if (accent) {
      actions.push({
        kind: 'settings',
        label: `Accent → ${accent}`,
        patch: { accent },
      });
    }
  }

  // ── UI shape (corners) — v18.4.0 ─────────────────────────────────────────
  if (
    order &&
    (has(text, 'কর্নার', 'কোণা', 'গোল', 'শার্প', 'রেডিয়াস') ||
      /\b(corner|radius|round|rounded|sharp|square)\b/.test(text))
  ) {
    let radius: AppSettings['radius'] | undefined;
    if (has(text, 'গোল', 'নরম') || /\b(round|rounded|soft)\b/.test(text)) radius = 'round';
    if (has(text, 'শার্প', 'সোজা', 'কোণা') || /\b(sharp|square)\b/.test(text)) radius = 'sharp';
    if (!radius && /\b(soft|default)\b/.test(text) || has(text, 'মাঝারি', 'স্বাভাবিক')) {
      radius = 'soft';
    }
    if (radius) {
      actions.push({ kind: 'settings', label: `UI radius → ${radius}`, patch: { radius } });
    }
  }

  // ── UI density (spacing) — v18.4.0 ───────────────────────────────────────
  if (
    order &&
    (has(text, 'কমপ্যাক্ট', 'ঘন', 'স্পেসিং', 'ফাঁকা', 'জায়গা বাঁচাও', 'ভিড়', 'স্পেসিয়াস', 'খোলামেলা') ||
      /\b(spacing|density|compact|cozy|spacious|airy|dense)\b/.test(text))
  ) {
    let density: AppSettings['density'] | undefined;
    if (has(text, 'কমপ্যাক্ট', 'ঘন', 'জায়গা বাঁচাও') || /\b(compact|tight|dense)\b/.test(text)) {
      density = 'compact';
    }
    if (has(text, 'স্পেসিয়াস', 'খোলামেলা', 'ফাঁকা') || /\b(spacious|airy)\b/.test(text)) {
      density = 'spacious';
    }
    if (!density && (has(text, 'স্বাভাবিক', 'মাঝারি') || /\b(cozy|normal|default)\b/.test(text))) {
      density = 'cozy';
    }
    if (density) {
      actions.push({
        kind: 'settings',
        label: `UI density → ${density}`,
        patch: { density },
      });
    }
  }

  // ── Font size ────────────────────────────────────────────────────────────
  if (order && has(text, 'ফন্ট', 'font', 'লেখা বড়', 'লেখা ছোট', 'text size')) {
    if (has(text, 'বড়', 'বড়', 'large', 'bigger', 'increase')) {
      actions.push({ kind: 'settings', label: 'Font → large', patch: { fontsize: 'large' } });
    } else if (has(text, 'ছোট', 'small', 'decrease')) {
      actions.push({ kind: 'settings', label: 'Font → small', patch: { fontsize: 'small' } });
    } else if (has(text, 'স্বাভাবিক', 'normal', 'default')) {
      actions.push({ kind: 'settings', label: 'Font → normal', patch: { fontsize: 'normal' } });
    }
  }

  // ── Engine mode ──────────────────────────────────────────────────────────
  if (
    (order || has(text, 'ইঞ্জিন মোড', 'engine mode', 'রিজনিং মোড', 'reasoning mode')) &&
    has(text, 'মোড', 'mode', 'ইঞ্জিন', 'engine', 'মডেল পাওয়ার')
  ) {
    if (has(text, 'পাওয়ার', 'গভীর') || /\b(power|deep|ultra)\b/.test(text)) {
      actions.push({ kind: 'settings', label: 'Mode → power', patch: { mode: 'power' } });
    } else if (has(text, 'ভারসাম্য') || /\b(balanced|sonnet)\b/.test(text)) {
      actions.push({ kind: 'settings', label: 'Mode → balanced', patch: { mode: 'balanced' } });
    } else if (has(text, 'দ্রুত', 'স্পিড') || /\b(fast|flash)\b/.test(text)) {
      actions.push({ kind: 'settings', label: 'Mode → fast', patch: { mode: 'fast' } });
    }
  }

  // ── Answer length (explicit preference orders only — never normal prompts) ─
  const hasAnswerPrefTarget = has(
    text,
    'উত্তর', 'answer', 'answers', 'response', 'responses', 'reply', 'replies', 'স্টাইল', 'style', 'সবসময়', 'সবসময়', 'always'
  );
  if (
    order &&
    hasAnswerPrefTarget &&
    (has(text, 'সংক্ষিপ্ত', 'ছোট উত্তর', 'কম লিখো', 'বেশি লিখো না', 'বেশি লম্বা না') ||
      /\b(concise|shorter)\b/.test(text) ||
      /(?:answers?|responses?|replies|style)\s+(?:be\s+|to\s+)?(?:short|brief|concise)/i.test(text))
  ) {
    actions.push({
      kind: 'settings',
      label: 'Answers → concise',
      patch: { style: 'concise' },
    });
  } else if (
    order &&
    hasAnswerPrefTarget &&
    (has(text, 'বিস্তারিত', 'বড় উত্তর', 'ডিটেইল') ||
      /\b(detailed|elaborate)\b/.test(text))
  ) {
    actions.push({
      kind: 'settings',
      label: 'Answers → detailed',
      patch: { style: 'detailed' },
    });
  }

  // ── Reply language ───────────────────────────────────────────────────────
  const hasLangPrefFrame =
    order &&
    (has(text, 'ভাষা', 'language', 'সবসময়', 'সবসময়', 'always', 'ডিফল্ট', 'default') ||
      /(?:উত্তর|reply|respond|speak)\s*(?:দাও|করো|in)/i.test(text));
  if (hasLangPrefFrame) {
    if (has(text, 'বাংলায়', 'বাংলা ভাষায়', 'bengali only', 'in bangla', 'in bengali')) {
      actions.push({ kind: 'settings', label: 'Language → bn', patch: { replyLang: 'bn' } });
    } else if (has(text, 'ইংরেজিতে', 'english only', 'in english', 'ইংরেজি ভাষায়')) {
      actions.push({ kind: 'settings', label: 'Language → en', patch: { replyLang: 'en' } });
    } else if (has(text, 'অটো ভাষা', 'auto language', 'যে ভাষায় লিখি')) {
      actions.push({ kind: 'settings', label: 'Language → auto', patch: { replyLang: 'auto' } });
    }
  }

  // ── Work persona (specific keywords only — "পার্সোনা" alone is not a mode) ─
  const PERSONA_MAP: Array<[NonNullable<AppSettings['workPersona']>, string[]]> = [
    [
      'developer',
      ['ডেভেলপার মোড', 'ডেভেলপার পার্সোনা', 'developer mode', 'developer persona', 'কোডার মোড', 'coding mode'],
    ],
    ['office', ['অফিস মোড', 'office mode', 'ব্যবসায়িক মোড', 'business mode', 'corporate mode']],
    ['content', ['কনটেন্ট মোড', 'content mode', 'মার্কেটিং মোড', 'marketing mode', 'লেখক মোড']],
    ['academic', ['একাডেমিক', 'academic mode', 'পড়াশোনা মোড', 'student mode', 'tutor mode']],
    ['allrounder', ['অলরাউন্ডার', 'allrounder mode', 'সব কাজের মোড']],
  ];
  if (order) {
    for (const [personaId, words] of PERSONA_MAP) {
      if (!has(text, ...words)) continue;
      actions.push({
        kind: 'settings',
        label: `Persona → ${personaId}`,
        patch: { workPersona: personaId },
      });
      break;
    }
  }

  // ── Creativity / sampling ────────────────────────────────────────────────
  if (
    order &&
    has(text, 'ক্রিয়েটিভিটি', 'creativity', 'টোন', 'tone', 'স্টাইল', 'style', 'মোড', 'mode', 'উত্তর', 'নিজেকে', 'তোমার')
  ) {
    if (has(text, 'ক্রিয়েটিভ', 'creative', 'কল্পনাপ্রবণ')) {
      actions.push({ kind: 'settings', label: 'Creativity → creative', patch: { creativity: 'creative' } });
    } else if (has(text, 'নির্ভুল', 'precise', 'কম ক্রিয়েটিভ', 'deterministic')) {
      actions.push({ kind: 'settings', label: 'Creativity → precise', patch: { creativity: 'precise' } });
    }
  }
  const tempMatch = text.match(/(?:temperature|তাপমাত্রা|টেম্প)\s*[:=]?\s*([01](?:\.\d+)?)/i);
  if (tempMatch && order) {
    const v = Number(tempMatch[1]);
    if (Number.isFinite(v)) {
      actions.push({
        kind: 'settings',
        label: `Weight temp → ${v}`,
        patch: { weightTemp: Math.min(1.2, Math.max(0.1, v)) },
      });
    }
  }

  // ── Behaviour switches ───────────────────────────────────────────────────
  const switchFor = (
    on: boolean,
    key: keyof AppSettings,
    label: string,
    words: string[]
  ) => {
    if (has(text, ...words)) {
      actions.push({ kind: 'settings', label: `${label} → ${on ? 'ON' : 'OFF'}`, patch: { [key]: on } as Partial<AppSettings> });
    }
  };
  if (order && has(text, 'অটো মেমোরি', 'auto memory')) {
    if (has(text, 'বন্ধ', 'off', 'disable', 'বন্ধ করো')) {
      switchFor(false, 'autoMemory', 'Auto-memory', ['অটো মেমোরি', 'auto memory']);
    } else if (has(text, 'চালু', 'on', 'enable')) {
      switchFor(true, 'autoMemory', 'Auto-memory', ['অটো মেমোরি', 'auto memory']);
    }
  }
  if (order && has(text, 'স্মার্ট ফরম্যাট', 'smart formatting')) {
    if (has(text, 'বন্ধ', 'off', 'disable')) {
      switchFor(false, 'smartFormatting', 'Smart formatting', ['স্মার্ট ফরম্যাট', 'smart formatting']);
    } else {
      switchFor(true, 'smartFormatting', 'Smart formatting', ['স্মার্ট ফরম্যাট', 'smart formatting']);
    }
  }
  if (order && has(text, 'অটো ভয়েস', 'auto voice', 'ভয়েস মোড', 'voice mode')) {
    if (has(text, 'বন্ধ', 'off', 'disable')) {
      switchFor(false, 'autoVoice', 'Auto voice', ['অটো ভয়েস', 'auto voice', 'ভয়েস মোড', 'voice mode']);
    } else if (has(text, 'চালু', 'on', 'enable')) {
      switchFor(true, 'autoVoice', 'Auto voice', ['অটো ভয়েস', 'auto voice', 'ভয়েস মোড', 'voice mode']);
    }
  }
  if (order && /(?:এন্টার|enter)\s*(?:টু সেন্ড|to send|কী|key)?\s*(?:চালু|বন্ধ|on|off|enable|disable)/i.test(text)) {
    if (has(text, 'বন্ধ', 'off', 'disable', 'নতুন লাইন')) {
      switchFor(false, 'sendOnEnter', 'Enter to send', ['এন্টার', 'enter']);
    } else if (has(text, 'চালু', 'on', 'enable', 'পাঠাও')) {
      switchFor(true, 'sendOnEnter', 'Enter to send', ['এন্টার', 'enter']);
    }
  }
  if (order && has(text, 'মনো ফন্ট', 'mono font', 'কোডিং ফন্ট')) {
    if (has(text, 'বন্ধ', 'off', 'disable')) {
      switchFor(false, 'mono', 'Mono font', ['মনো ফন্ট', 'mono font', 'কোডিং ফন্ট']);
    } else {
      switchFor(true, 'mono', 'Mono font', ['মনো ফন্ট', 'mono font', 'কোডিং ফন্ট']);
    }
  }
  const voiceSpeed = text.match(/(?:ভয়েস স্পিড|voice speed)\s*[:=]?\s*([0-2](?:\.\d+)?)/i);
  if (voiceSpeed && order) {
    const v = Number(voiceSpeed[1]);
    if (v >= 0.5 && v <= 2) {
      actions.push({ kind: 'settings', label: `Voice speed → ${v}x`, patch: { voiceSpeed: v } });
    }
  }

  // ── Remaining advanced switches ──────────────────────────────────────────
  const genericSwitches: Array<[keyof AppSettings, string, string[]]> = [
    ['proactiveAuto', 'Proactive suggestions', ['প্রোঅ্যাকটিভ', 'proactive suggestions']],
    ['fastDecision', 'Fast decision', ['ফাস্ট ডিসিশন', 'fast decision', 'দ্রুত সিদ্ধান্ত']],
    ['gpuAccel', 'Hardware accel', ['hardware accel', 'হার্ডওয়্যার অ্যাক্সিলারেশন']],
    ['memoryCache', 'Memory cache', ['মেমোরি ক্যাশ', 'memory cache']],
  ];
  if (order) {
    for (const [key, label, words] of genericSwitches) {
      if (!has(text, ...words)) continue;
      if (has(text, 'বন্ধ', 'off', 'disable', 'নিষ্ক্রিয়')) {
        actions.push({
          kind: 'settings',
          label: `${label} → OFF`,
          patch: { [key]: false } as Partial<AppSettings>,
        });
      } else if (has(text, 'চালু', 'on', 'enable', 'সক্রিয়')) {
        actions.push({
          kind: 'settings',
          label: `${label} → ON`,
          patch: { [key]: true } as Partial<AppSettings>,
        });
      }
    }
  }

  // ── Custom behaviour instruction ─────────────────────────────────────────
  const customInst = rawText.match(
    /^(?:কাস্টম\s*নির্দেশনা|custom instruction|নিজের নিয়ম)\s*[:：]\s*([^\n]{3,400})/i
  );
  if (customInst) {
    actions.push({
      kind: 'settings',
      label: 'Custom instruction updated',
      patch: { customInst: customInst[1].trim().slice(0, 500) },
    });
  }

  // ── Engine / provider / model ────────────────────────────────────────────
  const providerRequested =
    has(text, 'প্রোভাইডার', 'provider', 'ইঞ্জিন বদল', 'switch engine', 'engine switch') ||
    (order && has(text, 'ইঞ্জিন', 'engine', 'মডেল', 'model'));
  if (providerRequested) {
    for (const [id, aliases] of PROVIDER_ALIASES) {
      if (!has(text, ...aliases)) continue;
      const base = DEFAULT_PROVIDER_BASE_URLS[id] || '';
      const model = DEFAULT_PROVIDER_MODELS[id] || '';
      actions.push({
        kind: 'settings',
        label: `Engine → ${id}${model ? ` · ${model}` : ''}`,
        patch: {
          provider: id,
          externalBaseUrl: base,
          ...(model ? { externalModel: model } : {}),
        },
      });
      break;
    }
  }
  if (order || has(text, 'মডেল', 'model')) {
    for (const [modelId, aliases] of MODEL_ALIASES) {
      if (order && has(text, ...aliases)) {
        actions.push({ kind: 'settings', label: `Model → ${modelId}`, patch: { externalModel: modelId } });
        break;
      }
    }
  }
  const modelQuoted = rawText.match(/^\s*model\s*[:=]\s*["'`]?([\w./:-]{3,60})\s*$/i);
  if (modelQuoted) {
    actions.push({
      kind: 'settings',
      label: `Model → ${modelQuoted[1]}`,
      patch: { externalModel: modelQuoted[1] },
    });
  }

  // ── Display name ─────────────────────────────────────────────────────────
  const nameMatch =
    rawText.match(/(?:তোমার|আপনার|নিজের)\s*নাম\s*["'“]?([^\n"”']{2,40}?)["'”']?\s*(?:রাখো|সেট|করো|হবে)/i) ||
    rawText.match(/(?:rename yourself to|set your name to)\s*["'“]?([^\n"”']{2,40})["'”']?/i);
  if (nameMatch) {
    actions.push({
      kind: 'settings',
      label: `Display name → ${nameMatch[1].trim()}`,
      patch: { displayName: nameMatch[1].trim().slice(0, 80) },
    });
  }

  // ── Memory ───────────────────────────────────────────────────────────────
  const remember =
    rawText.match(/^(?:মনে\s*রাখো|মনে রাখুন|remember that|remember:|remember me that)\s*[:：]?\s*([^\n]{2,180})/i);
  if (remember) {
    actions.push({
      kind: 'memory',
      label: 'Memory added',
      memory: [remember[1].trim()],
    });
  }
  if (
    has(text, 'মেমোরি মুছে', 'সব ভুলে যাও', 'মনে রাখা সব মুছ', 'clear memory', 'forget everything', 'delete memory')
  ) {
    actions.push({ kind: 'memory', label: 'Memory cleared', clearMemory: true });
  }

  // ── Autonomy ─────────────────────────────────────────────────────────────
  if (
    order &&
    has(text, 'সম্পূর্ণ নিয়ন্ত্রণ', 'ফুল কন্ট্রোল', 'full control', 'full autonomy', 'autonomy full')
  ) {
    actions.push({ kind: 'autonomy', label: 'Autonomy → FULL', autonomy: 'full' });
  } else if (order && has(text, 'সেফ মোড', 'safe mode', 'safe autonomy')) {
    actions.push({ kind: 'autonomy', label: 'Autonomy → SAFE', autonomy: 'safe' });
  }

  // ── Self-repair ──────────────────────────────────────────────────────────
  if (
    has(
      text,
      'নিজেকে রিপেয়ার', 'নিজেকে ঠিক', 'সেল্ফ চেক', 'self check', 'selfcheck', 'repair yourself', 'fix yourself', 'সারিয়ে ফেলো'
    )
  ) {
    actions.push({ kind: 'repair', label: 'Self-check & repair' });
  }

  // ── Web search ───────────────────────────────────────────────────────────
  if (order && has(text, 'ওয়েব সার্চ', 'web search', 'ইন্টারনেট সার্চ')) {
    if (has(text, 'বন্ধ', 'off', 'disable', 'নিষ্ক্রিয়')) {
      actions.push({ kind: 'launch', label: 'Web search → OFF', webSearch: false });
    } else if (has(text, 'চালু', 'on', 'enable', 'সক্রিয়')) {
      actions.push({ kind: 'launch', label: 'Web search → ON', webSearch: true });
    }
  }

  // ── Connectors / launchers (must explicitly ask to open/connect/setup) ───
  if (OPEN_LAUNCH_RX.test(text) && !question) {
    if (has(text, 'গুগল ড্রাইভ', 'google drive')) {
      actions.push({ kind: 'connector', label: 'Open Google Drive setup', connector: 'drive' });
    }
    if (has(text, 'github', 'গিটহাব')) {
      actions.push({ kind: 'connector', label: 'Open GitHub setup', connector: 'github' });
    }
    if (has(text, 'নোটবুক খোলো', 'open notebook', 'ai notebook')) {
      actions.push({ kind: 'launch', label: 'Open AI Notebook', connector: 'notebook' });
    }
    if (has(text, 'সেটিংস খোলো', 'open settings', 'control center', 'কন্ট্রোল সেন্টার')) {
      actions.push({ kind: 'launch', label: 'Open Control Center', connector: 'settings' });
    }
  }

  // ── Skill creation ───────────────────────────────────────────────────────
  const skillMatch = rawText.match(
    /(?:স্কিল|skill)\s*(?:বানাও|তৈরি করো|যোগ করো|create|build|add)\s*[:：]?\s*["'“]?([^\n"”']{3,80})/i
  );
  if (skillMatch) {
    actions.push({
      kind: 'skill',
      label: `Create skill "${skillMatch[1].trim()}"`,
      skill: {
        name: skillMatch[1].trim().slice(0, 80),
        description: rawText.slice(0, 200),
        triggers: [skillMatch[1].trim().toLowerCase().slice(0, 40)],
        type: 'prompt',
        prompt: `When the user asks for "${skillMatch[1].trim()}", follow their request exactly with maximum accuracy and no filler.`,
      },
    });
  }

  // Deduplicate identical setting patches.
  const seen = new Set<string>();
  const unique = actions.filter((a) => {
    const key = `${a.kind}:${a.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (question && !order) return unique.filter((a) => a.kind !== 'settings');
  return unique;
}

/**
 * True when the message is *only* a self-update order (nothing left to answer),
 * so the app can confirm instantly instead of waiting for the model.
 */
export function isPureSelfCommand(rawText: string, actions: SelfAction[]): boolean {
  const text = (rawText || '').trim();
  if (!actions.length) return false;
  if (/[?？]/.test(text)) return false;

  // Question or conversational/content verbs mean the user wants a real AI reply.
  const hasQuestionOrPromptVerb =
    /(?:(?<![\u0980-\u09FF])(?:কী|কি|কেমন|কেন|কোথায়|কীভাবে|কিভাবে|বলো|বলেন|বুঝিয়ে|জানাও|লিখো|লেখো|দেখাও|সাহায্য)(?![\u0980-\u09FF])|\bhow\b|\bwhat\b|\bwhy\b|\bwhich\b|\bwhere\b|\bwho\b|\bwhen\b|\bexplain\b|\bdefine\b|\bdescribe\b|\bsay\b|\btell\b|\bspeak\b|\bhello\b|\bhi\b|\bhey\b|\bhelp\b|\bgive\b|\bshow\b|\bcalculate\b|\bsearch\b|\bfind\b)/i.test(
      text
    );
  if (hasQuestionOrPromptVerb) return false;

  // Content generation requests must always reach the AI model even if they mention a preference.
  const isContentGenerationRequest =
    /(গল্প|কবিতা|রচনা|প্রবন্ধ|চিঠি|দরখাস্ত|আর্টিকেল|প্যারাগ্রাফ|ব্লগ|কোড|প্রোগ্রাম|ফাংশন|ওয়েবসাইট|ওয়েবসাইট|অ্যাপ|গেম|পেজ|ডিজাইন|অনুবাদ|সামারি|সারাংশ|ব্যাখ্যা|বিশ্লেষণ|তালিকা|সমাধান|সম্পর্কে|বর্ণনা|প্রশ্ন|উত্তর লেখো|\bwrite\b|\bstory\b|\bpoem\b|\bessay\b|\barticle\b|\bletter\b|\bprogram\b|\bfunction\b|\bwebsite\b|\bwebpage\b|\btranslate\b|\bsummarize\b|\bsummary\b|\banalyze\b|\bsolve\b|\bsentence\b|\bparagraph\b)/i.test(
      text
    ) && !/(?:স্কিল|skill)\s*(?:বানাও|তৈরি করো|যোগ করো|create|build|add)/i.test(text);
  if (isContentGenerationRequest) return false;

  if (text.length > 120) return false;
  return actions.some((a) => a.kind !== 'connector');
}
