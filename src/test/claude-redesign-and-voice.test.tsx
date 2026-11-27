import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getCodeBlockDisplayMeta,
  shouldCollapseUserPrompt,
} from '../smfta/src/utils/chatDisplay';
import {
  WAVEFORM_BAR_COUNT,
  WAVEFORM_IDLE_LEVEL,
  computeVoiceEnergy,
  shiftWaveformHistory,
} from '../smfta/src/utils/voiceWaveform';
import { CollapsibleUserPrompt } from '../smfta/src/components/chat/CollapsibleUserPrompt';
import { InteractiveMessageContent } from '../smfta/src/components/InteractiveMessageContent';
import { VoiceWaveformBar } from '../smfta/src/components/VoiceWaveformBar';

describe('Claude Redesign: Prompt Collapsing, Code Artifact Boxes & Lovable Voice Waveform', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  it('decides prompt collapsing accurately by character count (800) or line count (12) and never collapses when attachments exist', () => {
    expect(shouldCollapseUserPrompt('Hello Claude')).toBe(false);
    expect(
      shouldCollapseUserPrompt(
        Array.from({ length: 12 }, (_, i) => `Line ${i + 1}`).join('\n')
      )
    ).toBe(false);
    expect(
      shouldCollapseUserPrompt(
        Array.from({ length: 13 }, (_, i) => `Line ${i + 1}`).join('\n')
      )
    ).toBe(true);
    expect(shouldCollapseUserPrompt('a'.repeat(800))).toBe(false);
    expect(shouldCollapseUserPrompt('a'.repeat(801))).toBe(true);
    expect(shouldCollapseUserPrompt('a'.repeat(1200), true)).toBe(false);
  });

  it('renders CollapsibleUserPrompt clamped by default for long prompts (>800 chars or >12 lines) and toggles cleanly via See more / See less', () => {
    const longPrompt = Array.from(
      { length: 14 },
      (_, i) =>
        `এই একটি অনেক বড় প্রম্পট লাইন ${i + 1} যেখানে সম্পূর্ণ ড্যাশবোর্ড অ্যাপ্লিকেশন এবং সেটিংস সাজিয়ে দেওয়া হচ্ছে।`
    ).join('\n');

    act(() => {
      root.render(<CollapsibleUserPrompt text={longPrompt} />);
    });

    const textEl = container.querySelector('[data-testid="user-prompt-text"]');
    const btnEl = container.querySelector(
      '[data-testid="user-prompt-see-more-btn"]'
    ) as HTMLButtonElement | null;

    expect(textEl?.className).toContain('line-clamp-6');
    expect(btnEl).not.toBeNull();
    expect(btnEl?.textContent).toContain('See more');
    expect(btnEl?.getAttribute('aria-expanded')).toBe('false');

    act(() => {
      btnEl?.click();
    });

    expect(textEl?.className).not.toContain('line-clamp-6');
    expect(btnEl?.textContent).toContain('See less');
    expect(btnEl?.getAttribute('aria-expanded')).toBe('true');

    // Prompts with attachments must never show See more toggle even if over 800 chars
    act(() => {
      root.render(
        <CollapsibleUserPrompt text={longPrompt} hasAttachments={true} />
      );
    });
    expect(
      container.querySelector('[data-testid="user-prompt-see-more-btn"]')
    ).toBeNull();

    // Short prompts must not show any See more toggle
    act(() => {
      root.render(<CollapsibleUserPrompt text="ছোট একটি প্রশ্ন" />);
    });
    expect(
      container.querySelector('[data-testid="user-prompt-see-more-btn"]')
    ).toBeNull();
  });

  it('collapses large code blocks by default to prevent chat bloat and lets user expand or open in viewer', () => {
    const largeTsx = Array.from({ length: 24 }, (_, i) => `const line${i} = ${i};`).join('\n');
    const largeMeta = getCodeBlockDisplayMeta(largeTsx, 'tsx');
    expect(largeMeta.collapseByDefault).toBe(true);
    expect(largeMeta.lineCount).toBe(24);

    const shortMeta = getCodeBlockDisplayMeta('npm run build\nnpm run lint', 'bash');
    expect(shortMeta.collapseByDefault).toBe(false);

    const openLabSpy = vi.fn();
    const markdown = [
      '## ক্যালকুলেটর অ্যাপ তৈরি হলো',
      '',
      '```tsx',
      'export function CalculatorWidget() {',
      ...Array.from({ length: 18 }, (_, i) => `  const step${i} = ${i} * 2;`),
      '  return null;',
      '}',
      '```',
      '',
      '<file path="README.md" title="Project Guide" type="markdown">',
      '# Guide\nDetails inside box.',
      '</file>',
    ].join('\n');

    act(() => {
      root.render(
        <InteractiveMessageContent
          messageId="m-1"
          text={markdown}
          onUpdateMessageText={vi.fn()}
          onDismissSuggestion={vi.fn()}
          onAcceptSuggestion={vi.fn()}
          onOpenCodeLab={openLabSpy}
          onToast={vi.fn()}
        />
      );
    });

    // Collapsed large code block box renders instead of dumping raw <pre>
    const codeBox = container.querySelector('[data-testid="chat-code-block"]');
    expect(codeBox?.getAttribute('data-collapsed')).toBe('true');
    expect(codeBox?.textContent).toContain('CalculatorWidget (TSX)');
    expect(container.querySelector('[data-testid="chat-code-source-pre"]')).toBeNull();

    // Named <file> artifact box shows crisp title & metadata
    const fileCard = container.querySelector('[data-testid="claude-file-artifact-card"]');
    expect(fileCard?.textContent).toContain('Project Guide');
    expect(fileCard?.textContent).toContain('README.md');

    // Expand toggle reveals raw code inline smoothly
    const toggleBtn = container.querySelector(
      '[data-testid="toggle-code-collapse-btn"]'
    ) as HTMLButtonElement | null;
    expect(toggleBtn).not.toBeNull();
    act(() => {
      toggleBtn?.click();
    });

    const expandedBox = container.querySelector('[data-testid="chat-code-block"]');
    expect(expandedBox?.getAttribute('data-collapsed')).toBe('false');
    expect(
      container.querySelector('[data-testid="chat-code-source-pre"]')
    ).not.toBeNull();
  });

  it('computes gated live voice amplitude and shifts waveform history right-to-left', () => {
    const silenceTime = new Uint8Array(64).fill(128);
    const silenceFreq = new Uint8Array(32).fill(0);
    expect(computeVoiceEnergy(silenceTime, silenceFreq)).toBe(WAVEFORM_IDLE_LEVEL);

    const activeTime = new Uint8Array(64).map((_, idx) => (idx % 2 === 0 ? 185 : 70));
    const activeFreq = new Uint8Array(32).fill(130);
    const speechEnergy = computeVoiceEnergy(activeTime, activeFreq);
    expect(speechEnergy).toBeGreaterThan(0.5);

    const initial = Array.from({ length: WAVEFORM_BAR_COUNT }, () => WAVEFORM_IDLE_LEVEL);
    const shifted = shiftWaveformHistory(initial, speechEnergy, WAVEFORM_BAR_COUNT);
    expect(shifted).toHaveLength(WAVEFORM_BAR_COUNT);
    expect(shifted[0]).toBe(WAVEFORM_IDLE_LEVEL);
    expect(shifted[WAVEFORM_BAR_COUNT - 1]).toBeGreaterThan(0.4);
  });

  it('wires VoiceWaveformBar AnalyserNode through a zero-gain sink so live audio frames pull cleanly', () => {
    const connectCalls: string[] = [];
    const mockZeroGain = {
      gain: { value: 1 },
      connect: vi.fn((dest: unknown) => {
        connectCalls.push(`gain->${String(dest)}`);
      }),
      disconnect: vi.fn(),
    };
    const mockAnalyser = {
      fftSize: 128,
      frequencyBinCount: 64,
      smoothingTimeConstant: 0.65,
      connect: vi.fn(() => {
        connectCalls.push('analyser->gain');
      }),
      disconnect: vi.fn(),
      getByteTimeDomainData: vi.fn((arr: Uint8Array) => arr.fill(128)),
      getByteFrequencyData: vi.fn((arr: Uint8Array) => arr.fill(0)),
    };
    const mockSource = {
      connect: vi.fn(() => {
        connectCalls.push('source->analyser');
      }),
      disconnect: vi.fn(),
    };
    class MockAudioContext {
      state = 'running';
      destination = 'AUDIO_DEST';
      resume = vi.fn(async () => {});
      close = vi.fn(async () => {});
      createMediaStreamSource = vi.fn(() => mockSource);
      createAnalyser = vi.fn(() => mockAnalyser);
      createGain = vi.fn(() => mockZeroGain);
    }

    (window as unknown as { AudioContext: typeof AudioContext }).AudioContext =
      MockAudioContext as unknown as typeof AudioContext;

    const fakeStream = {
      getAudioTracks: () => [{ readyState: 'live', enabled: true }],
    } as unknown as MediaStream;

    const onCancel = vi.fn();
    const onConfirm = vi.fn();

    act(() => {
      root.render(
        <VoiceWaveformBar
          isListening={true}
          audioStream={fakeStream}
          liveText="হ্যালো ক্লড"
          onCancel={onCancel}
          onConfirm={onConfirm}
        />
      );
    });

    expect(mockZeroGain.gain.value).toBe(0);
    expect(connectCalls).toEqual([
      'source->analyser',
      'analyser->gain',
      'gain->AUDIO_DEST',
    ]);
    expect(
      container.querySelector('[data-testid="voice-live-preview"]')?.textContent
    ).toBe('হ্যালো ক্লড');

    const bars = container.querySelectorAll('[data-testid="voice-waveform-bars"] span');
    expect(bars).toHaveLength(WAVEFORM_BAR_COUNT);

    (
      container.querySelector('[data-testid="voice-confirm-btn"]') as HTMLButtonElement
    )?.click();
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
