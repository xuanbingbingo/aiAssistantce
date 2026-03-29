# 本地 AI 助手中控系统 — 项目计划与架构设计

> 最后更新：2026-03-29（对话历史 + 数据库别名）

---

## 一、项目背景与目标

**核心痛点**：人在外面，数据/算力在家里。需要一个桥梁，让手机能安全地调动家里电脑的能力。

**核心价值**：
- **极致隐私**：数据不经过第三方云端，只在用户自己的设备间流转（端到端加密）
- **便捷性**：自然语言指令，无需 VPN，无需公网 IP
- **生产力**：文件读写、数据库查询、导出 PDF、执行脚本等本地能力全开放

**商业模式**：
- 买断制 / 订阅制（生产力工具，用户依赖性强）
- 企业版：私有化部署中转服务器

---

## 二、系统架构

```
手机小程序 (uni-app)
      ↕  HTTPS + E2EE 加密 payload
云端中转服务器 Relay Server (Koa2 + WebSocket)
      ↕  WebSocket 长连接 + E2EE 加密 payload
桌面 Desktop Agent (Node.js 常驻进程)
      ↕  本地调用
本地文件系统 / 数据库 / Shell
```

### 核心设计原则

1. **中转服务器盲路由**：Relay Server 只转发加密 blob，永远看不到明文内容
2. **内网穿透无需配置**：桌面端主动向云端发起 WebSocket 出站连接，防火墙不拦截
3. **权限最小化**：用户在桌面端配置路径白名单和 SQL 操作白名单

---

## 三、技术选型

| 层 | 技术 | 理由 |
|---|---|---|
| 桌面 Agent | Node.js (CommonJS) + ws | 轻量、无需编译、开发者熟悉 |
| 云端中转 | Koa2 + ws + MySQL | 与现有项目栈一致 |
| 小程序 | uni-app (Vue 3 Composition API) | 一套代码编译到微信小程序 + H5 |
| 加密 | AES-256-GCM + PBKDF2 | 工业级标准，Node.js crypto 原生支持 |
| MCP 协议 | 自实现 JSON-RPC over WebSocket | 灵活，无额外依赖 |

---

## 四、目录结构

```
aiAssistantce/
├── aiAssistantce_plan.md           # 本文件（项目计划持续更新）
├── package.json                    # npm workspaces 根
├── packages/
│   ├── relay-server/               # 云端中转服务器
│   │   ├── package.json
│   │   ├── .env.example
│   │   ├── docker-compose.yml
│   │   └── src/
│   │       ├── app.js              # Koa app 入口
│   │       ├── db.js               # MySQL 连接池
│   │       ├── websocket.js        # WS 服务器 + DeviceRegistry (内存 Map)
│   │       ├── middleware/
│   │       │   ├── jwt.js          # JWT 验证中间件
│   │       │   └── rateLimit.js    # 速率限制
│   │       └── routes/
│   │           ├── auth.js         # POST /api/v1/auth/register|login
│   │           ├── devices.js      # GET/POST /api/v1/devices
│   │           └── command.js      # POST /api/v1/command
│   ├── desktop-agent/              # 桌面端常驻进程
│   │   ├── package.json
│   │   └── src/
│   │       ├── index.js            # 入口：启动 WS 客户端
│   │       ├── config.js           # 读写 ~/.local-ai-agent/config.json
│   │       ├── ws-client.js        # 连接 relay + 心跳重连
│   │       ├── crypto.js           # AES-256-GCM 加解密
│   │       ├── mcp-server.js       # MCP tool dispatcher
│   │       └── tools/
│   │           ├── fs-read.js      # 读文件（路径白名单校验）
│   │           ├── fs-list.js      # 列目录
│   │           ├── fs-write.js     # 写文件
│   │           ├── db-query.js     # 查询本地数据库（仅 SELECT）
│   │           ├── export-pdf.js   # 生成 PDF（pdfkit）
│   │           └── exec-shell.js   # 执行白名单内的 shell 命令
│   └── miniprogram/                # 手机端小程序
│       ├── package.json
│       ├── vite.config.js
│       └── src/
│           ├── main.js
│           ├── app.vue
│           ├── api/
│           │   ├── http.js         # axios 封装（JWT 拦截器）
│           │   └── ws.js           # uni WebSocket 封装
│           ├── utils/
│           │   └── crypto.js       # AES-256-GCM（crypto-js）
│           ├── stores/
│           │   ├── auth.js         # JWT + Master Password
│           │   └── chat.js         # 会话历史
│           └── pages/
│               ├── login/          # 注册/登录页
│               ├── chat/           # 主界面（发指令、看结果）
│               ├── devices/        # 设备绑定管理
│               └── settings/       # Master Password、权限配置
```

---

## 五、数据库 Schema（relay-server MySQL）

```sql
-- 用户表
CREATE TABLE users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(64) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  salt VARCHAR(64) NOT NULL,           -- 用于 PBKDF2 密钥派生
  created_at DATETIME DEFAULT NOW()
);

-- 设备表
CREATE TABLE devices (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  device_id CHAR(36) NOT NULL UNIQUE,  -- UUID
  device_name VARCHAR(128),
  is_online TINYINT DEFAULT 0,
  last_seen DATETIME,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 指令记录表
CREATE TABLE commands (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  device_id CHAR(36) NOT NULL,
  payload TEXT,                        -- 加密后的指令（relay 不解密）
  status ENUM('pending','done','error') DEFAULT 'pending',
  created_at DATETIME DEFAULT NOW()
);
```

---

## 六、核心数据流

### 6.1 设备注册流程
```
Desktop Agent 启动
  → 读取 ~/.local-ai-agent/config.json
  → 若无 DeviceID，生成 UUID 并保存
  → POST /api/v1/devices/register { deviceId, deviceName }  (携带 JWT)
  → 建立 WebSocket: ws://relay/ws?token=<JWT>&deviceId=<UUID>
  → Relay 将 WebSocket 句柄存入 DeviceRegistry Map
```

### 6.2 发送指令流程
```
用户输入: "帮我列出 D:/Work 目录"
  → 小程序用 AES-256-GCM(MasterKey) 加密指令文本
  → POST /api/v1/command { deviceId, encryptedPayload, commandId }
  → Relay 验证 JWT → 查 DeviceRegistry → ws.send(encryptedPayload)
  → Desktop Agent 收到 → AES 解密 → 解析 MCP tool call
  → 调用 fs-list tool → 获取文件列表
  → 结果加密 → ws.send({ type: 'result', commandId, payload: encrypted })
  → Relay 转发给小程序（轮询 GET /api/v1/command/:id/result）
  → 小程序解密 → 渲染结果列表
```

### 6.3 端到端加密设计
```
密钥派生：
  MasterPassword (用户设置) + salt (服务端注册时生成并返回)
    → PBKDF2(SHA-256, 100000 轮, 32 bytes)
    → AES-256-GCM Key（只在端侧存在，relay 不持有）

加密：AES-256-GCM，每次生成随机 12 bytes IV
传输格式：base64(iv + authTag + ciphertext)
```

---

## 七、API 接口约定

### relay-server HTTP API
```
POST   /api/v1/auth/register         body: { username, password }
POST   /api/v1/auth/login            body: { username, password } → { token, salt }
GET    /api/v1/devices               header: Authorization: Bearer <token>
POST   /api/v1/devices/register      body: { deviceId, deviceName }
POST   /api/v1/command               body: { deviceId, encryptedPayload }  → { commandId }
GET    /api/v1/command/:id/result    → { encryptedResult, status }
WS     /ws?token=<JWT>&deviceId=<UUID>
```

### WebSocket 消息格式（relay ↔ agent）
```json
// 下行（relay → agent）：转发指令
{ "type": "command", "commandId": "uuid", "payload": "<base64 encrypted>" }

// 上行（agent → relay）：返回结果
{ "type": "result", "commandId": "uuid", "payload": "<base64 encrypted>" }

// 心跳
{ "type": "heartbeat" }
```

### MCP Tool Call 格式（agent 内部）
```json
// 列目录
{ "tool": "fs_list", "args": { "path": "D:/Work" } }

// 读文件
{ "tool": "fs_read", "args": { "path": "D:/Work/report.txt" } }

// 数据库查询
{ "tool": "db_query", "args": { "dsn": "sqlite:./data.db", "sql": "SELECT * FROM sales WHERE date > '2025-01-01'" } }

// 导出 PDF
{ "tool": "export_pdf", "args": { "content": "...", "filename": "report.pdf" } }
```

---

## 八、依赖清单

### relay-server
```json
{
  "koa": "^2.15",
  "@koa/router": "^12.0",
  "@koa/cors": "^5.0",
  "koa-bodyparser": "^4.4",
  "ws": "^8.17",
  "jsonwebtoken": "^9.0",
  "bcryptjs": "^2.4",
  "mysql2": "^3.9",
  "uuid": "^9.0"
}
```

### desktop-agent
```json
{
  "ws": "^8.17",
  "uuid": "^9.0",
  "pdfkit": "^0.15",
  "better-sqlite3": "^9.4",
  "mysql2": "^3.9",
  "dotenv": "^16.4"
}
```

### miniprogram
```json
{
  "crypto-js": "^4.2",
  "axios": "^1.7",
  "@dcloudio/uni-app": "latest",
  "pinia": "^2.1"
}
```

---

## 九、实施阶段规划

### Phase 1 — 基础连通 ✅ 已完成
**目标**：relay-server 与 desktop-agent 通过 WebSocket 建立稳定连接

- [x] 创建 monorepo 根 package.json（npm workspaces）
- [x] relay-server：Koa app + MySQL + auth 路由（注册/登录）
- [x] relay-server：WebSocket 服务器 + DeviceRegistry（内存 Map）
- [x] relay-server：`POST /api/v1/command` 转发路由
- [x] desktop-agent：config.js（DeviceID 持久化到本地 JSON）
- [x] desktop-agent：WS 客户端 + 设备注册 + 指数退避重连

**验收**：Agent 启动后 relay 日志显示设备在线；Postman 发 command，Agent 控制台收到原始消息

---

### Phase 2 — MCP 工具层 ✅ 已完成
**目标**：Agent 能执行本地工具并返回结果

- [x] desktop-agent：mcp-server.js（解析 tool_call → 分发 → 返回结果）
- [x] tools/fs-list.js（路径白名单校验）
- [x] tools/fs-read.js
- [x] tools/fs-write.js（需明确写权限）
- [x] tools/db-query.js（仅允许 SELECT，支持 SQLite / MySQL）
- [x] tools/export-pdf.js（pdfkit 生成，返回文件路径）
- [x] tools/exec-shell.js（白名单命令执行）

**验收**：fs_list/fs_read 本地测试通过；路径白名单拦截有效；E2EE 加解密验证通过

---

### Phase 3 — 端到端加密 ✅ 已完成
**目标**：relay 日志中所有 payload 均为不可读密文

- [x] relay-server：注册时生成 salt 并持久化，登录时返回 salt
- [x] desktop-agent：crypto.js（AES-256-CBC + PBKDF2，与小程序端格式一致）
- [x] miniprogram：utils/crypto.js（crypto-js AES-256-CBC）
- [x] 权限白名单配置文件（allowedPaths, allowedDatabases, allowedCommands）
- [x] 整合到完整数据流（ws-client.js 加解密，relay 只转发密文）

**验收**：端到端加密 round-trip 测试通过，relay 日志中 payload 为密文 ✅

---

### Phase 4 — 小程序 UI ✅ 已完成
**目标**：完整的手机端操作体验

- [x] uni-app 项目初始化（vue3 + pinia）
- [x] login 页（注册/登录，存 JWT + Master Password）
- [x] devices 页（设备列表 + 在线状态指示 + 选择设备）
- [x] chat 页（消息气泡 + 加载动画 + 快捷指令）
- [x] settings 页（修改 Master Password、服务器地址、退出登录）
- [x] H5 构建验证通过

**验收**：`npm run dev:h5` 可在浏览器预览完整 UI，`npm run dev:mp-weixin` 可导入微信开发者工具

---

### Phase 5 — AI 自然语言路由 ✅ 已完成
**目标**：用户输入自然语言，桌面 Agent 自动调用 Qwen API 解析意图并路由到对应 MCP tool，结果以中文自然语言返回

**实现方案**：
- 桌面 Agent 收到指令后，调用 Qwen（通义千问）API 解析 tool_use
- Qwen 返回 tool_call → Agent 执行对应 MCP tool → 结果再经 Qwen 格式化为自然语言摘要
- 使用 OpenAI 兼容接口（`openai` npm 包 + DashScope baseURL）

**已完成任务**：
- [x] desktop-agent：ai-router.js（Qwen API function calling + 结果摘要）
- [x] desktop-agent：7 个 MCP tools 注册为 OpenAI function calling schema（含 fs_delete）
- [x] desktop-agent：ws-client.js 自动判断自然语言 vs 结构化指令分路由
- [x] miniprogram：chat store 直接发送自然语言文本，支持 ai_result 格式渲染
- [x] desktop-agent：fs_delete 工具（单文件删除，路径白名单校验）
- [x] desktop-agent：db_query 改为别名模式（dbName 替代路径/DSN，用户无需知道技术细节）
- [x] desktop-agent：ws-client.js 加入 conversationHistory，支持多轮上下文对话（最近10轮）
- [x] config.json：allowedDatabases 支持 `name` 别名字段
- [x] 示例 SQLite 数据库（users/products/orders 三张表 + 测试数据）

**验收**：输入"帮我列出 Downloads 目录"→ Qwen 解析为 fs_list → 返回中文摘要 ✅；多轮追问上下文连贯 ✅

---

### Phase 6 — 部署与打包（后续规划）
- [ ] relay-server：生产环境 Nginx 反向代理 + HTTPS/WSS
- [ ] desktop-agent：使用 `pkg` 打包为可执行文件（Windows/macOS/Linux）
- [ ] 自动更新机制（桌面端轮询版本号）
- [ ] 小程序：提交微信审核

---


---

## 十、安全要点备忘

| 风险 | 措施 |
|---|---|
| 越权访问（A 用户访问 B 的设备）| relay 验证 JWT 中 userId 与 deviceId 归属关系 |
| SQL 注入 | db-query.js 只允许 SELECT，且使用参数化查询 |
| 路径穿越 | fs tools 用 path.resolve 规范化后对比白名单前缀 |
| replay 攻击 | 每条消息含 timestamp + nonce，relay 拒绝 5 分钟前的消息 |
| Master Password 泄露 | 仅存在本地内存/Keychain，不传输，不持久化到服务器 |
| WS 连接被劫持 | 生产环境强制 WSS（TLS），relay 验证 DeviceID HMAC 签名 |

---

## 十一、本地开发账号信息

> ⚠️ 仅用于本地开发环境，生产部署前务必更换密码和 JWT_SECRET

| 项目 | 值 |
|---|---|
| 用户名 | libin |
| 密码 | libin123 |
| Salt | 925af4f8dc0147a88d42c199b7322a247fee2ca58fe7b3d77e9a4d9f674c67c4 |
| Master Password | libin123 |
| DeviceID | 6972504f-ab10-4111-aec6-d31f038c9bdc |
| DeviceName | libindeMBP |

**启动桌面 Agent 环境变量：**
```bash
export RELAY_URL=ws://localhost:3000
export AGENT_TOKEN=<每次登录重新获取>
export MASTER_PASSWORD=libin123
export USER_SALT=925af4f8dc0147a88d42c199b7322a247fee2ca58fe7b3d77e9a4d9f674c67c4
export QWEN_API_KEY=sk-ce2fcc4594904190a477fe8a6257ed1a
export AI_MODEL=qwen-plus
```

---

## 十二、更新日志

| 日期 | 变更内容 |
|---|---|
| 2026-03-29 | 初始版本，完成架构设计和四阶段规划 |
| 2026-03-29 | Phase 1+2 实施完成：relay-server（Koa+WS+MySQL）、desktop-agent（WS客户端+MCP工具层+E2EE）全部代码完成，语法检查通过 |
| 2026-03-29 | Docker 环境启动成功（MySQL 5.7 + relay），端到端加密测试通过，桌面 Agent 连接成功 |
| 2026-03-29 | Phase 4 完成：uni-app 小程序（Vue 3 + Pinia），登录/聊天/设备/设置四页面，AES-256-CBC 加密统一两端，H5 构建成功 |
| 2026-03-29 | 计划更新：Phase 3 标记完成，新增 Phase 5（AI 自然语言路由）和 Phase 6（部署打包）|
| 2026-03-29 | Phase 5 完成：ai-router.js（Qwen API，OpenAI 兼容接口），ws-client 自动分路由，miniprogram chat store 适配 ai_result 格式 |
| 2026-03-29 | 新增 fs_delete 工具；db_query 改为别名模式（dbName）；新增多轮对话历史（ws-client conversationHistory，最近10轮）；创建示例 SQLite 数据库 |
