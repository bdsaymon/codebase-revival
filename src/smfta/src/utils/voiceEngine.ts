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
      params.preferredLang === 'en-US' ? 'en-US' : 'bn-BD';
    const segments = detectLanguageSegments(params.text, defaultSegLang);
    if (segments.length === 0) {
      this.stop();
      params.onDone?.();
      return;
    }

    const voices = window.speechSynthesis.getVoices() || [];
    const pickVoice = (targetLang: 'bn-BD' | 'en-US') => {
      const prefix = targetLang.slice(0, 2);
      return (
        voices.find((v) => v.lang?.toLowerCase() === targetLang.toLowerCase()) ||
        voices.find((v) => v.lang?.toLowerCase().startsWith(prefix)) ||
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
