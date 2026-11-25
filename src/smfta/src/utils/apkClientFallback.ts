import { ExternalProviderId } from '../types';
import {
  DEFAULT_PROVIDER_MODELS,
  detectProviderFromKey,
  isKeylessProviderId,
  resolveGroqModel,
} from './providers';
import { canonicalizeProviderEndpoint } from './providerProtocol';
import { sanitizeProprietaryOutput } from './helpers';
import { FILE_ARTIFACT_SYSTEM_DIRECTIVE } from './fileArtifacts';
import {
  buildCreatorAndSecurityDirective,
  resolveActiveSystemLabel,
} from './creatorIdentity';

const POLLINATIONS_OPENAI_ENDPOINT = 'https://text.pollinations.ai/openai';
const POLLINATIONS_TEXT_ENDPOINT = 'https://text.pollinations.ai/';

export function isStandaloneApkEnv(): boolean {
  if (typeof window === 'undefined') return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((window as any).SMFTAApkBridge) return true;
  const proto = window.location?.protocol || '';
  const host = window.location?.hostname || '';
  return proto === 'file:' || host === 'appassets.androidplatform.net';
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

function normalizeGeminiDirectModel(requestedModel?: string): string {
  const clean = (requestedModel || '').trim();
  const lower = clean.toLowerCase();
  if (!clean || lower.startsWith('smfta-') || !lower.startsWith('gemini')) {
    return 'gemini-2.5-flash';
  }
  if (lower.includes('hydrogen') || lower.includes('neon') || lower.includes('carbon')) {
    return 'gemini-2.5-flash';
  }
  return clean;
}

async function consumeOpenAISseStream(
  res: Response,
  onDelta?: (delta: string) => void
): Promise<string> {
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('text/html')) {
    return '';
  }
  if (contentType.includes('text/plain')) {
    const rawTxt = await res.text().catch(() => '');
    if (rawTxt.trim() && !/^\s*<(?:!doctype|html)/i.test(rawTxt)) {
      const clean = sanitizeProprietaryOutput(rawTxt.trim());
      onDelta?.(clean);
      return clean;
    }
    return '';
  }
  if (contentType.includes('application/json') || !res.body) {
    const data = await res.json().catch(() => null);
    const text =
      data?.choices?.[0]?.message?.content?.trim() ||
      data?.content?.[0]?.text?.trim() ||
      (typeof data?.reply === 'string' ? data.reply.trim() : '') ||
      (typeof data?.response === 'string' ? data.response.trim() : '') ||
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

  const handleLine = (rawLine: string) => {
    const trimmed = rawLine.trim();
    if (!trimmed.startsWith('data:')) return;
    const raw = trimmed.slice(5).trim();
    if (!raw || raw === '[DONE]') return;
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
  };

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
      handleLine(line);
    }
  }

  if (buf.trim()) {
    for (const line of buf.split(/\r?\n/)) {
      handleLine(line);
    }
  }

  return sanitizeProprietaryOutput(fullText);
}

async function consumeGeminiSseStream(
  res: Response,
  onDelta?: (delta: string) => void
): Promise<string> {
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('text/html')) return '';
  if (contentType.includes('application/json') || !res.body) {
    const data = await res.json().catch(() => null);
    const parts = data?.candidates?.[0]?.content?.parts;
    const text = Array.isArray(parts)
      ? parts
          .map((p: { text?: string }) => p?.text || '')
          .join('')
          .trim()
      : '';
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

  const extractParts = (rawJson: string) => {
    try {
      const parsed = JSON.parse(rawJson);
      const parts = parsed?.candidates?.[0]?.content?.parts;
      if (Array.isArray(parts)) {
        for (const p of parts) {
          if (typeof p?.text === 'string' && p.text) {
            const clean = sanitizeProprietaryOutput(p.text);
            if (clean) {
              fullText += clean;
              onDelta?.(clean);
            }
          }
        }
      }
    } catch {
      // Ignore partial chunk
    }
  };

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
      extractParts(raw);
    }
  }

  if (buf.trim()) {
    for (const line of buf.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const raw = trimmed.slice(5).trim();
      if (!raw || raw === '[DONE]') continue;
      extractParts(raw);
    }
  }

  return sanitizeProprietaryOutput(fullText);
}

async function runPublicKeylessFallback(params: {
  messages: Array<{ role: 'user' | 'ai'; text: string }>;
  systemPrompt: string;
  signal?: AbortSignal;
  onDelta?: (delta: string) => void;
}): Promise<string> {
  const cleanMsgs = params.messages
    .filter((m) => (m.text || '').trim())
    .slice(-10)
    .map((m) => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.text.trim(),
    }));
  const postPayload = {
    model: 'openai',
    messages: [
      ...(params.systemPrompt.trim()
        ? [{ role: 'system', content: params.systemPrompt.trim().slice(0, 1200) }]
        : []),
      ...(cleanMsgs.length > 0 ? cleanMsgs : [{ role: 'user', content: 'Hello' }]),
    ],
    stream: Boolean(params.onDelta),
  };

  const postRes = await fetch(POLLINATIONS_OPENAI_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: params.onDelta
        ? 'text/event-stream, application/json'
        : 'application/json',
    },
    body: JSON.stringify(postPayload),
    signal: params.signal,
  }).catch(() => null);

  if (postRes && postRes.ok) {
    const streamedText = await consumeOpenAISseStream(postRes, params.onDelta);
    if (streamedText.trim()) {
      return streamedText.trim();
    }
  }

  const lastPrompt =
    cleanMsgs.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n') ||
    'Hello';
  const getUrl = `${POLLINATIONS_TEXT_ENDPOINT}${encodeURIComponent(
    lastPrompt.slice(0, 1500)
  )}?model=openai`;
  const getRes = await fetch(getUrl, {
    method: 'GET',
    headers: { Accept: 'text/plain, application/json' },
    signal: params.signal,
  }).catch(() => null);

  if (getRes && getRes.ok) {
    const ct = (getRes.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('application/json')) {
      const json = await getRes.json().catch(() => null);
      const txt =
        json?.choices?.[0]?.message?.content?.trim() ||
        json?.reply?.trim() ||
        json?.response?.trim() ||
        '';
      if (txt) {
        const clean = sanitizeProprietaryOutput(txt);
        params.onDelta?.(clean);
        return clean;
      }
    } else {
      const txt = await getRes.text().catch(() => '');
      if (txt.trim() && !/^\s*<(?:!doctype|html)/i.test(txt)) {
        const clean = sanitizeProprietaryOutput(txt.trim());
        params.onDelta?.(clean);
        return clean;
      }
    }
  }

  throw new Error(
    'Public keyless fallback could not reach upstream AI gateway. Please configure an API key (Groq or Gemini) in Settings > Providers.'
  );
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
  const keyPool = parseApiKeyPool(params.externalKeys);
  const apiKey = keyPool[0] || '';
  const detectedFromKey = apiKey ? detectProviderFromKey(apiKey) : null;

  let provider: ExternalProviderId = params.provider || 'xrahat';
  if (
    detectedFromKey === 'groq' &&
    provider !== 'ollama' &&
    provider !== 'lmstudio'
  ) {
    provider = 'groq';
  } else if (
    detectedFromKey === 'gemini_custom' &&
    provider !== 'ollama' &&
    provider !== 'lmstudio' &&
    provider !== 'gemini_openai'
  ) {
    provider = 'gemini_custom';
  } else if (
    detectedFromKey &&
    (provider === 'xrahat' || provider === 'smfta_cloud' || (provider === 'custom' && !params.externalBaseUrl?.trim()))
  ) {
    provider = detectedFromKey;
  }

  const rawRequestedModel = (params.externalModel || '').trim();
  const model =
    provider === 'groq'
      ? resolveGroqModel(rawRequestedModel)
      : rawRequestedModel || DEFAULT_PROVIDER_MODELS[provider] || 'gpt-4o-mini';

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

  // 1. Keyless public fallback when built-in provider is active or no API key is present
  if (
    (provider === 'xrahat' || provider === 'smfta_cloud' || provider === 'gemini_custom') &&
    !apiKey
  ) {
    return runPublicKeylessFallback({
      messages: params.messages,
      systemPrompt: sysInstruction,
      signal: params.signal,
      onDelta: params.onDelta,
    });
  }

  // Canonical endpoint resolution shared with web server
  const canonical = canonicalizeProviderEndpoint(provider, params.externalBaseUrl, {
    respectCustomBaseUrl: provider !== 'groq' || !params.externalBaseUrl?.trim(),
  });

  if (provider === 'cloudflare' && canonical.diagnostic) {
    throw new Error(canonical.diagnostic);
  }

  // 2. Google Gemini Direct Browser SSE Stream (?alt=sse&key=...)
  if (canonical.protocol === 'gemini_native' || /^AIza/i.test(apiKey)) {
    if (keyPool.length === 0) {
      return runPublicKeylessFallback({
        messages: params.messages,
        systemPrompt: sysInstruction,
        signal: params.signal,
        onDelta: params.onDelta,
      });
    }
    const primaryGemModel = normalizeGeminiDirectModel(model);
    const gemCandidates = Array.from(
      new Set([
        primaryGemModel,
        'gemini-2.5-flash',
        'gemini-2.5-flash-lite',
        'gemini-2.0-flash',
      ])
    );

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

    let lastGemError: Error | null = null;
    for (const candidateKey of keyPool) {
      for (const gemModel of gemCandidates) {
        const useSse = Boolean(params.onDelta);
        const endpointUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          gemModel
        )}:${useSse ? 'streamGenerateContent?alt=sse&' : 'generateContent?'}key=${encodeURIComponent(
          candidateKey
        )}`;

        const res = await fetch(endpointUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: sysInstruction }] },
            contents,
          }),
          signal: params.signal,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          lastGemError = new Error(
            data?.error?.message || `Gemini HTTP ${res.status}`
          );
          if (res.status === 404 || res.status === 400) {
            continue;
          }
          if (res.status === 401 || res.status === 403 || res.status === 429) {
            break;
          }
          throw lastGemError;
        }

        const streamed = await consumeGeminiSseStream(res, params.onDelta);
        if (streamed.trim()) {
          return streamed.trim();
        }
        lastGemError = new Error('Empty response from Gemini API');
      }
    }
    throw lastGemError || new Error('Gemini API request failed');
  }

  // 3. Anthropic Native API (/v1/messages)
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

  // 4. OpenAI-Compatible Providers (Groq, OpenAI, Custom endpoints, OpenRouter, etc.)
  if (!isKeylessProviderId(provider) && keyPool.length === 0) {
    return runPublicKeylessFallback({
      messages: params.messages,
      systemPrompt: sysInstruction,
      signal: params.signal,
      onDelta: params.onDelta,
    });
  }

  const candidateKeys = keyPool.length > 0 ? keyPool : ['keyless'];
  const targetUrl =
    provider === 'groq'
      ? 'https://api.groq.com/openai/v1/chat/completions'
      : canonical.chatUrl;
  const candidateModels =
    provider === 'groq'
      ? Array.from(
          new Set([
            resolveGroqModel(model),
            'llama-3.3-70b-versatile',
            'llama-3.1-8b-instant',
          ])
        )
      : [model];

  let lastOpenAIError: Error | null = null;

  for (const candidateKey of candidateKeys) {
    for (const candidateModel of candidateModels) {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (candidateKey && candidateKey !== 'keyless') {
        headers['Authorization'] = `Bearer ${candidateKey}`;
      }

      const res = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: candidateModel,
          ...(/mercury/i.test(candidateModel) ? { reasoning_effort: 'low' } : {}),
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
          lastOpenAIError = openAiErr;
          break;
        }
        if (res.status === 404 || res.status === 400) {
          openAiErr.code = 'MODEL_UNAVAILABLE';
          lastOpenAIError = openAiErr;
          if (candidateModels.length > 1) {
            continue;
          }
          throw openAiErr;
        }
        lastOpenAIError = openAiErr;
        if (res.status === 429 && candidateKeys.length > 1) {
          break;
        }
        throw lastOpenAIError;
      }

      const text = await consumeOpenAISseStream(res, params.onDelta);
      if (!text.trim()) {
        throw new Error('Empty response from provider');
      }
      return text.trim();
    }
  }

  throw lastOpenAIError || new Error('Provider request failed');
}

export const clientDirectCall = runStandaloneClientSideAI;

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
  const firstKey = firstApiKey(params.externalKeys);
  const detected = firstKey ? detectProviderFromKey(firstKey) : null;
  const effectiveProvider: ExternalProviderId =
    detected === 'groq' && params.provider !== 'ollama' && params.provider !== 'lmstudio'
      ? 'groq'
      : params.provider;
  const workingModel =
    effectiveProvider === 'groq'
      ? resolveGroqModel(params.externalModel)
      : (params.externalModel || '').trim() ||
        DEFAULT_PROVIDER_MODELS[effectiveProvider] ||
        'gpt-4o-mini';
  const canonical = canonicalizeProviderEndpoint(
    effectiveProvider,
    effectiveProvider === 'groq' ? undefined : params.externalBaseUrl,
    { respectCustomBaseUrl: effectiveProvider !== 'groq' }
  );
  try {
    await runStandaloneClientSideAI({
      provider: effectiveProvider,
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

  const effectiveProvider: ExternalProviderId =
    apiKey.startsWith('gsk_') &&
    params.provider !== 'ollama' &&
    params.provider !== 'lmstudio'
      ? 'groq'
      : params.provider;

  const canonical = canonicalizeProviderEndpoint(
    effectiveProvider,
    effectiveProvider === 'groq' ? undefined : params.externalBaseUrl,
    { respectCustomBaseUrl: effectiveProvider !== 'groq' }
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
