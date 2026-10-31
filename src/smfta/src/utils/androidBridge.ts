/**
 * Android Native WebView Bridge (window.SMFTAApkBridge)
 * Provides clipboard, TTS, and environment helpers when running inside the
 * Android WebView container, falling back to standard Web APIs in browsers.
 */
import { APP_VERSION } from '../version';

interface SMFTAApkBridgeInterface {
  copyToClipboard?: (text: string) => boolean;
  speakText?: (text: string, lang: string) => boolean;
  stopSpeech?: () => void;
  showToast?: (message: string) => void;
  vibrate?: (ms: number) => void;
  getAppInfo?: () => string;
}

declare global {
  interface Window {
    SMFTAApkBridge?: SMFTAApkBridgeInterface;
  }
}

export function isAndroidNativeApp(): boolean {
  return typeof window !== 'undefined' && Boolean(window.SMFTAApkBridge);
}

export function initAndroidNativeBridge(): void {
  // No-op initialization hook for Web / Android WebView bridge
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (window.SMFTAApkBridge?.copyToClipboard) {
      return window.SMFTAApkBridge.copyToClipboard(text);
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    return true;
  } catch {
    return false;
  }
}

export function speakNative(
  text: string,
  lang: string = 'bn-BD',
  onEnd?: () => void
): boolean {
  try {
    const clean = text
      .replace(/```[\s\S]*?```/g, ' কোড ব্লক ')
      .replace(/[*#_`~>]/g, '')
      .trim();

    if (!clean) {
      onEnd?.();
      return false;
    }

    if (window.SMFTAApkBridge?.speakText) {
      const ok = window.SMFTAApkBridge.speakText(clean, lang);
      if (ok) {
        const estimatedMs = Math.min(30000, Math.max(2000, clean.length * 75));
        setTimeout(() => onEnd?.(), estimatedMs);
        return true;
      }
    }

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(clean);
      u.lang = lang;
      u.rate = 1.0;
      if (onEnd) {
        u.onend = () => onEnd();
        u.onerror = () => onEnd();
      }
      window.speechSynthesis.speak(u);
      return true;
    }
  } catch {
    onEnd?.();
  }
  return false;
}

export function stopNativeSpeech(): void {
  try {
    if (window.SMFTAApkBridge?.stopSpeech) {
      window.SMFTAApkBridge.stopSpeech();
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  } catch {
    // Ignore errors
  }
}

export function triggerHaptic(ms: number = 25): void {
  try {
    if (window.SMFTAApkBridge?.vibrate) {
      window.SMFTAApkBridge.vibrate(ms);
      return;
    }
    if (navigator.vibrate) {
      navigator.vibrate(ms);
    }
  } catch {
    // Ignore
  }
}

export function getApkEnvironmentInfo(): {
  isApk: boolean;
  appName: string;
  appVersion: string;
  engine: string;
} {
  try {
    if (window.SMFTAApkBridge?.getAppInfo) {
      const info = JSON.parse(window.SMFTAApkBridge.getAppInfo());
      return {
        isApk: true,
        appName: info.appName || 'SMFTA AI Pro',
        appVersion: info.version || APP_VERSION,
        engine: info.engine || 'Android Native WebView',
      };
    }
  } catch {
    // Fallback
  }
  return {
    isApk: false,
    appName: 'SMFTA AI Pro',
    appVersion: APP_VERSION,
    engine: 'Web Browser',
  };
}
