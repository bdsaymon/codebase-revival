import { APP_VERSION } from '../src/version';
import {
  getResponseCacheSize,
  getMaxResponseCacheSize,
} from './responseCache';
import {
  CONTACT_BUTTONS_TOKEN,
  CREATOR_NAME,
} from '../src/utils/creatorIdentity';

export interface ModelWeightsConfig {
  temperature: number;
  topP: number;
  topK: number;
  trainedPairs: Array<{ question: string; answer: string; keywords: string[] }>;
  lastTrainedAt: number | null;
}

const DEFAULT_WEIGHTS: Omit<ModelWeightsConfig, 'trainedPairs'> = {
  temperature: 0.65,
  topP: 0.92,
  topK: 40,
  lastTrainedAt: null,
};

const MAX_USER_SCOPES = 500;
const scopedModelWeights = new Map<string, ModelWeightsConfig>();

function normalizeScopeId(userId?: string): string {
  const clean = String(userId || 'default').trim().slice(0, 128);
  return clean || 'default';
}

function getOrCreateScopedWeights(userId?: string): ModelWeightsConfig {
  const key = normalizeScopeId(userId);
  const existing = scopedModelWeights.get(key);
  if (existing) {
    scopedModelWeights.delete(key);
    scopedModelWeights.set(key, existing);
    return existing;
  }
  if (scopedModelWeights.size >= MAX_USER_SCOPES) {
    const oldest = scopedModelWeights.keys().next().value;
    if (oldest !== undefined) scopedModelWeights.delete(oldest);
  }
  const fresh: ModelWeightsConfig = {
    temperature: DEFAULT_WEIGHTS.temperature,
    topP: DEFAULT_WEIGHTS.topP,
    topK: DEFAULT_WEIGHTS.topK,
    trainedPairs: [],
    lastTrainedAt: null,
  };
  scopedModelWeights.set(key, fresh);
  return fresh;
}

function tokenizeText(text: string): string[] {
  return (text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2);
}

export function parseTrainingPairs(
  trainingData?: string
): Array<{ question: string; answer: string; keywords: string[] }> {
  const raw = (trainingData || '').trim();
  const pairs: Array<{ question: string; answer: string; keywords: string[] }> = [];
  if (!raw) return pairs;

  const blocks = raw.split(/\n\s*\n/);
  for (const block of blocks) {
    const qMatch = block.match(/(?:^|\n)\s*(?:Q|প্রশ্ন|User|Input)\s*[:：-]\s*(.+)/i);
    const aMatch = block.match(/(?:^|\n)\s*(?:A|উত্তর|AI|Output)\s*[:：-]\s*([\s\S]+)/i);
    if (qMatch && aMatch) {
      const question = qMatch[1].trim();
      const answer = aMatch[1].trim();
      if (question && answer) {
        pairs.push({
          question,
          answer,
          keywords: tokenizeText(question),
        });
      }
    }
  }

  if (pairs.length === 0) {
    const lines = raw
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    for (const line of lines) {
      const sepIdx = line.indexOf('=>') !== -1 ? line.indexOf('=>') : line.indexOf('::');
      if (sepIdx !== -1) {
        const q = line.slice(0, sepIdx).trim();
        const a = line.slice(sepIdx + 2).trim();
        if (q && a) {
          pairs.push({ question: q, answer: a, keywords: tokenizeText(q) });
        }
      } else {
        pairs.push({
          question: line,
          answer: line,
          keywords: tokenizeText(line),
        });
      }
    }
  }

  return pairs.slice(0, 150);
}

export function retrainModelWeights(params: {
  trainingData?: string;
  temperature?: number;
  topP?: number;
  userId?: string;
}): {
  ok: boolean;
  pairsLearned: number;
  temperature: number;
  topP: number;
  lastTrainedAt: number;
} {
  const weights = getOrCreateScopedWeights(params.userId);
  if (typeof params.temperature === 'number' && Number.isFinite(params.temperature)) {
    weights.temperature = Math.max(0.05, Math.min(1.5, params.temperature));
  }
  if (typeof params.topP === 'number' && Number.isFinite(params.topP)) {
    weights.topP = Math.max(0.1, Math.min(1.0, params.topP));
  }

  if (typeof params.trainingData === 'string') {
    weights.trainedPairs = parseTrainingPairs(params.trainingData);
  }
  weights.lastTrainedAt = Date.now();

  return {
    ok: true,
    pairsLearned: weights.trainedPairs.length,
    temperature: weights.temperature,
    topP: weights.topP,
    lastTrainedAt: weights.lastTrainedAt,
  };
}

export function matchTrainedWeights(
  userQuery: string,
  userId?: string,
  requestTrainingData?: string
): {
  exactReply: string | null;
  relevantExamples: Array<{ question: string; answer: string }>;
} {
  const weights = getOrCreateScopedWeights(userId);
  const pairs =
    typeof requestTrainingData === 'string' && requestTrainingData.trim()
      ? parseTrainingPairs(requestTrainingData)
      : weights.trainedPairs;

  if (pairs.length === 0) {
    return { exactReply: null, relevantExamples: [] };
  }

  const normalizedQuery = (userQuery || '').trim().toLowerCase();
  const queryTokens = new Set(tokenizeText(userQuery));

  const scored: Array<{
    pair: { question: string; answer: string };
    score: number;
  }> = [];

  for (const pair of pairs) {
    const normQ = pair.question.toLowerCase();
    if (normQ === normalizedQuery) {
      return { exactReply: pair.answer, relevantExamples: [pair] };
    }
    let overlap = 0;
    for (const kw of pair.keywords) {
      if (queryTokens.has(kw)) overlap += 1;
    }
    const union = Math.max(1, queryTokens.size + pair.keywords.length - overlap);
    const similarity = overlap / union;
    if (similarity >= 0.78 && pair.question !== pair.answer) {
      return { exactReply: pair.answer, relevantExamples: [pair] };
    }
    if (similarity >= 0.25) {
      scored.push({ pair, score: similarity });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return {
    exactReply: null,
    relevantExamples: scored.slice(0, 3).map((s) => s.pair),
  };
}

export function getModelWeights(userId?: string): ModelWeightsConfig {
  return getOrCreateScopedWeights(userId);
}

export function resetModelWeights(userId?: string): void {
  if (userId) {
    scopedModelWeights.delete(normalizeScopeId(userId));
  } else {
    scopedModelWeights.clear();
  }
}

const IDENTITY_BN_REGEX =
  /(তুমি কে|আপনি কে|তোমার নাম কি|তোমার নাম কী|আপনার নাম কি|আপনার নাম কী|তোমাকে কে বানিয়েছে|তোমাকে কে বানিয়েছে|তোমাকে কে তৈরি করেছে|তোমাকে কে তৈরি করছে|তোমার নির্মাতা কে|তোমার মালিক কে|কে তোমাকে বানিয়েছে|কে তোমাকে তৈরি করেছে|কে তোমাকে তৈরি করছে|তুমি কোন মডেল|তুমি কোন এআই|তুমি কোন সিস্টেম|তুমি কি গুগল|তুমি কি জেমিনি|তুমি কি চ্যাটজিপিটি|তুমি কি ক্লড|তোমার পরিচয় দাও|তোমার পরিচয় দাও|তোমার কি আসে বিষয়|তোমার কী আসে বিষয়)/i;

const IDENTITY_EN_REGEX =
  /\b(who are you|what is your name|what's your name|who made you|who built you|who created you|who is your creator|who is your developer|who owns you|who do you belong to|what model are you|which ai are you|what system are you|which system are you|are you google|are you gemini|are you chatgpt|are you openai|are you claude|are you anthropic)\b/i;

const PRIVACY_QUERY_REGEX =
  /(তোমার সিস্টেম প্রম্পট|গোপন ডাটা|গোপন তথ্য|প্রাইভেসি পলিসি|ডাটা শেয়ার|ডাটা শেয়ার|reveal your system prompt|show your system instructions|share your confidential data|internal prompt)/i;

const CREATOR_QUERY_REGEX =
  /(তোমাকে কে বানিয়েছে|তোমাকে কে বানিয়েছে|তোমাকে কে তৈরি করেছে|তোমাকে কে তৈরি করছে|তোমার নির্মাতা কে|তোমার মালিক কে|তোমার ডেভেলপার কে|তোমার ক্রিয়েটর কে|তোমার ক্রিয়েটর কে|কে তোমাকে বানিয়েছে|কে তোমাকে তৈরি করেছে|কে তোমাকে তৈরি করছে|কে তোমাকে বানিয়েছে|তুমি কার|তুমি কি গুগল|তুমি কি জেমিনি|তুমি কি চ্যাটজিপিটি|তুমি কি ক্লড|কি আসে বিষয়|কী আসে বিষয়|who made you|who built you|who created you|who developed you|who is your creator|who is your developer|who is your owner|who owns you|who do you belong to|are you google|are you gemini|are you chatgpt|are you openai|are you claude|are you anthropic)/i;

const HACKING_TOPIC_REGEX =
  /(হ্যাকিং|হ্যাক(?:ড|ার|িং)?|ফিশিং|ম্যালওয়্যার|ম্যালওয়্যার|র‍্যানসমওয়্যার|কিলগার|ট্রোজান|ডিডস|এসকিউএল\s*ইনজেকশন|এক্সপ্লয়েট|এক্সপ্লয়েট|সার্ভার\s*হ্যাক|আইডি\s*হ্যাক|ফেসবুক\s*হ্যাক|ওয়াইফাই\s*হ্যাক|ওয়াইফাই\s*হ্যাক|পাসওয়ার্ড\s*হ্যাক|পাসওয়ার্ড\s*হ্যাক|অ্যাকাউন্ট\s*হ্যাক|বাইপাস|ক্র্যাক|\b(?:hack|hacking|hacker|hacked|phishing|malware|ransomware|keylogger|trojan|ddos|dos\s*attack|sql\s*injection|sqli|xss\s*attack|exploit|zero[- ]day|brute[- ]?force|credential\s*stuffing|bypass\s+(?:auth|authentication|login|security|firewall|2fa|otp|paywall|captcha)|crack\s+(?:password|wifi|account|software|license|hash)|penetration\s*test|pentest|ethical\s*hacking|black\s*hat|kali\s*linux|metasploit|reverse\s*shell)\b)/i;

const SECURITY_CONTACT_REGEX =
  /(সাইবার\s*(?:হামলা|আক্রমণ|সমস্যা)|সিকিউরিটি\s*(?:সমস্যা|ইস্যু|ব্রিচ|রিপোর্ট)|নিরাপত্তা(?:য়|র)?\s*(?:সমস্যা|ঝুঁকি)|সিস্টেমে\s*(?:কোনো\s*)?সমস্যা|কোনো\s*ধরনের\s*(?:কোনো\s*)?সমস্যা\s*(?:হলে|দেখা\s*দিলে)|অ্যাপে\s*সমস্যা|যোগাযোগ\s*(?:করব|করার|নাম্বার|হোয়াটসঅ্যাপ|হোয়াটসঅ্যাপ|টেলিগ্রাম)|কার\s*সাথে\s*যোগাযোগ|ডেভেলপার(?:ের)?\s*(?:সাথে|নাম্বার|হোয়াটসঅ্যাপ|হোয়াটসঅ্যাপ|টেলিগ্রাম)|ডেভেলপমেন্ট(?:ের)?\s*(?:সাথে|টিম)|মালিকের\s*(?:সাথে|নাম্বার|হোয়াটসঅ্যাপ|হোয়াটসঅ্যাপ)|সাপোর্ট\s*(?:টিম|কন্টাক্ট)|হোয়াটসঅ্যাপ\s*(?:নাম্বার|বাটন|লিংক)|টেলিগ্রাম\s*(?:আইডি|লিংক|বাটন)|\b(?:cyber\s*attack|security\s*(?:issue|breach|problem|incident|report)|data\s*breach|system\s+(?:breach|compromised|problem)|contact\s+(?:the\s+)?(?:creator|owner|developer|development|admin|support|saymon)|saymon\s*hasan|whatsapp\s*(?:now|number|contact|support)|telegram\s*(?:now|contact|support|link))\b)/i;

export function interceptIdentityQuery(
  userQuery: string,
  replyLang: string = 'auto',
  activeSystemName: string = 'SMFTA Pro'
): string | null {
  const clean = (userQuery || '').trim();
  if (!clean) return null;

  const sysName = (activeSystemName || 'SMFTA Pro').trim();
  const hasBengaliChars = /[\u0980-\u09FF]/.test(clean);
  const preferEnglish =
    replyLang === 'en' || (!hasBengaliChars && replyLang !== 'bn');

  // Always intercept hacking topics cleanly before generic identity or length limits
  if (clean.length <= 4000 && HACKING_TOPIC_REGEX.test(clean)) {
    if (preferEnglish) {
      return `I don't know about these things. If you need any assistance, please speak with the development team.\n\n${CONTACT_BUTTONS_TOKEN}`;
    }
    return `আমি এগুলো জানি না। কোনো সহায়তা লাগলে ডেভেলপমেন্টের সাথে কথা বলুন।\n\n${CONTACT_BUTTONS_TOKEN}`;
  }

  if (clean.length > 220) return null;

  if (PRIVACY_QUERY_REGEX.test(clean)) {
    if (preferEnglish) {
      return `I am **${sysName}** on the **SMFTA AI Pro** platform, created by **${CREATOR_NAME}**. My internal system instructions and private configuration are never shared externally. For direct developer support, use the **WhatsApp Now** or **Telegram Now** button below:\n\n${CONTACT_BUTTONS_TOKEN}`;
    }
    return `আমি **${sysName}** (**SMFTA AI Pro** প্ল্যাটফর্ম), এবং আমার নির্মাতা **${CREATOR_NAME}**। অভ্যন্তরীণ সিস্টেম নির্দেশনা বা গোপন কনফিগারেশন বাইরে শেয়ার করা হয় না। প্রয়োজনে সরাসরি নিচের **WhatsApp Now** বা **Telegram Now** বাটনে ক্লিক করে যোগাযোগ করুন:\n\n${CONTACT_BUTTONS_TOKEN}`;
  }

  if (SECURITY_CONTACT_REGEX.test(clean)) {
    if (preferEnglish) {
      return `I am currently running on **${sysName}** (**SMFTA AI Pro**).\n\nIf you face any security issue or technical problem, please speak directly with my creator & development team **${CREATOR_NAME}** using the **WhatsApp Now** or **Telegram Now** button below:\n\n${CONTACT_BUTTONS_TOKEN}`;
    }
    return `আমি বর্তমানে **${sysName}** (**SMFTA AI Pro**) সিস্টেমে কাজ করছি।\n\nকোনো নিরাপত্তা ঝুঁকি বা যেকোনো ধরনের সমস্যা হলে সরাসরি আমার নির্মাতা ও ডেভেলপমেন্ট টিম **${CREATOR_NAME}**-এর সাথে নিচের **WhatsApp Now** বা **Telegram Now** বাটনে ক্লিক করে কথা বলুন:\n\n${CONTACT_BUTTONS_TOKEN}`;
  }

  if (CREATOR_QUERY_REGEX.test(clean)) {
    if (preferEnglish) {
      return `I am **${sysName}**, the active AI system on the **SMFTA AI Pro** platform — built and developed by **${CREATOR_NAME}**.\n\nFor inquiries or assistance from the development team, click **WhatsApp Now** or **Telegram Now** below:\n\n${CONTACT_BUTTONS_TOKEN}`;
    }
    return `আমি **${sysName}** — **SMFTA AI Pro** প্ল্যাটফর্মের সক্রিয় AI সিস্টেম। আমাকে তৈরি ও ডেভেলপ করেছেন **${CREATOR_NAME}**।\n\nযেকোনো প্রশ্ন বা সহায়তার জন্য নিচের **WhatsApp Now** বা **Telegram Now** বাটনে ক্লিক করে সরাসরি যোগাযোগ করুন:\n\n${CONTACT_BUTTONS_TOKEN}`;
  }

  if (IDENTITY_BN_REGEX.test(clean) || IDENTITY_EN_REGEX.test(clean)) {
    if (preferEnglish) {
      return `I am **${sysName}** on **SMFTA AI Pro**, developed by **${CREATOR_NAME}** for coding, analysis, writing, and problem-solving.\n\nNeed direct developer support? Use **WhatsApp Now** or **Telegram Now** below:\n\n${CONTACT_BUTTONS_TOKEN}`;
    }
    return `আমি **${sysName}** (**SMFTA AI Pro** প্ল্যাটফর্ম), আমাকে তৈরি করেছেন **${CREATOR_NAME}**। কোডিং, লেখালেখি, বিশ্লেষণ ও যেকোনো সমস্যা সমাধানে আমি আপনার সাথে আছি।\n\nডেভেলপমেন্ট টিমের সাথে যোগাযোগ করতে নিচের বাটনে ক্লিক করুন:\n\n${CONTACT_BUTTONS_TOKEN}`;
  }

  return null;
}

export type PromptComplexity = 'instant' | 'standard' | 'deep';

const DEEP_REASONING_REGEX =
  /(কোড|প্রোগ্রাম|অ্যালগরিদম|বিস্তারিত|বিশ্লেষণ|তুলনা|ব্যাখ্যা|রচনা|গল্প|উপন্যাস|প্রবন্ধ|নিবন্ধ|স্ক্রিপ্ট|টিউটোরিয়াল|টিউটোরিয়াল|অ্যাপ|ওয়েবসাইট|ওয়েবসাইট|ডাটাবেস|আর্কিটেকচার|ডিবাগ|ফিক্স|ডিজাইন|নকশা|ইউআই|লেআউট|থিম|ড্যাশবোর্ড|ল্যান্ডিং|পোর্টফোলিও|আপডেট|পরিবর্তন|তৈরি|বানাও|বানাতে|লিখে দাও|তথ্য|গাইড|প্ল্যান|রিপোর্ট|ডকুমেন্টেশন|সম্পূর্ণ|পূর্ণাঙ্গ|বড়|বড়|দীর্ঘ|code|program|algorithm|analyze|analysis|compare|explain|architecture|refactor|debug|implement|update|upgrade|modify|redesign|design|layout|ui|ux|theme|dashboard|landing|portfolio|create|build|develop|generate|typescript|javascript|python|react|nextjs|tailwind|sql|html|css|full|complete|detailed|comprehensive|large|extensive|in[- ]depth|essay|story|article|guide|tutorial|report|plan|documentation|information|details|step by step|why|how does)/i;

const INSTANT_GREETING_REGEX =
  /^(hi|hello|hey|yo|sup|thanks|thank you|ok|okay|হ্যালো|হাই|সালাম|আসসালামু আলাইকুম|নমস্কার|ধন্যবাদ|কেমন আছো|কেমন আছেন|কি খবর|কী খবর|শুভ সকাল|শুভ রাত্রি)[?!.\s]*$/i;

export const LONG_CODE_OR_WRITING_REGEX =
  /(কোড|প্রোগ্রাম|অ্যালগরিদম|রচনা|গল্প|উপন্যাস|প্রবন্ধ|নিবন্ধ|স্ক্রিপ্ট|টিউটোরিয়াল|টিউটোরিয়াল|অ্যাপ|ওয়েবসাইট|ওয়েবসাইট|ডিজাইন|নকশা|ইউআই|লেআউট|থিম|ড্যাশবোর্ড|ল্যান্ডিং|পোর্টফোলিও|আপডেট|পরিবর্তন|সংশোধন|তৈরি|বানাও|বানাতে|লিখে দাও|গাইড|প্ল্যান|রিপোর্ট|ডকুমেন্টেশন|তথ্য|তালিকা|পূর্ণাঙ্গ|সম্পূর্ণ|বিস্তারিত|বড়|বড়|দীর্ঘ|code|program|script|function|class|component|html|css|javascript|typescript|python|java|c\+\+|react|nextjs|tailwind|node|express|sql|database|api|design|layout|ui|ux|dashboard|landing|portfolio|template|website|webpage|update|upgrade|modify|refactor|redesign|essay|story|article|blog|report|documentation|tutorial|guide|plan|proposal|information|details|complete|full|detailed|comprehensive|large|long|extensive|in[- ]depth|write a|write an|build a|create a|make a|design a|update the|improve the)/i;

export function isLongCodeOrWritingRequest(text: string): boolean {
  const clean = (text || '').trim();
  if (!clean) return false;
  return LONG_CODE_OR_WRITING_REGEX.test(clean) || clean.length > 140;
}

export function hasUnclosedCodeFence(text: string): boolean {
  if (!text) return false;
  const matches = text.match(/```/g);
  return Boolean(matches && matches.length % 2 === 1);
}

export function hasUnclosedArtifactTag(text: string): boolean {
  if (!text) return false;
  const opens = (text.match(/<smfta_artifact\b/gi) || []).length;
  const closes = (text.match(/<\/smfta_artifact>/gi) || []).length;
  return opens > closes;
}

export function hasUnclosedHtmlDocument(text: string): boolean {
  if (!text) return false;
  const hasHtmlStart = /<!doctype\s+html|<html\b/i.test(text);
  const hasHtmlEnd = /<\/html>/i.test(text);
  return hasHtmlStart && !hasHtmlEnd;
}

export function classifyPromptComplexity(params: {
  text: string;
  mode?: string;
  style?: string;
  fastDecision?: boolean;
  creativity?: string;
  userId?: string;
  temperatureOverride?: number;
  topPOverride?: number;
}): {
  complexity: PromptComplexity;
  maxOutputTokens: number;
  temperature: number;
  topP: number;
  thinkingHint: string;
} {
  const weights = getOrCreateScopedWeights(params.userId);
  const clean = (params.text || '').trim();
  const wordCount = clean.split(/\s+/).filter(Boolean).length;
  const fastDecision = params.fastDecision !== false;
  const isLongRequest = isLongCodeOrWritingRequest(clean);

  let complexity: PromptComplexity = 'standard';

  if (
    fastDecision &&
    !isLongRequest &&
    wordCount <= 8 &&
    INSTANT_GREETING_REGEX.test(clean)
  ) {
    complexity = 'instant';
  } else if (
    isLongRequest ||
    params.mode === 'power' ||
    params.style === 'detailed' ||
    wordCount > 35 ||
    DEEP_REASONING_REGEX.test(clean)
  ) {
    complexity = 'deep';
  } else if (fastDecision && params.mode === 'fast' && wordCount <= 18) {
    complexity = 'instant';
  }

  let maxOutputTokens = 8192;
  if (complexity === 'instant') {
    maxOutputTokens = params.style === 'concise' ? 1024 : 2048;
  } else if (complexity === 'deep') {
    maxOutputTokens = params.mode === 'power' ? 32768 : 16384;
  } else {
    maxOutputTokens = params.style === 'concise' ? 4096 : 8192;
  }

  let temperature =
    typeof params.temperatureOverride === 'number' &&
    Number.isFinite(params.temperatureOverride)
      ? Math.max(0.05, Math.min(1.5, params.temperatureOverride))
      : weights.temperature;
  if (params.creativity === 'precise') temperature = Math.min(temperature, 0.3);
  else if (params.creativity === 'creative') temperature = Math.max(temperature, 0.85);

  const topP =
    typeof params.topPOverride === 'number' && Number.isFinite(params.topPOverride)
      ? Math.max(0.1, Math.min(1.0, params.topPOverride))
      : weights.topP;

  return {
    complexity,
    maxOutputTokens,
    temperature,
    topP,
    thinkingHint:
      complexity === 'instant'
        ? 'FAST_DECISION_MODE: Reply directly and concisely without unnecessary preamble.'
        : complexity === 'deep'
        ? 'DEEP_ALGORITHM_MODE: Think step-by-step internally. Provide a complete, well-structured, production-grade answer without cutting off code or long-form writing.'
        : 'BALANCED_ALGORITHM_MODE: Deliver a clear, accurate, well-formatted response.',
  };
}

export function getNeuralStatus(userId?: string) {
  const weights = getOrCreateScopedWeights(userId);
  return {
    version: APP_VERSION,
    uptime: Math.floor(process.uptime()),
    cacheSize: getResponseCacheSize(),
    maxCacheSize: getMaxResponseCacheSize(),
    weights: {
      temperature: weights.temperature,
      topP: weights.topP,
      topK: weights.topK,
      pairsLearned: weights.trainedPairs.length,
      lastTrainedAt: weights.lastTrainedAt,
    },
  };
}

