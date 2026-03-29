'use strict';

const Router = require('@koa/router');
const jwtMiddleware = require('../middleware/jwt');
const { query } = require('../db');

const router = new Router({ prefix: '/api/v1/devices' });

// GET /api/v1/devices — 获取当前用户的设备列表
router.get('/', jwtMiddleware, async (ctx) => {
  const userId = ctx.state.user.userId;
  const devices = await query(
    'SELECT device_id, device_name, is_online, last_seen FROM devices WHERE user_id = ? ORDER BY last_seen DESC',
    [userId]
  );
  ctx.body = { success: true, data: devices };
});

// POST /api/v1/devices/register — 桌面 Agent 注册设备
router.post('/register', jwtMiddleware, async (ctx) => {
  const userId = ctx.state.user.userId;
  const { deviceId, deviceName } = ctx.request.body;

  if (!deviceId) {
    ctx.status = 400;
    ctx.body = { success: false, error: 'deviceId 不能为空' };
    return;
  }

  // 检查该 deviceId 是否已属于其他用户
  const existing = await query('SELECT user_id FROM devices WHERE device_id = ?', [deviceId]);
  if (existing.length > 0 && existing[0].user_id !== userId) {
    ctx.status = 403;
    ctx.body = { success: false, error: '设备 ID 已被其他账号占用' };
    return;
  }

  await query(
    `INSERT INTO devices (user_id, device_id, device_name, last_seen)
     VALUES (?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE device_name = VALUES(device_name), last_seen = NOW()`,
    [userId, deviceId, deviceName || 'My Device']
  );

  ctx.body = { success: true, message: '设备注册成功' };
});

// DELETE /api/v1/devices/:deviceId — 解绑设备
router.delete('/:deviceId', jwtMiddleware, async (ctx) => {
  const userId = ctx.state.user.userId;
  const { deviceId } = ctx.params;

  const result = await query(
    'DELETE FROM devices WHERE device_id = ? AND user_id = ?',
    [deviceId, userId]
  );

  if (result.affectedRows === 0) {
    ctx.status = 404;
    ctx.body = { success: false, error: '设备不存在或无权限' };
    return;
  }

  ctx.body = { success: true, message: '设备已解绑' };
});

module.exports = router;
