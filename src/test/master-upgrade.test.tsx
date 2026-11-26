import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveVoiceOverlay, LiveVoiceOverlayProps } from '../smfta/src/components/LiveVoiceOverlay';
import { ProvidersApiSection, ProvidersApiSectionProps } from '../smfta/src/components/settings/ProvidersApiSection';
import { DEFAULT_SETTINGS } from '../smfta/src/utils/settings';
import { DEFAULT_BUILTIN_PROFILE } from '../smfta/src/utils/providers';
import { dispatchToLegacyApp } from '../smfta/server/runtime/dispatch';
import { normalizeGeminiModelName, buildAdHocProviderConfig } from '../smfta/server/aiClient';

class MockAudioContext {
  state: AudioContextState = 'running';
  currentTime = 0;
  destination = {};
  resume = vi.fn().mockResolvedValue(undefined);
  createAnalyser() {
    return {
      fftSize: 256,
      smoothingTimeConstant: 0.65,
      context: this,
      connect: vi.fn(),
      disconnect: vi.fn(),
      getByteTimeDomainData: (arr: Uint8Array) => arr.fill(128),
      getByteFrequencyData: (arr: Uint8Array) => arr.fill(42),
    };
  }
  createBiquadFilter() {
    return {
      type: 'lowshelf',
      frequency: { value: 0 },
      Q: { value: 0 },
      gain: { value: 0 },
      connect: vi.fn(),
    };
  }
  createDynamicsCompressor() {
    return {
      threshold: { value: 0 },
      knee: { value: 0 },
      ratio: { value: 0 },
      attack: { value: 0 },
      release: { value: 0 },
      connect: vi.fn(),
    };
  }
  createGain() {
    return {
      gain: { value: 0 },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
  }
  createMediaStreamSource() {
    return {
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
  }
  createBuffer(_ch: number, len: number, sr: number) {
    return {
      duration: len / sr,
      copyToChannel: vi.fn(),
    };
  }
  createBufferSource() {
    const src = {
      buffer: null as unknown,
      playbackRate: { value: 1 },
      detune: { value: 0 },
      onended: null as (() => void) | null,
      connect: vi.fn(),
      disconnect: vi.fn(),
      stop: vi.fn(),
      start: vi.fn(() => {
        window.setTimeout(() => {
          src.onended?.();
        }, 120);
      }),
    };
    return src;
  }
  decodeAudioData() {
    return Promise.resolve({
      duration: 0.12,
    });
  }
}

class MockSpeechRecognition {
  static instances: MockSpeechRecognition[] = [];
  lang = 'bn-BD';
  interimResults = true;
  continuous = true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onresult: ((e: any) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    MockSpeechRecognition.instances.push(this);
  }
  start() {}
  stop() {}
  abort() {}
}

const flush = (ms = 40) =>
  act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });

function baseVoiceProps(overrides: Partial<LiveVoiceOverlayProps> = {}): LiveVoiceOverlayProps {
  return {
    isOpen: true,
    chatId: 88,
    userName: 'Saymon',
    preferredLang: 'bn-BD',
    preferredVoice: 'Kore',
    isGenerating: false,
    messages: [],
    lastUserText: '',
    lastAiMessage: null,
    onSendText: vi.fn(),
    onEndCall: vi.fn(),
    ...overrides,
  };
}

function baseProvidersProps(
  overrides: Partial<ProvidersApiSectionProps> = {}
): ProvidersApiSectionProps {
  return {
    draft: { ...DEFAULT_SETTINGS },
    patch: vi.fn(),
    localProfiles: [DEFAULT_BUILTIN_PROFILE],
    activeProfile: DEFAULT_BUILTIN_PROFILE,
    onActivateProfile: vi.fn(),
    onUpdateProfileField: vi.fn(),
    onDeleteProfile: vi.fn(),
    onMovePriority: vi.fn(),
    onTestProfile: vi.fn(),
    onRefreshProfileModels: vi.fn(),
    newPropName: '',
    setNewPropName: vi.fn(),
    newProviderId: 'custom',
    onChangeNewProviderId: vi.fn(),
    newApiKey: '',
    onChangeNewApiKey: vi.fn(),
    showNewKey: false,
    setShowNewKey: vi.fn(),
    newBaseUrl: '',
    setNewBaseUrl: vi.fn(),
    newModel: 'gpt-4o-mini',
    setNewModel: vi.fn(),
    newCustomHeaders: '',
    setNewCustomHeaders: vi.fn(),
    newCustomParams: '',
    setNewCustomParams: vi.fn(),
    showAdvancedOptions: true,
    setShowAdvancedOptions: vi.fn(),
    profileAdvancedOpen: {},
    setProfileAdvancedOpen: vi.fn(),
    candidateModelsForNew: [],
    detectedProviderFromNewKey: null,
    isLoadingModels: false,
    discoveryWarning: null,
    onFetchNewModels: vi.fn(),
    isVerifyingNew: false,
    newVerifyResult: null,
    onSaveWithoutVerification: vi.fn(),
    onVerifyAndAddProvider: vi.fn(),
    testingProfileId: null,
    loadingModelsForId: null,
    revealedKeyIds: {},
    setRevealedKeyIds: vi.fn(),
    editingProfileId: null,
    setEditingProfileId: vi.fn(),
    telemetryLogs: [],
    usageToday: 0,
    ...overrides,
  };
}

describe('SMFTA AI Pro Master Upgrade UI & Audio Engine Verification', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    MockSpeechRecognition.instances = [];

    const track = {
      enabled: true,
      readyState: 'live',
      stop: vi.fn(),
      onended: null,
    };
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => true,
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getAudioTracks: () => [track],
          getTracks: () => [track],
        }),
      },
    });
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
    (window as unknown as Record<string, unknown>).AudioContext = MockAudioContext;
    (window as unknown as Record<string, unknown>).SpeechRecognition = MockSpeechRecognition;
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition = MockSpeechRecognition;

    const canvasCtxStub = new Proxy(
      {
        createRadialGradient: () => ({ addColorStop: vi.fn() }),
        createLinearGradient: () => ({ addColorStop: vi.fn() }),
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        globalCompositeOperation: 'source-over',
      },
      {
        get(target, prop) {
          return prop in target ? target[prop as keyof typeof target] : vi.fn();
        },
        set(target, prop, value) {
          (target as Record<PropertyKey, unknown>)[prop] = value;
          return true;
        },
      }
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      canvasCtxStub as unknown as CanvasRenderingContext2D
    );

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('renders Glassmorphism Voice Stage, Quantum Waveform, and Bengali/English ambient status badges', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: 'tts off' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    await act(async () => {
      root.render(<LiveVoiceOverlay {...baseVoiceProps({ isGenerating: false })} />);
    });
    await flush(700);

    const glassStage = container.querySelector('[data-testid="live-voice-glass-stage"]');
    const badge = container.querySelector('[data-testid="live-voice-status-badge"]');
    const waveform = container.querySelector('[data-testid="live-voice-quantum-waveform"]');

    expect(glassStage).not.toBeNull();
    expect(badge?.textContent || '').toContain('শুনছি...');
    expect(badge?.textContent || '').toContain('Listening');
    expect(waveform?.querySelectorAll('.live-voice-quantum-bar')).toHaveLength(16);

    // Thinking state renders "চিন্তা করছি..." (Thinking)
    await act(async () => {
      root.render(<LiveVoiceOverlay {...baseVoiceProps({ isGenerating: true })} />);
    });
    await flush(30);
    expect(container.querySelector('[data-testid="live-voice-status-badge"]')?.textContent || '').toContain(
      'চিন্তা করছি...'
    );
  });

  it('uses 1500ms STT commit threshold and prefetches next coalesced speech chunk after playback succeeds', async () => {
    const requestedTexts: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      const u = String(url);
      if (u === '/api/voice/tts-stream') {
        return new Response(JSON.stringify({ ok: false, retryUnaryTts: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (u === '/api/voice/tts') {
        const body = JSON.parse(String(init?.body || '{}')) as { text?: string };
        requestedTexts.push(body.text || '');
        return new Response(
          JSON.stringify({
            ok: true,
            audioBase64: 'UklGRgAAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=',
            modelUsed: 'gemini-3.8-live',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    await act(async () => {
      root.render(<LiveVoiceOverlay {...baseVoiceProps()} />);
    });
    await flush(250);
    requestedTexts.length = 0;

    // 2 chunks (> 850 total) trigger coalescing + prefetch of chunk 1 while chunk 0 plays
    const partA = 'First long response block that fills near the natural breath target cleanly. '.repeat(11);
    const partB = 'Second spoken block queued right behind it for seamless prefetching playback.';
    await act(async () => {
      root.render(
        <LiveVoiceOverlay
          {...baseVoiceProps({
            isGenerating: false,
            lastAiMessage: { id: 'ai-prefetch-1', text: `${partA} ${partB}` },
          })}
        />
      );
    });
    await flush(320);

    // Both chunk 0 (~814 chars) and prefetched chunk 1 should be fetched cleanly without robotic stalls
    expect(requestedTexts.length).toBeGreaterThanOrEqual(2);
    expect(requestedTexts[0]?.length).toBeLessThanOrEqual(850);

    // Verify 1500ms pause threshold before committing Web Speech utterance
    const onSendText = vi.fn();
    await act(async () => {
      root.render(<LiveVoiceOverlay {...baseVoiceProps({ onSendText })} />);
    });
    await flush(250);
    const rec = MockSpeechRecognition.instances[MockSpeechRecognition.instances.length - 1];
    expect(rec).toBeDefined();
    await act(async () => {
      rec!.onresult?.({
        results: [{ isFinal: true, 0: { transcript: 'আমি বাংলায় কথা বলছি' } }],
      });
    });
    await flush(1100);
    expect(onSendText).not.toHaveBeenCalled();
    await flush(550);
    expect(onSendText).toHaveBeenCalledTimes(1);
  });

  it('displays Bengali JSON syntax validation alert in ProvidersApiSection when custom JSON is invalid', async () => {
    const onChangeParams = vi.fn();
    await act(async () => {
      root.render(
        <ProvidersApiSection
          {...baseProvidersProps({
            newCustomParams: '{"endpoint": "https://api.openai.com/v1", badJson',
            setNewCustomParams: onChangeParams,
          })}
        />
      );
    });

    const errBanner = container.querySelector('[data-testid="provider-json-validation-error"]');
    expect(errBanner).not.toBeNull();
    expect(errBanner?.textContent || '').toContain('JSON ফরম্যাট সঠিক নয়');

    const presetBtn = container.querySelector('[data-testid="provider-json-preset-btn"]') as HTMLButtonElement;
    expect(presetBtn).not.toBeNull();
    await act(async () => {
      presetBtn.click();
    });
    expect(onChangeParams).toHaveBeenCalled();
    expect(onChangeParams.mock.calls[0]?.[0]).toContain('requestFormat');
  });

  it('returns 204 with Vercel CORS headers on OPTIONS preflight from dispatchToLegacyApp', async () => {
    const preflight = await dispatchToLegacyApp(
      new Request('https://smfta.vercel.app/api/chat/stream', {
        method: 'OPTIONS',
        headers: { origin: 'https://smfta.vercel.app' },
      })
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe('https://smfta.vercel.app');
    expect(preflight.headers.get('Access-Control-Allow-Headers') || '').toContain('X-Gemini-Key');
  });

  it('maps V1 & V2 model names to verified working Gemini backends and respects apiKeyOverride', () => {
    expect(normalizeGeminiModelName('smfta-flash')).toBe('gemini-3.1-flash-lite');
    expect(normalizeGeminiModelName('smfta-pro')).toBe('gemini-3-flash-preview');
    expect(normalizeGeminiModelName('smfta-ultra')).toBe('gemini-3-flash-preview');
    expect(normalizeGeminiModelName('smfta-v5')).toBe('gemini-3.5-flash-lite');
    expect(normalizeGeminiModelName('smfta-max')).toBe('gemini-3-flash-preview');
    expect(normalizeGeminiModelName('gemini-3.8-flash')).toBe('gemini-3-flash-preview');
    expect(normalizeGeminiModelName('gemini-3.5-flash-lite')).toBe('gemini-3.5-flash-lite');

    const built = buildAdHocProviderConfig({
      provider: 'gemini_custom',
      externalModel: 'smfta-pro',
      apiKeyOverride: 'AIza_header_override',
    });
    expect(built.adHocProviders.length).toBeGreaterThan(0);
    expect(built.adHocProviders[0]?.rawKeys[0]).toBe('AIza_header_override');
    expect(built.adHocProviders[0]?.provider.models[0]?.model_id).toBe('gemini-3-flash-preview');
  });
});
