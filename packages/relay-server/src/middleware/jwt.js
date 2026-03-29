'use strict';

const jwt = require('jsonwebtoken');

async function jwtMiddleware(ctx, next) {
  const authHeader = ctx.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    ctx.status = 401;
    ctx.body = { success: false, error: '未提供认证 token' };
    return;
  }

  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    ctx.state.user = decoded;
    await next();
  } catch (err) {
    ctx.status = 401;
    ctx.body = { success: false, error: 'token 无效或已过期' };
  }
}

module.exports = jwtMiddleware;
