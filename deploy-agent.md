# ai-assistant-deploy-agent

将 aiAssistantce（AI 助手中继服务）部署到已初始化的云服务器。
依赖 `infra-bootstrap-agent` 已完成服务器初始化（gateway-net + nginx-gateway 已就绪）。

---

## 应用信息

| 变量 | 值 |
|---|---|
| `APP_NAME` | `ai-assistant` |
| `APP_PATH` | `ai-relay` |
| `APP_DIR` | `/opt/apps/ai-assistant` |
| `LOCAL_SRC` | `/Users/libin/aiProjects/aiAssistantce` |
| `APP_CONTAINER` | `ai-assistant-relay`（Koa，内部 3000） |
| `DB_CONTAINER` | `ai-assistant-mysql`（MySQL 8.0） |
| `DB_DEBUG_PORT` | `13310`（宿主机 MySQL 调试端口） |
| 访问地址 | `http://{DOMAIN}/ai-relay/` |

---

## 待填写的服务器信息

| 变量 | 说明 |
|---|---|
| `SERVER_IP` | 云服务器公网 IP |
| `SSH_USER` | `root` |
| `SSH_KEY` | `~/.ssh/id_rsa` |
| `DOMAIN` | 共享域名或服务器 IP |
| `ENABLE_HTTPS` | `true/false` |

---

## 执行流程

### Phase 1：部署前检查

```bash
ssh -i $SSH_KEY $SSH_USER@$SERVER_IP "echo connected"
ssh -i $SSH_KEY $SSH_USER@$SERVER_IP \
  "docker network inspect gateway-net > /dev/null 2>&1 || echo 'MISSING: run infra-bootstrap-agent first'"
ssh -i $SSH_KEY $SSH_USER@$SERVER_IP \
  "[ -d /opt/apps/ai-assistant ] && echo 'UPDATE' || echo 'FIRST_DEPLOY'"
```

### Phase 2：docker-compose.yml 检查（已就绪）

```bash
grep "gateway-net" /Users/libin/aiProjects/aiAssistantce/docker-compose.yml && echo "GATEWAY_OK"
grep "13310" /Users/libin/aiProjects/aiAssistantce/docker-compose.yml && echo "PORT_OK"
```

### Phase 3：传输代码

```bash
ssh -i $SSH_KEY $SSH_USER@$SERVER_IP "mkdir -p /opt/apps/ai-assistant"

rsync -avz --progress \
  --exclude='node_modules' --exclude='**/node_modules' \
  --exclude='.git' --exclude='*.log' --exclude='.env*' \
  --exclude='packages/desktop-agent/dist' \
  -e "ssh -i $SSH_KEY" \
  /Users/libin/aiProjects/aiAssistantce/ \
  $SSH_USER@$SERVER_IP:/opt/apps/ai-assistant/

ssh -i $SSH_KEY $SSH_USER@$SERVER_IP \
  "ls /opt/apps/ai-assistant/docker-compose.yml /opt/apps/ai-assistant/packages/relay-server/src/init.sql"
```

### Phase 4：生产环境配置

```bash
ssh -i $SSH_KEY $SSH_USER@$SERVER_IP \
  "[ -f /opt/apps/ai-assistant/.env ] && echo 'ENV_EXISTS' || echo 'NEED_CREATE'"

# ENV_EXISTS=false 时执行
ssh -i $SSH_KEY $SSH_USER@$SERVER_IP "
DB_PASS=\$(openssl rand -base64 20 | tr -d '=+/' | head -c 20)
ROOT_PASS=\$(openssl rand -base64 20 | tr -d '=+/' | head -c 20)
JWT=\$(openssl rand -base64 40 | tr -d '=+/' | head -c 40)
cat > /opt/apps/ai-assistant/.env << EOF
NODE_ENV=production
DB_HOST=mysql
DB_PORT=3306
DB_USER=root
DB_PASS=\${DB_PASS}
DB_NAME=ai_assistant
MYSQL_ROOT_PASSWORD=\${ROOT_PASS}
JWT_SECRET=\${JWT}
JWT_EXPIRES_IN=7d
EOF
echo '.env created'
"
```

### Phase 5：构建 & 启动

```bash
ssh -i $SSH_KEY $SSH_USER@$SERVER_IP \
  "cd /opt/apps/ai-assistant && docker compose build --no-cache 2>&1 | tail -20"

ssh -i $SSH_KEY $SSH_USER@$SERVER_IP \
  "cd /opt/apps/ai-assistant && docker compose up -d"

# 等待 MySQL 健康
ssh -i $SSH_KEY $SSH_USER@$SERVER_IP "
for i in \$(seq 1 24); do
  STATUS=\$(docker inspect --format='{{.State.Health.Status}}' ai-assistant-mysql 2>/dev/null)
  [ \"\$STATUS\" = 'healthy' ] && echo 'MySQL ready' && break
  echo \"Waiting MySQL... (\$i/24)\"; sleep 5
done
"

ssh -i $SSH_KEY $SSH_USER@$SERVER_IP \
  "docker compose -f /opt/apps/ai-assistant/docker-compose.yml ps"
```

### Phase 6：注册到 Nginx 网关

```bash
ssh -i $SSH_KEY $SSH_USER@$SERVER_IP "cat > /opt/gateway/conf.d/locations/ai-assistant.conf << 'NGINXEOF'
# [ai-assistant] AI 助手中继服务
location /ai-relay/ {
    rewrite ^/ai-relay(/.*)?$ \$1 break;
    proxy_pass http://ai-assistant-relay:3000;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection 'upgrade';
}
NGINXEOF"

ssh -i $SSH_KEY $SSH_USER@$SERVER_IP \
  "docker exec nginx-gateway nginx -t && docker exec nginx-gateway nginx -s reload"
```

### Phase 7：验收

```bash
ssh -i $SSH_KEY $SSH_USER@$SERVER_IP \
  "curl -sf -o /dev/null -w '%{http_code}' http://localhost/ai-relay/api/health"
# 期望：200

ssh -i $SSH_KEY $SSH_USER@$SERVER_IP "docker ps | grep ai-assistant"

echo "============================="
echo "✓ ai-assistant 部署完成"
echo "  接口地址：http://$DOMAIN/ai-relay/"
echo "  MySQL 调试端口：13310"
echo "============================="
```

---

## Agent Prompt 模板

```
你是一个经验丰富的 DevOps 工程师。
将 aiAssistantce AI 助手中继服务部署到已初始化的云服务器。

## 服务器信息
- IP: {SERVER_IP}
- SSH 用户: {SSH_USER}
- SSH 密钥: {SSH_KEY}

## 应用信息
- APP_NAME: ai-assistant
- APP_PATH: ai-relay
- 本地代码路径: /Users/libin/aiProjects/aiAssistantce
- 服务器部署路径: /opt/apps/ai-assistant
- 共享域名: {DOMAIN}
- 访问地址: http://{DOMAIN}/ai-relay/
- 应用容器: ai-assistant-relay（Koa）
- 数据库容器: ai-assistant-mysql（MySQL 8.0）
- 启用 HTTPS: {true/false}

## 执行步骤
按照 deploy-agent.md Phase 1 → Phase 7 顺序执行。
遇到错误立即停止并报告，每个 Phase 完成后输出 ✓ 确认。
```
