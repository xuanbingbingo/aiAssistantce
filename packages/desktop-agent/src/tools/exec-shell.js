'use strict';

const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

/**
 * 执行白名单内的 shell 命令
 * @param {{ command: string }} args
 * @param {{ allowedCommands: string[] }} config
 */
async function execShell(args, config) {
  const { command } = args;

  if (!command) {
    throw new Error('command 不能为空');
  }

  // 白名单校验：命令必须以某个白名单前缀开头
  if (!config.allowedCommands || config.allowedCommands.length === 0) {
    throw new Error('未配置允许执行的命令，请在 allowedCommands 中添加');
  }

  const allowed = config.allowedCommands.some((pattern) => {
    // 支持精确匹配或前缀匹配（如 "git" 允许所有 git 子命令）
    return command === pattern || command.startsWith(pattern + ' ');
  });

  if (!allowed) {
    throw new Error(`命令不在执行白名单内: ${command}`);
  }

  // 将命令分割为 executable + args（防止 shell 注入）
  const parts = command.split(/\s+/);
  const executable = parts[0];
  const cmdArgs = parts.slice(1);

  const { stdout, stderr } = await execFileAsync(executable, cmdArgs, {
    timeout: 30000,
    maxBuffer: 1024 * 1024, // 1MB
  });

  return {
    command,
    stdout: stdout.trim(),
    stderr: stderr.trim(),
    exitCode: 0,
  };
}

module.exports = execShell;
