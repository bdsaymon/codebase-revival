/**
 * Pure thinking/reasoning configuration, SSE chunk extraction, and Bengali timer formatting.
 * Never fabricates thinking traces for non-thinking models.
 */

export type ThinkingEffort = 'off' | 'low' | 'medium' | 'high';

const NON_THINKING_GEMINI_MODEL_RX = /^gemini-1\.5|^gemini-1\.0|^gemini-pro(?:-vision)?$/i;
const THINKING_GEMINI_MODEL_RX = /gemini-2\.5|gemini-3|thinking/i;
const THINKING_GENERIC_MODEL_RX =
  /gemini-2\.5|gemini-3|thinking|deepseek-r1|deepseek-reasoner|o1|o3|o4|claude-3-7|claude-3\.7|claude-sonnet-4|claude-opus-4|claude-4|qwq|qwen3/i;

export function supportsNativeThinking(provider?: string, modelId?: string): boolean {
  const prov = (provider || '').toLowerCase().trim();
  const model = (modelId || '').toLowerCase().trim();

  if (prov === 'xrahat' || prov === 'smfta_cloud' || prov === '') {
    // Built-in SMFTA models may route via Gemini/reasoning backends when enabled,
    // UNLESS explicitly named as a known non-thinking model.
    if (model && NON_THINKING_GEMINI_MODEL_RX.test(model)) return false;
    if (model && /^(?:gpt-4o|gpt-4-turbo|gpt-3\.5|llama-3\.1|llama3)/i.test(model)) {
      return false;
    }
    return true;
  }

  if (prov === 'gemini_custom' || prov === 'gemini_openai') {
    if (!model) return true;
    if (NON_THINKING_GEMINI_MODEL_RX.test(model)) return false;
    if (THINKING_GEMINI_MODEL_RX.test(model)) return true;
    // gemini-2.0-flash-lite / standard non-thinking 2.0 flash do not produce native thought summaries
    if (/gemini-2\.0-flash-thinking/i.test(model)) return true;
    if (/gemini-2\.0/i.test(model)) return false;
    return false;
  }

  if (!model) return false;
  return THINKING_GENERIC_MODEL_RX.test(model);
}

export interface GeminiThinkingConfig {
  includeThoughts: boolean;
  thinkingBudget?: number;
  thinkingLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
}

export function buildGeminiThinkingConfig(
  modelId: string,
  effort: ThinkingEffort | undefined,
  enabled = true
): GeminiThinkingConfig | undefined {
  if (!enabled || effort === 'off') return undefined;
  const lower = (modelId || '').toLowerCase().trim();
  if (lower && NON_THINKING_GEMINI_MODEL_RX.test(lower)) return undefined;

  // For Gemini 2.0 Flash non-thinking or 1.x models, do not force thinkingConfig
  if (lower.includes('gemini-2.0') && !lower.includes('thinking')) {
    return undefined;
  }

  const level: 'low' | 'medium' | 'high' =
    effort === 'low' || effort === 'high' ? effort : 'medium';

  // Gemini 3.x uses thinkingLevel; Gemini 2.5 uses numeric thinkingBudget
  if (/gemini-3|v2-pro|smfta-max|smfta-v5/i.test(lower)) {
    const levelMap: Record<'low' | 'medium' | 'high', 'LOW' | 'MEDIUM' | 'HIGH'> = {
      low: 'LOW',
      medium: 'MEDIUM',
      high: 'HIGH',
    };
    return {
      includeThoughts: true,
      thinkingLevel: levelMap[level],
    };
  }

  const budgetMap: Record<'low' | 'medium' | 'high', number> = {
    low: 1024,
    medium: 4096,
    high: 12288,
  };
  return {
    includeThoughts: true,
    thinkingBudget: budgetMap[level],
  };
}

export interface ExtractedSseEvents {
  thinking?: string;
  text?: string;
  status?: string;
  error?: string;
  done?: boolean;
}

/**
 * Parses a single `data: ...` JSON payload from Gemini native, OpenAI-compatible,
 * DeepSeek, Anthropic, or SMFTA internal SSE streams without discarding thinking chunks.
 */
export function extractSseEventsFromLine(dataStr: string): ExtractedSseEvents {
  const trimmed = (dataStr || '').trim();
  if (!trimmed) return {};
  if (trimmed === '[DONE]') return { done: true };

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return {};
  }

  if (parsed.error && typeof parsed.error === 'object') {
    const errObj = parsed.error as Record<string, unknown>;
    return { error: String(errObj.message || errObj.code || 'Upstream error') };
  }
  if (typeof parsed.error === 'string' && parsed.error) {
    return { error: parsed.error };
  }

  // Native SMFTA typed SSE events
  if (parsed.type === 'thinking' && typeof parsed.thinking === 'string') {
    return { thinking: parsed.thinking };
  }
  if (parsed.type === 'status' && typeof parsed.status === 'string') {
    return { status: parsed.status };
  }
  if (parsed.type === 'text' && (typeof parsed.text === 'string' || typeof parsed.delta === 'string')) {
    return { text: String(parsed.text ?? parsed.delta ?? '') };
  }
  if (parsed.type === 'done') {
    return { done: true };
  }

  let thinking = '';
  let text = '';

  // Gemini native candidates array: separate thought:true parts vs answer parts
  const candidates = parsed.candidates as Array<Record<string, unknown>> | undefined;
  const firstCandidate = Array.isArray(candidates) ? candidates[0] : undefined;
  const content = firstCandidate?.content as Record<string, unknown> | undefined;
  const parts = Array.isArray(content?.parts)
    ? (content!.parts as Array<Record<string, unknown>>)
    : undefined;
  if (parts) {
    for (const part of parts) {
      const partText = typeof part.text === 'string' ? part.text : '';
      if (!partText) continue;
      if (part.thought === true) {
        thinking += partText;
      } else {
        text += partText;
      }
    }
    if (thinking || text) {
      return {
        ...(thinking ? { thinking } : {}),
        ...(text ? { text } : {}),
      };
    }
  }

  // OpenAI / OpenRouter / DeepSeek / Groq choices format
  const choices = parsed.choices as Array<Record<string, unknown>> | undefined;
  const choice0 = Array.isArray(choices) ? choices[0] : undefined;
  const delta = choice0?.delta as Record<string, unknown> | undefined;
  if (delta) {
    const r =
      typeof delta.reasoning_content === 'string'
        ? delta.reasoning_content
        : typeof delta.reasoning === 'string'
        ? delta.reasoning
        : '';
    const c = typeof delta.content === 'string' ? delta.content : '';
    if (r || c) {
      return {
        ...(r ? { thinking: r } : {}),
        ...(c ? { text: c } : {}),
      };
    }
  }

  // Anthropic SSE delta format
  const anthropicDelta = parsed.delta as Record<string, unknown> | undefined;
  if (anthropicDelta) {
    if (anthropicDelta.type === 'thinking_delta' && typeof anthropicDelta.thinking === 'string') {
      return { thinking: anthropicDelta.thinking };
    }
    if (anthropicDelta.type === 'text_delta' && typeof anthropicDelta.text === 'string') {
      return { text: anthropicDelta.text };
    }
    if (typeof anthropicDelta.text === 'string') {
      return { text: anthropicDelta.text };
    }
  }

  if (typeof parsed.delta === 'string') {
    return { text: parsed.delta };
  }
  if (typeof parsed.content === 'string') {
    return { text: parsed.content };
  }
  if (typeof parsed.text === 'string') {
    return { text: parsed.text };
  }

  return {};
}

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'] as const;

export function formatBengaliNumber(value: number): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  return String(safe)
    .split('')
    .map((ch) => (ch >= '0' && ch <= '9' ? BN_DIGITS[Number(ch)] : ch))
    .join('');
}

export function formatThinkingTimerLabel(seconds: number, completed: boolean): string {
  const sec = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  if (!completed) {
    return sec > 0 ? `${formatBengaliNumber(sec)} সেকেন্ড ভাবছি` : 'ভাবছি…';
  }
  const finalSec = Math.max(1, sec);
  return `${formatBengaliNumber(finalSec)} সেকেন্ড ভেবেছি`;
}
