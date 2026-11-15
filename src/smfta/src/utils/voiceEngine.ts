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

  public stop(): void {
    this.cancelled = true;
    this.paused = false;
    this.currentMsgId = null;
    if (isSpeechSynthesisSupported()) {
      window.speechSynthesis.cancel();
    }
    this.emit('idle');
  }

  public pause(): void {
    if (!isSpeechSynthesisSupported() || !this.currentMsgId) return;
    window.speechSynthesis.pause();
    this.paused = true;
    this.emit('paused');
  }

  public resume(): void {
    if (!isSpeechSynthesisSupported() || !this.currentMsgId) return;
    window.speechSynthesis.resume();
    this.paused = false;
    this.emit('speaking');
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
    onDone?: () => void;
  }): void {
    if (!isSpeechSynthesisSupported() || !params.text.trim()) {
      params.onDone?.();
      return;
    }

    if (params.msgId && this.currentMsgId === params.msgId && !this.paused) {
      this.stop();
      return;
    }

    window.speechSynthesis.cancel();
    this.cancelled = false;
    this.paused = false;
    this.currentMsgId = params.msgId || 'tts_active';

    const defaultSegLang: 'bn-BD' | 'en-US' =
      params.preferredLang === 'en-US' || params.voiceProfile?.startsWith('english')
        ? 'en-US'
        : 'bn-BD';
    const segments = detectLanguageSegments(params.text, defaultSegLang);
    if (segments.length === 0) {
      this.stop();
      params.onDone?.();
      return;
    }

    const voices = window.speechSynthesis.getVoices() || [];
    const pickVoice = (targetLang: 'bn-BD' | 'en-US') => {
      const prefix = targetLang.slice(0, 2);
      const profile = params.voiceProfile || 'default';
      const wantFemale = profile.endsWith('female');
      const wantMale = profile.endsWith('male');
      const pool = voices.filter(
        (v) =>
          v.lang?.toLowerCase() === targetLang.toLowerCase() ||
          v.lang?.toLowerCase().startsWith(prefix)
      );
      if (pool.length > 0 && (wantFemale || wantMale)) {
        const gendered = pool.find((v) => {
          const n = (v.name || '').toLowerCase();
          return wantFemale
            ? /female|woman|srabani|tanisha|ava|samantha|victoria|zira|aria|jenny|natasha|google/.test(n)
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

    const rate = Math.min(2.0, Math.max(0.5, params.rate || 1.0));
    this.emit('speaking');

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
  }
}

export const bilingualSpeechPlayer = new BilingualSpeechPlayer();
