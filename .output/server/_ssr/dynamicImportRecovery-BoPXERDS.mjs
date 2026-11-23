//#region node_modules/.nitro/vite/services/ssr/assets/dynamicImportRecovery-BoPXERDS.js
var CHUNK_RELOAD_STORAGE_KEY = "smfta_chunk_reload_at";
var DEFAULT_CHUNK_RELOAD_COOLDOWN_MS = 15e3;
function getErrorMessage(error) {
	if (error instanceof Error) return error.message || error.name || "";
	if (typeof error === "string") return error;
	if (error && typeof error === "object" && "message" in error) return String(error.message || "");
	return String(error ?? "");
}
/**
* Detects transient network, stale-dev-server, or outdated-chunk dynamic ES module
* import failures across Chromium, Firefox, Safari, and WebView.
*/
function isDynamicImportError(error) {
	const msg = getErrorMessage(error);
	return (error instanceof Error ? error.name : "") === "ChunkLoadError" || /failed to fetch dynamically imported module/i.test(msg) || /importing a module script failed/i.test(msg) || /error loading dynamically imported module/i.test(msg) || /loading (?:css )?chunk [\w-]+ failed/i.test(msg) || /unable to preload css/i.test(msg);
}
/**
* Guards automatic page reloads with a cooldown stored in sessionStorage so a
* broken network or unreachable server never causes an infinite reload loop.
*/
function shouldAttemptChunkReload(storage, nowMs = Date.now(), cooldownMs = DEFAULT_CHUNK_RELOAD_COOLDOWN_MS) {
	if (!storage) return false;
	try {
		const raw = storage.getItem(CHUNK_RELOAD_STORAGE_KEY);
		const lastTs = raw ? Number(raw) : 0;
		if (Number.isFinite(lastTs) && lastTs > 0 && nowMs - lastTs < cooldownMs) return false;
		storage.setItem(CHUNK_RELOAD_STORAGE_KEY, String(nowMs));
		return true;
	} catch {
		return false;
	}
}
function clearChunkReloadGuard(storage) {
	if (!storage) return;
	try {
		storage.removeItem(CHUNK_RELOAD_STORAGE_KEY);
	} catch {}
}
async function loadWithRetry(loader, options = {}) {
	const retries = Math.max(0, options.retries ?? 3);
	const baseDelayMs = Math.max(0, options.delayMs ?? 300);
	let lastError;
	for (let attempt = 0; attempt <= retries; attempt++) try {
		return await loader();
	} catch (error) {
		lastError = error;
		if (options.isCancelled?.()) throw error;
		if (attempt >= retries || !isDynamicImportError(error)) throw error;
		options.onRetry?.(attempt + 1, error);
		if (baseDelayMs > 0) {
			const waitMs = baseDelayMs * Math.pow(2, attempt);
			await new Promise((resolve) => setTimeout(resolve, waitMs));
			if (options.isCancelled?.()) throw error;
		}
	}
	throw lastError;
}
//#endregion
export { shouldAttemptChunkReload as i, isDynamicImportError as n, loadWithRetry as r, clearChunkReloadGuard as t };
