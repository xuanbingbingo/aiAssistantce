'use strict';

const path = require('path');

/**
 * 执行数据库查询（仅允许 SELECT）
 * @param {{ dbName: string, sql: string, params?: any[] }} args
 * @param {{ allowedDatabases: Array<{type: string, name?: string, path?: string, dsn?: string}> }} config
 */
async function dbQuery(args, config) {
  const { dbName, sql, params = [] } = args;

  // 安全检查：只允许 SELECT
  const trimmed = sql.trim().toUpperCase();
  if (!trimmed.startsWith('SELECT')) {
    throw new Error('仅允许 SELECT 查询，禁止 INSERT/UPDATE/DELETE/DROP 等操作');
  }

  // 通过别名找到实际数据库配置
  const dbConfig = resolveDatabase(dbName, config.allowedDatabases);

  if (dbConfig.type === 'sqlite') {
    return await querySqlite(dbConfig.path, sql, params);
  } else if (dbConfig.type === 'mysql') {
    return await queryMysql(dbConfig.dsn, sql, params);
  } else {
    throw new Error(`不支持的数据库类型: ${dbConfig.type}，支持 sqlite 和 mysql`);
  }
}

async function querySqlite(dbPath, sql, params) {
  const fs = require('fs');
  let initSqlJs;
  try {
    initSqlJs = require('sql.js');
  } catch {
    throw new Error('SQLite 支持未安装，请运行: npm install sql.js');
  }

  // pkg 打包时 wasm 文件嵌入为 asset，需通过 __dirname 定位
  const wasmPath = require('path').join(__dirname, '..', '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
  const SQL = await initSqlJs({ locateFile: () => wasmPath });
  const fileBuffer = fs.readFileSync(path.resolve(dbPath));
  const db = new SQL.Database(fileBuffer);
  try {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    const columns = stmt.getColumnNames();
    while (stmt.step()) {
      const vals = stmt.get();
      const row = {};
      columns.forEach((col, i) => { row[col] = vals[i]; });
      rows.push(row);
    }
    stmt.free();
    return { rows, rowCount: rows.length };
  } finally {
    db.close();
  }
}

async function queryMysql(dsn, sql, params) {
  let mysql;
  try {
    mysql = require('mysql2/promise');
  } catch {
    throw new Error('MySQL 支持未安装，请运行: npm install mysql2');
  }

  // DSN 格式: mysql://user:pass@host:port/dbname
  const conn = await mysql.createConnection(dsn);
  try {
    const [rows] = await conn.execute(sql, params);
    return { rows, rowCount: rows.length };
  } finally {
    await conn.end();
  }
}

function resolveDatabase(dbName, allowedDatabases) {
  if (!allowedDatabases || allowedDatabases.length === 0) {
    throw new Error('未配置允许访问的数据库，请在 allowedDatabases 中添加配置');
  }

  if (!dbName) {
    // 未指定别名时，若只有一个数据库则自动选择
    if (allowedDatabases.length === 1) return allowedDatabases[0];
    const names = allowedDatabases.map(d => d.name || d.path || d.dsn).join('、');
    throw new Error(`请指定要查询的数据库，可用：${names}`);
  }

  const dbConfig = allowedDatabases.find(
    d => d.name === dbName || d.path === dbName || d.dsn === dbName
  );

  if (!dbConfig) {
    const names = allowedDatabases.map(d => d.name || d.path || d.dsn).join('、');
    throw new Error(`未找到数据库"${dbName}"，可用数据库：${names}`);
  }

  return dbConfig;
}

module.exports = dbQuery;
