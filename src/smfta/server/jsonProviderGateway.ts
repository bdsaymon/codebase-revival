import type { CanonicalMessage } from './engine/context';
import { verifyConnectionTargetSafe } from './engine/config';
import { sanitizeProprietaryOutput } from './providers';

export type JsonGatewayRequestFormat = 'openai' | 'gemini' | 'anthropic' | 'custom_template';

export interface ParsedJsonProviderSpec {
  endpoint: string;
  method: 'POST' | 'GET';
  headers: Record<string, string>;
  requestFormat: JsonGatewayRequestFormat;
  bodyTemplate?: Record<string, unknown>;
  extraParams: Record<string, unknown>;
  responsePath?: string;
  streamPath?: string;
  stream: boolean;
  models: string[];
  apiKeyHeader: string;
  apiKeyPrefix: string;
}

export interface JsonProviderSpecParseResult {
  isJsonGateway: boolean;
  spec?: ParsedJsonProviderSpec;
  extraParams: Record<string, unknown>;
  parseError?: string;
}

function parseJsonObjectSafe(
  raw: unknown,
  label: string
): { obj: Record<string, unknown> | null; error?: string } {
  if (!raw) return { obj: null };
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return { obj: raw as Record<string, unknown> };
  }
  if (typeof raw !== 'string') return { obj: null };
  const trimmed = raw.trim();
  if (!trimmed) return { obj: null };
  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        obj: null,
        error: `${label} অবশ্যই একটি বৈধ JSON অবজেক্ট ({...}) হতে হবে।`,
      };
    }
    return { obj: parsed as Record<string, unknown> };
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Syntax error';
    return {
      obj: null,
      error: `${label} পার্স করা যায়নি (${detail})। অনুগ্রহ করে কমা, কোট ও ব্র্যাকেট যাচাই করুন।`,
    };
  }
}

/**
 * Parses V1 Custom JSON Provider specifications supplied via `customParams` and/or `customHeaders`.
 * Supports full endpoint configs: url/endpoint/baseUrl, headers, requestFormat, bodyTemplate,
 * responsePath, streamPath, stream, models, apiKeyHeader, apiKeyPrefix.
 */
export function parseJsonProviderSpec(params: {
  customParams?: unknown;
  customHeaders?: unknown;
  fallbackBaseUrl?: string;
}): JsonProviderSpecParseResult {
  const paramsParsed = parseJsonObjectSafe(params.customParams, 'Custom Params JSON');
  if (paramsParsed.error) {
    return {
      isJsonGateway: false,
      extraParams: {},
      parseError: paramsParsed.error,
    };
  }

  const headersParsed = parseJsonObjectSafe(params.customHeaders, 'Custom Headers JSON');
  if (headersParsed.error) {
    return {
      isJsonGateway: false,
      extraParams: paramsParsed.obj || {},
      parseError: headersParsed.error,
    };
  }

  const obj = paramsParsed.obj || {};
  const explicitEndpoint = String(
    obj.endpoint || obj.url || obj.baseUrl || obj.base_url || ''
  ).trim();
  const hasGatewayKeys = Boolean(
    explicitEndpoint ||
      obj.bodyTemplate ||
      obj.requestFormat ||
      obj.responsePath ||
      obj.streamPath
  );

  const mergedHeaders: Record<string, string> = {};
  if (headersParsed.obj) {
    for (const [k, v] of Object.entries(headersParsed.obj)) {
      if (v !== undefined && v !== null && k.trim()) {
        mergedHeaders[k.trim()] = String(v);
      }
    }
  }
  if (obj.headers && typeof obj.headers === 'object' && !Array.isArray(obj.headers)) {
    for (const [k, v] of Object.entries(obj.headers as Record<string, unknown>)) {
      if (v !== undefined && v !== null && k.trim()) {
        mergedHeaders[k.trim()] = String(v);
      }
    }
  }

  const GATEWAY_CONTROL_KEYS = new Set([
    'endpoint',
    'url',
    'baseUrl',
    'base_url',
    'method',
    'headers',
    'requestFormat',
    'bodyTemplate',
    'responsePath',
    'streamPath',
    'stream',
    'streaming',
    'models',
    'apiKeyHeader',
    'apiKeyPrefix',
  ]);
  const extraParams: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!GATEWAY_CONTROL_KEYS.has(k) && v !== undefined) {
      extraParams[k] = v;
    }
  }

  if (!hasGatewayKeys) {
    return {
      isJsonGateway: false,
      extraParams,
    };
  }

  const resolvedEndpoint = explicitEndpoint || String(params.fallbackBaseUrl || '').trim();
  if (!resolvedEndpoint) {
    return {
      isJsonGateway: false,
      extraParams,
      parseError:
        'JSON প্রোভাইডারের জন্য অবশ্যই একটি বৈধ "url" বা "baseUrl" অথবা Base URL ফিল্ড পূরণ করতে হবে।',
    };
  }

  const rawFormat = String(obj.requestFormat || '').trim().toLowerCase();
  const requestFormat: JsonGatewayRequestFormat =
    rawFormat === 'gemini' || rawFormat === 'gemini_native'
      ? 'gemini'
      : rawFormat === 'anthropic' || rawFormat === 'anthropic_native'
      ? 'anthropic'
      : rawFormat === 'custom' || rawFormat === 'custom_template' || obj.bodyTemplate
      ? 'custom_template'
      : /generativelanguage\.googleapis\.com/i.test(resolvedEndpoint) &&
        !/\/openai/i.test(resolvedEndpoint)
      ? 'gemini'
      : /api\.anthropic\.com/i.test(resolvedEndpoint)
      ? 'anthropic'
      : 'openai';

  const bodyTemplate =
    obj.bodyTemplate && typeof obj.bodyTemplate === 'object' && !Array.isArray(obj.bodyTemplate)
      ? (obj.bodyTemplate as Record<string, unknown>)
      : undefined;

  const models = Array.isArray(obj.models)
    ? obj.models.map((m) => String(m || '').trim()).filter(Boolean)
    : [];

  const streamPref =
    typeof obj.stream === 'boolean'
      ? obj.stream
      : typeof obj.streaming === 'boolean'
      ? obj.streaming
      : true;

  return {
    isJsonGateway: true,
    extraParams,
    spec: {
      endpoint: resolvedEndpoint,
      method: String(obj.method || 'POST').toUpperCase() === 'GET' ? 'GET' : 'POST',
      headers: mergedHeaders,
      requestFormat,
      bodyTemplate,
      extraParams,
      responsePath:
        typeof obj.responsePath === 'string' && obj.responsePath.trim()
          ? obj.responsePath.trim()
          : undefined,
      streamPath:
        typeof obj.streamPath === 'string' && obj.streamPath.trim()
          ? obj.streamPath.trim()
          : undefined,
      stream: streamPref,
      models,
      apiKeyHeader:
        typeof obj.apiKeyHeader === 'string' && obj.apiKeyHeader.trim()
          ? obj.apiKeyHeader.trim()
          : requestFormat === 'anthropic'
          ? 'x-api-key'
          : 'Authorization',
      apiKeyPrefix:
        typeof obj.apiKeyPrefix === 'string'
          ? obj.apiKeyPrefix
          : requestFormat === 'anthropic'
          ? ''
          : 'Bearer ',
    },
  };
}

/**
 * Extracts a nested value from JSON using dot & bracket notation, e.g.
 * `choices[0].message.content`, `candidates[0].content.parts[0].text`, `data.reply`.
 */
export function extractValueByPath(root: unknown, pathExpr?: string): string {
  if (!root || !pathExpr) return '';
  const tokens: Array<string | number> = [];
  const clean = pathExpr.trim().replace(/^\$\.?/, '');
  const segRegex = /([^.[\]]+)|\[(\d+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = segRegex.exec(clean)) !== null) {
    if (match[1] !== undefined) tokens.push(match[1]);
    else if (match[2] !== undefined) tokens.push(Number(match[2]));
  }
  let cur: unknown = root;
  for (const tok of tokens) {
    if (cur === null || cur === undefined) return '';
    if (typeof tok === 'number') {
      if (!Array.isArray(cur)) return '';
      cur = cur[tok];
    } else {
      if (typeof cur !== 'object') return '';
      cur = (cur as Record<string, unknown>)[tok];
    }
  }
  if (typeof cur === 'string') return cur;
  if (typeof cur === 'number' || typeof cur === 'boolean') return String(cur);
  if (Array.isArray(cur)) {
    return cur
      .map((item) =>
        typeof item === 'string'
          ? item
          : item && typeof item === 'object' && typeof (item as { text?: unknown }).text === 'string'
          ? String((item as { text?: string }).text)
          : ''
      )
      .join('');
  }
  return '';
}

function extractAnyReplyText(payload: unknown, customPath?: string): string {
  if (!payload || typeof payload !== 'object') return '';
  if (customPath) {
    const customHit = extractValueByPath(payload, customPath);
    if (customHit) return customHit;
  }
  const commonPaths = [
    'choices[0].delta.content',
    'choices[0].message.content',
    'choices[0].text',
    'delta.text',
    'content[0].text',
    'candidates[0].content.parts[0].text',
    'output.text',
    'data.reply',
    'response',
    'reply',
    'text',
    'message.content',
  ];
  for (const p of commonPaths) {
    const val = extractValueByPath(payload, p);
    if (val) return val;
  }
  return '';
}

function renderTemplateValue(
  node: unknown,
  vars: {
    model: string;
    prompt: string;
    system: string;
    messages: Array<{ role: string; content: string }>;
    maxTokens: number;
    temperature: number;
    stream: boolean;
  }
): unknown {
  if (typeof node === 'string') {
    if (node === '{{messages}}') return vars.messages;
    if (node === '{{maxTokens}}' || node === '{{max_tokens}}') return vars.maxTokens;
    if (node === '{{temperature}}') return vars.temperature;
    if (node === '{{stream}}') return vars.stream;
    return node
      .replace(/\{\{model\}\}/g, vars.model)
      .replace(/\{\{prompt\}\}/g, vars.prompt)
      .replace(/\{\{system\}\}/g, vars.system);
  }
  if (Array.isArray(node)) {
    return node.map((item) => renderTemplateValue(item, vars));
  }
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      out[k] = renderTemplateValue(v, vars);
    }
    return out;
  }
  return node;
}

export function formatJsonGatewayErrorBn(status: number, endpoint: string, detail?: string): string {
  const host = (() => {
    try {
      return new URL(endpoint).host;
    } catch {
      return endpoint;
    }
  })();
  const snip = detail ? ` — "${detail.slice(0, 160)}"` : '';
  if (status === 401 || status === 403) {
    return `⚠️ JSON প্রোভাইডার (${host}) API কী বা অনুমতি গ্রহণ করেনি (HTTP ${status})${snip}। Settings থেকে হেডার ও API Key পরীক্ষা করুন।`;
  }
  if (status === 404) {
    return `⚠️ JSON প্রোভাইডার (${host}) এন্ডপয়েন্ট বা মডেল পাওয়া যায়নি (HTTP 404)${snip}। URL এবং মডেলের নাম যাচাই করুন।`;
  }
  if (status === 429) {
    return `⚠️ JSON প্রোভাইডার (${host}) রেট লিমিট বা কোটা সীমা পূর্ণ হয়েছে (HTTP 429)${snip}। একটু পর আবার চেষ্টা করুন।`;
  }
  if (status >= 500) {
    return `⚠️ JSON প্রোভাইডার (${host}) সার্ভার সাময়িকভাবে সাড়া দিচ্ছে না (HTTP ${status})${snip}।`;
  }
  return `⚠️ JSON প্রোভাইডার (${host}) থেকে ত্রুটি এসেছে (HTTP ${status || 'Network'})${snip}।`;
}

export async function executeJsonProviderChat(params: {
  spec: ParsedJsonProviderSpec;
  messages: CanonicalMessage[];
  modelId: string;
  apiKey?: string;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
  abortSignal?: AbortSignal;
  onDelta?: (delta: string) => void;
  fetchImpl?: typeof fetch;
}): Promise<{
  ok: boolean;
  text: string;
  httpStatus: number | null;
  modelUsed: string;
  errorBn?: string;
  rawError?: string;
}> {
  const { spec } = params;
  let targetUrl = spec.endpoint;
  const resolvedModel = (params.modelId || spec.models[0] || 'gpt-4o-mini').trim();
  const useStream = Boolean(params.stream && spec.stream);

  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = `https://${targetUrl.replace(/^\/+/, '')}`;
  }
  if (spec.requestFormat === 'openai' && !/\/chat\/completions\/?$/i.test(targetUrl) && !spec.bodyTemplate) {
    targetUrl = `${targetUrl.replace(/\/+$/, '')}/chat/completions`;
  }

  const safety = await verifyConnectionTargetSafe(targetUrl, {
    isCustomProvider: true,
    allowInsecureLocalhost: process.env.ALLOW_INSECURE_LOCALHOST === 'true',
  });
  if (!safety.safe) {
    return {
      ok: false,
      text: '',
      httpStatus: 400,
      modelUsed: resolvedModel,
      errorBn: `⚠️ JSON প্রোভাইডার URL অনুমোদিত নয় (${safety.reason || 'অবৈধ ঠিকানা'})।`,
      rawError: safety.reason,
    };
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: useStream ? 'text/event-stream, application/json' : 'application/json',
    ...spec.headers,
  };

  if (params.apiKey && params.apiKey.trim()) {
    const cleanKey = params.apiKey.trim();
    if (spec.apiKeyHeader.toLowerCase() === 'authorization' && !headers['Authorization']) {
      headers['Authorization'] = `${spec.apiKeyPrefix}${cleanKey}`;
    } else if (!headers[spec.apiKeyHeader]) {
      headers[spec.apiKeyHeader] = `${spec.apiKeyPrefix}${cleanKey}`;
    }
  }
  if (spec.requestFormat === 'anthropic' && !headers['anthropic-version']) {
    headers['anthropic-version'] = '2023-06-01';
  }

  const sysMsg = params.messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n')
    .trim();
  const userMsgs = params.messages.filter((m) => m.role !== 'system');
  const lastPrompt = [...userMsgs].reverse().find((m) => m.role === 'user')?.content || '';

  let body: Record<string, unknown>;
  if (spec.requestFormat === 'custom_template' && spec.bodyTemplate) {
    body = renderTemplateValue(spec.bodyTemplate, {
      model: resolvedModel,
      prompt: lastPrompt,
      system: sysMsg,
      messages: params.messages.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user',
        content: m.content,
      })),
      maxTokens: params.maxTokens || 4096,
      temperature: params.temperature ?? 0.7,
      stream: useStream,
    }) as Record<string, unknown>;
  } else if (spec.requestFormat === 'anthropic') {
    body = {
      model: resolvedModel,
      max_tokens: params.maxTokens || 4096,
      stream: useStream,
      ...(sysMsg ? { system: sysMsg } : {}),
      messages: userMsgs.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content || 'Hello',
      })),
      ...spec.extraParams,
    };
  } else if (spec.requestFormat === 'gemini') {
    const cleanEndpoint = targetUrl.replace(/\/+$/, '');
    if (!/:(?:generateContent|streamGenerateContent)/i.test(cleanEndpoint)) {
      const verb = useStream ? 'streamGenerateContent?alt=sse' : 'generateContent';
      targetUrl = `${cleanEndpoint}/models/${encodeURIComponent(resolvedModel)}:${verb}`;
    }
    if (params.apiKey?.trim() && !headers['x-goog-api-key']) {
      headers['x-goog-api-key'] = params.apiKey.trim();
      delete headers['Authorization'];
    }
    body = {
      ...(sysMsg ? { systemInstruction: { parts: [{ text: sysMsg }] } } : {}),
      contents: userMsgs.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content || 'Hello' }],
      })),
      generationConfig: {
        maxOutputTokens: params.maxTokens || 4096,
        ...(typeof params.temperature === 'number' ? { temperature: params.temperature } : {}),
      },
      ...spec.extraParams,
    };
  } else {
    body = {
      model: resolvedModel,
      stream: useStream,
      max_tokens: params.maxTokens || 4096,
      ...(typeof params.temperature === 'number' ? { temperature: params.temperature } : {}),
      messages: params.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      ...spec.extraParams,
    };
  }

  const fetcher = params.fetchImpl || fetch;
  try {
    const resp = await fetcher(targetUrl, {
      method: spec.method,
      headers,
      ...(spec.method === 'POST' ? { body: JSON.stringify(body) } : {}),
      signal: params.abortSignal,
    });

    if (!resp.ok) {
      const errText = (await resp.text().catch(() => '')).trim();
      let cleanErr = errText;
      try {
        const parsedErr = JSON.parse(errText) as Record<string, unknown>;
        cleanErr =
          String(
            (parsedErr.error as { message?: unknown } | undefined)?.message ||
              parsedErr.message ||
              parsedErr.error ||
              errText
          ).trim() || errText;
      } catch {
        // plain text error
      }
      return {
        ok: false,
        text: '',
        httpStatus: resp.status,
        modelUsed: resolvedModel,
        errorBn: formatJsonGatewayErrorBn(resp.status, targetUrl, cleanErr),
        rawError: cleanErr.slice(0, 240),
      };
    }

    const ct = (resp.headers.get('content-type') || '').toLowerCase();
    if (useStream && resp.body && (ct.includes('text/event-stream') || ct.includes('ndjson'))) {
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';

      const consumeChunkLine = (rawLine: string) => {
        const line = rawLine.trim();
        if (!line) return;
        const jsonStr = line.startsWith('data:') ? line.slice(5).trim() : line;
        if (!jsonStr || jsonStr === '[DONE]') return;
        try {
          const parsed = JSON.parse(jsonStr);
          const piece = extractAnyReplyText(parsed, spec.streamPath || spec.responsePath);
          if (piece) {
            const cleanPiece = sanitizeProprietaryOutput(piece);
            if (cleanPiece) {
              fullText += cleanPiece;
              params.onDelta?.(cleanPiece);
            }
          }
        } catch {
          // ignore non-json SSE comment or keepalive lines
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          buffer += decoder.decode();
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';
        for (const l of lines) consumeChunkLine(l);
      }
      if (buffer.trim()) {
        for (const l of buffer.split(/\r?\n/)) consumeChunkLine(l);
      }

      if (!fullText.trim()) {
        return {
          ok: false,
          text: '',
          httpStatus: resp.status,
          modelUsed: resolvedModel,
          errorBn:
            '⚠️ JSON প্রোভাইডার স্ট্রিম থেকে কোনো টেক্সট পাওয়া যায়নি। streamPath বা responsePath ঠিক আছে কিনা যাচাই করুন।',
        };
      }

      return {
        ok: true,
        text: fullText,
        httpStatus: resp.status,
        modelUsed: resolvedModel,
      };
    }

    const rawBodyText = (await resp.text().catch(() => '')).trim();
    if (/^\s*<(?:!doctype|html)\b/i.test(rawBodyText)) {
      return {
        ok: false,
        text: '',
        httpStatus: resp.status,
        modelUsed: resolvedModel,
        errorBn:
          '⚠️ JSON প্রোভাইডার এন্ডপয়েন্ট JSON-এর বদলে HTML পেজ ফেরত দিয়েছে। সঠিক API Endpoint URL যাচাই করুন।',
      };
    }
    let data: unknown = null;
    try {
      data = rawBodyText ? JSON.parse(rawBodyText) : null;
    } catch {
      // Some gateways ignore stream:false or omit SSE content-type; extract SSE lines or plain text cleanly
      let sseCollected = '';
      if (rawBodyText.includes('data:')) {
        for (const rawLine of rawBodyText.split(/\r?\n/)) {
          const line = rawLine.trim();
          if (!line.startsWith('data:')) continue;
          const jsonStr = line.slice(5).trim();
          if (!jsonStr || jsonStr === '[DONE]') continue;
          try {
            const parsedChunk = JSON.parse(jsonStr);
            const piece = extractAnyReplyText(parsedChunk, spec.streamPath || spec.responsePath);
            if (piece) sseCollected += piece;
          } catch {
            // ignore partial chunk
          }
        }
      }
      data = sseCollected.trim() ? { text: sseCollected.trim() } : rawBodyText ? { text: rawBodyText } : null;
    }

    const extracted = sanitizeProprietaryOutput(
      extractAnyReplyText(data, spec.responsePath).trim()
    );
    if (!extracted) {
      return {
        ok: false,
        text: '',
        httpStatus: resp.status,
        modelUsed: resolvedModel,
        errorBn:
          '⚠️ JSON প্রোভাইডার থেকে খালি বা অপ্রত্যাশিত রেসপন্স এসেছে। "responsePath" কনফিগারেশন পরীক্ষা করুন।',
      };
    }

    if (params.onDelta) {
      params.onDelta(extracted);
    }
    return {
      ok: true,
      text: extracted,
      httpStatus: resp.status,
      modelUsed: resolvedModel,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err || 'Network error');
    return {
      ok: false,
      text: '',
      httpStatus: null,
      modelUsed: resolvedModel,
      errorBn: `⚠️ JSON প্রোভাইডারে সংযোগ করা যায়নি (${msg.slice(0, 140)})। URL ও নেটওয়ার্ক পরীক্ষা করুন।`,
      rawError: msg,
    };
  }
}
