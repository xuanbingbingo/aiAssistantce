'use strict';

const fs = require('fs');
const path = require('path');

const MIME_MAP = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.heic': 'image/heic',
};

const MAX_BYTES = 2 * 1024 * 1024; // 2MB 原始文件上限

/**
 * 读取图片文件，返回 base64 data URL
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

  if (stat.size > MAX_BYTES) {
    throw new Error(`图片文件过大（${(stat.size / 1024 / 1024).toFixed(1)} MB），最大支持 2 MB`);
  }

  const buffer = fs.readFileSync(targetPath);
  const base64 = buffer.toString('base64');
  const dataUrl = `data:${mime};base64,${base64}`;

  return {
    dataUrl,
    filename: path.basename(targetPath),
    size: stat.size,
    mime,
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
