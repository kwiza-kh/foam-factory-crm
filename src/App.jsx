import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { makeId, today } from "./lib/utils.js";
import { api } from "./lib/api.js";
import { OrderImportButton } from "./components/OrderImportButton.jsx";
import { exportTableToExcel } from "./lib/exporter.js";
import { exportBackup, importBackup } from "./lib/backup.js";
import { DeliveryPrintModal } from "./components/DeliveryPrintModal.jsx";
import { AgGridReact } from "ag-grid-react";
import {
  CellStyleModule,
  ClientSideRowModelApiModule,
  ClientSideRowModelModule,
  ColumnApiModule,
  ColumnAutoSizeModule,
  DateEditorModule,
  DragAndDropModule,
  LocaleModule,
  ModuleRegistry,
  NumberEditorModule,
  PinnedRowModule,
  QuickFilterModule,
  RenderApiModule,
  RowApiModule,
  RowSelectionModule,
  RowStyleModule,
  ScrollApiModule,
  SelectEditorModule,
  TextEditorModule,
  _ColumnMoveModule as ColumnMoveModule,
  _SortModule as SortModule,
  themeQuartz,
} from "ag-grid-community";
import {
  Boxes,
  ClipboardList,
  FilePlus2,
  Filter,
  KanbanSquare,
  LayoutDashboard,
  Plus,
  Save,
  Search,
  Settings2,
  SquarePen,
  Trash2,
  Truck,
  UserRoundPlus,
  X,
  Download,
  AlertTriangle,
  Archive,
  Printer,
  Copy,
  ClipboardPaste,
  Eraser,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  RotateCcw,
  Pencil,
} from "lucide-react";

ModuleRegistry.registerModules([
  CellStyleModule,
  ClientSideRowModelApiModule,
  ClientSideRowModelModule,
  ColumnApiModule,
  ColumnAutoSizeModule,
  ColumnMoveModule,
  DateEditorModule,
  DragAndDropModule,
  LocaleModule,
  NumberEditorModule,
  PinnedRowModule,
  QuickFilterModule,
  RenderApiModule,
  RowApiModule,
  RowSelectionModule,
  RowStyleModule,
  ScrollApiModule,
  SelectEditorModule,
  SortModule,
  TextEditorModule,
]);

const statusOptions = ["未完成", "已排产", "生产中", "已完成", "已送货", "已开对账单", "已付款"];
const closedOrderStatuses = new Set(["已完成", "已送货", "已开对账单", "已付款", "已发货"]);
const isOpenOrder = (status = "") => !closedOrderStatuses.has(status) && status !== "异常";
const normalizeOrderStatus = (status = "") => {
  if (statusOptions.includes(status)) return status;
  if (status === "已发货") return "已送货";
  return "未完成";
};
const statusTransitions = {
  "未完成": ["已排产", "已完成"],
  "已排产": ["生产中"],
  "生产中": ["已完成"],
  "已完成": ["已送货", "已开对账单"],
  "已送货": ["已开对账单"],
  "已开对账单": ["已付款"],
  "已付款": [],
};
const getNextStatuses = (currentStatus) => {
  const normalized = normalizeOrderStatus(currentStatus);
  return statusTransitions[normalized] || [];
};
const deliveryStatusOptions = ["待装车", "配送中", "已签收", "回单异常"];
const customerLevelOptions = ["重点客户", "稳定客户", "新客户", "暂停合作"];
const materialOptions = ["EPS", "EPE", "EPP", "珍珠棉", "海绵", "其他"];
const unitOptions = ["件", "套", "箱", "个", "㎡", "m³", "kg"];
const orderDefaultColumns = [
  {
    field: "status",
    headerName: "进度",
    width: 130,
    type: "select",
    options: statusOptions,
  },
];
const deliveryQuantityField = "deliveryQuantity";
const orderDeliveredQuantityField = "deliveredQuantity";
const orderRemainingQuantityField = "remainingQuantity";
const finalDeliveryField = "_finalDelivery";
const linkedOrderIdField = "_linkedOrderId";
const linkedOrderQuantitySourceField = "_linkedOrderQuantitySourceField";
const deliveryOrderFieldPrefix = "order_";
const finalDeliveryStatusOptions = ["未送", "已送", "作废"];
const productionScheduleStatusOptions = ["已排产", "生产中"];
const orderDeliveryTrackingColumns = [
  { field: orderDeliveredQuantityField, headerName: "已送数量", width: 110, type: "number" },
  { field: orderRemainingQuantityField, headerName: "剩余数量", width: 110, type: "number" },
];
const productionScheduleDateField = "productionDate";
const productionScheduleQuantityField = "productionQuantity";
const productionLineField = "productionLine";
const productionNoteField = "productionNote";
const productionScheduleColumns = [
  { field: productionScheduleDateField, headerName: "排产日期", width: 130, type: "date" },
  { field: productionScheduleQuantityField, headerName: "排产数量", width: 110, type: "number" },
  { field: productionLineField, headerName: "员工姓名", width: 120 },
  { field: productionNoteField, headerName: "排产备注", flex: 1, minWidth: 160 },
];
const deliveryQuantityColumn = {
  field: deliveryQuantityField,
  headerName: "送货数量",
  width: 110,
  type: "number",
};
const knownOrderDataColumns = [
  { field: "orderNo", headerName: "订单号", width: 140 },
  { field: "date", headerName: "订单日期", width: 130, type: "date" },
  { field: "product", headerName: "产品", width: 150 },
  { field: "quantity", headerName: "订单数量", width: 110, type: "number" },
  { field: "amount", headerName: "金额", width: 120, type: "number" },
  { field: "dueDate", headerName: "交期", width: 130, type: "date" },
  { field: "followUp", headerName: "跟进记录", flex: 1, minWidth: 180 },
];

const tableConfigs = {
  products: {
    label: "产品录入",
    icon: Boxes,
    rowLabel: "产品",
    defaultColumns: [
      { field: "name", headerName: "产品名称", width: 150, required: true },
      { field: "spec", headerName: "规格尺寸", width: 150 },
      { field: "material", headerName: "泡沫材质", width: 130, type: "select", options: materialOptions },
      { field: "unit", headerName: "单位", width: 90, type: "select", options: unitOptions },
      {
        field: "unitPrice",
        headerName: "单价",
        width: 110,
        type: "number",
      },
      { field: "moq", headerName: "起订量", width: 110, type: "number" },
      { field: "remark", headerName: "备注", flex: 1, minWidth: 160 },
    ],
    emptyRow: {
      name: "新泡沫产品",
      spec: "",
      material: "EPS",
      unit: "件",
      unitPrice: 0,
      moq: 0,
      remark: "",
    },
  },
  orders: {
    label: "订单录入 / 跟进",
    icon: ClipboardList,
    rowLabel: "订单",
    defaultColumns: orderDefaultColumns,
    emptyRow: {
      orderNo: "",
      date: "",
      product: "",
      quantity: 0,
      amount: 0,
      dueDate: "",
      status: "未完成",
      followUp: "",
    },
  },
  productionSchedule: {
    label: "排产看板",
    icon: KanbanSquare,
    rowLabel: "排产订单",
    defaultColumns: [
      ...orderDefaultColumns,
      ...productionScheduleColumns,
    ],
    emptyRow: {},
    sourceTableKey: "orders",
    disableRowCreate: true,
  },
  historyOrders: {
    label: "历史订单",
    icon: ClipboardList,
    rowLabel: "历史订单",
    defaultColumns: orderDefaultColumns,
    emptyRow: {},
    sourceTableKey: "orders",
    readOnly: true,
  },
  deliveries: {
    label: "送货单草稿",
    icon: Truck,
    rowLabel: "送货单草稿",
    defaultColumns: [
      {
        field: "deliveryNo",
        headerName: "送货单号",
        width: 150,
        required: true,
      },
      { field: "date", headerName: "送货日期", width: 130, type: "date" },
    ],
    emptyRow: {
      deliveryNo: "",
      date: "",
      status: "未送",
      [finalDeliveryField]: false,
    },
  },
  finalDeliveries: {
    label: "送货单",
    icon: Truck,
    rowLabel: "送货单",
    defaultColumns: [
      {
        field: "deliveryNo",
        headerName: "送货单号",
        width: 150,
        required: true,
      },
      { field: "date", headerName: "送货日期", width: 130, type: "date" },
      {
        field: "status",
        headerName: "状态",
        width: 110,
        type: "select",
        options: finalDeliveryStatusOptions,
      },
    ],
    emptyRow: {},
    sourceTableKey: "deliveries",
    disableRowCreate: true,
  },
};

const initialCustomers = [
  {
    id: "cus-kanghui",
    name: "康辉冷链包装",
    contact: "李经理",
    phone: "138 0000 3210",
    address: "佛山南海工业园 6 号仓",
    level: "重点客户",
    paymentTerm: "月结 30 天",
    taxNo: "91440600MA5FOAM001",
    note: "冷链泡沫箱月度稳定采购，交期优先。",
    customColumns: {
      products: [
        { field: "density", headerName: "密度", type: "text", width: 100 },
      ],
      orders: [
        { field: "salesOwner", headerName: "业务员", type: "text", width: 110 },
      ],
      deliveries: [
        { field: "driver", headerName: "司机", type: "text", width: 110 },
      ],
    },
    products: [
      {
        id: "p-1",
        name: "冷链泡沫箱",
        spec: "620*420*360mm",
        material: "EPS",
        unit: "套",
        unitPrice: 18.5,
        moq: 200,
        density: "18kg/m3",
        remark: "带盖，白色",
      },
      {
        id: "p-2",
        name: "保温内衬",
        spec: "定制",
        material: "EPP",
        unit: "件",
        unitPrice: 6.8,
        moq: 500,
        density: "28kg/m3",
        remark: "按客户图纸开模",
      },
    ],
    orders: [
      {
        id: "o-1",
        orderNo: "KH-202605-018",
        date: "2026-05-18",
        product: "冷链泡沫箱",
        quantity: 1200,
        amount: 22200,
        dueDate: "2026-05-30",
        status: "未完成",
        salesOwner: "陈峰",
        followUp: "已排产，待 5 月 28 日质检。",
      },
    ],
    deliveries: [
      {
        id: "d-1",
        deliveryNo: "DN-202605-088",
        date: "2026-05-20",
        orderNo: "KH-202605-016",
        receiver: "王仓管",
        address: "佛山南海工业园 6 号仓",
        packages: 360,
        status: "已签收",
        driver: "粤A8F21",
        signedNote: "回单已拍照归档",
      },
    ],
  },
  {
    id: "cus-shengda",
    name: "盛达电器配套",
    contact: "周总",
    phone: "139 0000 8621",
    address: "中山小榄智能制造园",
    level: "稳定客户",
    paymentTerm: "货到 15 天",
    taxNo: "91442000MA5FOAM002",
    note: "防震泡沫成型件，对规格一致性要求高。",
    customColumns: {
      products: [
        { field: "moldNo", headerName: "模具号", type: "text", width: 110 },
      ],
      orders: [
        { field: "poNo", headerName: "客户PO", type: "text", width: 130 },
      ],
      deliveries: [],
    },
    products: [
      {
        id: "p-3",
        name: "电器防震角",
        spec: "A-42",
        material: "EPE",
        unit: "个",
        unitPrice: 0.72,
        moq: 5000,
        moldNo: "M-042",
        remark: "黑色袋装",
      },
    ],
    orders: [
      {
        id: "o-2",
        orderNo: "SD-202605-009",
        date: "2026-05-21",
        product: "电器防震角",
        quantity: 24000,
        amount: 17280,
        dueDate: "2026-05-27",
        status: "未完成",
        poNo: "PO-886132",
        followUp: "客户要求 5 月 26 日上午装车。",
      },
    ],
    deliveries: [],
  },
];

const gridTheme = themeQuartz.withParams({
  accentColor: "#42e8ff",
  backgroundColor: "#0b101b",
  borderColor: "rgba(130, 229, 255, 0.18)",
  browserColorScheme: "dark",
  chromeBackgroundColor: "#101827",
  columnBorder: true,
  foregroundColor: "#d9f4ff",
  headerBackgroundColor: "#121d30",
  headerFontWeight: 700,
  oddRowBackgroundColor: "rgba(255, 255, 255, 0.025)",
  rowBorder: true,
  spacing: 8,
});

const localeText = {
  noRowsToShow: "暂无数据，点击新增开始录入",
  loadingOoo: "加载中...",
  searchOoo: "搜索...",
  selectAll: "全选",
  blanks: "空白",
  filterOoo: "筛选...",
  equals: "等于",
  notEqual: "不等于",
  contains: "包含",
  notContains: "不包含",
  startsWith: "开头是",
  endsWith: "结尾是",
  lessThan: "小于",
  greaterThan: "大于",
  applyFilter: "应用",
  resetFilter: "重置",
  clearFilter: "清除",
  columns: "列",
  filters: "筛选",
};


const MAX_UNDO_STEPS = 50;

function cloneData(data) {
  if (typeof structuredClone === "function") {
    return structuredClone(data);
  }
  return JSON.parse(JSON.stringify(data));
}

function uniqueRowId(tableKey, usedIds) {
  let id = makeId(tableKey);
  while (usedIds.has(id)) {
    id = makeId(tableKey);
  }
  usedIds.add(id);
  return id;
}

function ensureUniqueRowIds(rows, tableKey, customers, currentCustomerId) {
  const usedIds = new Set();

  for (const customer of customers || []) {
    if (customer.id === currentCustomerId) continue;
    for (const row of customer[tableKey] || []) {
      if (row.id) usedIds.add(row.id);
    }
  }

  return (rows || []).map((row) => {
    const id = row.id;
    if (!id || usedIds.has(id)) {
      return { ...row, id: uniqueRowId(tableKey, usedIds) };
    }
    usedIds.add(id);
    return row;
  });
}

function ensureUniqueCustomerRowIds(customers) {
  const tableKeys = Object.keys(tableConfigs).filter(tableKey => !tableConfigs[tableKey].sourceTableKey);
  const usedIdsByTable = tableKeys.reduce((acc, tableKey) => {
    acc[tableKey] = new Set();
    return acc;
  }, {});

  return (customers || []).map((customer) => {
    const nextCustomer = { ...customer };

    for (const tableKey of tableKeys) {
      nextCustomer[tableKey] = (customer[tableKey] || []).map((row) => {
        const usedIds = usedIdsByTable[tableKey];
        const id = row.id;
        if (!id || usedIds.has(id)) {
          return { ...row, id: uniqueRowId(tableKey, usedIds) };
        }
        usedIds.add(id);
        return row;
      });
    }

    return nextCustomer;
  });
}

function normalizeCustomerOrderStatuses(customers) {
  return (customers || []).map(customer => ({
    ...customer,
    orders: (customer.orders || []).map(order => ({
      ...order,
      status: normalizeOrderStatus(order.status),
    })),
    deliveries: normalizeDeliveryRows(customer.deliveries || []),
  }));
}

function encodeClipboardCell(value) {
  const text = String(value ?? "");
  if (!/["\t\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function parseClipboardTable(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === "\t") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  row.push(cell);
  if (row.length > 1 || row[0] !== "" || text.endsWith("\t")) {
    rows.push(row);
  }

  return rows;
}

const formatCurrency = (value) => {
  const number = Number(value || 0);
  return number.toLocaleString("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 2,
  });
};

const toFieldKey = (label) =>
  `custom_${label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "_")
    .replace(/^_+|_+$/g, "")}_${Math.random().toString(36).slice(2, 5)}`;

function parseNumericValue(value) {
  if (value == null || value === "") return 0;
  const number = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function normalizeCalculatedNumber(value) {
  if (!Number.isFinite(value)) return "";
  const rounded = Number(value.toFixed(10));
  return Object.is(rounded, -0) ? 0 : rounded;
}

function isAmountColumn(column = {}) {
  const label = `${column.field || ""} ${column.headerName || ""}`;
  return column.field === "amount" || /金额|货款|合计|总价|小计/.test(label);
}

function formatNumberForDisplay(value, column = {}) {
  if (value === "" || value == null) return "";
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  const normalized = normalizeCalculatedNumber(number);
  return isAmountColumn(column) ? normalized.toFixed(2) : normalized.toString();
}

const formulaReferenceAliases = {
  采购数量: "quantity",
  订单数量: "quantity",
  订购数量: "quantity",
  数量: "quantity",
  单价: "unitPrice",
  金额: "amount",
  订单金额: "amount",
  送货数量: deliveryQuantityField,
  已送数量: orderDeliveredQuantityField,
  剩余数量: orderRemainingQuantityField,
};

function normalizeFormulaInput(formula) {
  const text = String(formula || "").trim();
  if (!text) return "";
  return text.startsWith("=") ? text : `=${text}`;
}

function formulaKey(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "");
}

function buildFormulaReferenceMap(columns) {
  const map = new Map();
  for (const [alias, field] of Object.entries(formulaReferenceAliases)) {
    map.set(formulaKey(alias), field);
  }
  for (const column of columns) {
    map.set(formulaKey(column.field), column.field);
    map.set(formulaKey(column.headerName), column.field);
  }
  return map;
}

function tokenizeFormula(formula) {
  const expression = normalizeFormulaInput(formula).replace(/^=/, "");
  const tokens = [];
  let index = 0;

  while (index < expression.length) {
    const char = expression[index];

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if ("+-*/()×".includes(char) || char === "x" || char === "X") {
      tokens.push({ type: "operator", value: char === "×" || char === "x" || char === "X" ? "*" : char });
      index += 1;
      continue;
    }

    if (char === "[") {
      const end = expression.indexOf("]", index + 1);
      if (end === -1) return null;
      tokens.push({ type: "reference", value: expression.slice(index + 1, end).trim() });
      index = end + 1;
      continue;
    }

    if (/\d|\./.test(char)) {
      let end = index + 1;
      while (end < expression.length && /[\d.]/.test(expression[end])) end += 1;
      const value = Number(expression.slice(index, end));
      if (!Number.isFinite(value)) return null;
      tokens.push({ type: "number", value });
      index = end;
      continue;
    }

    let end = index + 1;
    while (
      end < expression.length
      && !/\s/.test(expression[end])
      && !"+-*/()[]×xX".includes(expression[end])
    ) {
      end += 1;
    }
    tokens.push({ type: "reference", value: expression.slice(index, end).trim() });
    index = end;
  }

  return tokens;
}

function evaluateFormula(formula, row, referenceMap, targetField) {
  const tokens = tokenizeFormula(formula);
  if (!tokens?.length) return "";
  let position = 0;

  const readReference = (name) => {
    const field = referenceMap.get(formulaKey(name)) || name;
    if (!field || field === targetField) return 0;
    return parseNumericValue(row[field]);
  };

  const parseFactor = () => {
    const token = tokens[position];
    if (!token) return NaN;

    if (token.type === "operator" && token.value === "+") {
      position += 1;
      return parseFactor();
    }
    if (token.type === "operator" && token.value === "-") {
      position += 1;
      return -parseFactor();
    }
    if (token.type === "number") {
      position += 1;
      return token.value;
    }
    if (token.type === "reference") {
      position += 1;
      return readReference(token.value);
    }
    if (token.type === "operator" && token.value === "(") {
      position += 1;
      const value = parseExpression();
      if (tokens[position]?.type !== "operator" || tokens[position]?.value !== ")") return NaN;
      position += 1;
      return value;
    }

    return NaN;
  };

  const parseTerm = () => {
    let value = parseFactor();
    while (
      tokens[position]?.type === "operator"
      && (tokens[position].value === "*" || tokens[position].value === "/")
    ) {
      const operator = tokens[position].value;
      position += 1;
      const right = parseFactor();
      value = operator === "*" ? value * right : value / right;
    }
    return value;
  };

  const parseExpression = () => {
    let value = parseTerm();
    while (
      tokens[position]?.type === "operator"
      && (tokens[position].value === "+" || tokens[position].value === "-")
    ) {
      const operator = tokens[position].value;
      position += 1;
      const right = parseTerm();
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  };

  const value = parseExpression();
  return position === tokens.length && Number.isFinite(value)
    ? normalizeCalculatedNumber(value)
    : "";
}

function normalizeRowIdSet(rowIds) {
  if (!rowIds) return null;
  const set = rowIds instanceof Set ? rowIds : new Set(rowIds);
  return set.size ? set : null;
}

function applyTableFormulas(rows, columns, rowIds = null) {
  const formulaColumns = columns.filter(column => normalizeFormulaInput(column.formula));
  if (!formulaColumns.length) return rows;

  const rowIdSet = normalizeRowIdSet(rowIds);
  const referenceMap = buildFormulaReferenceMap(columns);
  return rows.map(row => {
    if (rowIdSet && !rowIdSet.has(row.id)) return row;
    let next = row;

    for (let pass = 0; pass < formulaColumns.length; pass++) {
      let changedInPass = false;
      for (const column of formulaColumns) {
        const value = evaluateFormula(column.formula, next, referenceMap, column.field);
        if (next[column.field] === value) continue;
        if (next === row) next = { ...row };
        next[column.field] = value;
        changedInPass = true;
      }
      if (!changedInPass) break;
    }

    return next;
  });
}

function isNumericLike(value) {
  const text = String(value ?? "").trim().replace(/,/g, "");
  return text !== "" && Number.isFinite(Number(text));
}

function getCustomerTableColumns(customer, tableKey) {
  const config = tableConfigs[tableKey];
  const defaultFields = new Set(config.defaultColumns.map(column => column.field));
  return [
    ...config.defaultColumns,
    ...((customer.customColumns?.[tableKey] || [])
      .filter(column => !defaultFields.has(column.field))),
  ];
}

function applyCustomerTableFormulas(customer, tableKey, rows, customColumns = customer?.customColumns, rowIds = null) {
  return applyTableFormulas(
    rows,
    getCustomerTableColumns({ ...(customer || {}), customColumns }, tableKey),
    rowIds,
  );
}

function hasFilledValue(row, field) {
  const value = row?.[field];
  return value !== "" && value != null;
}

function isFinalDelivery(delivery) {
  return delivery?.[finalDeliveryField] === true;
}

function normalizeFinalDeliveryStatus(status = "") {
  const text = String(status || "");
  if (text === "作废" || text.includes("作废") || text.includes("取消") || text.includes("无效")) {
    return "作废";
  }
  if (status === "已送" || status === "已送货" || status === "已发货" || String(status).includes("签收")) {
    return "已送";
  }
  return "未送";
}

function isEffectiveDelivery(delivery) {
  return isFinalDelivery(delivery) && normalizeFinalDeliveryStatus(delivery.status) === "已送";
}

function normalizeDeliveryRows(deliveries = []) {
  return deliveries.map(delivery => {
    const hasFinalFlag = Object.prototype.hasOwnProperty.call(delivery, finalDeliveryField);
    const finalDelivery = hasFinalFlag ? Boolean(delivery[finalDeliveryField]) : true;

    return {
      ...delivery,
      [finalDeliveryField]: finalDelivery,
      status: finalDelivery ? normalizeFinalDeliveryStatus(delivery.status) : (delivery.status || "未送"),
    };
  });
}

function deliveryGroupKey(delivery) {
  return String(delivery?.deliveryNo || delivery?.id || "未编号送货单");
}

function getDeliveryGroupStatus(deliveries = []) {
  if (!deliveries.length) return "未送";
  const statuses = deliveries.map(delivery => normalizeFinalDeliveryStatus(delivery.status));
  if (statuses.every(status => status === "已送")) return "已送";
  if (statuses.every(status => status === "作废")) return "作废";
  return "未送";
}

function getOrderLabel(order, fallback = "") {
  return order?.orderNo || order?.product || fallback || order?.id || "未编号订单";
}

function findEffectiveDeliveryOverages(orders = [], deliveries = []) {
  const ordersById = new Map(orders.map(order => [order.id, order]));
  const deliveredByOrderId = new Map();

  for (const delivery of deliveries) {
    if (!isEffectiveDelivery(delivery)) continue;
    const orderId = delivery[linkedOrderIdField];
    if (!orderId) continue;
    deliveredByOrderId.set(
      orderId,
      (deliveredByOrderId.get(orderId) || 0) + parseNumericValue(delivery[deliveryQuantityField]),
    );
  }

  return Array.from(deliveredByOrderId.entries())
    .map(([orderId, deliveredQuantity]) => {
      const order = ordersById.get(orderId);
      if (!order) return null;
      const orderQuantity = parseNumericValue(order.quantity);
      if (deliveredQuantity <= orderQuantity + 0.0000001) return null;
      return {
        orderId,
        orderLabel: getOrderLabel(order, orderId),
        orderQuantity,
        deliveredQuantity,
        overQuantity: deliveredQuantity - orderQuantity,
      };
    })
    .filter(Boolean);
}

function buildDeliveryFinalizePreview(customer, selectedDrafts) {
  const orders = customer?.orders || [];
  const deliveries = customer?.deliveries || [];
  const ordersById = new Map(orders.map(order => [order.id, order]));
  const selectedDraftIds = new Set(selectedDrafts.map(delivery => delivery.id));
  const effectiveDeliveredByOrderId = new Map();
  const selectedByOrderId = new Map();
  let unlinkedQuantity = 0;

  for (const delivery of deliveries) {
    if (selectedDraftIds.has(delivery.id) || !isEffectiveDelivery(delivery)) continue;
    const orderId = delivery[linkedOrderIdField];
    if (!orderId) continue;
    effectiveDeliveredByOrderId.set(
      orderId,
      (effectiveDeliveredByOrderId.get(orderId) || 0) + parseNumericValue(delivery[deliveryQuantityField]),
    );
  }

  const draftSummaries = selectedDrafts.map(delivery => {
    const orderId = delivery[linkedOrderIdField];
    const order = ordersById.get(orderId);
    const quantity = parseNumericValue(delivery[deliveryQuantityField]);
    const deliveredBefore = orderId ? (effectiveDeliveredByOrderId.get(orderId) || 0) : 0;
    const orderQuantity = order ? parseNumericValue(order.quantity) : 0;
    const remainingBefore = order ? Math.max(orderQuantity - deliveredBefore, 0) : null;

    if (orderId && order) {
      selectedByOrderId.set(
        orderId,
        (selectedByOrderId.get(orderId) || 0) + quantity,
      );
    } else {
      unlinkedQuantity += quantity;
    }

    return {
      id: delivery.id,
      deliveryNo: delivery.deliveryNo || "未填写送货单号",
      date: delivery.date || "",
      orderId,
      orderLabel: order ? getOrderLabel(order, orderId) : (delivery.orderNo || "未关联订单"),
      product: order?.product || delivery[deliveryOrderField("product")] || "",
      quantity,
      deliveredBefore,
      remainingBefore,
    };
  });

  const orderSummaries = Array.from(selectedByOrderId.entries()).map(([orderId, selectedQuantity]) => {
    const order = ordersById.get(orderId);
    const deliveredBefore = effectiveDeliveredByOrderId.get(orderId) || 0;
    const orderQuantity = parseNumericValue(order?.quantity);
    const remainingBefore = Math.max(orderQuantity - deliveredBefore, 0);
    return {
      orderId,
      orderLabel: getOrderLabel(order, orderId),
      orderQuantity,
      deliveredBefore,
      remainingBefore,
      selectedQuantity,
    };
  });

  return {
    draftSummaries,
    orderSummaries,
    deliveryNos: [...new Set(selectedDrafts.map(delivery => delivery.deliveryNo || "未填写送货单号"))],
    totalQuantity: selectedDrafts.reduce((sum, delivery) => sum + parseNumericValue(delivery[deliveryQuantityField]), 0),
    unlinkedQuantity,
    overDelivered: orderSummaries.filter(item => item.selectedQuantity > item.remainingBefore + 0.0000001),
  };
}

function formatDeliveryFinalizeMessage(preview) {
  const orderLines = preview.orderSummaries.slice(0, 8).map(item => (
    `${item.orderLabel}：本次 ${normalizeCalculatedNumber(item.selectedQuantity)} / 剩余 ${normalizeCalculatedNumber(item.remainingBefore)}`
  ));
  const draftLines = preview.draftSummaries.slice(0, 8).map(item => (
    `${item.deliveryNo} · ${item.orderLabel} · ${normalizeCalculatedNumber(item.quantity)}`
  ));
  const moreDrafts = preview.draftSummaries.length > draftLines.length
    ? `\n另有 ${preview.draftSummaries.length - draftLines.length} 条明细未展示`
    : "";
  const unlinkedLine = preview.unlinkedQuantity > 0
    ? `\n未关联订单数量：${normalizeCalculatedNumber(preview.unlinkedQuantity)}`
    : "";

  return [
    `将生成 ${preview.deliveryNos.length} 张送货单，共 ${preview.draftSummaries.length} 条明细。`,
    `送货数量合计：${normalizeCalculatedNumber(preview.totalQuantity)}${unlinkedLine}`,
    orderLines.length ? `\n关联订单预览：\n${orderLines.join("\n")}` : "",
    draftLines.length ? `\n草稿明细：\n${draftLines.join("\n")}${moreDrafts}` : "",
    "\n确认无误后，送货单会进入“送货单”页面，默认状态为“未送”。",
  ].filter(Boolean).join("\n");
}

function formatOverDeliveryMessage(issues) {
  const lines = issues.slice(0, 8).map(issue => (
    `${issue.orderLabel}：已送 ${normalizeCalculatedNumber(issue.deliveredQuantity)} / 订单 ${normalizeCalculatedNumber(issue.orderQuantity)}，超出 ${normalizeCalculatedNumber(issue.overQuantity)}`
  ));
  const more = issues.length > lines.length ? `\n另有 ${issues.length - lines.length} 条订单超量。` : "";
  return `以下订单送货数量超过订单数量，不能生效：\n${lines.join("\n")}${more}`;
}

function deliveryOrderField(field) {
  return `${deliveryOrderFieldPrefix}${field}`;
}

function getOrderColumnsForDelivery(customer, selectedOrders) {
  const columns = getCustomerTableColumns(customer, "orders");
  const fields = new Set(columns.map(column => column.field));
  const withKnownData = [...columns];

  for (const column of knownOrderDataColumns) {
    if (fields.has(column.field)) continue;
    if (!selectedOrders.some(order => hasFilledValue(order, column.field))) continue;
    fields.add(column.field);
    withKnownData.push(column);
  }

  return withKnownData.filter(column => (
    column.field !== "status"
    && column.field !== orderDeliveredQuantityField
  ));
}

function getDeliveryQuantityOptions(orderColumns, selectedOrders) {
  return orderColumns
    .filter(column => (
      column.type === "number"
      || column.headerName?.includes("数量")
      || selectedOrders.some(order => isNumericLike(order[column.field]))
    ))
    .map(column => ({
      value: column.field,
      label: column.headerName || column.field,
    }));
}

function preferredQuantityField(options) {
  return (
    options.find(option => option.value === orderRemainingQuantityField)?.value
    || options.find(option => option.value === "quantity")?.value
    || options.find(option => option.label.includes("数量"))?.value
    || options[0]?.value
    || ""
  );
}

function insertColumnsAfterField(columns, additions, afterField) {
  const existingFields = new Set(columns.map(column => column.field));
  const columnsToAdd = additions.filter(column => !existingFields.has(column.field));
  if (!columnsToAdd.length) return columns;

  const next = [...columns];
  const afterIndex = next.findIndex(column => column.field === afterField);
  const insertIndex = afterIndex === -1 ? next.length : afterIndex + 1;
  next.splice(insertIndex, 0, ...columnsToAdd);
  return next;
}

function completeColumnOrder(savedOrder, columns) {
  const validFields = new Set(columns.map(column => column.field));
  const next = (savedOrder || []).filter(field => validFields.has(field));

  for (const column of columns) {
    if (!next.includes(column.field)) next.push(column.field);
  }

  return next;
}

function insertFieldsAfter(order, fields, afterField) {
  const fieldsToInsert = fields.filter(Boolean);
  if (!fieldsToInsert.length) return order;

  const fieldSet = new Set(fieldsToInsert);
  const next = order.filter(field => !fieldSet.has(field));
  const afterIndex = next.indexOf(afterField);
  const insertIndex = afterIndex === -1 ? next.length : afterIndex + 1;
  next.splice(insertIndex, 0, ...fieldsToInsert);
  return next;
}

function ensureOrderDeliveryTrackingColumns(customColumns = {}, selectedOrders = []) {
  const defaultFields = new Set(tableConfigs.orders.defaultColumns.map(column => column.field));
  const orderColumns = customColumns.orders || [];
  const existingFields = new Set([
    ...defaultFields,
    ...orderColumns.map(column => column.field),
  ]);
  const quantityColumn = knownOrderDataColumns.find(column => column.field === "quantity");
  const nextOrderColumns = insertColumnsAfterField(
    orderColumns,
    !existingFields.has("quantity")
      && quantityColumn
      && selectedOrders.some(order => hasFilledValue(order, "quantity"))
      ? [quantityColumn]
      : [],
    null,
  );
  const withTrackingColumns = insertColumnsAfterField(
    nextOrderColumns,
    orderDeliveryTrackingColumns,
    "quantity",
  );
  const visibleOrderColumns = [
    ...tableConfigs.orders.defaultColumns,
    ...withTrackingColumns.filter(column => !defaultFields.has(column.field)),
  ];
  const order = insertFieldsAfter(
    completeColumnOrder(customColumns.columnOrder?.orders, visibleOrderColumns),
    orderDeliveryTrackingColumns.map(column => column.field),
    "quantity",
  );

  return {
    ...customColumns,
    orders: withTrackingColumns,
    columnOrder: {
      ...(customColumns.columnOrder || {}),
      orders: order,
    },
  };
}

function ensureProductionScheduleColumns(customColumns = {}) {
  const defaultFields = new Set(tableConfigs.orders.defaultColumns.map(column => column.field));
  const orderColumns = customColumns.orders || [];
  const existingFields = new Set([
    ...defaultFields,
    ...orderColumns.map(column => column.field),
  ]);
  const columnsToAdd = productionScheduleColumns.filter(column => !existingFields.has(column.field));
  if (!columnsToAdd.length) return customColumns;

  const withScheduleColumns = insertColumnsAfterField(
    orderColumns,
    columnsToAdd,
    "dueDate",
  );
  const visibleOrderColumns = [
    ...tableConfigs.orders.defaultColumns,
    ...withScheduleColumns.filter(column => !defaultFields.has(column.field)),
  ];
  const order = insertFieldsAfter(
    completeColumnOrder(customColumns.columnOrder?.orders, visibleOrderColumns),
    productionScheduleColumns.map(column => column.field),
    "dueDate",
  );

  return {
    ...customColumns,
    orders: withScheduleColumns,
    columnOrder: {
      ...(customColumns.columnOrder || {}),
      orders: order,
    },
  };
}

function ensureDeliveryColumns(customColumns = {}, orderColumns = []) {
  const defaultFields = new Set(tableConfigs.deliveries.defaultColumns.map(column => column.field));
  const deliveryColumnsFromOrders = orderColumns.map(column => ({
    field: deliveryOrderField(column.field),
    headerName: column.headerName,
    width: column.width || 140,
    flex: column.flex,
    minWidth: column.minWidth,
    type: column.type,
    options: column.options,
  }));
  const nextDeliveryColumns = [
    ...(customColumns.deliveries || []),
    ...[...deliveryColumnsFromOrders, deliveryQuantityColumn].filter(column => (
      !defaultFields.has(column.field)
      && !(customColumns.deliveries || []).some(existing => existing.field === column.field)
    )),
  ];
  const visibleDeliveryColumns = [
    ...tableConfigs.deliveries.defaultColumns,
    ...nextDeliveryColumns.filter(column => !defaultFields.has(column.field)),
  ];

  return {
    ...customColumns,
    deliveries: nextDeliveryColumns,
    columnOrder: {
      ...(customColumns.columnOrder || {}),
      deliveries: completeColumnOrder(customColumns.columnOrder?.deliveries, visibleDeliveryColumns),
    },
  };
}

function nextDeliveryNo(deliveries = []) {
  const dateCode = today().replace(/-/g, "");
  const existing = new Set(deliveries.map(delivery => delivery.deliveryNo).filter(Boolean));
  let counter = deliveries.length + 1;
  let deliveryNo = "";

  do {
    deliveryNo = `DN-${dateCode}-${String(counter).padStart(3, "0")}`;
    counter += 1;
  } while (existing.has(deliveryNo));

  return deliveryNo;
}

function makeDeliveryRowsFromOrders(selectedOrders, orderColumns, quantitySourceField, deliveryNo) {
  const date = today();

  return selectedOrders.map(order => {
    const deliveryRow = {
      ...tableConfigs.deliveries.emptyRow,
      id: makeId("deliveries"),
      deliveryNo,
      date,
      orderNo: order.orderNo || "",
      status: "未送",
      [finalDeliveryField]: false,
      [linkedOrderIdField]: order.id,
      [linkedOrderQuantitySourceField]: quantitySourceField,
      [deliveryQuantityField]: parseNumericValue(order[quantitySourceField]),
    };

    for (const column of orderColumns) {
      deliveryRow[deliveryOrderField(column.field)] = order[column.field] ?? "";
    }

    return deliveryRow;
  });
}

function applyDeliveryQuantitiesToOrders(orders = [], deliveries = []) {
  const deliveredByOrderId = new Map();

  for (const delivery of deliveries) {
    if (!isEffectiveDelivery(delivery)) continue;
    const orderId = delivery[linkedOrderIdField];
    if (!orderId) continue;
    deliveredByOrderId.set(
      orderId,
      (deliveredByOrderId.get(orderId) || 0) + parseNumericValue(delivery[deliveryQuantityField]),
    );
  }

  return orders.map(order => {
    const shouldTrack = deliveredByOrderId.has(order.id)
      || orderDeliveredQuantityField in order
      || orderRemainingQuantityField in order;
    if (!shouldTrack) return order;

    const hasEffectiveDelivery = deliveredByOrderId.has(order.id);
    const deliveredQuantity = deliveredByOrderId.get(order.id) || 0;
    const remainingQuantity = Math.max(parseNumericValue(order.quantity) - deliveredQuantity, 0);
    const nextStatus = hasEffectiveDelivery
      ? "已送货"
      : normalizeOrderStatus(order.status) === "已送货"
        ? "已完成"
        : order.status;
    if (
      parseNumericValue(order[orderDeliveredQuantityField]) === deliveredQuantity
      && parseNumericValue(order[orderRemainingQuantityField]) === remainingQuantity
      && order.status === nextStatus
    ) {
      return order;
    }

    return {
      ...order,
      status: nextStatus,
      [orderDeliveredQuantityField]: deliveredQuantity,
      [orderRemainingQuantityField]: remainingQuantity,
    };
  });
}

function useDialogController() {
  const [dialog, setDialog] = useState(null);
  const resolverRef = useRef(null);

  const openDialog = useCallback((config) => new Promise((resolve) => {
    resolverRef.current = resolve;
    setDialog(config);
  }), []);

  const resolveDialog = useCallback((value) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setDialog(null);
    resolve?.(value);
  }, []);

  const showAlert = useCallback((message, options = {}) => (
    openDialog({
      type: "alert",
      title: options.title || "提示",
      message,
      tone: options.tone,
    }).then(() => true)
  ), [openDialog]);

  const showConfirm = useCallback((message, options = {}) => (
    openDialog({
      type: "confirm",
      title: options.title || "确认操作",
      message,
      tone: options.tone,
    })
  ), [openDialog]);

  const showPrompt = useCallback((message, options = {}) => (
    openDialog({
      type: "prompt",
      title: options.title || "输入内容",
      message,
      defaultValue: options.defaultValue || "",
      placeholder: options.placeholder || "",
      tone: options.tone,
    })
  ), [openDialog]);

  const showSelect = useCallback((message, options = {}) => (
    openDialog({
      type: "select",
      title: options.title || "选择内容",
      message,
      options: options.options || [],
      defaultValue: options.defaultValue || options.options?.[0]?.value || "",
      tone: options.tone,
    })
  ), [openDialog]);

  return useMemo(() => ({
    dialog,
    alert: showAlert,
    confirm: showConfirm,
    prompt: showPrompt,
    select: showSelect,
    resolve: resolveDialog,
  }), [dialog, resolveDialog, showAlert, showConfirm, showPrompt, showSelect]);
}

function AppDialog({ dialog, onResolve }) {
  const [inputValue, setInputValue] = useState("");

  useEffect(() => {
    if (dialog?.type === "prompt" || dialog?.type === "select") {
      setInputValue(dialog.defaultValue || "");
    }
  }, [dialog]);

  useEffect(() => {
    if (!dialog) return undefined;

    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onResolve(dialog.type === "prompt" ? null : false);
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [dialog, onResolve]);

  if (!dialog) return null;

  const isPrompt = dialog.type === "prompt";
  const isSelect = dialog.type === "select";
  const isConfirm = dialog.type === "confirm";
  const cancelValue = isPrompt || isSelect ? null : false;
  const confirmValue = isPrompt || isSelect ? inputValue : true;

  const titleId = "app-dialog-title";

  return (
    <div className="app-dialog-backdrop" role="presentation">
      <form
        aria-labelledby={titleId}
        aria-modal="true"
        className={`app-dialog-card ${dialog.tone === "danger" ? "is-danger" : ""}`}
        role="dialog"
        onSubmit={(event) => {
          event.preventDefault();
          onResolve(confirmValue);
        }}
      >
        <div className="app-dialog-head">
          <span id={titleId}>{dialog.title}</span>
        </div>
        <p className="app-dialog-message">{dialog.message}</p>
        {isPrompt && (
          <input
            autoFocus
            className="app-dialog-input"
            value={inputValue}
            placeholder={dialog.placeholder}
            onChange={(event) => setInputValue(event.target.value)}
          />
        )}
        {isSelect && (
          <select
            autoFocus
            className="app-dialog-input"
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
          >
            {(dialog.options || []).map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        )}
        <div className="app-dialog-actions">
          {(isPrompt || isSelect || isConfirm) && (
            <button type="button" className="secondary-button compact" onClick={() => onResolve(cancelValue)}>
              取消
            </button>
          )}
          <button
            autoFocus={!isPrompt && !isSelect}
            type="submit"
            className={`primary-action compact ${dialog.tone === "danger" ? "danger-confirm" : ""}`}
            disabled={isSelect && !inputValue}
          >
            {isConfirm ? "确认" : "确定"}
          </button>
        </div>
      </form>
    </div>
  );
}

function App() {
  const dialogs = useDialogController();
  const [customers, setCustomers] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTable, setActiveTable] = useState("orders");
  const [searchText, setSearchText] = useState("");
  const [viewMode, setViewMode] = useState("grid");
  const [quickFilter, setQuickFilter] = useState("");
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");
  const [showGlobalSearchResults, setShowGlobalSearchResults] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showColumnModal, setShowColumnModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const backupInputRef = useRef();
  const [printDelivery, setPrintDelivery] = useState(null);
  const [productionScheduleOrders, setProductionScheduleOrders] = useState([]);
  const [showSettings, setShowSettings] = useState(false);
  const [systemSettings, setSystemSettings] = useState(() => {
    try { return JSON.parse(localStorage.getItem("foam-crm-settings") || "{}"); } catch { return {}; }
  });
  const customersRef = useRef(customers);
  const selectedCustomerIdRef = useRef(selectedCustomerId);
  const activeTableRef = useRef(activeTable);
  const lastTableByCustomerRef = useRef({});
  const undoStackRef = useRef([]);
  const undoingRef = useRef(false);
  const rowSaveQueueRef = useRef(new Map());
  const rowSaveRevisionRef = useRef(new Map());
  const fullDataSyncRevisionRef = useRef(0);

  useEffect(() => {
    customersRef.current = customers;
  }, [customers]);

  useEffect(() => {
    selectedCustomerIdRef.current = selectedCustomerId;
  }, [selectedCustomerId]);

  useEffect(() => {
    activeTableRef.current = activeTable;
  }, [activeTable]);

  const takeUndoSnapshot = useCallback(() => ({
    customers: cloneData(customersRef.current),
    selectedCustomerId: selectedCustomerIdRef.current,
    activeTable: activeTableRef.current,
  }), []);

  const pushUndoSnapshot = useCallback((snapshot = takeUndoSnapshot()) => {
    if (loading || undoingRef.current) return;
    undoStackRef.current = [...undoStackRef.current, snapshot].slice(-MAX_UNDO_STEPS);
  }, [loading, takeUndoSnapshot]);

  const saveRowsQueued = useCallback((customerId, tableKey, rows) => {
    const key = `${customerId}:${tableKey}`;
    const previous = rowSaveQueueRef.current.get(key) || Promise.resolve();
    const next = previous
      .catch(() => {})
      .then(() => api.setRows(customerId, tableKey, rows));

    const queued = next.finally(() => {
      if (rowSaveQueueRef.current.get(key) === queued) {
        rowSaveQueueRef.current.delete(key);
      }
    });

    rowSaveQueueRef.current.set(key, queued);

    return next;
  }, []);

  const nextRowSaveRevision = useCallback((customerId, tableKey) => {
    const key = `${customerId}:${tableKey}`;
    const revision = (rowSaveRevisionRef.current.get(key) || 0) + 1;
    rowSaveRevisionRef.current.set(key, revision);
    return revision;
  }, []);

  const isLatestRowSaveRevision = useCallback((customerId, tableKey, revision) => (
    rowSaveRevisionRef.current.get(`${customerId}:${tableKey}`) === revision
  ), []);

  const invalidateRowSaveRevisions = useCallback(() => {
    rowSaveRevisionRef.current = new Map(
      Array.from(rowSaveRevisionRef.current.entries(), ([key, revision]) => [key, revision + 1]),
    );
  }, []);

  const syncCustomersInBackground = useCallback((customersToSync) => {
    const revision = fullDataSyncRevisionRef.current + 1;
    fullDataSyncRevisionRef.current = revision;

    const run = async () => {
      const pendingRowSaves = Array.from(rowSaveQueueRef.current.values());
      if (pendingRowSaves.length) {
        await Promise.allSettled(pendingRowSaves);
      }
      if (fullDataSyncRevisionRef.current !== revision) return;

      try {
        await api.replaceAll(customersToSync);
      } catch (err) {
        if (fullDataSyncRevisionRef.current === revision) {
          void dialogs.alert(`撤销已在界面完成，但同步数据库失败：${err.message}`, { title: "同步失败" });
        }
      }
    };

    run();
  }, [dialogs.alert]);

  const restoreLastUndoSnapshot = useCallback(() => {
    if (undoingRef.current || !undoStackRef.current.length) return;

    const snapshot = undoStackRef.current[undoStackRef.current.length - 1];
    const snapshotCustomers = ensureUniqueCustomerRowIds(snapshot.customers);
    undoStackRef.current = undoStackRef.current.slice(0, -1);
    undoingRef.current = true;
    invalidateRowSaveRevisions();

    customersRef.current = snapshotCustomers;
    selectedCustomerIdRef.current = snapshot.selectedCustomerId;
    activeTableRef.current = snapshot.activeTable;
    setCustomers(snapshotCustomers);
    setSelectedCustomerId(snapshot.selectedCustomerId);
    setActiveTable(snapshot.activeTable);
    undoingRef.current = false;
    syncCustomersInBackground(snapshotCustomers);
  }, [invalidateRowSaveRevisions, syncCustomersInBackground]);

  useEffect(() => {
    const handleUndoKeyDown = (event) => {
      const key = event.key?.toLowerCase();
      const isUndo = (event.ctrlKey || event.metaKey) && key === "z" && !event.shiftKey;
      if (!isUndo) return;

      const target = event.target;
      const isTextInput = target?.matches?.("input, textarea, [contenteditable='true']");
      const isGridEditor = Boolean(target?.closest?.(".ag-root"));
      if (isTextInput && !isGridEditor) return;

      const filterUndoEvent = new CustomEvent("crm:undo-filter", { cancelable: true });
      window.dispatchEvent(filterUndoEvent);
      if (filterUndoEvent.defaultPrevented) {
        event.preventDefault();
        return;
      }

      event.preventDefault();
      restoreLastUndoSnapshot();
    };

    window.addEventListener("keydown", handleUndoKeyDown, true);
    return () => window.removeEventListener("keydown", handleUndoKeyDown, true);
  }, [restoreLastUndoSnapshot]);

  useEffect(() => {
    api.getCustomers()
      .then(data => {
        const normalizedData = normalizeCustomerOrderStatuses(data);
        setCustomers(normalizedData);
        if (normalizedData.length) setSelectedCustomerId(normalizedData[0].id);
      })
      .catch(err => dialogs.alert(`加载失败：${err.message}`, { title: "加载失败" }))
      .finally(() => setLoading(false));
  }, [dialogs.alert]);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === selectedCustomerId),
    [customers, selectedCustomerId],
  );

  useEffect(() => {
    if (!selectedCustomer && customers[0]) {
      setSelectedCustomerId(customers[0].id);
    }
  }, [customers, selectedCustomer]);

  const filteredCustomers = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    if (!keyword) return customers;
    return customers.filter((customer) =>
      [customer.name, customer.contact, customer.phone, customer.level]
        .filter(Boolean)
        .some((text) => text.toLowerCase().includes(keyword)),
    );
  }, [customers, searchText]);

  const alertMap = useMemo(() => {
    const map = {};
    const todayTs = new Date().setHours(0, 0, 0, 0);
    const warnTs = todayTs + 3 * 86_400_000;
    for (const customer of customers) {
      let severity = null;
      for (const order of customer.orders || []) {
        if (!isOpenOrder(order.status) || !order.dueDate) continue;
        const dueTs = new Date(order.dueDate).setHours(0, 0, 0, 0);
        if (dueTs < todayTs) { severity = "danger"; break; }
        if (dueTs <= warnTs && severity !== "danger") severity = "warning";
      }
      if (severity) map[customer.id] = severity;
    }
    return map;
  }, [customers]);

  const metrics = useMemo(() => {
    const allOrders = customers.flatMap((customer) => customer.orders || []);
    const allDeliveries = customers.flatMap((customer) => customer.deliveries || []).filter(isFinalDelivery);
    const activeOrders = allOrders.filter((order) => isOpenOrder(order.status));
    const amount = allOrders.reduce((sum, order) => sum + Number(order.amount || 0), 0);
    return [
      {
        label: "客户总数",
        value: customers.length,
        detail: "按客户独立维护表头",
      },
      {
        label: "进行中订单",
        value: activeOrders.length,
        detail: "未完成订单跟进",
      },
      {
        label: "订单金额",
        value: formatCurrency(amount),
        detail: "本地录入订单汇总",
      },
      {
        label: "送货单",
        value: allDeliveries.length,
        detail: "签收与回单状态",
      },
    ];
  }, [customers]);

  // 全局搜索：搜索订单号、产品名、送货单号、客户名
  const globalSearchResults = useMemo(() => {
    const q = globalSearchQuery.trim().toLowerCase();
    if (!q || q.length < 2) return [];
    const results = [];
    for (const customer of customers) {
      if (customer.name.toLowerCase().includes(q) || customer.contact?.toLowerCase().includes(q)) {
        results.push({ type: "customer", customerId: customer.id, customerName: customer.name, label: `客户 · ${customer.name}`, detail: customer.contact || "" });
      }
      for (const order of customer.orders || []) {
        if ((order.orderNo || "").toLowerCase().includes(q) || (order.product || "").toLowerCase().includes(q)) {
          results.push({ type: "order", customerId: customer.id, customerName: customer.name, label: `订单 · ${order.orderNo || order.product}`, detail: `${order.product || ""} · ${order.status || ""}`, orderId: order.id });
        }
      }
      for (const delivery of customer.deliveries || []) {
        if ((delivery.deliveryNo || "").toLowerCase().includes(q)) {
          results.push({ type: "delivery", customerId: customer.id, customerName: customer.name, label: `送货单 · ${delivery.deliveryNo}`, detail: delivery.status || "", deliveryId: delivery.id });
        }
      }
    }
    return results.slice(0, 20);
  }, [customers, globalSearchQuery]);

  const navigateToSearchResult = useCallback((result) => {
    // 保存当前客户的上下文
    if (selectedCustomerId) {
      lastTableByCustomerRef.current[selectedCustomerId] = activeTable;
    }
    // 恢复目标客户的上下文
    const lastTable = lastTableByCustomerRef.current[result.customerId];
    setSelectedCustomerId(result.customerId);
    if (lastTable) setActiveTable(lastTable);
    if (result.type === "delivery") setActiveTable("finalDeliveries");
    else if (result.type === "order") setActiveTable("orders");
    setGlobalSearchQuery("");
    setShowGlobalSearchResults(false);
  }, [activeTable, selectedCustomerId]);

  const updateSelectedCustomer = (updater) => {
    setCustomers((current) =>
      current.map((customer) =>
        customer.id === selectedCustomerId ? updater(customer) : customer,
      ),
    );
  };

  const handleRowsChange = async (tableKey, rows, options = {}) => {
    const currentCustomer = customersRef.current.find(customer => customer.id === selectedCustomerId) || selectedCustomer;
    const calculatedRows = applyCustomerTableFormulas(
      currentCustomer,
      tableKey,
      rows,
      currentCustomer?.customColumns,
      options.formulaRowIds,
    );
    let safeRows = ensureUniqueRowIds(calculatedRows, tableKey, customersRef.current, selectedCustomerId);
    if (tableKey === "deliveries") {
      safeRows = normalizeDeliveryRows(safeRows);
    }
    if (tableKey === "deliveries") {
      const currentOrders = currentCustomer?.orders || [];
      const overDeliveryIssues = findEffectiveDeliveryOverages(currentOrders, safeRows);
      if (overDeliveryIssues.length) {
        updateSelectedCustomer(c => ({
          ...c,
          deliveries: normalizeDeliveryRows(currentCustomer?.deliveries || []),
        }));
        await dialogs.alert(formatOverDeliveryMessage(overDeliveryIssues), { title: "送货数量超出订单数量", tone: "danger" });
        return;
      }

      const nextOrders = applyCustomerTableFormulas(
        currentCustomer,
        "orders",
        applyDeliveryQuantitiesToOrders(currentOrders, safeRows),
      );
      const ordersChanged = nextOrders.some((row, index) => row !== currentOrders[index]);

      updateSelectedCustomer(c => ({
        ...c,
        deliveries: safeRows,
        ...(ordersChanged ? { orders: nextOrders } : {}),
      }));

      const deliveryRevision = nextRowSaveRevision(selectedCustomerId, "deliveries");
      const orderRevision = ordersChanged ? nextRowSaveRevision(selectedCustomerId, "orders") : null;
      try {
        const [deliveryResult, orderResult] = await Promise.all([
          saveRowsQueued(selectedCustomerId, "deliveries", safeRows),
          ordersChanged
            ? saveRowsQueued(selectedCustomerId, "orders", nextOrders)
            : Promise.resolve(null),
        ]);
        if (deliveryResult?.rows && isLatestRowSaveRevision(selectedCustomerId, "deliveries", deliveryRevision)) {
          updateSelectedCustomer(c => ({ ...c, deliveries: deliveryResult.rows }));
        }
        if (orderResult?.rows && isLatestRowSaveRevision(selectedCustomerId, "orders", orderRevision)) {
          updateSelectedCustomer(c => ({ ...c, orders: orderResult.rows }));
        }
      } catch (err) {
        await dialogs.alert(`保存失败：${err.message}`, { title: "保存失败" });
      }
      return;
    }

    updateSelectedCustomer(c => ({ ...c, [tableKey]: safeRows }));
    const revision = nextRowSaveRevision(selectedCustomerId, tableKey);
    try {
      const result = await saveRowsQueued(selectedCustomerId, tableKey, safeRows);
      if (result?.rows && isLatestRowSaveRevision(selectedCustomerId, tableKey, revision)) {
        updateSelectedCustomer(c => ({ ...c, [tableKey]: result.rows }));
      }
    } catch (err) {
      await dialogs.alert(`保存失败：${err.message}`, { title: "保存失败" });
    }
  };

  const addRow = async (tableKey) => {
    pushUndoSnapshot();
    const config = tableConfigs[tableKey];
    const currentCustomer = customersRef.current.find(customer => customer.id === selectedCustomerId) || selectedCustomer;

    // 订单号自动生成
    const generatedOrderNo = tableKey === "orders" && systemSettings.orderNoPrefix
      ? `${systemSettings.orderNoPrefix}${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String((currentCustomer?.orders?.length || 0) + 1).padStart(3, "0")}`
      : "";

    // 默认交期 = 今天 + 默认天数
    const defaultDueDate = tableKey === "orders" && systemSettings.defaultDueDays
      ? new Date(Date.now() + Number(systemSettings.defaultDueDays) * 86400000).toISOString().slice(0, 10)
      : "";

    const newRow = {
      id: makeId(tableKey),
      ...config.emptyRow,
      date: tableKey === "orders" ? today() : "",
      orderNo: generatedOrderNo || "",
      dueDate: defaultDueDate || "",
      status: tableKey === "orders" ? "未完成" : config.emptyRow.status || "",
    };
    let newRows = ensureUniqueRowIds(
      applyCustomerTableFormulas(
        currentCustomer,
        tableKey,
        [newRow, ...(currentCustomer?.[tableKey] || [])],
        currentCustomer?.customColumns,
        [newRow.id],
      ),
      tableKey,
      customersRef.current,
      selectedCustomerId,
    );
    if (tableKey === "deliveries") {
      newRows = normalizeDeliveryRows(newRows);
    }
    updateSelectedCustomer(c => ({ ...c, [tableKey]: newRows }));
    const revision = nextRowSaveRevision(selectedCustomerId, tableKey);
    try {
      const result = await saveRowsQueued(selectedCustomerId, tableKey, newRows);
      if (result?.rows && isLatestRowSaveRevision(selectedCustomerId, tableKey, revision)) {
        updateSelectedCustomer(c => ({ ...c, [tableKey]: result.rows }));
      }
    } catch (err) {
      await dialogs.alert(`保存失败：${err.message}`, { title: "保存失败" });
    }
  };

  const deleteRows = async (tableKey, ids) => {
    pushUndoSnapshot();
    const currentCustomer = customersRef.current.find(customer => customer.id === selectedCustomerId) || selectedCustomer;
    let nextRows = ensureUniqueRowIds(
      (currentCustomer?.[tableKey] || []).filter(r => !ids.includes(r.id)),
      tableKey,
      customersRef.current,
      selectedCustomerId,
    );
    if (tableKey === "deliveries") {
      nextRows = normalizeDeliveryRows(nextRows);
    }
    if (tableKey === "deliveries") {
      const currentOrders = currentCustomer?.orders || [];
      const nextOrders = applyCustomerTableFormulas(
        currentCustomer,
        "orders",
        applyDeliveryQuantitiesToOrders(currentOrders, nextRows),
      );
      const ordersChanged = nextOrders.some((row, index) => row !== currentOrders[index]);

      updateSelectedCustomer(c => ({
        ...c,
        deliveries: nextRows,
        ...(ordersChanged ? { orders: nextOrders } : {}),
      }));

      const deliveryRevision = nextRowSaveRevision(selectedCustomerId, "deliveries");
      const orderRevision = ordersChanged ? nextRowSaveRevision(selectedCustomerId, "orders") : null;
      try {
        const [deliveryResult, orderResult] = await Promise.all([
          saveRowsQueued(selectedCustomerId, "deliveries", nextRows),
          ordersChanged
            ? saveRowsQueued(selectedCustomerId, "orders", nextOrders)
            : Promise.resolve(null),
        ]);
        if (deliveryResult?.rows && isLatestRowSaveRevision(selectedCustomerId, "deliveries", deliveryRevision)) {
          updateSelectedCustomer(c => ({ ...c, deliveries: deliveryResult.rows }));
        }
        if (orderResult?.rows && isLatestRowSaveRevision(selectedCustomerId, "orders", orderRevision)) {
          updateSelectedCustomer(c => ({ ...c, orders: orderResult.rows }));
        }
      } catch (err) {
        await dialogs.alert(`删除失败：${err.message}`, { title: "删除失败" });
      }
      return;
    }

    updateSelectedCustomer(c => ({
      ...c,
      [tableKey]: nextRows,
    }));
    const revision = nextRowSaveRevision(selectedCustomerId, tableKey);
    try {
      const result = await saveRowsQueued(selectedCustomerId, tableKey, nextRows);
      if (result?.rows && isLatestRowSaveRevision(selectedCustomerId, tableKey, revision)) {
        updateSelectedCustomer(c => ({ ...c, [tableKey]: result.rows }));
      }
    } catch (err) {
      await dialogs.alert(`删除失败：${err.message}`, { title: "删除失败" });
    }
  };

  const addCustomColumn = async (tableKey, column) => {
    pushUndoSnapshot();
    const currentCustomer = customersRef.current.find(customer => customer.id === selectedCustomerId) || selectedCustomer;
    const normalizedColumn = {
      ...column,
      type: normalizeFormulaInput(column.formula) ? "number" : column.type,
      formula: normalizeFormulaInput(column.formula) || undefined,
    };
    const newCustomColumns = {
      ...currentCustomer.customColumns,
      [tableKey]: [...(currentCustomer.customColumns?.[tableKey] || []), normalizedColumn],
    };
    const nextRows = applyCustomerTableFormulas(
      { ...currentCustomer, customColumns: newCustomColumns },
      tableKey,
      currentCustomer[tableKey] || [],
      newCustomColumns,
    );
    updateSelectedCustomer(c => ({ ...c, [tableKey]: nextRows, customColumns: newCustomColumns }));
    const revision = nextRows !== (currentCustomer[tableKey] || [])
      ? nextRowSaveRevision(selectedCustomerId, tableKey)
      : null;
    try {
      const [, rowsResult] = await Promise.all([
        api.updateCustomer(selectedCustomerId, { ...currentCustomer, customColumns: newCustomColumns }),
        revision
          ? saveRowsQueued(selectedCustomerId, tableKey, nextRows)
          : Promise.resolve(null),
      ]);
      if (rowsResult?.rows && isLatestRowSaveRevision(selectedCustomerId, tableKey, revision)) {
        updateSelectedCustomer(c => ({ ...c, [tableKey]: rowsResult.rows }));
      }
    } catch (err) {
      await dialogs.alert(`保存失败：${err.message}`, { title: "保存失败" });
    }
  };

  const updateCustomColumn = async (tableKey, field, patch) => {
    const currentCustomer = customersRef.current.find(customer => customer.id === selectedCustomerId) || selectedCustomer;
    const existingColumns = currentCustomer.customColumns?.[tableKey] || [];
    if (!existingColumns.some(column => column.field === field)) return;

    pushUndoSnapshot();
    const newCustomColumns = {
      ...currentCustomer.customColumns,
      [tableKey]: existingColumns.map(column => {
        if (column.field !== field) return column;
        const next = { ...column, ...patch };
        const formula = normalizeFormulaInput(next.formula);
        if (!formula) {
          delete next.formula;
          return next;
        }
        return { ...next, formula, type: "number" };
      }),
    };
    const nextRows = applyCustomerTableFormulas(
      { ...currentCustomer, customColumns: newCustomColumns },
      tableKey,
      currentCustomer[tableKey] || [],
      newCustomColumns,
    );

    updateSelectedCustomer(c => ({ ...c, [tableKey]: nextRows, customColumns: newCustomColumns }));
    const revision = nextRowSaveRevision(selectedCustomerId, tableKey);
    try {
      const [, rowsResult] = await Promise.all([
        api.updateCustomer(selectedCustomerId, { ...currentCustomer, customColumns: newCustomColumns }),
        saveRowsQueued(selectedCustomerId, tableKey, nextRows),
      ]);
      if (rowsResult?.rows && isLatestRowSaveRevision(selectedCustomerId, tableKey, revision)) {
        updateSelectedCustomer(c => ({ ...c, [tableKey]: rowsResult.rows }));
      }
    } catch (err) {
      await dialogs.alert(`保存失败：${err.message}`, { title: "保存失败" });
    }
  };

  const removeCustomColumns = async (tableKey, fields) => {
    const fieldsToRemove = new Set(fields);
    if (!fieldsToRemove.size) return;

    pushUndoSnapshot();
    const currentCustomer = customersRef.current.find(customer => customer.id === selectedCustomerId) || selectedCustomer;
    const cleanedRows = (currentCustomer[tableKey] || []).map(row => {
      let next = row;
      for (const field of fieldsToRemove) {
        if (!(field in next)) continue;
        if (next === row) next = { ...row };
        delete next[field];
      }
      return next;
    });
    const newCustomColumns = {
      ...currentCustomer.customColumns,
      [tableKey]: (currentCustomer.customColumns?.[tableKey] || []).filter(c => !fieldsToRemove.has(c.field)),
      columnOrder: {
        ...(currentCustomer.customColumns?.columnOrder || {}),
        [tableKey]: (currentCustomer.customColumns?.columnOrder?.[tableKey] || [])
          .filter(field => !fieldsToRemove.has(field)),
      },
    };
    let safeRows = ensureUniqueRowIds(
      applyCustomerTableFormulas({ ...currentCustomer, customColumns: newCustomColumns }, tableKey, cleanedRows, newCustomColumns),
      tableKey,
      customersRef.current,
      selectedCustomerId,
    );
    if (tableKey === "deliveries") {
      safeRows = normalizeDeliveryRows(safeRows);
    }
    updateSelectedCustomer(c => ({ ...c, [tableKey]: safeRows, customColumns: newCustomColumns }));
    const revision = nextRowSaveRevision(selectedCustomerId, tableKey);
    try {
      const [, rowsResult] = await Promise.all([
        api.updateCustomer(selectedCustomerId, { ...currentCustomer, customColumns: newCustomColumns }),
        saveRowsQueued(selectedCustomerId, tableKey, safeRows),
      ]);
      if (rowsResult?.rows && isLatestRowSaveRevision(selectedCustomerId, tableKey, revision)) {
        updateSelectedCustomer(c => ({ ...c, [tableKey]: rowsResult.rows }));
      }
    } catch (err) {
      await dialogs.alert(`保存失败：${err.message}`, { title: "保存失败" });
    }
  };

  const removeCustomColumn = async (tableKey, field) => {
    await removeCustomColumns(tableKey, [field]);
  };

  const upsertCustomer = async (customerInput) => {
    pushUndoSnapshot();
    if (customerInput.id) {
      setCustomers(current =>
        current.map(c => c.id === customerInput.id ? { ...c, ...customerInput } : c),
      );
      try {
        await api.updateCustomer(customerInput.id, customerInput);
      } catch (err) {
        await dialogs.alert(`保存失败：${err.message}`, { title: "保存失败" });
      }
      return;
    }
    const newCustomer = {
      id: makeId("cus"),
      name: customerInput.name,
      contact: customerInput.contact,
      phone: customerInput.phone,
      address: customerInput.address,
      level: customerInput.level,
      paymentTerm: customerInput.paymentTerm,
      taxNo: customerInput.taxNo,
      note: customerInput.note,
      customColumns: { products: [], orders: [], deliveries: [] },
      products: [],
      orders: [],
      deliveries: [],
    };
    setCustomers(current => [newCustomer, ...current]);
    setSelectedCustomerId(newCustomer.id);
    try {
      await api.createCustomer(newCustomer);
    } catch (err) {
      await dialogs.alert(`保存失败：${err.message}`, { title: "保存失败" });
    }
  };

  const handleOrderImport = async (rows, extraColumns = []) => {
    pushUndoSnapshot();
    const currentCustomer = customersRef.current.find(customer => customer.id === selectedCustomerId) || selectedCustomer;
    const existingColumns = currentCustomer.customColumns?.orders || [];
    const existingFields = new Set([
      ...tableConfigs.orders.defaultColumns.map(column => column.field),
      ...existingColumns.map(column => column.field),
    ]);
    const newExtraColumns = extraColumns.filter(column => !existingFields.has(column.field));
    const customColumns = {
      ...currentCustomer.customColumns,
      orders: [...existingColumns, ...newExtraColumns],
    };
    const rawRows = [
      ...(currentCustomer.orders || []),
      ...rows.map(row => ({
        ...tableConfigs.orders.emptyRow,
        id: makeId("orders"),
        ...row,
        status: normalizeOrderStatus(row.status || tableConfigs.orders.emptyRow.status),
      })),
    ];
    const importedRowIds = rawRows.slice(currentCustomer.orders?.length || 0).map(row => row.id);
    const newRows = ensureUniqueRowIds(
      applyCustomerTableFormulas({ ...currentCustomer, customColumns }, "orders", rawRows, customColumns, importedRowIds),
      "orders",
      customersRef.current,
      selectedCustomerId,
    );

    updateSelectedCustomer(c => ({ ...c, orders: newRows, customColumns }));
    const revision = nextRowSaveRevision(selectedCustomerId, "orders");
    try {
      const [, rowsResult] = await Promise.all([
        newExtraColumns.length
          ? api.updateCustomer(selectedCustomerId, { ...currentCustomer, customColumns })
          : Promise.resolve(),
        saveRowsQueued(selectedCustomerId, "orders", newRows),
      ]);
      if (rowsResult?.rows && isLatestRowSaveRevision(selectedCustomerId, "orders", revision)) {
        updateSelectedCustomer(c => ({ ...c, orders: rowsResult.rows }));
      }
    } catch (err) {
      await dialogs.alert(`保存失败：${err.message}`, { title: "保存失败" });
    }
  };

  const handleScheduleOrders = async (orderIds) => {
    if (!selectedCustomer || !orderIds?.length) return false;

    const currentCustomer = customersRef.current.find(customer => customer.id === selectedCustomerId) || selectedCustomer;
    const orderById = new Map((currentCustomer.orders || []).map(order => [order.id, order]));
    const selectedOrders = orderIds.map(id => orderById.get(id)).filter(Boolean);

    if (!selectedOrders.length) {
      await dialogs.alert("没有找到可排产的订单行。", { title: "排产" });
      return false;
    }

    const closedOrders = selectedOrders.filter(order => !isOpenOrder(order.status));
    if (closedOrders.length) {
      const orderNos = closedOrders
        .map(order => order.orderNo || order.product || order.id)
        .slice(0, 5)
        .join("、");
      await dialogs.alert(`已完成、已送货、已开对账单或已付款的订单不能再排产。\n请先处理：${orderNos}`, { title: "排产" });
      return false;
    }

    setProductionScheduleOrders(selectedOrders);
    return true;
  };

  const saveProductionSchedule = async (schedule) => {
    if (!selectedCustomer || !productionScheduleOrders.length) return;

    const currentCustomer = customersRef.current.find(customer => customer.id === selectedCustomerId) || selectedCustomer;
    const orderIds = new Set(productionScheduleOrders.map(order => order.id));
    const customColumns = ensureProductionScheduleColumns(currentCustomer.customColumns || {});
    const hasSharedQuantity = String(schedule.quantity || "").trim() !== "";
    const sharedQuantity = parseNumericValue(schedule.quantity);
    const nextStatus = productionScheduleStatusOptions.includes(schedule.status) ? schedule.status : "已排产";

    const rawRows = (currentCustomer.orders || []).map(order => {
      if (!orderIds.has(order.id)) return order;
      const quantity = hasSharedQuantity
        ? sharedQuantity
        : parseNumericValue(order[orderRemainingQuantityField] || order.quantity);
      return {
        ...order,
        status: nextStatus,
        [productionScheduleDateField]: schedule.date,
        [productionScheduleQuantityField]: quantity,
        [productionLineField]: schedule.line,
        [productionNoteField]: schedule.note,
      };
    });
    const nextRows = ensureUniqueRowIds(
      applyCustomerTableFormulas(
        { ...currentCustomer, customColumns },
        "orders",
        rawRows,
        customColumns,
        orderIds,
      ),
      "orders",
      customersRef.current,
      selectedCustomerId,
    );

    pushUndoSnapshot();
    updateSelectedCustomer(c => ({
      ...c,
      orders: nextRows,
      customColumns,
    }));
    setProductionScheduleOrders([]);
    setActiveTable(activeTableRef.current === "productionSchedule" ? "productionSchedule" : "orders");

    const revision = nextRowSaveRevision(selectedCustomerId, "orders");
    try {
      const [, rowsResult] = await Promise.all([
        api.updateCustomer(selectedCustomerId, { ...currentCustomer, customColumns }),
        saveRowsQueued(selectedCustomerId, "orders", nextRows),
      ]);
      if (rowsResult?.rows && isLatestRowSaveRevision(selectedCustomerId, "orders", revision)) {
        updateSelectedCustomer(c => ({ ...c, orders: rowsResult.rows }));
      }
    } catch (err) {
      await dialogs.alert(`排产保存失败：${err.message}`, { title: "排产" });
    }
  };

  const handleCreateDeliveryFromOrders = async (orderIds) => {
    if (!selectedCustomer || !orderIds?.length) return false;

    const currentCustomer = customersRef.current.find(customer => customer.id === selectedCustomerId) || selectedCustomer;
    const orderById = new Map((currentCustomer.orders || []).map(order => [order.id, order]));
    const selectedOrders = orderIds.map(id => orderById.get(id)).filter(Boolean);

    if (!selectedOrders.length) {
      await dialogs.alert("没有找到可生成送货单的订单行。", { title: "生成送货单" });
      return false;
    }
    const notCompletedOrders = selectedOrders.filter(order => normalizeOrderStatus(order.status) !== "已完成");
    if (notCompletedOrders.length) {
      const orderNos = notCompletedOrders
        .map(order => order.orderNo || order.product || order.id)
        .slice(0, 5)
        .join("、");
      await dialogs.alert(`只有进度为“已完成”的订单才能生成送货单。\n请先处理：${orderNos}`, { title: "生成送货单" });
      return false;
    }

    const orderColumns = getOrderColumnsForDelivery(currentCustomer, selectedOrders);
    const quantityOptions = getDeliveryQuantityOptions(orderColumns, selectedOrders);
    if (!quantityOptions.length) {
      await dialogs.alert("未找到可作为送货数量的订单表头，请先在订单里补充数量列。", { title: "生成送货单" });
      return false;
    }

    const quantitySourceField = await dialogs.select("选择订单表头作为本次送货数量。生成后可以在送货单草稿中继续修改送货数量。", {
      title: "生成送货单",
      options: quantityOptions,
      defaultValue: preferredQuantityField(quantityOptions),
    });
    if (!quantitySourceField) return false;

    const deliveryNo = nextDeliveryNo(currentCustomer.deliveries || []);
    const newDeliveryRows = makeDeliveryRowsFromOrders(
      selectedOrders,
      orderColumns,
      quantitySourceField,
      deliveryNo,
    );
    const customColumns = ensureDeliveryColumns(
      ensureOrderDeliveryTrackingColumns(currentCustomer.customColumns || {}, selectedOrders),
      orderColumns,
    );
    const nextDeliveries = normalizeDeliveryRows(ensureUniqueRowIds(
      applyCustomerTableFormulas(
        { ...currentCustomer, customColumns },
        "deliveries",
        [...newDeliveryRows, ...(currentCustomer.deliveries || [])],
        customColumns,
        newDeliveryRows.map(row => row.id),
      ),
      "deliveries",
      customersRef.current,
      selectedCustomerId,
    ));
    const nextOrders = applyCustomerTableFormulas(
      { ...currentCustomer, customColumns },
      "orders",
      applyDeliveryQuantitiesToOrders(currentCustomer.orders || [], nextDeliveries),
      customColumns,
    );

    pushUndoSnapshot();
    updateSelectedCustomer(c => ({
      ...c,
      deliveries: nextDeliveries,
      orders: nextOrders,
      customColumns,
    }));
    setActiveTable("deliveries");

    const deliveryRevision = nextRowSaveRevision(selectedCustomerId, "deliveries");
    const orderRevision = nextRowSaveRevision(selectedCustomerId, "orders");
    try {
      const [, deliveryResult, orderResult] = await Promise.all([
        api.updateCustomer(selectedCustomerId, { ...currentCustomer, customColumns }),
        saveRowsQueued(selectedCustomerId, "deliveries", nextDeliveries),
        saveRowsQueued(selectedCustomerId, "orders", nextOrders),
      ]);
      if (deliveryResult?.rows && isLatestRowSaveRevision(selectedCustomerId, "deliveries", deliveryRevision)) {
        updateSelectedCustomer(c => ({ ...c, deliveries: deliveryResult.rows }));
      }
      if (orderResult?.rows && isLatestRowSaveRevision(selectedCustomerId, "orders", orderRevision)) {
        updateSelectedCustomer(c => ({ ...c, orders: orderResult.rows }));
      }
      return true;
    } catch (err) {
      await dialogs.alert(`生成失败：${err.message}`, { title: "生成送货单" });
      return false;
    }
  };

  const handleFinalizeDeliveryDrafts = async (deliveryIds) => {
    if (!selectedCustomer || !deliveryIds?.length) return false;

    const currentCustomer = customersRef.current.find(customer => customer.id === selectedCustomerId) || selectedCustomer;
    const ids = new Set(deliveryIds);
    const selectedDrafts = (currentCustomer.deliveries || [])
      .filter(delivery => ids.has(delivery.id) && !isFinalDelivery(delivery));

    if (!selectedDrafts.length) {
      await dialogs.alert("没有找到可生成的送货单草稿。", { title: "生成送货单" });
      return false;
    }

    const preview = buildDeliveryFinalizePreview(currentCustomer, selectedDrafts);
    if (preview.overDelivered.length) {
      await dialogs.alert(formatOverDeliveryMessage(preview.overDelivered), { title: "送货数量超出订单数量", tone: "danger" });
      return false;
    }

    const confirmed = await dialogs.confirm(formatDeliveryFinalizeMessage(preview), { title: "确认生成送货单" });
    if (!confirmed) return false;

    const rawDeliveries = (currentCustomer.deliveries || []).map(delivery => (
      ids.has(delivery.id) && !isFinalDelivery(delivery)
        ? {
          ...delivery,
          [finalDeliveryField]: true,
          status: "未送",
        }
        : delivery
    ));
    const nextDeliveries = normalizeDeliveryRows(
      applyCustomerTableFormulas(currentCustomer, "deliveries", rawDeliveries, currentCustomer.customColumns, ids),
    );
    const nextOrders = applyCustomerTableFormulas(
      currentCustomer,
      "orders",
      applyDeliveryQuantitiesToOrders(currentCustomer.orders || [], nextDeliveries),
    );
    const ordersChanged = nextOrders.some((row, index) => row !== (currentCustomer.orders || [])[index]);

    pushUndoSnapshot();
    updateSelectedCustomer(c => ({
      ...c,
      deliveries: nextDeliveries,
      ...(ordersChanged ? { orders: nextOrders } : {}),
    }));
    setActiveTable("finalDeliveries");

    const deliveryRevision = nextRowSaveRevision(selectedCustomerId, "deliveries");
    const orderRevision = ordersChanged ? nextRowSaveRevision(selectedCustomerId, "orders") : null;
    try {
      const [deliveryResult, orderResult] = await Promise.all([
        saveRowsQueued(selectedCustomerId, "deliveries", nextDeliveries),
        ordersChanged
          ? saveRowsQueued(selectedCustomerId, "orders", nextOrders)
          : Promise.resolve(null),
      ]);
      if (deliveryResult?.rows && isLatestRowSaveRevision(selectedCustomerId, "deliveries", deliveryRevision)) {
        updateSelectedCustomer(c => ({ ...c, deliveries: deliveryResult.rows }));
      }
      if (orderResult?.rows && isLatestRowSaveRevision(selectedCustomerId, "orders", orderRevision)) {
        updateSelectedCustomer(c => ({ ...c, orders: orderResult.rows }));
      }
      return true;
    } catch (err) {
      await dialogs.alert(`生成失败：${err.message}`, { title: "生成送货单" });
      return false;
    }
  };

  const handleRestore = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = "";
    try {
      const data = await importBackup(file);
      if (await dialogs.confirm(`恢复备份将覆盖当前所有数据（共 ${data.length} 个客户）。确认继续？`, {
        title: "恢复备份",
        tone: "danger",
      })) {
        const safeData = normalizeCustomerOrderStatuses(ensureUniqueCustomerRowIds(data));
        pushUndoSnapshot();
        const result = await api.replaceAll(safeData);
        const restoredCustomers = normalizeCustomerOrderStatuses(result?.customers || safeData);
        setCustomers(restoredCustomers);
        setSelectedCustomerId(restoredCustomers[0]?.id);
      }
    } catch (err) {
      await dialogs.alert(`恢复失败：${err.message}`, { title: "恢复失败" });
    }
  };

  const handleColumnOrderChange = useCallback(async (tableKey, order) => {
    pushUndoSnapshot();
    const newCustomColumns = {
      ...selectedCustomer.customColumns,
      columnOrder: {
        ...(selectedCustomer.customColumns?.columnOrder || {}),
        [tableKey]: order,
      },
    };
    updateSelectedCustomer(c => ({ ...c, customColumns: newCustomColumns }));
    try {
      await api.updateCustomer(selectedCustomerId, { ...selectedCustomer, customColumns: newCustomColumns });
    } catch (err) {
      await dialogs.alert(`保存失败：${err.message}`, { title: "保存失败" });
    }
  }, [dialogs.alert, pushUndoSnapshot, selectedCustomer, selectedCustomerId]);

  const deleteCustomer = async (id) => {
    if (!(await dialogs.confirm("确认删除该客户？此操作不可恢复，包括所有订单和送货记录。", {
      title: "删除客户",
      tone: "danger",
    }))) return;
    pushUndoSnapshot();
    setCustomers(current => current.filter(c => c.id !== id));
    if (selectedCustomerId === id) {
      const remaining = customers.filter(c => c.id !== id);
      setSelectedCustomerId(remaining[0]?.id || null);
    }
    try {
      await api.deleteCustomer(id);
    } catch (err) {
      await dialogs.alert(`删除失败：${err.message}`, { title: "删除失败" });
    }
  };

  const resetDemoData = async () => {
    try {
      const safeInitialCustomers = normalizeCustomerOrderStatuses(ensureUniqueCustomerRowIds(initialCustomers));
      pushUndoSnapshot();
      const result = await api.replaceAll(safeInitialCustomers);
      const restoredCustomers = normalizeCustomerOrderStatuses(result?.customers || safeInitialCustomers);
      setCustomers(restoredCustomers);
      setSelectedCustomerId(restoredCustomers[0]?.id);
      setActiveTable("orders");
    } catch (err) {
      await dialogs.alert(`重置失败：${err.message}`, { title: "重置失败" });
    }
  };

  if (loading) {
    return (
      <div className="app-shell" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#82e5ff', fontSize: '1rem' }}>正在连接数据库...</p>
      </div>
    );
  }

  const activeConfig = tableConfigs[activeTable];
  const activeSourceTable = activeConfig.sourceTableKey || activeTable;
  const isHistoryOrders = activeTable === "historyOrders";
  const activeCustomColumns = selectedCustomer?.customColumns?.[activeSourceTable] || [];
  const canCreateActiveRows = !isHistoryOrders && !activeConfig.disableRowCreate;
  const exportCustomer = (() => {
    if (isHistoryOrders) {
      return {
        ...selectedCustomer,
        historyOrders: (selectedCustomer?.orders || []).filter(order => normalizeOrderStatus(order.status) === "已付款"),
      };
    }
    if (activeTable === "productionSchedule") {
      return {
        ...selectedCustomer,
        productionSchedule: (selectedCustomer?.orders || []).filter(order => normalizeOrderStatus(order.status) === "已排产"),
      };
    }
    if (activeTable === "deliveries") {
      return {
        ...selectedCustomer,
        deliveries: (selectedCustomer?.deliveries || []).filter(row => !isFinalDelivery(row)),
      };
    }
    if (activeTable === "finalDeliveries") {
      return {
        ...selectedCustomer,
        finalDeliveries: (selectedCustomer?.deliveries || []).filter(row => isFinalDelivery(row)),
      };
    }
    return selectedCustomer;
  })();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">
            <LayoutDashboard size={20} />
          </div>
          <div>
            <p className="eyebrow">FOAM OPS</p>
            <h1>泡沫厂客户管理系统</h1>
          </div>
        </div>

        <div className="global-search-wrap">
          <label className="search-box global-search">
            <Search size={16} />
            <input
              value={globalSearchQuery}
              onChange={(e) => { setGlobalSearchQuery(e.target.value); setShowGlobalSearchResults(true); }}
              onFocus={() => setShowGlobalSearchResults(true)}
              onBlur={() => setTimeout(() => setShowGlobalSearchResults(false), 200)}
              placeholder="搜索订单号 / 产品 / 送货单…"
            />
          </label>
          {showGlobalSearchResults && globalSearchResults.length > 0 && (
            <div className="global-search-results">
              {globalSearchResults.map((r, i) => (
                <button key={i} className="search-result-item" type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => navigateToSearchResult(r)}>
                  <span className="search-result-type">{r.type === "customer" ? "👤" : r.type === "order" ? "📋" : "🚚"}</span>
                  <span className="search-result-label">{r.label}</span>
                  <span className="search-result-meta">{r.customerName}{r.detail ? ` · ${r.detail}` : ""}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          className="primary-action"
          type="button"
          onClick={() => {
            setEditingCustomer(null);
            setShowCustomerModal(true);
          }}
        >
          <UserRoundPlus size={18} />
          新增客户
        </button>

        <label className="search-box">
          <Search size={16} />
          <input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="搜索客户 / 联系人"
          />
        </label>

        <div className="customer-list" aria-label="客户列表">
          {filteredCustomers.map((customer) => (
            <div
              className={`customer-item ${customer.id === selectedCustomerId ? "is-active" : ""}`}
              key={customer.id}
            >
              <button
                className="customer-item-body"
                type="button"
                onClick={() => {
                  if (selectedCustomerId) lastTableByCustomerRef.current[selectedCustomerId] = activeTable;
                  setSelectedCustomerId(customer.id);
                  const lastTable = lastTableByCustomerRef.current[customer.id];
                  if (lastTable) setActiveTable(lastTable);
                }}
              >
                <span className="customer-name">
                  {customer.name}
                  {alertMap[customer.id] && (
                    <span
                      className={`alert-dot alert-dot--${alertMap[customer.id]}`}
                      title={alertMap[customer.id] === "danger" ? "有订单已逾期" : "有订单即将到期"}
                    />
                  )}
                </span>
                <span className="customer-meta">
                  {customer.contact || "未填联系人"} · {customer.level}
                </span>
              </button>
              <button
                className="customer-delete"
                type="button"
                title="删除客户"
                onClick={() => deleteCustomer(customer.id)}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>

        <div className="sidebar-footer">
          <input
            ref={backupInputRef}
            type="file"
            accept=".json"
            style={{ display: "none" }}
            onChange={handleRestore}
          />
          <button
            className="ghost-button"
            type="button"
            title="导出全部客户数据为 JSON 备份文件"
            onClick={() => exportBackup(customers)}
          >
            <Archive size={14} />
            备份数据
          </button>
          <button
            className="ghost-button"
            type="button"
            title="从备份文件恢复数据（将覆盖当前数据）"
            onClick={() => backupInputRef.current.click()}
          >
            <Archive size={14} />
            恢复备份
          </button>
          <button className="ghost-button" type="button" onClick={resetDemoData}>
            恢复演示数据
          </button>
          <button
            className="ghost-button"
            type="button"
            title="系统设置"
            onClick={() => setShowSettings(true)}
          >
            <Settings2 size={14} />
            系统设置
          </button>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">CUSTOMER COMMAND CENTER</p>
            <h2>{selectedCustomer?.name || "运营仪表盘"}</h2>
          </div>
          <div className="topbar-actions">
            <button
              className="icon-button"
              type="button"
              title="编辑客户档案"
              onClick={() => {
                setEditingCustomer(selectedCustomer);
                setShowCustomerModal(true);
              }}
              disabled={!selectedCustomer}
            >
              <SquarePen size={18} />
            </button>
          </div>
        </header>

        <section className="metrics-grid" aria-label="业务指标">
          {metrics.map((metric) => (
            <article className="metric-card" key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <small>{metric.detail}</small>
            </article>
          ))}
        </section>
        <>

        {selectedCustomer ? (
          <>
            {alertMap[selectedCustomer.id] && (
              <section className={`alert-banner alert-banner--${alertMap[selectedCustomer.id]}`}>
                <AlertTriangle size={15} />
                {alertMap[selectedCustomer.id] === "danger"
                  ? "该客户有订单已逾期，请尽快跟进。"
                  : "该客户有订单 3 天内到期，请注意安排。"}
              </section>
            )}

            <section className="customer-panel">
              <div className="profile-strip">
                <InfoPill label="联系人" value={selectedCustomer?.contact} />
                <InfoPill label="电话" value={selectedCustomer?.phone} />
                <InfoPill label="账期" value={selectedCustomer?.paymentTerm} />
                <InfoPill label="地址" value={selectedCustomer?.address} wide />
              </div>
            </section>

            <section className="table-section">
              <div className="table-toolbar">
                <div className="tabs" role="tablist" aria-label="业务模块">
                  {Object.entries(tableConfigs).map(([key, config]) => {
                    const Icon = config.icon;
                    return (
                      <button
                        key={key}
                        className={`tab-button ${activeTable === key ? "is-active" : ""}`}
                        type="button"
                        onClick={() => {
                          if (selectedCustomer) lastTableByCustomerRef.current[selectedCustomer.id] = key;
                          setActiveTable(key);
                          setViewMode("grid");
                        }}
                      >
                        <Icon size={17} />
                        {config.label}
                      </button>
                    );
                  })}
                </div>
                {activeTable === "orders" && selectedCustomer && (
                  <button
                    className={`tab-button ${viewMode === "kanban" ? "is-active" : ""}`}
                    type="button"
                    onClick={() => setViewMode(v => v === "kanban" ? "grid" : "kanban")}
                    title="看板视图"
                  >
                    <KanbanSquare size={16} />
                    看板
                  </button>
                )}
                <div className="toolbar-actions">
                  <label className="filter-box">
                    <Filter size={16} />
                    <input
                      value={quickFilter}
                      onChange={(event) => setQuickFilter(event.target.value)}
                      placeholder="筛选当前表格"
                    />
                  </label>
                  {selectedCustomer && activeTable === "orders" && (
                    <OrderImportButton
                      disabled={!selectedCustomer}
                      dialogs={dialogs}
                      onImport={handleOrderImport}
                    />
                  )}
                  {selectedCustomer && activeTable === "orders" && (
                    <button
                      className="secondary-button"
                      type="button"
                      title="生成对账单"
                      onClick={() => generateStatement(selectedCustomer, systemSettings)}
                    >
                      对账单
                    </button>
                  )}
                  {selectedCustomer && (
                    <button
                      className="secondary-button"
                      type="button"
                      title="导出当前表格为 Excel"
                      onClick={() =>
                        exportTableToExcel(exportCustomer, activeTable, [
                          ...activeConfig.defaultColumns,
                          ...activeCustomColumns,
                        ])
                      }
                    >
                      <Download size={15} />
                      导出 Excel
                    </button>
                  )}
                  {!isHistoryOrders && (
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => setShowColumnModal(true)}
                      disabled={!selectedCustomer}
                    >
                      <Settings2 size={17} />
                      自定义表头
                    </button>
                  )}
                  {canCreateActiveRows && (
                    <button
                      className="primary-action compact"
                      type="button"
                      onClick={() => addRow(activeSourceTable)}
                      disabled={!selectedCustomer}
                    >
                      <Plus size={17} />
                      新增{activeConfig.rowLabel}
                    </button>
                  )}
                </div>
              </div>

              {viewMode === "kanban" && activeTable === "orders" ? (
                <KanbanBoard
                  customer={selectedCustomer}
                  onStatusChange={(orderId, newStatus) => {
                    const currentCustomer = customers.find(c => c.id === selectedCustomerId) || selectedCustomer;
                    const updatedOrders = (currentCustomer.orders || []).map(o =>
                      o.id === orderId ? { ...o, status: newStatus } : o
                    );
                    pushUndoSnapshot();
                    updateSelectedCustomer(c => ({ ...c, orders: updatedOrders }));
                    handleRowsChange("orders", updatedOrders);
                  }}
                  onSelectOrder={(orderId) => { setViewMode("grid"); }}
                />
              ) : (
                <BusinessGrid
                  key={`${selectedCustomer.id}-${activeTable}`}
                  customer={selectedCustomer}
                  tableKey={activeSourceTable}
                  viewKey={activeTable}
                  quickFilter={quickFilter}
                  onRowsChange={handleRowsChange}
                  onDeleteRows={deleteRows}
                  onPrintRow={activeTable === "finalDeliveries" ? setPrintDelivery : null}
                  onScheduleOrders={activeTable === "orders" || activeTable === "productionSchedule" ? handleScheduleOrders : null}
                  onCreateDeliveryFromOrders={activeTable === "orders" ? handleCreateDeliveryFromOrders : null}
                  onFinalizeDeliveryDrafts={activeTable === "deliveries" ? handleFinalizeDeliveryDrafts : null}
                  onColumnOrderChange={handleColumnOrderChange}
                  onRemoveColumns={removeCustomColumns}
                  onBeforeDataChange={pushUndoSnapshot}
                  onCreateUndoSnapshot={takeUndoSnapshot}
                  readOnly={isHistoryOrders}
                  dialogs={dialogs}
                />
              )}
            </section>
          </>
        ) : (
          <DashboardView customers={customers} alertMap={alertMap} onCreateCustomer={() => { setEditingCustomer(null); setShowCustomerModal(true); }} onSelectCustomer={setSelectedCustomerId} />
        )}
        </>
      </main>

      {showCustomerModal && (
        <CustomerModal
          customer={editingCustomer}
          onClose={() => setShowCustomerModal(false)}
          onSave={(customerInput) => {
            upsertCustomer(customerInput);
            setShowCustomerModal(false);
          }}
        />
      )}

      {showColumnModal && selectedCustomer && (
        <ColumnModal
          tableKey={activeSourceTable}
          customer={selectedCustomer}
          onClose={() => setShowColumnModal(false)}
          onAddColumn={addCustomColumn}
          onUpdateColumn={updateCustomColumn}
          onRemoveColumn={removeCustomColumn}
        />
      )}

      {selectedCustomer && productionScheduleOrders.length > 0 && (
        <ProductionScheduleModal
          customer={selectedCustomer}
          orders={productionScheduleOrders}
          onClose={() => setProductionScheduleOrders([])}
          onSave={saveProductionSchedule}
        />
      )}

      {printDelivery && selectedCustomer && (
        <DeliveryPrintModal
          delivery={printDelivery}
          customer={selectedCustomer}
          onClose={() => setPrintDelivery(null)}
        />
      )}

      {showSettings && (
        <SettingsModal
          settings={systemSettings}
          onClose={() => setShowSettings(false)}
          onSave={(s) => {
            setSystemSettings(s);
            localStorage.setItem("foam-crm-settings", JSON.stringify(s));
            setShowSettings(false);
          }}
        />
      )}

      <AppDialog dialog={dialogs.dialog} onResolve={dialogs.resolve} />
    </div>
  );
}

function BusinessGrid({
  customer,
  tableKey,
  viewKey = tableKey,
  quickFilter,
  onRowsChange,
  onDeleteRows,
  onPrintRow = null,
  onScheduleOrders = null,
  onCreateDeliveryFromOrders = null,
  onFinalizeDeliveryDrafts = null,
  onColumnOrderChange,
  onRemoveColumns,
  onBeforeDataChange,
  onCreateUndoSnapshot,
  readOnly = false,
  dialogs,
}) {
  const gridRef = useRef(null);
  const gridShellRef = useRef(null);
  const dragSelectionRef = useRef(null);
  const fillSelectedCellsRef = useRef(null);
  const pendingEditSnapshotRef = useRef(null);
  const selectionRangeRef = useRef(null);
  const selectableColumnFieldsRef = useRef([]);
  const filterUndoStackRef = useRef([]);
  const autoSizeTimerRef = useRef(null);
  const pendingAutoSizeFieldsRef = useRef(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectionRange, setSelectionRange] = useState(null);
  const [columnFilters, setColumnFilters] = useState({});
  const [filterPopup, setFilterPopup] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [insertRowCounts, setInsertRowCounts] = useState({ above: "", below: "" });
  const [expandedDeliveryGroups, setExpandedDeliveryGroups] = useState(() => new Set());
  const deferredQuickFilter = useDeferredValue(quickFilter);
  const config = tableConfigs[viewKey];
  const sourceRows = customer[tableKey] || [];
  const rows = useMemo(() => {
    if (viewKey === "orders") {
      return sourceRows.filter(row => normalizeOrderStatus(row.status) !== "已付款");
    }
    if (viewKey === "productionSchedule") {
      return sourceRows.filter(row => normalizeOrderStatus(row.status) === "已排产");
    }
    if (viewKey === "historyOrders") {
      return sourceRows.filter(row => normalizeOrderStatus(row.status) === "已付款");
    }
    if (viewKey === "deliveries") {
      return sourceRows.filter(row => !isFinalDelivery(row));
    }
    if (viewKey === "finalDeliveries") {
      return sourceRows.filter(row => isFinalDelivery(row));
    }
    return sourceRows;
  }, [sourceRows, viewKey]);
  const customColumns = customer.customColumns?.[tableKey] || [];
  const savedOrder = customer.customColumns?.columnOrder?.[tableKey];
  const filteredRows = useMemo(() => {
    const activeFilters = Object.entries(columnFilters);
    if (!activeFilters.length) return rows;
    return rows.filter(row =>
      activeFilters.every(([field, allowedValues]) => {
        const value = tableKey === "orders" && field === "status"
          ? normalizeOrderStatus(row[field])
          : row[field];
        return allowedValues.has(filterValue(value).key);
      }),
    );
  }, [rows, columnFilters, tableKey]);
  const gridRows = useMemo(() => {
    if (viewKey !== "finalDeliveries") return filteredRows;

    const groups = new Map();
    for (const row of filteredRows) {
      const key = deliveryGroupKey(row);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }

    const result = [];
    for (const [key, groupRows] of groups) {
      const expanded = expandedDeliveryGroups.has(key);
      const groupStatus = getDeliveryGroupStatus(groupRows);
      const statusCounts = finalDeliveryStatusOptions
        .map(status => {
          const count = groupRows.filter(row => normalizeFinalDeliveryStatus(row.status) === status).length;
          return count ? `${status}${count}` : "";
        })
        .filter(Boolean)
        .join(" / ");
      const quantity = groupRows.reduce(
        (sum, row) => sum + parseNumericValue(row[deliveryQuantityField]),
        0,
      );
      const linkedOrders = new Set(groupRows.map(row => row[linkedOrderIdField] || row.orderNo).filter(Boolean));
      const firstRow = groupRows[0] || {};
      result.push({
        ...firstRow,
        id: `__delivery_group_${key}`,
        __isDeliveryGroup: true,
        __deliveryGroupKey: key,
        __deliveryGroupCount: groupRows.length,
        __deliveryGroupOrderCount: linkedOrders.size,
        __deliveryGroupStatusSummary: statusCounts || groupStatus,
        __expanded: expanded,
        deliveryNo: key,
        status: groupStatus,
        [deliveryQuantityField]: quantity,
      });
      if (expanded) {
        result.push(...groupRows.map(row => ({ ...row, __deliveryGroupChild: true })));
      }
    }

    return result;
  }, [expandedDeliveryGroups, filteredRows, viewKey]);
  const canCreateDeliveryFromOrders = tableKey === "orders"
    && viewKey === "orders"
    && !readOnly
    && typeof onCreateDeliveryFromOrders === "function";
  const canScheduleOrders = tableKey === "orders"
    && (viewKey === "orders" || viewKey === "productionSchedule")
    && !readOnly
    && typeof onScheduleOrders === "function";
  const canFinalizeDeliveryDrafts = tableKey === "deliveries"
    && viewKey === "deliveries"
    && !readOnly
    && typeof onFinalizeDeliveryDrafts === "function";
  const canCreateRows = !readOnly && !config.disableRowCreate;

  const toggleDeliveryGroup = useCallback((key) => {
    setExpandedDeliveryGroups(current => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const updateDeliveryGroupStatus = useCallback((key, status) => {
    const normalizedStatus = normalizeFinalDeliveryStatus(status);
    let changed = false;
    const changedRowIds = [];
    const updatedRows = sourceRows.map(row => {
      if (!isFinalDelivery(row) || deliveryGroupKey(row) !== key) return row;
      if (normalizeFinalDeliveryStatus(row.status) === normalizedStatus) return row;
      changed = true;
      changedRowIds.push(row.id);
      return { ...row, status: normalizedStatus };
    });

    if (!changed) return;
    onBeforeDataChange?.();
    onRowsChange(tableKey, updatedRows, { formulaRowIds: changedRowIds });
  }, [onBeforeDataChange, onRowsChange, sourceRows, tableKey]);

  const advanceOrderStatus = useCallback((rowId, nextStatus, rowData) => {
    if (!getNextStatuses(normalizeOrderStatus(rowData?.status)).includes(nextStatus)) return;
    onBeforeDataChange?.();
    const updatedRows = sourceRows.map(row =>
      row.id === rowId ? { ...row, status: nextStatus } : row
    );
    onRowsChange(tableKey, updatedRows, { formulaRowIds: [rowId] });
  }, [onBeforeDataChange, onRowsChange, sourceRows, tableKey]);

  const columnDefs = useMemo(() => {
    const rowNumberColumn = {
      field: "__rowNumber",
      headerName: "#",
      width: 54,
      pinned: "left",
      lockPinned: true,
      lockPosition: "left",
      suppressMovable: true,
      sortable: false,
      filter: false,
      resizable: false,
      editable: false,
      headerComponent: RowNumberHeader,
      valueGetter: (params) => (params.node?.rowPinned ? "合计" : (params.node?.rowIndex ?? 0) + 1),
      cellClass: "row-number-cell",
      cellClassRules: selectionCellClassRules,
    };

    const actionColumn = {
      field: "__actions",
      headerName: "",
      width: 52,
      pinned: "right",
      sortable: false,
      filter: false,
      resizable: false,
      editable: false,
      cellRenderer: (params) => (
        <div style={{ display: "flex", gap: 4, alignItems: "center", height: "100%" }}>
          <button
            className="grid-delete"
            type="button"
            title="打印送货单"
            onClick={() => onPrintRow(params.data)}
          >
            <Printer size={14} />
          </button>
        </div>
      ),
    };

    const defaultFields = new Set(config.defaultColumns.map(column => column.field));
    const allCols = [
      ...config.defaultColumns.map(toGridColumn),
      ...customColumns
        .filter(column => !defaultFields.has(column.field))
        .map(toGridColumn),
    ];

    if (savedOrder?.length) {
      allCols.sort((a, b) => {
        const ai = savedOrder.indexOf(a.field);
        const bi = savedOrder.indexOf(b.field);
        return (ai === -1 ? 9999 : ai) - (bi === -1 ? 9999 : bi);
      });
    }

    const orderedCols = tableKey === "orders"
      ? [
        ...allCols.filter(column => column.field !== "status"),
        ...allCols.filter(column => column.field === "status"),
      ]
      : allCols;
    const isEditableColumn = (column, params) => (
      typeof column.editable === "function" ? column.editable(params) : column.editable !== false
    );
    const visibleCols = orderedCols.map(column => {
      const nextColumn = readOnly
        ? { ...column, editable: false }
        : column;

      // Orders 视图：进度列增加快捷流转按钮
      if (viewKey === "orders" && column.field === "status" && !readOnly) {
        return {
          ...nextColumn,
          cellRenderer: (params) => {
            const value = normalizeOrderStatus(params.value);
            const nextStatuses = getNextStatuses(value);
            if (!nextStatuses.length) {
              return <span className={`status-chip ${statusClass(value)}`}>{value}</span>;
            }
            return (
              <div style={{ display: "flex", alignItems: "center", gap: 4, height: "100%" }}>
                <span className={`status-chip ${statusClass(value)}`} style={{ flexShrink: 0 }}>{value}</span>
                <span className="status-actions">
                  {nextStatuses.map(ns => (
                    <button
                      key={ns}
                      className="status-next-btn"
                      type="button"
                      title={`流转到：${ns}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        advanceOrderStatus(params.data.id, ns, params.data);
                      }}
                    >
                      → {ns}
                    </button>
                  ))}
                </span>
              </div>
            );
          },
        };
      }

      // Orders 视图：产品列关联客户产品库下拉选择
      if (viewKey === "orders" && column.field === "product" && !readOnly) {
        const products = customer.products || [];
        const productNames = products.map(p => p.name);
        return {
          ...nextColumn,
          cellEditor: "agSelectCellEditor",
          cellEditorParams: {
            values: productNames,
          },
          onCellValueChanged: (params) => {
            const selectedProduct = products.find(p => p.name === params.newValue);
            if (selectedProduct && params.data) {
              const updatedRows = sourceRows.map(row => {
                if (row.id !== params.data.id) return row;
                return {
                  ...row,
                  product: selectedProduct.name,
                  ...(selectedProduct.spec ? { spec: selectedProduct.spec } : {}),
                  ...(selectedProduct.unit ? { unit: selectedProduct.unit } : {}),
                  ...(selectedProduct.unitPrice ? { unitPrice: selectedProduct.unitPrice } : {}),
                };
              });
              setTimeout(() => onRowsChange(tableKey, updatedRows, { formulaRowIds: [params.data.id] }), 0);
            }
          },
        };
      }

      // Orders 视图：交期校验（早于订单日期时黄色警告）
      if (viewKey === "orders" && column.field === "dueDate") {
        return {
          ...nextColumn,
          cellStyle: (params) => {
            if (!params.value || !params.data?.date) return null;
            if (params.value < params.data.date) {
              return { backgroundColor: "rgba(210, 153, 34, 0.15)", borderLeft: "3px solid var(--amber)" };
            }
            return null;
          },
        };
      }

      if (viewKey !== "finalDeliveries") return nextColumn;

      if (column.field === "deliveryNo") {
        return {
          ...nextColumn,
          editable: (params) => !params.data?.__isDeliveryGroup && isEditableColumn(nextColumn, params),
          cellRenderer: (params) => {
            if (!params.data?.__isDeliveryGroup) return params.value || "";
            return (
              <button
                className="delivery-group-toggle"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  toggleDeliveryGroup(params.data.__deliveryGroupKey);
                }}
                title={params.data.__expanded ? "收起送货单明细" : "展开送货单明细"}
              >
                <span>{params.data.__expanded ? "▾" : "▸"}</span>
                <strong>{params.value}</strong>
                <small>
                  {params.data.__deliveryGroupCount} 行
                  {params.data.__deliveryGroupOrderCount ? ` / ${params.data.__deliveryGroupOrderCount} 单` : ""}
                  {` / ${normalizeCalculatedNumber(parseNumericValue(params.data[deliveryQuantityField]))}`}
                  {params.data.__deliveryGroupStatusSummary ? ` / ${params.data.__deliveryGroupStatusSummary}` : ""}
                </small>
              </button>
            );
          },
        };
      }

      if (column.field === "status") {
        return {
          ...nextColumn,
          editable: (params) => !params.data?.__isDeliveryGroup && isEditableColumn(nextColumn, params),
          cellRenderer: (params) => {
            if (!params.data?.__isDeliveryGroup) {
              const value = normalizeFinalDeliveryStatus(params.value);
              return (
                <span className={`status-chip ${statusClass(value)}`}>
                  {value}
                </span>
              );
            }

            const value = normalizeFinalDeliveryStatus(params.value);
            return (
              <select
                className={`delivery-group-status status-chip ${statusClass(value)}`}
                value={value}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => updateDeliveryGroupStatus(params.data.__deliveryGroupKey, event.target.value)}
                title="设置整张送货单状态"
              >
                {finalDeliveryStatusOptions.map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            );
          },
        };
      }

      return {
        ...nextColumn,
        editable: (params) => !params.data?.__isDeliveryGroup && isEditableColumn(nextColumn, params),
      };
    });

    return onPrintRow ? [rowNumberColumn, ...visibleCols, actionColumn] : [rowNumberColumn, ...visibleCols];
  }, [
    config.defaultColumns,
    customColumns,
    onPrintRow,
    readOnly,
    savedOrder,
    tableKey,
    toggleDeliveryGroup,
    updateDeliveryGroupStatus,
    viewKey,
    advanceOrderStatus,
  ]);

  const selectableColumnFields = useMemo(
    () => columnDefs
      .map(column => column.field)
      .filter(field => field && !field.startsWith("__")),
    [columnDefs],
  );

  const selectedColumnFields = useMemo(() => {
    if (selectionRange?.mode !== "columns") return [];

    const minCol = Math.min(selectionRange.startColIndex ?? 0, selectionRange.endColIndex ?? 0);
    const maxCol = Math.max(selectionRange.startColIndex ?? 0, selectionRange.endColIndex ?? 0);
    return selectableColumnFields.filter((_, index) => index >= minCol && index <= maxCol);
  }, [selectableColumnFields, selectionRange]);

  const customColumnFieldSet = useMemo(
    () => new Set(customColumns.map(column => column.field)),
    [customColumns],
  );

  const removableSelectedColumnFields = useMemo(
    () => selectedColumnFields.filter(field => customColumnFieldSet.has(field)),
    [customColumnFieldSet, selectedColumnFields],
  );

  const tableColumns = useMemo(
    () => [...config.defaultColumns, ...customColumns],
    [config.defaultColumns, customColumns],
  );
  const formulaColumnFields = useMemo(
    () => tableColumns
      .filter(column => normalizeFormulaInput(column.formula))
      .map(column => column.field),
    [tableColumns],
  );

  const columnHeaderByField = useMemo(
    () => new Map(tableColumns.map(column => [column.field, column.headerName])),
    [tableColumns],
  );

  const summaryRowData = useMemo(() => {
    if (!selectableColumnFields.length) return [];

    const summary = {};
    const firstField = selectableColumnFields[0];
    summary[firstField] = `合计 ${filteredRows.length} 行`;

    for (const column of tableColumns) {
      if (column.type !== "number") continue;

      summary[column.field] = filteredRows.reduce((total, row) => {
        const value = Number(row[column.field]);
        return Number.isFinite(value) ? total + value : total;
      }, 0);
    }

    return [summary];
  }, [filteredRows, selectableColumnFields, tableColumns]);

  const canFillDown = selectionRange?.mode === "cells"
    && Math.min(selectionRange.startRowIndex ?? 0, selectionRange.endRowIndex ?? 0)
      < Math.max(selectionRange.startRowIndex ?? 0, selectionRange.endRowIndex ?? 0);
  const canFillRight = selectionRange?.mode === "cells"
    && Math.min(selectionRange.startColIndex ?? 0, selectionRange.endColIndex ?? 0)
      < Math.max(selectionRange.startColIndex ?? 0, selectionRange.endColIndex ?? 0);

  const defaultColDef = useMemo(
    () => ({
      editable: (params) => !readOnly && !params.node?.rowPinned,
      sortable: true,
      filter: false,
      resizable: true,
      minWidth: 90,
      singleClickEdit: false,
    }),
    [readOnly],
  );

  const scheduleAutoSizeColumns = useCallback((options = {}) => {
    const requestedFields = Array.isArray(options.fields)
      ? options.fields.filter(Boolean)
      : null;
    if (requestedFields?.length) {
      const pendingFields = pendingAutoSizeFieldsRef.current;
      pendingAutoSizeFieldsRef.current = pendingFields
        ? [...new Set([...pendingFields, ...requestedFields])]
        : requestedFields;
    } else {
      pendingAutoSizeFieldsRef.current = null;
    }

    const run = () => {
      const api = gridRef.current?.api;
      const fields = selectableColumnFieldsRef.current;
      if (!api || !fields.length) return;

      const pendingFields = pendingAutoSizeFieldsRef.current;
      pendingAutoSizeFieldsRef.current = null;
      const fieldSet = new Set(fields);
      let colIds = (pendingFields?.length ? pendingFields : fields)
        .filter(field => fieldSet.has(field));

      if (!pendingFields?.length) {
        const displayedColumns = api.getAllDisplayedVirtualColumns?.() || api.getAllDisplayedColumns?.() || [];
        if (displayedColumns.length) {
          const displayedIds = new Set(displayedColumns.map(column => column.getColId?.() || column.colId));
          colIds = colIds.filter(field => displayedIds.has(field));
        }
      }

      if (!colIds.length) return;

      api.autoSizeColumns({
        colIds,
        skipHeader: false,
        defaultMinWidth: 90,
        defaultMaxWidth: 360,
        columnLimits: [
          { colId: "deliveryNo", minWidth: 150, maxWidth: 220 },
          { colId: "orderNo", minWidth: 130, maxWidth: 220 },
          { colId: "status", minWidth: 110, maxWidth: 150 },
          { colId: "followUp", minWidth: 160, maxWidth: 420 },
          { colId: deliveryOrderField("followUp"), minWidth: 160, maxWidth: 420 },
        ],
      });
    };

    if (autoSizeTimerRef.current) {
      window.clearTimeout(autoSizeTimerRef.current);
    }
    autoSizeTimerRef.current = window.setTimeout(() => {
      window.requestAnimationFrame(run);
    }, options.delay ?? (requestedFields?.length ? 90 : 160));
  }, []);

  useEffect(() => () => {
    if (autoSizeTimerRef.current) {
      window.clearTimeout(autoSizeTimerRef.current);
    }
  }, []);

  const autoSizeSignature = useMemo(() => (
    [
      viewKey,
      selectableColumnFields.join("|"),
    ].join("::")
  ), [selectableColumnFields, viewKey]);

  useEffect(() => {
    scheduleAutoSizeColumns();
  }, [autoSizeSignature, scheduleAutoSizeColumns]);

  const handleCellValueChanged = (event) => {
    if (event.data?.__isDeliveryGroup) return;
    if (pendingEditSnapshotRef.current) {
      onBeforeDataChange?.(pendingEditSnapshotRef.current);
      pendingEditSnapshotRef.current = null;
    } else {
      onBeforeDataChange?.();
    }

    const updatedRows = sourceRows.map((row) =>
      row.id === event.data.id ? { ...event.data } : row,
    );
    onRowsChange(tableKey, updatedRows, { formulaRowIds: [event.data.id] });
    scheduleAutoSizeColumns({ fields: [event.column?.getColId(), ...formulaColumnFields] });
  };

  const handleCellEditingStarted = useCallback(() => {
    pendingEditSnapshotRef.current = onCreateUndoSnapshot?.() || null;
  }, [onCreateUndoSnapshot]);

  const handleCellEditingStopped = useCallback(() => {
    setTimeout(() => {
      pendingEditSnapshotRef.current = null;
    }, 0);
  }, []);

  useEffect(() => {
    const rowIds = new Set(rows.map(row => row.id));
    setSelectedIds(current => current.filter(id => rowIds.has(id)));
  }, [rows]);

  useEffect(() => {
    const stopDragSelection = () => {
      const drag = dragSelectionRef.current;
      if (drag?.mode === "fill" && drag.fillDirection) {
        fillSelectedCellsRef.current?.(drag.fillDirection);
      }
      dragSelectionRef.current = null;
    };
    document.addEventListener("mouseup", stopDragSelection);
    return () => document.removeEventListener("mouseup", stopDragSelection);
  }, []);

  useEffect(() => {
    selectionRangeRef.current = selectionRange;
    gridRef.current?.api?.refreshCells({ force: true });
  }, [selectionRange]);

  useEffect(() => {
    selectableColumnFieldsRef.current = selectableColumnFields;
    gridRef.current?.api?.refreshCells({ force: true });
  }, [selectableColumnFields]);

  useEffect(() => {
    gridRef.current?.api?.refreshHeader();
  }, [columnFilters]);

  const isInteractiveTarget = (target) =>
    Boolean(target?.closest?.("button,input,textarea,select,[role='button']"));

  const isFillHandleHit = (mouseEvent) => {
    const cell = mouseEvent.target?.closest?.(".ag-cell");
    if (!cell) return false;

    const rect = cell.getBoundingClientRect();
    return rect.right - mouseEvent.clientX <= 10 && rect.bottom - mouseEvent.clientY <= 10;
  };

  const suppressNativeGridContextMenu = useCallback((event) => {
    if (event.target?.closest?.(".grid-context-menu")) return;
    event.preventDefault();
  }, []);

  useEffect(() => {
    const gridShell = gridShellRef.current;
    if (!gridShell) return undefined;

    const blockNativeContextMenu = (event) => {
      event.preventDefault();
    };

    gridShell.addEventListener("contextmenu", blockNativeContextMenu, true);
    return () => gridShell.removeEventListener("contextmenu", blockNativeContextMenu, true);
  }, []);

  const positionContextMenu = useCallback((event) => {
    const width = 220;
    const height = 520;
    setInsertRowCounts({ above: "", below: "" });
    setContextMenu({
      left: Math.max(8, Math.min(event.clientX, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(event.clientY, window.innerHeight - height - 8)),
    });
  }, []);

  const isCellInsideSelection = useCallback((rowIndex, colIndex) => {
    const selection = selectionRangeRef.current;
    if (!selection) return false;

    const minRow = Math.min(selection.startRowIndex ?? 0, selection.endRowIndex ?? 0);
    const maxRow = Math.max(selection.startRowIndex ?? 0, selection.endRowIndex ?? 0);
    const minCol = Math.min(selection.startColIndex ?? 0, selection.endColIndex ?? 0);
    const maxCol = Math.max(selection.startColIndex ?? 0, selection.endColIndex ?? 0);

    if (selection.mode === "rows") return rowIndex >= minRow && rowIndex <= maxRow;
    if (selection.mode === "columns") return colIndex >= minCol && colIndex <= maxCol;
    return rowIndex >= minRow && rowIndex <= maxRow && colIndex >= minCol && colIndex <= maxCol;
  }, []);

  const getVisibleNodeAtRowIndex = useCallback((rowIndex) => {
    let result = null;
    gridRef.current?.api?.forEachNodeAfterFilterAndSort((node) => {
      if (node.rowIndex === rowIndex) result = node;
    });
    return result;
  }, []);

  const getVisibleRowIdsInRange = useCallback((startRowIndex, endRowIndex) => {
    const minRow = Math.min(startRowIndex, endRowIndex);
    const maxRow = Math.max(startRowIndex, endRowIndex);
    const ids = [];

    gridRef.current?.api?.forEachNodeAfterFilterAndSort((node) => {
      if (node.rowIndex < minRow || node.rowIndex > maxRow || !node.data?.id || node.data.__isDeliveryGroup) return;
      ids.push(node.data.id);
    });

    return ids;
  }, []);

  const selectAllVisibleRows = useCallback(() => {
    const ids = [];
    let firstRowIndex = null;
    let lastRowIndex = null;

    gridRef.current?.api?.deselectAll();
    gridRef.current?.api?.forEachNodeAfterFilterAndSort((node) => {
      if (node.rowPinned || node.rowIndex == null || !node.data?.id || node.data.__isDeliveryGroup) return;
      ids.push(node.data.id);
      firstRowIndex ??= node.rowIndex;
      lastRowIndex = node.rowIndex;
      node.setSelected(true);
    });

    const nextSelection = ids.length
      ? { mode: "rows", startRowIndex: firstRowIndex, endRowIndex: lastRowIndex }
      : null;
    selectionRangeRef.current = nextSelection;
    setSelectionRange(nextSelection);
    setSelectedIds(ids);
  }, []);

  const selectRowsByRange = useCallback((startRowIndex, endRowIndex) => {
    const nextSelection = { mode: "rows", startRowIndex, endRowIndex };
    selectionRangeRef.current = nextSelection;
    setSelectionRange(nextSelection);
    setSelectedIds(getVisibleRowIdsInRange(startRowIndex, endRowIndex));
  }, [getVisibleRowIdsInRange]);

  const selectCellsByRange = useCallback((startRowIndex, endRowIndex, startColIndex, endColIndex) => {
    const nextSelection = {
      mode: "cells",
      startRowIndex,
      endRowIndex,
      startColIndex,
      endColIndex,
    };
    selectionRangeRef.current = nextSelection;
    setSelectionRange(nextSelection);
    setSelectedIds([]);
    gridRef.current?.api?.deselectAll();
  }, []);

  const selectColumnsByRange = useCallback((startColIndex, endColIndex) => {
    const nextSelection = { mode: "columns", startColIndex, endColIndex };
    selectionRangeRef.current = nextSelection;
    setSelectionRange(nextSelection);
    setSelectedIds([]);
    gridRef.current?.api?.deselectAll();
  }, []);

  const handleCellMouseDown = useCallback((event) => {
    if (event.event?.button !== 0 || !event.node || event.node.rowPinned || isInteractiveTarget(event.event?.target)) return;

    if (event.data?.__isDeliveryGroup) {
      event.event.preventDefault();
      toggleDeliveryGroup(event.data.__deliveryGroupKey);
      return;
    }

    const field = event.column?.getColId();
    if (field === "__actions") return;

    event.event.preventDefault();

    if (field === "__rowNumber") {
      dragSelectionRef.current = {
        mode: "rows",
        startRowIndex: event.node.rowIndex,
      };
      selectRowsByRange(event.node.rowIndex, event.node.rowIndex);
      return;
    }

    const colIndex = selectableColumnFields.indexOf(field);
    if (colIndex === -1) return;

    const selection = selectionRangeRef.current;
    if (selection?.mode === "cells" && isFillHandleHit(event.event)) {
      const minRow = Math.min(selection.startRowIndex ?? 0, selection.endRowIndex ?? 0);
      const maxRow = Math.max(selection.startRowIndex ?? 0, selection.endRowIndex ?? 0);
      const minCol = Math.min(selection.startColIndex ?? 0, selection.endColIndex ?? 0);
      const maxCol = Math.max(selection.startColIndex ?? 0, selection.endColIndex ?? 0);

      if (event.node.rowIndex === maxRow && colIndex === maxCol) {
        dragSelectionRef.current = {
          mode: "fill",
          minRow,
          maxRow,
          minCol,
          maxCol,
          fillDirection: null,
        };
        return;
      }
    }

    dragSelectionRef.current = {
      mode: "cells",
      startRowIndex: event.node.rowIndex,
      startColIndex: colIndex,
    };
    selectCellsByRange(event.node.rowIndex, event.node.rowIndex, colIndex, colIndex);
  }, [selectableColumnFields, selectCellsByRange, selectRowsByRange, toggleDeliveryGroup]);

  const handleCellMouseOver = useCallback((event) => {
    const drag = dragSelectionRef.current;
    if (!drag || !event.node || event.node.rowPinned) return;

    if (drag.mode === "rows") {
      selectRowsByRange(drag.startRowIndex, event.node.rowIndex);
      return;
    }

    if (drag.mode === "cells") {
      const colIndex = selectableColumnFields.indexOf(event.column?.getColId());
      if (colIndex === -1) return;
      selectCellsByRange(drag.startRowIndex, event.node.rowIndex, drag.startColIndex, colIndex);
      return;
    }

    if (drag.mode === "fill") {
      const colIndex = selectableColumnFields.indexOf(event.column?.getColId());
      if (colIndex === -1) return;

      if (
        event.node.rowIndex > drag.maxRow &&
        colIndex >= drag.minCol &&
        colIndex <= drag.maxCol
      ) {
        drag.fillDirection = "down";
        selectCellsByRange(drag.minRow, event.node.rowIndex, drag.minCol, drag.maxCol);
        return;
      }

      if (
        colIndex > drag.maxCol &&
        event.node.rowIndex >= drag.minRow &&
        event.node.rowIndex <= drag.maxRow
      ) {
        drag.fillDirection = "right";
        selectCellsByRange(drag.minRow, drag.maxRow, drag.minCol, colIndex);
        return;
      }

      drag.fillDirection = null;
      selectCellsByRange(drag.minRow, drag.maxRow, drag.minCol, drag.maxCol);
    }
  }, [selectableColumnFields, selectCellsByRange, selectRowsByRange]);

  const handleCellContextMenu = useCallback((event) => {
    if (!event.node || event.node.rowPinned || isInteractiveTarget(event.event?.target)) return;

    const mouseEvent = event.event;
    mouseEvent?.preventDefault();

    const field = event.column?.getColId();
    if (field === "__actions") return;

    if (field === "__rowNumber") {
      if (!isCellInsideSelection(event.node.rowIndex, 0)) {
        selectRowsByRange(event.node.rowIndex, event.node.rowIndex);
      }
      positionContextMenu(mouseEvent);
      return;
    }

    const colIndex = selectableColumnFields.indexOf(field);
    if (colIndex === -1) return;

    if (!isCellInsideSelection(event.node.rowIndex, colIndex)) {
      selectCellsByRange(event.node.rowIndex, event.node.rowIndex, colIndex, colIndex);
    }
    positionContextMenu(mouseEvent);
  }, [
    isCellInsideSelection,
    positionContextMenu,
    selectCellsByRange,
    selectableColumnFields,
    selectRowsByRange,
  ]);

  const handleSelectionChanged = useCallback((event) => {
    const selectedRows = event.api.getSelectedRows()
      .filter(row => !row.__isDeliveryGroup);
    setSelectedIds(selectedRows.map(row => row.id));
  }, []);

  const startColumnSelection = useCallback((field, mouseEvent) => {
    if (mouseEvent.button !== 0) return;

    const colIndex = selectableColumnFields.indexOf(field);
    if (colIndex === -1) return;

    mouseEvent.preventDefault();
    dragSelectionRef.current = {
      mode: "columns",
      startColIndex: colIndex,
    };
    selectColumnsByRange(colIndex, colIndex);
  }, [selectableColumnFields, selectColumnsByRange]);

  const updateColumnSelection = useCallback((field, mouseEvent) => {
    const drag = dragSelectionRef.current;
    if (!drag || drag.mode !== "columns" || mouseEvent.buttons !== 1) return;

    const colIndex = selectableColumnFields.indexOf(field);
    if (colIndex === -1) return;

    selectColumnsByRange(drag.startColIndex, colIndex);
  }, [selectableColumnFields, selectColumnsByRange]);

  const openHeaderContextMenu = useCallback((field, mouseEvent) => {
    const colIndex = selectableColumnFields.indexOf(field);
    if (colIndex === -1) return;

    mouseEvent.preventDefault();
    if (!isCellInsideSelection(0, colIndex)) {
      selectColumnsByRange(colIndex, colIndex);
    }
    positionContextMenu(mouseEvent);
  }, [isCellInsideSelection, positionContextMenu, selectableColumnFields, selectColumnsByRange]);

  const handleDragStopped = useCallback((event) => {
    if (!onColumnOrderChange) return;
    const order = event.api.getColumnState()
      .filter(c => c.colId !== '__actions')
      .map(c => c.colId);
    onColumnOrderChange(tableKey, order);
  }, [onColumnOrderChange, tableKey]);

  const handleBatchDelete = async () => {
    if (!selectedIds.length) return;
    if (!(await dialogs.confirm(`确认删除选中的 ${selectedIds.length} 行？此操作不可恢复。`, {
      title: "删除选中行",
      tone: "danger",
    }))) return;
    onDeleteRows(tableKey, selectedIds);
    setSelectedIds([]);
    gridRef.current?.api?.deselectAll();
    setSelectionRange(null);
  };

  const handleCreateDeliveryFromSelectedRows = async () => {
    if (!canCreateDeliveryFromOrders || !selectedIds.length) return;
    const created = await onCreateDeliveryFromOrders(selectedIds);
    if (!created) return;

    setSelectedIds([]);
    gridRef.current?.api?.deselectAll();
    setSelectionRange(null);
  };

  const handleScheduleSelectedRows = async () => {
    if (!canScheduleOrders || !selectedIds.length) return;
    const scheduled = await onScheduleOrders(selectedIds);
    if (!scheduled) return;

    setSelectedIds([]);
    gridRef.current?.api?.deselectAll();
    setSelectionRange(null);
  };

  const handleFinalizeSelectedDeliveryDrafts = async () => {
    if (!canFinalizeDeliveryDrafts || !selectedIds.length) return;
    const finalized = await onFinalizeDeliveryDrafts(selectedIds);
    if (!finalized) return;

    setSelectedIds([]);
    gridRef.current?.api?.deselectAll();
    setSelectionRange(null);
  };

  const deleteSelectedArea = useCallback(async () => {
    const selection = selectionRangeRef.current;
    if (!selection) return;

    if (selection.mode === "rows") {
      const rowIds = getVisibleRowIdsInRange(selection.startRowIndex, selection.endRowIndex);
      if (!rowIds.length) return;
      if (!(await dialogs.confirm(`确认删除选中的 ${rowIds.length} 行？此操作不可恢复。`, {
        title: "删除选中行",
        tone: "danger",
      }))) return;
      onDeleteRows(tableKey, rowIds);
      setSelectedIds([]);
      gridRef.current?.api?.deselectAll();
      setSelectionRange(null);
      return;
    }

    const fields = selectableColumnFieldsRef.current;
    const minCol = Math.min(selection.startColIndex ?? 0, selection.endColIndex ?? 0);
    const maxCol = Math.max(selection.startColIndex ?? 0, selection.endColIndex ?? 0);
    const fieldsToClear = fields.filter((_, index) => index >= minCol && index <= maxCol);
    if (!fieldsToClear.length) return;

    const targetRowIds = new Set();
    const minRow = Math.min(selection.startRowIndex ?? 0, selection.endRowIndex ?? 0);
    const maxRow = Math.max(selection.startRowIndex ?? 0, selection.endRowIndex ?? 0);

    gridRef.current?.api?.forEachNodeAfterFilterAndSort((node) => {
      if (!node.data?.id || node.data.__isDeliveryGroup) return;
      if (selection.mode === "cells" && (node.rowIndex < minRow || node.rowIndex > maxRow)) return;
      targetRowIds.add(node.data.id);
    });

    if (!targetRowIds.size) return;

    let changed = false;
    const clearedRows = sourceRows.map((row) => {
      if (!targetRowIds.has(row.id)) return row;

      let next = row;
      for (const field of fieldsToClear) {
        if (next[field] === "") continue;
        if (next === row) next = { ...row };
        next[field] = "";
        changed = true;
      }
      return next;
    });

    if (!changed) return;
    onBeforeDataChange?.();
    onRowsChange(tableKey, clearedRows, { formulaRowIds: targetRowIds });
  }, [dialogs.confirm, getVisibleRowIdsInRange, onBeforeDataChange, onDeleteRows, onRowsChange, sourceRows, tableKey]);

  const getSelectedAreaForCopy = useCallback(() => {
    const selection = selectionRangeRef.current;
    if (!selection) return null;

    const fields = selectableColumnFieldsRef.current;
    const minCol = Math.min(selection.startColIndex ?? 0, selection.endColIndex ?? 0);
    const maxCol = Math.max(selection.startColIndex ?? 0, selection.endColIndex ?? 0);
    const selectedFields = selection.mode === "rows"
      ? fields
      : fields.filter((_, index) => index >= minCol && index <= maxCol);
    if (!selectedFields.length) return null;

    const minRow = Math.min(selection.startRowIndex ?? 0, selection.endRowIndex ?? 0);
    const maxRow = Math.max(selection.startRowIndex ?? 0, selection.endRowIndex ?? 0);
    const rowNodes = [];

    gridRef.current?.api?.forEachNodeAfterFilterAndSort((node) => {
      if (!node.data?.id || node.data.__isDeliveryGroup) return;
      if (selection.mode !== "columns" && (node.rowIndex < minRow || node.rowIndex > maxRow)) return;
      rowNodes.push(node);
    });

    if (!rowNodes.length) return null;
    return { rowNodes, fields: selectedFields };
  }, []);

  const getSelectedAreaText = useCallback((includeHeaders = false) => {
    const area = getSelectedAreaForCopy();
    if (!area) return "";

    const body = area.rowNodes
      .map(node => area.fields
        .map(field => encodeClipboardCell(node.data?.[field]))
        .join("\t"))
      .join("\r\n");
    if (!includeHeaders) return body;

    const headers = area.fields
      .map(field => encodeClipboardCell(columnHeaderByField.get(field) || field))
      .join("\t");
    return body ? `${headers}\r\n${body}` : headers;
  }, [columnHeaderByField, getSelectedAreaForCopy]);

  const copySelectedArea = useCallback((clipboardData) => {
    if (!clipboardData) return false;
    const text = getSelectedAreaText();
    if (!text) return false;

    clipboardData.setData("text/plain", text);
    return true;
  }, [getSelectedAreaText]);

  const pasteClipboardData = useCallback((text) => {
    const selection = selectionRangeRef.current;
    if (!selection || !text) return false;

    const table = parseClipboardTable(text);
    if (!table.length) return false;

    const fields = selectableColumnFieldsRef.current;
    const minCol = Math.min(selection.startColIndex ?? 0, selection.endColIndex ?? 0);
    const startColIndex = selection.mode === "rows" ? 0 : minCol;
    if (startColIndex >= fields.length) return false;

    const minRow = Math.min(selection.startRowIndex ?? 0, selection.endRowIndex ?? 0);
    const anchorRowIndex = selection.mode === "columns" ? 0 : minRow;
    const visibleNodes = [];

    gridRef.current?.api?.forEachNodeAfterFilterAndSort((node) => {
      if (node.data?.id && !node.data.__isDeliveryGroup) visibleNodes.push(node);
    });

    const startRowPosition = visibleNodes.findIndex(node => node.rowIndex === anchorRowIndex);
    if (startRowPosition === -1) return false;

    const updatedRowsById = new Map();

    for (let rowOffset = 0; rowOffset < table.length; rowOffset++) {
      const node = visibleNodes[startRowPosition + rowOffset];
      if (!node?.data?.id) break;

      let next = node.data;
      for (let colOffset = 0; colOffset < table[rowOffset].length; colOffset++) {
        const field = fields[startColIndex + colOffset];
        if (!field) break;

        const value = table[rowOffset][colOffset];
        if (next[field] === value) continue;
        if (next === node.data) next = { ...node.data };
        next[field] = value;
      }

      if (next !== node.data) {
        updatedRowsById.set(node.data.id, next);
      }
    }

    if (!updatedRowsById.size) return false;

    gridRef.current?.api?.stopEditing();
    onBeforeDataChange?.();
    onRowsChange(
      tableKey,
      sourceRows.map(row => updatedRowsById.get(row.id) || row),
      { formulaRowIds: updatedRowsById.keys() },
    );
    return true;
  }, [onBeforeDataChange, onRowsChange, sourceRows, tableKey]);

  const fillSelectedCells = useCallback((direction) => {
    const selection = selectionRangeRef.current;
    if (!selection || selection.mode !== "cells") return false;

    const fields = selectableColumnFieldsRef.current;
    const minCol = Math.min(selection.startColIndex ?? 0, selection.endColIndex ?? 0);
    const maxCol = Math.max(selection.startColIndex ?? 0, selection.endColIndex ?? 0);
    const minRow = Math.min(selection.startRowIndex ?? 0, selection.endRowIndex ?? 0);
    const maxRow = Math.max(selection.startRowIndex ?? 0, selection.endRowIndex ?? 0);
    const selectedFields = fields.filter((_, index) => index >= minCol && index <= maxCol);
    if (!selectedFields.length) return false;
    if (direction === "down" && minRow >= maxRow) return false;
    if (direction === "right" && minCol >= maxCol) return false;

    const selectedNodes = [];
    gridRef.current?.api?.forEachNodeAfterFilterAndSort((node) => {
      if (!node.data?.id || node.data.__isDeliveryGroup) return;
      if (node.rowIndex < minRow || node.rowIndex > maxRow) return;
      selectedNodes.push(node);
    });
    if (!selectedNodes.length) return false;

    const updatedRowsById = new Map();

    if (direction === "down") {
      const sourceNode = selectedNodes.find(node => node.rowIndex === minRow);
      if (!sourceNode?.data) return false;

      for (const node of selectedNodes) {
        if (node.rowIndex === minRow) continue;

        let next = node.data;
        for (const field of selectedFields) {
          const value = sourceNode.data[field];
          if (next[field] === value) continue;
          if (next === node.data) next = { ...node.data };
          next[field] = value;
        }
        if (next !== node.data) updatedRowsById.set(node.data.id, next);
      }
    }

    if (direction === "right") {
      const sourceField = fields[minCol];
      if (!sourceField) return false;

      for (const node of selectedNodes) {
        let next = node.data;
        const value = node.data[sourceField];

        for (let colIndex = minCol + 1; colIndex <= maxCol; colIndex++) {
          const field = fields[colIndex];
          if (!field || next[field] === value) continue;
          if (next === node.data) next = { ...node.data };
          next[field] = value;
        }
        if (next !== node.data) updatedRowsById.set(node.data.id, next);
      }
    }

    if (!updatedRowsById.size) return false;

    gridRef.current?.api?.stopEditing();
    onBeforeDataChange?.();
    onRowsChange(
      tableKey,
      sourceRows.map(row => updatedRowsById.get(row.id) || row),
      { formulaRowIds: updatedRowsById.keys() },
    );
    return true;
  }, [onBeforeDataChange, onRowsChange, sourceRows, tableKey]);

  useEffect(() => {
    fillSelectedCellsRef.current = fillSelectedCells;
  }, [fillSelectedCells]);

  const getSelectedAreaScope = useCallback((selection = selectionRangeRef.current) => {
    if (!selection) return null;

    const fields = selectableColumnFieldsRef.current;
    const minCol = Math.min(selection.startColIndex ?? 0, selection.endColIndex ?? 0);
    const maxCol = Math.max(selection.startColIndex ?? 0, selection.endColIndex ?? 0);
    const selectedFields = selection.mode === "rows"
      ? fields
      : fields.filter((_, index) => index >= minCol && index <= maxCol);
    if (!selectedFields.length) return null;

    const minRow = Math.min(selection.startRowIndex ?? 0, selection.endRowIndex ?? 0);
    const maxRow = Math.max(selection.startRowIndex ?? 0, selection.endRowIndex ?? 0);
    const rowIds = new Set();

    gridRef.current?.api?.forEachNodeAfterFilterAndSort((node) => {
      if (!node.data?.id || node.data.__isDeliveryGroup) return;
      if (selection.mode !== "columns" && (node.rowIndex < minRow || node.rowIndex > maxRow)) return;
      rowIds.add(node.data.id);
    });

    return rowIds.size ? { fields: selectedFields, rowIds } : null;
  }, []);

  const clearSelectedContents = useCallback(() => {
    const scope = getSelectedAreaScope();
    if (!scope) return false;

    let changed = false;
    const clearedRows = sourceRows.map((row) => {
      if (!scope.rowIds.has(row.id)) return row;

      let next = row;
      for (const field of scope.fields) {
        if (next[field] === "") continue;
        if (next === row) next = { ...row };
        next[field] = "";
        changed = true;
      }
      return next;
    });

    if (!changed) return false;
    onBeforeDataChange?.();
    onRowsChange(tableKey, clearedRows, { formulaRowIds: scope.rowIds });
    return true;
  }, [getSelectedAreaScope, onBeforeDataChange, onRowsChange, sourceRows, tableKey]);

  const setSelectedAreaValue = useCallback((value) => {
    const scope = getSelectedAreaScope();
    if (!scope) return false;

    let changed = false;
    const updatedRows = sourceRows.map((row) => {
      if (!scope.rowIds.has(row.id)) return row;

      let next = row;
      for (const field of scope.fields) {
        if (next[field] === value) continue;
        if (next === row) next = { ...row };
        next[field] = value;
        changed = true;
      }
      return next;
    });

    if (!changed) return false;
    onBeforeDataChange?.();
    onRowsChange(tableKey, updatedRows, { formulaRowIds: scope.rowIds });
    return true;
  }, [getSelectedAreaScope, onBeforeDataChange, onRowsChange, sourceRows, tableKey]);

  const batchModifySelectedArea = useCallback(async () => {
    if (!selectionRangeRef.current) return;

    const value = await dialogs.prompt("批量修改选区为：", {
      title: "批量修改选区",
      placeholder: "输入要写入选区的值",
    });
    if (value === null) return;
    setSelectedAreaValue(value);
  }, [dialogs.prompt, setSelectedAreaValue]);

  const findInTable = useCallback(async () => {
    const query = await dialogs.prompt("查找内容：", {
      title: "查找",
      placeholder: "输入要查找的内容",
    });
    if (!query) return;

    const fields = selectableColumnFieldsRef.current;
    let match = null;

    gridRef.current?.api?.forEachNodeAfterFilterAndSort((node) => {
      if (match || !node.data?.id || node.data.__isDeliveryGroup) return;

      for (let colIndex = 0; colIndex < fields.length; colIndex++) {
        const field = fields[colIndex];
        if (String(node.data[field] ?? "").includes(query)) {
          match = { rowIndex: node.rowIndex, colIndex, field };
          break;
        }
      }
    });

    if (!match) {
      await dialogs.alert("未找到匹配内容。", { title: "查找结果" });
      return;
    }

    selectCellsByRange(match.rowIndex, match.rowIndex, match.colIndex, match.colIndex);
    gridRef.current?.api?.ensureIndexVisible(match.rowIndex, "middle");
    gridRef.current?.api?.ensureColumnVisible(match.field);
  }, [dialogs.alert, dialogs.prompt, selectCellsByRange]);

  const replaceInTable = useCallback(async () => {
    const findText = await dialogs.prompt("查找内容：", {
      title: "替换",
      placeholder: "输入要替换的原内容",
    });
    if (!findText) return;

    const replacement = await dialogs.prompt("替换为：", {
      title: "替换",
      placeholder: "输入新的内容；留空则清除",
    });
    if (replacement === null) return;

    const selection = selectionRangeRef.current;
    const fields = selectableColumnFieldsRef.current;
    const minCol = Math.min(selection?.startColIndex ?? 0, selection?.endColIndex ?? 0);
    const maxCol = Math.max(selection?.startColIndex ?? fields.length - 1, selection?.endColIndex ?? fields.length - 1);
    const fieldsToReplace = !selection || selection.mode === "rows"
      ? fields
      : fields.filter((_, index) => index >= minCol && index <= maxCol);
    if (!fieldsToReplace.length) return;

    const minRow = Math.min(selection?.startRowIndex ?? 0, selection?.endRowIndex ?? Number.MAX_SAFE_INTEGER);
    const maxRow = Math.max(selection?.startRowIndex ?? 0, selection?.endRowIndex ?? Number.MAX_SAFE_INTEGER);
    const targetRowIds = new Set();

    gridRef.current?.api?.forEachNodeAfterFilterAndSort((node) => {
      if (!node.data?.id || node.data.__isDeliveryGroup) return;
      if (selection && selection.mode !== "columns" && (node.rowIndex < minRow || node.rowIndex > maxRow)) return;
      targetRowIds.add(node.data.id);
    });

    let replaceCount = 0;
    const updatedRows = sourceRows.map((row) => {
      if (!targetRowIds.has(row.id)) return row;

      let next = row;
      for (const field of fieldsToReplace) {
        const original = String(next[field] ?? "");
        if (!original.includes(findText)) continue;
        if (next === row) next = { ...row };
        next[field] = original.split(findText).join(replacement);
        replaceCount += 1;
      }
      return next;
    });

    if (!replaceCount) {
      await dialogs.alert("未找到可替换内容。", { title: "替换结果" });
      return;
    }

    onBeforeDataChange?.();
    onRowsChange(tableKey, updatedRows, { formulaRowIds: targetRowIds });
    await dialogs.alert(`已替换 ${replaceCount} 个单元格。`, { title: "替换完成" });
  }, [dialogs.alert, dialogs.prompt, onBeforeDataChange, onRowsChange, sourceRows, tableKey]);

  const duplicateSelectedRows = useCallback(() => {
    if (!canCreateRows) return false;
    const selection = selectionRangeRef.current;
    if (!selection || selection.mode !== "rows") return false;

    const rowIds = getVisibleRowIdsInRange(selection.startRowIndex, selection.endRowIndex);
    if (!rowIds.length) return false;

    const selectedRowById = new Map(sourceRows.map(row => [row.id, row]));
    const clonedRows = rowIds
      .map(id => selectedRowById.get(id))
      .filter(Boolean)
      .map(row => ({ ...row, id: makeId(tableKey) }));
    if (!clonedRows.length) return false;

    const maxRow = Math.max(selection.startRowIndex ?? 0, selection.endRowIndex ?? 0);
    const targetNode = getVisibleNodeAtRowIndex(maxRow);
    const originalIndex = targetNode?.data?.id
      ? sourceRows.findIndex(row => row.id === targetNode.data.id)
      : -1;
    const insertIndex = originalIndex === -1 ? sourceRows.length : originalIndex + 1;
    const nextRows = [...sourceRows];
    nextRows.splice(insertIndex, 0, ...clonedRows);

    onBeforeDataChange?.();
    onRowsChange(tableKey, nextRows, { formulaRowIds: clonedRows.map(row => row.id) });
    return true;
  }, [canCreateRows, getVisibleNodeAtRowIndex, getVisibleRowIdsInRange, onBeforeDataChange, onRowsChange, sourceRows, tableKey]);

  const getInsertRowCount = useCallback((placement) => {
    const parsed = Number.parseInt(insertRowCounts[placement], 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  }, [insertRowCounts]);

  const insertRowAtSelection = useCallback((placement, count = 1) => {
    if (!canCreateRows) return;
    const selection = selectionRangeRef.current;
    const minRow = Math.min(selection?.startRowIndex ?? 0, selection?.endRowIndex ?? 0);
    const maxRow = Math.max(selection?.startRowIndex ?? 0, selection?.endRowIndex ?? 0);
    const targetNode = getVisibleNodeAtRowIndex(placement === "above" ? minRow : maxRow);
    const originalIndex = targetNode?.data?.id
      ? sourceRows.findIndex(row => row.id === targetNode.data.id)
      : -1;
    const insertIndex = originalIndex === -1
      ? (placement === "above" ? 0 : sourceRows.length)
      : originalIndex + (placement === "below" ? 1 : 0);
    const normalizedCount = Math.floor(count);
    const rowCount = Number.isFinite(normalizedCount) && normalizedCount > 0 ? normalizedCount : 1;
    const newRows = Array.from({ length: rowCount }, () => ({
      id: makeId(tableKey),
      ...config.emptyRow,
      date: today(),
    }));
    const nextRows = [...sourceRows];
    nextRows.splice(insertIndex, 0, ...newRows);

    onBeforeDataChange?.();
    onRowsChange(tableKey, nextRows, { formulaRowIds: newRows.map(row => row.id) });
  }, [canCreateRows, config.emptyRow, getVisibleNodeAtRowIndex, onBeforeDataChange, onRowsChange, sourceRows, tableKey]);

  const submitInsertRows = useCallback((event, placement) => {
    event.preventDefault();
    insertRowAtSelection(placement, getInsertRowCount(placement));
    setContextMenu(null);
  }, [getInsertRowCount, insertRowAtSelection]);

  const getSelectedRowIdsForMenu = useCallback(() => {
    const selection = selectionRangeRef.current;
    if (!selection || selection.mode !== "rows") return [];

    return getVisibleRowIdsInRange(selection.startRowIndex, selection.endRowIndex);
  }, [getVisibleRowIdsInRange]);

  const deleteRowsFromMenu = useCallback(async () => {
    const rowIds = getSelectedRowIdsForMenu();
    if (!rowIds.length) return;
    if (!(await dialogs.confirm(`确认删除选中的 ${rowIds.length} 行？此操作不可恢复。`, {
      title: "删除选中行",
      tone: "danger",
    }))) return;

    onDeleteRows(tableKey, rowIds);
    setSelectedIds([]);
    gridRef.current?.api?.deselectAll();
    setSelectionRange(null);
  }, [dialogs.confirm, getSelectedRowIdsForMenu, onDeleteRows, tableKey]);

  const deleteSelectedColumnsFromMenu = useCallback(async () => {
    if (!onRemoveColumns || !removableSelectedColumnFields.length) return;

    const columnNames = removableSelectedColumnFields
      .map(field => columnHeaderByField.get(field) || field)
      .join("、");
    const lockedCount = selectedColumnFields.length - removableSelectedColumnFields.length;
    const lockedMessage = lockedCount > 0
      ? `\n其中 ${lockedCount} 个默认表头不会删除。`
      : "";

    if (!(await dialogs.confirm(`确认删除选中的 ${removableSelectedColumnFields.length} 个自定义表头？\n${columnNames}${lockedMessage}`, {
      title: "删除表头",
      tone: "danger",
    }))) return;

    onRemoveColumns(tableKey, removableSelectedColumnFields);
    setSelectionRange(null);
  }, [
    columnHeaderByField,
    dialogs.confirm,
    onRemoveColumns,
    removableSelectedColumnFields,
    selectedColumnFields.length,
    tableKey,
  ]);

  const sortSelectedColumnFromMenu = useCallback((sort) => {
    const field = selectedColumnFields[0];
    if (!field) return;

    gridRef.current?.api?.applyColumnState({
      defaultState: { sort: null },
      state: [{ colId: field, sort }],
    });
  }, [selectedColumnFields]);

  const clearSortFromMenu = useCallback(() => {
    gridRef.current?.api?.applyColumnState({
      defaultState: { sort: null },
    });
  }, []);

  const copyFromMenu = useCallback(async (includeHeaders = false) => {
    const text = getSelectedAreaText(includeHeaders);
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      await dialogs.alert(`复制失败：${err.message}`, { title: "复制失败" });
    }
  }, [dialogs.alert, getSelectedAreaText]);

  const pasteFromMenu = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      pasteClipboardData(text);
    } catch (err) {
      await dialogs.alert(`粘贴失败：${err.message}`, { title: "粘贴失败" });
    }
  }, [dialogs.alert, pasteClipboardData]);

  useEffect(() => {
    const handleCopy = (event) => {
      if (!selectionRangeRef.current || isInteractiveTarget(event.target)) return;
      if (!copySelectedArea(event.clipboardData)) return;

      event.preventDefault();
    };

    const handlePaste = (event) => {
      if (!selectionRangeRef.current || isInteractiveTarget(event.target)) return;
      const text = event.clipboardData?.getData("text/plain");
      if (!pasteClipboardData(text)) return;

      event.preventDefault();
    };

    document.addEventListener("copy", handleCopy, true);
    document.addEventListener("paste", handlePaste, true);
    return () => {
      document.removeEventListener("copy", handleCopy, true);
      document.removeEventListener("paste", handlePaste, true);
    };
  }, [copySelectedArea, pasteClipboardData]);

  useEffect(() => {
    const handleDeleteKeyDown = (event) => {
      if (event.key !== "Delete" || !selectionRangeRef.current) return;
      if (isInteractiveTarget(event.target)) return;

      event.preventDefault();
      deleteSelectedArea();
    };

    document.addEventListener("keydown", handleDeleteKeyDown, true);
    return () => document.removeEventListener("keydown", handleDeleteKeyDown, true);
  }, [deleteSelectedArea]);

  useEffect(() => {
    const handleFillKeyDown = (event) => {
      const key = event.key?.toLowerCase();
      const isShortcut = event.ctrlKey || event.metaKey;
      const direction = isShortcut && key === "d"
        ? "down"
        : isShortcut && key === "r"
          ? "right"
          : null;
      if (!direction || !selectionRangeRef.current) return;
      if (isInteractiveTarget(event.target)) return;

      event.preventDefault();
      fillSelectedCells(direction);
    };

    document.addEventListener("keydown", handleFillKeyDown, true);
    return () => document.removeEventListener("keydown", handleFillKeyDown, true);
  }, [fillSelectedCells]);

  useEffect(() => {
    const handleFindReplaceKeyDown = (event) => {
      const key = event.key?.toLowerCase();
      const isShortcut = event.ctrlKey || event.metaKey;
      if (!isShortcut || !["f", "h"].includes(key)) return;
      if (isInteractiveTarget(event.target)) return;

      event.preventDefault();
      if (key === "f") findInTable();
      if (key === "h") replaceInTable();
    };

    document.addEventListener("keydown", handleFindReplaceKeyDown, true);
    return () => document.removeEventListener("keydown", handleFindReplaceKeyDown, true);
  }, [findInTable, replaceInTable]);

  useEffect(() => {
    if (!contextMenu) return undefined;

    const closeContextMenu = (event) => {
      if (event.target?.closest?.(".grid-context-menu")) return;
      setContextMenu(null);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setContextMenu(null);
    };

    document.addEventListener("mousedown", closeContextMenu);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("scroll", closeContextMenu, true);
    window.addEventListener("resize", closeContextMenu);
    return () => {
      document.removeEventListener("mousedown", closeContextMenu);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("scroll", closeContextMenu, true);
      window.removeEventListener("resize", closeContextMenu);
    };
  }, [contextMenu]);

  const openColumnFilter = useCallback((field, headerName, anchorRect, optionValues = null) => {
    setFilterPopup({
      field,
      headerName,
      optionValues,
      left: Math.min(anchorRect.left, window.innerWidth - 270),
      top: Math.max(12, Math.min(anchorRect.bottom + 6, window.innerHeight - 390)),
    });
  }, []);

  const closeColumnFilter = useCallback(() => {
    setFilterPopup(null);
  }, []);

  const cloneColumnFilters = useCallback((filters) => (
    Object.fromEntries(
      Object.entries(filters).map(([field, values]) => [field, new Set(values)]),
    )
  ), []);

  const pushColumnFilterUndo = useCallback(() => {
    filterUndoStackRef.current = [
      ...filterUndoStackRef.current,
      cloneColumnFilters(columnFilters),
    ].slice(-MAX_UNDO_STEPS);
  }, [cloneColumnFilters, columnFilters]);

  const applyColumnFilter = useCallback((field, selectedValues, allValues) => {
    pushColumnFilterUndo();
    setColumnFilters(current => {
      const next = { ...current };
      if (selectedValues.size === allValues.length) delete next[field];
      else next[field] = new Set(selectedValues);
      return next;
    });
    setFilterPopup(null);
    gridRef.current?.api?.deselectAll();
    setSelectedIds([]);
    setSelectionRange(null);
  }, [pushColumnFilterUndo]);

  const clearColumnFilter = useCallback((field) => {
    pushColumnFilterUndo();
    setColumnFilters(current => {
      const next = { ...current };
      delete next[field];
      return next;
    });
    setFilterPopup(null);
  }, [pushColumnFilterUndo]);

  const restoreLastColumnFilter = useCallback(() => {
    if (!filterUndoStackRef.current.length) return false;
    const previousFilters = filterUndoStackRef.current[filterUndoStackRef.current.length - 1];
    filterUndoStackRef.current = filterUndoStackRef.current.slice(0, -1);
    setColumnFilters(previousFilters);
    setFilterPopup(null);
    gridRef.current?.api?.deselectAll();
    setSelectedIds([]);
    setSelectionRange(null);
    return true;
  }, []);

  useEffect(() => {
    const handleFilterUndo = (event) => {
      if (restoreLastColumnFilter()) {
        event.preventDefault();
      }
    };

    window.addEventListener("crm:undo-filter", handleFilterUndo);
    return () => window.removeEventListener("crm:undo-filter", handleFilterUndo);
  }, [restoreLastColumnFilter]);

  const gridContext = useMemo(() => ({
    openColumnFilter,
    activeFilterFields: new Set(Object.keys(columnFilters)),
    selectionRangeRef,
    selectableColumnFieldsRef,
    selectAllRows: selectAllVisibleRows,
    startColumnSelection,
    updateColumnSelection,
    openHeaderContextMenu,
  }), [
    columnFilters,
    openHeaderContextMenu,
    openColumnFilter,
    selectAllVisibleRows,
    startColumnSelection,
    updateColumnSelection,
  ]);

  const handleGridReady = useCallback(() => {
    scheduleAutoSizeColumns({ delay: 80 });
  }, [scheduleAutoSizeColumns]);

  const handleFirstDataRendered = useCallback(() => {
    scheduleAutoSizeColumns({ delay: 80 });
  }, [scheduleAutoSizeColumns]);

  // 快捷键支持
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target?.closest?.("input, textarea, select, [contenteditable]")) return;
      const isGrid = e.target?.closest?.(".ag-root");
      if (!isGrid) return;

      if ((e.ctrlKey || e.metaKey) && e.key === "n") {
        e.preventDefault();
        const newRow = { ...config.emptyRow, id: makeId(tableKey), date: tableKey === "orders" ? today() : "", orderNo: "", status: "未完成" };
        const newRows = [...sourceRows, newRow];
        onBeforeDataChange?.();
        onRowsChange(tableKey, newRows);
        setTimeout(() => {
          const api = gridRef.current?.api;
          if (!api) return;
          const lastIndex = api.getDisplayedRowCount() - 1;
          api.ensureIndexVisible(lastIndex);
          api.startEditingCell({ rowIndex: lastIndex, colKey: selectableColumnFields[1] || selectableColumnFields[0] });
        }, 150);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "d" && selectedIds.length === 1) {
        e.preventDefault();
        const row = sourceRows.find(r => r.id === selectedIds[0]);
        if (row) {
          const copiedRow = { ...row, id: makeId(tableKey), orderNo: "", date: today() };
          const newRows = [...sourceRows, copiedRow];
          onBeforeDataChange?.();
          onRowsChange(tableKey, newRows);
        }
      }
      if (e.key === "Delete" && selectedIds.length > 0) {
        e.preventDefault();
        handleBatchDelete();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selectedIds, sourceRows, tableKey, onRowsChange, onBeforeDataChange]);

  const getGridRowClass = useCallback(
    (params) => params.data?.__isDeliveryGroup ? "delivery-group-row" : undefined,
    [],
  );

  const getGridRowId = useCallback((params) => params.data.id, []);

  const [bulkEditField, setBulkEditField] = useState("");
  const [bulkEditValue, setBulkEditValue] = useState("");
  const [showBulkEdit, setShowBulkEdit] = useState(false);

  const applyBulkEdit = () => {
    if (!bulkEditField || !selectedIds.length) return;
    const updatedRows = sourceRows.map(row =>
      selectedIds.includes(row.id) ? { ...row, [bulkEditField]: bulkEditValue } : row
    );
    onBeforeDataChange?.();
    onRowsChange(tableKey, updatedRows);
    setSelectedIds([]);
    gridRef.current?.api?.deselectAll();
    setSelectionRange(null);
    setShowBulkEdit(false);
    setBulkEditField("");
    setBulkEditValue("");
  };

  return (
    <>
      {selectedIds.length > 0 && (
        <div className="grid-selection-bar">
          <span>已选中 {selectedIds.length} 行</span>
          <div className="grid-selection-actions">
            {canScheduleOrders && (
              <button className="secondary-button compact" type="button" onClick={handleScheduleSelectedRows}>
                <KanbanSquare size={14} />
                排产
              </button>
            )}
            {canCreateDeliveryFromOrders && (
              <button className="secondary-button compact" type="button" onClick={handleCreateDeliveryFromSelectedRows}>
                <Truck size={14} />
                生成送货单自动关联订单
              </button>
            )}
            {canFinalizeDeliveryDrafts && (
              <button className="secondary-button compact" type="button" onClick={handleFinalizeSelectedDeliveryDrafts}>
                <Truck size={14} />
                确认生成送货单
              </button>
            )}
            <button className="secondary-button compact" type="button" onClick={() => setShowBulkEdit(!showBulkEdit)}>
              <Pencil size={14} />
              批量修改
            </button>
            <button className="danger-button compact" type="button" onClick={handleBatchDelete}>
              <Trash2 size={14} />
              批量删除
            </button>
          </div>
          {showBulkEdit && (
            <div className="bulk-edit-row">
              <select value={bulkEditField} onChange={e => setBulkEditField(e.target.value)}>
                <option value="">选择字段</option>
                {tableColumns.filter(c => c.field !== "id" && c.field !== "__actions").map(c => (
                  <option key={c.field} value={c.field}>{c.headerName}</option>
                ))}
              </select>
              <input
                value={bulkEditValue}
                onChange={e => setBulkEditValue(e.target.value)}
                placeholder="新值"
                onKeyDown={e => e.key === "Enter" && applyBulkEdit()}
              />
              <button className="primary-action compact" type="button" onClick={applyBulkEdit} style={{ minHeight: 32 }}>
                应用
              </button>
            </div>
          )}
        </div>
      )}
      <div
        ref={gridShellRef}
        className="grid-shell"
        onContextMenuCapture={suppressNativeGridContextMenu}
      >
        <AgGridReact
          ref={gridRef}
          theme={gridTheme}
          rowData={gridRows}
          pinnedBottomRowData={summaryRowData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          context={gridContext}
          rowSelection="multiple"
          suppressRowClickSelection
          animateRows={false}
          rowBuffer={4}
          cacheQuickFilter
          suppressColumnMoveAnimation
          stopEditingWhenCellsLoseFocus
          localeText={localeText}
          quickFilterText={deferredQuickFilter}
          onGridReady={handleGridReady}
          onFirstDataRendered={handleFirstDataRendered}
          onCellValueChanged={handleCellValueChanged}
          onCellEditingStarted={handleCellEditingStarted}
          onCellEditingStopped={handleCellEditingStopped}
          onDragStopped={handleDragStopped}
          onCellMouseDown={handleCellMouseDown}
          onCellMouseOver={handleCellMouseOver}
          onCellContextMenu={handleCellContextMenu}
          onSelectionChanged={handleSelectionChanged}
          getRowClass={getGridRowClass}
          getRowId={getGridRowId}
        />
      </div>
      {contextMenu && (
        <div
          className="grid-context-menu"
          style={{ left: contextMenu.left, top: contextMenu.top }}
          role="menu"
          onContextMenu={(event) => event.preventDefault()}
        >
          <button type="button" role="menuitem" onClick={() => { findInTable(); setContextMenu(null); }}>
            <Search size={14} />
            查找
          </button>
          <button type="button" role="menuitem" onClick={() => { replaceInTable(); setContextMenu(null); }}>
            <SquarePen size={14} />
            替换
          </button>
          <button type="button" role="menuitem" onClick={() => { copyFromMenu(); setContextMenu(null); }}>
            <Copy size={14} />
            复制
          </button>
          <button type="button" role="menuitem" onClick={() => { copyFromMenu(true); setContextMenu(null); }}>
            <ClipboardList size={14} />
            复制带表头
          </button>
          <button type="button" role="menuitem" onClick={() => { pasteFromMenu(); setContextMenu(null); }}>
            <ClipboardPaste size={14} />
            粘贴
          </button>
          <button type="button" role="menuitem" onClick={() => { clearSelectedContents(); setContextMenu(null); }}>
            <Eraser size={14} />
            清空内容
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!selectionRange}
            onClick={() => { batchModifySelectedArea(); setContextMenu(null); }}
          >
            <SquarePen size={14} />
            批量修改选区
          </button>
          {selectionRange?.mode === "cells" && (
            <>
              <button
                type="button"
                role="menuitem"
                disabled={!canFillDown}
                onClick={() => { fillSelectedCells("down"); setContextMenu(null); }}
              >
                <ArrowDown size={14} />
                向下填充
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={!canFillRight}
                onClick={() => { fillSelectedCells("right"); setContextMenu(null); }}
              >
                <ArrowRight size={14} />
                向右填充
              </button>
            </>
          )}
          {selectionRange?.mode === "columns" ? (
            <>
              <div className="grid-context-menu-separator" />
              <button
                type="button"
                role="menuitem"
                disabled={!selectedColumnFields.length}
                onClick={() => { sortSelectedColumnFromMenu("asc"); setContextMenu(null); }}
              >
                <ArrowUp size={14} />
                升序排序
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={!selectedColumnFields.length}
                onClick={() => { sortSelectedColumnFromMenu("desc"); setContextMenu(null); }}
              >
                <ArrowDown size={14} />
                降序排序
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => { clearSortFromMenu(); setContextMenu(null); }}
              >
                <RotateCcw size={14} />
                清除排序
              </button>
              <div className="grid-context-menu-separator" />
              <button
                className="is-danger"
                type="button"
                role="menuitem"
                disabled={!removableSelectedColumnFields.length}
                title={removableSelectedColumnFields.length ? "删除选中的自定义表头" : "默认表头不可删除"}
                onClick={() => { deleteSelectedColumnsFromMenu(); setContextMenu(null); }}
              >
                <Trash2 size={14} />
                删除选中列（表头）
              </button>
            </>
          ) : (
            <>
              <div className="grid-context-menu-separator" />
              <button
                type="button"
                role="menuitem"
                disabled={!canCreateRows || selectionRange?.mode !== "rows"}
                onClick={() => { duplicateSelectedRows(); setContextMenu(null); }}
              >
                <Copy size={14} />
                复制选中行为新行
              </button>
              {canCreateRows && (
                <>
                  <form className="grid-context-menu-insert" onSubmit={(event) => submitInsertRows(event, "above")}>
                    <button type="submit" role="menuitem">
                      <Plus size={14} />
                      在上方插入
                    </button>
                    <input
                      aria-label="上方插入行数"
                      inputMode="numeric"
                      min="1"
                      placeholder="1"
                      type="number"
                      value={insertRowCounts.above}
                      onChange={(event) => setInsertRowCounts(current => ({
                        ...current,
                        above: event.target.value,
                      }))}
                    />
                    <span>行</span>
                  </form>
                  <form className="grid-context-menu-insert" onSubmit={(event) => submitInsertRows(event, "below")}>
                    <button type="submit" role="menuitem">
                      <Plus size={14} />
                      在下方插入
                    </button>
                    <input
                      aria-label="下方插入行数"
                      inputMode="numeric"
                      min="1"
                      placeholder="1"
                      type="number"
                      value={insertRowCounts.below}
                      onChange={(event) => setInsertRowCounts(current => ({
                        ...current,
                        below: event.target.value,
                      }))}
                    />
                    <span>行</span>
                  </form>
                </>
              )}
              <button
                className="is-danger"
                type="button"
                role="menuitem"
                disabled={selectionRange?.mode !== "rows"}
                onClick={() => { deleteRowsFromMenu(); setContextMenu(null); }}
              >
                <Trash2 size={14} />
                删除选中行
              </button>
            </>
          )}
        </div>
      )}
      {filterPopup && (
        <ColumnValueFilter
          popup={filterPopup}
          rows={rows}
          appliedValues={columnFilters[filterPopup.field]}
          onApply={applyColumnFilter}
          onClear={clearColumnFilter}
          onClose={closeColumnFilter}
        />
      )}
    </>
  );
}

const selectionCellClassRules = {
  "grid-cell-selected": (params) => {
    const selection = params.context?.selectionRangeRef?.current ?? params.context?.selectionRange;
    if (!selection || params.node?.rowPinned || params.node?.rowIndex == null) return false;

    const field = params.column?.getColId();
    if (field === "__actions") return false;

    const rowIndex = params.node.rowIndex;
    const minRow = Math.min(selection.startRowIndex ?? 0, selection.endRowIndex ?? 0);
    const maxRow = Math.max(selection.startRowIndex ?? 0, selection.endRowIndex ?? 0);

    if (selection.mode === "rows") {
      return rowIndex >= minRow && rowIndex <= maxRow;
    }

    const selectableColumnFields = params.context?.selectableColumnFieldsRef?.current
      ?? params.context?.selectableColumnFields
      ?? [];
    const colIndex = selectableColumnFields.indexOf(field);
    if (colIndex === -1) return false;

    const minCol = Math.min(selection.startColIndex ?? 0, selection.endColIndex ?? 0);
    const maxCol = Math.max(selection.startColIndex ?? 0, selection.endColIndex ?? 0);

    if (selection.mode === "columns") {
      return colIndex >= minCol && colIndex <= maxCol;
    }

    return (
      selection.mode === "cells" &&
      rowIndex >= minRow &&
      rowIndex <= maxRow &&
      colIndex >= minCol &&
      colIndex <= maxCol
    );
  },
  "grid-fill-handle-cell": (params) => {
    const selection = params.context?.selectionRangeRef?.current ?? params.context?.selectionRange;
    if (!selection || selection.mode !== "cells" || params.node?.rowPinned || params.node?.rowIndex == null) {
      return false;
    }

    const selectableColumnFields = params.context?.selectableColumnFieldsRef?.current
      ?? params.context?.selectableColumnFields
      ?? [];
    const field = params.column?.getColId();
    const colIndex = selectableColumnFields.indexOf(field);
    if (colIndex === -1) return false;

    const maxRow = Math.max(selection.startRowIndex ?? 0, selection.endRowIndex ?? 0);
    const maxCol = Math.max(selection.startColIndex ?? 0, selection.endColIndex ?? 0);
    return params.node.rowIndex === maxRow && colIndex === maxCol;
  },
};

function toGridColumn(column) {
  const hasFormula = Boolean(normalizeFormulaInput(column.formula));
  const cellClasses = [
    column.required ? "required-cell" : null,
    (column.type === "number" || hasFormula) ? "number-cell" : null,
    hasFormula ? "formula-cell" : null,
    column.field === "status" ? "status-cell" : null,
  ].filter(Boolean);

  const gridColumn = {
    field: column.field,
    headerName: column.headerName,
    width: column.width,
    flex: column.flex,
    minWidth: column.minWidth,
    editable: (params) => !hasFormula && !params.node?.rowPinned,
    filter: false,
    headerComponent: ColumnHeader,
    headerTooltip: hasFormula ? column.formula : undefined,
    cellClass: cellClasses.length ? cellClasses : undefined,
    cellClassRules: selectionCellClassRules,
  };

  if (column.type === "number" || hasFormula) {
    gridColumn.valueParser = (params) => normalizeCalculatedNumber(Number(params.newValue || 0));
    gridColumn.valueFormatter = (params) => formatNumberForDisplay(params.value, column);
  }

  if (column.type === "date") {
    gridColumn.cellEditor = "agDateStringCellEditor";
  }

  if (column.type === "select") {
    gridColumn.cellEditor = "agSelectCellEditor";
    gridColumn.cellEditorParams = { values: column.options || [] };
    gridColumn.cellRenderer = (params) => {
      const value = column.options === statusOptions
        ? normalizeOrderStatus(params.value)
        : params.value;
      return (
        <span className={`status-chip ${statusClass(value)}`}>
          {value || "未设置"}
        </span>
      );
    };
  }

  return gridColumn;
}

function ColumnHeader(props) {
  const isFiltered = props.context?.activeFilterFields?.has(props.column.getColId());
  const field = props.column.getColId();

  const openFilter = (event) => {
    event.stopPropagation();
    const optionValues = props.column.getColDef?.()?.cellEditorParams?.values;
    props.context?.openColumnFilter(
      props.column.getColId(),
      props.displayName,
      event.currentTarget.getBoundingClientRect(),
      Array.isArray(optionValues) ? optionValues : null,
    );
  };

  const startColumnSelection = (event) => {
    props.context?.startColumnSelection?.(field, event);
  };

  const updateColumnSelection = (event) => {
    props.context?.updateColumnSelection?.(field, event);
  };

  const openHeaderContextMenu = (event) => {
    event.preventDefault();
    props.context?.openHeaderContextMenu?.(field, event);
  };

  return (
    <div
      className={`column-header ${isFiltered ? "is-filtered" : ""}`}
      onMouseDown={startColumnSelection}
      onMouseEnter={updateColumnSelection}
      onContextMenu={openHeaderContextMenu}
    >
      <button
        className="column-header-label"
        type="button"
        onClick={(event) => event.preventDefault()}
        title={`${props.displayName}${isFiltered ? "（已筛选）" : ""}`}
      >
        {props.displayName}
      </button>
      <button
        className={`column-filter-button ${isFiltered ? "is-active" : ""}`}
        type="button"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={openFilter}
        title={isFiltered ? "已筛选，点击修改筛选" : "筛选"}
      >
        ▾
      </button>
    </div>
  );
}

function RowNumberHeader(props) {
  const selectAllRows = (event) => {
    event.preventDefault();
    event.stopPropagation();
    props.context?.selectAllRows?.();
  };

  return (
    <button
      className="row-number-header-button"
      type="button"
      onMouseDown={(event) => event.stopPropagation()}
      onClick={selectAllRows}
      title="选中所有可见行"
    >
      #
    </button>
  );
}

function ColumnValueFilter({ popup, rows, appliedValues, onApply, onClear, onClose }) {
  const values = useMemo(() => {
    const seen = new Set();
    const result = [];
    const addValue = (rawValue) => {
      const normalizedValue = popup.field === "status" && popup.optionValues?.includes("未完成")
        ? normalizeOrderStatus(rawValue)
        : rawValue;
      const value = filterValue(normalizedValue);
      if (seen.has(value.key)) return;
      seen.add(value.key);
      result.push(value);
    };

    if (popup.optionValues?.length) {
      popup.optionValues.forEach(addValue);
    }

    for (const row of rows) {
      addValue(row[popup.field]);
    }
    return popup.optionValues?.length
      ? result
      : result.sort((a, b) => a.label.localeCompare(b.label, "zh-CN", { numeric: true }));
  }, [popup.field, popup.optionValues, rows]);

  const [draftValues, setDraftValues] = useState(() =>
    new Set(appliedValues ? Array.from(appliedValues) : values.map(value => value.key)),
  );

  useEffect(() => {
    setDraftValues(new Set(appliedValues ? Array.from(appliedValues) : values.map(value => value.key)));
  }, [appliedValues, values]);

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const toggleValue = (key, checked) => {
    setDraftValues(current => {
      const next = new Set(current);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  return (
    <div className="column-filter-popover" style={{ left: popup.left, top: popup.top }}>
      <div className="column-filter-title">{popup.headerName}</div>
      <div className="column-filter-actions">
        <button type="button" onClick={() => setDraftValues(new Set(values.map(value => value.key)))}>全选</button>
        <button type="button" onClick={() => setDraftValues(new Set())}>清空</button>
      </div>
      <div className="column-filter-options">
        {values.map(value => (
          <label className="column-filter-option" key={value.key}>
            <input
              type="checkbox"
              checked={draftValues.has(value.key)}
              onChange={(event) => toggleValue(value.key, event.target.checked)}
            />
            <span title={value.label}>{value.label}</span>
          </label>
        ))}
      </div>
      <div className="column-filter-footer">
        <button type="button" onClick={() => onClear(popup.field)}>重置</button>
        <button type="button" onClick={onClose}>取消</button>
        <button className="is-primary" type="button" onClick={() => onApply(popup.field, draftValues, values)}>确定</button>
      </div>
    </div>
  );
}

function filterValue(value) {
  const raw = value == null || value === "" ? "" : String(value);
  return {
    key: raw,
    label: raw || "(空白)",
  };
}

function statusClass(value = "") {
  if (value === "作废") return "is-void";
  if (value === "未完成" || value === "未排产" || value === "未送" || value === "待确认" || value === "已排产" || value === "生产中" || value === "待发货") return "is-unfinished";
  if (value === "已完成") return "is-completed";
  if (value === "已送" || value === "已送货" || value === "已发货" || value.includes("签收")) return "is-delivered";
  if (value === "已开对账单") return "is-reconciled";
  if (value === "已付款") return "is-paid";
  if (value.includes("异常")) return "is-risk";
  if (value.includes("配送")) return "is-live";
  if (value.includes("装车")) return "is-waiting";
  if (value.includes("完成")) return "is-completed";
  return "";
}

function InfoPill({ label, value, wide = false }) {
  return (
    <div className={`info-pill ${wide ? "is-wide" : ""}`}>
      <span>{label}</span>
      <strong>{value || "未填写"}</strong>
    </div>
  );
}

function ProductionScheduleModal({ customer, orders, onClose, onSave }) {
  const [form, setForm] = useState({
    date: today(),
    quantity: "",
    line: "",
    status: "已排产",
    note: "",
  });
  const [saving, setSaving] = useState(false);

  const totalQuantity = useMemo(() => (
    orders.reduce((sum, order) => {
      const quantity = parseNumericValue(order[orderRemainingQuantityField] || order.quantity);
      return sum + quantity;
    }, 0)
  ), [orders]);

  const update = (field, value) => {
    setForm(current => ({ ...current, [field]: value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!form.date) return;
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal-card production-modal" onSubmit={submit}>
        <div className="modal-head">
          <div>
            <p className="eyebrow">PRODUCTION SCHEDULE</p>
            <h3>{customer.name} · 排产 {orders.length} 条订单</h3>
          </div>
          <button className="icon-button" type="button" onClick={onClose} title="关闭">
            <X size={18} />
          </button>
        </div>

        <div className="production-summary">
          <span>订单数：{orders.length}</span>
          <span>待排数量：{normalizeCalculatedNumber(totalQuantity)}</span>
        </div>

        <div className="form-grid">
          <Field label="排产日期" required>
            <input
              type="date"
              value={form.date}
              onChange={(event) => update("date", event.target.value)}
            />
          </Field>
          <Field label="本次排产数量">
            <input
              value={form.quantity}
              inputMode="decimal"
              onChange={(event) => update("quantity", event.target.value)}
              placeholder="留空则按各订单数量"
            />
          </Field>
          <Field label="员工姓名">
            <input
              value={form.line}
              onChange={(event) => update("line", event.target.value)}
              placeholder="例如：张三、李四"
            />
          </Field>
          <Field label="排产后进度">
            <select
              value={form.status}
              onChange={(event) => update("status", event.target.value)}
            >
              {productionScheduleStatusOptions.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </Field>
          <Field label="排产备注">
            <input
              value={form.note}
              onChange={(event) => update("note", event.target.value)}
              placeholder="例如：优先生产、等料"
            />
          </Field>
        </div>

        <div className="production-order-list">
          {orders.map(order => (
            <div className="production-order-row" key={order.id}>
              <div>
                <strong>{order.orderNo || order.product || order.id}</strong>
                <span>{order.product || "未填写产品"}</span>
              </div>
              <small>
                数量 {normalizeCalculatedNumber(parseNumericValue(order[orderRemainingQuantityField] || order.quantity))}
                {order.dueDate ? ` · 交期 ${order.dueDate}` : ""}
              </small>
            </div>
          ))}
        </div>

        <div className="modal-actions">
          <button className="ghost-button" type="button" onClick={onClose} disabled={saving}>
            取消
          </button>
          <button className="primary-action compact" type="submit" disabled={saving || !form.date}>
            <KanbanSquare size={17} />
            {saving ? "保存中" : "确认排产"}
          </button>
        </div>
      </form>
    </div>
  );
}

function CustomerModal({ customer, onClose, onSave }) {
  const [form, setForm] = useState(
    customer || {
      name: "",
      contact: "",
      phone: "",
      address: "",
      level: "新客户",
      paymentTerm: "",
      taxNo: "",
      note: "",
    },
  );

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const submit = (event) => {
    event.preventDefault();
    if (!form.name.trim()) return;
    onSave(form);
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal-card" onSubmit={submit}>
        <div className="modal-head">
          <div>
            <p className="eyebrow">CUSTOMER PROFILE</p>
            <h3>{customer ? "编辑客户档案" : "新增客户档案"}</h3>
          </div>
          <button className="icon-button" type="button" onClick={onClose} title="关闭">
            <X size={18} />
          </button>
        </div>

        <div className="form-grid">
          <Field label="客户名称" required>
            <input
              value={form.name}
              onChange={(event) => update("name", event.target.value)}
              placeholder="例如：某某包装厂"
            />
          </Field>
          <Field label="联系人">
            <input
              value={form.contact}
              onChange={(event) => update("contact", event.target.value)}
            />
          </Field>
          <Field label="联系电话">
            <input
              value={form.phone}
              onChange={(event) => update("phone", event.target.value)}
            />
          </Field>
          <Field label="客户等级">
            <select value={form.level} onChange={(event) => update("level", event.target.value)}>
              {customerLevelOptions.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </Field>
          <Field label="账期">
            <input
              value={form.paymentTerm}
              onChange={(event) => update("paymentTerm", event.target.value)}
              placeholder="例如：月结30天"
            />
          </Field>
          <Field label="税号">
            <input
              value={form.taxNo}
              onChange={(event) => update("taxNo", event.target.value)}
            />
          </Field>
          <Field label="送货地址" wide>
            <input
              value={form.address}
              onChange={(event) => update("address", event.target.value)}
            />
          </Field>
          <Field label="备注" wide>
            <textarea
              value={form.note}
              onChange={(event) => update("note", event.target.value)}
              rows={4}
            />
          </Field>
        </div>

        <div className="modal-actions">
          <button className="ghost-button" type="button" onClick={onClose}>
            取消
          </button>
          <button className="primary-action compact" type="submit">
            <Save size={17} />
            保存客户
          </button>
        </div>
      </form>
    </div>
  );
}

function ColumnModal({
  tableKey,
  customer,
  onClose,
  onAddColumn,
  onUpdateColumn,
  onRemoveColumn,
}) {
  const [headerName, setHeaderName] = useState("");
  const [type, setType] = useState("text");
  const [formula, setFormula] = useState("");
  const [formulaDrafts, setFormulaDrafts] = useState({});
  const customColumns = customer.customColumns?.[tableKey] || [];
  const config = tableConfigs[tableKey];

  useEffect(() => {
    setFormulaDrafts(Object.fromEntries(
      customColumns.map(column => [column.field, normalizeFormulaInput(column.formula)]),
    ));
  }, [customColumns]);

  const commitFormula = (column) => {
    if (!onUpdateColumn) return;
    const nextFormula = normalizeFormulaInput(formulaDrafts[column.field]);
    if (nextFormula === normalizeFormulaInput(column.formula)) return;
    onUpdateColumn(tableKey, column.field, { formula: nextFormula || undefined });
  };

  const submit = (event) => {
    event.preventDefault();
    if (!headerName.trim()) return;
    const normalizedFormula = normalizeFormulaInput(formula);
    onAddColumn(tableKey, {
      field: toFieldKey(headerName),
      headerName: headerName.trim(),
      type: normalizedFormula ? "number" : type,
      width: normalizedFormula || type === "number" ? 120 : 140,
      formula: normalizedFormula || undefined,
    });
    setHeaderName("");
    setType("text");
    setFormula("");
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal-card small" onSubmit={submit}>
        <div className="modal-head">
          <div>
            <p className="eyebrow">CUSTOM TABLE HEADER</p>
            <h3>{customer.name} · {config.label}</h3>
          </div>
          <button className="icon-button" type="button" onClick={onClose} title="关闭">
            <X size={18} />
          </button>
        </div>

        <div className="column-manager">
          <div>
            <h4>默认表头</h4>
            <div className="tag-wrap">
              {config.defaultColumns.map((column) => (
                <span className="column-tag locked" key={column.field}>
                  {column.headerName}
                </span>
              ))}
            </div>
          </div>

          <div>
            <h4>当前客户自定义表头</h4>
            <div className="formula-input-list">
              {customColumns.length ? (
                customColumns.map((column) => (
                  <div className="column-formula-row" key={column.field}>
                    <div className="column-formula-name">
                      <span>{column.headerName}</span>
                      {normalizeFormulaInput(column.formula) ? <small>公式</small> : null}
                    </div>
                    <input
                      className="column-formula-input"
                      value={formulaDrafts[column.field] ?? ""}
                      onChange={(event) =>
                        setFormulaDrafts(current => ({ ...current, [column.field]: event.target.value }))
                      }
                      onBlur={() => commitFormula(column)}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter") return;
                        event.preventDefault();
                        event.currentTarget.blur();
                      }}
                      placeholder="=采购数量*单价"
                      aria-label={`${column.headerName}公式`}
                    />
                    <button
                      className="icon-button column-delete-button"
                      type="button"
                      onClick={() => onRemoveColumn(tableKey, column.field)}
                      title="删除该自定义表头"
                    >
                      <X size={15} />
                    </button>
                  </div>
                ))
              ) : (
                <span className="muted-text">暂无自定义表头</span>
              )}
            </div>
          </div>

          <div className="add-column-row">
            <Field label="新表头名称">
              <input
                value={headerName}
                onChange={(event) => setHeaderName(event.target.value)}
                placeholder="例如：图纸编号、模具费、司机"
              />
            </Field>
            <Field label="字段类型">
              <select value={type} onChange={(event) => setType(event.target.value)}>
                <option value="text">文本</option>
                <option value="number">数字</option>
                <option value="date">日期</option>
              </select>
            </Field>
            <Field label="公式（可选）" wide>
              <input
                value={formula}
                onChange={(event) => setFormula(event.target.value)}
                placeholder="=采购数量*单价"
              />
            </Field>
          </div>
        </div>

        <div className="modal-actions">
          <button className="ghost-button" type="button" onClick={onClose}>
            完成
          </button>
          <button className="primary-action compact" type="submit">
            <FilePlus2 size={17} />
            添加表头
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, required = false, wide = false, children }) {
  return (
    <label className={`field ${wide ? "is-wide" : ""}`}>
      <span>
        {label}
        {required ? <b>*</b> : null}
      </span>
      {children}
    </label>
  );
}

function DashboardView({ customers, alertMap, onCreateCustomer, onSelectCustomer }) {
  const overdueOrders = useMemo(() => {
    const todayTs = new Date().setHours(0, 0, 0, 0);
    const result = [];
    for (const customer of customers) {
      for (const order of customer.orders || []) {
        if (!isOpenOrder(order.status) || !order.dueDate) continue;
        const dueTs = new Date(order.dueDate).setHours(0, 0, 0, 0);
        if (dueTs < todayTs) {
          result.push({ ...order, customerName: customer.name, customerId: customer.id, overdue: true });
        } else if (dueTs <= todayTs + 3 * 86400000) {
          result.push({ ...order, customerName: customer.name, customerId: customer.id, overdue: false });
        }
      }
    }
    result.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    return result.slice(0, 20);
  }, [customers]);

  const recentOrders = useMemo(() => {
    return customers.flatMap(c => (c.orders || []).map(o => ({ ...o, customerName: c.name, customerId: c.id })))
      .filter(o => o.date)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 10);
  }, [customers]);

  return (
    <div className="dashboard-view">
      <div className="dashboard-hero">
        <div className="dashboard-hero-text">
          <h2 style={{ fontSize: "clamp(22px, 2.5vw, 32px)", marginBottom: 8, lineHeight: 1.2 }}>
            {customers.length ? `${customers.length} 个客户 · ${customers.flatMap(c => c.orders || []).filter(o => isOpenOrder(o.status)).length} 个进行中订单` : "欢迎使用泡沫厂客户管理系统"}
          </h2>
          <p style={{ color: "var(--muted)", margin: 0 }}>选择一个客户开始操作，或使用全局搜索快速定位订单/送货单</p>
        </div>
        <button className="primary-action compact" type="button" onClick={onCreateCustomer} style={{ padding: "0 20px", minHeight: 40 }}>
          <UserRoundPlus size={18} />
          新增客户
        </button>
      </div>

      {overdueOrders.length > 0 && (
        <section className="dashboard-section">
          <h4 style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <AlertTriangle size={16} style={{ color: "var(--red)" }} />
            待跟进订单（逾期 & 即将到期）
          </h4>
          <div className="dashboard-order-list">
            {overdueOrders.map(order => (
              <button
                key={order.id}
                className={`dashboard-order-row ${order.overdue ? "overdue" : "warning"}`}
                type="button"
                onClick={() => onSelectCustomer(order.customerId)}
              >
                <span className="dashboard-order-customer">{order.customerName}</span>
                <span className="dashboard-order-no">{order.orderNo || order.product}</span>
                <span className="dashboard-order-product">{order.product}</span>
                <span className="dashboard-order-qty">{order.quantity || 0}</span>
                <span className="dashboard-order-due" style={{ color: order.overdue ? "var(--red)" : "var(--amber)" }}>
                  {order.dueDate}
                  {order.overdue ? " · 已逾期" : " · 即将到期"}
                </span>
                <span className={`status-chip ${statusClass(order.status)}`}>{order.status}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {recentOrders.length > 0 && (
        <section className="dashboard-section">
          <h4>最近订单</h4>
          <div className="dashboard-order-list">
            {recentOrders.map(order => (
              <button
                key={order.id}
                className="dashboard-order-row"
                type="button"
                onClick={() => onSelectCustomer(order.customerId)}
              >
                <span className="dashboard-order-customer">{order.customerName}</span>
                <span className="dashboard-order-no">{order.orderNo || order.product}</span>
                <span className="dashboard-order-product">{order.product}</span>
                <span className="dashboard-order-qty">{order.quantity || 0}</span>
                <span className="dashboard-order-due">{order.date}</span>
                <span className={`status-chip ${statusClass(order.status)}`}>{order.status}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {customers.length === 0 && (
        <div className="dashboard-empty">
          <Boxes size={48} style={{ color: "var(--muted)", marginBottom: 16 }} />
          <p style={{ color: "var(--muted)", fontSize: 16 }}>暂无客户数据</p>
          <button className="primary-action compact" type="button" onClick={onCreateCustomer} style={{ marginTop: 12 }}>
            <UserRoundPlus size={18} />
            创建第一个客户
          </button>
        </div>
      )}
    </div>
  );
}

function SettingsModal({ settings, onClose, onSave }) {
  const [form, setForm] = useState({
    companyName: settings.companyName || "",
    companyAddress: settings.companyAddress || "",
    companyPhone: settings.companyPhone || "",
    companyTaxNo: settings.taxNo || "",
    defaultDueDays: settings.defaultDueDays || "7",
    orderNoPrefix: settings.orderNoPrefix || "",
  });

  const update = (field, value) => setForm(c => ({ ...c, [field]: value }));

  const submit = (e) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal-card" onSubmit={submit}>
        <div className="modal-head">
          <div>
            <p className="eyebrow">SYSTEM SETTINGS</p>
            <h3>系统设置</h3>
          </div>
          <button className="icon-button" type="button" onClick={onClose} title="关闭">
            <X size={18} />
          </button>
        </div>

        <div className="settings-section">
          <h4>公司信息（用于送货单打印）</h4>
          <div className="settings-grid">
            <label className="field">
              <span>公司名称</span>
              <input value={form.companyName} onChange={e => update("companyName", e.target.value)} placeholder="例如：XX泡沫包装有限公司" />
            </label>
            <label className="field">
              <span>联系电话</span>
              <input value={form.companyPhone} onChange={e => update("companyPhone", e.target.value)} placeholder="例如：0757-8888 8888" />
            </label>
            <label className="field" style={{ gridColumn: "1 / -1" }}>
              <span>公司地址</span>
              <input value={form.companyAddress} onChange={e => update("companyAddress", e.target.value)} placeholder="例如：佛山市南海区XX工业园" />
            </label>
            <label className="field">
              <span>税号</span>
              <input value={form.companyTaxNo} onChange={e => update("companyTaxNo", e.target.value)} placeholder="纳税人识别号" />
            </label>
          </div>
        </div>

        <div className="settings-section">
          <h4>订单默认设置</h4>
          <div className="settings-grid">
            <label className="field">
              <span>默认交期天数（新增订单时交期=今天+N天）</span>
              <input type="number" value={form.defaultDueDays} onChange={e => update("defaultDueDays", e.target.value)} min="0" max="365" />
            </label>
            <label className="field">
              <span>订单号前缀（自动生成，留空则不自动生成）</span>
              <input value={form.orderNoPrefix} onChange={e => update("orderNoPrefix", e.target.value)} placeholder="例如：KH-" />
            </label>
          </div>
        </div>

        <div className="modal-actions">
          <button className="ghost-button" type="button" onClick={onClose}>取消</button>
          <button className="primary-action compact" type="submit">
            <Save size={17} />
            保存设置
          </button>
        </div>
      </form>
    </div>
  );
}

function KanbanBoard({ customer, onStatusChange, onSelectOrder }) {
  const orders = (customer.orders || []).filter(o => normalizeOrderStatus(o.status) !== "已付款");
  const columns = statusOptions.filter(s => s !== "已付款");
  const ordersByStatus = Object.fromEntries(columns.map(s => [s, []]));
  for (const order of orders) {
    const s = normalizeOrderStatus(order.status);
    if (ordersByStatus[s]) ordersByStatus[s].push(order);
  }

  return (
    <div className="kanban-board">
      {columns.map(status => (
        <div className="kanban-column" key={status}>
          <div className="kanban-column-header">
            <span className={`status-chip ${statusClass(status)}`} style={{ fontSize: 12 }}>{status}</span>
            <span className="count">{ordersByStatus[status]?.length || 0}</span>
          </div>
          <div className="kanban-column-body">
            {ordersByStatus[status]?.map(order => (
              <div
                className="kanban-card"
                key={order.id}
                draggable
                onDragStart={(e) => e.dataTransfer.setData("orderId", order.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const orderId = e.dataTransfer.getData("orderId");
                  if (orderId) onStatusChange(orderId, status);
                }}
                onClick={() => onSelectOrder(order.id)}
              >
                <strong>{order.orderNo || order.product}</strong>
                <small>{order.product || ""} · {order.quantity || 0} 件</small>
                <small>{order.dueDate ? `交期 ${order.dueDate}` : ""}</small>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function generateStatement(customer, settings = {}) {
  const billableOrders = (customer.orders || []).filter(o => {
    const s = normalizeOrderStatus(o.status);
    return s === "已送货" || s === "已开对账单" || s === "已付款";
  });
  if (!billableOrders.length) {
    alert(`客户 "${customer.name}" 没有可对账的订单（需要已送货/已开对账单/已付款状态）。`);
    return;
  }

  const total = billableOrders.reduce((sum, o) => sum + Number(o.amount || 0), 0);
  const companyName = settings.companyName || "泡沫厂";
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>对账单 - ${customer.name}</title>
<style>
  body { font-family: "PingFang SC","Microsoft YaHei",sans-serif; padding:40px; max-width:800px; margin:0 auto; color:#111; font-size:13px; }
  h1 { text-align:center; font-size:20px; margin-bottom:4px; }
  .subtitle { text-align:center; color:#666; font-size:12px; margin-bottom:20px; }
  .info { display:flex; justify-content:space-between; margin-bottom:16px; }
  .info div { line-height:1.8; }
  table { width:100%; border-collapse:collapse; margin-bottom:16px; }
  th { background:#f5f5f5; text-align:left; padding:8px 10px; border-bottom:2px solid #333; font-size:12px; }
  td { padding:8px 10px; border-bottom:1px solid #ddd; }
  .num { text-align:right; }
  .total { text-align:right; font-weight:700; font-size:15px; margin-top:12px; }
  .footer { margin-top:24px; padding-top:12px; border-top:1px solid #ddd; display:flex; justify-content:space-between; color:#666; font-size:12px; }
  @media print { body { padding:20px; } }
</style></head><body>
<h1>对 账 单</h1>
<p class="subtitle">${companyName}</p>
<div class="info">
  <div><strong>客户：</strong>${customer.name}<br/><strong>联系人：</strong>${customer.contact || "-"}<br/><strong>电话：</strong>${customer.phone || "-"}</div>
  <div><strong>日期：</strong>${today()}<br/><strong>账期：</strong>${customer.paymentTerm || "-"}<br/><strong>地址：</strong>${customer.address || "-"}</div>
</div>
<table>
<thead><tr><th>订单号</th><th>日期</th><th>产品</th><th class="num">数量</th><th class="num">金额</th><th>状态</th></tr></thead>
<tbody>
${billableOrders.map(o => `<tr><td>${o.orderNo || "-"}</td><td>${o.date || "-"}</td><td>${o.product || "-"}</td><td class="num">${o.quantity || 0}</td><td class="num">${Number(o.amount || 0).toFixed(2)}</td><td>${normalizeOrderStatus(o.status)}</td></tr>`).join("")}
</tbody>
</table>
<p class="total">合计金额：¥ ${total.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</p>
<div class="footer">
  <div>制单人：___________</div>
  <div>客户确认：___________</div>
</div>
</body></html>`;

  const w = window.open("", "_blank", "width=900,height=700");
  if (w) { w.document.write(html); w.document.close(); }
}

export default App;
