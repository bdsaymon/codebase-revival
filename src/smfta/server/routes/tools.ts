import crypto from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import { Router, Request, Response } from '../runtime/express';
import { callBackendEngine, sanitizeErrorMsg } from '../aiClient';
import { sanitizeProprietaryOutput } from '../providers';
import { getV2GeminiApiKey } from '../v2FirebaseAi';
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
    provider,
    externalKeys,
    externalModel,
    externalBaseUrl,
  } = req.body || {};

  if (!text || String(text).trim().length < 20) {
    return res.json({ suggestions: [], overallFeedback: '' });
  }

  try {
    const prompt = `Review the following document as a proactive AI writing partner.
Provide 1 short encouraging overall observation ("overallFeedback") and 2 to 3 concrete inline suggestions where "targetText" is an exact verbatim substring from the document.

DOCUMENT:
"""
${text}
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
      error: 'Prompt must be between 1 and 1000 characters.',
    });
  }

  const requestedSize = Number(req.body?.size);
  const size = [512, 768, 1024, 1536].includes(requestedSize) ? requestedSize : 1024;
  const styleHint =
    typeof req.body?.style === 'string' && req.body.style.trim()
      ? `, ${req.body.style.trim().slice(0, 60)} style`
      : '';
  const finalPrompt = `${rawPrompt}${styleHint}`;
  const geminiKey = getV2GeminiApiKey();
  if (geminiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const imgResp = await ai.models.generateContent({
        model: 'gemini-nano-banana-2.1',
        contents: finalPrompt,
        config: {
          responseModalities: ['IMAGE'],
        },
      });
      const parts = imgResp.candidates?.[0]?.content?.parts || [];
      for (const p of parts as Array<{ inlineData?: { mimeType?: string; data?: string } }>) {
        if (p?.inlineData?.data) {
          const mime = p.inlineData.mimeType || 'image/png';
          return res.json({
            url: `data:${mime};base64,${p.inlineData.data}`,
            prompt: rawPrompt,
            size,
            modelUsed: 'gemini-nano-banana-2.1',
          });
        }
      }
    } catch {
      // Fall through to keyless fallback if image endpoint is busy or rejects prompt
    }
  }
  const seed = crypto.randomInt(1, 1_000_000_000);
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(
    finalPrompt
  )}?width=${size}&height=${size}&seed=${seed}&nologo=true`;
  return res.json({ url, prompt: rawPrompt, size, modelUsed: 'smfta-image-fallback' });
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
    /^(?:\[?(?:silence|inaudible|no\s*speech|empty|none)\]?)$/i.test(s)
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
    `Transcribe the spoken audio accurately verbatim in its original spoken language (${languageHint}, supporting Bengali, English, and mixed Banglish). ` +
    'Output ONLY the transcribed words with natural punctuation and no explanation or labels. If there is only silence or background noise, return an empty string.';

  const candidateModels = ['gemini-3.5-transcribe', 'gemini-3.5-flash-lite'];
  let lastError = 'Transcription failed';

  for (const model of candidateModels) {
    try {
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
