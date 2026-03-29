'use strict';

require('dotenv').config();

const http = require('http');
const Koa = require('koa');
const Router = require('@koa/router');
const cors = require('@koa/cors');
const bodyParser = require('koa-bodyparser');
const rateLimit = require('./middleware/rateLimit');
const authRoutes = require('./routes/auth');
const devicesRoutes = require('./routes/devices');
const commandRoutes = require('./routes/command');
const { createWsServer } = require('./websocket');
const { waitForDb } = require('./db');

const app = new Koa();
const PORT = parseInt(process.env.PORT) || 3000;

// 全局错误处理
app.on('error', (err, ctx) => {
  console.error('[App Error]', err.message, ctx?.path);
});

app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    ctx.status = err.status || 500;
    ctx.body = { success: false, error: err.message || '服务器内部错误' };
    ctx.app.emit('error', err, ctx);
  }
});

// 全局中间件
app.use(cors({ origin: '*', allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'] }));
app.use(bodyParser());
app.use(rateLimit(120));

// 健康检查
const healthRouter = new Router();
healthRouter.get('/health', (ctx) => {
  ctx.body = { success: true, message: 'relay server is running', time: new Date().toISOString() };
});
app.use(healthRouter.routes());

// 业务路由
app.use(authRoutes.routes()).use(authRoutes.allowedMethods());
app.use(devicesRoutes.routes()).use(devicesRoutes.allowedMethods());
app.use(commandRoutes.routes()).use(commandRoutes.allowedMethods());

// 404 处理
app.use((ctx) => {
  ctx.status = 404;
  ctx.body = { success: false, error: '接口不存在' };
});

// 等待数据库就绪后再启动 HTTP server
waitForDb().then(() => {
  const server = http.createServer(app.callback());
  createWsServer(server);
  server.listen(PORT, () => {
    console.log(`[Relay] HTTP + WebSocket server running on port ${PORT}`);
  });
}).catch((err) => {
  console.error('[Relay] 启动失败:', err.message);
  process.exit(1);
});

module.exports = app;
