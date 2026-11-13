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
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
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
    dbInstance = getFirestore(appInstance, firebaseConfig.firestoreDatabaseId);
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
    await getDocFromServer(doc(targetDb, 'test', 'connection'));
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('the client is offline')
    ) {
      console.error('Please check your Firebase configuration.');
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

function sanitizeDocId(rawId: string | number): string {
  const cleaned = String(rawId || 'doc')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 120);
  return cleaned || 'doc_default';
}

/**
 * Ensures the root `/users/{userId}` document exists so Master Gate subcollections
 * (`conversations`, `sessions`, `memories`, `usage`) pass relational existence checks.
 */
export async function ensureFirestoreUserProfile(
  user: FirebaseUser,
  displayName = 'SMFTA User',
  database?: Firestore
): Promise<void> {
  if (!user?.uid || !user.emailVerified) return;
  const db = database || getFirebaseServices().db;
  const userId = sanitizeDocId(user.uid);
  const path = `users/${userId}`;
  const ref = doc(db, 'users', userId);
  try {
    const snap = await getDoc(ref);
    const safeName =
      (displayName || user.displayName || 'SMFTA User').trim().slice(0, 80) ||
      'SMFTA User';
    if (!snap.exists()) {
      await setDoc(ref, {
        userId,
        displayName: safeName,
        testingBypass: false,
        testingAllowance: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function ensureFirestoreSessionDoc(
  user: FirebaseUser,
  sessionId: string | number,
  title: string,
  systemVersion: 'v1' | 'v2',
  modelId: string
): Promise<void> {
  if (!user?.uid || !user.emailVerified) return;
  const { db } = getFirebaseServices();
  await ensureFirestoreUserProfile(user, user.displayName || 'SMFTA User', db);

  const userId = sanitizeDocId(user.uid);
  const cleanSessionId = sanitizeDocId(`sess_${sessionId}`);
  const path = `users/${userId}/sessions/${cleanSessionId}`;
  const ref = doc(db, 'users', userId, 'sessions', cleanSessionId);
  const safeTitle = (title || 'Conversation').trim().slice(0, 200) || 'Conversation';
  const safeModelId = (modelId || 'smfta-v5').trim().slice(0, 64) || 'smfta-v5';

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        userId,
        sessionId: cleanSessionId,
        title: safeTitle,
        systemVersion: systemVersion === 'v2' ? 'v2' : 'v1',
        modelId: safeModelId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        title: safeTitle,
        systemVersion: systemVersion === 'v2' ? 'v2' : 'v1',
        modelId: safeModelId,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
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
  const cleanText = String(params.text || '').trim().slice(0, 32_000);
  if (!cleanText) return;

  const { db } = getFirebaseServices();
  await ensureFirestoreSessionDoc(
    params.user,
    params.sessionId,
    params.sessionTitle,
    params.systemVersion,
    params.modelId
  );

  const userId = sanitizeDocId(params.user.uid);
  const cleanSessionId = sanitizeDocId(`sess_${params.sessionId}`);
  const cleanMsgId = sanitizeDocId(params.messageId);
  const path = `users/${userId}/sessions/${cleanSessionId}/messages/${cleanMsgId}`;
  const ref = doc(
    db,
    'users',
    userId,
    'sessions',
    cleanSessionId,
    'messages',
    cleanMsgId
  );

  try {
    const existingSnap = await getDoc(ref);
    if (!existingSnap.exists()) {
      await setDoc(ref, {
        userId,
        sessionId: cleanSessionId,
        messageId: cleanMsgId,
        role: params.role === 'user' ? 'user' : 'ai',
        text: cleanText,
        modelId: (params.modelId || 'smfta-v5').trim().slice(0, 64) || 'smfta-v5',
        createdAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        text: cleanText,
        modelId: (params.modelId || 'smfta-v5').trim().slice(0, 64) || 'smfta-v5',
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function syncConversationToFirestore(
  user: FirebaseUser,
  session: ChatSession,
  systemVersion: 'v1' | 'v2',
  modelId: string
): Promise<void> {
  if (!user?.uid || !user.emailVerified || !session.msgs.length) return;
  const { db } = getFirebaseServices();
  await ensureFirestoreUserProfile(user, user.displayName || 'SMFTA User', db);

  const userId = sanitizeDocId(user.uid);
  const conversationId = sanitizeDocId(`conv_${session.id}`);
  const path = `users/${userId}/conversations/${conversationId}`;
  const ref = doc(db, 'users', userId, 'conversations', conversationId);

  const compactMsgs = session.msgs.slice(-80).map((m) => ({
    id: m.id,
    role: m.role,
    text: String(m.text || '').slice(0, 12_000),
    thinking: m.thinking ? String(m.thinking).slice(0, 4_000) : undefined,
    v2ModelId: m.v2ModelId,
    ts: m.ts,
  }));
  const messagesPayload = JSON.stringify(compactMsgs).slice(0, 240_000);
  const safeTitle =
    (session.title || 'Conversation').trim().slice(0, 200) || 'Conversation';
  const safeModelId = (modelId || 'smfta-v5').trim().slice(0, 64) || 'smfta-v5';

  try {
    const existingSnap = await getDoc(ref);
    if (!existingSnap.exists()) {
      await setDoc(ref, {
        userId,
        conversationId,
        title: safeTitle,
        systemVersion: systemVersion === 'v2' ? 'v2' : 'v1',
        modelId: safeModelId,
        messagesPayload,
        messageCount: compactMsgs.length,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        title: safeTitle,
        systemVersion: systemVersion === 'v2' ? 'v2' : 'v1',
        modelId: safeModelId,
        messagesPayload,
        messageCount: compactMsgs.length,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeToFirestoreConversations(
  user: FirebaseUser,
  onConversations: (sessions: ChatSession[]) => void
): Unsubscribe {
  const { db } = getFirebaseServices();
  const userId = sanitizeDocId(user.uid);
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
      if (loaded.length > 0) {
        onConversations(loaded);
      }
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch {
        // Logged by handleFirestoreError
      }
    }
  );
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
  const cleanFact = (fact || '').trim().slice(0, 1000);
  if (!cleanFact) return;

  const { db } = getFirebaseServices();
  await ensureFirestoreUserProfile(user, user.displayName || 'SMFTA User', db);

  const userId = sanitizeDocId(user.uid);
  const memoryId = sanitizeDocId(hashMemoryFactId(cleanFact));
  const path = `users/${userId}/memories/${memoryId}`;
  const ref = doc(db, 'users', userId, 'memories', memoryId);
  const safeTopic = (topic || 'general').trim().slice(0, 80) || 'general';
  const safeModel =
    (sourceModel || 'smfta-v5').trim().slice(0, 64) || 'smfta-v5';

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        userId,
        memoryId,
        fact: cleanFact,
        topic: safeTopic,
        sourceModel: safeModel,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        fact: cleanFact,
        topic: safeTopic,
        sourceModel: safeModel,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeToFirestoreMemories(
  user: FirebaseUser,
  onMemories: (facts: string[]) => void
): Unsubscribe {
  const { db } = getFirebaseServices();
  const userId = sanitizeDocId(user.uid);
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
      onMemories(facts);
    },
    (error) => {
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
  const userId = sanitizeDocId(user.uid);
  const path = `users/${userId}/memories`;
  try {
    const colRef = collection(db, 'users', userId, 'memories');
    const q = query(colRef, where('userId', '==', userId));
    const snap = await getDocs(q);
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  } catch (error) {
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
  const userId = sanitizeDocId(user.uid);
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

    const streamRes = await genModel.generateContentStream(
      { contents },
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
