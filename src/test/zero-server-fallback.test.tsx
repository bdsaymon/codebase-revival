import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clientDirectCall,
  testProviderClientSide,
} from '../smfta/src/utils/apkClientFallback';
import {
  applyKeyToDraft,
  resolveGroqModel as clientResolveGroqModel,
} from '../smfta/src/utils/providers';
import { canonicalizeProviderEndpoint } from '../smfta/src/utils/providerProtocol';
import { DEFAULT_SETTINGS } from '../smfta/src/utils/settings';
import {
  POLLINATIONS_OPENAI_URL,
  XRAHAT_BASE_URL,
  buildProviderModelCandidates,
  resolveEffectiveProvider,
  resolveGroqModel as serverResolveGroqModel,
} from '../smfta/server/providers';
import {
  buildAdHocProviderConfig,
  callPublicKeylessJson,
} from '../smfta/server/aiClient';
import {
  extractReadySpeechChunks,
  requestGeminiFemaleSpeech,
  streamGeminiPcmSpeech,
} from '../smfta/src/utils/voiceEngine';

function makeSseStreamResponse(chunks: string[], contentType = 'text/event-stream') {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': contentType },
  });
}

describe('Zero-Server Static Fallback & Keyless Gateway Upgrade', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('routes gsk_ keys directly to Groq OpenAI-compatible SSE stream and normalizes non-Groq models', async () => {
    expect(clientResolveGroqModel('smfta-pro')).toBe('llama-3.3-70b-versatile');
    expect(clientResolveGroqModel('gemini-4-hydrogen')).toBe('llama-3.3-70b-versatile');
    expect(clientResolveGroqModel('smfta-flash')).toBe('llama-3.1-8b-instant');
    expect(clientResolveGroqModel('openai/gpt-4o')).toBe('llama-3.3-70b-versatile');
    expect(clientResolveGroqModel('openai/gpt-oss-120b')).toBe('openai/gpt-oss-120b');

    let capturedUrl = '';
    let capturedAuth = '';
    let capturedModel = '';
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      capturedUrl = String(url);
      const headers = (init?.headers || {}) as Record<string, string>;
      capturedAuth = headers.Authorization || headers.authorization || '';
      const parsedBody = JSON.parse(String(init?.body || '{}')) as { model?: string; stream?: boolean };
      capturedModel = parsedBody.model || '';
      expect(parsedBody.stream).toBe(true);
      return makeSseStreamResponse([
        'data: {"choices":[{"delta":{"content":"হ্যালো "}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"সায়মন!"}}]}\n\n',
        'data: [DONE]\n\n',
      ]);
    });

    const deltas: string[] = [];
    const reply = await clientDirectCall({
      provider: 'custom',
      externalKeys: 'gsk_live_test_key_123456',
      externalModel: 'smfta-pro',
      messages: [{ role: 'user', text: 'হাই' }],
      onDelta: (d) => deltas.push(d),
    });

    expect(capturedUrl).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(capturedAuth).toBe('Bearer gsk_live_test_key_123456');
    expect(capturedModel).toBe('llama-3.3-70b-versatile');
    expect(deltas.join('')).toBe('হ্যালো সায়মন!');
    expect(reply).toBe('হ্যালো সায়মন!');
  });

  it('streams directly from Gemini :streamGenerateContent?alt=sse when AIza key is provided', async () => {
    let capturedUrl = '';
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      capturedUrl = String(url);
      return makeSseStreamResponse([
        'data: {"candidates":[{"content":{"parts":[{"text":"Direct "}]}}]}\n\n',
        'data: {"candidates":[{"content":{"parts":[{"text":"Gemini OK"}]}}]}\n\n',
      ]);
    });

    const deltas: string[] = [];
    const reply = await clientDirectCall({
      provider: 'gemini_custom',
      externalKeys: 'AIzaSyTestDirectKey1234567890',
      externalModel: 'smfta-pro',
      messages: [{ role: 'user', text: 'Test direct Gemini' }],
      onDelta: (d) => deltas.push(d),
    });

    expect(capturedUrl).toContain(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=AIzaSyTestDirectKey1234567890'
    );
    expect(deltas.join('')).toBe('Direct Gemini OK');
    expect(reply).toBe('Direct Gemini OK');
  });

  it('streams directly from Custom OpenAI-compatible base URL', async () => {
    let capturedUrl = '';
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      capturedUrl = String(url);
      return makeSseStreamResponse([
        'data: {"choices":[{"delta":{"content":"Custom OK"}}]}\n\n',
        'data: [DONE]\n\n',
      ]);
    });

    const res = await testProviderClientSide({
      provider: 'custom',
      externalKeys: 'sk-custom-fixture-12345',
      externalModel: 'mercury-3',
      externalBaseUrl: 'https://my-gateway.example.com/v1',
    });

    expect(capturedUrl).toBe('https://my-gateway.example.com/v1/chat/completions');
    expect(res.ok).toBe(true);
    expect(res.workingModel).toBe('mercury-3');
  });

  it('replaces dead xrahat-worm-ai.vercel.app with Pollinations gateway on server & client', async () => {
    expect(XRAHAT_BASE_URL).toBe(POLLINATIONS_OPENAI_URL);
    expect(POLLINATIONS_OPENAI_URL).toBe('https://text.pollinations.ai/openai');
    expect(canonicalizeProviderEndpoint('xrahat').chatUrl).toBe(
      'https://text.pollinations.ai/openai'
    );
    expect(canonicalizeProviderEndpoint('smfta_cloud').chatUrl).toBe(
      'https://text.pollinations.ai/openai'
    );

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      const u = String(url);
      if (u === 'https://text.pollinations.ai/openai' && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: 'Pollinations Live Answer' } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('Gateway GET fallback', { status: 200 });
    });

    const clientKeylessReply = await clientDirectCall({
      provider: 'smfta_cloud',
      messages: [{ role: 'user', text: 'কেমন আছো?' }],
    });
    expect(clientKeylessReply).toBe('SMFTA Pro Live Answer');

    const serverKeylessReply = await callPublicKeylessJson({
      systemInstruction: 'You are helpful.',
      history: [{ role: 'user', content: 'Hello' }],
    });
    expect(serverKeylessReply).toBe('SMFTA Pro Live Answer');
  });

  it('resolves gsk_ and AIza keys cleanly across server routing and client draft updates', () => {
    expect(serverResolveGroqModel('smfta-pro')).toBe('llama-3.3-70b-versatile');
    expect(serverResolveGroqModel('openai/gpt-oss-120b')).toBe('openai/gpt-oss-120b');
    expect(buildProviderModelCandidates('groq', 'gemini-4-hydrogen')[0]).toBe(
      'llama-3.3-70b-versatile'
    );

    expect(resolveEffectiveProvider('custom', ['gsk_abc123456'], '')).toBe('groq');
    expect(resolveEffectiveProvider('xrahat', ['AIzaSyTestKey1234567890'], '')).toBe(
      'gemini_custom'
    );

    const adHocGroq = buildAdHocProviderConfig({
      provider: 'custom',
      externalKeys: 'gsk_abc123456',
      externalModel: 'smfta-pro',
    });
    expect(adHocGroq.effectiveProvider).toBe('groq');
    expect(adHocGroq.adHocProviders[0]?.provider.base_url).toBe(
      'https://api.groq.com/openai/v1/chat/completions'
    );
    expect(adHocGroq.adHocProviders[0]?.provider.models[0]?.model_id).toBe(
      'llama-3.3-70b-versatile'
    );

    const updatedDraft = applyKeyToDraft(
      { ...DEFAULT_SETTINGS, provider: 'custom', externalModel: 'gemini-4-hydrogen' },
      'gsk_live_key_999999'
    );
    expect(updatedDraft.provider).toBe('groq');
    expect(updatedDraft.externalBaseUrl).toBe('https://api.groq.com/openai/v1');
    expect(updatedDraft.externalModel).toBe('llama-3.3-70b-versatile');
  });

  it('forwards client AIza Gemini key in TTS calls, flags static HTML/404 for browser synthesis, and splits Bengali ।?! punctuation', async () => {
    localStorage.setItem(
      'smfta_settings',
      JSON.stringify({ externalKeys: 'AIzaSyClientVoiceKey123456' })
    );

    let capturedHeader = '';
    const mockFetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const hdrs = (init?.headers || {}) as Record<string, string>;
      capturedHeader = hdrs['x-gemini-key'] || '';
      return new Response('<!doctype html><html><body>Static SPA</body></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    });

    const unaryRes = await requestGeminiFemaleSpeech({
      text: 'হ্যালো, কেমন আছেন?',
      voiceName: 'Kore',
      fetchImpl: mockFetch as unknown as typeof fetch,
    });
    expect(capturedHeader).toBe('AIzaSyClientVoiceKey123456');
    expect(unaryRes.ok).toBe(false);
    expect(unaryRes.fallbackToBrowser).toBe(true);

    const streamRes = await streamGeminiPcmSpeech({
      text: 'হ্যালো, কেমন আছেন?',
      voiceName: 'Kore',
      onPcmChunk: () => {},
      fetchImpl: mockFetch as unknown as typeof fetch,
    });
    expect(streamRes.ok).toBe(false);
    expect(streamRes.fallbackToBrowser).toBe(true);

    const bnSplit = extractReadySpeechChunks(
      'আমি ভালো আছি। আপনি কেমন আছেন? দারুণ খবর!',
      0,
      true
    );
    expect(bnSplit.chunks).toEqual([
      'আমি ভালো আছি।',
      'আপনি কেমন আছেন?',
      'দারুণ খবর!',
    ]);
  });
});
