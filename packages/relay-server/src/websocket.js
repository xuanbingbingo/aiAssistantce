'use strict';

const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const { query } = require('./db');

// DeviceRegistry: deviceId (string) → WebSocket 实例
const registry = new Map();

function getRegistry() {
  return registry;
}

function createWsServer(server) {
  const wss = new WebSocketServer({ server });

  wss.on('connection', async (ws, req) => {
    // 从 URL query 中解析 token 和 deviceId
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');
    const deviceId = url.searchParams.get('deviceId');

    if (!token || !deviceId) {
      ws.close(4001, '缺少 token 或 deviceId');
      return;
    }

    // 验证 JWT
    let user;
    try {
      user = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      ws.close(4002, 'token 无效');
      return;
    }

    // 验证设备归属
    const devices = await query(
      'SELECT id FROM devices WHERE device_id = ? AND user_id = ?',
      [deviceId, user.userId]
    );
    if (devices.length === 0) {
      ws.close(4003, '设备不属于该用户');
      return;
    }

    // 注册到 registry
    registry.set(deviceId, ws);
    await query('UPDATE devices SET is_online = 1, last_seen = NOW() WHERE device_id = ?', [deviceId]);
    console.log(`[WS] device ${deviceId} (user: ${user.username}) connected`);

    // 启动心跳检测
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', async (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (msg.type === 'heartbeat') {
        ws.send(JSON.stringify({ type: 'heartbeat_ack' }));
        return;
      }

      // 桌面 Agent 返回指令执行结果
      if (msg.type === 'result' && msg.commandId) {
        await query(
          'UPDATE commands SET status = ?, result = ?, updated_at = NOW() WHERE id = ?',
          [msg.error ? 'error' : 'done', msg.payload || null, msg.commandId]
        );
        console.log(`[WS] result received for commandId=${msg.commandId}`);
      }
    });

    ws.on('close', async () => {
      registry.delete(deviceId);
      await query('UPDATE devices SET is_online = 0 WHERE device_id = ?', [deviceId]);
      console.log(`[WS] device ${deviceId} disconnected`);
    });

    ws.on('error', (err) => {
      console.error(`[WS] device ${deviceId} error:`, err.message);
    });
  });

  // 每 30 秒 ping 一次，清理失效连接
  const interval = setInterval(() => {
    for (const [deviceId, ws] of registry.entries()) {
      if (!ws.isAlive) {
        registry.delete(deviceId);
        query('UPDATE devices SET is_online = 0 WHERE device_id = ?', [deviceId]).catch(() => {});
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, 30000);

  wss.on('close', () => clearInterval(interval));

  return wss;
}

module.exports = { createWsServer, getRegistry };
