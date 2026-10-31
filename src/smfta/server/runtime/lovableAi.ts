/**
 * Built-in engine path for the keyless SMFTA models, served through the
 * Lovable AI Gateway (no user key). The old free third-party endpoint stays
 * as the fallback when this path is unavailable.
 */

const GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

const MODEL_MAP: Record<string, string> = {
  'smfta-flash': 'google/gemini-3-flash-preview',
  'smfta-pro': 'google/gemini-3.1-pro-preview',
  'smfta-ultra': 'google/gemini-4-argon',
};
const DEFAULT_MODEL = 'google/gemini-3-flash-preview';

export function resolveBuiltinGatewayModel(requested?: string | null): string {
  const key = String(requested || '').trim().toLowerCase();
  return MODEL_MAP[key] || DEFAULT_MODEL;
}

export function isLovableAiAvailable(): boolean {
  return Boolean((process.env.LOVABLE_API_KEY || '').trim());
}

function toGatewayRole(role: string): 'user' | 'assistant' {
  return role === 'assistant' || role === 'model' || role === 'ai' ? 'assistant' : 'user';
}

export async function streamFromLovableAi(params: {
  systemInstruction: string;
  history: Array<{ role: string; content: string }>;
  requestedModel?: string | null;
  signal: AbortSignal;
  emitDelta: (delta: string) => void;
  maxTokens?: number;
  temperature?: number;
}): Promise<{ ok: boolean; model: string; status?: number }> {
  const apiKey = (process.env.LOVABLE_API_KEY || '').trim();
  const model = resolveBuiltinGatewayModel(params.requestedModel);
  if (!apiKey) return { ok: false, model };

  const messages = [
    ...(params.systemInstruction
      ? [{ role: 'system' as const, content: params.systemInstruction }]
      : []),
    ...params.history
      .filter((m) => typeof m.content === 'string' && m.content.trim())
      .map((m) => ({ role: toGatewayRole(m.role), content: m.content })),
  ];

  let emitted = false;
  try {
    const res = await fetch(GATEWAY_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        ...(params.maxTokens ? { max_tokens: Math.min(params.maxTokens, 16384) } : {}),
        ...(typeof params.temperature === 'number' ? { temperature: params.temperature } : {}),
      }),
      signal: params.signal,
    });
    if (!res.ok || !res.body) {
      await res.text().catch(() => '');
      return { ok: false, model, status: res.status };
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finished = false;
    while (!finished) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        let line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        if (line.endsWith('\r')) line = line.slice(0, -1);
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') {
          finished = true;
          break;
        }
        try {
          const parsed = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            params.emitDelta(delta);
            emitted = true;
          }
        } catch {
          // partial JSON split across chunks: put it back and wait for more
          buffer = line + '\n' + buffer;
          break;
        }
      }
    }
    return { ok: emitted, model };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return { ok: emitted, model };
    return { ok: emitted, model };
  }
}
