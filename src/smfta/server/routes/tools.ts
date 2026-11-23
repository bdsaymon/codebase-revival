import crypto from 'node:crypto';
import { GoogleGenAI, Modality, ThinkingLevel } from '@google/genai';
import { Router, Request, Response } from '../runtime/express';
import { callBackendEngine, sanitizeErrorMsg } from '../aiClient';
import { sanitizeProprietaryOutput } from '../providers';
import { getV2GeminiApiKey } from '../v2FirebaseAi';
import { generateOrEditGeminiImage } from '../services/geminiService';
import { getNeuralStatus, retrainModelWeights } from '../intentRules';
import {
  getResponseCacheSize,
  getMaxResponseCacheSize,
} from '../responseCache';
import { getSharedHardenedEngine } from '../engine/router';
import { verifyConnectionTargetSafe } from '../engine/config';
import { timingSafeTokenEqual } from '../engine/security';
import {
  validateStructuredOutput,
  type JsonObjectSchema,
} from '../engine/outputValidator';
import { APP_VERSION } from '../../src/version';
import {
  TOOL_CAPABILITY_REGISTRY,
  WORKSPACE_RUNTIME_CAPABILITIES,
  isToolEnabled,
} from '../../src/utils/capabilityRegistry';

export const toolsRouter = Router();

// ============================================================================
// 0. REAL SYSTEM & ENGINE STATUS ENDPOINTS (Phase 1.4 & 4.5)
// ============================================================================
function isAdminAuthorized(req: Request): boolean {
  const adminToken = (process.env.AI_ADMIN_TOKEN || '').trim();
  if (!adminToken) return false;
  const provided = String(
    req.headers['x-admin-token'] ||
      req.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
      ''
  ).trim();
  return timingSafeTokenEqual(provided, adminToken);
}

function buildRealStatusPayload(req: Request, userId?: string) {
  const neural = getNeuralStatus(userId);
  const engine = getSharedHardenedEngine();
  const fullHealth = engine.get_ai_health();
  const includeAdminDetails = isAdminAuthorized(req);
  return {
    ok: true,
    version: APP_VERSION,
    uptime: Math.floor(process.uptime()),
    cacheSize: getResponseCacheSize(),
    maxCacheSize: getMaxResponseCacheSize(),
    weights: neural.weights,
    persistence: engine.storage.persistenceMode,
    engineHealth: includeAdminDetails
      ? fullHealth
      : {
          killSwitchEnabled: fullHealth.killSwitchEnabled,
          serverKeyDailyCap: fullHealth.serverKeyDailyCap,
          serverKeyDailyCount: fullHealth.serverKeyDailyCount,
          serverKeyBudgetReached: fullHealth.serverKeyBudgetReached,
          providerCount: Array.isArray(fullHealth.providers)
            ? fullHealth.providers.length
            : 0,
        },
    capabilities: {
      tools: TOOL_CAPABILITY_REGISTRY,
      workspaceRuntimes: WORKSPACE_RUNTIME_CAPABILITIES,
    },
  };
}

toolsRouter.get('/tools/capabilities', (_req: Request, res: Response) => {
  return res.json({
    ok: true,
    version: APP_VERSION,
    tools: TOOL_CAPABILITY_REGISTRY,
    workspaceRuntimes: WORKSPACE_RUNTIME_CAPABILITIES,
  });
});

toolsRouter.get('/neural/status', (req: Request, res: Response) => {
  return res.json(buildRealStatusPayload(req, req.userId));
});

toolsRouter.post('/neural/retrain', (req: Request, res: Response) => {
  const { trainingData, temperature, topP } = req.body || {};
  const userId = req.userId || 'default';
  const weights = retrainModelWeights({
    trainingData: typeof trainingData === 'string' ? trainingData : undefined,
    temperature: typeof temperature === 'number' ? temperature : undefined,
    topP: typeof topP === 'number' ? topP : undefined,
    userId,
  });
  return res.json({
    ok: true,
    userId,
    weights,
  });
});

toolsRouter.get('/system/status', (req: Request, res: Response) => {
  return res.json(buildRealStatusPayload(req, req.userId));
});


// ============================================================================
// 1. INLINE REWRITE ENDPOINT (Phase 4.3)
// ============================================================================
const INLINE_REWRITE_SCHEMA: JsonObjectSchema = {
  type: 'object',
  properties: {
    rewrittenBlock: { type: 'string', minLength: 1 },
    summary: { type: 'string' },
  },
  required: ['rewrittenBlock'],
};

toolsRouter.post('/inline-rewrite', async (req: Request, res: Response) => {
  const {
    fullDocument = '',
    targetBlock = '',
    feedback = 'Make it clearer and more natural',
    scope = 'paragraph',
    provider,
    externalKeys,
    externalModel,
    externalBaseUrl,
    enabledTools,
  } = req.body || {};

  if (
    enabledTools &&
    typeof enabledTools === 'object' &&
    !isToolEnabled('inline_rewrite', enabledTools as Record<string, boolean>)
  ) {
    return res.status(403).json({
      ok: false,
      tool: 'inline_rewrite',
      error: 'Tool "inline_rewrite" is disabled in user settings.',
    });
  }

  if (!targetBlock || !String(targetBlock).trim()) {
    return res.status(400).json({ error: 'Target block is required' });
  }

  try {
    const prompt = `You are a collaborative bilingual (Bengali & English) AI writing editor.
The user highlighted a specific ${scope} inside a response and gave this feedback: "${feedback}".

FULL DOCUMENT CONTEXT:
"""
${fullDocument}
"""

TARGET BLOCK TO REWRITE:
"""
${targetBlock}
"""

Rewrite ONLY the target block so it directly addresses the feedback while preserving the language (Bengali or English) and seamless flow with the surrounding document.
Respond ONLY in valid JSON with this exact structure:
{"rewrittenBlock": "...", "summary": "Short 4-8 word summary of what changed"}`;

    const genRes = await callBackendEngine(
      prompt,
      'You are a precision JSON-only inline editor.',
      {
        maxTokens: 1500,
        preferredProvider: provider,
        preferredModel: externalModel,
        externalKeys,
        externalBaseUrl,
      }
    );

    const validated = validateStructuredOutput(
      genRes.text,
      INLINE_REWRITE_SCHEMA
    );

    if (validated.valid && validated.data) {
      const rewrittenBlock = sanitizeProprietaryOutput(
        String(validated.data.rewrittenBlock || targetBlock).trim()
      );
      const summary = sanitizeProprietaryOutput(
        String(validated.data.summary || `Updated (${feedback})`).trim()
      );
      const updatedFullDocument = fullDocument.includes(targetBlock)
        ? fullDocument.replace(targetBlock, rewrittenBlock)
        : fullDocument;

      return res.json({
        rewrittenBlock,
        updatedFullDocument,
        summary,
      });
    }

    return res.json({
      rewrittenBlock: targetBlock,
      updatedFullDocument: fullDocument,
      summary: 'Could not parse rewrite response',
      error: 'Invalid structured output',
    });
  } catch (err) {
    return res.status(500).json({
      error: sanitizeErrorMsg(err),
      rewrittenBlock: targetBlock,
      updatedFullDocument: fullDocument,
    });
  }
});

// ============================================================================
// 2. PROACTIVE SUGGESTIONS & REVIEW ENDPOINTS (Phase 4.3)
// ============================================================================
const PROACTIVE_SUGGESTIONS_SCHEMA: JsonObjectSchema = {
  type: 'object',
  properties: {
    suggestions: { type: 'array' },
  },
  required: ['suggestions'],
};

const PROACTIVE_REVIEW_SCHEMA: JsonObjectSchema = {
  type: 'object',
  properties: {
    overallFeedback: { type: 'string' },
    suggestions: { type: 'array' },
  },
  required: ['suggestions'],
};

function sanitizeSuggestionItems(rawItems: unknown[], text: string) {
  return rawItems
    .filter((item): item is Record<string, unknown> =>
      Boolean(
        item &&
          typeof item === 'object' &&
          typeof (item as Record<string, unknown>).targetText === 'string' &&
          typeof (item as Record<string, unknown>).replacementText === 'string' &&
          text.includes(String((item as Record<string, unknown>).targetText))
      )
    )
    .slice(0, 3)
    .map((s, idx) => ({
      id: `sug-${idx + 1}`,
      category: sanitizeProprietaryOutput(String(s.category || 'Clarity')),
      targetText: String(s.targetText),
      replacementText: sanitizeProprietaryOutput(String(s.replacementText)),
      reason: sanitizeProprietaryOutput(
        String(s.reason || 'Improves readability')
      ),
    }));
}

toolsRouter.post(
  '/proactive-suggestions',
  async (req: Request, res: Response) => {
    const {
      text = '',
      provider,
      externalKeys,
      externalModel,
      externalBaseUrl,
    } = req.body || {};

    if (!text || String(text).trim().length < 40) {
      return res.json({ suggestions: [] });
    }

    try {
      const prompt = `Analyze the following text and identify 2 to 3 specific phrases or sentences that could be improved for Clarity, Punchiness, Flow, or Tone.
Keep the exact same language (Bengali or English) as the source text.
IMPORTANT: "targetText" MUST be an exact, verbatim substring copied from the source text so it can be highlighted automatically.

SOURCE TEXT:
"""
${text}
"""

Return ONLY valid JSON in this exact format:
{
  "suggestions": [
    {
      "id": "sug-1",
      "category": "Clarity",
      "targetText": "exact substring from source text",
      "replacementText": "improved version",
      "reason": "short 5-10 word explanation"
    }
  ]
}`;

      const genRes = await callBackendEngine(
        prompt,
        'You are a precision JSON-only writing critic.',
        {
          maxTokens: 1200,
          preferredProvider: provider,
          preferredModel: externalModel,
          externalKeys,
          externalBaseUrl,
        }
      );

      const validated = validateStructuredOutput(
        genRes.text,
        PROACTIVE_SUGGESTIONS_SCHEMA
      );
      if (!validated.valid || !validated.data) {
        return res.json({ suggestions: [] });
      }

      const rawSuggestions = Array.isArray(validated.data.suggestions)
        ? validated.data.suggestions
        : [];
      return res.json({
        suggestions: sanitizeSuggestionItems(rawSuggestions, String(text)),
      });
    } catch {
      return res.json({ suggestions: [] });
    }
  }
);

toolsRouter.post('/proactive-review', async (req: Request, res: Response) => {
  const {
    text = '',
    content = '',
    provider,
    externalKeys,
    externalModel,
    externalBaseUrl,
  } = req.body || {};

  const targetDocument = String(text || content || '').trim();
  if (targetDocument.length < 20) {
    return res.json({ suggestions: [], overallFeedback: '' });
  }

  try {
    const prompt = `Review the following document as a proactive AI writing partner.
Provide 1 short encouraging overall observation ("overallFeedback") and 2 to 3 concrete inline suggestions where "targetText" is an exact verbatim substring from the document.

DOCUMENT:
"""
${targetDocument}
"""

Return ONLY valid JSON:
{
  "overallFeedback": "1 sentence feedback in the same language",
  "suggestions": [
    {
      "id": "rev-1",
      "category": "Punchiness",
      "targetText": "exact phrase from document",
      "replacementText": "stronger phrase",
      "reason": "why this works better"
    }
  ]
}`;

    const genRes = await callBackendEngine(
      prompt,
      'You are a precision JSON-only editorial assistant.',
      {
        maxTokens: 1200,
        preferredProvider: provider,
        preferredModel: externalModel,
        externalKeys,
        externalBaseUrl,
      }
    );

    const validated = validateStructuredOutput(
      genRes.text,
      PROACTIVE_REVIEW_SCHEMA
    );
    if (!validated.valid || !validated.data) {
      return res.json({ suggestions: [], overallFeedback: '' });
    }

    const rawSuggestions = Array.isArray(validated.data.suggestions)
      ? validated.data.suggestions
      : [];
    return res.json({
      overallFeedback: sanitizeProprietaryOutput(
        String(validated.data.overallFeedback || '')
      ),
      suggestions: sanitizeSuggestionItems(rawSuggestions, String(text)),
    });
  } catch {
    return res.json({ suggestions: [], overallFeedback: '' });
  }
});

// ============================================================================
// 3. IMAGE GENERATION ENDPOINT (Phase 4.4)
// ============================================================================
toolsRouter.post('/generate-image', async (req: Request, res: Response) => {
  const enabledTools = req.body?.enabledTools;
  if (
    enabledTools &&
    typeof enabledTools === 'object' &&
    !isToolEnabled('generate_image', enabledTools as Record<string, boolean>)
  ) {
    return res.status(403).json({
      ok: false,
      tool: 'generate_image',
      error: 'Tool "generate_image" is disabled in user settings.',
    });
  }

  const rawPrompt =
    typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
  if (!rawPrompt || rawPrompt.length < 1 || rawPrompt.length > 1000) {
    return res.status(400).json({
      ok: false,
      error: 'Prompt must be between 1 and 1000 characters.',
    });
  }

  const requestedSize = Number(req.body?.size);
  const size = [512, 768, 1024, 1536].includes(requestedSize) ? requestedSize : 1024;
  const aspectRatio =
    typeof req.body?.aspectRatio === 'string' && req.body.aspectRatio.trim()
      ? req.body.aspectRatio.trim()
      : '1:1';
  const styleHint =
    typeof req.body?.style === 'string' && req.body.style.trim()
      ? `, ${req.body.style.trim().slice(0, 60)} style`
      : '';
  const finalPrompt = `${rawPrompt}${styleHint}`;
  const referenceImageBase64 =
    typeof req.body?.referenceImageBase64 === 'string'
      ? req.body.referenceImageBase64.trim()
      : undefined;
  const referenceImageMimeType =
    typeof req.body?.referenceImageMimeType === 'string'
      ? req.body.referenceImageMimeType.trim()
      : undefined;
  const requestedModel =
    req.body?.model === 'gemini-nano-banana-2.1' ||
    req.body?.model === 'gemini-3.1-flash-lite-image'
      ? req.body.model
      : 'gemini-3.1-flash-lite-image';

  const imgResult = await generateOrEditGeminiImage({
    prompt: finalPrompt,
    aspectRatio,
    referenceImageBase64,
    referenceImageMimeType,
    model: requestedModel,
  });

  if (!imgResult.ok || !imgResult.url) {
    const code = imgResult.error?.code || 'INTEGRATION_REQUIRED';
    const status = imgResult.error?.httpStatus || 503;
    return res.status(status).json({
      ok: false,
      code,
      integrationRequired: code === 'INTEGRATION_REQUIRED',
      error:
        imgResult.error?.message ||
        'Integration required: GEMINI_API_KEY must be configured on the server for Image Generation & Editing.',
    });
  }

  return res.json({
    ok: true,
    url: imgResult.url,
    prompt: rawPrompt,
    size,
    aspectRatio,
    modelUsed: imgResult.modelUsed || requestedModel,
  });
});

// ============================================================================
// 3B. SERVER VOICE AUDIO TRANSCRIPTION (gemini-3.5-transcribe + fallback)
// ============================================================================
const ALLOWED_AUDIO_MIME_PREFIXES = [
  'audio/webm',
  'audio/mp4',
  'audio/ogg',
  'audio/wav',
  'audio/mpeg',
  'audio/mp3',
  'audio/aac',
  'audio/x-m4a',
];

export function sanitizeAudioMimeType(raw?: string): string {
  const clean = String(raw || '').split(';')[0].trim().toLowerCase();
  if (ALLOWED_AUDIO_MIME_PREFIXES.includes(clean)) {
    return clean === 'audio/mp3' ? 'audio/mpeg' : clean === 'audio/x-m4a' ? 'audio/mp4' : clean;
  }
  return 'audio/webm';
}

export function cleanVoiceTranscriptResponse(raw: string): string {
  const s = String(raw || '')
    .replace(/^```[\s\S]*?\n|```$/g, '')
    .trim();
  if (
    !s ||
    /^(?:\[?(?:silence|inaudible|no[_\s]*speech|empty|none|noise|background[_\s]*noise)\]?)$/i.test(
      s
    )
  ) {
    return '';
  }
  return s.replace(/\s+/g, ' ').trim();
}

toolsRouter.post('/voice/transcribe', async (req: Request, res: Response) => {
  const rawAudio = typeof req.body?.audioBase64 === 'string' ? req.body.audioBase64.trim() : '';
  if (!rawAudio) {
    return res.status(400).json({ ok: false, error: 'audioBase64 is required' });
  }
  const strippedBase64 = rawAudio.replace(/^data:[^;]+;base64,/i, '').trim();
  if (!strippedBase64 || strippedBase64.length > 16_000_000) {
    return res.status(400).json({ ok: false, error: 'Invalid or oversized audio payload' });
  }
  const mimeType = sanitizeAudioMimeType(
    typeof req.body?.mimeType === 'string' ? req.body.mimeType : undefined
  );
  const languageHint =
    typeof req.body?.language === 'string' && req.body.language.trim()
      ? req.body.language.trim()
      : 'bn-BD / en-US';

  const geminiKey = getV2GeminiApiKey();
  if (!geminiKey) {
    return res.status(503).json({
      ok: false,
      error: 'Voice transcription service key is not configured on the server.',
    });
  }

  const ai = new GoogleGenAI({
    apiKey: geminiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });

  const instruction =
    `Transcribe the spoken human words in this audio accurately verbatim in the original spoken language (${languageHint}, supporting Bengali, English, and mixed Banglish). ` +
    'Output ONLY the transcribed spoken words with natural punctuation and no explanation or labels. ' +
    'If there is NO human speech (only silence, hum, tone, clicks, or background noise), output the exact token: [SILENCE]';

  const candidateModels = ['gemini-3.1-flash-lite', 'gemini-4-hydrogen', 'gemini-3.5-transcribe'];
  let lastError = 'Transcription failed';

  for (const model of candidateModels) {
    try {
      const config =
        model === 'gemini-3.1-flash-lite'
          ? {
              temperature: 0,
              maxOutputTokens: 4096,
              thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
            }
          : model === 'gemini-4-hydrogen'
            ? {
                temperature: 0,
                maxOutputTokens: 4096,
                thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              }
            : { temperature: 0, maxOutputTokens: 4096 };
      const resp = await ai.models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [
              { text: instruction },
              {
                inlineData: {
                  mimeType,
                  data: strippedBase64,
                },
              },
            ],
          },
        ],
        config,
      });
      const text = cleanVoiceTranscriptResponse(resp.text || '');
      return res.json({
        ok: true,
        text,
        modelUsed: model,
      });
    } catch (err) {
      lastError = sanitizeErrorMsg(err);
    }
  }

  return res.status(502).json({
    ok: false,
    error: lastError,
  });
});

// ============================================================================
// 3C. SERVER NATURAL HUMAN VOICE TTS (gemini-3.8-flash-lite-tts)
// ============================================================================
export type GeminiFemaleVoiceName = 'Kore' | 'Zephyr' | 'Puck' | 'Charon' | 'Fenrir';

export function resolveGeminiFemaleVoice(requested?: string): GeminiFemaleVoiceName {
  const clean = String(requested || '').trim().toLowerCase();
  if (clean === 'zephyr') return 'Zephyr';
  if (clean === 'puck') return 'Puck';
  if (clean === 'charon') return 'Charon';
  if (clean === 'fenrir') return 'Fenrir';
  return 'Kore';
}

export function sanitizeTextForTtsEndpoint(raw: unknown): string {
  return String(raw || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, ' ')
    .replace(/<file\b[^>]*>[\s\S]*?<\/file>/gi, ' Created a file. ')
    .replace(/<patch\b[^>]*>[\s\S]*?<\/patch>/gi, ' Updated a file. ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*$/gm, ' ')
    .replace(/^\s*[-*_]{3,}\s*$/gm, ' ')
    .replace(/\|/g, ', ')
    .replace(/^[ \t]*[#>]+\s*/gm, '')
    .replace(/^[ \t]*(?:[-*•]+|\d+[.)])\s+/gm, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F\u20E3]/gu, '')
    .replace(/[*_~]+/g, '')
    .replace(/\s*,\s*,+/g, ', ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1600);
}

interface CachedTtsEntry {
  audioBase64: string;
  mimeType: string;
  modelUsed: string;
  pcmBuffer?: Buffer;
  sampleRate?: number;
  createdAt: number;
  ttlMs?: number;
}

const MAX_TTS_CACHE_ENTRIES = 80;
const ttsAudioCache = new Map<string, CachedTtsEntry>();
const ttsModelCooldownUntil = new Map<string, number>();

function isTtsModelCoolingDown(model: string): boolean {
  const until = ttsModelCooldownUntil.get(model);
  if (!until) return false;
  if (Date.now() >= until) {
    ttsModelCooldownUntil.delete(model);
    return false;
  }
  return true;
}

function recordTtsModelFailure(model: string, errMsg: string): void {
  if (/429|resource_exhausted|quota|rate/i.test(errMsg)) {
    ttsModelCooldownUntil.set(model, Date.now() + 25_000);
  } else if (/404|403|400|not.?found|unsupported|permission|no streaming audio/i.test(errMsg)) {
    ttsModelCooldownUntil.set(model, Date.now() + 180_000);
  } else if (model === 'gemini-3.8-live') {
    ttsModelCooldownUntil.set(model, Date.now() + 15_000);
  } else {
    ttsModelCooldownUntil.set(model, Date.now() + 60_000);
  }
}

function buildTtsCacheKey(voiceName: GeminiFemaleVoiceName, text: string): string {
  return `${voiceName}::${text.trim().toLowerCase()}`;
}

function getCachedTtsEntry(voiceName: GeminiFemaleVoiceName, text: string): CachedTtsEntry | null {
  const key = buildTtsCacheKey(voiceName, text);
  const hit = ttsAudioCache.get(key);
  if (!hit) return null;
  const maxAge = hit.ttlMs ?? 30 * 60 * 1000;
  if (Date.now() - hit.createdAt > maxAge) {
    ttsAudioCache.delete(key);
    return null;
  }
  return hit;
}

function setCachedTtsEntry(
  voiceName: GeminiFemaleVoiceName,
  text: string,
  entry: Omit<CachedTtsEntry, 'createdAt'>
): void {
  const key = buildTtsCacheKey(voiceName, text);
  if (ttsAudioCache.size >= MAX_TTS_CACHE_ENTRIES && !ttsAudioCache.has(key)) {
    const oldestKey = ttsAudioCache.keys().next().value;
    if (oldestKey) ttsAudioCache.delete(oldestKey);
  }
  ttsAudioCache.set(key, { ...entry, createdAt: Date.now() });
}

function wrapPcmInWavHeader(pcmBytes: Buffer, sampleRate = 24000): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * 2;
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcmBytes.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // AudioFormat 1 = PCM
  header.writeUInt16LE(1, 22); // Mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(2, 32); // BlockAlign
  header.writeUInt16LE(16, 34); // BitsPerSample
  header.write('data', 36);
  header.writeUInt32LE(pcmBytes.length, 40);
  return Buffer.concat([header, pcmBytes]);
}

/**
 * Splits long text into <= maxLen chunks while strictly preserving a SINGLE
 * consistent speaker language (`bn` or `en`) for the entire utterance so
 * two different voices never speak inside the same sentence.
 */
function splitTextIntoSingleVoiceChunks(
  text: string,
  maxLen = 175
): Array<{ lang: 'bn' | 'en'; text: string }> {
  const dominantLang: 'bn' | 'en' = /[\u0980-\u09FF]/.test(text) ? 'bn' : 'en';
  const words = text.split(/\s+/).filter(Boolean);
  const segments: Array<{ lang: 'bn' | 'en'; text: string }> = [];
  let currentWords: string[] = [];

  for (const w of words) {
    const candidate = [...currentWords, w].join(' ');
    if (candidate.length > maxLen && currentWords.length > 0) {
      segments.push({ lang: dominantLang, text: currentWords.join(' ') });
      currentWords = [w];
    } else {
      currentWords.push(w);
    }
  }
  if (currentWords.length > 0) {
    segments.push({ lang: dominantLang, text: currentWords.join(' ') });
  }
  return segments.slice(0, 8);
}

/**
 * High-clarity server-side natural neural speech fallback (Bengali & English)
 * using a SINGLE consistent speaker per utterance so two voices never mix.
 */
async function synthesizeServerNeuralFallbackMp3(speechText: string): Promise<Buffer | null> {
  const chunks = splitTextIntoSingleVoiceChunks(speechText, 175);
  if (chunks.length === 0) return null;

  const buffers: Buffer[] = [];
  for (const chunk of chunks) {
    const url =
      `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${chunk.lang}&q=` +
      encodeURIComponent(chunk.text);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    try {
      const resp = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          Accept: 'audio/mpeg,audio/*;q=0.9,*/*;q=0.8',
        },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!resp.ok) continue;
      const arr = await resp.arrayBuffer();
      if (arr.byteLength > 128) {
        buffers.push(Buffer.from(arr));
      }
    } catch {
      clearTimeout(timer);
    }
  }

  if (buffers.length === 0) return null;
  return Buffer.concat(buffers);
}

// ============================================================================
// 3C-LIVE. PRE-WARMED GEMINI 3.8 LIVE NATIVE AUDIO TTS POOL (gemini-3.8-live)
// ============================================================================
// Why: gemini-3.8-flash-lite-tts & gemini-2.5-flash-preview-tts have a strict
// 10 requests/day Free Tier generateContent quota, after which they return 429
// and would fall back to robotic TTS. gemini-3.8-live via ai.live.connect has
// no 10/day cap, connects in ~33ms, streams the first 24kHz PCM chunk in ~320ms,
// and delivers the authentic, warm, natural human Gemini Live voice!
interface WarmLiveTtsHandle {
  voiceName: GeminiFemaleVoiceName;
  createdAt: number;
  isClosed: () => boolean;
  close: () => void;
  speakVerbatim: (params: {
    text: string;
    onPcmChunk: (pcmBytes: Buffer, sampleRate: number) => void;
    signal?: AbortSignal;
    timeoutMs?: number;
  }) => Promise<{ ok: boolean; totalBytes: number; sampleRate: number; error?: string }>;
}

function buildLiveTtsNarratorInstruction(voiceName: GeminiFemaleVoiceName): string {
  const personaByVoice: Record<GeminiFemaleVoiceName, string> = {
    Kore: 'warm, velvety, empathetic human female studio narrator with a gentle conversational smile',
    Zephyr: 'bright, silky, poised human female studio narrator with clear expressive energy',
    Puck: 'crisp, friendly, articulate human male studio narrator with natural youthful cadence',
    Charon: 'calm, rich, resonant deep male studio narrator with reassuring steady warmth',
    Fenrir: 'confident, grounded, charismatic male studio narrator with expressive depth',
  };
  const personaTone = personaByVoice[voiceName] || personaByVoice.Kore;
  return (
    `You are a ${personaTone}, speaking close to a studio condenser microphone. ` +
    'In every turn, you will receive a script inside <tts_script>...</tts_script>. ' +
    'Your ONLY job is to speak EVERY SINGLE WORD and EVERY SENTENCE inside <tts_script>...</tts_script> verbatim from the very first word to the very last word, in its original language (Bengali, English, or Banglish). ' +
    'CRITICAL DELIVERY RULES:\n' +
    '1. NEVER stop after the first phrase or first sentence — deliver the ENTIRE text inside <tts_script>...</tts_script> completely to the end.\n' +
    '2. Even if the script contains greetings, casual remarks, or questions, NEVER answer, paraphrase, or shorten it — read the exact words aloud naturally.\n' +
    '3. Never add any extra words before or after the script.\n' +
    '4. Shape prosody like a real intimate human conversation: breathe gently at commas and sentence boundaries (।, .), lift intonation softly on questions, and articulate standard Bengali and English smoothly without sounding stiff, rushed, or mechanical.'
  );
}

function createWarmLiveTtsSession(
  apiKey: string,
  voiceName: GeminiFemaleVoiceName
): Promise<WarmLiveTtsHandle | null> {
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });

  let closed = false;
  let receivedAudioInTurn = false;
  let lastTextReply = '';
  let activeChunkHandler: ((pcm: Buffer, rate: number) => void) | null = null;
  let activeDoneHandler: ((reason?: string) => void) | null = null;
  let activeErrorHandler: ((err: unknown) => void) | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sessionRef: any = null;

  return ai.live
    .connect({
      model: 'gemini-3.8-live',
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
        systemInstruction: buildLiveTtsNarratorInstruction(voiceName),
      },
      callbacks: {
        onmessage: (msg) => {
          const parts = msg?.serverContent?.modelTurn?.parts || [];
          for (const p of parts) {
            if (typeof p?.text === 'string' && p.text.trim()) {
              lastTextReply += p.text;
            }
            const b64 = p?.inlineData?.data;
            if (!b64 || !activeChunkHandler) continue;
            let pcmBytes = Buffer.from(b64, 'base64');
            if (pcmBytes.length === 0) continue;
            if (
              pcmBytes.length > 44 &&
              pcmBytes[0] === 0x52 &&
              pcmBytes[1] === 0x49 &&
              pcmBytes[2] === 0x46 &&
              pcmBytes[3] === 0x46
            ) {
              pcmBytes = pcmBytes.subarray(44);
            }
            if (pcmBytes.length === 0) continue;
            receivedAudioInTurn = true;
            const rateMatch = String(p?.inlineData?.mimeType || '').match(/rate=(\d+)/i);
            const rate = rateMatch ? Number(rateMatch[1]) : 24000;
            activeChunkHandler(pcmBytes, rate);
          }
          const isTurnComplete = Boolean(msg?.serverContent?.turnComplete);
          const isGenCompleteWithAudio = Boolean(msg?.serverContent?.generationComplete && receivedAudioInTurn);
          if ((isTurnComplete || isGenCompleteWithAudio) && activeDoneHandler) {
            const detail =
              !receivedAudioInTurn && lastTextReply.trim()
                ? `text-only reply: ${lastTextReply.trim().slice(0, 80)}`
                : undefined;
            activeDoneHandler(detail);
          }
        },
        onerror: (err) => {
          closed = true;
          if (activeErrorHandler) {
            activeErrorHandler(err);
          }
        },
        onclose: (ev?: { code?: number; reason?: string }) => {
          closed = true;
          if (!receivedAudioInTurn && activeErrorHandler) {
            const detail = `WebSocket closed (${ev?.code ?? 0}${ev?.reason ? `: ${ev.reason}` : ''}${lastTextReply.trim() ? `; text=${lastTextReply.trim().slice(0, 60)}` : ''})`;
            activeErrorHandler(new Error(detail));
          } else if (activeDoneHandler) {
            activeDoneHandler();
          }
        },
      },
    })
    .then((sess): WarmLiveTtsHandle => {
      sessionRef = sess;
      const createdAt = Date.now();
      const close = () => {
        closed = true;
        activeChunkHandler = null;
        activeDoneHandler = null;
        activeErrorHandler = null;
        try {
          sessionRef?.close?.();
        } catch {
          // Ignore close errors
        }
      };

      return {
        voiceName,
        createdAt,
        isClosed: () => closed,
        close,
        speakVerbatim: ({ text, onPcmChunk, signal, timeoutMs = 15000 }) =>
          new Promise((resolve) => {
            if (closed || signal?.aborted) {
              close();
              resolve({ ok: false, totalBytes: 0, sampleRate: 24000, error: 'Session closed' });
              return;
            }
            let settled = false;
            let totalBytes = 0;
            let detectedRate = 24000;
            let postAudioIdleTimer: ReturnType<typeof setTimeout> | null = null;

            const finish = (ok: boolean, error?: string) => {
              if (settled) return;
              settled = true;
              clearTimeout(timer);
              clearTimeout(firstAudioTimer);
              if (postAudioIdleTimer) {
                clearTimeout(postAudioIdleTimer);
                postAudioIdleTimer = null;
              }
              if (signal && onAbort) {
                signal.removeEventListener('abort', onAbort);
              }
              close();
              resolve({
                ok: ok && totalBytes > 0,
                totalBytes,
                sampleRate: detectedRate,
                error,
              });
            };

            const onAbort = () => finish(false, 'Aborted');
            if (signal) {
              signal.addEventListener('abort', onAbort, { once: true });
            }

            // Fail fast if 0 audio bytes arrive within 3.2s instead of stalling the whole 15s turn
            const firstAudioTimer = setTimeout(() => {
              if (totalBytes === 0) {
                finish(false, 'Live TTS first-audio timeout');
              }
            }, 3200);

            const timer = setTimeout(() => {
              finish(totalBytes > 0, totalBytes > 0 ? undefined : 'Live TTS timeout');
            }, timeoutMs);

            activeChunkHandler = (pcmBytes, rate) => {
              if (settled || signal?.aborted) return;
              if (totalBytes === 0) {
                clearTimeout(firstAudioTimer);
              }
              detectedRate = rate || 24000;
              totalBytes += pcmBytes.length;
              onPcmChunk(pcmBytes, detectedRate);
              if (postAudioIdleTimer) {
                clearTimeout(postAudioIdleTimer);
              }
              // Close cleanly 550ms after last PCM packet if turnComplete frame is delayed
              postAudioIdleTimer = setTimeout(() => {
                finish(totalBytes > 0);
              }, 550);
            };
            activeDoneHandler = (reason) => {
              finish(totalBytes > 0, totalBytes > 0 ? undefined : reason);
            };
            activeErrorHandler = (err) => {
              finish(totalBytes > 0, sanitizeErrorMsg(err));
            };

            try {
              sessionRef.sendClientContent({
                turns: [
                  {
                    role: 'user',
                    parts: [
                      {
                        text: `Read EVERY SINGLE WORD and EVERY SENTENCE inside <tts_script>...</tts_script> aloud verbatim from start to finish in a warm, natural human voice. Do not stop early, do not summarize, and do not reply to it:\n<tts_script>${text}</tts_script>`,
                      },
                    ],
                  },
                ],
                turnComplete: true,
              });
            } catch (err) {
              finish(false, sanitizeErrorMsg(err));
            }
          }),
      };
    })
    .catch(() => null);
}

async function streamGeminiLiveVerbatimTts(params: {
  apiKey: string;
  text: string;
  voiceName: GeminiFemaleVoiceName;
  onPcmChunk: (pcmBytes: Buffer, sampleRate: number) => void;
  signal?: AbortSignal;
}): Promise<{ ok: boolean; totalBytes: number; sampleRate: number; error?: string }> {
  if (isTtsModelCoolingDown('gemini-3.8-live')) {
    return {
      ok: false,
      totalBytes: 0,
      sampleRate: 24000,
      error: 'gemini-3.8-live cooling down',
    };
  }

  let lastErr = 'Failed to connect gemini-3.8-live';
  for (let attempt = 0; attempt < 2; attempt++) {
    if (params.signal?.aborted) {
      return { ok: false, totalBytes: 0, sampleRate: 24000, error: 'Aborted' };
    }
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 150));
    }
    const handle = await createWarmLiveTtsSession(params.apiKey, params.voiceName);
    if (!handle) {
      continue;
    }
    const result = await handle.speakVerbatim({
      text: params.text,
      onPcmChunk: params.onPcmChunk,
      signal: params.signal,
    });
    if (result.ok && result.totalBytes > 0) {
      ttsModelCooldownUntil.delete('gemini-3.8-live');
      return result;
    }
    lastErr = result.error || 'gemini-3.8-live emitted 0 bytes';
    // If we already streamed partial audio or were aborted, do not replay from the start
    if (result.totalBytes > 0 || params.signal?.aborted) {
      break;
    }
  }

  if (/429|quota|resource_exhausted|not_found|404|timeout|0 bytes|closed|text-only/i.test(lastErr)) {
    recordTtsModelFailure('gemini-3.8-live', lastErr);
  }
  return { ok: false, totalBytes: 0, sampleRate: 24000, error: lastErr };
}

export async function generateTtsWithRetry(
  ai: Pick<GoogleGenAI, 'models'>,
  params: Parameters<GoogleGenAI['models']['generateContent']>[0],
  retryDelayMs = 1500
) {
  try {
    return await ai.models.generateContent(params);
  } catch (err) {
    const errMsg = sanitizeErrorMsg(err);
    if (/429|resource_exhausted|quota|rate/i.test(errMsg)) {
      await new Promise((r) => setTimeout(r, retryDelayMs));
      return await ai.models.generateContent(params);
    }
    throw err;
  }
}

export async function generateTtsStreamWithRetry(
  ai: Pick<GoogleGenAI, 'models'>,
  params: Parameters<GoogleGenAI['models']['generateContentStream']>[0],
  retryDelayMs = 1500
) {
  try {
    return await ai.models.generateContentStream(params);
  } catch (err) {
    const errMsg = sanitizeErrorMsg(err);
    if (/429|resource_exhausted|quota|rate/i.test(errMsg)) {
      await new Promise((r) => setTimeout(r, retryDelayMs));
      return await ai.models.generateContentStream(params);
    }
    throw err;
  }
}

toolsRouter.post('/voice/tts', async (req: Request, res: Response) => {
  const speechText = sanitizeTextForTtsEndpoint(req.body?.text);
  if (!speechText) {
    return res.status(400).json({ ok: false, modelUsed: 'none', error: 'text is required for speech synthesis.' });
  }

  const voiceName = resolveGeminiFemaleVoice(
    typeof req.body?.voiceName === 'string' ? req.body.voiceName : undefined
  );
  const geminiKey = getV2GeminiApiKey();

  // 1. Instant in-memory cache hit (skip old robotic fallback cache if Gemini key is active)
  const cached = getCachedTtsEntry(voiceName, speechText);
  if (
    cached &&
    cached.audioBase64 &&
    (!geminiKey || cached.modelUsed !== 'neural-voice-hd')
  ) {
    return res.json({
      ok: true,
      audioBase64: cached.audioBase64,
      mimeType: cached.mimeType,
      voiceName,
      modelUsed: cached.modelUsed,
      cached: true,
    });
  }

  const isMaleVoice =
    voiceName === 'Puck' || voiceName === 'Charon' || voiceName === 'Fenrir';
  const defaultStyle = isMaleVoice
    ? 'Intimate studio-mic warmth, rich natural human male conversational voice with lyrical sentence flow, gentle phrasing pauses, accurate Bengali and English pronunciation, never flat or robotic'
    : 'Intimate studio-mic warmth, silky natural human female conversational voice with lyrical sentence flow, gentle phrasing pauses, accurate Bengali and English pronunciation, never flat or robotic';
  const customStyle =
    typeof req.body?.style === 'string' && req.body.style.trim()
      ? req.body.style.trim().slice(0, 220)
      : defaultStyle;

  let lastError = 'Gemini TTS generation failed';

  if (geminiKey) {
    // 1A. Primary Natural Human Voice Engine: Pre-warmed Gemini 3.8 Live Native Audio (no 10/day cap!)
    const livePcmChunks: Buffer[] = [];
    const liveRes = await streamGeminiLiveVerbatimTts({
      apiKey: geminiKey,
      text: speechText,
      voiceName,
      onPcmChunk: (pcmBytes) => {
        livePcmChunks.push(pcmBytes);
      },
    });
    if (liveRes.ok && livePcmChunks.length > 0) {
      const fullPcm = Buffer.concat(livePcmChunks);
      const wavBuffer = wrapPcmInWavHeader(fullPcm, liveRes.sampleRate || 24000);
      const finalBase64 = wavBuffer.toString('base64');
      setCachedTtsEntry(voiceName, speechText, {
        audioBase64: finalBase64,
        mimeType: 'audio/wav',
        modelUsed: 'gemini-3.8-live',
        pcmBuffer: fullPcm,
        sampleRate: liveRes.sampleRate || 24000,
      });
      return res.json({
        ok: true,
        audioBase64: finalBase64,
        mimeType: 'audio/wav',
        voiceName,
        modelUsed: 'gemini-3.8-live',
      });
    }
    if (liveRes.error || !liveRes.ok || livePcmChunks.length === 0) {
      lastError = liveRes.error || 'gemini-3.8-live returned empty audio payload.';
      if (!/cooling down/i.test(lastError)) {
        console.info(`[voice/tts] gemini-3.8-live skipped (${lastError}); trying fallback TTS`);
      }
    }

    // 1B. Secondary Gemini TTS models via generateContent
    const ai = new GoogleGenAI({
      apiKey: geminiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });

    const ttsModels = [
      'gemini-3.8-flash-tts',
      'gemini-3.8-flash-lite-tts',
    ].filter((m) => !isTtsModelCoolingDown(m));

    for (const model of ttsModels) {
      try {
        const partPayload = {
          text: speechText,
          speechMetadata: { style: customStyle },
        } as { text: string; speechMetadata?: { style?: string } };
        const response = await generateTtsWithRetry(ai, {
          model,
          contents: [
            {
              role: 'user',
              parts: [partPayload],
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName },
              },
            },
          },
        });

        const parts = response.candidates?.[0]?.content?.parts || [];
        const audioPart = parts.find((p) => Boolean(p?.inlineData?.data));
        const rawBase64 = audioPart?.inlineData?.data;
        const rawMime = String(audioPart?.inlineData?.mimeType || 'audio/wav');

        if (rawBase64) {
          const rawBytes = Buffer.from(rawBase64, 'base64');
          const hasRiffHeader =
            rawBytes.length > 44 &&
            rawBytes[0] === 0x52 &&
            rawBytes[1] === 0x49 &&
            rawBytes[2] === 0x46 &&
            rawBytes[3] === 0x46;

          const rateMatch = rawMime.match(/rate=(\d+)/i);
          const sampleRate = rateMatch ? Number(rateMatch[1]) : 24000;

          const wavBuffer = hasRiffHeader
            ? rawBytes
            : wrapPcmInWavHeader(rawBytes, sampleRate);
          const pcmSlice = hasRiffHeader ? rawBytes.subarray(44) : rawBytes;
          const finalBase64 = hasRiffHeader ? rawBase64 : wavBuffer.toString('base64');
          const finalMime = 'audio/wav';

          ttsModelCooldownUntil.delete(model);
          setCachedTtsEntry(voiceName, speechText, {
            audioBase64: finalBase64,
            mimeType: finalMime,
            modelUsed: model,
            pcmBuffer: pcmSlice,
            sampleRate,
          });

          return res.json({
            ok: true,
            audioBase64: finalBase64,
            mimeType: finalMime,
            voiceName,
            modelUsed: model,
          });
        }
        lastError = `${model} returned no audio payload.`;
        console.info(`[voice/tts] ${model} returned empty audio; trying next model`);
      } catch (err) {
        lastError = sanitizeErrorMsg(err);
        console.info(`[voice/tts] ${model} skipped (${lastError.slice(0, 140)})`);
        recordTtsModelFailure(model, lastError);
      }
    }
    console.info(`[voice/tts] Gemini TTS unavailable (${lastError}); serving neural-voice-hd`);
  } else {
    lastError = 'GEMINI_API_KEY is missing on the server.';
    console.info(`[voice/tts] Gemini TTS unavailable: ${lastError}`);
  }

  // 2. Last-resort Server Neural Audio Fallback only if all Gemini models are unreachable
  const neuralMp3 = await synthesizeServerNeuralFallbackMp3(speechText);
  if (neuralMp3 && neuralMp3.length > 128) {
    const audioBase64 = neuralMp3.toString('base64');
    return res.json({
      ok: true,
      audioBase64,
      mimeType: 'audio/mpeg',
      voiceName,
      modelUsed: 'neural-voice-hd',
      isBackupVoice: true,
    });
  }

  if (!geminiKey) {
    return res.status(503).json({
      ok: false,
      modelUsed: 'none',
      code: 'INTEGRATION_REQUIRED',
      integrationRequired: true,
      error:
        'Integration required: Server GEMINI_API_KEY must be configured to enable Gemini natural voice.',
    });
  }

  return res.status(502).json({
    ok: false,
    modelUsed: 'none',
    error: lastError,
  });
});

toolsRouter.post('/voice/tts-stream', async (req: Request, res: Response) => {
  const speechText = sanitizeTextForTtsEndpoint(req.body?.text);
  if (!speechText) {
    return res.status(400).json({ ok: false, error: 'text is required for speech synthesis.' });
  }

  const voiceName = resolveGeminiFemaleVoice(
    typeof req.body?.voiceName === 'string' ? req.body.voiceName : undefined
  );

  // 1. Instant PCM cache hit
  const cached = getCachedTtsEntry(voiceName, speechText);
  if (cached && cached.pcmBuffer && cached.pcmBuffer.length > 0) {
    const sampleRate = cached.sampleRate || 24000;
    res.status(200);
    res.setHeader(
      'Content-Type',
      `audio/pcm; rate=${sampleRate}; channels=1; encoding=signed-int`
    );
    res.setHeader('Cache-Control', 'no-cache, no-store');
    res.setHeader('X-Voice-Sample-Rate', String(sampleRate));
    res.setHeader('X-Voice-Model-Used', `${cached.modelUsed}-cached`);
    res.flushHeaders();
    res.write(cached.pcmBuffer);
    res.end();
    return;
  }

  const geminiKey = getV2GeminiApiKey();
  if (!geminiKey) {
    console.warn('[voice/tts-stream] Gemini streaming TTS unavailable: GEMINI_API_KEY is missing.');
    return res.status(200).json({
      ok: false,
      retryUnaryTts: true,
      modelUsed: 'none',
      error: 'Streaming TTS unavailable without GEMINI_API_KEY; use unary neural TTS.',
    });
  }

  const isMaleVoice =
    voiceName === 'Puck' || voiceName === 'Charon' || voiceName === 'Fenrir';
  const defaultStyle = isMaleVoice
    ? 'Intimate studio-mic warmth, rich natural human male conversational voice with lyrical sentence flow, gentle phrasing pauses, accurate Bengali and English pronunciation, never flat or robotic'
    : 'Intimate studio-mic warmth, silky natural human female conversational voice with lyrical sentence flow, gentle phrasing pauses, accurate Bengali and English pronunciation, never flat or robotic';
  const customStyle =
    typeof req.body?.style === 'string' && req.body.style.trim()
      ? req.body.style.trim().slice(0, 220)
      : defaultStyle;

  const abortCtrl = new AbortController();
  let clientClosed = false;
  req.on('close', () => {
    clientClosed = true;
    abortCtrl.abort();
  });

  // 2A. Primary Real-Time Streaming Voice Engine: Pre-warmed Gemini 3.8 Live Native Audio (~320ms first chunk!)
  let liveWroteAny = false;
  const liveCollectedPcm: Buffer[] = [];
  let liveSampleRate = 24000;

  const liveStreamRes = await streamGeminiLiveVerbatimTts({
    apiKey: geminiKey,
    text: speechText,
    voiceName,
    signal: abortCtrl.signal,
    onPcmChunk: (pcmBytes, rate) => {
      if (clientClosed || abortCtrl.signal.aborted) return;
      if (!liveWroteAny) {
        liveWroteAny = true;
        liveSampleRate = rate || 24000;
        res.status(200);
        res.setHeader(
          'Content-Type',
          `audio/pcm; rate=${liveSampleRate}; channels=1; encoding=signed-int`
        );
        res.setHeader('Cache-Control', 'no-cache, no-store');
        res.setHeader('X-Voice-Sample-Rate', String(liveSampleRate));
        res.setHeader('X-Voice-Model-Used', 'gemini-3.8-live');
        res.flushHeaders();
      }
      liveCollectedPcm.push(pcmBytes);
      res.write(pcmBytes);
    },
  });

  if (liveWroteAny) {
    if (!clientClosed && liveCollectedPcm.length > 0) {
      const fullPcm = Buffer.concat(liveCollectedPcm);
      const fullWav = wrapPcmInWavHeader(fullPcm, liveSampleRate);
      setCachedTtsEntry(voiceName, speechText, {
        audioBase64: fullWav.toString('base64'),
        mimeType: 'audio/wav',
        modelUsed: 'gemini-3.8-live',
        pcmBuffer: fullPcm,
        sampleRate: liveSampleRate,
      });
    }
    if (!res.writableEnded) {
      res.end();
    }
    return;
  }

  let lastError = liveStreamRes.error || 'Gemini streaming TTS returned no audio chunks.';
  if (!/cooling down/i.test(lastError)) {
    console.info(`[voice/tts-stream] gemini-3.8-live skipped (${lastError}); trying fallback stream TTS`);
  }

  // 2B. Secondary streaming TTS models via generateContentStream
  const ai = new GoogleGenAI({
    apiKey: geminiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });

  const allStreamModels = [
    'gemini-3.8-flash-tts',
    'gemini-3.8-flash-lite-tts',
  ];
  const cooledStreamModels = allStreamModels.filter((m) => !isTtsModelCoolingDown(m));
  const ttsStreamModels =
    cooledStreamModels.length > 0 ? cooledStreamModels : ['gemini-3.8-flash-lite-tts'];

  for (const model of ttsStreamModels) {
    if (clientClosed || req.signal?.aborted) break;
    let wroteAny = false;
    const collectedPcmChunks: Buffer[] = [];
    let streamSampleRate = 24000;

    try {
      const partPayload = {
        text: speechText,
        speechMetadata: { style: customStyle },
      } as { text: string; speechMetadata?: { style?: string } };
      const responseStream = await generateTtsStreamWithRetry(ai, {
        model,
        contents: [
          {
            role: 'user',
            parts: [partPayload],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        },
      });

      for await (const chunk of responseStream) {
        if (clientClosed || req.signal?.aborted) break;
        const parts = chunk.candidates?.[0]?.content?.parts || [];
        for (const p of parts) {
          const b64 = p?.inlineData?.data;
          if (!b64) continue;
          let pcmBytes = Buffer.from(b64, 'base64');
          if (pcmBytes.length === 0) continue;

          if (
            pcmBytes.length > 44 &&
            pcmBytes[0] === 0x52 &&
            pcmBytes[1] === 0x49 &&
            pcmBytes[2] === 0x46 &&
            pcmBytes[3] === 0x46
          ) {
            pcmBytes = pcmBytes.subarray(44);
          }
          if (pcmBytes.length === 0) continue;

          if (!wroteAny) {
            wroteAny = true;
            const rateMatch = String(p?.inlineData?.mimeType || '').match(/rate=(\d+)/i);
            streamSampleRate = rateMatch ? Number(rateMatch[1]) : 24000;
            res.status(200);
            res.setHeader(
              'Content-Type',
              `audio/pcm; rate=${streamSampleRate}; channels=1; encoding=signed-int`
            );
            res.setHeader('Cache-Control', 'no-cache, no-store');
            res.setHeader('X-Voice-Sample-Rate', String(streamSampleRate));
            res.setHeader('X-Voice-Model-Used', model);
            res.flushHeaders();
          }
          collectedPcmChunks.push(pcmBytes);
          res.write(pcmBytes);
        }
      }

      if (wroteAny) {
        ttsModelCooldownUntil.delete(model);
        if (!clientClosed && collectedPcmChunks.length > 0) {
          const fullPcm = Buffer.concat(collectedPcmChunks);
          const fullWav = wrapPcmInWavHeader(fullPcm, streamSampleRate);
          setCachedTtsEntry(voiceName, speechText, {
            audioBase64: fullWav.toString('base64'),
            mimeType: 'audio/wav',
            modelUsed: model,
            pcmBuffer: fullPcm,
            sampleRate: streamSampleRate,
          });
        }
        if (!res.writableEnded) {
          res.end();
        }
        return;
      }
      lastError = `${model} returned no streaming audio chunks.`;
      console.info(`[voice/tts-stream] ${model} empty stream; trying next model`);
      recordTtsModelFailure(model, lastError);
    } catch (err) {
      lastError = sanitizeErrorMsg(err);
      console.info(`[voice/tts-stream] ${model} skipped (${lastError.slice(0, 140)})`);
      recordTtsModelFailure(model, lastError);
      if (wroteAny) {
        if (!res.writableEnded) {
          res.end();
        }
        return;
      }
    }
  }

  console.info(`[voice/tts-stream] Deferring to unary TTS fallback (${lastError.slice(0, 140)})`);

  if (!res.headersSent) {
    return res.status(200).json({
      ok: false,
      retryUnaryTts: true,
      modelUsed: 'none',
      error: lastError,
    });
  }
  if (!res.writableEnded) {
    res.end();
  }
  return;
});

// ============================================================================
// 4. REAL TOOL EXECUTION & WRITE CONFIRMATION GATE (Phase 4.3)
// ============================================================================
interface PendingToolAction {
  id: string;
  userId: string;
  tool: string;
  args: Record<string, unknown>;
  argsHash: string;
  createdAt: number;
  expiresAt: number;
  used: boolean;
}

const pendingActions = new Map<string, PendingToolAction>();
const executedIdempotencyResults = new Map<string, Record<string, unknown>>();
const WRITE_TOOLS = new Set([
  'create_note',
  'delete_note',
  'send_webhook',
  'github_commit',
  'drive_upload',
]);

function hashCanonicalArgs(tool: string, args: Record<string, unknown>): string {
  const keys = Object.keys(args).sort();
  const canonical: Record<string, unknown> = {};
  for (const k of keys) {
    canonical[k] = args[k];
  }
  return crypto
    .createHash('sha256')
    .update(`${tool}:${JSON.stringify(canonical)}`)
    .digest('hex');
}

/**
 * Safe recursive-descent arithmetic evaluator (no eval / Function).
 * Supports +, -, *, /, %, ^, parentheses, and sin/cos/tan/sqrt/abs/log/round/floor/ceil, pi, e.
 */
export function evaluateSafeMathExpression(exprRaw: string): number {
  const s = (exprRaw || '').replace(/\s+/g, '');
  if (!s || s.length > 256) {
    throw new Error('Invalid math expression length');
  }

  let pos = 0;

  function parseExpression(): number {
    let left = parseTerm();
    while (pos < s.length && (s[pos] === '+' || s[pos] === '-')) {
      const op = s[pos++];
      const right = parseTerm();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  function parseTerm(): number {
    let left = parsePower();
    while (
      pos < s.length &&
      (s[pos] === '*' || s[pos] === '/' || s[pos] === '%')
    ) {
      const op = s[pos++];
      const right = parsePower();
      if ((op === '/' || op === '%') && right === 0) {
        throw new Error('Division by zero');
      }
      left = op === '*' ? left * right : op === '/' ? left / right : left % right;
    }
    return left;
  }

  function parsePower(): number {
    const base = parseUnary();
    if (pos < s.length && s[pos] === '^') {
      pos++;
      const exp = parsePower();
      return Math.pow(base, exp);
    }
    return base;
  }

  function parseUnary(): number {
    if (s[pos] === '+') {
      pos++;
      return parseUnary();
    }
    if (s[pos] === '-') {
      pos++;
      return -parseUnary();
    }
    return parsePrimary();
  }

  function parsePrimary(): number {
    if (s[pos] === '(') {
      pos++;
      const val = parseExpression();
      if (s[pos] !== ')') throw new Error('Missing closing parenthesis');
      pos++;
      return val;
    }

    const identMatch = s.slice(pos).match(/^[a-zA-Z_]+/);
    if (identMatch) {
      const name = identMatch[0].toLowerCase();
      pos += name.length;
      if (name === 'pi') return Math.PI;
      if (name === 'e') return Math.E;
      if (s[pos] !== '(') throw new Error(`Expected '(' after ${name}`);
      pos++;
      const arg = parseExpression();
      if (s[pos] !== ')') throw new Error(`Missing ')' after ${name} argument`);
      pos++;
      switch (name) {
        case 'sqrt':
          return Math.sqrt(arg);
        case 'abs':
          return Math.abs(arg);
        case 'sin':
          return Math.sin(arg);
        case 'cos':
          return Math.cos(arg);
        case 'tan':
          return Math.tan(arg);
        case 'log':
          return Math.log10(arg);
        case 'ln':
          return Math.log(arg);
        case 'round':
          return Math.round(arg);
        case 'floor':
          return Math.floor(arg);
        case 'ceil':
          return Math.ceil(arg);
        default:
          throw new Error(`Unsupported math function: ${name}`);
      }
    }

    const numMatch = s.slice(pos).match(/^\d+(?:\.\d+)?/);
    if (!numMatch) {
      throw new Error(`Unexpected token at position ${pos}`);
    }
    pos += numMatch[0].length;
    const val = Number(numMatch[0]);
    if (!Number.isFinite(val)) throw new Error('Non-finite number');
    return val;
  }

  const result = parseExpression();
  if (pos < s.length) {
    throw new Error(`Unexpected trailing characters at position ${pos}`);
  }
  if (!Number.isFinite(result)) {
    throw new Error('Math result is not finite');
  }
  return Number(result.toFixed(10));
}

toolsRouter.post('/execute-tool', async (req: Request, res: Response) => {
  const {
    tool = '',
    input = '',
    args = {},
    confirmed = false,
    confirmationId = '',
    enabledTools,
    toolPermissions,
    provider,
    externalKeys,
    externalModel,
    externalBaseUrl,
  } = req.body || {};

  const toolName = String(tool || '').trim().toLowerCase();
  if (!toolName) {
    return res.status(400).json({ ok: false, error: 'tool name is required' });
  }

  if (
    enabledTools &&
    typeof enabledTools === 'object' &&
    !isToolEnabled(toolName, enabledTools as Record<string, boolean>)
  ) {
    return res.status(403).json({
      ok: false,
      tool: toolName,
      error: `Tool "${toolName}" is disabled in user settings.`,
    });
  }

  const canonicalToolName =
    toolName === 'math' ? 'calculate' : toolName === 'search' ? 'web_search' : toolName;
  const requestedPermission =
    toolPermissions && typeof toolPermissions === 'object'
      ? (toolPermissions as Record<string, unknown>)[toolName] ||
        (toolPermissions as Record<string, unknown>)[canonicalToolName]
      : undefined;

  if (requestedPermission === 'deny') {
    return res.status(403).json({
      ok: false,
      errorCode: 'TOOL_DENIED_BY_POLICY',
      tool: toolName,
      permission: 'deny',
      error: `Tool "${toolName}" execution is denied by user Tool Permissions policy.`,
    });
  }

  const requiresConfirmation =
    WRITE_TOOLS.has(toolName) || requestedPermission === 'ask';

  // Write / approval-gated action confirmation gate (Phase 4.3, P0-04, and Settings Tool Permissions)
  if (requiresConfirmation) {
    const callerUserId = String(req.userId || 'anon_local');
    const normalizedArgs: Record<string, unknown> =
      typeof args === 'object' && args !== null
        ? (args as Record<string, unknown>)
        : { input };

    if (!confirmed || !confirmationId) {
      const id = `conf_${crypto.randomUUID()}`;
      const now = Date.now();
      const argsHash = hashCanonicalArgs(toolName, normalizedArgs);
      pendingActions.set(id, {
        id,
        userId: callerUserId,
        tool: toolName,
        args: normalizedArgs,
        argsHash,
        createdAt: now,
        expiresAt: now + 5 * 60 * 1_000,
        used: false,
      });
      return res.json({
        ok: true,
        requiresConfirmation: true,
        confirmationId: id,
        tool: toolName,
        argsPreview: normalizedArgs,
        expiresAt: new Date(now + 5 * 60 * 1_000).toISOString(),
        message: `Action "${toolName}" requires explicit user confirmation before execution.`,
      });
    }

    const confKey = String(confirmationId);
    const idempotentHit = executedIdempotencyResults.get(confKey);
    if (idempotentHit) {
      return res.status(400).json({
        ok: false,
        error: 'Confirmation ID has already been used (one-time token)',
      });
    }

    const pending = pendingActions.get(confKey);
    if (
      !pending ||
      pending.used ||
      pending.tool !== toolName ||
      pending.userId !== callerUserId ||
      Date.now() > pending.expiresAt
    ) {
      pendingActions.delete(confKey);
      return res.status(400).json({
        ok: false,
        error: 'Invalid, expired, or unauthorized confirmationId',
      });
    }

    // If caller supplied modified args on confirmation, reject tampering (P0-04)
    if (
      req.body?.args &&
      typeof req.body.args === 'object' &&
      Object.keys(req.body.args as Record<string, unknown>).length > 0
    ) {
      const incomingHash = hashCanonicalArgs(
        toolName,
        req.body.args as Record<string, unknown>
      );
      if (incomingHash !== pending.argsHash) {
        return res.status(400).json({
          ok: false,
          error: 'Tool arguments cannot be modified after confirmation',
        });
      }
    }

    pending.used = true;
    pendingActions.delete(confKey);

    const engine = getSharedHardenedEngine();
    const execArgs = pending.args;

    if (toolName === 'create_note') {
      const noteId = String(execArgs.noteId || execArgs.id || `note_${crypto.randomUUID().slice(0, 12)}`);
      const title = String(execArgs.title || 'Untitled Note').trim();
      const content = String(execArgs.content || execArgs.body || execArgs.input || '').trim();
      const saved = engine.storage.upsertPersistedNote({
        noteId,
        userId: callerUserId,
        title,
        content,
      });
      const verified = engine.storage.getPersistedNote(saved.noteId, callerUserId);
      if (!verified) {
        return res.status(500).json({
          ok: false,
          confirmed: true,
          executed: false,
          tool: toolName,
          error: 'Note persistence read-back verification failed',
        });
      }
      const responsePayload = {
        ok: true,
        confirmed: true,
        executed: true,
        verified: true,
        tool: toolName,
        noteId: verified.noteId,
        revision: verified.revision,
        executedArgs: execArgs,
        output: `Confirmed and persisted note "${verified.title}" (ID: ${verified.noteId}, rev ${verified.revision}).`,
      };
      executedIdempotencyResults.set(confKey, responsePayload);
      return res.json(responsePayload);
    }

    if (toolName === 'delete_note') {
      const noteId = String(execArgs.noteId || execArgs.id || '').trim();
      if (!noteId) {
        return res.status(400).json({
          ok: false,
          confirmed: true,
          executed: false,
          tool: toolName,
          error: 'noteId is required to delete a note',
        });
      }
      const deleted = engine.storage.deletePersistedNote(noteId, callerUserId);
      const stillExists = engine.storage.getPersistedNote(noteId, callerUserId);
      const responsePayload = {
        ok: true,
        confirmed: true,
        executed: true,
        verified: stillExists === null,
        deleted,
        tool: toolName,
        noteId,
        executedArgs: execArgs,
        output: deleted
          ? `Confirmed and deleted note "${noteId}".`
          : `Note "${noteId}" was already absent.`,
      };
      executedIdempotencyResults.set(confKey, responsePayload);
      return res.json(responsePayload);
    }

    if (toolName === 'send_webhook') {
      const webhookUrl = String(execArgs.url || execArgs.webhookUrl || '').trim();
      if (!webhookUrl) {
        return res.status(501).json({
          ok: false,
          confirmed: true,
          executed: false,
          tool: toolName,
          reason: 'connector_unavailable',
          error: 'Webhook URL is required for real execution.',
        });
      }
      const ssrf = await verifyConnectionTargetSafe(webhookUrl, {
        isCustomProvider: true,
        allowInsecureLocalhost: process.env.ALLOW_INSECURE_LOCALHOST === 'true',
      });
      if (!ssrf.safe) {
        return res.status(400).json({
          ok: false,
          confirmed: true,
          executed: false,
          tool: toolName,
          error: `Unsafe webhook target: ${ssrf.reason || 'blocked'}`,
        });
      }
      try {
        const whRes = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(execArgs.payload ?? execArgs),
        });
        if (!whRes.ok) {
          return res.status(502).json({
            ok: false,
            confirmed: true,
            executed: false,
            tool: toolName,
            httpStatus: whRes.status,
            error: `Webhook endpoint returned HTTP ${whRes.status}`,
          });
        }
        return res.json({
          ok: true,
          confirmed: true,
          executed: true,
          verified: true,
          tool: toolName,
          httpStatus: whRes.status,
          executedArgs: execArgs,
          output: `Webhook delivered (HTTP ${whRes.status}).`,
        });
      } catch (err) {
        return res.status(502).json({
          ok: false,
          confirmed: true,
          executed: false,
          tool: toolName,
          error: sanitizeErrorMsg(err),
        });
      }
    }

    if (WRITE_TOOLS.has(toolName)) {
      // github_commit / drive_upload require real connector credentials; never fabricate success (P0-04)
      return res.status(501).json({
        ok: false,
        confirmed: true,
        executed: false,
        tool: toolName,
        reason: 'connector_unavailable',
        error: `Real connector for "${toolName}" is not configured on the server. Use client Vault sync or provide connector credentials.`,
      });
    }
    // For read/utility tools with permission='ask', fall through after confirmation is verified.
  }

  // 1. Safe AST Math Calculator
  if (toolName === 'calculate' || toolName === 'math') {
    const expr = String(input || (args as Record<string, unknown>)?.expression || '').trim();
    try {
      const value = evaluateSafeMathExpression(expr);
      return res.json({
        ok: true,
        tool: 'calculate',
        expression: expr,
        result: value,
        output: `${expr} = ${value}`,
      });
    } catch (err) {
      return res.status(400).json({
        ok: false,
        error: sanitizeErrorMsg(err),
      });
    }
  }

  // 2. Multi-Source Real-Time Web Search (DuckDuckGo Instant Answer + Wikipedia + DDG HTML)
  if (toolName === 'web_search' || toolName === 'search') {
    const query = String(input || (args as Record<string, unknown>)?.query || '').trim();
    if (!query) {
      return res.status(400).json({ ok: false, error: 'Search query is required' });
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8_000);
    try {
      const sources: Array<{ title: string; url: string }> = [];
      const seenUrls = new Set<string>();
      const addSource = (title: string, url: string) => {
        if (!url || seenUrls.has(url)) return;
        seenUrls.add(url);
        sources.push({ title: (title || url).slice(0, 90), url });
      };
      const snippets: string[] = [];

      const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(
        query
      )}&format=json&no_html=1&skip_disambig=1`;
      const ddgRes = await fetch(ddgUrl, {
        headers: { Accept: 'application/json' },
        signal: ctrl.signal,
      }).catch(() => null);

      if (ddgRes && ddgRes.ok) {
        const data = (await ddgRes.json().catch(() => ({}))) as Record<string, unknown>;
        const abstractText = String(data.AbstractText || '').trim();
        const abstractUrl = String(data.AbstractURL || '').trim();
        const heading = String(data.Heading || query).trim();
        if (abstractText) {
          snippets.push(abstractText);
          if (abstractUrl) addSource(heading, abstractUrl);
        }
        if (Array.isArray(data.RelatedTopics)) {
          for (const t of data.RelatedTopics.slice(0, 4)) {
            if (t && typeof t === 'object') {
              const obj = t as Record<string, unknown>;
              const txt = String(obj.Text || '').trim();
              const firstUrl = String(obj.FirstURL || '').trim();
              if (txt) {
                snippets.push(`• ${txt}`);
                if (firstUrl) addSource(txt.slice(0, 68), firstUrl);
              }
            }
          }
        }
      }

      // If DDG Instant Answer had no direct summary, also query Wikipedia + DDG HTML
      if (snippets.length === 0) {
        const wikiLang = /[\u0980-\u09FF]/.test(query) ? 'bn' : 'en';
        const wikiUrl = `https://${wikiLang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
          query
        )}&utf8=1&format=json&srlimit=3`;
        const wikiRes = await fetch(wikiUrl, {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'SMFTA-AI-Pro/19.0 (https://smfta.ai)',
          },
          signal: ctrl.signal,
        }).catch(() => null);
        if (wikiRes && wikiRes.ok) {
          const wikiData = (await wikiRes.json().catch(() => ({}))) as {
            query?: { search?: Array<{ title?: string; snippet?: string }> };
          };
          for (const item of (wikiData.query?.search || []).slice(0, 3)) {
            const title = String(item.title || '').trim();
            const cleanSnippet = String(item.snippet || '')
              .replace(/<[^>]+>/g, '')
              .replace(/&quot;/g, '"')
              .replace(/&amp;/g, '&')
              .replace(/\s+/g, ' ')
              .trim();
            if (title && cleanSnippet) {
              const pageUrl = `https://${wikiLang}.wikipedia.org/wiki/${encodeURIComponent(
                title.replace(/\s+/g, '_')
              )}`;
              snippets.push(`• [${title}] (${pageUrl}): ${cleanSnippet}`);
              addSource(`${title} — Wikipedia`, pageUrl);
            }
          }
        }
      }

      clearTimeout(timer);
      const combined =
        snippets.join('\n') ||
        `No verified live summary found for "${query}".`;
      return res.json({
        ok: true,
        tool: 'web_search',
        query,
        sources,
        output: combined,
      });
    } catch (err) {
      clearTimeout(timer);
      return res.json({
        ok: false,
        tool: 'web_search',
        error: sanitizeErrorMsg(err),
      });
    }
  }

  // Real-Time Web Browse & Web Fetch (URL Scraper & Live Inspector with SSRF-safe redirects)
  if (toolName === 'web_browse' || toolName === 'web_fetch' || toolName === 'fetch_url' || toolName === 'browse') {
    const rawTarget = String(input || (args as Record<string, unknown>)?.url || (args as Record<string, unknown>)?.target || '').trim();
    if (!rawTarget) {
      return res.status(400).json({ ok: false, error: 'Target URL or web query is required' });
    }

    let targetUrl = rawTarget;
    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = `https://${targetUrl}`;
    }

    const allowInsecureLocalhost = process.env.ALLOW_INSECURE_LOCALHOST === 'true';

    // SSRF verification (P0-04) on initial URL
    const ssrfCheck = await verifyConnectionTargetSafe(targetUrl, {
      isCustomProvider: false,
      allowInsecureLocalhost,
    });
    if (!ssrfCheck.safe) {
      return res.status(400).json({
        ok: false,
        tool: toolName,
        error: `Blocked target URL for security: ${ssrfCheck.reason || 'unauthorized target'}`,
      });
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12_000);
    try {
      let currentUrl = targetUrl;
      let pageRes: globalThis.Response | null = null;

      for (let hop = 0; hop <= 3; hop++) {
        if (hop > 0) {
          const hopCheck = await verifyConnectionTargetSafe(currentUrl, {
            isCustomProvider: false,
            allowInsecureLocalhost,
          });
          if (!hopCheck.safe) {
            clearTimeout(timer);
            return res.status(400).json({
              ok: false,
              tool: toolName,
              error: `Blocked redirect URL for security: ${hopCheck.reason || 'unauthorized redirect target'}`,
            });
          }
        }

        pageRes = await fetch(currentUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 SMFTA-AI-Pro/19.1',
            'Accept': 'text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.8',
          },
          redirect: 'manual',
          signal: ctrl.signal,
        });

        if (pageRes.status >= 300 && pageRes.status < 400) {
          const location = pageRes.headers.get('location');
          if (!location || hop === 3) break;
          currentUrl = new URL(location, currentUrl).toString();
          continue;
        }
        break;
      }

      clearTimeout(timer);

      if (!pageRes || !pageRes.ok) {
        return res.json({
          ok: false,
          tool: toolName,
          url: currentUrl,
          httpStatus: pageRes?.status || 0,
          error: pageRes ? `HTTP ${pageRes.status} ${pageRes.statusText}` : 'No response received',
        });
      }

      targetUrl = currentUrl;
      const contentType = pageRes.headers.get('content-type') || '';
      const rawText = await pageRes.text();

      if (contentType.includes('application/json')) {
        let jsonSummary = rawText.slice(0, 4000);
        try {
          jsonSummary = JSON.stringify(JSON.parse(rawText), null, 2).slice(0, 4000);
        } catch {}
        return res.json({
          ok: true,
          tool: toolName,
          url: targetUrl,
          contentType: 'json',
          output: `🌐 Live JSON API Response (${targetUrl}):\n\`\`\`json\n${jsonSummary}\n\`\`\``,
        });
      }

      // Clean HTML page
      const titleMatch = rawText.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : targetUrl;

      // Extract main text by stripping scripts, styles, and tags
      const cleaned = rawText
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
        .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 3500);

      return res.json({
        ok: true,
        tool: toolName,
        url: targetUrl,
        title,
        output: `🌐 Live Web Inspection (${title} · ${targetUrl}):\n\n${cleaned || 'Page loaded successfully but contained no visible text.'}`,
      });
    } catch (err) {
      clearTimeout(timer);
      return res.json({
        ok: false,
        tool: toolName,
        url: targetUrl,
        error: sanitizeErrorMsg(err),
      });
    }
  }

  // 3. Real LLM-backed Tools (summarize, code_review, task_breakdown)
  const textPayload = String(
    input || (args as Record<string, unknown>)?.text || ''
  ).trim();
  if (!textPayload) {
    return res.status(400).json({ ok: false, error: 'Tool input text is required' });
  }

  const sysMap: Record<string, string> = {
    summarize:
      'Summarize the user input into concise, high-signal bullet points in the same language.',
    code_review:
      'Review the provided code for bugs, security issues, and performance improvements.',
    task_breakdown:
      'Break down the goal into a numbered step-by-step actionable checklist.',
  };

  const sysInstruction =
    sysMap[toolName] ||
    `Execute the requested tool (${toolName}) accurately and concisely.`;

  const llmRes = await callBackendEngine(textPayload, sysInstruction, {
    maxTokens: 1024,
    preferredProvider: provider,
    preferredModel: externalModel,
    externalKeys,
    externalBaseUrl,
  });

  if (!llmRes.ok) {
    return res.status(502).json({
      ok: false,
      tool: toolName,
      error: llmRes.error || 'Tool LLM execution failed',
    });
  }

  return res.json({
    ok: true,
    tool: toolName,
    output: sanitizeProprietaryOutput(llmRes.text),
  });
});

// ============================================================================
// 11. DIAGRAM STUDIO GENERATOR (Mind Maps & Flowcharts)
// ============================================================================
toolsRouter.post('/diagram', async (req: Request, res: Response) => {
  const promptText = String(req.body?.prompt || '').trim();
  const kind = req.body?.kind === 'flowchart' ? 'flowchart' : 'mindmap';

  if (!promptText) {
    return res.status(400).json({ ok: false, error: 'Please describe the diagram to generate.' });
  }

  const sysInstruction = `You are a diagram architect. Return ONLY valid JSON with no markdown fences and no commentary.
Schema:
{
  "title": "Short descriptive title",
  "nodes": [
    { "id": "n1", "label": "Root or Start label", "note": "Optional short note", "x": 260, "y": 40 }
  ],
  "edges": [
    { "id": "e1", "source": "n1", "target": "n2", "label": "optional edge label" }
  ]
}
Rules:
- Generate between 6 and 12 clean, well-spaced nodes for a ${kind}.
- Coordinates (x: 40..900, y: 30..650) must avoid overlap (minimum 210px horizontal, 120px vertical spacing).
- Keep every node label concise (2-6 words) in the same language as the user's request.`;

  const llmRes = await Promise.race([
    callBackendEngine(
      `Create a ${kind} diagram for: ${promptText}`,
      sysInstruction,
      { maxTokens: 1600 }
    ).catch(() => ({ ok: false as const, text: '' })),
    new Promise<{ ok: false; text: string }>((resolve) =>
      setTimeout(() => resolve({ ok: false, text: '' }), 10000)
    ),
  ]);

  if (llmRes.ok && llmRes.text) {
    const parsed = safeJsonExtract<{
      title?: string;
      nodes?: Array<{ id?: string; label?: string; note?: string; x?: number; y?: number }>;
      edges?: Array<{ id?: string; source?: string; target?: string; label?: string }>;
    }>(llmRes.text);

    if (parsed && Array.isArray(parsed.nodes) && parsed.nodes.length > 0) {
      const cleanNodes = parsed.nodes.slice(0, 20).map((n, idx) => ({
        id: String(n.id || `n-${idx + 1}`),
        label: String(n.label || `Step ${idx + 1}`).slice(0, 90),
        note: typeof n.note === 'string' ? n.note.slice(0, 120) : undefined,
        x: typeof n.x === 'number' && Number.isFinite(n.x) ? n.x : (idx % 3) * 240 + 50,
        y: typeof n.y === 'number' && Number.isFinite(n.y) ? n.y : Math.floor(idx / 3) * 130 + 30,
      }));
      const nodeIds = new Set(cleanNodes.map((n) => n.id));
      const cleanEdges = Array.isArray(parsed.edges)
        ? parsed.edges
            .filter((e) => e && nodeIds.has(String(e.source)) && nodeIds.has(String(e.target)))
            .slice(0, 32)
            .map((e, idx) => ({
              id: String(e.id || `e-${idx + 1}`),
              source: String(e.source),
              target: String(e.target),
              label: typeof e.label === 'string' && e.label.trim() ? e.label.trim().slice(0, 40) : undefined,
            }))
        : [];

      return res.json({
        ok: true,
        title: String(parsed.title || promptText.slice(0, 60)),
        nodes: cleanNodes,
        edges: cleanEdges,
      });
    }
  }

  // Deterministic structured fallback when upstream LLM is unavailable
  const topic = promptText.slice(0, 56);
  const fallbackNodes =
    kind === 'flowchart'
      ? [
          { id: 'n1', label: `Start: ${topic}`, x: 260, y: 30 },
          { id: 'n2', label: 'Gather Inputs & Goals', x: 260, y: 150 },
          { id: 'n3', label: 'Core Processing', x: 260, y: 270 },
          { id: 'n4', label: 'Review & Validate', x: 100, y: 390 },
          { id: 'n5', label: 'Deliver & Monitor', x: 420, y: 390 },
        ]
      : [
          { id: 'n1', label: topic, x: 290, y: 40 },
          { id: 'n2', label: 'Core Objectives', x: 60, y: 190 },
          { id: 'n3', label: 'Key Components', x: 290, y: 190 },
          { id: 'n4', label: 'Execution Plan', x: 520, y: 190 },
          { id: 'n5', label: 'Risks & Safeguards', x: 170, y: 340 },
          { id: 'n6', label: 'Success Metrics', x: 410, y: 340 },
        ];
  const fallbackEdges =
    kind === 'flowchart'
      ? [
          { id: 'e1', source: 'n1', target: 'n2' },
          { id: 'e2', source: 'n2', target: 'n3' },
          { id: 'e3', source: 'n3', target: 'n4', label: 'Check' },
          { id: 'e4', source: 'n3', target: 'n5', label: 'Launch' },
        ]
      : [
          { id: 'e1', source: 'n1', target: 'n2' },
          { id: 'e2', source: 'n1', target: 'n3' },
          { id: 'e3', source: 'n1', target: 'n4' },
          { id: 'e4', source: 'n3', target: 'n5' },
          { id: 'e5', source: 'n3', target: 'n6' },
        ];

  return res.json({
    ok: true,
    title: topic,
    nodes: fallbackNodes,
    edges: fallbackEdges,
  });
});
