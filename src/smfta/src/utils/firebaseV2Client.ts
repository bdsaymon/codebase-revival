import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  initializeAppCheck,
  ReCaptchaV3Provider,
  AppCheck,
} from 'firebase/app-check';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User as FirebaseUser,
  Auth,
} from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  enableNetwork,
  doc,
  getDocFromServer,
  getDocs,
  deleteDoc,
  runTransaction,
  collection,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  Firestore,
  Unsubscribe,
} from 'firebase/firestore';
import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  AI,
} from 'firebase/ai';
import firebaseConfig from '../../../../firebase-applet-config.json';
import { ChatSession } from '../types';
import {
  V2ModelId,
  V2_MODEL_IDS,
  getV2ModelSpec,
  getRiyadhDateKey,
  ADMIN_EMAILS,
} from './v2UsageLimits';
import {
  sanitizeFirestoreDocId,
  buildUserProfileCreatePayload,
  buildConversationDocPayloads,
  buildSessionDocPayloads,
  buildSessionMessageDocPayloads,
  buildMemoryDocPayloads,
} from './firestorePayloadHelpers';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

let appInstance: FirebaseApp | null = null;
let dbInstance: Firestore | null = null;
let authInstance: Auth | null = null;
let appCheckInstance: AppCheck | null = null;
let aiInstance: AI | null = null;
let connectionValidated = false;
const ensuredProfilePromises = new Map<string, Promise<boolean>>();
const ensuredSessionPromises = new Map<string, Promise<boolean>>();
const pathWriteQueues = new Map<string, Promise<unknown>>();

function enqueueFirestorePathWrite<T>(
  path: string,
  task: () => Promise<T>
): Promise<T> {
  const prev = pathWriteQueues.get(path) || Promise.resolve();
  const next = prev.catch(() => undefined).then(task);
  const tail = next.finally(() => {
    if (pathWriteQueues.get(path) === tail) {
      pathWriteQueues.delete(path);
    }
  });
  pathWriteQueues.set(path, tail);
  return next;
}

export function isTransientOfflineError(error: unknown): boolean {
  const msg =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code || '').toLowerCase()
      : '';
  if (
    code === 'permission-denied' ||
    msg.includes('permission-denied') ||
    msg.includes('missing or insufficient permissions')
  ) {
    return false;
  }
  return (
    code === 'unavailable' ||
    msg.includes('the client is offline') ||
    msg.includes('client is offline') ||
    msg.includes('could not reach cloud firestore backend') ||
    msg.includes('failed to get document because the client is offline') ||
    msg.includes('network request failed') ||
    msg.includes('failed to fetch')
  );
}

async function runWithFirestoreReconnect<T>(
  database: Firestore,
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (!isTransientOfflineError(error)) {
      throw error;
    }
    await enableNetwork(database).catch(() => {});
    await new Promise((r) => setTimeout(r, 500));
    return await fn();
  }
}

export function getFirebaseServices(): {
  app: FirebaseApp;
  db: Firestore;
  auth: Auth;
  appCheck: AppCheck | null;
  ai: AI | null;
} {
  if (!appInstance) {
    appInstance =
      getApps().length > 0 ? getApps()[0]! : initializeApp(firebaseConfig);
  }
  if (!dbInstance) {
    try {
      // Force HTTPS long-polling so proxied iFrames and restrictive networks
      // never stall for 10s on WebChannel streaming and drop offline.
      dbInstance = initializeFirestore(
        appInstance,
        { experimentalForceLongPolling: true },
        firebaseConfig.firestoreDatabaseId
      );
    } catch {
      dbInstance = getFirestore(
        appInstance,
        firebaseConfig.firestoreDatabaseId
      );
    }
  }
  if (!authInstance) {
    authInstance = getAuth(appInstance);
  }
  if (
    !appCheckInstance &&
    typeof window !== 'undefined' &&
    firebaseConfig.recaptchaSiteKey &&
    firebaseConfig.recaptchaSiteKey.trim().length > 0
  ) {
    try {
      appCheckInstance = initializeAppCheck(appInstance, {
        provider: new ReCaptchaV3Provider(
          firebaseConfig.recaptchaSiteKey.trim()
        ),
        isTokenAutoRefreshEnabled: true,
      });
    } catch (err) {
      console.warn('[Firebase AppCheck] Optional initialization skipped:', err);
    }
  }
  if (!aiInstance) {
    try {
      aiInstance = getAI(appInstance, { backend: new GoogleAIBackend() });
    } catch {
      aiInstance = null;
    }
  }

  if (!connectionValidated && typeof window !== 'undefined') {
    connectionValidated = true;
    void validateFirestoreConnection(dbInstance);
  }

  return {
    app: appInstance,
    db: dbInstance,
    auth: authInstance,
    appCheck: appCheckInstance,
    ai: aiInstance,
  };
}

export async function validateFirestoreConnection(
  database?: Firestore
): Promise<boolean> {
  const targetDb = database || getFirebaseServices().db;
  try {
    await runWithFirestoreReconnect(targetDb, () =>
      getDocFromServer(doc(targetDb, 'test', 'connection'))
    );
    return true;
  } catch (error) {
    if (isTransientOfflineError(error)) {
      if (typeof navigator === 'undefined' || navigator.onLine !== false) {
        console.error('Please check your Firebase configuration.');
      }
      return false;
    }
    return true;
  }
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const { auth } = getFirebaseServices();
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function isAuthorizedTestingUser(user?: FirebaseUser | null): boolean {
  if (!user || !user.email || !user.emailVerified) return false;
  return ADMIN_EMAILS.includes(user.email.toLowerCase());
}

export async function signInWithFirebaseGoogle(): Promise<FirebaseUser | null> {
  const { auth, db } = getFirebaseServices();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const cred = await signInWithPopup(auth, provider);
  if (cred.user) {
    await ensureFirestoreUserProfile(
      cred.user,
      cred.user.displayName || 'SMFTA User',
      db
    );
  }
  return cred.user;
}

export async function signOutFromFirebase(): Promise<void> {
  const { auth } = getFirebaseServices();
  await firebaseSignOut(auth);
}

export function observeFirebaseAuth(
  callback: (user: FirebaseUser | null) => void
): Unsubscribe {
  const { auth } = getFirebaseServices();
  return onAuthStateChanged(auth, callback);
}

/**
 * Ensures the root `/users/{userId}` document exists on the server so Master Gate
 * subcollections (`conversations`, `sessions`, `memories`, `usage`) pass `userExists(userId)`.
 * Returns `true` only when `/users/{userId}` is confirmed present on Firestore.
 */
export async function ensureFirestoreUserProfile(
  user: FirebaseUser,
  displayName = 'SMFTA User',
  database?: Firestore
): Promise<boolean> {
  if (!user?.uid || !user.emailVerified) return false;
  const db = database || getFirebaseServices().db;
  const { path, userId, createData } = buildUserProfileCreatePayload(
    {
      userId: user.uid,
      displayName: displayName || user.displayName || 'SMFTA User',
    },
    serverTimestamp()
  );
  const existingTask = ensuredProfilePromises.get(userId);
  if (existingTask) {
    return existingTask;
  }

  const ref = doc(db, 'users', userId);
  const task = enqueueFirestorePathWrite(path, async () => {
    try {
      await runWithFirestoreReconnect(db, async () => {
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(ref);
          if (!snap.exists()) {
            tx.set(ref, createData);
          }
        });
      });
      return true;
    } catch (error) {
      ensuredProfilePromises.delete(userId);
      if (isTransientOfflineError(error)) {
        return false;
      }
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  });

  ensuredProfilePromises.set(userId, task);
  return task;
}

export async function ensureFirestoreSessionDoc(
  user: FirebaseUser,
  sessionId: string | number,
  title: string,
  systemVersion: 'v1' | 'v2',
  modelId: string
): Promise<boolean> {
  if (!user?.uid || !user.emailVerified) return false;
  const { db } = getFirebaseServices();
  const profileReady = await ensureFirestoreUserProfile(
    user,
    user.displayName || 'SMFTA User',
    db
  );
  if (!profileReady) return false;

  const payloads = buildSessionDocPayloads(
    { userId: user.uid, sessionId, title, systemVersion, modelId },
    serverTimestamp()
  );
  const ref = doc(db, 'users', payloads.userId, 'sessions', payloads.sessionId);

  const task = enqueueFirestorePathWrite(payloads.path, async () => {
    try {
      await runWithFirestoreReconnect(db, async () => {
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(ref);
          if (!snap.exists()) {
            tx.set(ref, payloads.createData);
          } else {
            tx.update(ref, payloads.updateData);
          }
        });
      });
      return true;
    } catch (error) {
      ensuredSessionPromises.delete(payloads.path);
      if (isTransientOfflineError(error)) return false;
      handleFirestoreError(error, OperationType.WRITE, payloads.path);
    }
  });

  ensuredSessionPromises.set(payloads.path, task);
  return task;
}

export async function saveSessionMessageToFirestore(params: {
  user: FirebaseUser;
  sessionId: string | number;
  sessionTitle: string;
  messageId: string;
  role: 'user' | 'ai';
  text: string;
  modelId: string;
  systemVersion: 'v1' | 'v2';
}): Promise<void> {
  if (!params.user?.uid || !params.user.emailVerified) return;
  const payloads = buildSessionMessageDocPayloads(
    {
      userId: params.user.uid,
      sessionId: params.sessionId,
      messageId: params.messageId,
      role: params.role,
      text: params.text,
      modelId: params.modelId,
    },
    serverTimestamp()
  );
  if (!payloads.cleanText) return;

  const { db } = getFirebaseServices();
  const sessionReady = await ensureFirestoreSessionDoc(
    params.user,
    params.sessionId,
    params.sessionTitle,
    params.systemVersion,
    params.modelId
  );
  if (!sessionReady) return;

  const ref = doc(
    db,
    'users',
    payloads.userId,
    'sessions',
    payloads.sessionId,
    'messages',
    payloads.messageId
  );

  await enqueueFirestorePathWrite(payloads.path, async () => {
    try {
      await runWithFirestoreReconnect(db, async () => {
        await runTransaction(db, async (tx) => {
          const existingSnap = await tx.get(ref);
          if (!existingSnap.exists()) {
            tx.set(ref, payloads.createData);
          } else {
            tx.update(ref, payloads.updateData);
          }
        });
      });
    } catch (error) {
      if (isTransientOfflineError(error)) return;
      handleFirestoreError(error, OperationType.WRITE, payloads.path);
    }
  });
}

export async function syncConversationToFirestore(
  user: FirebaseUser,
  session: ChatSession,
  systemVersion: 'v1' | 'v2',
  modelId: string
): Promise<void> {
  if (!user?.uid || !user.emailVerified || !session.msgs.length) return;
  const { db } = getFirebaseServices();
  const profileReady = await ensureFirestoreUserProfile(
    user,
    user.displayName || 'SMFTA User',
    db
  );
  if (!profileReady) return;

  const payloads = buildConversationDocPayloads(
    {
      userId: user.uid,
      sessionId: session.id,
      title: session.title,
      systemVersion,
      modelId,
      msgs: session.msgs,
    },
    serverTimestamp()
  );
  const ref = doc(
    db,
    'users',
    payloads.userId,
    'conversations',
    payloads.conversationId
  );

  await enqueueFirestorePathWrite(payloads.path, async () => {
    try {
      await runWithFirestoreReconnect(db, async () => {
        await runTransaction(db, async (tx) => {
          const existingSnap = await tx.get(ref);
          if (!existingSnap.exists()) {
            tx.set(ref, payloads.createData);
          } else {
            tx.update(ref, payloads.updateData);
          }
        });
      });
    } catch (error) {
      if (isTransientOfflineError(error)) return;
      handleFirestoreError(error, OperationType.WRITE, payloads.path);
    }
  });
}

export function subscribeToFirestoreConversations(
  user: FirebaseUser,
  onConversations: (sessions: ChatSession[]) => void
): Unsubscribe {
  const { db } = getFirebaseServices();
  const userId = sanitizeFirestoreDocId(user.uid);
  const path = `users/${userId}/conversations`;
  const colRef = collection(db, 'users', userId, 'conversations');
  const q = query(colRef, where('userId', '==', userId));

  return onSnapshot(
    q,
    (snapshot) => {
      const loaded: ChatSession[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        try {
          const parsedMsgs = JSON.parse(String(data.messagesPayload || '[]'));
          if (Array.isArray(parsedMsgs) && parsedMsgs.length > 0) {
            const rawNumericId = Number(
              String(data.conversationId || '').replace(/^conv_/, '')
            );
            loaded.push({
              id:
                Number.isFinite(rawNumericId) && rawNumericId > 0
                  ? rawNumericId
                  : Date.now(),
              title: String(data.title || 'Conversation'),
              msgs: parsedMsgs,
            });
          }
        } catch {
          // Ignore malformed payload
        }
      });
      onConversations(loaded);
    },
    (error) => {
      if (isTransientOfflineError(error)) return;
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch {
        // Logged by handleFirestoreError
      }
    }
  );
}

export async function deleteConversationFromFirestore(
  user: FirebaseUser,
  sessionId: string | number
): Promise<void> {
  if (!user?.uid || !user.emailVerified) return;
  const { db } = getFirebaseServices();
  const userId = sanitizeFirestoreDocId(user.uid);
  const conversationId = sanitizeFirestoreDocId(`conv_${sessionId}`);
  const cleanSessionId = sanitizeFirestoreDocId(`sess_${sessionId}`);
  const convRef = doc(db, 'users', userId, 'conversations', conversationId);
  const sessRef = doc(db, 'users', userId, 'sessions', cleanSessionId);

  try {
    await runWithFirestoreReconnect(db, () => deleteDoc(convRef));
  } catch (error) {
    if (!isTransientOfflineError(error)) {
      handleFirestoreError(
        error,
        OperationType.DELETE,
        `users/${userId}/conversations/${conversationId}`
      );
    }
  }
  try {
    await deleteDoc(sessRef);
  } catch {
    // Session doc may not exist if never saved via v2 path
  }
}

export async function clearAllFirestoreConversations(
  user: FirebaseUser
): Promise<void> {
  if (!user?.uid || !user.emailVerified) return;
  const { db } = getFirebaseServices();
  const userId = sanitizeFirestoreDocId(user.uid);

  try {
    await runWithFirestoreReconnect(db, async () => {
      const convCol = collection(db, 'users', userId, 'conversations');
      const convSnap = await getDocs(query(convCol, where('userId', '==', userId)));
      await Promise.all(convSnap.docs.map((d) => deleteDoc(d.ref)));
    });
  } catch (error) {
    if (!isTransientOfflineError(error)) {
      handleFirestoreError(error, OperationType.DELETE, `users/${userId}/conversations`);
    }
  }

  try {
    const sessCol = collection(db, 'users', userId, 'sessions');
    const sessSnap = await getDocs(query(sessCol, where('userId', '==', userId)));
    await Promise.all(sessSnap.docs.map((d) => deleteDoc(d.ref)));
  } catch {
    // ignore optional session subcollection cleanup error
  }
}

function hashMemoryFactId(fact: string): string {
  const clean = fact.trim().toLowerCase();
  let h = 2166136261;
  for (let i = 0; i < clean.length; i++) {
    h ^= clean.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `mem_${(h >>> 0).toString(16)}`;
}

export async function saveMemoryFactToFirestore(
  user: FirebaseUser,
  fact: string,
  topic = 'general',
  sourceModel = 'smfta-v5'
): Promise<void> {
  if (!user?.uid || !user.emailVerified) return;
  const rawMemoryId = hashMemoryFactId(String(fact || ''));
  const payloads = buildMemoryDocPayloads(
    {
      userId: user.uid,
      memoryId: rawMemoryId,
      fact,
      topic,
      sourceModel,
    },
    serverTimestamp()
  );
  if (!payloads.cleanFact) return;

  const { db } = getFirebaseServices();
  const profileReady = await ensureFirestoreUserProfile(
    user,
    user.displayName || 'SMFTA User',
    db
  );
  if (!profileReady) return;

  const ref = doc(db, 'users', payloads.userId, 'memories', payloads.memoryId);

  await enqueueFirestorePathWrite(payloads.path, async () => {
    try {
      await runWithFirestoreReconnect(db, async () => {
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(ref);
          if (!snap.exists()) {
            tx.set(ref, payloads.createData);
          } else {
            tx.update(ref, payloads.updateData);
          }
        });
      });
    } catch (error) {
      if (isTransientOfflineError(error)) return;
      handleFirestoreError(error, OperationType.WRITE, payloads.path);
    }
  });
}

export function subscribeToFirestoreMemories(
  user: FirebaseUser,
  onMemories: (facts: string[], meta?: { fromCache: boolean }) => void
): Unsubscribe {
  const { db } = getFirebaseServices();
  const userId = sanitizeFirestoreDocId(user.uid);
  const path = `users/${userId}/memories`;
  const colRef = collection(db, 'users', userId, 'memories');
  const q = query(colRef, where('userId', '==', userId));

  return onSnapshot(
    q,
    (snapshot) => {
      const seen = new Set<string>();
      const facts: string[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        if (typeof d.fact === 'string' && d.fact.trim()) {
          const norm = d.fact.trim();
          const key = norm.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            facts.push(norm);
          }
        }
      });
      onMemories(facts, { fromCache: snapshot.metadata.fromCache });
    },
    (error) => {
      if (isTransientOfflineError(error)) return;
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch {
        // Logged by handleFirestoreError
      }
    }
  );
}

/**
 * Selects only the most relevant bounded memories for a query without blindly
 * dumping every stored fact into the model context.
 */
export function selectRelevantFirestoreMemories(
  queryText: string,
  allFacts: string[],
  maxCount = 8
): string[] {
  if (!allFacts.length) return [];
  const STOP_WORDS = new Set([
    'me',
    'my',
    'is',
    'am',
    'are',
    'in',
    'on',
    'to',
    'for',
    'of',
    'the',
    'and',
    'or',
    'it',
    'this',
    'that',
    'help',
    'app',
  ]);
  const tokenize = (text: string): string[] =>
    String(text || '')
      .toLowerCase()
      .split(/[\s,.;:!?()[\]{}"'`]+/)
      .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));

  const words = new Set(tokenize(queryText));
  const scored = allFacts.map((fact, idx) => {
    const factTokens = new Set(tokenize(fact));
    const low = fact.toLowerCase();
    let score = 0;
    for (const w of words) {
      if (factTokens.has(w) || (w.length >= 4 && low.includes(w))) {
        score += 3;
      }
    }
    if (/name|language|prefer|আমার নাম|পছন্দ/i.test(fact)) {
      score += 1;
    }
    return { fact, score, idx };
  });
  scored.sort((a, b) => b.score - a.score || a.idx - b.idx);
  const relevant = scored.filter((s) => s.score > 0).slice(0, maxCount);
  if (relevant.length > 0) return relevant.map((r) => r.fact);
  return allFacts.slice(0, Math.min(4, maxCount));
}

export async function clearAllFirestoreMemories(
  user: FirebaseUser
): Promise<void> {
  if (!user?.uid || !user.emailVerified) return;
  const { db } = getFirebaseServices();
  const userId = sanitizeFirestoreDocId(user.uid);
  const path = `users/${userId}/memories`;
  try {
    await runWithFirestoreReconnect(db, async () => {
      const colRef = collection(db, 'users', userId, 'memories');
      const q = query(colRef, where('userId', '==', userId));
      const snap = await getDocs(q);
      await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
    });
  } catch (error) {
    if (isTransientOfflineError(error)) return;
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export interface FirestoreUsageSnapshot {
  usedByModel: Record<V2ModelId, number>;
  testingUsedByModel: Record<V2ModelId, number>;
}

/**
 * Read-only real-time listener on `/users/{userId}/usage`.
 * Normal clients can only observe their quota; writes are write-locked by Security Rules.
 */
export function subscribeToFirestoreV2Usage(
  user: FirebaseUser,
  onUsageUpdate: (snapshot: FirestoreUsageSnapshot) => void
): Unsubscribe {
  const { db } = getFirebaseServices();
  const userId = sanitizeFirestoreDocId(user.uid);
  const path = `users/${userId}/usage`;
  const colRef = collection(db, 'users', userId, 'usage');
  const q = query(colRef, where('userId', '==', userId));

  return onSnapshot(
    q,
    (snapshot) => {
      const todayRiyadh = getRiyadhDateKey();
      const usedByModel: Record<V2ModelId, number> = {
        'smfta-v5': 0,
        'smfta-v2-pro': 0,
        'smfta-max': 0,
      };
      const testingUsedByModel: Record<V2ModelId, number> = {
        'smfta-v5': 0,
        'smfta-v2-pro': 0,
        'smfta-max': 0,
      };
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        if (d.dateRiyadh === todayRiyadh && V2_MODEL_IDS.includes(d.modelId)) {
          const mId = d.modelId as V2ModelId;
          usedByModel[mId] = Math.max(0, Number(d.count) || 0);
          testingUsedByModel[mId] = Math.max(0, Number(d.testingCount) || 0);
        }
      });
      onUsageUpdate({ usedByModel, testingUsedByModel });
    },
    (error) => {
      if (isTransientOfflineError(error)) return;
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch {
        // Logged by handleFirestoreError
      }
    }
  );
}

/**
 * Formats conversation history strictly for Firebase AI Logic (`contents`):
 * skips empty text entries, starts on a user turn, and merges adjacent same-role turns.
 */
export function formatFirebaseAiContents(
  history: Array<{ role: 'user' | 'assistant'; content: string }>
): Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> {
  const turns: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> =
    [];
  for (const m of history) {
    const text = String(m.content || '').trim();
    if (!text) continue;
    const role: 'user' | 'model' = m.role === 'user' ? 'user' : 'model';
    if (turns.length === 0 && role !== 'user') continue;
    const prev = turns[turns.length - 1];
    if (prev && prev.role === role) {
      prev.parts.push({ text });
    } else {
      turns.push({ role, parts: [{ text }] });
    }
  }
  return turns;
}

/**
 * Direct single-pass V2 Firebase AI Logic (`firebase/ai`) streaming call.
 * Zero retry loops and zero V1 mixing.
 */
export async function tryStreamViaFirebaseAiLogic(params: {
  modelId: V2ModelId;
  systemInstruction: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  signal: AbortSignal;
  onDelta: (delta: string) => void;
}): Promise<boolean> {
  const { ai } = getFirebaseServices();
  if (!ai) return false;
  const spec = getV2ModelSpec(params.modelId);
  const contents = formatFirebaseAiContents(params.history);
  if (contents.length === 0) return false;

  try {
    const genModel = getGenerativeModel(ai, {
      model: spec.firebaseAiModel,
      systemInstruction: params.systemInstruction,
      generationConfig: {
        temperature: spec.temperature,
        maxOutputTokens: spec.maxOutputTokens,
      },
    });

    const typedContents = contents.map((turn) => ({
      role: turn.role,
      parts: turn.parts.map((p) => ({ type: 'text' as const, text: p.text })),
    }));

    const streamRes = await genModel.generateContentStream(
      { contents: typedContents },
      { signal: params.signal }
    );

    let emitted = false;
    for await (const chunk of streamRes.stream) {
      if (params.signal.aborted) break;
      const txt = chunk.text();
      if (txt) {
        emitted = true;
        params.onDelta(txt);
      }
    }
    return emitted;
  } catch {
    return false;
  }
}
