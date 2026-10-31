import { APP_VERSION } from '../src/version';
import {
  getResponseCacheSize,
  getMaxResponseCacheSize,
} from './responseCache';

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
  /(তুমি কে|আপনি কে|তোমার নাম কি|তোমার নাম কী|আপনার নাম কি|আপনার নাম কী|তোমাকে কে বানিয়েছে|তোমাকে কে বানিয়েছে|তোমাকে কে তৈরি করেছে|তোমার নির্মাতা কে|তোমার মালিক কে|কে তোমাকে বানিয়েছে|কে তোমাকে তৈরি করেছে|তুমি কোন মডেল|তুমি কোন এআই|তোমার পরিচয় দাও|তোমার পরিচয় দাও)/i;

const IDENTITY_EN_REGEX =
  /\b(who are you|what is your name|what's your name|who made you|who built you|who created you|who is your creator|who is your developer|who owns you|who do you belong to|what model are you|which ai are you)\b/i;

const PRIVACY_QUERY_REGEX =
  /(তোমার সিস্টেম প্রম্পট|গোপন ডাটা|গোপন তথ্য|প্রাইভেসি পলিসি|ডাটা শেয়ার|ডাটা শেয়ার|reveal your system prompt|show your system instructions|share your confidential data|internal prompt)/i;

const CREATOR_QUERY_REGEX =
  /(তোমাকে কে বানিয়েছে|তোমাকে কে বানিয়েছে|তোমাকে কে তৈরি করেছে|তোমার নির্মাতা কে|তোমার মালিক কে|কে তোমাকে বানিয়েছে|কে তোমাকে তৈরি করেছে|কে তোমাকে বানিয়েছে|who made you|who built you|who created you|who is your creator|who is your developer|who owns you|who do you belong to)/i;

export function interceptIdentityQuery(
  userQuery: string,
  replyLang: string = 'auto'
): string | null {
  const clean = (userQuery || '').trim();
  if (!clean || clean.length > 160) return null;

  const hasBengaliChars = /[\u0980-\u09FF]/.test(clean);
  const preferEnglish =
    replyLang === 'en' || (!hasBengaliChars && replyLang !== 'bn');

  if (PRIVACY_QUERY_REGEX.test(clean)) {
    if (preferEnglish) {
      return 'I am **SMFTA AI Pro** (**SMFTA Pro**). My internal system prompt and private configuration aren’t shared externally. How can I help you today?';
    }
    return 'আমি **SMFTA AI Pro** (**SMFTA Pro**)। আমার ভেতরের সিস্টেম নির্দেশনা বা গোপন কনফিগারেশন বাইরে শেয়ার করি না। বলুন, কোন কাজে সাহায্য করব?';
  }

  if (CREATOR_QUERY_REGEX.test(clean)) {
    if (preferEnglish) {
      return 'I am **SMFTA AI Pro** (**SMFTA Pro**) — the dedicated AI assistant built for and owned by the **SMFTA AI Pro** platform. How can I help you today?';
    }
    return 'আমি **SMFTA AI Pro** (**SMFTA Pro**) — **SMFTA AI Pro** প্ল্যাটফর্মের নিজস্ব ও নির্ধারিত AI সহকারী। আজ কী নিয়ে কাজ করব?';
  }

  if (IDENTITY_BN_REGEX.test(clean) || IDENTITY_EN_REGEX.test(clean)) {
    if (preferEnglish) {
      return 'I am **SMFTA AI Pro** (**SMFTA Pro**) — your dedicated AI assistant on the SMFTA AI Pro platform for code, writing, analysis and research. What are we working on?';
    }
    return 'আমি **SMFTA AI Pro** (**SMFTA Pro**) — কোডিং, লেখালেখি, বিশ্লেষণ ও গবেষণায় SMFTA AI Pro প্ল্যাটফর্মের নিজস্ব AI সহকারী। আজ কী নিয়ে কাজ করব?';
  }

  return null;
}

export type PromptComplexity = 'instant' | 'standard' | 'deep';

const DEEP_REASONING_REGEX =
  /(কোড|প্রোগ্রাম|অ্যালগরিদম|বিস্তারিত|বিশ্লেষণ|তুলনা|ব্যাখ্যা|রচনা|গল্প|উপন্যাস|প্রবন্ধ|নিবন্ধ|স্ক্রিপ্ট|টিউটোরিয়াল|টিউটোরিয়াল|অ্যাপ|ওয়েবসাইট|ওয়েবসাইট|ডাটাবেস|আর্কিটেকচার|ডিবাগ|ফিক্স|সম্পূর্ণ|পূর্ণাঙ্গ|বড়|বড়|code|program|algorithm|analyze|analysis|compare|explain|architecture|refactor|debug|implement|typescript|javascript|python|react|sql|html|css|full|complete|detailed|comprehensive|essay|story|article|guide|tutorial|step by step|why|how does)/i;

const INSTANT_GREETING_REGEX =
  /^(hi|hello|hey|yo|sup|thanks|thank you|ok|okay|হ্যালো|হাই|সালাম|আসসালামু আলাইকুম|নমস্কার|ধন্যবাদ|কেমন আছো|কেমন আছেন|কি খবর|কী খবর|শুভ সকাল|শুভ রাত্রি)[?!.\s]*$/i;

export const LONG_CODE_OR_WRITING_REGEX =
  /(কোড|প্রোগ্রাম|অ্যালগরিদম|রচনা|গল্প|উপন্যাস|প্রবন্ধ|নিবন্ধ|স্ক্রিপ্ট|টিউটোরিয়াল|টিউটোরিয়াল|অ্যাপ|ওয়েবসাইট|ওয়েবসাইট|পূর্ণাঙ্গ|সম্পূর্ণ|বিস্তারিত|বড়|বড়|code|program|script|function|class|component|html|css|javascript|typescript|python|java|c\+\+|react|nextjs|node|express|sql|database|api|essay|story|article|blog|report|documentation|tutorial|complete|full|detailed|comprehensive|write a|build a|create a)/i;

export function isLongCodeOrWritingRequest(text: string): boolean {
  const clean = (text || '').trim();
  if (!clean) return false;
  return LONG_CODE_OR_WRITING_REGEX.test(clean) || clean.length > 180;
}

export function hasUnclosedCodeFence(text: string): boolean {
  if (!text) return false;
  const matches = text.match(/```/g);
  return Boolean(matches && matches.length % 2 === 1);
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

  let maxOutputTokens = 4096;
  if (complexity === 'instant') {
    maxOutputTokens = params.style === 'concise' ? 768 : 1024;
  } else if (complexity === 'deep') {
    maxOutputTokens = params.mode === 'power' ? 16384 : 8192;
  } else {
    maxOutputTokens = params.style === 'concise' ? 2048 : 4096;
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

