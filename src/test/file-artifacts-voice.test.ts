import { describe, it, expect } from 'vitest';
import {
  extractFileArtifacts,
  inferLanguageFromFilenameOrType,
} from '../smfta/src/utils/fileArtifacts';
import { buildArtifactSrcDoc } from '../smfta/src/components/ClaudeArtifactPanel';
import { extractThinkingTopic } from '../smfta/src/components/InteractiveMessageContent';
import {
  accumulateSpeechResults,
  mergeVoiceLiveTranscript,
  requestServerVoiceTranscription,
  shouldPollRollingVoiceTranscript,
} from '../smfta/src/utils/voiceEngine';
import {
  deriveInitialThinkingTopic,
  formatThinkingParagraphs,
  formatThinkingTopicLead,
} from '../smfta/src/utils/thinking';
import {
  sortV2ModelsFlashFirst,
  V2_SPECIAL_MODELS,
} from '../smfta/src/utils/v2UsageLimits';
import { sanitizeSettings } from '../smfta/src/utils/settings';

describe('Claude-style File Artifact & Markdown/ZIP Engine', () => {
  it('extracts <smfta_artifact> .md files cleanly with inline placeholder tokens', () => {
    const input = `এখানে আপনার প্রজেক্ট প্ল্যান দেওয়া হলো:\n\n<smfta_artifact filename="roadmap.md" title="প্রজেক্ট রোডম্যাপ" type="markdown">\n# ধাপ ১\n- কাজ শুরু করুন\n- ডেপ্লয় করুন\n</smfta_artifact>\n\nপ্রয়োজনে ডাউনলোড করে নিন।`;
    const res = extractFileArtifacts(input);

    expect(res.artifacts).toHaveLength(1);
    expect(res.artifacts[0].filename).toBe('roadmap.md');
    expect(res.artifacts[0].title).toBe('প্রজেক্ট রোডম্যাপ');
    expect(res.artifacts[0].lang).toBe('markdown');
    expect(res.artifacts[0].content).toContain('# ধাপ ১');
    expect(res.processedText).toContain('[[SMFTA_ARTIFACT_0]]');
    expect(res.processedText).not.toContain('<smfta_artifact');
  });

  it('extracts multi-file bundles from <smfta_artifact> and named code fences', () => {
    const input = `<smfta_artifact filename="index.html" title="Landing Page" type="html">\n<h1>Hello</h1>\n</smfta_artifact>\n\n\`\`\`css styles.css\nbody { color: #222; }\n\`\`\``;
    const res = extractFileArtifacts(input);

    expect(res.artifacts).toHaveLength(2);
    expect(res.artifacts[0].filename).toBe('index.html');
    expect(res.artifacts[0].lang).toBe('html');
    expect(res.artifacts[1].filename).toBe('styles.css');
    expect(res.artifacts[1].lang).toBe('css');
  });

  it('handles active streaming unclosed <smfta_artifact> tags gracefully', () => {
    const partial = `তৈরি হচ্ছে:\n<smfta_artifact filename="spec.md" title="স্পেসিফিকেশন" type="markdown">\n# শিরোনাম\nচলমান টেক্সট...`;
    const res = extractFileArtifacts(partial, { isStreaming: true });

    expect(res.artifacts).toHaveLength(1);
    expect(res.artifacts[0].isStreaming).toBe(true);
    expect(res.artifacts[0].filename).toBe('spec.md');
    expect(res.artifacts[0].content).toContain('চলমান টেক্সট...');
  });

  it('renders Markdown artifacts into formatted HTML preview instead of raw text', () => {
    const md = `# প্রজেক্ট প্ল্যান\n\n- [x] ভয়েস ওয়েভফর্ম\n- [ ] জিপ ডাউনলোড\n\n| নাম | স্ট্যাটাস |\n| --- | --- |\n| MD | রেডি |`;
    const html = buildArtifactSrcDoc(md, 'markdown');

    expect(html).toContain('<h1>প্রজেক্ট প্ল্যান</h1>');
    expect(html).toContain('<input type="checkbox" disabled checked />');
    expect(html).toContain('<th>নাম</th>');
    expect(html).toContain('<th>স্ট্যাটাস</th>');
  });

  it('infers file language accurately from filename extensions', () => {
    expect(inferLanguageFromFilenameOrType('plan.md')).toBe('markdown');
    expect(inferLanguageFromFilenameOrType('app.html')).toBe('html');
    expect(inferLanguageFromFilenameOrType('data.json')).toBe('json');
    expect(inferLanguageFromFilenameOrType('script.py')).toBe('python');
  });
});

describe('Hybrid Voice Input & Editorial Thinking Formatting', () => {
  it('accumulates SpeechRecognition results across session restarts without dropping text', () => {
    const r = accumulateSpeechResults(
      [
        { isFinal: true, 0: { transcript: 'কেমন আছো' } },
        { isFinal: false, 0: { transcript: 'তুমি' } },
      ],
      'হ্যালো'
    );
    expect(r.finalPrefix).toBe('হ্যালো কেমন আছো');
    expect(r.liveTranscript).toBe('হ্যালো কেমন আছো তুমি');
  });

  it('calls /api/voice/transcribe cleanly and normalizes server transcription response', async () => {
    let seenUrl = '';
    const res = await requestServerVoiceTranscription({
      audioBase64: 'AAAA',
      mimeType: 'audio/webm',
      language: 'bn-BD',
      fetchImpl: (async (url: RequestInfo | URL) => {
        seenUrl = String(url);
        return new Response(
          JSON.stringify({ ok: true, text: 'হ্যালো, কেমন আছো?', modelUsed: 'gemini-3.5-transcribe' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }) as typeof fetch,
    });
    expect(seenUrl).toBe('/api/voice/transcribe');
    expect(res.ok).toBe(true);
    expect(res.text).toBe('হ্যালো, কেমন আছো?');
    expect(res.modelUsed).toBe('gemini-3.5-transcribe');
  });

  it('formats Thinking step headers without raw markdown asterisks', () => {
    const blocks = formatThinkingParagraphs(
      '**Initiating Calculation Process**\n\nStep **one**: check inputs.\n- break down **17 * 13**'
    );
    expect(blocks[0]?.title).toBe('Initiating Calculation Process');
    expect(blocks[1]?.body).toContain('Step one: check inputs.');
    expect(blocks[1]?.body).toContain('• break down 17 * 13');
    expect(blocks[1]?.body).not.toContain('**');
  });

  it('merges Web Speech live text and rolling server fallback captions cleanly', () => {
    expect(mergeVoiceLiveTranscript('', 'আমি বাংলাদেশ থেকে বলছি')).toBe(
      'আমি বাংলাদেশ থেকে বলছি'
    );
    expect(mergeVoiceLiveTranscript('কেমন আছো', '')).toBe('কেমন আছো');
    expect(
      shouldPollRollingVoiceTranscript({
        isListening: true,
        hasWebSpeechText: false,
        totalChunkBytes: 1200,
        inFlight: false,
        liveCaptionsEnabled: true,
      })
    ).toBe(true);
    expect(
      shouldPollRollingVoiceTranscript({
        isListening: true,
        hasWebSpeechText: true,
        totalChunkBytes: 1200,
        inFlight: false,
        liveCaptionsEnabled: true,
      })
    ).toBe(false);
  });

  it('derives initial Thinking topic upfront and leads headline with the subject', () => {
    const topic = deriveInitialThinkingTopic(
      'দয়া করে React এবং TypeScript দিয়ে একটা Todo অ্যাপ তৈরি করে দাও'
    );
    expect(topic).toContain('React এবং TypeScript');
    expect(formatThinkingTopicLead(topic, 0, false)).toContain('নিয়ে ভাবছি');
    expect(formatThinkingTopicLead(topic, 4, true)).toContain('৪ সেকেন্ড ভেবেছি');
  });

  it('orders Flash / V5 first at the top and Pro & Max at the bottom in V2 model selector', () => {
    const ordered = sortV2ModelsFlashFirst(V2_SPECIAL_MODELS);
    expect(ordered.map((m) => m.id)).toEqual([
      'smfta-v5',
      'smfta-v2-pro',
      'smfta-max',
    ]);
  });

  it('keeps ttsVoice isolated from externalModel inside sanitizeSettings', () => {
    const clean = sanitizeSettings({
      provider: 'xrahat',
      externalModel: 'smfta-v2-pro',
      ttsVoice: 'bengali_female',
      voiceLiveCaptions: true,
      showHomeStarters: false,
      showThinkingTopic: true,
      autoCollapseThinking: false,
    });
    expect(clean.externalModel).toBe('smfta-v2-pro');
    expect(clean.ttsVoice).toBe('bengali_female');
    expect(clean.voiceLiveCaptions).toBe(true);
    expect(clean.showHomeStarters).toBe(false);
    expect(clean.showThinkingTopic).toBe(true);
    expect(clean.autoCollapseThinking).toBe(false);
  });

  it('skips generic Thinking meta-headers like Interpreting the Prompt and Initiating the Analysis to show actual subject', () => {
    const topic = extractThinkingTopic(
      '**Interpreting the Prompt**\n\nThe user wants a Tailwind CSS pricing card component.'
    );
    expect(topic).not.toMatch(/Interpreting the Prompt/i);
    expect(topic).toContain('Tailwind CSS pricing card component');

    const topic2 = extractThinkingTopic(
      '**Initiating the Analysis**\n\nসুন্দরবনের জীববৈচিত্র্য ও ইতিহাস নিয়ে বিস্তারিত লেখা প্রয়োজন।'
    );
    expect(topic2).not.toMatch(/Initiating the Analysis/i);
    expect(topic2).toContain('সুন্দরবনের জীববৈচিত্র্য');
  });

  it('strips markdown tables, keycap emojis, horizontal rules, and raw URLs for crystal-clear speech', async () => {
    const { formatTextForNaturalSpeech, extractReadySpeechChunks } = await import(
      '../smfta/src/utils/voiceEngine'
    );
    const noisy = [
      '## 1️⃣ রিসোর্স চেক',
      '---',
      '| কলাম | সমাধান |',
      '| --- | --- |',
      '| GPU | কোটা দেখুন https://console.cloud.google.com/iam |',
      '```python\nprint("hi")\n```',
      'সবকিছু ঠিকঠাক কাজ করছে।',
    ].join('\n');

    const clean = formatTextForNaturalSpeech(noisy);
    expect(clean).not.toContain('|');
    expect(clean).not.toContain('---');
    expect(clean).not.toContain('https://');
    expect(clean).not.toContain('1️⃣');
    expect(clean).not.toContain('print');
    expect(clean).toContain('সবকিছু ঠিকঠাক কাজ করছে।');

    // Bengali sentence with commas stays intact until the real sentence ending (।)
    const longBn =
      'বাংলাদেশ একটি সুন্দর দেশ, যেখানে অনেক নদী, সবুজ মাঠ, এবং অসাধারণ প্রাকৃতিক সৌন্দর্য রয়েছে। এটি দক্ষিণ এশিয়ায় অবস্থিত।';
    const firstPass = extractReadySpeechChunks(longBn, 0, false);
    expect(firstPass.chunks).toEqual([
      'বাংলাদেশ একটি সুন্দর দেশ, যেখানে অনেক নদী, সবুজ মাঠ, এবং অসাধারণ প্রাকৃতিক সৌন্দর্য রয়েছে।',
      'এটি দক্ষিণ এশিয়ায় অবস্থিত।',
    ]);
  });

  it('splits long replies into sentence-aligned chunks and applies extended VAD limits', async () => {
    const { splitTextForSpeech, formatTextForNaturalSpeech } = await import(
      '../smfta/src/utils/voiceEngine'
    );
    const { DEFAULT_VAD_CONFIG } = await import('../smfta/src/utils/voiceSession');

    expect(DEFAULT_VAD_CONFIG.endOfSpeechSilenceMs).toBe(1500);
    expect(DEFAULT_VAD_CONFIG.maxUtteranceMs).toBe(180000);

    const longReply = 'এটি একটি দীর্ঘ বাংলা বাক্য যা ভয়েসে পড়া হবে। '.repeat(80);
    expect(formatTextForNaturalSpeech(longReply).length).toBeGreaterThan(2500);

    const ttsChunks = splitTextForSpeech(longReply, 900);
    expect(ttsChunks.length).toBeGreaterThanOrEqual(3);
    for (const chunk of ttsChunks) {
      expect(chunk.length).toBeLessThanOrEqual(900);
    }

    const browserChunks = splitTextForSpeech(longReply, 170);
    expect(browserChunks.length).toBeGreaterThan(ttsChunks.length);
    for (const chunk of browserChunks) {
      expect(chunk.length).toBeLessThanOrEqual(170);
    }
  });

  it('retries Gemini TTS generateContent once on 429/quota/rate errors and fails fast on non-rate errors', async () => {
    const { generateTtsWithRetry } = await import('../smfta/server/routes/tools');

    let rateCalls = 0;
    const fakeAiRetry = {
      models: {
        generateContent: async (params: { model: string }) => {
          rateCalls += 1;
          expect(params.model).toBe('gemini-3.8-flash-tts');
          if (rateCalls === 1) {
            throw new Error('429 RESOURCE_EXHAUSTED: rate limit reached');
          }
          return { candidates: [{ content: { parts: [{ inlineData: { data: 'AAAA', mimeType: 'audio/wav' } }] } }] };
        },
      },
    };

    const res = await generateTtsWithRetry(
      fakeAiRetry as never,
      { model: 'gemini-3.8-flash-tts', contents: [{ role: 'user', parts: [{ text: 'hello' }] }] } as never,
      10
    );
    expect(rateCalls).toBe(2);
    expect(res.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data).toBe('AAAA');

    let fatalCalls = 0;
    const fakeAiFatal = {
      models: {
        generateContent: async () => {
          fatalCalls += 1;
          throw new Error('404 NOT_FOUND: model does not exist');
        },
      },
    };

    await expect(
      generateTtsWithRetry(
        fakeAiFatal as never,
        { model: 'gemini-3.8-flash-tts', contents: [{ role: 'user', parts: [{ text: 'hello' }] }] } as never,
        10
      )
    ).rejects.toThrow(/404 NOT_FOUND/);
    expect(fatalCalls).toBe(1);
  });
});
