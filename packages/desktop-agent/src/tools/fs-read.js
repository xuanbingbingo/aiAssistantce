'use strict';

const fs = require('fs');
const path = require('path');

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB 限制

/**
 * 读取文件内容
 * @param {{ path: string, encoding?: string }} args
 * @param {{ allowedPaths: string[] }} config
 */
async function fsRead(args, config) {
  const targetPath = path.resolve(args.path);

  checkAllowedPath(targetPath, config.allowedPaths);

  if (!fs.existsSync(targetPath)) {
    throw new Error(`文件不存在: ${targetPath}`);
  }

  const stat = fs.statSync(targetPath);
  if (stat.isDirectory()) {
    throw new Error(`路径是目录，请使用 fs_list: ${targetPath}`);
  }

  if (stat.size > MAX_FILE_SIZE) {
    throw new Error(`文件过大（${(stat.size / 1024 / 1024).toFixed(1)}MB），最大支持 10MB`);
  }

  const encoding = args.encoding || 'utf-8';
  const content = fs.readFileSync(targetPath, encoding);

  return {
    path: targetPath,
    size: stat.size,
    encoding,
    content,
    modified: stat.mtime.toISOString(),
  };
}

function checkAllowedPath(targetPath, allowedPaths) {
  if (!allowedPaths || allowedPaths.length === 0) {
    throw new Error('未配置允许访问的路径');
  }
  const allowed = allowedPaths.some((p) => targetPath.startsWith(path.resolve(p)));
  if (!allowed) {
    throw new Error(`路径不在访问白名单内: ${targetPath}`);
  }
}

module.exports = fsRead;
