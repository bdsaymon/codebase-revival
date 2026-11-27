//#region node_modules/.nitro/vite/services/ssr/assets/rateLimit-N72zsxxS.js
var RATE_LIMIT_MESSAGE_BN = "অনেক বেশি রিকোয়েস্ট পাঠানো হয়েছে। অনুগ্রহ করে ১ মিনিট পর আবার চেষ্টা করুন।";
function parseTrustProxyHops(rawEnv) {
	if (!rawEnv || !rawEnv.trim()) return 0;
	const parsed = Number.parseInt(rawEnv.trim(), 10);
	if (!Number.isFinite(parsed) || parsed < 0) return 0;
	return parsed;
}
function createIpRateLimiter(options) {
	const windowMs = options?.windowMs ?? 6e4;
	const maxRequests = options?.maxRequests ?? 240;
	const maxBuckets = options?.maxBuckets ?? 2e4;
	const sweepIntervalMs = options?.sweepIntervalMs ?? 6e4;
	const nowFn = options?.nowFn ?? (() => Date.now());
	const buckets = /* @__PURE__ */ new Map();
	function sweepExpired(now = nowFn()) {
		let removed = 0;
		for (const [key, bucket] of buckets.entries()) if (now >= bucket.resetAt) {
			buckets.delete(key);
			removed += 1;
		}
		return removed;
	}
	const timer = setInterval(() => {
		sweepExpired();
	}, sweepIntervalMs);
	if (typeof timer.unref === "function") timer.unref();
	function middleware(req, res, next) {
		const now = nowFn();
		const compositeKey = `${req.ip || "unknown"}${req.userId ? `:${req.userId}` : ""}`;
		let bucket = buckets.get(compositeKey);
		if (!bucket || now >= bucket.resetAt) {
			if (!buckets.has(compositeKey) && buckets.size >= maxBuckets) {
				sweepExpired(now);
				if (buckets.size >= maxBuckets) {
					const oldestKey = buckets.keys().next().value;
					if (oldestKey !== void 0) buckets.delete(oldestKey);
				}
			}
			bucket = {
				count: 1,
				resetAt: now + windowMs
			};
			buckets.set(compositeKey, bucket);
			next();
			return;
		}
		bucket.count += 1;
		if (bucket.count > maxRequests) {
			const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1e3));
			res.setHeader("Retry-After", String(retryAfterSec));
			res.status(429).json({ error: RATE_LIMIT_MESSAGE_BN });
			return;
		}
		next();
	}
	return Object.assign(middleware, {
		buckets,
		sweepExpired,
		stopTimer: () => clearInterval(timer)
	});
}
//#endregion
export { RATE_LIMIT_MESSAGE_BN, createIpRateLimiter, parseTrustProxyHops };
