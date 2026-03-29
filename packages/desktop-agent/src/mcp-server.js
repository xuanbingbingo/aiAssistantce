'use strict';

const fsList = require('./tools/fs-list');
const fsRead = require('./tools/fs-read');
const fsWrite = require('./tools/fs-write');
const fsDelete = require('./tools/fs-delete');
const dbQuery = require('./tools/db-query');
const exportPdf = require('./tools/export-pdf');
const execShell = require('./tools/exec-shell');

const TOOLS = {
  fs_list: fsList,
  fs_read: fsRead,
  fs_write: fsWrite,
  fs_delete: fsDelete,
  db_query: dbQuery,
  export_pdf: exportPdf,
  exec_shell: execShell,
};

/**
 * 执行一个 MCP tool call
 * @param {string} tool - 工具名
 * @param {object} args - 工具参数
 * @param {object} config - 桌面端配置（含白名单）
 * @returns {Promise<object>} { success, data } 或 { success, error }
 */
async function call(tool, args, config) {
  const handler = TOOLS[tool];
  if (!handler) {
    return { success: false, error: `未知工具: ${tool}` };
  }

  try {
    const result = await handler(args, config);
    return { success: true, data: result };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * 返回所有可用工具的元数据描述（供 AI 模型参考）
 */
function listTools() {
  return [
    {
      name: 'fs_list',
      description: '列出指定目录下的文件和子目录',
      args: { path: '目录路径（字符串）' },
    },
    {
      name: 'fs_read',
      description: '读取文件内容',
      args: { path: '文件路径（字符串）', encoding: '编码，默认 utf-8' },
    },
    {
      name: 'fs_write',
      description: '写入文件内容（需在写权限白名单内）',
      args: { path: '文件路径', content: '写入内容' },
    },
    {
      name: 'db_query',
      description: '查询本地数据库（仅允许 SELECT）',
      args: { type: 'sqlite 或 mysql', path: 'SQLite 文件路径', dsn: 'MySQL DSN', sql: 'SQL 语句' },
    },
    {
      name: 'export_pdf',
      description: '将文本内容导出为 PDF 文件',
      args: { content: '文本内容', filename: '输出文件名', outputDir: '输出目录（可选）' },
    },
    {
      name: 'exec_shell',
      description: '执行白名单内的 shell 命令',
      args: { command: '命令字符串' },
    },
  ];
}

module.exports = { call, listTools };
