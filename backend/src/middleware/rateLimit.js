const buckets = new Map();

function createRateLimiter({ windowMs = 15 * 60 * 1000, max = 10, message = 'Too many requests. Please try again later.' } = {}) {
  return (req, res, next) => {
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    let bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    if (bucket.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      return res.status(429).json({ message });
    }

    // Opportunistically discard expired entries to keep the map bounded.
    if (buckets.size > 5000) {
      for (const [address, entry] of buckets.entries()) {
        if (entry.resetAt <= now) buckets.delete(address);
      }
    }
    return next();
  };
}

module.exports = createRateLimiter;
