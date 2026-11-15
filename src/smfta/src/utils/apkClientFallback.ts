import { ExternalProviderId } from '../types';
import {
  DEFAULT_PROVIDER_MODELS,
  isKeylessProviderId,
} from './providers';
import { canonicalizeProviderEndpoint } from './providerProtocol';
import { sanitizeProprietaryOutput } from './helpers';
import { FILE_ARTIFACT_SYSTEM_DIRECTIVE } from './fileArtifacts';
import {
  buildCreatorAndSecurityDirective,
  resolveActiveSystemLabel,
} from './creatorIdentity';

export function isStandaloneApkEnv(): boolean {
  if (typeof window === 'undefined') return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((window as any).SMFTAApkBridge) return true;
  const proto = window.location?.protocol || '';
  const host = window.location?.hostname || '';
  return (
    proto === 'file:' ||
    host === 'appassets.androidplatform.net'
  );
}

function parseApiKeyPool(rawKeys?: string): string[] {
  return (rawKeys || '')
    .split(/[\n,;]+/)
    .map((k) => k.trim())
    .filter(Boolean);
}

function firstApiKey(rawKeys?: string): string {
  return parseApiKeyPool(rawKeys)[0] || '';
}

async function consumeOpenAISseStream(
  res: Response,
  onDelta?: (delta: string) => void
): Promise<string> {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json') || !res.body) {
    const data = await res.json().catch(() => null);
    const text =
      data?.choices?.[0]?.message?.content?.trim() ||
      data?.content?.[0]?.text?.trim() ||
      (typeof data === 'string' ? data.trim() : '');
    if (text) {
      const clean = sanitizeProprietaryOutput(text);
      onDelta?.(clean);
      return clean;
    }
    return '';
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      buf += dec.decode();
      break;
    }
    buf += dec.decode(value, { stream: true });
    const lines = buf.split(/\r?\n/);
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const raw = trimmed.slice(5).trim();
      if (!raw || raw === '[DONE]') continue;
      try {
        const j = JSON.parse(raw);
        const delta =
          j.choices?.[0]?.delta?.content ??
          j.choices?.[0]?.delta?.reasoning_content ??
          j.choices?.[0]?.message?.content ??
          j.delta?.text ??
          j.delta ??
          '';
        if (typeof delta === 'string' && delta) {
          const clean = sanitizeProprietaryOutput(delta);
          if (clean) {
            fullText += clean;
            onDelta?.(clean);
          }
        }
      } catch {
        // Ignore malformed SSE comment
      }
    }
  }

  if (buf.trim()) {
    for (const line of buf.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const raw = trimmed.slice(5).trim();
      if (!raw || raw === '[DONE]') continue;
      try {
        const j = JSON.parse(raw);
        const delta =
          j.choices?.[0]?.delta?.content ??
          j.choices?.[0]?.delta?.reasoning_content ??
          j.choices?.[0]?.message?.content ??
          j.delta?.text ??
          j.delta ??
          '';
        if (typeof delta === 'string' && delta) {
          const clean = sanitizeProprietaryOutput(delta);
          if (clean) {
            fullText += clean;
            onDelta?.(clean);
          }
        }
      } catch {
        // Ignore malformed SSE comment
      }
    }
  }

  return sanitizeProprietaryOutput(fullText);
}

export async function runStandaloneClientSideAI(params: {
  provider: ExternalProviderId;
  externalKeys?: string;
  externalModel?: string;
  externalBaseUrl?: string;
  mode?: 'fast' | 'balanced' | 'power';
  messages: Array<{
    role: 'user' | 'ai';
    text: string;
    imgs?: Array<{ mime: string; data: string }>;
  }>;
  systemPrompt?: string;
  signal?: AbortSignal;
  onDelta?: (delta: string) => void;
}): Promise<string> {
  const provider = params.provider || 'xrahat';
  const keyPool = parseApiKeyPool(params.externalKeys);
  const apiKey = keyPool[0] || '';
  const model =
    (params.externalModel || '').trim() ||
    DEFAULT_PROVIDER_MODELS[provider] ||
    'gpt-4o-mini';
  const modeRule =
    params.mode === 'power'
      ? 'ACTIVE MODE — SMFTA ULTRA (গভীর বিশ্লেষণ ও বিশেষ বিচার): Examine the user request specially and deeply from every angle. Provide a thorough, comprehensive, expert-level breakdown with structured headings, step-by-step reasoning, and complete examples. '
      : params.mode === 'fast'
      ? 'ACTIVE MODE — SMFTA FAST (দ্রুত ও সরাসরি উত্তর): Deliver a fast, direct, concise, and immediately useful answer without long introductions or filler. '
      : 'ACTIVE MODE — SMFTA PRO (স্মার্ট ও ভারসাম্যপূর্ণ): Deliver a clear, well-structured, balanced response. ';
  const webBoundaryRule =
    'WEB BROWSING & LIVE LINK VISITATION BOUNDARY: You do NOT have live web browsing, real-time URL inspection, or live internet scraping abilities. When a user asks you to check a live URL or browse external websites, politely and honestly explain that you cannot access live web pages or browse the internet, and provide guidance strictly based on the context, code, or details provided inside the conversation. ';
  const activeSystemName = resolveActiveSystemLabel({
    externalModel: params.externalModel,
    mode: params.mode,
  });
  const sysInstruction =
    params.systemPrompt ||
    `You are ${activeSystemName}, an intelligent, fast bilingual AI assistant. Reply naturally, clearly, and completely in the same language as the user (Bengali or English) once without duplicate translations. ${modeRule}${webBoundaryRule}\n\n${buildCreatorAndSecurityDirective(activeSystemName)}\n\n${FILE_ARTIFACT_SYSTEM_DIRECTIVE}\n\nWhenever the user asks you to update yourself, change your theme ("dark"|"light"), accent color ("indigo"|"emerald"|"rose"|"amber"|"sky"), font size ("small"|"normal"|"large"), mode ("fast"|"balanced"|"power"), style ("concise"|"detailed"), replyLang ("auto"|"bn"|"en"), customCss, customInst, or add/create a live widget/tool inside yourself, reply helpfully AND append a valid JSON block at the very end wrapped in ⟦SELF_UPDATE⟧{"theme":"dark","accent":"emerald","fontsize":"large","mode":"power","customCss":"...","widget":{"title":"Tool Name","description":"Short desc","code":"<!DOCTYPE html>...complete interactive HTML/CSS/JS..."},"summary":"What you updated"}⟦/SELF_UPDATE⟧ (include only keys being changed). When the user shares a personal fact, append ⟦MEMORY: concise fact⟧ at the end.`;

  // 1. Keyless Default Unlimited Profile (Fast Real-Time SSE Streaming)
  if (
    (provider === 'xrahat' || provider === 'smfta_cloud') &&
    !apiKey
  ) {
    const recentMsgs = params.messages.slice(-10).map((m) => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.text || 'Hello',
    }));

    try {
      const fastCtrl = new AbortController();
      const timer = window.setTimeout(() => fastCtrl.abort(), 5500);
      const onAbort = () => fastCtrl.abort();
      params.signal?.addEventListener('abort', onAbort, { once: true });

      try {
        const res = await fetch('https://text.pollinations.ai/openai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'openai-fast',
            messages: [
              { role: 'system', content: sysInstruction },
              ...recentMsgs,
            ],
            stream: Boolean(params.onDelta),
          }),
          signal: fastCtrl.signal,
        });
        window.clearTimeout(timer);
        if (res.ok) {
          const text = await consumeOpenAISseStream(res, params.onDelta);
          if (text.trim()) return text.trim();
        }
      } finally {
        window.clearTimeout(timer);
        params.signal?.removeEventListener('abort', onAbort);
      }
    } catch {
      if (params.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
    }

    const lastUser =
      [...recentMsgs].reverse().find((m) => m.role === 'user')?.content ||
      'Hello';
    const query = new URLSearchParams({
      text: `${sysInstruction}\n\nUser: ${lastUser.slice(0, 2000)}`,
      uid: 'smfta-apk',
      stream: params.onDelta ? '1' : '0',
    });
    const backupRes = await fetch(
      `https://xrahat-worm-ai.vercel.app/api/chat?${query.toString()}`,
      { signal: params.signal }
    );
    if (!backupRes.ok) {
      throw new Error(`HTTP ${backupRes.status}`);
    }
    if (params.onDelta && backupRes.body) {
      const text = await consumeOpenAISseStream(backupRes, params.onDelta);
      if (text.trim()) return text.trim();
    }
    const backupJson = await backupRes.json().catch(() => null);
    const backupText = sanitizeProprietaryOutput(
      String(backupJson?.reply || backupJson?.text || '').trim()
    );
    if (!backupText) {
      throw new Error('Empty response from keyless engine');
    }
    params.onDelta?.(backupText);
    return backupText;
  }

  // Canonical endpoint resolution shared with web server (P1-02)
  const canonical = canonicalizeProviderEndpoint(provider, params.externalBaseUrl, {
    respectCustomBaseUrl: true,
  });

  if (provider === 'cloudflare' && canonical.diagnostic) {
    throw new Error(canonical.diagnostic);
  }

  // 2. Google Gemini Native API
  if (canonical.protocol === 'gemini_native' || /^AIza/i.test(apiKey)) {
    if (keyPool.length === 0) {
      throw new Error('Gemini API key is missing. Add your key in AI Providers.');
    }
    const geminiModel =
      model.startsWith('gemini-') ? model : 'gemini-3.8-flash';

    let lastGemError: Error | null = null;
    for (const candidateKey of keyPool) {
      const url = `${canonical.chatUrl}/models/${encodeURIComponent(
        geminiModel
      )}:generateContent?key=${encodeURIComponent(candidateKey)}`;

      const contents = params.messages.slice(-16).map((m) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const parts: any[] = [];
        if (m.text) parts.push({ text: m.text });
        if (m.imgs && m.imgs.length > 0) {
          for (const im of m.imgs) {
            parts.push({
              inlineData: {
                mimeType: im.mime || 'image/jpeg',
                data: im.data,
              },
            });
          }
        }
        if (parts.length === 0) parts.push({ text: 'Hello' });
        return {
          role: m.role === 'user' ? 'user' : 'model',
          parts,
        };
      });

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: sysInstruction }] },
          contents,
        }),
        signal: params.signal,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        lastGemError = new Error(
          data?.error?.message || `Gemini HTTP ${res.status}`
        );
        if (res.status === 401 || res.status === 403 || res.status === 429) {
          continue;
        }
        throw lastGemError;
      }
      const parts = data?.candidates?.[0]?.content?.parts;
      const text = Array.isArray(parts)
        ? parts
            .map((p: { text?: string }) => p?.text || '')
            .join('')
            .trim()
        : '';
      if (!text) {
        throw new Error('Empty response from Gemini API');
      }
      params.onDelta?.(text);
      return text;
    }
    throw lastGemError || new Error('Gemini API request failed');
  }

  // 3. Anthropic Native API (/v1/messages) (P1-02 & P1-30)
  if (canonical.protocol === 'anthropic_native') {
    if (keyPool.length === 0) {
      throw new Error('Anthropic API key is missing.');
    }
    let lastAnthError: Error | null = null;
    for (const candidateKey of keyPool) {
      const res = await fetch(canonical.chatUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': candidateKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 16384,
          system: sysInstruction,
          messages: params.messages.slice(-16).map((m) => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.text || 'Hello',
          })),
          stream: Boolean(params.onDelta),
        }),
        signal: params.signal,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        lastAnthError = new Error(
          data?.error?.message || `Anthropic HTTP ${res.status}`
        );
        if (res.status === 401 || res.status === 403 || res.status === 429) {
          continue;
        }
        throw lastAnthError;
      }
      const text = await consumeOpenAISseStream(res, params.onDelta);
      if (!text.trim()) {
        throw new Error('Empty response from Anthropic API');
      }
      return text.trim();
    }
    throw lastAnthError || new Error('Anthropic API request failed');
  }

  // 4. OpenAI-Compatible Providers with multi-key rotation (P1-02 & P1-30)
  if (!isKeylessProviderId(provider) && keyPool.length === 0) {
    throw new Error('API key is missing for the selected provider.');
  }

  const candidateKeys = keyPool.length > 0 ? keyPool : ['keyless'];
  let lastOpenAIError: Error | null = null;

  for (const candidateKey of candidateKeys) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (candidateKey && candidateKey !== 'keyless') {
      headers['Authorization'] = `Bearer ${candidateKey}`;
    }

    const res = await fetch(canonical.chatUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        ...( /mercury/i.test(model) ? { reasoning_effort: 'low' } : {} ),
        messages: [
          { role: 'system', content: sysInstruction },
          ...params.messages.slice(-16).map((m) => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.text || 'Hello',
          })),
        ],
        stream: Boolean(params.onDelta),
      }),
      signal: params.signal,
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      const errMsg =
        data?.error?.message ||
        data?.message ||
        `Provider HTTP ${res.status}`;
      const openAiErr = new Error(
        `HTTP ${res.status}: ${errMsg}`
      ) as Error & { code?: string; status?: number };
      openAiErr.status = res.status;
      if (res.status === 401 || res.status === 403) {
        openAiErr.code = 'AUTH_INVALID';
      } else if (res.status === 404) {
        openAiErr.code = 'MODEL_UNAVAILABLE';
      }
      lastOpenAIError = openAiErr;
      if (
        (res.status === 401 || res.status === 403 || res.status === 429) &&
        candidateKeys.length > 1
      ) {
        continue;
      }
      throw lastOpenAIError;
    }

    const text = await consumeOpenAISseStream(res, params.onDelta);
    if (!text.trim()) {
      throw new Error('Empty response from provider');
    }
    return text.trim();
  }

  throw lastOpenAIError || new Error('Provider request failed');
}

export async function testProviderClientSide(params: {
  provider: ExternalProviderId;
  externalKeys?: string;
  externalModel?: string;
  externalBaseUrl?: string;
}): Promise<{
  ok: boolean;
  message: string;
  workingModel?: string;
  normalizedEndpoint?: string;
}> {
  const workingModel =
    (params.externalModel || '').trim() ||
    DEFAULT_PROVIDER_MODELS[params.provider] ||
    'gpt-4o-mini';
  const canonical = canonicalizeProviderEndpoint(
    params.provider,
    params.externalBaseUrl,
    { respectCustomBaseUrl: true }
  );
  try {
    await runStandaloneClientSideAI({
      provider: params.provider,
      externalKeys: params.externalKeys,
      externalModel: workingModel,
      externalBaseUrl: params.externalBaseUrl,
      messages: [{ role: 'user', text: 'Ping. Reply with OK.' }],
      systemPrompt: 'Reply with OK.',
    });
    return {
      ok: true,
      workingModel,
      normalizedEndpoint: canonical.chatUrl,
      message: `Connected (${workingModel})`,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      normalizedEndpoint: canonical.chatUrl,
      message: err instanceof Error ? err.message : 'Verification failed',
    };
  }
}

export async function fetchProviderModelsClientSide(params: {
  provider: ExternalProviderId;
  externalKeys?: string;
  externalBaseUrl?: string;
}): Promise<string[]> {
  const apiKey = firstApiKey(params.externalKeys);
  if (params.provider === 'gemini_custom' || /^AIza/i.test(apiKey)) {
    if (!apiKey) return [];
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(
        apiKey
      )}`
    ).catch(() => null);
    if (!res || !res.ok) return [];
    const data = await res.json().catch(() => null);
    if (!Array.isArray(data?.models)) return [];
    return data.models
      .map((m: { name?: string }) => String(m?.name || '').replace(/^models\//, ''))
      .filter((name: string) => /^gemini/i.test(name));
  }

  const canonical = canonicalizeProviderEndpoint(
    params.provider,
    params.externalBaseUrl,
    { respectCustomBaseUrl: true }
  );
  if (!canonical.modelsUrl) return [];
  const headers: Record<string, string> = {};
  if (apiKey && apiKey !== 'keyless' && apiKey !== 'nokey') {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }
  const res = await fetch(canonical.modelsUrl, { headers }).catch(() => null);
  if (!res || !res.ok) return [];
  const data = await res.json().catch(() => null);
  if (!Array.isArray(data?.data)) return [];
  return data.data
    .map((m: { id?: string }) => String(m?.id || '').trim())
    .filter(Boolean);
}
