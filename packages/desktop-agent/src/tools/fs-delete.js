'use strict';

const fs = require('fs');
const path = require('path');

/**
 * 删除文件（不支持删除目录，防止误删）
 * @param {{ path: string }} args
 * @param {{ allowedPaths: string[] }} config
 */
async function fsDelete(args, config) {
  const targetPath = path.resolve(args.path);

  checkAllowedPath(targetPath, config.allowedPaths);

  if (!fs.existsSync(targetPath)) {
    throw new Error(`文件不存在: ${targetPath}`);
  }

  const stat = fs.statSync(targetPath);
  if (stat.isDirectory()) {
    throw new Error(`不允许删除目录，只能删除单个文件: ${targetPath}`);
  }

  fs.unlinkSync(targetPath);

  return {
    path: targetPath,
    message: `文件已删除: ${path.basename(targetPath)}`,
  };
}

function checkAllowedPath(targetPath, allowedPaths) {
  if (!allowedPaths || allowedPaths.length === 0) {
    throw new Error('未配置允许访问的路径');
  }
  const allowed = allowedPaths.some((p) => targetPath.startsWith(path.resolve(p)));
  if (!allowed) {
    throw new Error(`路径不在白名单内，拒绝删除: ${targetPath}`);
  }
}

module.exports = fsDelete;
