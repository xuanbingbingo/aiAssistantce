'use strict';

const Router = require('@koa/router');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query } = require('../db');

const router = new Router({ prefix: '/api/v1/auth' });

// POST /api/v1/auth/register
router.post('/register', async (ctx) => {
  const { username, password } = ctx.request.body;

  if (!username || !password) {
    ctx.status = 400;
    ctx.body = { success: false, error: '用户名和密码不能为空' };
    return;
  }

  if (username.length < 3 || username.length > 64) {
    ctx.status = 400;
    ctx.body = { success: false, error: '用户名长度须在 3-64 个字符之间' };
    return;
  }

  if (password.length < 6) {
    ctx.status = 400;
    ctx.body = { success: false, error: '密码至少 6 位' };
    return;
  }

  const existing = await query('SELECT id FROM users WHERE username = ?', [username]);
  if (existing.length > 0) {
    ctx.status = 409;
    ctx.body = { success: false, error: '用户名已存在' };
    return;
  }

  // salt 用于 E2EE 密钥派生（PBKDF2），与密码哈希的 salt 分开
  const salt = crypto.randomBytes(32).toString('hex');
  const passwordHash = await bcrypt.hash(password, 12);

  await query(
    'INSERT INTO users (username, password_hash, salt) VALUES (?, ?, ?)',
    [username, passwordHash, salt]
  );

  ctx.status = 201;
  ctx.body = { success: true, message: '注册成功' };
});

// POST /api/v1/auth/login
router.post('/login', async (ctx) => {
  const { username, password } = ctx.request.body;

  if (!username || !password) {
    ctx.status = 400;
    ctx.body = { success: false, error: '用户名和密码不能为空' };
    return;
  }

  const rows = await query('SELECT * FROM users WHERE username = ?', [username]);
  if (rows.length === 0) {
    ctx.status = 401;
    ctx.body = { success: false, error: '用户名或密码错误' };
    return;
  }

  const user = rows[0];
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    ctx.status = 401;
    ctx.body = { success: false, error: '用户名或密码错误' };
    return;
  }

  const token = jwt.sign(
    { userId: user.id, username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  ctx.body = {
    success: true,
    data: {
      token,
      salt: user.salt,     // 返回给客户端用于 E2EE 密钥派生
      username: user.username,
    },
  };
});

module.exports = router;
