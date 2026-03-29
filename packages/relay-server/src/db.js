'use strict';

const mysql = require('mysql2/promise');

let pool;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASS || '',
      database: process.env.DB_NAME || 'ai_assistant',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
  }
  return pool;
}

async function query(sql, params) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}

// 启动时检测数据库连接，支持重试（容器启动有时序问题）
async function waitForDb(retries = 10, interval = 3000) {
  for (let i = 1; i <= retries; i++) {
    try {
      await query('SELECT 1');
      console.log('[DB] 数据库连接成功');
      return;
    } catch (err) {
      console.log(`[DB] 等待数据库连接... (${i}/${retries}): ${err.message}`);
      if (i === retries) throw new Error('数据库连接失败，已重试 ' + retries + ' 次');
      await new Promise((r) => setTimeout(r, interval));
    }
  }
}

module.exports = { query, getPool, waitForDb };
