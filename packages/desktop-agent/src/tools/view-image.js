'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const MIME_MAP = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.heic': 'image/jpeg', // sips 会将 heic 转为 jpeg
};

const MAX_ORIGINAL_BYTES = 50 * 1024 * 1024; // 原始文件上限 50MB
const RESIZE_WIDTH = 1200; // 压缩后最大宽度（px）

/**
 * 读取图片文件，自动压缩后返回 base64 data URL
 * @param {{ path: string }} args
 * @param {{ allowedPaths: string[] }} config
 */
async function viewImage(args, config) {
  const targetPath = path.resolve(args.path);

  checkAllowedPath(targetPath, config.allowedPaths);

  if (!fs.existsSync(targetPath)) {
    throw new Error(`文件不存在: ${targetPath}`);
  }

  const stat = fs.statSync(targetPath);
  if (stat.isDirectory()) {
    throw new Error(`路径是目录，不是文件: ${targetPath}`);
  }

  const ext = path.extname(targetPath).toLowerCase();
  const mime = MIME_MAP[ext];
  if (!mime) {
    throw new Error(`不支持的图片格式: ${ext}，支持 ${Object.keys(MIME_MAP).join(', ')}`);
  }

  if (stat.size > MAX_ORIGINAL_BYTES) {
    throw new Error(`图片文件过大（${(stat.size / 1024 / 1024).toFixed(1)} MB），最大支持 50 MB`);
  }

  // 用 sips（macOS 内置）压缩图片到指定宽度，输出为 jpeg
  const tmpFile = path.join(os.tmpdir(), `ai_agent_img_${Date.now()}.jpg`);
  try {
    execSync(
      `sips -s format jpeg -Z ${RESIZE_WIDTH} "${targetPath}" --out "${tmpFile}"`,
      { stdio: 'pipe' }
    );
  } catch (e) {
    throw new Error(`图片压缩失败: ${e.message}`);
  }

  let buffer;
  try {
    buffer = fs.readFileSync(tmpFile);
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }

  const base64 = buffer.toString('base64');
  const dataUrl = `data:image/jpeg;base64,${base64}`;

  return {
    dataUrl,
    filename: path.basename(targetPath),
    size: buffer.length,
    mime: 'image/jpeg',
  };
}

function checkAllowedPath(targetPath, allowedPaths) {
  if (!allowedPaths || allowedPaths.length === 0) {
    throw new Error('未配置允许访问的路径');
  }
  const allowed = allowedPaths.some((p) => targetPath.startsWith(path.resolve(p)));
  if (!allowed) {
    throw new Error(`路径不在白名单内: ${targetPath}`);
  }
}

module.exports = viewImage;
