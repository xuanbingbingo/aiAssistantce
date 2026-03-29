'use strict';

const OpenAI = require('openai');

let client;
function getClient() {
  if (!client) {
    const apiKey = process.env.QWEN_API_KEY;
    if (!apiKey) throw new Error('未设置 QWEN_API_KEY 环境变量');
    client = new OpenAI({
      apiKey,
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });
  }
  return client;
}

// OpenAI/Qwen function calling 格式
const TOOL_SCHEMAS = [
  {
    type: 'function',
    function: {
      name: 'fs_list',
      description: '列出指定目录下的文件和子目录',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '目录的绝对路径，例如 /Users/libin/Desktop' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fs_read',
      description: '读取文件的文本内容',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件的绝对路径' },
          encoding: { type: 'string', description: '文件编码，默认 utf-8' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fs_write',
      description: '将文本内容写入文件',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件的绝对路径' },
          content: { type: 'string', description: '要写入的文本内容' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'db_query',
      description: '查询本地 SQLite 或 MySQL 数据库，仅允许 SELECT。必须从系统提示中的可用数据库列表里选择 dbName',
      parameters: {
        type: 'object',
        properties: {
          dbName: { type: 'string', description: '数据库别名，必须从系统提示中"可用数据库"列表里选择' },
          sql: { type: 'string', description: 'SELECT SQL 语句' },
        },
        required: ['dbName', 'sql'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'export_pdf',
      description: '将文本内容导出为 PDF 文件并保存到本地',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: '要导出的文本内容' },
          filename: { type: 'string', description: '输出文件名（含 .pdf 后缀）' },
          outputDir: { type: 'string', description: '输出目录路径，默认为 Downloads' },
        },
        required: ['content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fs_delete',
      description: '删除指定路径的单个文件（不能删除目录）',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '要删除的文件绝对路径' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'exec_shell',
      description: '执行白名单内的 shell 命令',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: '完整的命令字符串，如 git status' },
        },
        required: ['command'],
      },
    },
  },
];

const HISTORY_MAX = 20; // 最多保留20条消息（约10轮对话）

/**
 * 用 Qwen 将自然语言解析为 MCP tool call，执行后再格式化为自然语言摘要
 * @param {string} userText
 * @param {object} config
 * @param {Function} executeTool
 * @param {Array} history - 对话历史（会被修改追加本轮内容）
 */
async function route(userText, config, executeTool, history = []) {
  const qwen = getClient();
  const model = process.env.AI_MODEL || 'qwen-plus';
  const systemPrompt = buildSystemPrompt(config);

  // Step 1: Qwen 解析意图 → tool call（携带历史上下文）
  const parseResp = await qwen.chat.completions.create({
    model,
    tools: TOOL_SCHEMAS,
    tool_choice: 'auto',
    messages: [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: userText },
    ],
  });

  const assistantMsg = parseResp.choices[0].message;
  const toolCall = assistantMsg.tool_calls?.[0];

  // 如果 Qwen 认为不需要调用工具，直接返回文本回复
  if (!toolCall) {
    const summary = assistantMsg.content || '抱歉，我无法理解这个指令。';
    _appendHistory(history, userText, summary);
    return {
      tool: null,
      args: null,
      rawResult: null,
      summary,
    };
  }

  const tool = toolCall.function.name;
  const args = JSON.parse(toolCall.function.arguments);
  const toolCallId = toolCall.id;
  console.log(`[AI Router] 解析意图: ${tool}`, args);

  // Step 2: 执行 MCP tool
  const rawResult = await executeTool(tool, args, config);

  // Step 3: Qwen 将结果格式化为自然语言摘要
  const summary = await summarizeResult(qwen, model, userText, systemPrompt, history, assistantMsg, tool, toolCallId, rawResult);

  // Step 4: 将本轮对话追加到历史
  _appendHistory(history, userText, summary);

  return { tool, args, rawResult, summary };
}

function _appendHistory(history, userText, assistantReply) {
  history.push({ role: 'user', content: userText });
  history.push({ role: 'assistant', content: assistantReply });
  // 超出上限时从头裁剪（保持成对）
  while (history.length > HISTORY_MAX) {
    history.splice(0, 2);
  }
}

async function summarizeResult(qwen, model, userText, systemPrompt, history, assistantMsg, tool, toolCallId, rawResult) {
  const toolResultContent = rawResult.success
    ? JSON.stringify(rawResult.data, null, 2)
    : `执行失败：${rawResult.error}`;

  try {
    const summaryResp = await qwen.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: '你是一个本地 AI 助手。请用简洁友好的中文，把工具执行结果总结给用户。如果是文件列表，显示前10个并说明总数；如果是查询结果，给出数据摘要；如果是错误，解释原因并给出建议。' },
        ...history,
        { role: 'user', content: userText },
        { role: 'assistant', content: assistantMsg.content || '', tool_calls: assistantMsg.tool_calls },
        { role: 'tool', tool_call_id: toolCallId, content: toolResultContent },
      ],
    });
    return summaryResp.choices[0].message.content || toolResultContent;
  } catch (err) {
    console.warn('[AI Router] 结果格式化失败，返回原始数据:', err.message);
    return toolResultContent;
  }
}

function buildSystemPrompt(config) {
  const paths = config.allowedPaths && config.allowedPaths.length > 0
    ? config.allowedPaths.join('、')
    : '（未配置，文件操作将被拒绝）';
  const dbs = config.allowedDatabases && config.allowedDatabases.length > 0
    ? config.allowedDatabases.map(d => `${d.name || d.path || d.dsn}(${d.type})`).join('、')
    : '（未配置）';

  return `你是用户电脑上的本地 AI 助手，帮助用户通过自然语言操作本地文件和数据库。

当前设备允许访问的路径：${paths}
当前设备允许查询的数据库：${dbs}

规则：
1. 根据用户意图选择合适的工具调用
2. 文件路径必须使用上面允许的路径前缀，不要猜测路径
3. 如果用户意图不明确，优先询问而不是猜测
4. 只执行用户明确要求的操作`;
}

// 供外部查看已注册的工具列表
const TOOL_NAMES = TOOL_SCHEMAS.map(t => t.function.name);

module.exports = { route, TOOL_SCHEMAS, TOOL_NAMES };
