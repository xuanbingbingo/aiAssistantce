# AI 助手 · 本地中控系统

用手机远程调动家里电脑的能力。发送自然语言指令，桌面 Agent 在本地执行文件读写、数据库查询、Shell 命令等操作，结果加密返回到手机。

**数据不过第三方**：云端中转服务器只转发加密数据包，看不到任何明文内容。

---

## 架构

```
手机小程序（uni-app）
      ↕  HTTPS + E2EE 加密
云端中转服务器 relay-server（Koa + WebSocket）
      ↕  WebSocket 长连接 + E2EE 加密
桌面 Desktop Agent（Node.js 常驻进程）
      ↕  本地调用
本地文件 / 数据库 / Shell
```

---

## 项目结构

```
aiAssistantce/
├── packages/
│   ├── relay-server/     # 云端中转服务（Koa + MySQL + WebSocket）
│   ├── desktop-agent/    # 桌面端常驻进程（Mac）
│   └── miniprogram/      # 手机端（uni-app 微信小程序）
├── scripts/
│   └── mp-upload.js      # 小程序 CI 上传脚本
├── docker-compose.yml    # 生产部署配置
└── .env.example          # 环境变量模板
```

---

## 快速开始

### 一、启动中转服务器（本地开发）

```bash
# 1. 安装根依赖
npm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，填入 MySQL 密码和 JWT Secret

# 3. 启动（需要本地有 MySQL 8.0）
npm run relay
# 或直接进子包
cd packages/relay-server && npm start
```

**relay-server 环境变量**（`.env`）：

| 变量 | 说明 | 示例 |
|------|------|------|
| `MYSQL_ROOT_PASSWORD` | MySQL root 密码 | `MyRootPwd123` |
| `DB_USER` | 数据库用户名 | `ai_user` |
| `DB_PASSWORD` | 数据库密码 | `MyPwd123` |
| `DB_NAME` | 数据库名 | `ai_assistant` |
| `JWT_SECRET` | JWT 签名密钥（建议32位随机串） | `your-secret-key` |
| `PORT` | 服务端口 | `3000` |

**生产环境用 Docker 启动：**

```bash
docker compose up -d
```

健康检查：`GET /health` → `{"success":true,"message":"relay server is running"}`

---

### 二、注册账号

中转服务器不内置默认账号，首次使用需要注册：

```bash
curl -X POST https://你的域名/ai-relay/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"your_username","password":"your_password"}'
```

登录获取 token：

```bash
curl -X POST https://你的域名/ai-relay/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"your_username","password":"your_password"}'
# 返回 token 和 salt，保存备用
```

> 线上地址：`https://haoyuyun.top/ai-relay`

---

### 三、启动桌面 Agent

#### 方式一：直接双击 .app（推荐）

`dist/` 目录已包含打包好的 macOS 应用：

```
dist/
├── LocalAI Agent (Apple Silicon).app   # M1/M2/M3 芯片
└── LocalAI Agent (Intel).app           # Intel 芯片
```

**第一步：编辑配置文件**

首次运行会自动创建 `~/.local-ai-agent/.env`，也可以直接新建：

```bash
mkdir -p ~/.local-ai-agent
cat > ~/.local-ai-agent/.env << EOF
RELAY_URL=wss://haoyuyun.top/ai-relay
AGENT_TOKEN=<登录接口返回的 token>
MASTER_PASSWORD=<自定义主密码，用于 E2EE 加密>
USER_SALT=<登录接口返回的 salt>
QWEN_API_KEY=<可选，填写后支持自然语言指令>
EOF
```

**第二步：双击对应架构的 .app 启动**

- 日志位置：`~/Library/Logs/LocalAI-Agent.log`
- 退出方式：Dock 图标右键 → 退出

#### 方式二：命令行（开发者）

```bash
cd packages/desktop-agent
npm install
npm start
```

**Desktop Agent 权限配置**（`~/.local-ai-agent/config.json`）：

```json
{
  "deviceId": "自动生成，不要修改",
  "deviceName": "我的Mac",
  "allowedPaths": [
    "/Users/your_name/Documents",
    "/Users/your_name/Desktop"
  ],
  "allowedDatabases": [
    { "type": "sqlite", "path": "/Users/your_name/data.db" }
  ],
  "allowedCommands": [
    "ls", "cat", "grep", "pwd"
  ]
}
```

> 安全说明：所有路径、数据库、命令均需明确加入白名单，未授权操作会被拒绝。

**重新打包 .app（仅开发者需要）：**

```bash
cd packages/desktop-agent
npm install
npm run build         # 重新生成 x64 + arm64 双架构到 dist/
```

---

### 四、配置小程序

```bash
cd packages/miniprogram

# 配置中转服务器地址
echo "VITE_RELAY_HTTP=https://haoyuyun.top/ai-relay" > .env

# 安装依赖
npm install

# 本地开发（微信开发者工具导入 dist/dev/mp-weixin）
npm run dev:mp-weixin

# 构建生产包（微信开发者工具导入 dist/build/mp-weixin）
npm run build:mp-weixin
```

小程序 AppID：`wx6b791097e213568e`

---

## CI/CD

| Workflow | 触发方式 | 说明 |
|----------|---------|------|
| `deploy.yml` | 手动触发 | rsync 同步代码 + docker compose up --build |
| `miniprogram.yml` | 手动触发 | 构建小程序并上传至微信后台 |

所需 GitHub Secrets：

| Secret | 说明 |
|--------|------|
| `SERVER_HOST` | 服务器 IP |
| `SERVER_USER` | SSH 用户名 |
| `SERVER_SSH_KEY` | SSH 私钥 |
| `WECHAT_APPID` | 小程序 AppID |
| `WECHAT_PRIVATE_KEY` | 小程序代码上传私钥 |

---

## API 接口

| 方法 | 路径 | 说明 | 需要认证 |
|------|------|------|---------|
| GET | `/health` | 健康检查 | 否 |
| POST | `/api/v1/auth/register` | 注册账号 | 否 |
| POST | `/api/v1/auth/login` | 登录获取 token | 否 |
| GET | `/api/v1/devices` | 获取设备列表 | 是 |
| POST | `/api/v1/devices/register` | 注册设备（Agent 调用） | 是 |
| DELETE | `/api/v1/devices/:deviceId` | 删除设备 | 是 |
| POST | `/api/v1/command` | 向设备发送指令 | 是 |

---

## 使用流程

1. 手机打开小程序，注册/登录账号
2. 在 Mac 上启动 Desktop Agent，填入 token
3. 小程序「设备」页面可看到在线的 Mac
4. 在「对话」页面用自然语言发送指令，如：
   - `读取桌面上的 todo.txt`
   - `查询数据库里最近10条订单`
   - `列出 Downloads 目录的文件`
5. Desktop Agent 在本地执行并将加密结果返回手机
