'use strict';

const WebSocket = require('ws');
const mcpServer = require('./mcp-server');
const aiRouter = require('./ai-router');
const { decrypt, encrypt } = require('./crypto');

const HEARTBEAT_INTERVAL = 20000; // 20 秒
const RECONNECT_BASE_DELAY = 1000;
const RECONNECT_MAX_DELAY = 30000;

class WsClient {
  constructor({ relayUrl, token, deviceId, config, masterKey }) {
    this.relayUrl = relayUrl;
    this.token = token;
    this.deviceId = deviceId;
    this.config = config;
    this.masterKey = masterKey; // Buffer，由 deriveKey 生成；null 表示未启用加密
    this.ws = null;
    this.heartbeatTimer = null;
    this.reconnectAttempts = 0;
    this.stopping = false;
    this.conversationHistory = []; // 对话历史，断线重连后重置
  }

  connect() {
    if (this.stopping) return;

    const url = `${this.relayUrl}/ws?token=${this.token}&deviceId=${this.deviceId}`;
    console.log(`[WS] 正在连接 ${url}`);

    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      console.log('[WS] 连接成功');
      this.reconnectAttempts = 0;
      this._startHeartbeat();
    });

    this.ws.on('message', async (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        console.warn('[WS] 收到非 JSON 消息，忽略');
        return;
      }

      if (msg.type === 'heartbeat_ack') return;

      if (msg.type === 'command') {
        await this._handleCommand(msg);
      }
    });

    this.ws.on('close', (code, reason) => {
      console.log(`[WS] 连接断开，code=${code} reason=${reason}`);
      this._stopHeartbeat();
      this.conversationHistory = []; // 断线清空历史
      this._scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      console.error('[WS] 连接错误:', err.message);
    });
  }

  async _handleCommand(msg) {
    const { commandId, payload } = msg;
    console.log(`[Agent] 收到指令 commandId=${commandId}`);

    let plaintext;
    try {
      plaintext = this.masterKey ? decrypt(payload, this.masterKey) : payload;
    } catch (err) {
      console.error('[Agent] 解密失败:', err.message);
      this._sendResult(commandId, null, '解密失败: ' + err.message);
      return;
    }

    let finalResult;

    // 判断是自然语言指令还是结构化 tool call
    let parsed;
    try { parsed = JSON.parse(plaintext); } catch { parsed = null; }

    const isStructured = parsed && parsed.tool;

    if (isStructured) {
      // 结构化 tool call（直接调用，不走 AI）
      console.log(`[Agent] 结构化指令: ${parsed.tool}`, parsed.args);
      const result = await mcpServer.call(parsed.tool, parsed.args || {}, this.config);
      finalResult = { type: 'tool_result', ...result };
    } else if (process.env.QWEN_API_KEY) {
      // 自然语言 → AI Router → tool → 摘要
      console.log(`[Agent] 自然语言指令: "${plaintext}"`);
      try {
        const routed = await aiRouter.route(
          plaintext,
          this.config,
          (tool, args, cfg) => mcpServer.call(tool, args, cfg),
          this.conversationHistory
        );
        finalResult = {
          type: 'ai_result',
          tool: routed.tool,
          args: routed.args,
          success: routed.rawResult ? routed.rawResult.success : true,
          summary: routed.summary,
          data: routed.rawResult ? routed.rawResult.data : null,
        };
        console.log(`[Agent] AI 路由完成: tool=${routed.tool}`);
      } catch (err) {
        console.error('[Agent] AI 路由失败:', err.message);
        finalResult = { type: 'ai_result', success: false, summary: `AI 处理失败：${err.message}` };
      }
    } else {
      // 没有 API Key，尝试直接解析 JSON，否则报错
      console.warn('[Agent] 未设置 QWEN_API_KEY，无法处理自然语言指令');
      finalResult = { success: false, error: '未配置 ANTHROPIC_API_KEY，请使用结构化指令或配置 API Key' };
    }

    const resultJson = JSON.stringify(finalResult);
    const encryptedResult = this.masterKey ? encrypt(resultJson, this.masterKey) : resultJson;
    this._sendResult(commandId, encryptedResult, finalResult.success === false ? (finalResult.error || finalResult.summary) : null);
  }

  _sendResult(commandId, payload, error) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[WS] 无法发送结果，连接已断开');
      return;
    }
    this.ws.send(JSON.stringify({
      type: 'result',
      commandId,
      payload,
      error: error || null,
    }));
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'heartbeat' }));
      }
    }, HEARTBEAT_INTERVAL);
  }

  _stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  _scheduleReconnect() {
    if (this.stopping) return;
    const delay = Math.min(
      RECONNECT_BASE_DELAY * Math.pow(2, this.reconnectAttempts),
      RECONNECT_MAX_DELAY
    );
    this.reconnectAttempts++;
    console.log(`[WS] ${delay / 1000}s 后重连（第 ${this.reconnectAttempts} 次）`);
    setTimeout(() => this.connect(), delay);
  }

  stop() {
    this.stopping = true;
    this._stopHeartbeat();
    if (this.ws) {
      this.ws.close();
    }
  }
}

module.exports = WsClient;
