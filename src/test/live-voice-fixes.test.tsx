import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveVoiceOverlay, LiveVoiceOverlayProps } from '../smfta/src/components/LiveVoiceOverlay';
import { applySkillDirectiveToMessages } from '../smfta/src/utils/selfEngine';

interface MockTrack {
  enabled: boolean;
  readyState: string;
  stop: ReturnType<typeof vi.fn>;
  onended: (() => void) | null;
}

class MockSpeechRecognition {
  static instances: MockSpeechRecognition[] = [];
  lang = 'en-US';
  interimResults = true;
  continuous = true;
  started = false;
  aborted = false;
  stopped = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onresult: ((e: any) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor() {
    MockSpeechRecognition.instances.push(this);
  }
  start() {
    this.started = true;
  }
  stop() {
    this.stopped = true;
  }
  abort() {
    this.aborted = true;
  }
}

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
      getByteFrequencyData: (arr: Uint8Array) => arr.fill(0),
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
        }, 15);
      }),
    };
    return src;
  }
  decodeAudioData() {
    return Promise.resolve({
      duration: 0.05,
    });
  }
}

const flush = (ms = 30) =>
  act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });

function createBaseProps(
  overrides: Partial<LiveVoiceOverlayProps> = {}
): LiveVoiceOverlayProps {
  return {
    isOpen: true,
    chatId: 101,
    userName: 'Saymon',
    preferredLang: 'en-US',
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

describe('SMFTA AI Pro Live Voice 8-defect regression suite', () => {
  let container: HTMLDivElement;
  let root: Root;
  let mockTrack: MockTrack;

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    MockSpeechRecognition.instances = [];

    mockTrack = {
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
          getAudioTracks: () => [mockTrack],
          getTracks: () => [mockTrack],
        }),
      },
    });

    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
    (window as unknown as Record<string, unknown>).AudioContext = MockAudioContext;
    (window as unknown as Record<string, unknown>).SpeechRecognition = MockSpeechRecognition;
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition = MockSpeechRecognition;

    // Minimal canvas context stub so 60fps orb/waveform mount cleanly in jsdom
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
          if (prop in target) {
            return target[prop as keyof typeof target];
          }
          return vi.fn();
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

  it('1. prevents continuous SpeechRecognition prefix duplication and 4. clears partial transcript on close/reopen', async () => {
    // Immediate failing TTS so greeting finishes cleanly & transitions to listening
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: 'tts off' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const props = createBaseProps();
    await act(async () => {
      root.render(<LiveVoiceOverlay {...props} />);
    });
    await flush(750);

    const rec = MockSpeechRecognition.instances[MockSpeechRecognition.instances.length - 1];
    expect(rec).toBeDefined();

    // Emit multiple continuous onresult events that previously compounded recognitionFinalPrefixRef
    await act(async () => {
      rec!.onresult?.({
        results: [{ isFinal: true, 0: { transcript: 'hello' } }],
      });
      rec!.onresult?.({
        results: [
          { isFinal: true, 0: { transcript: 'hello' } },
          { isFinal: true, 0: { transcript: 'world' } },
          { isFinal: false, 0: { transcript: 'how are' } },
        ],
      });
    });

    const timeline = container.querySelector('[data-testid="live-voice-timeline"]');
    expect(timeline?.textContent || '').toContain('hello world how are');
    expect(timeline?.textContent || '').not.toContain('hello hello');

    // Now close and reopen — partial transcript must NOT leak!
    await act(async () => {
      root.render(<LiveVoiceOverlay {...createBaseProps({ isOpen: false })} />);
    });
    await flush(30);
    await act(async () => {
      root.render(<LiveVoiceOverlay {...createBaseProps({ isOpen: true })} />);
    });
    await flush(50);

    const reopenedText = container.textContent || '';
    expect(reopenedText).not.toContain('hello world');
    expect(reopenedText).not.toContain('how are');
  });

  it('2. clears staged & shared images across chatId switches and 8. renders single deduplicated staged preview', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: 'tts off' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    class MockFileReader {
      result = 'data:image/png;base64,QUFB';
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL() {
        this.onload?.();
      }
    }
    vi.stubGlobal('FileReader', MockFileReader);

    await act(async () => {
      root.render(<LiveVoiceOverlay {...createBaseProps({ chatId: 1 })} />);
    });
    await flush(60);

    const fileInput = container.querySelector(
      '[data-testid="live-voice-image-input"]'
    ) as HTMLInputElement;
    const imgFile = new File(['abc'], 'diagram.png', { type: 'image/png' });

    await act(async () => {
      Object.defineProperty(fileInput, 'files', {
        configurable: true,
        value: [imgFile],
      });
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flush(40);

    // Fix 8: Exactly one preview card and one remove button (no duplicate footer card)
    expect(container.querySelectorAll('[data-testid="live-voice-image-preview-card"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-testid^="live-voice-remove-img-"]')).toHaveLength(1);
    expect(container.querySelector('[data-testid="live-voice-img-card-0"]')).toBeNull();

    // Picking the same image again must deduplicate
    await act(async () => {
      Object.defineProperty(fileInput, 'files', {
        configurable: true,
        value: [imgFile],
      });
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flush(40);
    expect(container.querySelectorAll('[data-testid="live-voice-image-preview-card"]')).toHaveLength(1);

    // Fix 2: Switching chatId must wipe staged/shared images cleanly
    await act(async () => {
      root.render(<LiveVoiceOverlay {...createBaseProps({ chatId: 2 })} />);
    });
    await flush(40);
    expect(container.querySelectorAll('[data-testid="live-voice-image-preview-card"]')).toHaveLength(0);

    vi.unstubAllGlobals();
  });

  it('3. Escape closes fullscreen lightbox or keyboard drawer and NEVER calls onEndCall', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: 'tts off' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const onEndCall = vi.fn();

    await act(async () => {
      root.render(<LiveVoiceOverlay {...createBaseProps({ onEndCall })} />);
    });
    await flush(50);

    const kbToggle = container.querySelector('[data-testid="live-voice-keyboard-toggle"]') as HTMLButtonElement;
    await act(async () => {
      kbToggle.click();
    });
    expect(container.querySelector('[data-testid="live-voice-input"]')).not.toBeNull();

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(container.querySelector('[data-testid="live-voice-input"]')).toBeNull();
    expect(onEndCall).not.toHaveBeenCalled();

    // Pressing Escape again while nothing modal is open also must NOT end the call
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onEndCall).not.toHaveBeenCalled();
  });

  it('5. applySkillDirectiveToMessages preserves user image attachments alongside custom skill instructions', () => {
    const msgs = applySkillDirectiveToMessages(
      [
        {
          role: 'user',
          text: 'Inspect this screenshot please.',
          imgs: [{ mime: 'image/png', data: 'iVBORw0KGgo=' }],
        },
      ],
      'Always reply with bullet points.'
    );

    expect(msgs).toHaveLength(1);
    expect(msgs[0]?.text).toContain('Inspect this screenshot please.');
    expect(msgs[0]?.text).toContain('[SELF-BUILT SKILL DIRECTIVE]');
    expect(msgs[0]?.text).toContain('Always reply with bullet points.');
    expect(msgs[0]?.imgs).toEqual([{ mime: 'image/png', data: 'iVBORw0KGgo=' }]);
  });

  it('6. halts multi-chunk TTS pipeline cleanly after unary failure instead of spinning on remaining chunks', async () => {
    const ttsUrls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const u = String(url);
      ttsUrls.push(u);
      return new Response(JSON.stringify({ ok: false, error: 'TTS failed' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    await act(async () => {
      root.render(
        <LiveVoiceOverlay
          {...createBaseProps({
            lastAiMessage: null,
          })}
        />
      );
    });
    // Wait for greeting to fail cleanly and go to listening
    await flush(450);
    ttsUrls.length = 0;

    // Now deliver a 3-sentence (> 600 char if needed, or 3 separate ready sentences) AI reply
    const multiSentence =
      `${'First long sentence with many words to avoid coalescing all of them into one request. '.repeat(7)}Second sentence fails recovery check. Third sentence should be cleared instead of hammering TTS!`;
    await act(async () => {
      root.render(
        <LiveVoiceOverlay
          {...createBaseProps({
            isGenerating: false,
            lastAiMessage: { id: 'ai-multi-1', text: multiSentence },
          })}
        />
      );
    });

    // Greeting ran; wait for retry (320ms) + settle
    await flush(550);

    // 1 PCM stream attempt + 2 unary retries for coalesced chunk 0 = 3 fetch calls max.
    // Remaining chunks must be dropped once chunk 0 fails terminally!
    const unaryCalls = ttsUrls.filter((u) => u === '/api/voice/tts');
    expect(unaryCalls.length).toBe(2);
  });

  it('7. keeps mic disabled and blocks SpeechRecognition during initial greeting synthesis even with prior lastAiMessage', async () => {
    let resolveGreetingStream!: (res: Response) => void;
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (url) =>
        new Promise<Response>((resolve) => {
          if (String(url).includes('/api/voice/tts-stream')) {
            resolveGreetingStream = resolve;
          } else {
            resolve(
              new Response(JSON.stringify({ ok: false, error: 'off' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
              })
            );
          }
        })
    );

    await act(async () => {
      root.render(
        <LiveVoiceOverlay
          {...createBaseProps({
            lastAiMessage: { id: 'prev-ai-1', text: 'Previous completed reply.' },
          })}
        />
      );
    });

    // Wait > 250ms (past the 200ms auto-listen timer!) while greeting stream is still in flight
    await flush(280);

    expect(mockTrack.enabled).toBe(false);
    expect(MockSpeechRecognition.instances).toHaveLength(0);

    // Now let greeting stream fail cleanly -> unary fails -> greeting ends -> mic activates
    await act(async () => {
      resolveGreetingStream(
        new Response(JSON.stringify({ ok: false, retryUnaryTts: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });
    await flush(750);

    expect(mockTrack.enabled).toBe(true);
    expect(MockSpeechRecognition.instances.length).toBeGreaterThanOrEqual(1);
  });
});
