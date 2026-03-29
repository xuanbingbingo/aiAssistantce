'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');

const CONFIG_DIR = path.join(os.homedir(), '.local-ai-agent');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

function loadConfig() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  if (!fs.existsSync(CONFIG_FILE)) {
    const defaults = {
      deviceId: uuidv4(),
      deviceName: os.hostname(),
      // 允许访问的路径前缀（空数组 = 禁止所有文件操作）
      allowedPaths: [],
      // 允许的数据库连接（{ type: 'sqlite', path: '...' } 或 { type: 'mysql', dsn: '...' }）
      allowedDatabases: [],
      // 允许执行的 shell 命令白名单
      allowedCommands: [],
    };
    saveConfig(defaults);
    return defaults;
  }

  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
  } catch (err) {
    console.error('[Config] 配置文件解析失败，使用默认配置:', err.message);
    return { deviceId: uuidv4(), deviceName: os.hostname(), allowedPaths: [], allowedDatabases: [], allowedCommands: [] };
  }
}

function saveConfig(config) {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

function getConfigPath() {
  return CONFIG_FILE;
}

module.exports = { loadConfig, saveConfig, getConfigPath };
