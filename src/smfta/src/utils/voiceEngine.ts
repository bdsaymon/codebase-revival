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
    .slice(0, 2200);

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
): { finalPrefix: string; liveTranscript: string } {
  const prefix = String(previousFinalPrefix || '').trim();
  if (!results || results.length === 0) {
    return { finalPrefix: prefix, liveTranscript: prefix };
  }
  let sessionFinal = '';
  let sessionInterim = '';
  for (let i = 0; i < results.length; i++) {
    const item = results[i];
    const seg = String(item?.[0]?.transcript || '').trim();
    if (!seg) continue;
    if (item?.isFinal) {
      sessionFinal = sessionFinal ? `${sessionFinal} ${seg}` : seg;
    } else {
      sessionInterim = sessionInterim ? `${sessionInterim} ${seg}` : seg;
    }
  }
  const combinedFinal = [prefix, sessionFinal]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  const liveTranscript = [combinedFinal, sessionInterim]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return {
    finalPrefix: combinedFinal,
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

export function formatTextForNaturalSpeech(rawText: string, maxChars = 1500): string {
  const cleaned = String(rawText || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, ' ')
    .replace(/<file\b[^>]*>[\s\S]*?<\/file>/gi, ' I have created that file for you. ')
    .replace(/<patch\b[^>]*>[\s\S]*?<\/patch>/gi, ' I have updated that file. ')
    .replace(/```[\s\S]*?```/g, ' Here is the code snippet. ')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/^[ \t]*[#>]+\s*/gm, '')
    .replace(/[*_~`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, maxChars);
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
      integrationRequired?: boolean;
      error?: string;
    };
    if (!res.ok || !data.ok || !data.audioBase64) {
      return {
        ok: false,
        integrationRequired: Boolean(data.integrationRequired || res.status === 503),
        error: data.error || `HTTP ${res.status}`,
      };
    }
    return {
      ok: true,
      audioBase64: data.audioBase64,
      mimeType: data.mimeType || 'audio/wav',
      voiceName: data.voiceName || params.voiceName || 'Kore',
      modelUsed: data.modelUsed,
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
  const cleanFull = formatTextForNaturalSpeech(full, 2400);
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

    // Look for a strong sentence boundary (Bengali dari ।, ., ?, !, newline)
    const sentenceMatch = remaining.match(/^(.{12,260}?[।.?!\n])(?:\s+|$)/);
    if (sentenceMatch && sentenceMatch[1]) {
      const piece = sentenceMatch[1].trim();
      if (piece) chunks.push(piece);
      cursor += sentenceMatch[0].length;
      continue;
    }

    // For fast first-chunk start on long clauses, allow breaking on comma/semicolon/colon after 55 chars
    const clauseMatch = remaining.match(/^(.{55,180}?[,;:—–])(?:\s+)/);
    if (clauseMatch && clauseMatch[1]) {
      const piece = clauseMatch[1].trim();
      if (piece) chunks.push(piece);
      cursor += clauseMatch[0].length;
      continue;
    }

    // If a single uninterrupted run gets long (>140 chars), split cleanly at the last word boundary
    if (remaining.length >= 140) {
      const slice = remaining.slice(0, 140);
      const lastSpace = slice.lastIndexOf(' ');
      const cut = lastSpace >= 60 ? lastSpace : 140;
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
 * Streams headerless 24kHz 16-bit LE mono PCM audio chunks from POST /api/voice/tts-stream
 * and yields Float32 samples incrementally for gapless AudioContext playback.
 */
export async function streamGeminiPcmSpeech(params: {
  text: string;
  voiceName?: GeminiFemaleVoiceName;
  style?: string;
  signal?: AbortSignal;
  onPcmChunk: (samples: Float32Array, sampleRate: number) => void;
  fetchImpl?: typeof fetch;
}): Promise<{
  ok: boolean;
  receivedAudio: boolean;
  integrationRequired?: boolean;
  error?: string;
}> {
  const cleanText = formatTextForNaturalSpeech(params.text, 600);
  if (!cleanText) {
    return { ok: false, receivedAudio: false, error: 'Empty speech text.' };
  }
  const fetcher = params.fetchImpl || fetch;
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

    if (!res.ok || !res.body) {
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        integrationRequired?: boolean;
      };
      return {
        ok: false,
        receivedAudio: false,
        integrationRequired: Boolean(data.integrationRequired || res.status === 503),
        error: data.error || `HTTP ${res.status}`,
      };
    }

    const sampleRate = Number(res.headers.get('X-Voice-Sample-Rate')) || 24000;
    const reader = res.body.getReader();
    let leftoverByte: Uint8Array | null = null;
    let receivedAudio = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (params.signal?.aborted) {
        void reader.cancel().catch(() => {});
        return { ok: false, receivedAudio, error: 'Aborted' };
      }
      if (!value || value.byteLength === 0) continue;

      let combined: Uint8Array;
      if (leftoverByte && leftoverByte.byteLength > 0) {
        combined = new Uint8Array(leftoverByte.byteLength + value.byteLength);
        combined.set(leftoverByte, 0);
        combined.set(value, leftoverByte.byteLength);
        leftoverByte = null;
      } else {
        combined = value;
      }

      const evenBytes = combined.byteLength - (combined.byteLength % 2);
      if (combined.byteLength % 2 === 1) {
        leftoverByte = combined.slice(evenBytes);
      }
      if (evenBytes < 2) continue;

      const sampleCount = evenBytes / 2;
      const view = new DataView(combined.buffer, combined.byteOffset, evenBytes);
      const float32 = new Float32Array(sampleCount);
      for (let i = 0; i < sampleCount; i += 1) {
        float32[i] = view.getInt16(i * 2, true) / 32768;
      }
      receivedAudio = true;
      params.onPcmChunk(float32, sampleRate);
    }

    return { ok: receivedAudio, receivedAudio };
  } catch (err) {
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
}

class BilingualSpeechPlayer {
  private cancelled = false;
  private paused = false;
  private currentMsgId: string | null = null;
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
    });
  }

  private cleanupAudioElement(): void {
    if (this.activeAbort) {
      this.activeAbort.abort();
      this.activeAbort = null;
    }
    if (this.activeAudio) {
      try {
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
    this.cancelled = true;
    this.paused = false;
    this.currentMsgId = null;
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
    voiceProfile?: 'default' | 'bengali_female' | 'bengali_male' | 'english_us_female' | 'english_us_male';
    rate?: number;
    geminiVoice?: GeminiFemaleVoiceName;
    skipServerTts?: boolean;
    onDone?: () => void;
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

    this.cleanupAudioElement();
    if (isSpeechSynthesisSupported()) {
      window.speechSynthesis.cancel();
    }
    this.cancelled = false;
    this.paused = false;
    this.currentMsgId = params.msgId || 'tts_active';

    const wantMale = params.voiceProfile?.endsWith('male');
    const rate = Math.min(2.0, Math.max(0.5, params.rate || 1.0));
    this.emit('speaking');

    const runBrowserFallback = () => {
      if (this.cancelled || !isSpeechSynthesisSupported()) {
        if (!this.cancelled) {
          this.currentMsgId = null;
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
      const segments = detectLanguageSegments(cleanText, defaultSegLang);
      if (segments.length === 0) {
        this.stop();
        params.onDone?.();
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
        if (this.cancelled || index >= segments.length) {
          if (!this.cancelled) {
            this.currentMsgId = null;
            this.paused = false;
            this.emit('idle');
            params.onDone?.();
          }
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

        utter.onend = () => {
          if (!this.cancelled) {
            playNext(index + 1);
          }
        };
        utter.onerror = () => {
          if (!this.cancelled) {
            playNext(index + 1);
          }
        };

        window.speechSynthesis.speak(utter);
      };

      playNext(0);
    };

    if (!params.skipServerTts && !wantMale && typeof window !== 'undefined' && typeof Audio !== 'undefined') {
      const ctrl = new AbortController();
      this.activeAbort = ctrl;
      const chosenVoice: GeminiFemaleVoiceName =
        params.geminiVoice ||
        (params.voiceProfile === 'english_us_female' ? 'Zephyr' : 'Kore');

      void requestGeminiFemaleSpeech({
        text: cleanText,
        voiceName: chosenVoice,
        signal: ctrl.signal,
      }).then((ttsRes) => {
        if (this.cancelled || ctrl.signal.aborted) return;
        if (!ttsRes.ok || !ttsRes.audioBase64) {
          runBrowserFallback();
          return;
        }
        try {
          const bytes = base64ToUint8Array(ttsRes.audioBase64);
          const blob = new Blob([bytes.buffer as ArrayBuffer], {
            type: ttsRes.mimeType || 'audio/wav',
          });
          const url = URL.createObjectURL(blob);
          this.activeBlobUrl = url;
          const audio = new Audio(url);
          audio.playbackRate = rate;
          this.activeAudio = audio;
          audio.onended = () => {
            if (!this.cancelled) {
              this.cleanupAudioElement();
              this.currentMsgId = null;
              this.paused = false;
              this.emit('idle');
              params.onDone?.();
            }
          };
          audio.onerror = () => {
            if (!this.cancelled) {
              this.cleanupAudioElement();
              runBrowserFallback();
            }
          };
          void audio.play().catch(() => {
            if (!this.cancelled) {
              this.cleanupAudioElement();
              runBrowserFallback();
            }
          });
        } catch {
          runBrowserFallback();
        }
      });
      return;
    }

    runBrowserFallback();
  }
}

export const bilingualSpeechPlayer = new BilingualSpeechPlayer();
