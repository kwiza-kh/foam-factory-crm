# AI 文件导入 + AI 对话 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为泡沫厂 CRM 添加 AI 文件导入（PDF/Excel/CSV/图片识别自动录入产品和订单）和 AI 对话（自然语言查询和修改数据）两个功能。

**Architecture:** 纯前端方案，无需后端。文件在浏览器端解析后发送给 AI API（支持 Anthropic、OpenAI 及两种自定义兼容接口）。AI 识别结果经用户预览确认后写入 localStorage。AI 对话通过右下角悬浮面板交互，变更同样经预览确认后应用。

**Tech Stack:** React 19, Vite, ag-grid-react, papaparse (CSV), xlsx (Excel), pdfjs-dist (PDF), Anthropic Messages API, OpenAI Chat Completions API

---

## 文件总览

| 操作 | 路径 | 职责 |
|---|---|---|
| Create | `src/lib/utils.js` | makeId、today（从 App.jsx 提取） |
| Create | `src/lib/aiSettings.js` | AI 设置的读写（localStorage） |
| Create | `src/lib/ai-import/aiClient.js` | 统一 AI API 调用（Anthropic + OpenAI-compatible） |
| Create | `src/lib/ai-import/fileParser.js` | CSV/Excel/PDF/图片 → 中间格式 |
| Create | `src/lib/ai-import/fieldMapper.js` | 构建 prompt、解析 AI JSON 响应 |
| Create | `src/components/AISettingsModal.jsx` | 配置 Provider/Key/Model 的弹窗 |
| Create | `src/components/AIImportButton.jsx` | 导入按钮 + 调用编排 |
| Create | `src/components/AIImportPreviewModal.jsx` | 导入预览确认弹窗 |
| Create | `src/components/AIChatPanel.jsx` | 右下角悬浮对话面板 |
| Create | `src/components/AIChangesPreviewModal.jsx` | 对话变更差异预览弹窗 |
| Modify | `src/App.jsx` | 集成 AI 设置状态、导入按钮、对话面板 |
| Modify | `src/styles.css` | 追加 AI 功能所需 CSS |

---

## Task 1: 安装依赖

**Files:**
- Modify: `package.json` (via npm install)

- [ ] **Step 1: 安装三个解析库**

```bash
cd "C:/Users/b1783/OneDrive/桌面/新建文件夹 (4)/foam-factory-crm"
npm install papaparse xlsx pdfjs-dist
```

Expected: 三个包出现在 `node_modules/`，`package.json` dependencies 更新。

- [ ] **Step 2: 确认版本**

```bash
node -e "console.log(require('./node_modules/papaparse/package.json').version, require('./node_modules/xlsx/package.json').version, require('./node_modules/pdfjs-dist/package.json').version)"
```

Expected: 输出三个版本号（无报错即可）。

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add papaparse, xlsx, pdfjs-dist dependencies"
```

---

## Task 2: 共享工具函数

**Files:**
- Create: `src/lib/utils.js`
- Modify: `src/App.jsx:1-2` (add import)

- [ ] **Step 1: 创建 `src/lib/utils.js`**

```javascript
export const makeId = (prefix = 'row') =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export const today = () => new Date().toISOString().slice(0, 10);
```

- [ ] **Step 2: 在 App.jsx 顶部追加导入**

在 `src/App.jsx` 第 1 行 `import { useEffect, useMemo, useRef, useState } from "react";` 之后，在第一个 import 块末尾加入：

```javascript
import { makeId, today } from "./lib/utils.js";
```

然后删除 App.jsx 中原有的两行函数定义（293-296 行）：
```
// 删除：
const makeId = (prefix) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const today = () => new Date().toISOString().slice(0, 10);
```

- [ ] **Step 3: 验证编译通过**

```bash
npm run build 2>&1 | tail -5
```

Expected: `✓ built in` 无 error。

- [ ] **Step 4: Commit**

```bash
git add src/lib/utils.js src/App.jsx
git commit -m "refactor: extract makeId and today to shared utils"
```

---

## Task 3: AI 设置（存储 + 弹窗）

**Files:**
- Create: `src/lib/aiSettings.js`
- Create: `src/components/AISettingsModal.jsx`
- Modify: `src/App.jsx` (添加 AI 设置状态 + 顶栏按钮)

- [ ] **Step 1: 创建 `src/lib/aiSettings.js`**

```javascript
const KEY = 'foam-factory-crm:ai-settings';

export const PROVIDER_DEFAULTS = {
  anthropic:        { baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-4-6' },
  openai:           { baseUrl: 'https://api.openai.com',    model: 'gpt-4o' },
  'custom-openai':  { baseUrl: '',                          model: '' },
  'custom-anthropic': { baseUrl: '',                        model: '' },
};

export const DEFAULT_SETTINGS = {
  provider: 'anthropic',
  baseUrl:  'https://api.anthropic.com',
  apiKey:   '',
  model:    'claude-sonnet-4-6',
};

export function loadAISettings() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveAISettings(settings) {
  localStorage.setItem(KEY, JSON.stringify(settings));
}
```

- [ ] **Step 2: 创建 `src/components/AISettingsModal.jsx`**

```jsx
import { useState } from 'react';
import { X, Bot } from 'lucide-react';
import { saveAISettings, PROVIDER_DEFAULTS } from '../lib/aiSettings.js';

const PROVIDER_LABELS = {
  anthropic:          'Claude (Anthropic)',
  openai:             'OpenAI',
  'custom-openai':    '自定义 OpenAI-compatible',
  'custom-anthropic': '自定义 Anthropic-compatible',
};

const MODEL_PRESETS = {
  anthropic: ['claude-sonnet-4-6', 'claude-opus-4-8', 'claude-haiku-4-5-20251001'],
  openai:    ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
};

function Field({ label, required = false, children }) {
  return (
    <label className="field">
      <span>{label}{required ? <b>*</b> : null}</span>
      {children}
    </label>
  );
}

export function AISettingsModal({ settings, onClose, onSave }) {
  const [form, setForm] = useState({ ...settings });

  const handleProviderChange = (provider) => {
    const defaults = PROVIDER_DEFAULTS[provider];
    setForm(prev => ({ ...prev, provider, baseUrl: defaults.baseUrl, model: defaults.model }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    saveAISettings(form);
    onSave(form);
    onClose();
  };

  const isAnthropic = form.provider === 'anthropic' || form.provider === 'custom-anthropic';
  const presets = isAnthropic ? MODEL_PRESETS.anthropic : MODEL_PRESETS.openai;

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal-card small" onSubmit={handleSubmit}>
        <div className="modal-head">
          <div>
            <p className="eyebrow">AI SETTINGS</p>
            <h3>配置 AI 大模型</h3>
          </div>
          <button className="icon-button" type="button" onClick={onClose} title="关闭">
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Field label="服务商">
            <select value={form.provider} onChange={e => handleProviderChange(e.target.value)}>
              {Object.entries(PROVIDER_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </Field>

          <Field label="Base URL">
            <input
              value={form.baseUrl}
              onChange={e => setForm(f => ({ ...f, baseUrl: e.target.value }))}
              placeholder="https://api.anthropic.com"
            />
          </Field>

          <Field label="API Key" required>
            <input
              type="password"
              value={form.apiKey}
              onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
              placeholder="sk-ant-..."
            />
          </Field>

          <Field label="模型">
            <input
              list="ai-model-list"
              value={form.model}
              onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
              placeholder="claude-sonnet-4-6"
            />
            <datalist id="ai-model-list">
              {presets.map(m => <option key={m} value={m} />)}
            </datalist>
          </Field>
        </div>

        <div className="modal-actions">
          <button className="ghost-button" type="button" onClick={onClose}>取消</button>
          <button className="primary-action compact" type="submit">
            <Bot size={15} />
            保存
          </button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: 在 App.jsx 中集成 AI 设置**

在 App.jsx 顶部 import 区域追加：
```javascript
import { loadAISettings } from "./lib/aiSettings.js";
import { AISettingsModal } from "./components/AISettingsModal.jsx";
import { Bot } from "lucide-react"; // 已有 lucide-react，追加 Bot 到现有 import
```

在 `function App()` 的 state 区域（约第 336 行，`showColumnModal` 之后）追加：
```javascript
const [aiSettings, setAISettings] = useState(loadAISettings);
const [showAISettings, setShowAISettings] = useState(false);
```

在顶栏 `topbar-actions` div 内（约第 556 行），紧接 `<div className="topbar-actions">` 之后、现有 icon-button 之前插入：
```jsx
<button
  className="icon-button"
  type="button"
  title="AI 设置"
  onClick={() => setShowAISettings(true)}
>
  <Bot size={18} />
</button>
```

在 App return 语句末尾的 `{showColumnModal && ...}` 块之后添加：
```jsx
{showAISettings && (
  <AISettingsModal
    settings={aiSettings}
    onClose={() => setShowAISettings(false)}
    onSave={setAISettings}
  />
)}
```

- [ ] **Step 4: 验证**

```bash
npm run dev
```

打开浏览器，点击顶栏机器人图标，确认 AI 设置弹窗正常显示，可填写并保存。F12 → Application → localStorage → 确认 `foam-factory-crm:ai-settings` 键已写入。

- [ ] **Step 5: Commit**

```bash
git add src/lib/aiSettings.js src/components/AISettingsModal.jsx src/App.jsx
git commit -m "feat: add AI settings modal with provider/key/model config"
```

---

## Task 4: AI 客户端

**Files:**
- Create: `src/lib/ai-import/aiClient.js`

- [ ] **Step 1: 创建 `src/lib/ai-import/aiClient.js`**

```javascript
/**
 * messages 格式使用 Anthropic 规范：
 * [{ role: 'user', content: string | Array<{type:'text',text:string}|{type:'image',source:{type:'base64',media_type:string,data:string}}> }]
 * OpenAI-compatible 调用时自动转换。
 */

const ANTHROPIC_PROVIDERS = new Set(['anthropic', 'custom-anthropic']);

export async function callAI(settings, messages) {
  const { provider, apiKey, baseUrl, model } = settings;
  if (!apiKey) throw new Error('请先在 AI 设置中填写 API Key');
  if (!model)  throw new Error('请先在 AI 设置中填写模型名称');

  if (ANTHROPIC_PROVIDERS.has(provider)) {
    return callAnthropic(baseUrl || 'https://api.anthropic.com', apiKey, model, messages);
  }
  return callOpenAI(baseUrl || 'https://api.openai.com', apiKey, model, messages);
}

async function callAnthropic(base, apiKey, model, messages) {
  const res = await fetch(`${base}/v1/messages`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({ model, max_tokens: 4096, messages }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Anthropic API 错误 ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.content[0].text;
}

async function callOpenAI(base, apiKey, model, messages) {
  // Convert Anthropic message format → OpenAI format
  const oaiMessages = messages.map(msg => {
    if (typeof msg.content === 'string') {
      return { role: msg.role, content: msg.content };
    }
    // Array content (mixed text + image)
    const parts = msg.content.map(part => {
      if (part.type === 'text') return { type: 'text', text: part.text };
      if (part.type === 'image') {
        const { media_type, data } = part.source;
        return { type: 'image_url', image_url: { url: `data:${media_type};base64,${data}` } };
      }
      return part;
    });
    return { role: msg.role, content: parts };
  });

  const res = await fetch(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, max_tokens: 4096, messages: oaiMessages }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`OpenAI API 错误 ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.choices[0].message.content;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/ai-import/aiClient.js
git commit -m "feat: add unified AI client (Anthropic + OpenAI-compatible)"
```

---

## Task 5: 文件解析器

**Files:**
- Create: `src/lib/ai-import/fileParser.js`

- [ ] **Step 1: 创建 `src/lib/ai-import/fileParser.js`**

```javascript
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import * as pdfjs from 'pdfjs-dist';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).href;

const IMAGE_TYPES = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp']);
const MAX_PDF_PAGES = 5;
const PDF_TEXT_MIN_LENGTH = 50;

/**
 * Returns one of:
 *   { type: 'rows',  rows: Array<Object> }         — CSV / Excel
 *   { type: 'text',  text: string }                 — PDF with extractable text
 *   { type: 'image', base64: string, mimeType: string } — PDF fallback / image
 */
export async function parseFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'csv')               return parseCSV(file);
  if (ext === 'xlsx' || ext === 'xls') return parseExcel(file);
  if (ext === 'pdf')               return parsePDF(file);
  if (IMAGE_TYPES.has(ext))        return parseImage(file);
  throw new Error(`不支持的文件格式：.${ext}（支持 CSV、Excel、PDF、PNG/JPG）`);
}

async function parseCSV(file) {
  const text = await file.text();
  const result = Papa.parse(text, { header: true, skipEmptyLines: true });
  return { type: 'rows', rows: result.data };
}

async function parseExcel(file) {
  const ab = await file.arrayBuffer();
  const wb = XLSX.read(ab, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  return { type: 'rows', rows };
}

async function parsePDF(file) {
  const ab = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: ab }).promise;
  const pageCount = Math.min(pdf.numPages, MAX_PDF_PAGES);

  let fullText = '';
  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    fullText += content.items.map(item => item.str).join(' ') + '\n';
  }

  if (fullText.trim().length >= PDF_TEXT_MIN_LENGTH) {
    return { type: 'text', text: fullText.trim() };
  }

  // Fallback: render first page to canvas
  const page = await pdf.getPage(1);
  const base64 = await renderPageToBase64(page);
  return { type: 'image', base64, mimeType: 'image/jpeg' };
}

async function renderPageToBase64(page) {
  const viewport = page.getViewport({ scale: 1.5 });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  return canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
}

async function parseImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const base64 = e.target.result.split(',')[1];
      resolve({ type: 'image', base64, mimeType: file.type || 'image/jpeg' });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/ai-import/fileParser.js
git commit -m "feat: add file parser (CSV/Excel/PDF/image)"
```

---

## Task 6: 字段映射器

**Files:**
- Create: `src/lib/ai-import/fieldMapper.js`

- [ ] **Step 1: 创建 `src/lib/ai-import/fieldMapper.js`**

```javascript
/**
 * buildImportMessages — 构建导入用的 AI 消息列表
 * @param {string} tableLabel  — 中文表名，如 "产品"
 * @param {Array}  columns     — defaultColumns + customColumns 合并后的数组
 * @param {Object} parsed      — fileParser 返回的中间格式
 * @returns {Array}            — Anthropic 格式的 messages 数组
 */
export function buildImportMessages(tableLabel, columns, parsed) {
  const fieldDesc = columns
    .filter(col => col.field !== '__actions')
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
    ? `原始数据（JSON）：\n${JSON.stringify(parsed.rows, null, 2)}`
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
    { "table": "products", "action": "add",    "row": { "name": "新品", "spec": "...", "material": "EPS", "unit": "件", "unitPrice": 0, "moq": 0, "remark": "" } },
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
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/ai-import/fieldMapper.js
git commit -m "feat: add field mapper (prompt builder + response parser)"
```

---

## Task 7: AI 导入组件 + 接入 App

**Files:**
- Create: `src/components/AIImportButton.jsx`
- Create: `src/components/AIImportPreviewModal.jsx`
- Modify: `src/App.jsx`

- [ ] **Step 1: 创建 `src/components/AIImportPreviewModal.jsx`**

```jsx
import { useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, themeQuartz } from 'ag-grid-community';
import { Check, X } from 'lucide-react';
import { makeId } from '../lib/utils.js';

ModuleRegistry.registerModules([AllCommunityModule]);

const gridTheme = themeQuartz.withParams({
  accentColor: '#42e8ff',
  backgroundColor: '#0b101b',
  borderColor: 'rgba(130, 229, 255, 0.18)',
  browserColorScheme: 'dark',
  chromeBackgroundColor: '#101827',
  columnBorder: true,
  foregroundColor: '#d9f4ff',
  headerBackgroundColor: '#121d30',
  headerFontWeight: 700,
  oddRowBackgroundColor: 'rgba(255, 255, 255, 0.025)',
  rowBorder: true,
  spacing: 8,
});

export function AIImportPreviewModal({ tableLabel, columns, rows, onConfirm, onClose }) {
  const [rowData, setRowData] = useState(() =>
    rows.map(r => ({ ...r, __previewId: makeId('prev') }))
  );

  const colDefs = useMemo(() => [
    ...columns
      .filter(c => c.field !== '__actions')
      .map(col => ({ field: col.field, headerName: col.headerName, width: col.width || 140, editable: true })),
    {
      headerName: '',
      width: 52,
      sortable: false,
      filter: false,
      resizable: false,
      cellRenderer: ({ data }) => (
        <button
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: '4px' }}
          onClick={() => setRowData(prev => prev.filter(r => r.__previewId !== data.__previewId))}
          title="删除此行"
        >
          <X size={13} />
        </button>
      ),
    },
  ], [columns]);

  const handleConfirm = () => {
    onConfirm(rowData.map(({ __previewId, ...rest }) => rest));
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-card" style={{ width: '820px', maxWidth: '96vw' }}>
        <div className="modal-head">
          <div>
            <p className="eyebrow">AI 识别结果</p>
            <h3>共识别 {rowData.length} 条{tableLabel}记录，可直接编辑后导入</h3>
          </div>
          <button className="icon-button" type="button" onClick={onClose} title="取消">
            <X size={18} />
          </button>
        </div>

        <div style={{ height: 340 }}>
          <AgGridReact
            theme={gridTheme}
            rowData={rowData}
            columnDefs={colDefs}
            onCellValueChanged={({ data }) =>
              setRowData(prev => prev.map(r => r.__previewId === data.__previewId ? data : r))
            }
          />
        </div>

        <div className="modal-actions">
          <button className="ghost-button" type="button" onClick={onClose}>取消</button>
          <button
            className="primary-action compact"
            type="button"
            onClick={handleConfirm}
            disabled={rowData.length === 0}
          >
            <Check size={15} />
            确认导入 {rowData.length} 条
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 创建 `src/components/AIImportButton.jsx`**

```jsx
import { useRef, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { parseFile } from '../lib/ai-import/fileParser.js';
import { buildImportMessages, parseImportResponse } from '../lib/ai-import/fieldMapper.js';
import { callAI } from '../lib/ai-import/aiClient.js';
import { AIImportPreviewModal } from './AIImportPreviewModal.jsx';

export function AIImportButton({ tableKey, tableLabel, columns, aiSettings, onImport }) {
  const [phase, setPhase] = useState('idle'); // idle | parsing | calling | preview
  const [previewRows, setPreviewRows] = useState([]);
  const [error, setError] = useState(null);
  const inputRef = useRef();

  const hasKey = Boolean(aiSettings?.apiKey);

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    setError(null);

    try {
      setPhase('parsing');
      const parsed = await parseFile(file);

      setPhase('calling');
      const messages = buildImportMessages(tableLabel, columns, parsed);
      const responseText = await callAI(aiSettings, messages);
      const rows = parseImportResponse(responseText);

      setPreviewRows(rows);
      setPhase('preview');
    } catch (err) {
      setError(err.message);
      setPhase('idle');
    }
  };

  const handleConfirm = (rows) => {
    onImport(tableKey, rows);
    setPhase('idle');
    setPreviewRows([]);
  };

  const busy = phase === 'parsing' || phase === 'calling';
  const label = phase === 'parsing' ? '解析中…' : phase === 'calling' ? 'AI 识别中…' : 'AI 导入';

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,.xls,.pdf,.png,.jpg,.jpeg,.webp"
        style={{ display: 'none' }}
        onChange={handleFile}
      />
      <button
        className="secondary-button"
        type="button"
        disabled={busy || !hasKey}
        title={!hasKey ? '请先在顶栏 AI 设置中填写 API Key' : 'AI 识别文件自动录入'}
        onClick={() => !busy && inputRef.current.click()}
      >
        {busy ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />}
        {label}
      </button>
      {error && (
        <span style={{ color: 'var(--red)', fontSize: '12px', maxWidth: 220 }} title={error}>
          识别失败
        </span>
      )}
      {phase === 'preview' && (
        <AIImportPreviewModal
          tableLabel={tableLabel}
          columns={columns}
          rows={previewRows}
          onConfirm={handleConfirm}
          onClose={() => setPhase('idle')}
        />
      )}
    </>
  );
}
```

- [ ] **Step 3: 在 App.jsx 中接入 AI 导入**

在 App.jsx 顶部 import 区域追加（和 AISettingsModal 同行或新行）：
```javascript
import { AIImportButton } from "./components/AIImportButton.jsx";
```

在 `function App()` 内，`deleteRows` 函数之后添加：
```javascript
const handleAIImport = (tableKey, rows) => {
  updateSelectedCustomer((customer) => ({
    ...customer,
    [tableKey]: [
      ...(customer[tableKey] || []),
      ...rows.map((row) => ({ id: makeId(tableKey), ...row })),
    ],
  }));
};
```

在 App.jsx 约第 618 行的 `<div className="toolbar-actions">` 内，"自定义表头"按钮 `<button className="secondary-button"` 之前插入：
```jsx
{selectedCustomer && (
  <AIImportButton
    tableKey={activeTable}
    tableLabel={tableConfigs[activeTable].rowLabel}
    columns={[
      ...tableConfigs[activeTable].defaultColumns,
      ...(selectedCustomer.customColumns?.[activeTable] || []),
    ]}
    aiSettings={aiSettings}
    onImport={handleAIImport}
  />
)}
```

- [ ] **Step 4: 验证**

```bash
npm run dev
```

1. 先在 AI 设置中填写有效 API Key 和模型
2. 选择一个客户，切换到"产品录入"标签
3. 点击"AI 导入"按钮，上传一个包含产品数据的 CSV 文件
4. 确认出现预览弹窗，数据识别正确，点击"确认导入"后产品表新增数据

- [ ] **Step 5: Commit**

```bash
git add src/components/AIImportButton.jsx src/components/AIImportPreviewModal.jsx src/App.jsx
git commit -m "feat: add AI import button and preview modal with App wiring"
```

---

## Task 8: AI 对话面板 + CSS + 接入 App

**Files:**
- Create: `src/components/AIChangesPreviewModal.jsx`
- Create: `src/components/AIChatPanel.jsx`
- Modify: `src/styles.css` (追加 AI chat CSS)
- Modify: `src/App.jsx`

- [ ] **Step 1: 创建 `src/components/AIChangesPreviewModal.jsx`**

```jsx
import { Check, X } from 'lucide-react';

const TABLE_LABELS = { products: '产品', orders: '订单', deliveries: '送货单' };
const ACTION_LABELS = { update: '修改', add: '新增', delete: '删除' };
const ACTION_COLORS = { update: 'var(--amber)', add: 'var(--lime)', delete: 'var(--red)' };

export function AIChangesPreviewModal({ changes, customer, onConfirm, onClose }) {
  const getRow = (table, id) => customer[table]?.find(r => r.id === id);

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-card small">
        <div className="modal-head">
          <div>
            <p className="eyebrow">变更预览</p>
            <h3>即将应用 {changes.length} 条变更</h3>
          </div>
          <button className="icon-button" type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div style={{ maxHeight: 340, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {changes.map((change, i) => {
            const existing = change.id ? getRow(change.table, change.id) : null;
            return (
              <div key={i} style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 6, fontSize: 13 }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                  <span style={{ color: ACTION_COLORS[change.action], fontWeight: 600 }}>
                    {ACTION_LABELS[change.action]}
                  </span>
                  <span style={{ color: 'var(--muted)' }}>{TABLE_LABELS[change.table]}</span>
                  {change.id && <span style={{ color: 'var(--muted)' }}>#{change.id}</span>}
                </div>

                {change.action === 'update' && change.patch &&
                  Object.entries(change.patch).map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ color: 'var(--muted)' }}>{k}：</span>
                      {existing?.[k] !== undefined && (
                        <span style={{ textDecoration: 'line-through', opacity: 0.5 }}>{String(existing[k])}</span>
                      )}
                      <span style={{ color: 'var(--lime)' }}>→ {String(v)}</span>
                    </div>
                  ))
                }
                {change.action === 'add' && (
                  <span style={{ color: 'var(--lime)' }}>{JSON.stringify(change.row)}</span>
                )}
                {change.action === 'delete' && existing && (
                  <span style={{ color: 'var(--red)' }}>
                    删除：{existing.name || existing.orderNo || existing.deliveryNo || change.id}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div className="modal-actions">
          <button className="ghost-button" type="button" onClick={onClose}>取消</button>
          <button className="primary-action compact" type="button" onClick={() => onConfirm(changes)}>
            <Check size={15} />
            确认应用
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 创建 `src/components/AIChatPanel.jsx`**

```jsx
import { useEffect, useRef, useState } from 'react';
import { Bot, Loader2, Send, X } from 'lucide-react';
import { callAI } from '../lib/ai-import/aiClient.js';
import { buildChatMessages, parseChatResponse } from '../lib/ai-import/fieldMapper.js';
import { AIChangesPreviewModal } from './AIChangesPreviewModal.jsx';

export function AIChatPanel({ customer, aiSettings, onApplyChanges }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingChanges, setPendingChanges] = useState(null);
  const endRef = useRef();

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text }]);
    setLoading(true);

    try {
      const apiMessages = buildChatMessages(customer, text);
      const raw = await callAI(aiSettings, apiMessages);
      const parsed = parseChatResponse(raw);
      setMessages(prev => [...prev, { role: 'assistant', text: parsed.reply, changes: parsed.changes }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'system', text: `错误：${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const handleApply = (changes) => {
    onApplyChanges(changes);
    setPendingChanges(null);
    setMessages(prev => [...prev, { role: 'system', text: `✓ 已应用 ${changes.length} 条变更。` }]);
  };

  const hasKey = Boolean(aiSettings?.apiKey);

  return (
    <>
      <button
        className="ai-fab"
        onClick={() => setOpen(o => !o)}
        title="AI 助手"
        aria-label="打开 AI 助手"
      >
        <Bot size={22} />
      </button>

      {open && (
        <div className="ai-chat-panel">
          <div className="ai-chat-header">
            <span><Bot size={15} style={{ marginRight: 6 }} />AI 助手 · {customer?.name ?? '请先选择客户'}</span>
            <button className="icon-button" onClick={() => setOpen(false)} title="关闭">
              <X size={15} />
            </button>
          </div>

          <div className="ai-chat-messages">
            {messages.length === 0 && (
              <p className="ai-chat-hint">
                {hasKey
                  ? `你好！我可以帮你查询或修改 ${customer?.name ?? '客户'} 的产品和订单数据。`
                  : '请先在顶栏 AI 设置中填写 API Key。'}
              </p>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`ai-bubble ai-bubble--${msg.role}`}>
                <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{msg.text}</p>
                {msg.changes?.length > 0 && (
                  <button
                    className="ghost-button compact"
                    style={{ marginTop: 8, fontSize: 12 }}
                    onClick={() => setPendingChanges(msg.changes)}
                  >
                    预览变更（{msg.changes.length} 条）
                  </button>
                )}
              </div>
            ))}
            {loading && (
              <div className="ai-bubble ai-bubble--assistant">
                <Loader2 size={14} className="spin" />
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div className="ai-chat-input-row">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入指令，例如：把所有待确认订单改为生产中"
              disabled={loading || !hasKey || !customer}
            />
            <button
              className="primary-action compact"
              onClick={send}
              disabled={loading || !input.trim() || !hasKey || !customer}
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      )}

      {pendingChanges && customer && (
        <AIChangesPreviewModal
          changes={pendingChanges}
          customer={customer}
          onConfirm={handleApply}
          onClose={() => setPendingChanges(null)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 3: 向 `src/styles.css` 末尾追加 AI 功能样式**

在 `src/styles.css` 文件末尾追加：

```css
/* ── AI 功能 ──────────────────────────────────── */
@keyframes spin {
  to { transform: rotate(360deg); }
}
.spin { animation: spin 0.9s linear infinite; }

/* 悬浮按钮 */
.ai-fab {
  position: fixed;
  bottom: 28px;
  right: 28px;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: linear-gradient(135deg, #1e3a5f, #0d2040);
  border: 1px solid var(--line-strong);
  color: var(--cyan);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5);
  z-index: 900;
  transition: transform 0.15s, box-shadow 0.15s;
}
.ai-fab:hover {
  transform: scale(1.08);
  box-shadow: 0 6px 32px rgba(66, 232, 255, 0.2);
}

/* 对话面板 */
.ai-chat-panel {
  position: fixed;
  bottom: 92px;
  right: 28px;
  width: 400px;
  height: 500px;
  background: var(--panel-strong);
  border: 1px solid var(--line-strong);
  border-radius: 12px;
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
  z-index: 901;
  overflow: hidden;
}

.ai-chat-header {
  padding: 12px 14px;
  border-bottom: 1px solid var(--line);
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 600;
  font-size: 13px;
  flex-shrink: 0;
}

.ai-chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ai-chat-hint {
  font-size: 13px;
  color: var(--muted);
  text-align: center;
  margin: auto;
  padding: 16px;
}

.ai-bubble {
  max-width: 88%;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.5;
}
.ai-bubble--user {
  align-self: flex-end;
  background: rgba(66, 232, 255, 0.12);
  border: 1px solid rgba(66, 232, 255, 0.2);
}
.ai-bubble--assistant {
  align-self: flex-start;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--line);
}
.ai-bubble--system {
  align-self: center;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  border: none;
  padding: 4px 0;
}

.ai-chat-input-row {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid var(--line);
  flex-shrink: 0;
}
.ai-chat-input-row input {
  flex: 1;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--line);
  border-radius: 6px;
  color: var(--text);
  font-size: 13px;
  padding: 7px 10px;
  outline: none;
}
.ai-chat-input-row input:focus {
  border-color: var(--cyan);
}
.ai-chat-input-row input:disabled {
  opacity: 0.4;
}
```

- [ ] **Step 4: 在 App.jsx 中接入 AI 对话**

在 App.jsx 顶部 import 区域追加：
```javascript
import { AIChatPanel } from "./components/AIChatPanel.jsx";
```

在 `function App()` 内，`handleAIImport` 之后添加：
```javascript
const handleApplyChanges = (changes) => {
  updateSelectedCustomer((customer) => {
    let updated = { ...customer };
    for (const change of changes) {
      if (change.table === 'deliveries') continue; // 只读
      if (change.action === 'update' && change.id && change.patch) {
        updated[change.table] = (updated[change.table] || []).map((row) =>
          row.id === change.id ? { ...row, ...change.patch } : row,
        );
      } else if (change.action === 'add' && change.row) {
        updated[change.table] = [
          ...(updated[change.table] || []),
          { id: makeId(change.table), ...change.row },
        ];
      } else if (change.action === 'delete' && change.id) {
        updated[change.table] = (updated[change.table] || []).filter(
          (row) => row.id !== change.id,
        );
      }
    }
    return updated;
  });
};
```

在 App return 语句的 `{showAISettings && ...}` 块之后，`</div>` 闭合标签之前，追加：
```jsx
<AIChatPanel
  customer={selectedCustomer}
  aiSettings={aiSettings}
  onApplyChanges={handleApplyChanges}
/>
```

- [ ] **Step 5: 验证**

```bash
npm run dev
```

1. 右下角出现机器人悬浮按钮，点击展开对话面板
2. 选中一个客户后面板标题显示客户名
3. 输入"现在有几条订单？"，AI 正确回答订单数量
4. 输入"把所有待确认订单改为生产中"，AI 回复并出现"预览变更"按钮
5. 点击"预览变更"，弹窗显示修改前/后对比
6. 点击"确认应用"，订单状态在表格中更新

- [ ] **Step 6: Commit**

```bash
git add src/components/AIChatPanel.jsx src/components/AIChangesPreviewModal.jsx src/styles.css src/App.jsx
git commit -m "feat: add AI chat panel with data query and edit capabilities"
```

---

## 完成标志

- [ ] AI 设置弹窗可保存 Provider / Base URL / API Key / Model
- [ ] 工具栏"AI 导入"按钮对 CSV、Excel、PDF、图片均能识别并弹出预览
- [ ] 预览弹窗可内联编辑和删除行，确认后数据追加到当前客户
- [ ] 右下角悬浮按钮点击展开 AI 对话面板
- [ ] AI 对话能回答数据问题并生成变更指令
- [ ] 变更预览弹窗显示修改前/后对比，确认后写入数据
- [ ] 所有功能 `npm run build` 无 error
