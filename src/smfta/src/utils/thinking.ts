import { ThinkingEffortLevel } from '../types';

export type GeminiModelThinkingStyle = 'gemini25_budget' | 'gemini3_level' | 'none';

export function detectGeminiThinkingStyle(modelId: string): GeminiModelThinkingStyle {
  const m = String(modelId || '').toLowerCase().trim();
  if (!m) return 'none';
  if (/gemini-3/i.test(m)) {
    return 'gemini3_level';
  }
  if (
    /gemini-2\.5|smfta-flash|smfta-pro|smfta-ultra|smfta-v5|smfta-v2-pro|smfta-max/i.test(
      m
    )
  ) {
    return 'gemini25_budget';
  }
  return 'none';
}

export function isThinkingCapableModel(modelId: string): boolean {
  const m = String(modelId || '').toLowerCase().trim();
  if (!m) return false;
  if (detectGeminiThinkingStyle(m) !== 'none') return true;
  return /deepseek-r1|deepseek-reasoner|deepseek-v4|qwen3|qwq|o1|o3|o4|gpt-oss|gpt-5|claude-3-7|claude-sonnet-4|claude-opus-4|claude-sonnet-5|claude-opus-4\.8|mercury|reasoning|think/i.test(
    m
  );
}

export function supportsNativeThinking(
  providerId: string | undefined,
  modelId: string | undefined
): boolean {
  const m = String(modelId || '').toLowerCase().trim();
  const p = String(providerId || '').toLowerCase().trim();
  if (m && isThinkingCapableModel(m)) return true;
  if (
    (p === 'gemini' ||
      p === 'gemini_custom' ||
      p === 'gemini_openai' ||
      p === 'gemini_server' ||
      p === 'firebase_v2') &&
    (!m || /gemini-2\.5|gemini-3|smfta-/i.test(m))
  ) {
    return true;
  }
  if (p === 'smfta_cloud' || p === 'xrahat') return true;
  return false;
}

export function resolveGeminiThinkingBudget(
  effort: ThinkingEffortLevel | undefined,
  thinkingEnabled = true
): number {
  if (!thinkingEnabled || effort === 'off') return 0;
  if (effort === 'low') return 1024;
  if (effort === 'medium') return 4096;
  if (effort === 'high') return 12288;
  return -1;
}

export function resolveGemini3ThinkingLevel(
  effort: ThinkingEffortLevel | undefined,
  thinkingEnabled = true
): 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH' | null {
  if (!thinkingEnabled || effort === 'off') return 'MINIMAL';
  if (effort === 'low') return 'LOW';
  if (effort === 'high') return 'HIGH';
  return 'MEDIUM';
}

export function buildGeminiThinkingConfig(
  modelOrParams:
    | string
    | {
        modelId: string;
        thinkingEnabled?: boolean;
        thinkingMode?: ThinkingEffortLevel;
      },
  effortArg?: ThinkingEffortLevel,
  thinkingEnabledArg?: boolean
): Record<string, unknown> | undefined {
  const modelId =
    typeof modelOrParams === 'string' ? modelOrParams : modelOrParams.modelId;
  const thinkingMode =
    typeof modelOrParams === 'string'
      ? effortArg ?? 'auto'
      : modelOrParams.thinkingMode ?? 'auto';
  const thinkingEnabled =
    typeof modelOrParams === 'string'
      ? thinkingEnabledArg ?? true
      : modelOrParams.thinkingEnabled ?? true;

  const style = detectGeminiThinkingStyle(modelId);
  if (style === 'none') {
    return undefined;
  }

  const enabled = thinkingEnabled !== false && thinkingMode !== 'off';
  if (!enabled) {
    return undefined;
  }

  if (style === 'gemini25_budget') {
    return {
      thinkingBudget: resolveGeminiThinkingBudget(thinkingMode, true),
      includeThoughts: true,
    };
  }

  const level = resolveGemini3ThinkingLevel(thinkingMode, true);
  return {
    ...(level ? { thinkingLevel: level } : {}),
    includeThoughts: true,
  };
}

export function extractSseEventsFromLine(rawPayload: string): {
  thinking: string;
  text: string;
} {
  const payload = String(rawPayload || '').trim();
  if (!payload || payload === '[DONE]') {
    return { thinking: '', text: '' };
  }
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    let thinking = '';
    let text = '';

    // 1. Gemini candidates[0].content.parts (check part.thought === true)
    const candidates = parsed.candidates as
      | Array<{
          content?: {
            parts?: Array<{ text?: string; thought?: boolean }>;
          };
        }>
      | undefined;
    if (Array.isArray(candidates) && candidates.length > 0) {
      const parts = candidates[0]?.content?.parts;
      if (Array.isArray(parts)) {
        for (const p of parts) {
          if (typeof p?.text === 'string' && p.text) {
            if (p.thought === true) {
              thinking += p.text;
            } else {
              text += p.text;
            }
          }
        }
        return { thinking, text };
      }
    }

    // 2. OpenAI / DeepSeek / OpenRouter / Lovable Gateway choices[0].delta
    const choices = parsed.choices as
      | Array<{
          delta?: {
            content?: string;
            reasoning_content?: string;
            reasoning?: string;
            thinking?: string;
          };
          message?: {
            content?: string;
            reasoning_content?: string;
          };
        }>
      | undefined;
    if (Array.isArray(choices) && choices.length > 0) {
      const delta = choices[0]?.delta;
      if (delta) {
        const r =
          delta.reasoning_content || delta.reasoning || delta.thinking || '';
        if (typeof r === 'string' && r) thinking += r;
        if (typeof delta.content === 'string' && delta.content) {
          text += delta.content;
        }
        return { thinking, text };
      }
    }

    // 3. Anthropic content_block_delta (thinking_delta vs text_delta)
    if (parsed.type === 'content_block_delta' && parsed.delta) {
      const d = parsed.delta as {
        type?: string;
        thinking?: string;
        text?: string;
      };
      if (d.type === 'thinking_delta' && typeof d.thinking === 'string') {
        thinking += d.thinking;
      } else if (typeof d.text === 'string') {
        text += d.text;
      }
      return { thinking, text };
    }

    // 4. Generic top-level { thinking, text, delta }
    if (typeof parsed.thinking === 'string') thinking += parsed.thinking;
    if (typeof parsed.text === 'string') text += parsed.text;
    else if (typeof parsed.delta === 'string') text += parsed.delta;

    return { thinking, text };
  } catch {
    return { thinking: '', text: '' };
  }
}

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

export function toBengaliDigits(num: number): string {
  const safe = Math.max(0, Math.round(Number(num) || 0));
  return String(safe).replace(/\d/g, (d) => BN_DIGITS[Number(d)] || d);
}

export const formatBengaliNumber = toBengaliDigits;

export function formatThinkingTimerLabel(
  elapsedSec: number,
  isCompleted = false
): string {
  const safeSec = Math.max(0, Math.round(Number(elapsedSec) || 0));
  if (!isCompleted) {
    if (safeSec <= 0) return 'ভাবছি…';
    return `${toBengaliDigits(safeSec)} সেকেন্ড ভাবছি`;
  }
  const finalSec = Math.max(1, safeSec);
  return `${toBengaliDigits(finalSec)} সেকেন্ড ভেবেছি`;
}

export type RealToolStatusKind = 'memory' | 'web_search' | 'file_read';

export function formatRealStatusLabel(kind: RealToolStatusKind): string {
  switch (kind) {
    case 'memory':
      return 'মেমোরি দেখছি';
    case 'web_search':
      return 'ওয়েবে খুঁজছি';
    case 'file_read':
      return 'ফাইল পড়ছি';
  }
}

export function resolveActiveStatusEvents(params: {
  hasMemoryToCheck: boolean;
  webSearchActive: boolean;
  hasAttachedFiles: boolean;
}): string[] {
  const statuses: string[] = [];
  if (params.hasMemoryToCheck) {
    statuses.push(formatRealStatusLabel('memory'));
  }
  if (params.hasAttachedFiles) {
    statuses.push(formatRealStatusLabel('file_read'));
  }
  if (params.webSearchActive) {
    statuses.push(formatRealStatusLabel('web_search'));
  }
  return statuses;
}
