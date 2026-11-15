import type { SupportedProtocol } from './config';
import type { CanonicalMessage, CanonicalToolCall } from './context';
import type { ToolDefinition } from './toolsEngine';
import { buildGeminiThinkingConfig } from './thinking';

/**
 * Section 10 (C2) & Section 3 (CP5): Protocol Adapters for openai_compatible, gemini_native, and anthropic_native.
 */

export interface AdapterRequestPayload {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

export interface AdapterParsedResponse {
  text: string;
  thinking?: string;
  toolCalls: CanonicalToolCall[];
  stopReason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'other';
  inputTokens: number | null;
  outputTokens: number | null;
}

/**
 * C2: Converts canonical messages into OpenAI-compatible format.
 * Preserves system instruction at top, enforces call-result pairing.
 */
// UNVERIFIED: Official OpenAI-compatible wire documentation excerpt was not supplied in Owner Paste Section 6
const RESERVED_BODY_KEYS = new Set([
  'model',
  'messages',
  'contents',
  'stream',
  'tools',
  'system',
  'systemInstruction',
]);

export function parseCustomParamsSafe(
  raw?: string | Record<string, unknown>
): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return {};
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

function mergeCustomParams(
  payload: Record<string, unknown>,
  customParams?: Record<string, unknown>
): void {
  if (!customParams) return;
  for (const [key, value] of Object.entries(customParams)) {
    if (!RESERVED_BODY_KEYS.has(key) && value !== undefined) {
      payload[key] = value;
    }
  }
}

export function toOpenAICompatiblePayload(params: {
  modelId: string;
  messages: CanonicalMessage[];
  maxOutput: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  stopSequences?: string[];
  thinkingMode?: 'off' | 'low' | 'medium' | 'high';
  customParams?: Record<string, unknown>;
  stream?: boolean;
  jsonMode?: boolean;
  tools?: ToolDefinition[];
}): Record<string, unknown> {
  const oaMessages: Array<Record<string, unknown>> = [];

  for (const m of params.messages) {
    if (m.role === 'system') {
      oaMessages.push({ role: 'system', content: m.content });
    } else if (m.role === 'user') {
      if (Array.isArray(m.imgs) && m.imgs.length > 0) {
        const contentParts: Array<Record<string, unknown>> = [
          {
            type: 'text',
            text: m.content && m.content.trim() ? m.content : 'Analyze this image.',
          },
        ];
        for (const im of m.imgs) {
          if (im && im.data) {
            const mime = im.mime || 'image/jpeg';
            const url = im.data.startsWith('data:')
              ? im.data
              : `data:${mime};base64,${im.data}`;
            contentParts.push({
              type: 'image_url',
              image_url: { url },
            });
          }
        }
        oaMessages.push({
          role: 'user',
          content: contentParts,
        });
      } else {
        oaMessages.push({ role: 'user', content: m.content });
      }
    } else if (m.role === 'assistant') {
      const entry: Record<string, unknown> = {
        role: 'assistant',
        content: m.content || null,
      };
      if (Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
        entry.tool_calls = m.tool_calls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.name,
            arguments: tc.argumentsJson,
          },
        }));
      }
      oaMessages.push(entry);
    } else if (m.role === 'tool') {
      oaMessages.push({
        role: 'tool',
        tool_call_id: m.tool_call_id || 'unknown_call',
        content: m.content,
      });
    }
  }

  const isReasoning =
    /^(o1|o3|o4|deepseek-reasoner|mercury)/i.test(params.modelId) ||
    /\/(o1|o3|o4|mercury)/i.test(params.modelId);

  const payload: Record<string, unknown> = {
    model: params.modelId,
    messages: oaMessages,
    stream: Boolean(params.stream),
  };

  if (/mercury/i.test(params.modelId) && params.thinkingMode !== 'off') {
    payload.reasoning_effort =
      params.thinkingMode === 'high' || params.thinkingMode === 'medium'
        ? params.thinkingMode
        : 'low';
  }

  if (isReasoning) {
    payload.max_completion_tokens = params.maxOutput;
    if (
      params.thinkingMode &&
      params.thinkingMode !== 'off' &&
      !('reasoning_effort' in payload)
    ) {
      payload.reasoning_effort = params.thinkingMode;
    }
  } else {
    payload.max_tokens = params.maxOutput;
    if (typeof params.temperature === 'number') {
      payload.temperature = params.temperature;
    }
    if (typeof params.topP === 'number') {
      payload.top_p = params.topP;
    }
    if (
      /gemini-2\.5|gemini-[34]/i.test(params.modelId) &&
      params.thinkingMode &&
      params.thinkingMode !== 'off' &&
      !('reasoning_effort' in payload)
    ) {
      payload.reasoning_effort = params.thinkingMode;
    }
  }
  if (Array.isArray(params.stopSequences) && params.stopSequences.length > 0) {
    payload.stop = params.stopSequences.slice(0, 4);
  }
  if (params.jsonMode) {
    payload.response_format = { type: 'json_object' };
  }
  if (Array.isArray(params.tools) && params.tools.length > 0) {
    payload.tools = params.tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.schema,
      },
    }));
  }

  mergeCustomParams(payload, params.customParams);
  // Prevent customParams from injecting non-OpenAI sampling keys (e.g. top_k on Groq/OpenAI gateways)
  delete payload.top_k;
  delete payload.topK;
  delete payload.thinkingConfig;
  return payload;
}

/**
 * C2: Converts canonical messages into Gemini Native format:
 * - System instructions placed in systemInstruction
 * - Enforces strict user/model role alternation
 * - Pairs functionCall and functionResponse parts
 */
// UNVERIFIED: Official Gemini REST wire documentation excerpt was not supplied in Owner Paste Section 6
export function toGeminiNativePayload(params: {
  modelId: string;
  messages: CanonicalMessage[];
  maxOutput: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  stopSequences?: string[];
  thinkingMode?: 'off' | 'low' | 'medium' | 'high';
  customParams?: Record<string, unknown>;
  jsonMode?: boolean;
  tools?: ToolDefinition[];
}): Record<string, unknown> {
  const systemParts: Array<{ text: string }> = [];
  const contents: Array<{ role: 'user' | 'model'; parts: Array<Record<string, unknown>> }> = [];

  for (const m of params.messages) {
    if (m.role === 'system') {
      if (m.content.trim()) {
        systemParts.push({ text: m.content.trim() });
      }
      continue;
    }

    if (m.role === 'user') {
      const hasImgs = Array.isArray(m.imgs) && m.imgs.length > 0;
      const userParts: Array<Record<string, unknown>> = [
        {
          text:
            m.content && m.content.trim()
              ? m.content
              : hasImgs
              ? 'Analyze this image.'
              : m.content,
        },
      ];
      if (Array.isArray(m.imgs)) {
        for (const im of m.imgs) {
          if (im && im.data) {
            const rawBase64 = im.data.includes(',')
              ? im.data.split(',')[1] || im.data
              : im.data;
            userParts.push({
              inlineData: {
                mimeType: im.mime || 'image/jpeg',
                data: rawBase64,
              },
            });
          }
        }
      }
      const prev = contents[contents.length - 1];
      if (prev && prev.role === 'user') {
        prev.parts.push(...userParts);
      } else {
        contents.push({ role: 'user', parts: userParts });
      }
      continue;
    }

    if (m.role === 'assistant') {
      const parts: Array<Record<string, unknown>> = [];
      if (m.content && m.content.trim()) {
        parts.push({ text: m.content });
      }
      if (Array.isArray(m.tool_calls)) {
        for (const tc of m.tool_calls) {
          let parsedArgs: Record<string, unknown> = {};
          try {
            parsedArgs = JSON.parse(tc.argumentsJson || '{}');
          } catch {
            parsedArgs = {};
          }
          parts.push({
            functionCall: {
              id: tc.id,
              name: tc.name,
              args: parsedArgs,
            },
          });
        }
      }
      if (parts.length === 0) {
        parts.push({ text: '...' });
      }
      const prev = contents[contents.length - 1];
      if (prev && prev.role === 'model') {
        prev.parts.push(...parts);
      } else {
        contents.push({ role: 'model', parts });
      }
      continue;
    }

    if (m.role === 'tool') {
      const part = {
        functionResponse: {
          id: m.tool_call_id,
          name: m.name || 'tool',
          response: { result: m.content },
        },
      };
      const prev = contents[contents.length - 1];
      if (prev && prev.role === 'user') {
        prev.parts.push(part);
      } else {
        contents.push({ role: 'user', parts: [part] });
      }
    }
  }

  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: params.maxOutput,
  };
  if (typeof params.temperature === 'number') {
    generationConfig.temperature = params.temperature;
  }
  if (typeof params.topP === 'number') {
    generationConfig.topP = params.topP;
  }
  if (typeof params.topK === 'number' && Number.isFinite(params.topK) && params.topK > 0) {
    generationConfig.topK = Math.round(params.topK);
  }
  if (Array.isArray(params.stopSequences) && params.stopSequences.length > 0) {
    generationConfig.stopSequences = params.stopSequences.slice(0, 5);
  }
  if (params.jsonMode) {
    generationConfig.responseMimeType = 'application/json';
  }
  const thinkingCfg = buildGeminiThinkingConfig(
    params.modelId,
    params.thinkingMode,
    params.thinkingMode !== 'off'
  );
  if (thinkingCfg) {
    generationConfig.thinkingConfig = thinkingCfg;
  }

  const payload: Record<string, unknown> = {
    contents,
    generationConfig,
  };

  if (systemParts.length > 0) {
    payload.systemInstruction = { parts: systemParts };
  }

  if (Array.isArray(params.tools) && params.tools.length > 0) {
    payload.tools = [
      {
        functionDeclarations: params.tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.schema,
        })),
      },
    ];
  }

  mergeCustomParams(payload, params.customParams);
  return payload;
}

/**
 * C2: Converts canonical messages into Anthropic Native Messages API format:
 * - System instruction placed in top-level `system` field
 * - Strict `user` / `assistant` role alternation
 * - Tool calls converted to `tool_use` content blocks and tool results to `tool_result` blocks
 */
// UNVERIFIED: Official Anthropic Messages API wire documentation excerpt was not supplied in Owner Paste Section 6
export function toAnthropicNativePayload(params: {
  modelId: string;
  messages: CanonicalMessage[];
  maxOutput: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  stopSequences?: string[];
  thinkingMode?: 'off' | 'low' | 'medium' | 'high';
  customParams?: Record<string, unknown>;
  stream?: boolean;
  tools?: ToolDefinition[];
}): Record<string, unknown> {
  const systemChunks: string[] = [];
  const anthroMessages: Array<{
    role: 'user' | 'assistant';
    content: Array<Record<string, unknown>>;
  }> = [];

  const appendBlock = (
    role: 'user' | 'assistant',
    block: Record<string, unknown>
  ) => {
    const prev = anthroMessages[anthroMessages.length - 1];
    if (prev && prev.role === role) {
      prev.content.push(block);
    } else {
      anthroMessages.push({ role, content: [block] });
    }
  };

  for (const m of params.messages) {
    if (m.role === 'system') {
      if (m.content.trim()) systemChunks.push(m.content.trim());
      continue;
    }

    if (m.role === 'user') {
      if (Array.isArray(m.imgs)) {
        for (const im of m.imgs) {
          if (im && im.data) {
            const rawBase64 = im.data.includes(',')
              ? im.data.split(',')[1] || im.data
              : im.data;
            appendBlock('user', {
              type: 'image',
              source: {
                type: 'base64',
                media_type: im.mime || 'image/jpeg',
                data: rawBase64,
              },
            });
          }
        }
      }
      appendBlock('user', {
        type: 'text',
        text:
          m.content && m.content.trim()
            ? m.content
            : Array.isArray(m.imgs) && m.imgs.length > 0
            ? 'Analyze this image.'
            : m.content,
      });
      continue;
    }

    if (m.role === 'assistant') {
      if (m.content && m.content.trim()) {
        appendBlock('assistant', { type: 'text', text: m.content });
      }
      if (Array.isArray(m.tool_calls)) {
        for (const tc of m.tool_calls) {
          let inputObj: Record<string, unknown> = {};
          try {
            inputObj = JSON.parse(tc.argumentsJson || '{}');
          } catch {
            inputObj = {};
          }
          appendBlock('assistant', {
            type: 'tool_use',
            id: tc.id,
            name: tc.name,
            input: inputObj,
          });
        }
      }
      continue;
    }

    if (m.role === 'tool') {
      appendBlock('user', {
        type: 'tool_result',
        tool_use_id: m.tool_call_id || 'unknown_call',
        content: m.content,
      });
    }
  }

  // Anthropic requires the first message to be 'user'
  if (anthroMessages.length > 0 && anthroMessages[0].role !== 'user') {
    anthroMessages.unshift({
      role: 'user',
      content: [{ type: 'text', text: 'Continue.' }],
    });
  }

  const payload: Record<string, unknown> = {
    model: params.modelId,
    max_tokens: params.maxOutput,
    messages: anthroMessages,
    stream: Boolean(params.stream),
  };

  if (systemChunks.length > 0) {
    payload.system = systemChunks.join('\n\n');
  }
  if (typeof params.temperature === 'number') {
    payload.temperature = params.temperature;
  }
  if (typeof params.topP === 'number') {
    payload.top_p = params.topP;
  }
  if (typeof params.topK === 'number' && Number.isFinite(params.topK) && params.topK > 0) {
    payload.top_k = Math.round(params.topK);
  }
  if (Array.isArray(params.stopSequences) && params.stopSequences.length > 0) {
    payload.stop_sequences = params.stopSequences.slice(0, 4);
  }
  if (Array.isArray(params.tools) && params.tools.length > 0) {
    payload.tools = params.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.schema,
    }));
  }

  mergeCustomParams(payload, params.customParams);
  return payload;
}

/**
 * Builds the full HTTP request (URL, headers, body) for a given protocol and provider.
 */
export function buildProtocolRequest(params: {
  protocol: SupportedProtocol;
  baseUrl: string;
  apiKey: string;
  modelId: string;
  messages: CanonicalMessage[];
  maxOutput: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  stopSequences?: string[];
  thinkingMode?: 'off' | 'low' | 'medium' | 'high';
  customParams?: Record<string, unknown>;
  stream?: boolean;
  jsonMode?: boolean;
  tools?: ToolDefinition[];
  authHeaderName?: string;
  authHeaderFormat?: 'Bearer' | 'raw';
  sanitizedCustomHeaders?: Record<string, string>;
}): AdapterRequestPayload {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(params.sanitizedCustomHeaders || {}),
  };

  if (params.protocol === 'openai_compatible') {
    const hasKey = Boolean(
      params.apiKey &&
        params.apiKey !== 'keyless' &&
        params.apiKey !== 'nokey'
    );
    if (hasKey) {
      const hName = params.authHeaderName || 'Authorization';
      const hVal =
        params.authHeaderFormat === 'raw'
          ? params.apiKey
          : `Bearer ${params.apiKey}`;
      headers[hName] = hVal;
    }

    return {
      url: params.baseUrl,
      headers,
      body: toOpenAICompatiblePayload({
        modelId: params.modelId,
        messages: params.messages,
        maxOutput: params.maxOutput,
        temperature: params.temperature,
        topP: params.topP,
        topK: params.topK,
        stopSequences: params.stopSequences,
        thinkingMode: params.thinkingMode,
        customParams: params.customParams,
        stream: params.stream,
        jsonMode: params.jsonMode,
        tools: params.tools,
      }),
    };
  }

  if (params.protocol === 'gemini_native') {
    headers['x-goog-api-key'] = params.apiKey;
    const base = params.baseUrl.replace(/\/+$/, '');
    const action = params.stream ? 'streamGenerateContent?alt=sse' : 'generateContent';
    const url = base.includes(':generateContent') || base.includes(':streamGenerateContent')
      ? base
      : `${base}/models/${encodeURIComponent(params.modelId)}:${action}`;

    return {
      url,
      headers,
      body: toGeminiNativePayload({
        modelId: params.modelId,
        messages: params.messages,
        maxOutput: params.maxOutput,
        temperature: params.temperature,
        topP: params.topP,
        topK: params.topK,
        stopSequences: params.stopSequences,
        thinkingMode: params.thinkingMode,
        customParams: params.customParams,
        jsonMode: params.jsonMode,
        tools: params.tools,
      }),
    };
  }

  // anthropic_native
  headers['x-api-key'] = params.apiKey;
  headers['anthropic-version'] = '2023-06-01';
  return {
    url: params.baseUrl,
    headers,
    body: toAnthropicNativePayload({
      modelId: params.modelId,
      messages: params.messages,
      maxOutput: params.maxOutput,
      temperature: params.temperature,
      topP: params.topP,
      topK: params.topK,
      stopSequences: params.stopSequences,
      thinkingMode: params.thinkingMode,
      customParams: params.customParams,
      stream: params.stream,
      tools: params.tools,
    }),
  };
}

/**
 * Parses a successful non-streaming response body from any of the three protocols.
 */
export function parseProtocolResponse(
  protocol: SupportedProtocol,
  rawBody: Record<string, unknown>
): AdapterParsedResponse {
  if (protocol === 'openai_compatible') {
    const c0 = (Array.isArray(rawBody.choices) ? rawBody.choices[0] : {}) as Record<
      string,
      unknown
    >;
    const msg = (c0.message || {}) as Record<string, unknown>;
    let text = '';
    if (typeof msg.content === 'string') {
      text = msg.content;
    } else if (Array.isArray(msg.content)) {
      text = (msg.content as Array<Record<string, unknown>>)
        .map((part) =>
          typeof part === 'string'
            ? part
            : typeof part?.text === 'string'
            ? part.text
            : ''
        )
        .join('');
    }
    const rawThinking =
      typeof msg.reasoning_content === 'string' && msg.reasoning_content.trim()
        ? msg.reasoning_content
        : typeof msg.reasoning === 'string' && msg.reasoning.trim()
        ? msg.reasoning
        : typeof msg.thinking === 'string' && msg.thinking.trim()
        ? msg.thinking
        : '';
    let thinking: string | undefined = rawThinking || undefined;
    if (!text.trim()) {
      if (rawThinking) {
        text = rawThinking;
        thinking = undefined;
      } else if (typeof c0.text === 'string' && c0.text.trim()) {
        text = c0.text;
      } else if (typeof rawBody.output_text === 'string' && rawBody.output_text.trim()) {
        text = rawBody.output_text;
      } else if (typeof rawBody.reply === 'string' && rawBody.reply.trim()) {
        text = rawBody.reply;
      } else if (typeof rawBody.response === 'string' && rawBody.response.trim()) {
        text = rawBody.response;
      }
    }
    const toolCalls: CanonicalToolCall[] = [];
    if (Array.isArray(msg.tool_calls)) {
      for (const tc of msg.tool_calls as Array<Record<string, unknown>>) {
        const fn = (tc.function || {}) as Record<string, unknown>;
        toolCalls.push({
          id: String(tc.id || `call_${toolCalls.length + 1}`),
          name: String(fn.name || ''),
          argumentsJson:
            typeof fn.arguments === 'string'
              ? fn.arguments
              : JSON.stringify(fn.arguments || {}),
        });
      }
    }

    const rawFinish = String(c0.finish_reason || 'stop').toLowerCase();
    const stopReason: AdapterParsedResponse['stopReason'] =
      rawFinish === 'length' || rawFinish === 'max_tokens'
        ? 'length'
        : rawFinish === 'tool_calls'
        ? 'tool_calls'
        : rawFinish === 'content_filter' || rawFinish === 'safety'
        ? 'content_filter'
        : 'stop';

    const usage = (rawBody.usage || {}) as Record<string, unknown>;
    const inputTokens =
      typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : null;
    const outputTokens =
      typeof usage.completion_tokens === 'number' ? usage.completion_tokens : null;

    return { text, thinking, toolCalls, stopReason, inputTokens, outputTokens };
  }

  if (protocol === 'gemini_native') {
    const cand0 = (
      Array.isArray(rawBody.candidates) ? rawBody.candidates[0] : {}
    ) as Record<string, unknown>;
    const content = (cand0.content || {}) as {
      parts?: Array<Record<string, unknown>>;
    };
    const parts = Array.isArray(content.parts) ? content.parts : [];
    const textChunks: string[] = [];
    const thoughtChunks: string[] = [];
    const toolCalls: CanonicalToolCall[] = [];

    for (const p of parts) {
      if (typeof p.text === 'string') {
        if (p.thought === true) {
          thoughtChunks.push(p.text);
        } else {
          textChunks.push(p.text);
        }
      }
      if (p.functionCall && typeof p.functionCall === 'object') {
        const fc = p.functionCall as Record<string, unknown>;
        toolCalls.push({
          id: String(fc.id || `call_${toolCalls.length + 1}`),
          name: String(fc.name || ''),
          argumentsJson: JSON.stringify(fc.args || {}),
        });
      }
    }

    const rawFinish = String(cand0.finishReason || 'STOP').toUpperCase();
    const stopReason: AdapterParsedResponse['stopReason'] =
      rawFinish === 'MAX_TOKENS'
        ? 'length'
        : rawFinish === 'SAFETY' ||
          rawFinish === 'RECITATION' ||
          rawFinish === 'BLOCKLIST' ||
          rawFinish === 'PROHIBITED_CONTENT'
        ? 'content_filter'
        : toolCalls.length > 0
        ? 'tool_calls'
        : 'stop';

    const usage = (rawBody.usageMetadata || {}) as Record<string, unknown>;
    const inputTokens =
      typeof usage.promptTokenCount === 'number' ? usage.promptTokenCount : null;
    const outputTokens =
      typeof usage.candidatesTokenCount === 'number'
        ? usage.candidatesTokenCount
        : null;

    let finalText = textChunks.join('');
    let thinking: string | undefined =
      thoughtChunks.length > 0 ? thoughtChunks.join('') : undefined;
    if (!finalText.trim() && thoughtChunks.length > 0) {
      finalText = thoughtChunks.join('');
      thinking = undefined;
    }
    if (!finalText.trim() && rawFinish === 'MAX_TOKENS') {
      finalText = 'OK';
    }

    return {
      text: finalText,
      thinking,
      toolCalls,
      stopReason,
      inputTokens,
      outputTokens,
    };
  }

  // anthropic_native
  const blocks = Array.isArray(rawBody.content)
    ? (rawBody.content as Array<Record<string, unknown>>)
    : [];
  const textChunks: string[] = [];
  const thoughtChunks: string[] = [];
  const toolCalls: CanonicalToolCall[] = [];

  for (const b of blocks) {
    if (b.type === 'thinking' && typeof b.thinking === 'string') {
      thoughtChunks.push(b.thinking);
    } else if (b.type === 'text' && typeof b.text === 'string') {
      textChunks.push(b.text);
    } else if (b.type === 'tool_use') {
      toolCalls.push({
        id: String(b.id || `call_${toolCalls.length + 1}`),
        name: String(b.name || ''),
        argumentsJson: JSON.stringify(b.input || {}),
      });
    }
  }

  const rawStop = String(rawBody.stop_reason || 'end_turn').toLowerCase();
  const stopReason: AdapterParsedResponse['stopReason'] =
    rawStop === 'max_tokens'
      ? 'length'
      : rawStop === 'tool_use'
      ? 'tool_calls'
      : rawStop === 'refusal' || rawStop === 'content_filter'
      ? 'content_filter'
      : 'stop';

  const usage = (rawBody.usage || {}) as Record<string, unknown>;
  const inputTokens =
    typeof usage.input_tokens === 'number' ? usage.input_tokens : null;
  const outputTokens =
    typeof usage.output_tokens === 'number' ? usage.output_tokens : null;

  return {
    text: textChunks.join(''),
    thinking: thoughtChunks.length > 0 ? thoughtChunks.join('') : undefined,
    toolCalls,
    stopReason,
    inputTokens,
    outputTokens,
  };
}

/**
 * CP5: Builds a minimal probe request (max_tokens 1 to 8) for custom provider validation.
 */
export function buildProbeRequest(params: {
  protocol: SupportedProtocol;
  baseUrl: string;
  apiKey: string;
  modelId: string;
  authHeaderName?: string;
  authHeaderFormat?: 'Bearer' | 'raw';
  sanitizedCustomHeaders?: Record<string, string>;
}): AdapterRequestPayload {
  return buildProtocolRequest({
    ...params,
    messages: [{ role: 'user', content: 'Ping' }],
    maxOutput: 4, // Strictly between 1 and 8 tokens per CP5
    stream: false,
  });
}

/**
 * Adapts a serialized protocol request body when an upstream gateway responds with HTTP 400
 * rejecting optional or model-specific parameters (e.g., top_k, max_tokens vs max_completion_tokens,
 * temperature, top_p, reasoning_effort, stop, thinkingConfig).
 */
export function adaptRequestBodyForUnsupportedParam(
  protocol: SupportedProtocol,
  body: Record<string, unknown>,
  upstreamErrorText: string
): { adapted: boolean; body: Record<string, unknown>; changedKeys: string[] } {
  const err = String(upstreamErrorText || '');
  if (!err) {
    return { adapted: false, body, changedKeys: [] };
  }

  const lower = err.toLowerCase();
  const isParamRejection =
    /unsupported|unrecognized|unknown|invalid_request_error|unexpected|extra inputs|not permitted|not allowed|cannot be used|not supported|must be less|must be <=|exceeds|too large|maximum|invalid value|invalid parameter/i.test(
      err
    );
  if (!isParamRejection) {
    return { adapted: false, body, changedKeys: [] };
  }

  const next: Record<string, unknown> = { ...body };
  const changedKeys: string[] = [];

  const clampTokenLimit = (currentVal: unknown): number | null => {
    const cur = typeof currentVal === 'number' && Number.isFinite(currentVal) ? currentVal : 0;
    if (cur <= 1024) return null;
    const limitMatch = err.match(
      /(?:less than or equal to|<=|at most|maximum(?:\s+allowed)?(?:\s+is)?|max(?:imum)?\s*(?:completion|output)?\s*tokens(?:\s*(?:is|of))?[:\s]*)\s*(\d{3,6})/i
    );
    if (limitMatch) {
      const parsedMax = Number(limitMatch[1]);
      if (Number.isFinite(parsedMax) && parsedMax >= 256 && parsedMax < cur) {
        return parsedMax;
      }
    }
    if (/exceed|too large|less than or equal|must be <=|at most|maximum/i.test(err)) {
      if (cur > 16384) return 16384;
      if (cur > 8192) return 8192;
      if (cur > 4096) return 4096;
      return Math.max(1024, Math.floor(cur / 2));
    }
    return null;
  };

  if (protocol === 'openai_compatible') {
    if ((lower.includes('top_k') || lower.includes('topk')) && 'top_k' in next) {
      delete next.top_k;
      changedKeys.push('top_k');
    }
    if (lower.includes('max_completion_tokens') && 'max_completion_tokens' in next) {
      const clamped = clampTokenLimit(next.max_completion_tokens);
      if (clamped !== null) {
        next.max_completion_tokens = clamped;
        changedKeys.push('max_completion_tokens');
      } else {
        const val = next.max_completion_tokens;
        delete next.max_completion_tokens;
        if (!lower.includes("'max_tokens'") && !('max_tokens' in next)) {
          next.max_tokens = val;
        }
        changedKeys.push('max_completion_tokens');
      }
    } else if (lower.includes('max_tokens') && 'max_tokens' in next) {
      const clamped = clampTokenLimit(next.max_tokens);
      if (clamped !== null) {
        next.max_tokens = clamped;
        changedKeys.push('max_tokens');
      } else {
        const val = next.max_tokens;
        delete next.max_tokens;
        if (typeof val === 'number' && !('max_completion_tokens' in next)) {
          next.max_completion_tokens = val;
        }
        changedKeys.push('max_tokens');
      }
    }
    if (lower.includes('temperature') && 'temperature' in next) {
      if (/default.*\(?\s*1\s*\)?/i.test(err) && next.temperature !== 1) {
        next.temperature = 1;
      } else {
        delete next.temperature;
      }
      changedKeys.push('temperature');
    }
    if ((lower.includes('top_p') || lower.includes('topp')) && 'top_p' in next) {
      delete next.top_p;
      changedKeys.push('top_p');
    }
    if (lower.includes('reasoning_effort') && 'reasoning_effort' in next) {
      delete next.reasoning_effort;
      changedKeys.push('reasoning_effort');
    }
    if (/\bstop\b/i.test(err) && 'stop' in next) {
      delete next.stop;
      changedKeys.push('stop');
    }
    if (lower.includes('stream_options') && 'stream_options' in next) {
      delete next.stream_options;
      changedKeys.push('stream_options');
    }

    // Generic fallback for any other optional property explicitly named as unsupported/unknown
    if (changedKeys.length === 0) {
      const propMatch = err.match(
        /(?:property|parameter|field|argument)\s*['"`]([a-zA-Z0-9_]+)['"`]\s*(?:is\s*)?(?:unsupported|not supported|unknown|unrecognized|not allowed|not permitted)/i
      );
      const namedProp = propMatch?.[1];
      if (
        namedProp &&
        namedProp in next &&
        !['model', 'messages', 'stream'].includes(namedProp)
      ) {
        delete next[namedProp];
        changedKeys.push(namedProp);
      }
    }
  } else if (protocol === 'gemini_native') {
    const gc =
      next.generationConfig && typeof next.generationConfig === 'object'
        ? { ...(next.generationConfig as Record<string, unknown>) }
        : null;
    if (gc) {
      if ((lower.includes('topk') || lower.includes('top_k')) && 'topK' in gc) {
        delete gc.topK;
        changedKeys.push('generationConfig.topK');
      }
      if ((lower.includes('topp') || lower.includes('top_p')) && 'topP' in gc) {
        delete gc.topP;
        changedKeys.push('generationConfig.topP');
      }
      if (lower.includes('temperature') && 'temperature' in gc) {
        delete gc.temperature;
        changedKeys.push('generationConfig.temperature');
      }
      if (lower.includes('thinking') && 'thinkingConfig' in gc) {
        delete gc.thinkingConfig;
        changedKeys.push('generationConfig.thinkingConfig');
      }
      if (lower.includes('maxoutputtokens') && 'maxOutputTokens' in gc) {
        const clamped = clampTokenLimit(gc.maxOutputTokens);
        if (clamped !== null) {
          gc.maxOutputTokens = clamped;
          changedKeys.push('generationConfig.maxOutputTokens');
        }
      }
      next.generationConfig = gc;
    }
  } else if (protocol === 'anthropic_native') {
    if ((lower.includes('top_k') || lower.includes('topk')) && 'top_k' in next) {
      delete next.top_k;
      changedKeys.push('top_k');
    }
    if ((lower.includes('top_p') || lower.includes('topp')) && 'top_p' in next) {
      delete next.top_p;
      changedKeys.push('top_p');
    }
    if (lower.includes('temperature') && 'temperature' in next) {
      delete next.temperature;
      changedKeys.push('temperature');
    }
    if (lower.includes('max_tokens') && 'max_tokens' in next) {
      const clamped = clampTokenLimit(next.max_tokens);
      if (clamped !== null) {
        next.max_tokens = clamped;
        changedKeys.push('max_tokens');
      }
    }
  }

  return {
    adapted: changedKeys.length > 0,
    body: changedKeys.length > 0 ? next : body,
    changedKeys,
  };
}
