# AI 文件导入 + AI 对话功能设计

**日期：** 2026-05-29  
**项目：** foam-factory-crm  
**状态：** 已批准

---

## 背景

当前系统为纯前端 React CRM，数据存于 localStorage，使用 ag-grid 展示产品/订单/送货单三张表。手动录入效率低，需要通过 AI 大模型识别 PDF、Excel、CSV、图片文件来自动录入数据，同时提供 AI 对话功能让用户以自然语言操作数据。

---

## 功能一：AI 文件导入

### 入口

每张表（产品、订单、送货单）的工具栏新增"AI 导入"按钮，点击后打开文件选择器。

### 支持文件格式

| 格式 | 解析方式 | AI 调用方式 |
|---|---|---|
| CSV | `papaparse` 解析为行数组 | 仅字段映射 prompt |
| Excel (.xlsx/.xls) | `xlsx` 库解析为 JSON 行数组 | 仅字段映射 prompt |
| PDF | `pdfjs-dist` 提取文本；文本内容 < 50 字符时降级为 canvas 截图 base64 | 文字 prompt 或 vision |
| 图片 (PNG/JPG) | `FileReader` 读取为 base64 | vision 消息 |

### 导入流程

```
用户点击"AI 导入"
  → 选择文件
  → fileParser 解析（客户端，零网络请求）
  → 构建 prompt（含目标表字段 schema + 原始数据）
  → aiClient 调用 AI API
  → AI 返回 JSON 数组
  → 打开 AIImportPreviewModal（ag-grid 可编辑）
  → 用户编辑/删除行
  → 确认 → 追加到当前客户对应表数据
```

### AI Prompt 结构

```
你是一个数据提取助手。从以下内容中提取{表名}信息，返回符合格式的纯 JSON 数组。

目标字段（含该客户自定义列）：
{tableConfigs[key].defaultColumns + customer.customColumns[key] 合并后的字段列表，含中文名和字段说明}

<raw_data>
{解析后的文本内容 或 [image: base64]}
</raw_data>

只返回 JSON 数组，不要包含任何其他文字或 markdown 代码块。
```

**字段 schema 动态生成：** 每次导入时将 `defaultColumns` 与当前客户的 `customColumns[tableKey]` 合并，确保 AI 能识别并填充客户专属的自定义列（如"业务员"、"密度"等）。

### 预览弹窗（AIImportPreviewModal）

- 用 ag-grid 展示 AI 返回的所有行
- 支持内联编辑（修正识别错误）
- 支持删除单行
- "确认导入"将所有行追加到当前客户数据，并生成唯一 ID
- "取消"直接关闭，不写入任何数据

---

## 功能二：AI 对话

### UI

- 右下角悬浮按钮（机器人图标），点击展开 400×500px 聊天面板
- 面板顶部显示当前客户名称（读取 App 的 `selectedCustomer` 状态，由 props 传入）
- 消息列表 + 底部输入框 + 发送按钮
- 再次点击悬浮按钮或点击关闭图标收起面板

### 上下文

每次用户发送消息时，系统自动附带当前客户的完整数据：

```json
{
  "customer": { "name": "...", "level": "..." },
  "products": [...],
  "orders": [...],
  "deliveries": [...]
}
```

AI 可读取所有字段，用于回答问题或生成操作指令。

### AI 返回格式

```json
{
  "reply": "找到 3 条待确认订单，将状态改为生产中。",
  "changes": [
    { "table": "orders", "action": "update", "id": "o-1", "patch": { "status": "生产中" } },
    { "table": "orders", "action": "update", "id": "o-2", "patch": { "status": "生产中" } }
  ]
}
```

支持操作类型：
- `update`：修改已有行的部分字段（提供 `id` + `patch`）
- `add`：新增行（提供 `table` + `row` 对象，系统自动生成 ID）
- `delete`：删除行（提供 `table` + `id`）

若仅回答问题（无数据变更），`changes` 字段为空数组或省略。

### 变更确认流

1. AI 回复显示在聊天气泡中
2. 若 `changes` 非空，气泡下方出现"预览变更（N 条）"按钮
3. 点击打开 AIChangesPreviewModal，展示每条变更的前/后对比
4. 用户点击"确认应用"写入数据；点击"取消"忽略变更
5. 操作结果以系统消息形式出现在对话中

---

## 功能三：AI 设置

### 入口

导航栏右上角新增"AI 设置"按钮（⚙️ 图标旁），点击打开 AISettingsModal。

### 配置项

| 字段 | 说明 |
|---|---|
| Provider | `anthropic` / `openai` / `custom-openai` / `custom-anthropic` |
| Base URL | 默认值按 provider 自动填入，可覆盖（用于自定义兼容服务） |
| API Key | 用户自行申请，明文存于 localStorage（仅本地） |
| Model | 预设常用模型供选择，也可手动输入自定义模型名 |

**默认 Base URL：**
- `anthropic`：`https://api.anthropic.com`
- `openai`：`https://api.openai.com`
- `custom-openai` / `custom-anthropic`：用户必须填写

### 存储

独立 localStorage key：`foam-factory-crm:ai-settings`，不影响现有 `foam-factory-crm:v1` 数据。

---

## 新增文件结构

```
src/
├── lib/ai-import/
│   ├── fileParser.js       # CSV/Excel/PDF/图片 → 统一中间格式
│   ├── aiClient.js         # Anthropic + OpenAI-compatible 统一调用接口
│   └── fieldMapper.js      # 构建 prompt、解析 AI JSON 响应
└── components/
    ├── AISettingsModal.jsx        # Provider / BaseURL / Key / Model 配置
    ├── AIImportButton.jsx         # 导入按钮 + 文件选择 + 调用编排
    ├── AIImportPreviewModal.jsx   # 导入预览确认弹窗
    ├── AIChatPanel.jsx            # 悬浮对话面板
    └── AIChangesPreviewModal.jsx  # 对话变更差异预览弹窗
```

**修改现有文件：**
- `src/App.jsx`：集成 AI 设置状态、在表格工具栏插入 `AIImportButton`、挂载 `AIChatPanel`

---

## 依赖库

| 库 | 用途 |
|---|---|
| `papaparse` | CSV 解析 |
| `xlsx` | Excel 解析 |
| `pdfjs-dist` | PDF 文本提取 + 页面渲染 |

以上均为纯客户端库，无需后端。

---

## 边界与约束

- API Key 存于 localStorage，仅适合个人/内网使用，不建议多人共享部署
- PDF 超过 10 页时仅处理前 5 页，避免超出模型 context window
- AI 返回非合法 JSON 时，显示错误提示并保留原始回复供用户参考
- 对话功能仅操作当前选中客户的数据，不跨客户
- 送货单表默认不出现在 AI 对话的写入操作中（只读参考），防止误操作物流记录
