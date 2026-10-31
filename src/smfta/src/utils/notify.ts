/**
 * v18.11 — real browser notifications + WebAudio chime.
 *
 * Hard rules enforced here:
 *  - never constructs a Notification without granted permission;
 *  - never throws into callers (feature degrades to silent no-op);
 *  - the chime is synthesized with WebAudio — no audio asset, no network;
 *  - no secrets are ever passed through title/body.
 */
import type { AppSettings } from '../types';

export type NotifCategory = 'taskDone' | 'errors' | 'usageLimit';

export function notificationsSupported(): boolean {
  return typeof Notification !== 'undefined';
}

export function getNotifPermission(): NotificationPermission | 'unsupported' {
  if (!notificationsSupported()) return 'unsupported';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (globalThis as any).Notification.permission;
}

export async function requestNotifPermission(): Promise<NotificationPermission> {
  if (!notificationsSupported()) return 'denied';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/** Short two-tone chime; fully synthesized, fails silently. */
export function playNotifChime(): void {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [
      { freq: 880, at: 0 },
      { freq: 1174.66, at: 0.12 },
    ].forEach(({ freq, at }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + at);
      gain.gain.exponentialRampToValueAtTime(0.12, now + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + at);
      osc.stop(now + at + 0.2);
    });
    window.setTimeout(() => {
      ctx.close().catch(() => undefined);
    }, 600);
  } catch {
    // Audio unavailable — notifications still work without sound.
  }
}

const CATEGORY_FLAG: Record<NotifCategory, keyof AppSettings> = {
  taskDone: 'notifTaskDone',
  errors: 'notifErrors',
  usageLimit: 'notifUsageLimit',
};

/**
 * Fires a notification when the user's settings allow it. Safe to call from
 * any flow: it resolves to 'skipped' instead of throwing.
 */
export function notifyUser(
  settings: AppSettings,
  category: NotifCategory,
  title: string,
  body: string
): 'shown' | 'skipped' {
  if (!settings.notifEnabled) return 'skipped';
  if (settings[CATEGORY_FLAG[category]] === false) return 'skipped';
  if (settings.notifSound) playNotifChime();
  if (!notificationsSupported() || Notification.permission !== 'granted') {
    return 'skipped';
  }
  try {
    new Notification(title, { body });
    return 'shown';
  } catch {
    return 'skipped';
  }
}
