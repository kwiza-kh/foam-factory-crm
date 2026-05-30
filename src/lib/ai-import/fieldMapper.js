/**
 * Build a one-shot example for the AI showing expected input→output mapping.
 * Uses the actual target columns to construct a realistic example.
 */
function buildExample(tableLabel, columns) {
  const fields = columns.filter(c => c.field !== '__actions');
  const exampleInput = {};
  const exampleOutput = {};
  for (const col of fields) {
    const sample = col.type === 'number' ? '100' : col.type === 'date' ? '2025-01-15' : `示例${col.headerName}`;
    exampleInput[`${col.headerName}列`] = col.required ? sample : '';
    exampleOutput[col.field] = col.required ? sample : '';
  }
  return `示例输入：${JSON.stringify(exampleInput)}\n示例输出：${JSON.stringify(exampleOutput)}`;
}

function trimRows(rows) {
  return rows.map(row => {
    const cleaned = {};
    for (const [k, v] of Object.entries(row)) {
      cleaned[k.trim()] = typeof v === 'string' ? v.trim() : v;
    }
    return cleaned;
  });
}

/**
 * buildImportMessages — 构建导入用的 AI 消息列表
 * @param {string} tableLabel  — 中文表名，如 "产品"
 * @param {Array}  columns     — defaultColumns + customColumns 合并后的数组
 * @param {Object} parsed      — fileParser 返回的中间格式
 * @returns {Array}            — Anthropic 格式的 messages 数组
 */
export function buildImportMessages(tableLabel, columns, parsed) {
  const fields = columns.filter(col => col.field !== '__actions');
  const fieldDesc = fields
    .map(col => {
      let desc = `- ${col.field}（${col.headerName}`;
      if (col.required) desc += '，必填';
      if (col.type === 'number') desc += '，数字类型';
      if (col.type === 'date') desc += '，日期格式 YYYY-MM-DD';
      desc += '）';
      return desc;
    })
    .join('\n');

  const instruction = `你是一个数据提取助手。从以下内容提取${tableLabel}信息，返回符合格式的纯 JSON 数组。

目标字段：
${fieldDesc}

规则：
1. 根据列名语义自动匹配，不要依赖列的顺序
2. 数字字段去掉逗号、百分号、单位符号，只保留纯数字（如 "1,234 元" → "1234"）
3. 日期统一转为 YYYY-MM-DD 格式（如 "2025年1月5日" → "2025-01-05"）
4. 无法匹配的字段留空字符串 ""，严禁编造数据
5. 跳过完全空白的行

${buildExample(tableLabel, columns)}

只返回 JSON 数组，不要包含任何其他文字、注释或 markdown 代码块。`;

  if (parsed.type === 'image') {
    return [{
      role: 'user',
      content: [
        { type: 'text', text: instruction + '\n\n请识别图片中的表格数据。' },
        { type: 'image', source: { type: 'base64', media_type: parsed.mimeType, data: parsed.base64 } },
      ],
    }];
  }

  const dataSection = parsed.type === 'rows'
    ? `原始数据（JSON）：\n${JSON.stringify(trimRows(parsed.rows), null, 2)}`
    : `原始文本：\n${parsed.text}`;

  return [{ role: 'user', content: `${instruction}\n\n${dataSection}` }];
}

/**
 * parseImportResponse — 解析 AI 返回的 JSON 数组
 */
export function parseImportResponse(text) {
  const cleaned = text.replace(/^```(?:json)?\n?/m, '').replace(/```\s*$/m, '').trim();
  let data;
  try {
    data = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`AI 返回格式无效（${e.message}）\n\n原始内容：${text.slice(0, 300)}`);
  }
  if (!Array.isArray(data)) throw new Error('AI 返回的不是数组，请重试');
  return data;
}

/**
 * buildChatMessages — 构建 AI 对话消息（携带客户全量数据）
 */
export function buildChatMessages(customer, userInstruction) {
  const context = JSON.stringify({
    customer: {
      name: customer.name,
      contact: customer.contact,
      level: customer.level,
      paymentTerm: customer.paymentTerm,
    },
    products:   customer.products   || [],
    orders:     customer.orders     || [],
    deliveries: customer.deliveries || [],
  }, null, 2);

  const system = `你是泡沫厂 CRM 的数据助手，负责管理客户数据。当前客户数据如下：

${context}

你可以回答数据相关问题，也可以根据用户指令修改 products 和 orders 表（deliveries 只读）。

如需修改数据，返回以下 JSON 格式（只返回 JSON，不要其他文字）：
{
  "reply": "操作说明",
  "changes": [
    { "table": "orders",   "action": "update", "id": "o-1", "patch": { "status": "生产中" } },
    { "table": "products", "action": "add",    "row": { "name": "新品", "spec": "", "material": "EPS", "unit": "件", "unitPrice": 0, "moq": 0, "remark": "" } },
    { "table": "orders",   "action": "delete", "id": "o-2" }
  ]
}

如仅回答问题，返回：{ "reply": "你的回答", "changes": [] }`;

  return [{ role: 'user', content: `${system}\n\n用户指令：${userInstruction}` }];
}

/**
 * parseChatResponse — 解析对话响应（失败时退化为纯文字回复）
 */
export function parseChatResponse(text) {
  const cleaned = text.replace(/^```(?:json)?\n?/m, '').replace(/```\s*$/m, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return { reply: text, changes: [] };
  }
}
