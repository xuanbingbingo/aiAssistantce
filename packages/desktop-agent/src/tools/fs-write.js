'use strict';

const fs = require('fs');
const path = require('path');

/**
 * 写入文件内容
 * @param {{ path: string, content: string }} args
 * @param {{ allowedPaths: string[] }} config
 */
async function fsWrite(args, config) {
  const targetPath = path.resolve(args.path);

  checkAllowedPath(targetPath, config.allowedPaths);

  if (args.content === undefined || args.content === null) {
    throw new Error('content 不能为空');
  }

  // 确保父目录存在
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(targetPath, args.content, 'utf-8');

  return {
    path: targetPath,
    size: Buffer.byteLength(args.content, 'utf-8'),
    message: '文件写入成功',
  };
}

function checkAllowedPath(targetPath, allowedPaths) {
  if (!allowedPaths || allowedPaths.length === 0) {
    throw new Error('未配置允许访问的路径');
  }
  const allowed = allowedPaths.some((p) => targetPath.startsWith(path.resolve(p)));
  if (!allowed) {
    throw new Error(`路径不在写入白名单内: ${targetPath}`);
  }
}

module.exports = fsWrite;
