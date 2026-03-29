'use strict';

const Router = require('@koa/router');
const { v4: uuidv4 } = require('uuid');
const jwtMiddleware = require('../middleware/jwt');
const { query } = require('../db');
const { getRegistry } = require('../websocket');

const router = new Router({ prefix: '/api/v1/command' });

// POST /api/v1/command — 小程序发送指令给桌面 Agent
router.post('/', jwtMiddleware, async (ctx) => {
  const userId = ctx.state.user.userId;
  const { deviceId, encryptedPayload } = ctx.request.body;

  if (!deviceId || !encryptedPayload) {
    ctx.status = 400;
    ctx.body = { success: false, error: 'deviceId 和 encryptedPayload 不能为空' };
    return;
  }

  // 验证设备归属
  const devices = await query(
    'SELECT id FROM devices WHERE device_id = ? AND user_id = ?',
    [deviceId, userId]
  );
  if (devices.length === 0) {
    ctx.status = 403;
    ctx.body = { success: false, error: '设备不存在或无权限' };
    return;
  }

  // 检查设备是否在线
  const registry = getRegistry();
  const ws = registry.get(deviceId);
  if (!ws || ws.readyState !== 1) {
    ctx.status = 503;
    ctx.body = { success: false, error: '设备当前不在线' };
    return;
  }

  // 保存指令记录（payload 是加密密文，relay 不解密）
  await query(
    'INSERT INTO commands (user_id, device_id, payload, status) VALUES (?, ?, ?, ?)',
    [userId, deviceId, encryptedPayload, 'pending']
  );

  // 拿到插入后的自增 id
  const rows = await query('SELECT LAST_INSERT_ID() as id');
  const dbId = rows[0].id;

  // 通过 WebSocket 将加密指令推送给桌面 Agent
  ws.send(JSON.stringify({
    type: 'command',
    commandId: String(dbId),
    payload: encryptedPayload,
  }));

  ctx.body = { success: true, data: { commandId: String(dbId) } };
});

// GET /api/v1/command/:id/result — 轮询指令结果
router.get('/:id/result', jwtMiddleware, async (ctx) => {
  const userId = ctx.state.user.userId;
  const { id } = ctx.params;

  const rows = await query(
    'SELECT status, result FROM commands WHERE id = ? AND user_id = ?',
    [id, userId]
  );

  if (rows.length === 0) {
    ctx.status = 404;
    ctx.body = { success: false, error: '指令不存在' };
    return;
  }

  const cmd = rows[0];
  ctx.body = {
    success: true,
    data: {
      status: cmd.status,
      encryptedResult: cmd.result,
    },
  };
});

module.exports = router;
