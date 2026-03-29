#!/usr/bin/env node
'use strict';

/**
 * 将打包好的二进制文件包装成标准 macOS .app bundle
 * 生成：
 *   dist/LocalAI Agent (Intel).app
 *   dist/LocalAI Agent (Apple Silicon).app
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DIST = path.join(__dirname, '..', 'dist');
const APP_NAME_X64 = 'LocalAI Agent (Intel)';
const APP_NAME_ARM64 = 'LocalAI Agent (Apple Silicon)';

const INFO_PLIST = (appName) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>${appName}</string>
  <key>CFBundleDisplayName</key>
  <string>${appName}</string>
  <key>CFBundleIdentifier</key>
  <string>com.localai.agent</string>
  <key>CFBundleVersion</key>
  <string>1.0.0</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleExecutable</key>
  <string>start</string>
  <key>LSUIElement</key>
  <true/>
</dict>
</plist>
`;

// 启动脚本：从 ~/.local-ai-agent/.env 读取环境变量，再运行二进制
const START_SCRIPT = (binaryName) => `#!/bin/bash
# 读取用户配置的环境变量
ENV_FILE="$HOME/.local-ai-agent/.env"
if [ -f "$ENV_FILE" ]; then
  export $(grep -v '^#' "$ENV_FILE" | xargs)
fi

# 运行 Agent 二进制，日志写到 ~/Library/Logs/LocalAI-Agent.log
BINARY="$(dirname "$0")/../Resources/${binaryName}"
exec "$BINARY" >> "$HOME/Library/Logs/LocalAI-Agent.log" 2>&1
`;

function makeApp(binaryName, appName) {
  const appDir = path.join(DIST, `${appName}.app`);
  const contentsDir = path.join(appDir, 'Contents');
  const macosDir = path.join(contentsDir, 'MacOS');
  const resourcesDir = path.join(contentsDir, 'Resources');

  // 清理旧的
  if (fs.existsSync(appDir)) fs.rmSync(appDir, { recursive: true });

  fs.mkdirSync(macosDir, { recursive: true });
  fs.mkdirSync(resourcesDir, { recursive: true });

  // Info.plist
  fs.writeFileSync(path.join(contentsDir, 'Info.plist'), INFO_PLIST(appName));

  // 复制二进制到 Resources
  const srcBinary = path.join(DIST, binaryName);
  const dstBinary = path.join(resourcesDir, binaryName);
  fs.copyFileSync(srcBinary, dstBinary);
  fs.chmodSync(dstBinary, 0o755);

  // 启动脚本
  const startScript = path.join(macosDir, 'start');
  fs.writeFileSync(startScript, START_SCRIPT(binaryName));
  fs.chmodSync(startScript, 0o755);

  console.log(`✅ 生成：dist/${appName}.app`);
}

// 生成 .env 模板（如果不存在）
const envDir = path.join(process.env.HOME, '.local-ai-agent');
const envFile = path.join(envDir, '.env');
if (!fs.existsSync(envFile)) {
  fs.mkdirSync(envDir, { recursive: true });
  fs.writeFileSync(envFile, `# LocalAI Agent 环境变量配置
# 每次登录后更新 AGENT_TOKEN

RELAY_URL=ws://localhost:3000
AGENT_TOKEN=
MASTER_PASSWORD=
USER_SALT=
QWEN_API_KEY=
AI_MODEL=qwen-plus
`);
  console.log(`📝 已创建配置模板：${envFile}`);
}

makeApp('ai-agent-macos-x64', APP_NAME_X64);
makeApp('ai-agent-macos-arm64', APP_NAME_ARM64);

console.log('\n📦 打包完成！');
console.log('   编辑配置文件后双击 .app 启动：');
console.log(`   ${envFile}`);
console.log('   日志位置：~/Library/Logs/LocalAI-Agent.log');
