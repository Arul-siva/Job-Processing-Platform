const { redisClient } = require('../redis/client');

/**
 * Sliding window rate limiter using Redis
 * @param {Number} limit Max requests
 * @param {Number} windowMs Time window in milliseconds
 */
const rateLimiter = (limit = 10, windowMs = 60000) => {
  return async (req, res, next) => {
    try {
      const userId = req.user?.userId || req.ip;
      const key = `ratelimit:${userId}`;
      const now = Date.now();
      const windowStart = now - windowMs;

      // Use Redis transaction (multi) to achieve atomicity
      const multi = redisClient.multi();
      // Remove old entries
      multi.zRemRangeByScore(key, 0, windowStart);
      // Count existing within window
      multi.zCard(key);
      
      const results = await multi.exec();
      const requestsCount = results[1];

      if (requestsCount >= limit) {
        return res.status(429).json({ error: 'Too Many Requests' });
      }

      // Add current request
      await redisClient.zAdd(key, { score: now, value: `${now}-${Math.random()}` });
      // Set expiry on key to clean up automatically
      await redisClient.expire(key, Math.ceil(windowMs / 1000));

      next();
    } catch (err) {
      console.error('Rate limit error:', err);
      // Fail open instead of failing requests if Redis has issues here
      next();
    }
  };
};

module.exports = rateLimiter;
