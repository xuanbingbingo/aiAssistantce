'use strict';

// 简单的内存速率限制：每个 IP 每分钟最多 60 次请求
const requests = new Map();

function cleanup() {
  const now = Date.now();
  for (const [key, data] of requests.entries()) {
    if (now - data.windowStart > 60000) {
      requests.delete(key);
    }
  }
}

setInterval(cleanup, 60000);

function rateLimit(maxPerMinute = 60) {
  return async function rateLimitMiddleware(ctx, next) {
    const ip = ctx.ip;
    const now = Date.now();
    const data = requests.get(ip);

    if (!data || now - data.windowStart > 60000) {
      requests.set(ip, { count: 1, windowStart: now });
      await next();
      return;
    }

    if (data.count >= maxPerMinute) {
      ctx.status = 429;
      ctx.body = { success: false, error: '请求过于频繁，请稍后再试' };
      return;
    }

    data.count++;
    await next();
  };
}

module.exports = rateLimit;
