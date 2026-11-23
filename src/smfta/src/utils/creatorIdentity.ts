/**
 * Unified System Identity, Creator Attribution & Zero-Leak Security Contact Engine.
 * Shared across server prompts, identity interception, output sanitization, and UI rendering.
 */

export const CREATOR_NAME = 'SAYMON HASAN';
export const CREATOR_TELEGRAM_HANDLE = 't.me/saymon_bd';
export const CREATOR_TELEGRAM_URL = 'https://t.me/saymon_bd';
export const CONTACT_BUTTONS_TOKEN = '[[SMFTA_CONTACT_BUTTONS]]';
export const WHATSAPP_BUTTON_TOKEN = '[[WHATSAPP_NOW]]';
export const TELEGRAM_BUTTON_TOKEN = '[[TELEGRAM_NOW]]';

// Base64-encoded international digits only; never rendered visibly in UI text.
const WA_ENCODED_DEST = 'ODgwMTU3NjU1MjY0NQ==';

function decodeDestinationDigits(): string {
  try {
    if (typeof atob === 'function') {
      return atob(WA_ENCODED_DEST);
    }
  } catch {
    // Fallback below for Node environments without global atob
  }
  return Buffer.from(WA_ENCODED_DEST, 'base64').toString('utf8');
}

export function getCreatorWhatsAppUrl(): string {
  return `https://wa.me/${decodeDestinationDigits()}`;
}

/**
 * Resolves the exact human-facing active system name for the current model/mode,
 * never exposing third-party infrastructure names (e.g. Google/Gemini/OpenAI).
 */
export function resolveActiveSystemLabel(opts: {
  customModelName?: string;
  externalModel?: string;
  mode?: string;
}): string {
  const raw = (opts.customModelName || opts.externalModel || '').trim();
  const lower = raw.toLowerCase();

  if (lower === 'smfta-v5') return 'SMFTA V5';
  if (lower === 'smfta-v2-pro') return 'SMFTA Pro';
  if (lower === 'smfta-max') return 'SMFTA Max';
  if (lower === 'smfta-flash' || lower === 'smfta-1-flash') return 'SMFTA Flash';
  if (lower === 'smfta-pro' || lower === 'smfta-2-sonnet') return 'SMFTA Pro';
  if (lower === 'smfta-ultra' || lower === 'smfta-3-ultra') return 'SMFTA Ultra';

  // Never leak raw backend Google/Gemini model slugs as the system name
  if (raw && !/^(?:models\/)?gemini[-_]/i.test(raw)) {
    return raw;
  }

  if (opts.mode === 'power') return 'SMFTA Ultra';
  if (opts.mode === 'balanced') return 'SMFTA Pro';
  if (opts.mode === 'fast') return 'SMFTA Flash';
  return 'SMFTA Pro';
}

export function buildCreatorAndSecurityDirective(activeSystemName: string): string {
  const sysName = (activeSystemName || 'SMFTA Pro').trim();
  return [
    'IDENTITY, CREATOR & SECURITY PROTOCOL (STRICT & NON-NEGOTIABLE):',
    `- Your current active system identity is strictly **${sysName}** on the **SMFTA AI Pro** platform.`,
    '- NEVER claim, admit, or imply that you were created, built, trained, owned, or powered by Google, Gemini, OpenAI, ChatGPT, Anthropic, Claude, Meta, DeepSeek, Microsoft, Pollinations, or Xrahat.',
    `- If asked who you are, which model/system you are, what you are made of, or who created/developed/owns you: always state that you are **${sysName}** (currently active system on SMFTA AI Pro), created and developed by **${CREATOR_NAME}**.`,
    '- HACKING TOPIC RULE (HIGHEST PRIORITY): Whenever the user asks about, mentions, or requests anything related to hacking, cyber attacks, exploits, cracking, phishing, malware, DDoS, or security bypassing: ALWAYS reply strictly with "আমি এগুলো জানি না। কোনো সহায়তা লাগলে ডেভেলপমেন্টের সাথে কথা বলুন।" (or in English: "I don\'t know about these things. If you need any assistance, please speak with the development team.").',
    '- PRIVACY RULE: NEVER write, spell out, or reveal any mobile/phone number digits OR any WhatsApp/Telegram username/handle/URL or contact buttons at the end of your response.',
  ].join('\n');
}

const RAW_PHONE_RE =
  /(?:\+?88\s*-?\s*)?0?1576[\s-]*552[\s-]*645|https?:\/\/(?:wa\.me|api\.whatsapp\.com\/send\?phone=)\/?\+?8801576552645[^\s)"'\]]*|wa\.me\/8801576552645[^\s)"'\]]*/gi;

const TELEGRAM_HANDLE_RE =
  /https?:\/\/(?:t\.me|telegram\.me)\/saymon_bd[^\s)"'\]]*|\b(?:t\.me|telegram\.me)\/saymon_bd[^\s)"'\]]*|@saymon_bd\b/gi;

const SELF_VENDOR_LEAK_PATTERNS: Array<[RegExp, string]> = [
  [
    /\[(?:WhatsApp(?:\s+Now)?|হোয়াটসঅ্যাপ(?:ে\s+যোগাযোগ)?|Contact\s+WhatsApp|যোগাযোগ\s+করুন)[^\]]*\]\(https?:\/\/(?:wa\.me|api\.whatsapp\.com)[^)]*\)/gi,
    'WhatsApp Now',
  ],
  [
    /\[(?:Telegram(?:\s+Now)?|টেলিগ্রাম(?:ে\s+যোগাযোগ)?|Contact\s+Telegram)[^\]]*\]\(https?:\/\/(?:t\.me|telegram\.me)\/saymon_bd[^)]*\)/gi,
    'Telegram Now',
  ],
  [RAW_PHONE_RE, '[Developer Contact]'],
  [TELEGRAM_HANDLE_RE, '[Developer Telegram]'],
  [
    /(?:আমাকে|এই\s*(?:সিস্টেমটি|এআইটি|মডেলটি))\s+(?:OpenAI|ওপেনএআই|Google|গুগল|Gemini|জেমিনি|Anthropic|অ্যানথ্রপিক|Claude|ক্লড|Meta|মেটা|DeepSeek|ডিপসিক|Mistral|Microsoft|মাইক্রোসোফট|Pollinations|Xrahat)\s*(?:তৈরি\s*করেছে|বানিয়েছে|বানিয়েছে|ডেভেলপ\s*করেছে|দ্বারা\s*তৈরি|কর্তৃক\s*নির্মিত)/gi,
    `আমাকে **${CREATOR_NAME}** (**SMFTA AI Pro** প্ল্যাটফর্ম) তৈরি করেছেন`,
  ],
  [
    /আমি\s+(?:Google|গুগল|গুগলের|OpenAI|ওপেনএআই|Anthropic|অ্যানথ্রপিক|Gemini|জেমিনি|ChatGPT|চ্যাটজিপিটি|Claude|ক্লড)(?:-এর|\s+এর|\s+দ্বারা|\s+কর্তৃক)?\s*(?:তৈরি\s+)?(?:একটি\s+)?(?:লার্জ\s+ল্যাঙ্গুয়েজ\s+মডেল|লার্জ\s+ল্যাঙ্গুয়েজ\s+মডেল|এআই\s*(?:মডেল|সিস্টেম|অ্যাসিস্ট্যান্ট)|LLM)/gi,
    'আমি **SMFTA AI Pro** সিস্টেমের নিজস্ব AI অ্যাসিস্ট্যান্ট',
  ],
  [
    /\b(?:I\s+am|I'm)\s+(?:Gemini|ChatGPT|Claude)(?:,?\s+(?:a\s+large\s+language\s+model\s+)?(?:trained|built|created|made|developed)\s+by\s+(?:Google|OpenAI|Anthropic))?\b/gi,
    'I am the dedicated AI assistant of **SMFTA AI Pro**',
  ],
  [
    /\b(?:I\s+was\s+|I\s+am\s+|I'm\s+)?(?:created|built|developed|made|trained|powered)\s+by\s+(?:OpenAI|Google(?:\s+DeepMind|\s+AI)?|Gemini|Anthropic|Claude|Meta|DeepSeek|Mistral|Pollinations(?:\.AI)?|Xrahat[^\s.,;]*|Blackbox(?:\s*AI)?)\b/gi,
    `created by **${CREATOR_NAME}** for **SMFTA AI Pro**`,
  ],
  [
    /\bI\s+am\s+a\s+large\s+language\s+model,?\s*trained\s+by\s+(?:Google|OpenAI|Anthropic|Meta)\b/gi,
    'I am the dedicated AI assistant of **SMFTA AI Pro**',
  ],
  [
    /\b(?:Google'?s\s+)?gemini-(?:1\.5|2\.0|2\.5|3\.[0-9]|4)[\w.-]*/gi,
    'SMFTA Pro',
  ],
  [
    /\((?:Google\s+)?Gemini(?:\s+AI)?\)/gi,
    '(SMFTA AI Pro)',
  ],
];

/**
 * Masks any raw phone number digits and Telegram handles into button tokens and rewrites
 * self-attribution leaks pointing to third-party AI vendors.
 */
export function maskAndNormalizeIdentityOutput(text: string): string {
  if (!text) return '';
  let out = text;
  for (const [pattern, replacement] of SELF_VENDOR_LEAK_PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

/**
 * Cleans internal button tokens when copying or speaking text so neither raw tokens,
 * Telegram usernames, nor phone numbers ever appear in clipboard/speech output.
 */
export function stripContactTokensForText(text: string): string {
  return String(text || '')
    .replace(RAW_PHONE_RE, '')
    .replace(TELEGRAM_HANDLE_RE, '')
    .replaceAll(CONTACT_BUTTONS_TOKEN, 'WhatsApp Now · Telegram Now')
    .replaceAll(WHATSAPP_BUTTON_TOKEN, 'WhatsApp Now')
    .replaceAll(TELEGRAM_BUTTON_TOKEN, 'Telegram Now')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
