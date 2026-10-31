import type { Request, Response, NextFunction } from 'express';

export interface RateBucket {
  count: number;
  resetAt: number;
}

export interface RateLimiterOptions {
  windowMs?: number;
  maxRequests?: number;
  maxBuckets?: number;
  sweepIntervalMs?: number;
  nowFn?: () => number;
}

export const RATE_LIMIT_MESSAGE_BN =
  'অনেক বেশি রিকোয়েস্ট পাঠানো হয়েছে। অনুগ্রহ করে ১ মিনিট পর আবার চেষ্টা করুন।';

export function parseTrustProxyHops(rawEnv?: string): number {
  if (!rawEnv || !rawEnv.trim()) return 0;
  const parsed = Number.parseInt(rawEnv.trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

export function createIpRateLimiter(options?: RateLimiterOptions) {
  const windowMs = options?.windowMs ?? 60_000;
  const maxRequests = options?.maxRequests ?? 240;
  const maxBuckets = options?.maxBuckets ?? 20_000;
  const sweepIntervalMs = options?.sweepIntervalMs ?? 60_000;
  const nowFn = options?.nowFn ?? (() => Date.now());

  const buckets = new Map<string, RateBucket>();

  function sweepExpired(now = nowFn()): number {
    let removed = 0;
    for (const [key, bucket] of buckets.entries()) {
      if (now >= bucket.resetAt) {
        buckets.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  const timer = setInterval(() => {
    sweepExpired();
  }, sweepIntervalMs);
  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  function middleware(
    req: Request & { userId?: string },
    res: Response,
    next: NextFunction
  ): void {
    const now = nowFn();
    const ip = req.ip || 'unknown';
    const userPart = req.userId ? `:${req.userId}` : '';
    const compositeKey = `${ip}${userPart}`;

    let bucket = buckets.get(compositeKey);
    if (!bucket || now >= bucket.resetAt) {
      if (!buckets.has(compositeKey) && buckets.size >= maxBuckets) {
        // First try sweeping expired entries; if still full, evict oldest entry
        sweepExpired(now);
        if (buckets.size >= maxBuckets) {
          const oldestKey = buckets.keys().next().value;
          if (oldestKey !== undefined) {
            buckets.delete(oldestKey);
          }
        }
      }
      bucket = { count: 1, resetAt: now + windowMs };
      buckets.set(compositeKey, bucket);
      next();
      return;
    }

    bucket.count += 1;
    if (bucket.count > maxRequests) {
      const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(429).json({
        error: RATE_LIMIT_MESSAGE_BN,
      });
      return;
    }

    next();
  }

  return Object.assign(middleware, {
    buckets,
    sweepExpired,
    stopTimer: () => clearInterval(timer),
  });
}

