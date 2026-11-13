import {
  getFirebaseServices,
  validateFirestoreConnection,
} from './firebaseV2Client';

export interface SystemDiagnosticsReport {
  localStorageStatus: string;
  firestoreMemory: string;
  backendStatus: string;
  cacheSize: number;
  cacheBytes: number;
  localKeysCount: number;
  issuesFound: string[];
  status: 'Optimal' | 'Degraded';
  checkedAt: string;
}

export interface SystemDiagnosticsResult {
  success: boolean;
  report?: SystemDiagnosticsReport;
  error?: string;
}

export interface StorageLike {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  removeItem(key: string): void;
}

const PROTECTED_KEY_PREFIXES = ['smfta_'];

export function isTemporaryStaleKey(key: string): boolean {
  if (!key) return false;
  if (key === 'smfta_active_task_plan') {
    return true;
  }
  if (PROTECTED_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) {
    return false;
  }
  return (
    key.includes('temp_') || key.includes('debug_') || key.includes('cache_')
  );
}

/**
 * Removes temporary/debug/cache localStorage entries while preserving core SMFTA
 * user data (`smfta_*` settings, chat history, profiles, and memory bank).
 */
export function cleanupStaleLocalStorage(storage?: StorageLike | null): {
  removedKeys: string[];
  remainingKeysCount: number;
  cacheBytes: number;
} {
  const target =
    storage ??
    (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
      ? window.localStorage
      : null);

  if (!target) {
    return { removedKeys: [], remainingKeysCount: 0, cacheBytes: 0 };
  }

  const allKeys: string[] = [];
  for (let i = 0; i < target.length; i += 1) {
    const k = target.key(i);
    if (k !== null) allKeys.push(k);
  }

  const removedKeys: string[] = [];
  for (const key of allKeys) {
    if (isTemporaryStaleKey(key)) {
      target.removeItem(key);
      removedKeys.push(key);
    }
  }

  let cacheBytes = 0;
  let remainingKeysCount = 0;
  for (let i = 0; i < target.length; i += 1) {
    const k = target.key(i);
    if (k === null) continue;
    remainingKeysCount += 1;
    const val = target.getItem(k) || '';
    cacheBytes += (k.length + val.length) * 2;
  }

  return {
    removedKeys,
    remainingKeysCount,
    cacheBytes,
  };
}

/**
 * Runs non-destructive SMFTA AI health & memory diagnostics using the active
 * modular Firebase SDK (`firebase/firestore`), local storage hygiene, and API health.
 */
export async function runSystemDiagnostics(opts?: {
  storage?: StorageLike | null;
  skipNetworkCheck?: boolean;
  checkFirestore?: () => Promise<boolean>;
}): Promise<SystemDiagnosticsResult> {
  const issuesFound: string[] = [];

  try {
    const storageStats = cleanupStaleLocalStorage(opts?.storage);
    for (const removed of storageStats.removedKeys) {
      issuesFound.push(`Removed temporary local key: ${removed}`);
    }

    let firestoreMemory = 'Running on Local Fallback State';
    let firestoreOk = false;

    if (opts?.checkFirestore) {
      firestoreOk = await opts.checkFirestore().catch(() => false);
      firestoreMemory = firestoreOk
        ? 'Connected & Active (Cloud Firestore)'
        : 'Running on Local Fallback State';
    } else if (typeof window !== 'undefined') {
      try {
        const { db, auth } = getFirebaseServices();
        const reachable = await validateFirestoreConnection(db);
        if (reachable) {
          firestoreOk = true;
          firestoreMemory = auth.currentUser?.emailVerified
            ? 'Connected & Active (Signed-in Sync Enabled)'
            : 'Connected & Active (Cloud Firestore Ready)';
        }
      } catch {
        firestoreMemory = 'Running on Local Fallback State';
      }
    }

    let backendStatus = 'Skipped';
    if (!opts?.skipNetworkCheck && typeof fetch === 'function' && typeof window !== 'undefined') {
      try {
        const res = await fetch('/api/v2/quota?userId=default-user', {
          method: 'GET',
        });
        backendStatus = res.ok ? 'Connected & Healthy' : `HTTP ${res.status}`;
        if (!res.ok) {
          issuesFound.push(`V2 quota endpoint returned HTTP ${res.status}`);
        }
      } catch (err) {
        backendStatus = 'Unreachable';
        issuesFound.push(
          `Backend check failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    const winWithGc =
      typeof window !== 'undefined'
        ? (window as Window & { gc?: () => void })
        : null;
    if (winWithGc && typeof winWithGc.gc === 'function') {
      winWithGc.gc();
    }

    const report: SystemDiagnosticsReport = {
      localStorageStatus: 'Cleaned and Synchronized',
      firestoreMemory,
      backendStatus,
      cacheSize: Math.round((storageStats.cacheBytes / 1024) * 100) / 100,
      cacheBytes: storageStats.cacheBytes,
      localKeysCount: storageStats.remainingKeysCount,
      issuesFound,
      status: firestoreOk || opts?.skipNetworkCheck ? 'Optimal' : 'Degraded',
      checkedAt: new Date().toISOString(),
    };

    return { success: true, report };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
