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
const os = require('os');
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
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
  <key>NSHighResolutionCapable</key>
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

/**
 * 用 Python + sips + iconutil 生成 AppIcon.icns
 * 图标：深色背景 + 白色机器人 emoji
 */
function generateIcon(resourcesDir) {
  const iconsetDir = path.join(os.tmpdir(), 'AppIcon.iconset');
  if (fs.existsSync(iconsetDir)) fs.rmSync(iconsetDir, { recursive: true });
  fs.mkdirSync(iconsetDir);

  // 用 Python 生成一张 1024x1024 的 PNG（不依赖第三方库）
  const pyScript = `
import struct, zlib, math

def png(w, h, pixels):
    def chunk(t, d):
        c = struct.pack('>I', len(d)) + t + d
        return c + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    rows = b''.join(b'\\x00' + bytes(pixels[y*w*4:(y+1)*w*4]) for y in range(h))
    return b'\\x89PNG\\r\\n\\x1a\\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(rows)) + chunk(b'IEND', b'')

size = 1024
pixels = []
for y in range(size):
    for x in range(size):
        # 背景：深蓝渐变
        r = int(30 + (x / size) * 40)
        g = int(50 + (y / size) * 30)
        b = int(140 + (x / size) * 60)
        # 圆形背景
        cx, cy = size // 2, size // 2
        dist = math.sqrt((x - cx)**2 + (y - cy)**2)
        if dist > size * 0.47:
            r, g, b = 240, 242, 247  # 外围浅灰
        pixels += [r, g, b]

# 写入白色 "AI" 文字区域（简单方块像素字体）
def draw_rect(px, x0, y0, x1, y1, color):
    for y in range(y0, y1):
        for x in range(x0, x1):
            if 0 <= x < size and 0 <= y < size:
                idx = (y * size + x) * 3
                px[idx:idx+3] = list(color)

# 字母 A
cx = size // 2 - 160
cy = size // 2 - 80
stroke = 60
draw_rect(pixels, cx, cy, cx + stroke, cy + 480, (255,255,255))
draw_rect(pixels, cx + 280, cy, cx + 280 + stroke, cy + 480, (255,255,255))
draw_rect(pixels, cx, cy, cx + 340, cy + stroke, (255,255,255))
draw_rect(pixels, cx, cy + 200, cx + 340, cy + 200 + stroke, (255,255,255))

# 字母 I
cx2 = size // 2 + 80
draw_rect(pixels, cx2, cy, cx2 + stroke, cy + 480, (255,255,255))
draw_rect(pixels, cx2 - 60, cy, cx2 + stroke + 60, cy + stroke, (255,255,255))
draw_rect(pixels, cx2 - 60, cy + 420, cx2 + stroke + 60, cy + 480, (255,255,255))

with open('/tmp/ai_icon_1024.png', 'wb') as f:
    # 转为 RGBA
    rgba = []
    for i in range(0, len(pixels), 3):
        rgba += pixels[i:i+3] + [255]
    f.write(png(size, size, rgba))
print('done')
`;

  execSync(`python3 -c "${pyScript.replace(/"/g, '\\"').replace(/\n/g, '\n')}"`);

  // 用 sips 生成各尺寸
  const sizes = [16, 32, 64, 128, 256, 512, 1024];
  for (const s of sizes) {
    execSync(`sips -z ${s} ${s} /tmp/ai_icon_1024.png --out "${iconsetDir}/icon_${s}x${s}.png" 2>/dev/null`);
    if (s <= 512) {
      execSync(`sips -z ${s*2} ${s*2} /tmp/ai_icon_1024.png --out "${iconsetDir}/icon_${s}x${s}@2x.png" 2>/dev/null`);
    }
  }

  const icnsPath = path.join(resourcesDir, 'AppIcon.icns');
  execSync(`iconutil -c icns "${iconsetDir}" -o "${icnsPath}"`);
  fs.rmSync(iconsetDir, { recursive: true });
  console.log('  🎨 图标已生成');
}

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

  // 生成图标
  generateIcon(resourcesDir);

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
console.log('   Dock 图标右键 → 退出 即可关闭');
console.log('   日志位置：~/Library/Logs/LocalAI-Agent.log');
