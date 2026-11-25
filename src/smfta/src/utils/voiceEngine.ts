/**
 * Bilingual Voice Processing Engine (Bengali, English & Banglish).
 * Works cleanly for both V1 – Natural and V2 – Special without modifying V1 routing.
 */

export type VoiceLangMode = 'auto' | 'bn-BD' | 'en-US';

export interface LanguageSegment {
  lang: 'bn-BD' | 'en-US';
  text: string;
}

const BENGALI_CHAR_RE = /[\u0980-\u09FF]/;

/**
 * Splits mixed Bengali + English text into contiguous language-homogeneous
 * segments so SpeechSynthesis reads Bengali text with a Bengali voice and
 * English segments with an English voice without forcing English pronunciation
 * on Bengali words.
 */
export function detectLanguageSegments(
  rawText: string,
  defaultLang: 'bn-BD' | 'en-US' = 'en-US'
): LanguageSegment[] {
  const clean = String(rawText || '')
    .replace(/```[\s\S]*?```/g, ' code snippet ')
    .replace(/[#*_>`~]/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 8000);

  if (!clean) return [];

  const tokens = clean.split(/(\s+)/);
  const segments: LanguageSegment[] = [];
  let currentLang: 'bn-BD' | 'en-US' = BENGALI_CHAR_RE.test(clean)
    ? defaultLang === 'en-US'
      ? 'bn-BD'
      : defaultLang
    : defaultLang;
  let buffer = '';

  for (const tok of tokens) {
    if (!tok) continue;
    const isWhitespace = /^\s+$/.test(tok);
    if (isWhitespace) {
      buffer += tok;
      continue;
    }
    const hasBn = BENGALI_CHAR_RE.test(tok);
    const hasLatin = /[A-Za-z]/.test(tok);
    const tokenLang: 'bn-BD' | 'en-US' = hasBn
      ? 'bn-BD'
      : hasLatin
        ? 'en-US'
        : currentLang;

    if (tokenLang !== currentLang && buffer.trim()) {
      segments.push({ lang: currentLang, text: buffer.trim() });
      buffer = tok;
      currentLang = tokenLang;
    } else {
      currentLang = tokenLang;
      buffer += tok;
    }
  }

  if (buffer.trim()) {
    segments.push({ lang: currentLang, text: buffer.trim() });
  }

  return segments;
}

/**
 * Detects whether a transcript contains mixed Bengali/Banglish cues so users
 * can seamlessly review and edit before sending.
 */
export function resolveRecognitionLanguage(
  mode: VoiceLangMode,
  fallbackAppLang?: string
): 'bn-BD' | 'en-US' {
  if (mode === 'bn-BD') return 'bn-BD';
  if (mode === 'en-US') return 'en-US';
  return fallbackAppLang === 'en' ? 'en-US' : 'bn-BD';
}

export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export function isMediaRecorderSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function')
  );
}

export function isVoiceInputSupported(): boolean {
  return isSpeechRecognitionSupported() || isMediaRecorderSupported();
}

export function pickSupportedAudioMimeType(): string {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return '';
  }
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  for (const mime of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    } catch {
      // Ignore probe error
    }
  }
  return '';
}

export interface SpeechResultLike {
  isFinal?: boolean;
  0?: { transcript?: string };
}

/**
 * Accumulates SpeechRecognition results cleanly without losing already-finalized
 * prefix text when recognition restarts after pauses.
 */
export function accumulateSpeechResults(
  results: ArrayLike<SpeechResultLike> | undefined | null,
  previousFinalPrefix = ''
): { finalPrefix: string; interimText: string; liveTranscript: string } {
  const prefix = String(previousFinalPrefix || '').replace(/\s+/g, ' ').trim();
  if (!results || results.length === 0) {
    return { finalPrefix: prefix, interimText: '', liveTranscript: prefix };
  }
  let sessionFinal = '';
  let sessionInterim = '';
  for (let i = 0; i < results.length; i++) {
    const item = results[i];
    const seg = String(item?.[0]?.transcript || '').replace(/\s+/g, ' ').trim();
    if (!seg) continue;
    if (item?.isFinal) {
      if (!sessionFinal) {
        sessionFinal = seg;
      } else {
        const curLower = sessionFinal.toLowerCase();
        const segLower = seg.toLowerCase();
        if (segLower === curLower || curLower.endsWith(` ${segLower}`)) {
          // Skip exact or tail-repeated final segment (common on Android continuous SpeechRecognition)
        } else if (segLower.startsWith(`${curLower} `)) {
          // Android Chrome continuous recognition often emits cumulative final strings
          sessionFinal = seg;
        } else {
          sessionFinal = `${sessionFinal} ${seg}`;
        }
      }
    } else {
      const curInterimLower = sessionInterim.toLowerCase();
      const segLower = seg.toLowerCase();
      if (!sessionInterim) {
        sessionInterim = seg;
      } else if (segLower === curInterimLower || curInterimLower.endsWith(` ${segLower}`)) {
        // Skip duplicate interim segment
      } else if (segLower.startsWith(`${curInterimLower} `)) {
        sessionInterim = seg;
      } else {
        sessionInterim = `${sessionInterim} ${seg}`;
      }
    }
  }

  let combinedFinal = prefix;
  if (sessionFinal) {
    if (!prefix) {
      combinedFinal = sessionFinal;
    } else {
      const prefixLower = prefix.toLowerCase();
      const sessionLower = sessionFinal.toLowerCase();
      if (sessionLower === prefixLower || prefixLower.endsWith(` ${sessionLower}`)) {
        combinedFinal = prefix;
      } else if (sessionLower.startsWith(`${prefixLower} `)) {
        combinedFinal = sessionFinal;
      } else {
        combinedFinal = `${prefix} ${sessionFinal}`;
      }
    }
  }
  combinedFinal = combinedFinal.replace(/\s+/g, ' ').trim();

  let cleanInterim = sessionInterim.replace(/\s+/g, ' ').trim();
  if (combinedFinal && cleanInterim) {
    const finalLower = combinedFinal.toLowerCase();
    const interimLower = cleanInterim.toLowerCase();
    if (interimLower === finalLower) {
      cleanInterim = '';
    } else if (interimLower.startsWith(`${finalLower} `)) {
      cleanInterim = cleanInterim.slice(combinedFinal.length).trim();
    }
  }

  const liveTranscript = [combinedFinal, cleanInterim]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return {
    finalPrefix: combinedFinal,
    interimText: cleanInterim,
    liveTranscript,
  };
}

export async function blobToBase64Data(blob: Blob): Promise<string> {
  if (typeof blob.arrayBuffer === 'function') {
    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error('Audio read failed'));
    reader.readAsDataURL(blob);
  });
}

export async function requestServerVoiceTranscription(params: {
  audioBase64: string;
  mimeType: string;
  language?: string;
  fetchImpl?: typeof fetch;
}): Promise<{ ok: boolean; text: string; modelUsed?: string; error?: string }> {
  const fetcher = params.fetchImpl || fetch;
  try {
    const res = await fetcher('/api/voice/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audioBase64: params.audioBase64,
        mimeType: params.mimeType,
        language: params.language,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      text?: string;
      modelUsed?: string;
      error?: string;
    };
    if (!res.ok || data.ok === false) {
      return {
        ok: false,
        text: '',
        error: data.error || `HTTP ${res.status}`,
      };
    }
    return {
      ok: true,
      text: String(data.text || '').trim(),
      modelUsed: data.modelUsed,
    };
  } catch (err) {
    return {
      ok: false,
      text: '',
      error: err instanceof Error ? err.message : 'Transcription request failed',
    };
  }
}

/**
 * Chooses the freshest live caption text for the above-waveform display:
 * prefers real-time Web Speech API interim/final output whenever active,
 * falling back cleanly to rolling server transcription captions when Web Speech
 * is unavailable or silent (desktop/iframe/Android WebView).
 */
export function mergeVoiceLiveTranscript(
  speechText: string,
  rollingServerText: string
): string {
  const s = String(speechText || '').replace(/\s+/g, ' ').trim();
  const r = String(rollingServerText || '').replace(/\s+/g, ' ').trim();
  if (s && r) {
    return s.length >= r.length * 0.4 ? s : r;
  }
  return s || r;
}

export function shouldPollRollingVoiceTranscript(params: {
  isListening: boolean;
  hasWebSpeechText: boolean;
  totalChunkBytes: number;
  inFlight: boolean;
  liveCaptionsEnabled?: boolean;
}): boolean {
  if (!params.isListening) return false;
  if (params.liveCaptionsEnabled === false) return false;
  if (params.hasWebSpeechText) return false;
  if (params.inFlight) return false;
  return params.totalChunkBytes >= 800;
}

export type GeminiFemaleVoiceName = 'Kore' | 'Zephyr' | 'Puck' | 'Charon' | 'Fenrir';

export function resolveTtsVoicePersona(
  voiceProfile?: string | null,
  geminiVoice?: GeminiFemaleVoiceName | null
): GeminiFemaleVoiceName {
  if (
    geminiVoice === 'Kore' ||
    geminiVoice === 'Zephyr' ||
    geminiVoice === 'Puck' ||
    geminiVoice === 'Charon' ||
    geminiVoice === 'Fenrir'
  ) {
    return geminiVoice;
  }
  const p = String(voiceProfile || '').trim();
  if (p === 'Kore' || p === 'Zephyr' || p === 'Puck' || p === 'Charon' || p === 'Fenrir') {
    return p;
  }
  if (p === 'english_us_female') return 'Zephyr';
  if (p === 'english_us_male') return 'Charon';
  if (p === 'bengali_male') return 'Puck';
  return 'Kore';
}

export function formatTextForNaturalSpeech(rawText: string, maxChars = 8000): string {
  const cleaned = String(rawText || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, ' ')
    .replace(/<file\b[^>]*>[\s\S]*?<\/file>/gi, ' I have created that file for you. ')
    .replace(/<patch\b[^>]*>[\s\S]*?<\/patch>/gi, ' I have updated that file. ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*$/gm, ' ')
    .replace(/^\s*[-*_]{3,}\s*$/gm, ' ')
    .replace(/\|/g, ', ')
    .replace(/^[ \t]*[#>]+\s*/gm, '')
    .replace(/^[ \t]*(?:[-*•]+|\d+[.)])\s+/gm, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F\u20E3]/gu, '')
    .replace(/[*_~]+/g, '')
    .replace(/\s*,\s*,+/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, maxChars);
}

/**
 * Splits long text into short, sentence-aligned pieces so each TTS request / utterance stays
 * small. Long single utterances get cut off by Gemini TTS and by Chrome's speechSynthesis
 * (which silently stops after ~15s), so long replies are read piece by piece instead.
 */
export function splitTextForSpeech(text: string, maxLen = 300): string[] {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const sentences = clean.match(/[^।.?!]+[।.?!]*\s*/g) || [clean];
  const out: string[] = [];
  let cur = '';
  const flush = () => {
    if (cur.trim()) out.push(cur.trim());
    cur = '';
  };
  for (const sentence of sentences) {
    let piece = sentence;
    while (piece.length > maxLen) {
      const slice = piece.slice(0, maxLen);
      let cut = Math.max(slice.lastIndexOf(', '), slice.lastIndexOf(' '));
      if (cut < maxLen * 0.4) cut = maxLen;
      flush();
      out.push(piece.slice(0, cut).trim());
      piece = piece.slice(cut);
    }
    if ((cur + piece).length > maxLen) flush();
    cur += piece;
  }
  flush();
  return out.filter(Boolean);
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const clean = String(base64 || '').replace(/^data:[^;]+;base64,/i, '').trim();
  if (!clean) return new Uint8Array(0);
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function requestGeminiFemaleSpeech(params: {
  text: string;
  voiceName?: GeminiFemaleVoiceName;
  style?: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<{
  ok: boolean;
  audioBase64?: string;
  mimeType?: string;
  voiceName?: GeminiFemaleVoiceName;
  modelUsed?: string;
  isBackupVoice?: boolean;
  integrationRequired?: boolean;
  error?: string;
}> {
  const cleanText = formatTextForNaturalSpeech(params.text);
  if (!cleanText) {
    return { ok: false, error: 'Empty speech text.' };
  }
  const fetcher = params.fetchImpl || fetch;
  try {
    const res = await fetcher('/api/voice/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: params.signal,
      body: JSON.stringify({
        text: cleanText,
        voiceName: params.voiceName || 'Kore',
        style: params.style,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      audioBase64?: string;
      mimeType?: string;
      voiceName?: GeminiFemaleVoiceName;
      modelUsed?: string;
      isBackupVoice?: boolean;
      integrationRequired?: boolean;
      error?: string;
    };
    if (!res.ok || !data.ok || !data.audioBase64) {
      return {
        ok: false,
        modelUsed: data.modelUsed,
        isBackupVoice: Boolean(data.isBackupVoice || data.modelUsed === 'neural-voice-hd'),
        integrationRequired: Boolean(data.integrationRequired || res.status === 503),
        error: data.error || `HTTP ${res.status}`,
      };
    }
    const isBackup = Boolean(data.isBackupVoice || data.modelUsed === 'neural-voice-hd');
    return {
      ok: true,
      audioBase64: data.audioBase64,
      mimeType: data.mimeType || 'audio/wav',
      voiceName: data.voiceName || params.voiceName || 'Kore',
      modelUsed: data.modelUsed,
      isBackupVoice: isBackup,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'TTS request failed',
    };
  }
}

/**
 * Incrementally splits a live-streaming AI reply into speakable sentence/clause chunks
 * so TTS can start speaking within ~1 second while the rest of the reply is still streaming.
 */
export function extractReadySpeechChunks(
  rawFullText: string,
  alreadyConsumedChars: number,
  flushFinal: boolean
): { chunks: string[]; nextCursor: number } {
  const full = String(rawFullText || '');
  // Never speak unfinished <think> blocks
  if (/<think>/i.test(full) && !/<\/think>/i.test(full)) {
    return { chunks: [], nextCursor: alreadyConsumedChars };
  }
  const cleanFull = formatTextForNaturalSpeech(full, 12000);
  if (cleanFull.length <= alreadyConsumedChars) {
    return { chunks: [], nextCursor: alreadyConsumedChars };
  }

  let cursor = alreadyConsumedChars;
  const chunks: string[] = [];

  while (cursor < cleanFull.length) {
    const remaining = cleanFull.slice(cursor);
    if (!remaining.trim()) {
      cursor = cleanFull.length;
      break;
    }

    // Split on complete sentence boundaries (Bengali dari ।, non-decimal ., ?, !, newline)
    // so AI begins speaking immediately on sentence 1 while the rest of the reply streams.
    const sentenceMatch = remaining.match(/^(.{4,280}?(?:[।?!\n]|(?<!\d)\.))(?:\s+|$)/);
    if (sentenceMatch && sentenceMatch[1]) {
      const piece = sentenceMatch[1].trim();
      if (piece) chunks.push(piece);
      cursor += sentenceMatch[0].length;
      continue;
    }

    // For the very first live chunk (cursor === 0), do not wait >75 chars if a natural
    // clause boundary (comma, semicolon, colon, dash) is ready, so voice starts mid-stream.
    if (!flushFinal && cursor === 0 && remaining.length >= 75) {
      const clauseMatch = remaining.match(/^(.{20,120}?[,;:—–])(?:\s+|$)/);
      if (clauseMatch && clauseMatch[1]) {
        const piece = clauseMatch[1].trim();
        if (piece) chunks.push(piece);
        cursor += clauseMatch[0].length;
        continue;
      }
      if (remaining.length >= 115) {
        const slice = remaining.slice(0, 115);
        const lastSpace = slice.lastIndexOf(' ');
        const cut = lastSpace >= 45 ? lastSpace : 115;
        const piece = remaining.slice(0, cut).trim();
        if (piece) chunks.push(piece);
        cursor += cut;
        while (cursor < cleanFull.length && cleanFull[cursor] === ' ') cursor += 1;
        continue;
      }
    }

    // Split any long uninterrupted run without punctuation cleanly at a word boundary
    if (remaining.length >= 220) {
      const slice = remaining.slice(0, 220);
      const lastSpace = slice.lastIndexOf(' ');
      const cut = lastSpace >= 90 ? lastSpace : 220;
      const piece = remaining.slice(0, cut).trim();
      if (piece) chunks.push(piece);
      cursor += cut;
      while (cursor < cleanFull.length && cleanFull[cursor] === ' ') cursor += 1;
      continue;
    }

    if (flushFinal) {
      const piece = remaining.trim();
      if (piece) chunks.push(piece);
      cursor = cleanFull.length;
    }
    break;
  }

  return { chunks, nextCursor: cursor };
}

/**
 * Applies transparent analog-style soft peak limiting and optional turn-start fade-in
 * so streamed 24kHz PCM voices never digitally clip or click on onset.
 */
export function softLimitPcmSamples(
  samples: Float32Array,
  fadeInMs = 0,
  sampleRate = 24000
): Float32Array {
  if (samples.length === 0) return samples;
  const out = new Float32Array(samples.length);
  const fadeSamples =
    fadeInMs > 0 ? Math.min(samples.length, Math.round((fadeInMs / 1000) * sampleRate)) : 0;

  for (let i = 0; i < samples.length; i += 1) {
    let v = samples[i]!;
    if (v > 0.85 || v < -0.85) {
      const sign = v < 0 ? -1 : 1;
      const excess = Math.abs(v) - 0.85;
      v = sign * (0.85 + Math.tanh(excess * 4) * 0.13);
    }
    if (i < fadeSamples && fadeSamples > 1) {
      const gain = 0.5 * (1 - Math.cos((Math.PI * i) / fadeSamples));
      v *= gain;
    }
    out[i] = v;
  }
  return out;
}

/**
 * Streams headerless 24kHz 16-bit LE mono PCM audio chunks from POST /api/voice/tts-stream
 * and yields Float32 samples incrementally for gapless AudioContext playback.
 */
export async function streamGeminiPcmSpeech(params: {
  text: string;
  voiceName?: GeminiFemaleVoiceName;
  style?: string;
  signal?: AbortSignal;
  onPcmChunk?: (samples: Float32Array, sampleRate: number) => void;
  onPcmSamples?: (samples: Float32Array, sampleRate: number) => void;
  fetchImpl?: typeof fetch;
}): Promise<{
  ok: boolean;
  receivedAudio: boolean;
  modelUsed?: string;
  integrationRequired?: boolean;
  fallbackToBrowser?: boolean;
  error?: string;
}> {
  const cleanText = formatTextForNaturalSpeech(params.text, 900);
  if (!cleanText) {
    return { ok: false, receivedAudio: false, error: 'Empty speech text.' };
  }
  const onChunk = params.onPcmChunk || params.onPcmSamples;
  if (typeof onChunk !== 'function') {
    return { ok: false, receivedAudio: false, error: 'Missing onPcmChunk callback.' };
  }
  const fetcher = params.fetchImpl || fetch;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  try {
    const res = await fetcher('/api/voice/tts-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: params.signal,
      body: JSON.stringify({
        text: cleanText,
        voiceName: params.voiceName || 'Kore',
        style: params.style,
      }),
    });

    const contentType = res.headers.get('Content-Type') || '';
    if (!res.ok || !res.body || contentType.includes('application/json')) {
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        modelUsed?: string;
        integrationRequired?: boolean;
        fallbackToBrowser?: boolean;
      };
      return {
        ok: false,
        receivedAudio: false,
        modelUsed: data.modelUsed,
        integrationRequired: Boolean(data.integrationRequired || res.status === 503),
        fallbackToBrowser: Boolean(data.fallbackToBrowser),
        error: data.error || `HTTP ${res.status}`,
      };
    }

    const sampleRate = Number(res.headers.get('X-Voice-Sample-Rate')) || 24000;
    const modelUsed = res.headers.get('X-Voice-Model-Used') || undefined;
    reader = res.body.getReader();
    const MIN_FRAME_BYTES = 4800; // ~100ms at 24kHz 16-bit mono PCM for click-free playback
    let pendingBytes: Uint8Array = new Uint8Array(0);
    let checkedHeader = false;
    let receivedAudio = false;

    const emitEvenPcm = (buf: Uint8Array) => {
      const evenBytes = buf.byteLength - (buf.byteLength % 2);
      if (evenBytes < 2) return buf;
      const sampleCount = evenBytes / 2;
      const view = new DataView(buf.buffer, buf.byteOffset, evenBytes);
      const float32 = new Float32Array(sampleCount);
      for (let i = 0; i < sampleCount; i += 1) {
        float32[i] = view.getInt16(i * 2, true) / 32768;
      }
      receivedAudio = true;
      onChunk(float32, sampleRate);
      return buf.byteLength > evenBytes ? buf.slice(evenBytes) : new Uint8Array(0);
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (params.signal?.aborted) {
        void reader.cancel().catch(() => {});
        return { ok: false, receivedAudio, modelUsed, error: 'Aborted' };
      }
      if (!value || value.byteLength === 0) continue;

      if (pendingBytes.byteLength > 0) {
        const merged = new Uint8Array(pendingBytes.byteLength + value.byteLength);
        merged.set(pendingBytes, 0);
        merged.set(value, pendingBytes.byteLength);
        pendingBytes = merged;
      } else {
        pendingBytes = value;
      }

      if (!checkedHeader && pendingBytes.byteLength >= 44) {
        checkedHeader = true;
        if (
          pendingBytes[0] === 0x52 &&
          pendingBytes[1] === 0x49 &&
          pendingBytes[2] === 0x46 &&
          pendingBytes[3] === 0x46
        ) {
          pendingBytes = pendingBytes.slice(44);
        }
      }

      if (pendingBytes.byteLength >= MIN_FRAME_BYTES) {
        pendingBytes = emitEvenPcm(pendingBytes);
      }
    }

    if (pendingBytes.byteLength >= 2) {
      emitEvenPcm(pendingBytes);
    }

    return { ok: receivedAudio, receivedAudio, modelUsed };
  } catch (err) {
    if (reader) {
      void reader.cancel().catch(() => {});
    }
    return {
      ok: false,
      receivedAudio: false,
      error: err instanceof Error ? err.message : 'Streaming TTS failed',
    };
  }
}

export function isSpeechSynthesisSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof SpeechSynthesisUtterance !== 'undefined'
  );
}

export interface SpeechControllerState {
  status: 'idle' | 'speaking' | 'paused';
  msgId: string | null;
  isBackupVoice?: boolean;
  modelUsed?: string;
}

export class BilingualSpeechPlayer {
  private cancelled = false;
  private paused = false;
  private sessionSeq = 0;
  private currentMsgId: string | null = null;
  private currentIsBackup = false;
  private currentModelUsed: string | undefined = undefined;
  private activeAudio: HTMLAudioElement | null = null;
  private activeAbort: AbortController | null = null;
  private activeBlobUrl: string | null = null;
  private onStateChange: ((state: SpeechControllerState) => void) | null = null;

  public subscribe(cb: (state: SpeechControllerState) => void): () => void {
    this.onStateChange = cb;
    return () => {
      if (this.onStateChange === cb) this.onStateChange = null;
    };
  }

  private emit(status: 'idle' | 'speaking' | 'paused') {
    this.onStateChange?.({
      status,
      msgId: status === 'idle' ? null : this.currentMsgId,
      isBackupVoice: status === 'idle' ? false : this.currentIsBackup,
      modelUsed: status === 'idle' ? undefined : this.currentModelUsed,
    });
  }

  private cleanupAudioElement(): void {
    if (this.activeAbort) {
      this.activeAbort.abort();
      this.activeAbort = null;
    }
    if (this.activeAudio) {
      try {
        this.activeAudio.onended = null;
        this.activeAudio.onerror = null;
        this.activeAudio.pause();
        this.activeAudio.src = '';
      } catch {
        // Ignore cleanup errors
      }
      this.activeAudio = null;
    }
    if (this.activeBlobUrl) {
      try {
        URL.revokeObjectURL(this.activeBlobUrl);
      } catch {
        // Ignore revoke errors
      }
      this.activeBlobUrl = null;
    }
  }

  private releaseAudioOnly(): void {
    if (this.activeAudio) {
      try {
        this.activeAudio.onended = null;
        this.activeAudio.onerror = null;
        this.activeAudio.pause();
        this.activeAudio.src = '';
      } catch {
        // Ignore cleanup errors
      }
      this.activeAudio = null;
    }
    if (this.activeBlobUrl) {
      try {
        URL.revokeObjectURL(this.activeBlobUrl);
      } catch {
        // Ignore revoke errors
      }
      this.activeBlobUrl = null;
    }
  }

  public stop(): void {
    this.sessionSeq += 1;
    this.cancelled = true;
    this.paused = false;
    this.currentMsgId = null;
    this.currentIsBackup = false;
    this.currentModelUsed = undefined;
    this.cleanupAudioElement();
    if (isSpeechSynthesisSupported()) {
      window.speechSynthesis.cancel();
    }
    this.emit('idle');
  }

  public pause(): void {
    if (!this.currentMsgId) return;
    if (this.activeAudio) {
      this.activeAudio.pause();
      this.paused = true;
      this.emit('paused');
      return;
    }
    if (isSpeechSynthesisSupported()) {
      window.speechSynthesis.pause();
      this.paused = true;
      this.emit('paused');
    }
  }

  public resume(): void {
    if (!this.currentMsgId) return;
    if (this.activeAudio) {
      void this.activeAudio.play().catch(() => {});
      this.paused = false;
      this.emit('speaking');
      return;
    }
    if (isSpeechSynthesisSupported()) {
      window.speechSynthesis.resume();
      this.paused = false;
      this.emit('speaking');
    }
  }

  public isPaused(): boolean {
    return this.paused;
  }

  public speak(params: {
    text: string;
    msgId?: string;
    preferredLang?: VoiceLangMode;
    voiceProfile?:
      | 'default'
      | GeminiFemaleVoiceName
      | 'bengali_female'
      | 'bengali_male'
      | 'english_us_female'
      | 'english_us_male';
    rate?: number;
    geminiVoice?: GeminiFemaleVoiceName;
    skipServerTts?: boolean;
    onDone?: () => void;
    fetchImpl?: typeof fetch;
  }): void {
    const cleanText = formatTextForNaturalSpeech(params.text);
    if (!cleanText) {
      params.onDone?.();
      return;
    }

    if (params.msgId && this.currentMsgId === params.msgId && !this.paused) {
      this.stop();
      return;
    }

    this.sessionSeq += 1;
    const sessionId = this.sessionSeq;
    this.cleanupAudioElement();
    if (isSpeechSynthesisSupported()) {
      window.speechSynthesis.cancel();
    }
    this.cancelled = false;
    this.paused = false;
    this.currentMsgId = params.msgId || 'tts_active';
    this.currentIsBackup = false;
    this.currentModelUsed = undefined;

    const chosenVoice = resolveTtsVoicePersona(params.voiceProfile, params.geminiVoice);
    const wantMale =
      chosenVoice === 'Puck' ||
      chosenVoice === 'Charon' ||
      chosenVoice === 'Fenrir' ||
      params.voiceProfile?.endsWith('male');
    const rate = Math.min(2.0, Math.max(0.5, params.rate || 1.0));
    this.emit('speaking');

    const isStaleSession = () => this.cancelled || sessionId !== this.sessionSeq;

    const runBrowserFallback = (fromText: string = cleanText) => {
      if (isStaleSession()) return;
      this.currentIsBackup = true;
      this.currentModelUsed = 'browser';
      this.emit('speaking');
      if (isStaleSession() || !isSpeechSynthesisSupported()) {
        if (!isStaleSession()) {
          this.currentMsgId = null;
          this.currentIsBackup = false;
          this.currentModelUsed = undefined;
          this.paused = false;
          this.emit('idle');
          params.onDone?.();
        }
        return;
      }

      const defaultSegLang: 'bn-BD' | 'en-US' =
        params.preferredLang === 'en-US' || params.voiceProfile?.startsWith('english')
          ? 'en-US'
          : 'bn-BD';
      const segments = detectLanguageSegments(fromText, defaultSegLang).flatMap((seg) =>
        splitTextForSpeech(seg.text, 170).map((piece) => ({ lang: seg.lang, text: piece }))
      );
      if (segments.length === 0) {
        if (!isStaleSession()) {
          this.stop();
          params.onDone?.();
        }
        return;
      }

      const voices = window.speechSynthesis.getVoices() || [];
      const pickVoice = (targetLang: 'bn-BD' | 'en-US') => {
        const prefix = targetLang.slice(0, 2);
        const profile = params.voiceProfile || 'bengali_female';
        const wantFemale = !profile.endsWith('male');
        const pool = voices.filter(
          (v) =>
            v.lang?.toLowerCase() === targetLang.toLowerCase() ||
            v.lang?.toLowerCase().startsWith(prefix)
        );
        if (pool.length > 0 && (wantFemale || wantMale)) {
          const gendered = pool.find((v) => {
            const n = (v.name || '').toLowerCase();
            return wantFemale
              ? /natural|neural|female|woman|srabani|tanisha|ava|samantha|victoria|zira|aria|jenny|natasha|google/.test(n)
              : /\bmale\b|\bman\b|tanvir|pradeep|andrew|david|guy|mark|daniel/.test(n);
          });
          if (gendered) return gendered;
        }
        return (
          pool.find((v) => v.lang?.toLowerCase() === targetLang.toLowerCase()) ||
          pool[0] ||
          null
        );
      };

      const playNext = (index: number) => {
        if (isStaleSession()) return;
        if (index >= segments.length) {
          this.currentMsgId = null;
          this.currentIsBackup = false;
          this.currentModelUsed = undefined;
          this.paused = false;
          this.emit('idle');
          params.onDone?.();
          return;
        }

        const seg = segments[index]!;
        const utter = new SpeechSynthesisUtterance(seg.text);
        const matchedVoice = pickVoice(seg.lang);
        if (matchedVoice) {
          utter.voice = matchedVoice;
          utter.lang = matchedVoice.lang;
        } else {
          utter.lang = seg.lang;
        }
        utter.rate = rate;

        let utterSettled = false;
        const advance = () => {
          if (utterSettled || isStaleSession()) return;
          utterSettled = true;
          utter.onend = null;
          utter.onerror = null;
          playNext(index + 1);
        };
        utter.onend = advance;
        utter.onerror = advance;

        window.speechSynthesis.speak(utter);
      };

      playNext(0);
    };

    if (!params.skipServerTts && (params.fetchImpl || (typeof window !== 'undefined' && typeof Audio !== 'undefined'))) {
      const ctrl = new AbortController();
      this.activeAbort = ctrl;

      const chunks = splitTextForSpeech(cleanText, 900);
      const fetchChunkWithRetry = async (i: number) => {
        const firstTry = await requestGeminiFemaleSpeech({
          text: chunks[i] || '',
          voiceName: chosenVoice,
          signal: ctrl.signal,
          fetchImpl: params.fetchImpl,
        });
        if (firstTry.ok || isStaleSession() || ctrl.signal.aborted) {
          return firstTry;
        }
        // Retry once in the exact same voice before falling back so voice persona never switches mid-reply
        await new Promise((r) => setTimeout(r, 350));
        if (isStaleSession() || ctrl.signal.aborted) {
          return firstTry;
        }
        return requestGeminiFemaleSpeech({
          text: chunks[i] || '',
          voiceName: chosenVoice,
          signal: ctrl.signal,
          fetchImpl: params.fetchImpl,
        });
      };
      const finishAll = () => {
        if (isStaleSession()) return;
        this.cleanupAudioElement();
        this.currentMsgId = null;
        this.currentIsBackup = false;
        this.currentModelUsed = undefined;
        this.paused = false;
        this.emit('idle');
        params.onDone?.();
      };
      const playIndex = (i: number, pending: ReturnType<typeof fetchChunkWithRetry>) => {
        void pending.then((ttsRes) => {
          if (isStaleSession() || ctrl.signal.aborted) return;
          if (!ttsRes.ok || !ttsRes.audioBase64) {
            ctrl.abort();
            this.releaseAudioOnly();
            runBrowserFallback(chunks.slice(i).join(' '));
            return;
          }
          if (ttsRes.isBackupVoice || ttsRes.modelUsed === 'neural-voice-hd') {
            this.currentIsBackup = true;
            this.currentModelUsed = ttsRes.modelUsed;
            this.emit('speaking');
          } else if (ttsRes.modelUsed) {
            this.currentIsBackup = false;
            this.currentModelUsed = ttsRes.modelUsed;
            this.emit('speaking');
          }
          // Prefetch the next piece while this one plays, so reading never pauses between pieces
          const upcoming = i + 1 < chunks.length ? fetchChunkWithRetry(i + 1) : null;
          if (typeof Audio === 'undefined') {
            if (upcoming) {
              playIndex(i + 1, upcoming);
              return;
            }
            finishAll();
            return;
          }
          let chunkSettled = false;
          const fallbackFromCurrentChunk = () => {
            if (chunkSettled || isStaleSession() || ctrl.signal.aborted) return;
            chunkSettled = true;
            ctrl.abort();
            this.releaseAudioOnly();
            runBrowserFallback(chunks.slice(i).join(' '));
          };
          try {
            const bytes = base64ToUint8Array(ttsRes.audioBase64);
            const blob = new Blob([bytes.buffer as ArrayBuffer], {
              type: ttsRes.mimeType || 'audio/wav',
            });
            const url = URL.createObjectURL(blob);
            this.releaseAudioOnly();
            this.activeBlobUrl = url;
            const audio = new Audio(url);
            audio.playbackRate = rate;
            this.activeAudio = audio;
            audio.onended = () => {
              if (chunkSettled || isStaleSession() || ctrl.signal.aborted) return;
              chunkSettled = true;
              if (upcoming) {
                playIndex(i + 1, upcoming);
                return;
              }
              finishAll();
            };
            audio.onerror = fallbackFromCurrentChunk;
            void audio.play().catch(fallbackFromCurrentChunk);
          } catch {
            fallbackFromCurrentChunk();
          }
        });
      };
      if (chunks.length === 0) {
        finishAll();
        return;
      }
      playIndex(0, fetchChunkWithRetry(0));
      return;
    }

    runBrowserFallback();
  }
}

export const bilingualSpeechPlayer = new BilingualSpeechPlayer();
