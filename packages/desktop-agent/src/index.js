'use strict';

require('dotenv').config();

const http = require('http');
const https = require('https');
const { loadConfig, saveConfig, getConfigPath } = require('./config');
const WsClient = require('./ws-client');
const { deriveKey } = require('./crypto');

const RELAY_URL = process.env.RELAY_URL || 'ws://localhost:3000';
const RELAY_HTTP = RELAY_URL.replace(/^ws/, 'http');
const JWT_TOKEN = process.env.AGENT_TOKEN || '';
const MASTER_PASSWORD = process.env.MASTER_PASSWORD || '';
const USER_SALT = process.env.USER_SALT || '';

async function httpPost(url, body, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, data: body }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function registerDevice(config, token) {
  console.log('[Agent] 正在注册设备...');
  const res = await httpPost(
    `${RELAY_HTTP}/api/v1/devices/register`,
    { deviceId: config.deviceId, deviceName: config.deviceName },
    token
  );
  if (res.status === 200 || res.status === 201) {
    console.log('[Agent] 设备注册成功');
  } else {
    console.error('[Agent] 设备注册失败:', JSON.stringify(res.data));
    throw new Error('设备注册失败');
  }
}

async function main() {
  const config = loadConfig();

  console.log('===========================================');
  console.log('  本地 AI 助手 - Desktop Agent');
  console.log('===========================================');
  console.log(`  DeviceID  : ${config.deviceId}`);
  console.log(`  DeviceName: ${config.deviceName}`);
  console.log(`  Config    : ${getConfigPath()}`);
  console.log(`  Relay URL : ${RELAY_URL}`);
  console.log(`  AI Router : ${process.env.QWEN_API_KEY ? '✅ 已启用（自然语言模式 / Qwen）' : '⚠️  未配置 QWEN_API_KEY（仅支持结构化指令）'}`);
  console.log('===========================================');

  if (!JWT_TOKEN) {
    console.error('[Agent] 错误：未设置 AGENT_TOKEN 环境变量');
    console.error('  请先在小程序或 Postman 中注册/登录，获取 JWT token');
    console.error('  然后设置环境变量：export AGENT_TOKEN=<你的token>');
    process.exit(1);
  }

  // 注册设备到 relay（幂等操作）
  await registerDevice(config, JWT_TOKEN);

  // 如果配置了 E2EE，派生密钥
  let masterKey = null;
  if (MASTER_PASSWORD && USER_SALT) {
    masterKey = deriveKey(MASTER_PASSWORD, USER_SALT);
    console.log('[Agent] E2EE 加密已启用');
  } else {
    console.warn('[Agent] 警告：未设置 MASTER_PASSWORD 或 USER_SALT，数据将以明文传输');
  }

  const client = new WsClient({
    relayUrl: RELAY_URL,
    token: JWT_TOKEN,
    deviceId: config.deviceId,
    config,
    masterKey,
  });

  client.connect();

  // 优雅退出
  process.on('SIGINT', () => {
    console.log('\n[Agent] 正在停止...');
    client.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    client.stop();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[Agent] 启动失败:', err.message);
  process.exit(1);
});
