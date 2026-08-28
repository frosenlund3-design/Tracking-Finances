import '@/lib/server-guard';

/**
 * In-process sliding-window limiter. Adequate for a single instance; swap the
 * store for Redis when running more than one. Kept deliberately small so the
 * limits themselves stay readable and auditable.
 */

interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.hits.length === 0 || now - bucket.hits[bucket.hits.length - 1]! > 3_600_000) {
      buckets.delete(key);
    }
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { hits: [] };
    buckets.set(key, bucket);
  }
  const cutoff = now - windowMs;
  bucket.hits = bucket.hits.filter((t) => t > cutoff);
  if (bucket.hits.length >= limit) {
    const oldest = bucket.hits[0]!;
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
    };
  }
  bucket.hits.push(now);
  return { allowed: true, remaining: limit - bucket.hits.length, retryAfterSeconds: 0 };
}

export const LIMITS = {
  login: { limit: 8, windowMs: 15 * 60_000 },
  // Households, offices and phone networks share an IP, so a handful per hour
  // is too tight to be about abuse and tight enough to lock out a family.
  signup: { limit: 12, windowMs: 60 * 60_000 },
  passwordReset: { limit: 5, windowMs: 60 * 60_000 },
  assistant: { limit: 30, windowMs: 60 * 60_000 },
  sync: { limit: 12, windowMs: 60 * 60_000 },
  write: { limit: 120, windowMs: 60_000 },
} as const;

/** Clears all buckets. Tests only. */
export function resetRateLimits() {
  buckets.clear();
}
