'use strict';

const fs = require('fs');
const path = require('path');

/**
 * 列出目录内容
 * @param {{ path: string }} args
 * @param {{ allowedPaths: string[] }} config
 */
async function fsList(args, config) {
  const targetPath = path.resolve(args.path);

  checkAllowedPath(targetPath, config.allowedPaths);

  if (!fs.existsSync(targetPath)) {
    throw new Error(`路径不存在: ${targetPath}`);
  }

  const stat = fs.statSync(targetPath);
  if (!stat.isDirectory()) {
    throw new Error(`路径不是目录: ${targetPath}`);
  }

  const entries = fs.readdirSync(targetPath, { withFileTypes: true });
  return entries.map((entry) => ({
    name: entry.name,
    type: entry.isDirectory() ? 'directory' : 'file',
    path: path.join(targetPath, entry.name),
    size: entry.isFile() ? fs.statSync(path.join(targetPath, entry.name)).size : null,
    modified: fs.statSync(path.join(targetPath, entry.name)).mtime.toISOString(),
  }));
}

function checkAllowedPath(targetPath, allowedPaths) {
  if (!allowedPaths || allowedPaths.length === 0) {
    throw new Error('未配置允许访问的路径，请在桌面 Agent 配置文件中添加 allowedPaths');
  }
  const allowed = allowedPaths.some((p) => targetPath.startsWith(path.resolve(p)));
  if (!allowed) {
    throw new Error(`路径不在访问白名单内: ${targetPath}`);
  }
}

module.exports = fsList;
