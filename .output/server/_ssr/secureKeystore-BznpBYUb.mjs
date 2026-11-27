//#region node_modules/.nitro/vite/services/ssr/assets/secureKeystore-BznpBYUb.js
/**
* SMFTA Pro — Secure at-rest keystore for API secrets (v18.11.0)
*
* Hard requirement: API keys must never sit in browser storage as plaintext.
* A non-extractable AES-256-GCM key is created once and kept in IndexedDB
* (origin-bound, invisible to `localStorage` dumps and not readable by other
* origins). Only short ciphertext strings are written to localStorage.
*
* Threat model: this protects data at rest (stolen storage, exported JSON,
* shared devices) and prevents accidental leakage through devtools/exports.
* A same-origin script running inside the app can still ask the keystore to
* decrypt — the v18.9 CSP is what keeps untrusted scripts out in the first
* place.
*
* Environments without IndexedDB (SSR, unit tests, very old WebViews) fall
* back to an ephemeral in-memory key: encryption still works for the session,
* and `isEphemeralKeystore()` lets the UI warn that secrets will not persist.
* Legacy plaintext values decrypt transparently and are re-encrypted on the
* next write, so migration needs no user action.
*/
var ENC_PREFIX = "enc:v1:";
var DB_NAME = "smfta-secure-keystore";
var STORE_NAME = "keys";
var KEY_ID = "aes-gcm-v1";
function isEncrypted(value) {
	return typeof value === "string" && value.startsWith(ENC_PREFIX);
}
function toBase64(bytes) {
	let binary = "";
	for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
	if (typeof btoa === "function") return btoa(binary);
	return Buffer.from(bytes).toString("base64");
}
function fromBase64(value) {
	const binary = typeof atob === "function" ? atob(value) : Buffer.from(value, "base64").toString("binary");
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
	return bytes;
}
function hasSubtleCrypto() {
	return typeof globalThis !== "undefined" && typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.subtle !== "undefined";
}
function hasIndexedDb() {
	return typeof indexedDB !== "undefined" && !!indexedDB;
}
function openKeyDb() {
	return new Promise((resolve, reject) => {
		if (!hasIndexedDb()) {
			reject(/* @__PURE__ */ new Error("IndexedDB unavailable"));
			return;
		}
		const req = indexedDB.open(DB_NAME, 1);
		req.onupgradeneeded = () => {
			const db = req.result;
			if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error || /* @__PURE__ */ new Error("IndexedDB open failed"));
	});
}
function idbGet(db, id) {
	return new Promise((resolve, reject) => {
		const req = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(id);
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}
function idbPut(db, id, value) {
	return new Promise((resolve, reject) => {
		const req = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(value, id);
		req.onsuccess = () => resolve();
		req.onerror = () => reject(req.error);
	});
}
var cachedKey = null;
var keyPromise = null;
var ephemeral = false;
async function createEphemeralKey() {
	ephemeral = true;
	return globalThis.crypto.subtle.generateKey({
		name: "AES-GCM",
		length: 256
	}, false, ["encrypt", "decrypt"]);
}
async function loadOrCreateKey() {
	if (cachedKey) return cachedKey;
	if (!hasSubtleCrypto()) throw new Error("Web Crypto API is not available in this environment");
	try {
		const db = await openKeyDb();
		const existing = await idbGet(db, KEY_ID);
		if (existing && existing instanceof CryptoKey) {
			cachedKey = existing;
			return existing;
		}
		const fresh = await globalThis.crypto.subtle.generateKey({
			name: "AES-GCM",
			length: 256
		}, false, ["encrypt", "decrypt"]);
		await idbPut(db, KEY_ID, fresh);
		cachedKey = fresh;
		return fresh;
	} catch {
		return createEphemeralKey();
	}
}
function getKey() {
	if (!keyPromise) keyPromise = loadOrCreateKey();
	return keyPromise;
}
/** True when secrets cannot survive a reload (no IndexedDB in this runtime). */
function isEphemeralKeystore() {
	return ephemeral;
}
/** Whether encrypted storage is usable at all in this runtime. */
function keystoreAvailable() {
	return hasSubtleCrypto();
}
/**
* Forces key initialization so callers can learn the real storage mode
* (persistent IndexedDB vs ephemeral page memory) before their first secret.
*/
async function ensureKeystore() {
	if (!hasSubtleCrypto()) return {
		available: false,
		ephemeral: true
	};
	await getKey();
	return {
		available: true,
		ephemeral: isEphemeralKeystore()
	};
}
function randomIv() {
	return globalThis.crypto.getRandomValues(/* @__PURE__ */ new Uint8Array(12));
}
/**
* Views a Uint8Array as a standalone ArrayBuffer for the Web Crypto BufferSource
* contract (TS lib.dom now rejects SharedArrayBuffer-backed views).
*/
function asBufferSource(bytes) {
	return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}
/**
* Encrypts a secret. Empty input stays empty (nothing to protect) so callers
* can round-trip keyless providers without special cases.
*/
async function encryptSecret(plaintext) {
	const value = String(plaintext || "");
	if (!value) return "";
	if (isEncrypted(value)) return value;
	const key = await getKey();
	const iv = randomIv();
	const cipher = await globalThis.crypto.subtle.encrypt({
		name: "AES-GCM",
		iv: asBufferSource(iv)
	}, key, asBufferSource(new TextEncoder().encode(value)));
	return `${ENC_PREFIX}${toBase64(iv)}:${toBase64(new Uint8Array(cipher))}`;
}
/**
* Decrypts a stored value. Legacy plaintext (pre-v18.11) is returned as-is so
* old installs keep working and migrate on their next save.
*/
async function decryptSecret(stored) {
	const value = String(stored || "");
	if (!value) return "";
	if (!isEncrypted(value)) return value;
	const payload = value.slice(7);
	const sep = payload.indexOf(":");
	const ivB64 = sep === -1 ? "" : payload.slice(0, sep);
	const dataB64 = sep === -1 ? "" : payload.slice(sep + 1);
	if (!ivB64 || !dataB64 || dataB64.includes(":")) throw new Error("Malformed encrypted secret");
	const key = await getKey();
	const plain = await globalThis.crypto.subtle.decrypt({
		name: "AES-GCM",
		iv: asBufferSource(fromBase64(ivB64))
	}, key, asBufferSource(fromBase64(dataB64)));
	return new TextDecoder().decode(plain);
}
var KEYSTORE_META_KEY = "smfta_keystore_meta";
function getKeystoreMetadata() {
	let lastRotatedAt = null;
	let rotationCount = 0;
	try {
		if (typeof localStorage !== "undefined") {
			const raw = localStorage.getItem(KEYSTORE_META_KEY);
			if (raw) {
				const parsed = JSON.parse(raw);
				if (typeof parsed.lastRotatedAt === "string") lastRotatedAt = parsed.lastRotatedAt;
				if (typeof parsed.rotationCount === "number" && Number.isFinite(parsed.rotationCount)) rotationCount = parsed.rotationCount;
			}
		}
	} catch {}
	return {
		available: keystoreAvailable(),
		ephemeral: isEphemeralKeystore(),
		algorithm: "AES-GCM-256",
		lastRotatedAt,
		rotationCount
	};
}
async function encryptWithKey(plaintext, key) {
	const value = String(plaintext || "");
	if (!value) return "";
	const iv = randomIv();
	const cipher = await globalThis.crypto.subtle.encrypt({
		name: "AES-GCM",
		iv: asBufferSource(iv)
	}, key, asBufferSource(new TextEncoder().encode(value)));
	return `${ENC_PREFIX}${toBase64(iv)}:${toBase64(new Uint8Array(cipher))}`;
}
async function decryptWithKey(stored, key) {
	const value = String(stored || "");
	if (!value) return "";
	if (!isEncrypted(value)) return value;
	const payload = value.slice(7);
	const sep = payload.indexOf(":");
	const ivB64 = sep === -1 ? "" : payload.slice(0, sep);
	const dataB64 = sep === -1 ? "" : payload.slice(sep + 1);
	if (!ivB64 || !dataB64 || dataB64.includes(":")) throw new Error("Malformed encrypted secret");
	const plain = await globalThis.crypto.subtle.decrypt({
		name: "AES-GCM",
		iv: asBufferSource(fromBase64(ivB64))
	}, key, asBufferSource(fromBase64(dataB64)));
	return new TextDecoder().decode(plain);
}
/**
* Generates a brand-new non-extractable AES-256-GCM master CryptoKey, persists
* it in IndexedDB (or memory if ephemeral), and invokes the caller's re-seal
* callback so every encrypted credential on the device is decrypted under the
* previous key and re-encrypted under the new key atomically.
*/
async function rotateKeystoreMasterKey(reencryptCallback) {
	if (!hasSubtleCrypto()) throw new Error("Web Crypto API is not available in this environment");
	const oldKey = await getKey();
	const freshKey = await globalThis.crypto.subtle.generateKey({
		name: "AES-GCM",
		length: 256
	}, false, ["encrypt", "decrypt"]);
	let reencryptedCount = 0;
	if (reencryptCallback) reencryptedCount = await reencryptCallback({
		decryptOld: (stored) => decryptWithKey(stored, oldKey),
		encryptNew: (plaintext) => encryptWithKey(plaintext, freshKey)
	});
	try {
		if (hasIndexedDb()) {
			await idbPut(await openKeyDb(), KEY_ID, freshKey);
			ephemeral = false;
		} else ephemeral = true;
	} catch {
		ephemeral = true;
	}
	cachedKey = freshKey;
	keyPromise = Promise.resolve(freshKey);
	const prevMeta = getKeystoreMetadata();
	const rotatedAt = (/* @__PURE__ */ new Date()).toISOString();
	const rotationCount = prevMeta.rotationCount + 1;
	try {
		if (typeof localStorage !== "undefined") localStorage.setItem(KEYSTORE_META_KEY, JSON.stringify({
			lastRotatedAt: rotatedAt,
			rotationCount
		}));
	} catch {}
	return {
		ok: true,
		rotatedAt,
		rotationCount,
		reencryptedCount,
		ephemeral
	};
}
//#endregion
export { rotateKeystoreMasterKey as a, isEncrypted as i, encryptSecret as n, ensureKeystore as r, decryptSecret as t };
