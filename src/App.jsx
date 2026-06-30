import {
  createContext,
  useCallback,
  useContext,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { makeId, today } from "./lib/utils.js";
import { api } from "./lib/api.js";
import { OrderImportButton } from "./components/OrderImportButton.jsx";
import { exportTableToExcel } from "./lib/exporter.js";
import { exportBackup, importBackup } from "./lib/backup.js";
import { DeliveryPrintModal } from "./components/DeliveryPrintModal.jsx";
import LoginScreen from "./components/LoginScreen.jsx";
import BusinessZoneHub from "./components/BusinessZoneHub.jsx";
import PendingAccessScreen from "./components/PendingAccessScreen.jsx";
import EmployeeWorkspacePlaceholder from "./components/EmployeeWorkspacePlaceholder.jsx";
import { ColumnHeader } from "./components/ColumnHeader.jsx";
import { RowNumberHeader } from "./components/RowNumberHeader.jsx";
import { ColumnValueFilter } from "./components/ColumnValueFilter.jsx";
import { InfoPill } from "./components/InfoPill.jsx";
import { Field } from "./components/Field.jsx";
import { CustomerStatisticsPanel } from "./components/CustomerStatisticsPanel.jsx";
import { DashboardView } from "./components/DashboardView.jsx";
import { KanbanBoard } from "./components/KanbanBoard.jsx";
import { MobileDisplayFieldPicker } from "./components/MobileDisplayFieldPicker.jsx";
import { ProductionScheduleModal } from "./components/modals/ProductionScheduleModal.jsx";
import { CustomerModal } from "./components/modals/CustomerModal.jsx";
import { ColumnModal } from "./components/modals/ColumnModal.jsx";
import { SettingsModal } from "./components/modals/SettingsModal.jsx";
import { MobileDisplaySettingsModal } from "./components/modals/MobileDisplaySettingsModal.jsx";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { statusClass } from "./lib/app-utils.jsx";
import { normalizeDesktopRole, isDesktopBusinessUser, desktopRoleLabel } from "./lib/auth.js";
import {
  createTranslator,
  formatCurrencyForLanguage,
  getGridLocaleText,
  languageOptions,
  normalizeLanguage,
} from "./lib/i18n.js";
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
  ArrowLeft,
  Archive,
  Building2,
  Printer,
  Copy,
  ClipboardPaste,
  Eraser,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Factory,
  KeyRound,
  LogOut,
  RotateCcw,
  Pencil,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";
import {
  statusOptions,
  closedOrderStatuses,
  isOpenOrder,
  normalizeOrderStatus,
  statusTransitions,
  deliveryStatusOptions,
  customerLevelOptions,
  materialOptions,
  unitOptions,
} from "./lib/statusWorkflow.js";
import {
  orderDefaultColumns,
  orderDeliveryTrackingColumns,
  productionScheduleColumns,
  knownOrderDataColumns,
  deliveryQuantityField,
  orderDeliveredQuantityField,
  orderRemainingQuantityField,
  finalDeliveryField,
  linkedOrderIdField,
  linkedOrderQuantitySourceField,
  deliveryOrderFieldPrefix,
  finalDeliveryStatusOptions,
  productionScheduleStatusOptions,
  productionScheduleDateField,
  productionScheduleQuantityField,
  productionLineField,
  productionNoteField,
  deliveryQuantityColumn,
} from "./lib/columnDefs.js";
import { tableConfigs } from "./config/tableConfigs.js";

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

const gridTheme = themeQuartz.withParams({
  accentColor: "#14B8A6",
  backgroundColor: "#0F1723",
  borderColor: "#33485F",
  browserColorScheme: "dark",
  chromeBackgroundColor: "#162236",
  columnBorder: false,
  foregroundColor: "#F8FAFC",
  headerBackgroundColor: "#1D2B42",
  headerFontWeight: 600,
  oddRowBackgroundColor: "rgba(56, 189, 248, 0.035)",
  rowBorder: false,
  spacing: 8,
});

const defaultTranslator = createTranslator("zh");
const I18nContext = createContext({ language: "zh", t: defaultTranslator });
const desktopSessionStorageKey = "foam-crm-desktop-session";
const desktopZoneStorageKey = "foam-crm-desktop-zone";
const defaultMobileDisplaySettings = {
  cardFields: ["_customerName", "orderNo", "status", "product", "quantity", "dueDate"],
  detailFields: [
    "_customerName",
    "orderNo",
    "status",
    "date",
    "product",
    "quantity",
    "amount",
    "dueDate",
    "productionDate",
    "productionQuantity",
    "productionLine",
    "deliveredQuantity",
    "remainingQuantity",
    "completionTime",
    "completionOperator",
    "completionNote",
  ],
};

export function useI18n() {
  return useContext(I18nContext);
}

function readStoredDesktopSession() {
  try {
    return JSON.parse(localStorage.getItem(desktopSessionStorageKey) || "null");
  } catch {
    return null;
  }
}

function writeStoredDesktopSession(user) {
  if (!user?.token) {
    localStorage.removeItem(desktopSessionStorageKey);
    return;
  }
  localStorage.setItem(desktopSessionStorageKey, JSON.stringify(user));
}

const MAX_UNDO_STEPS = 50;
const UNGROUPED_CUSTOMER_GROUP = "未分组";
const CUSTOMER_DRAG_HOLD_MS = 420;
const SYNC_POLL_INTERVAL_MS = 3000;

function normalizeCustomerGroupList(groups = []) {
  const seen = new Set();
  const result = [];
  for (const group of groups) {
    const value = String(group || "").trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function customerGroupLevel(customer) {
  return customer?.level || UNGROUPED_CUSTOMER_GROUP;
}

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
  const tableKeys = Object.keys(tableConfigs).filter(
    (tableKey) => !tableConfigs[tableKey].sourceTableKey,
  );
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
  return (customers || []).map((customer) => ({
    ...customer,
    products: customer.products || [],
    orders: (customer.orders || []).map((order) => ({
      ...order,
      status: normalizeOrderStatus(order.status),
    })),
    deliveries: normalizeDeliveryRows(customer.deliveries || []),
    materialCosts: customer.materialCosts || [],
    costEntries: customer.costEntries || [],
    statements: customer.statements || [],
    payments: customer.payments || [],
  }));
}

function summarizeCustomerOrders(customer = {}) {
  const summary = {
    orderAmount: 0,
    unfinishedOrders: 0,
    completedOrders: 0,
    statementAmount: 0,
    paidAmount: 0,
    unpaidAmount: 0,
  };

  for (const order of customer.orders || []) {
    const amount = parseNumericValue(order.amount);
    const status = normalizeOrderStatus(order.status);
    summary.orderAmount += amount;
    if (isOpenOrder(status)) summary.unfinishedOrders += 1;
    if (["已完成", "已开送货单", "部分送货", "已送货", "已开对账单", "已付款"].includes(status)) {
      summary.completedOrders += 1;
    }
  }

  summary.statementAmount = (customer.statements || []).reduce(
    (sum, row) => sum + parseNumericValue(row.amount),
    0,
  );
  summary.paidAmount = (customer.payments || []).reduce(
    (sum, row) => sum + parseNumericValue(row.amount),
    0,
  );
  summary.unpaidAmount = Math.max(summary.statementAmount - summary.paidAmount, 0);
  return summary;
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

const formatCurrency = (value, language = "zh") => formatCurrencyForLanguage(value, language);

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

function formatDateTimeForDisplay(value) {
  if (value === "" || value == null) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function getImageSource(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value !== "object") return "";
  return value.dataUrl || value.url || value.src || "";
}

function formatGridValueForDisplay(value, column = {}, t = defaultTranslator) {
  if (column.type === "datetime") return formatDateTimeForDisplay(value);
  if (column.type === "image") return getImageSource(value) ? t("有照片") : "";
  if (value && typeof value === "object") {
    if (getImageSource(value)) return t("有照片");
    return JSON.stringify(value);
  }
  return value ?? "";
}

const formulaReferenceAliases = {
  采购数量: "quantity",
  订单数量: "quantity",
  订购数量: "quantity",
  数量: "quantity",
  Quantity: "quantity",
  "Order Quantity": "quantity",
  "Purchase Quantity": "quantity",
  单价: "unitPrice",
  UnitPrice: "unitPrice",
  "Unit Price": "unitPrice",
  金额: "amount",
  订单金额: "amount",
  Amount: "amount",
  "Order Amount": "amount",
  送货数量: deliveryQuantityField,
  DeliveryQuantity: deliveryQuantityField,
  "Delivery Quantity": deliveryQuantityField,
  已送数量: orderDeliveredQuantityField,
  DeliveredQuantity: orderDeliveredQuantityField,
  "Delivered Quantity": orderDeliveredQuantityField,
  剩余数量: orderRemainingQuantityField,
  RemainingQuantity: orderRemainingQuantityField,
  "Remaining Quantity": orderRemainingQuantityField,
};

function normalizeFormulaInput(formula) {
  const text = String(formula || "").trim();
  if (!text) return "";
  return text.startsWith("=") ? text : `=${text}`;
}

function formulaKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
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
      tokens.push({
        type: "operator",
        value: char === "×" || char === "x" || char === "X" ? "*" : char,
      });
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
      end < expression.length &&
      !/\s/.test(expression[end]) &&
      !"+-*/()[]×xX".includes(expression[end])
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
      tokens[position]?.type === "operator" &&
      (tokens[position].value === "*" || tokens[position].value === "/")
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
      tokens[position]?.type === "operator" &&
      (tokens[position].value === "+" || tokens[position].value === "-")
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
  const formulaColumns = columns.filter((column) => normalizeFormulaInput(column.formula));
  if (!formulaColumns.length) return rows;

  const rowIdSet = normalizeRowIdSet(rowIds);
  const referenceMap = buildFormulaReferenceMap(columns);
  return rows.map((row) => {
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
  const text = String(value ?? "")
    .trim()
    .replace(/,/g, "");
  return text !== "" && Number.isFinite(Number(text));
}

function getCustomerTableColumns(customer, tableKey) {
  const config = tableConfigs[tableKey];
  const defaultFields = new Set(config.defaultColumns.map((column) => column.field));
  return [
    ...config.defaultColumns,
    ...(customer.customColumns?.[tableKey] || []).filter(
      (column) => !defaultFields.has(column.field),
    ),
  ];
}

function viewSourceTableKey(viewKey) {
  return tableConfigs[viewKey]?.sourceTableKey || viewKey;
}

function isDerivedTableView(viewKey) {
  return Boolean(tableConfigs[viewKey]?.sourceTableKey);
}

function getViewHiddenColumnSet(customer, viewKey) {
  return new Set(customer?.customColumns?.viewHiddenColumns?.[viewKey] || []);
}

function getCustomerViewColumns(customer, viewKey) {
  const config = tableConfigs[viewKey];
  if (!config) return [];
  const sourceTableKey = viewSourceTableKey(viewKey);
  const defaultFields = new Set(config.defaultColumns.map((column) => column.field));
  const hiddenFields = getViewHiddenColumnSet(customer, viewKey);
  const sourceCustomColumns = (customer?.customColumns?.[sourceTableKey] || []).filter(
    (column) => !defaultFields.has(column.field),
  );
  const viewCustomColumns =
    sourceTableKey === viewKey
      ? []
      : (customer?.customColumns?.[viewKey] || []).filter(
          (column) => !defaultFields.has(column.field),
        );

  const seen = new Set();
  return [...config.defaultColumns, ...sourceCustomColumns, ...viewCustomColumns].filter(
    (column) => {
      if (!column?.field || hiddenFields.has(column.field) || seen.has(column.field)) return false;
      seen.add(column.field);
      return true;
    },
  );
}

function getCustomerFormulaColumns(customer, tableKey) {
  const relatedViewColumns = Object.keys(tableConfigs)
    .filter((viewKey) => tableConfigs[viewKey]?.sourceTableKey === tableKey)
    .flatMap((viewKey) => customer?.customColumns?.[viewKey] || []);
  const columns = [...getCustomerTableColumns(customer, tableKey), ...relatedViewColumns];
  const seen = new Set();
  return columns.filter((column) => {
    if (!column?.field || seen.has(column.field)) return false;
    seen.add(column.field);
    return true;
  });
}

function normalizeFieldList(value, fallback = []) {
  if (!Array.isArray(value)) return fallback;
  return Array.from(new Set(value.map((field) => String(field || "").trim()).filter(Boolean)));
}

function normalizeMobileDisplaySettings(value = {}) {
  const data = value && typeof value === "object" ? value : {};
  return {
    cardFields: normalizeFieldList(data.cardFields, defaultMobileDisplaySettings.cardFields),
    detailFields: normalizeFieldList(data.detailFields, defaultMobileDisplaySettings.detailFields),
  };
}

function getCustomerMobileDisplaySettings(customer, fallback = defaultMobileDisplaySettings) {
  return normalizeMobileDisplaySettings(customer?.customColumns?.mobileDisplaySettings || fallback);
}

function buildMobileOrderFieldOptions(customers = []) {
  const fields = new Map([
    ["_customerName", { field: "_customerName", label: "客户" }],
    ["orderNo", { field: "orderNo", label: "订单号" }],
  ]);
  const addColumn = (column = {}) => {
    if (!column.field || fields.has(column.field)) return;
    fields.set(column.field, {
      field: column.field,
      label: column.headerName || column.field,
      type: column.type,
    });
  };

  tableConfigs.orders.defaultColumns.forEach(addColumn);
  knownOrderDataColumns.forEach(addColumn);
  productionScheduleColumns.forEach(addColumn);
  orderDeliveryTrackingColumns.forEach(addColumn);
  for (const customer of customers) {
    (customer.customColumns?.orders || []).forEach(addColumn);
    (customer.orders || []).forEach((order) => {
      Object.keys(order || {}).forEach((field) => {
        if (field === "id" || field.startsWith("_") || fields.has(field)) return;
        fields.set(field, { field, label: field });
      });
    });
  }
  return Array.from(fields.values());
}

function buildCustomerMobileOrderFieldOptions(customer) {
  return buildMobileOrderFieldOptions(customer ? [customer] : []);
}

function applyCustomerTableFormulas(
  customer,
  tableKey,
  rows,
  customColumns = customer?.customColumns,
  rowIds = null,
) {
  return applyTableFormulas(
    rows,
    getCustomerFormulaColumns({ ...(customer || {}), customColumns }, tableKey),
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
  if (text === "部分签收" || text === "部分送货") {
    return "部分签收";
  }
  if (
    status === "已送" ||
    status === "已送货" ||
    status === "已发货" ||
    String(status).includes("签收")
  ) {
    return "已签收";
  }
  return "未送";
}

function isEffectiveDelivery(delivery) {
  return isFinalDelivery(delivery) && normalizeFinalDeliveryStatus(delivery.status) === "已签收";
}

function isSignedDelivery(delivery) {
  return (
    isFinalDelivery(delivery) &&
    (normalizeFinalDeliveryStatus(delivery.status) === "已签收" || Boolean(delivery?.signedAt))
  );
}

function isReconciledDelivery(delivery) {
  return Boolean(delivery?.statementNo || delivery?.reconciledAt);
}

function isLockedDelivery(delivery) {
  return isSignedDelivery(delivery) || isReconciledDelivery(delivery);
}

function appendAuditLog(log = "", message = "") {
  const line = `[${new Date().toLocaleString()}] ${message}`;
  return [String(log || "").trim(), line].filter(Boolean).join("\n");
}

function protectSignedDeliveries(previousRows = [], nextRows = []) {
  const previousById = new Map(previousRows.map((row) => [row.id, row]));
  let blocked = false;
  const rows = nextRows.map((row) => {
    const previous = previousById.get(row.id);
    if (!previous || !isLockedDelivery(previous)) return row;
    const allowed = {
      __selected: row.__selected,
    };
    if (JSON.stringify({ ...previous, ...allowed }) !== JSON.stringify(row)) blocked = true;
    return { ...previous, ...allowed };
  });
  return { rows, blocked };
}

function applyMaterialPriceHistory(previousRows = [], nextRows = []) {
  const previousById = new Map(previousRows.map((row) => [row.id, row]));
  return nextRows.map((row) => {
    const previous = previousById.get(row.id);
    if (!previous) return row;
    const previousCost = parseNumericValue(previous.unitCost);
    const nextCost = parseNumericValue(row.unitCost);
    if (previousCost === nextCost) return row;
    return {
      ...row,
      priceUpdatedAt: new Date().toISOString(),
      priceHistory: appendAuditLog(
        previous.priceHistory,
        `成本单价：${previousCost} -> ${nextCost}`,
      ),
    };
  });
}

function normalizeDeliveryRows(deliveries = []) {
  return deliveries.map((delivery) => {
    const hasFinalFlag = Object.prototype.hasOwnProperty.call(delivery, finalDeliveryField);
    const finalDelivery = hasFinalFlag ? Boolean(delivery[finalDeliveryField]) : true;

    return {
      ...delivery,
      [finalDeliveryField]: finalDelivery,
      status: finalDelivery
        ? normalizeFinalDeliveryStatus(delivery.status)
        : delivery.status || "未送",
    };
  });
}

function deliveryGroupKey(delivery) {
  return String(delivery?.deliveryNo || delivery?.id || "未编号送货单");
}

function getDeliveryGroupStatus(deliveries = []) {
  if (!deliveries.length) return "未送";
  const statuses = deliveries.map((delivery) => normalizeFinalDeliveryStatus(delivery.status));
  if (statuses.every((status) => status === "已签收")) return "已签收";
  if (statuses.some((status) => status === "已签收" || status === "部分签收")) return "部分签收";
  if (statuses.every((status) => status === "作废")) return "作废";
  return "未送";
}

function getOrderLabel(order, fallback = "") {
  return order?.orderNo || order?.product || fallback || order?.id || "未编号订单";
}

function getDeliveryQuantitySourceField(delivery = {}) {
  return delivery?.[linkedOrderQuantitySourceField] || "quantity";
}

function getOrderQuantityForDelivery(order, delivery = {}) {
  if (!order) return 0;
  return parseNumericValue(order[getDeliveryQuantitySourceField(delivery)]);
}

function findEffectiveDeliveryOverages(orders = [], deliveries = []) {
  const ordersById = new Map(orders.map((order) => [order.id, order]));
  const deliveryTotalsByOrderAndSource = new Map();

  for (const delivery of deliveries) {
    if (!isEffectiveDelivery(delivery)) continue;
    const orderId = delivery[linkedOrderIdField];
    if (!orderId) continue;
    const sourceField = getDeliveryQuantitySourceField(delivery);
    const key = `${orderId}::${sourceField}`;
    deliveryTotalsByOrderAndSource.set(key, {
      orderId,
      sourceField,
      deliveredQuantity:
        (deliveryTotalsByOrderAndSource.get(key)?.deliveredQuantity || 0) +
        parseNumericValue(delivery[deliveryQuantityField]),
    });
  }

  return Array.from(deliveryTotalsByOrderAndSource.values())
    .map(({ orderId, deliveredQuantity, sourceField }) => {
      const order = ordersById.get(orderId);
      if (!order) return null;
      const orderQuantity = parseNumericValue(order[sourceField]);
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

function buildDeliveryFinalizePreview(customer, selectedDrafts, t = defaultTranslator) {
  const orders = customer?.orders || [];
  const deliveries = customer?.deliveries || [];
  const ordersById = new Map(orders.map((order) => [order.id, order]));
  const selectedDraftIds = new Set(selectedDrafts.map((delivery) => delivery.id));
  const effectiveDeliveredByOrderAndSource = new Map();
  const selectedByOrderAndSource = new Map();
  let unlinkedQuantity = 0;

  for (const delivery of deliveries) {
    if (selectedDraftIds.has(delivery.id) || !isEffectiveDelivery(delivery)) continue;
    const orderId = delivery[linkedOrderIdField];
    if (!orderId) continue;
    const sourceField = getDeliveryQuantitySourceField(delivery);
    const key = `${orderId}::${sourceField}`;
    effectiveDeliveredByOrderAndSource.set(
      key,
      (effectiveDeliveredByOrderAndSource.get(key) || 0) +
        parseNumericValue(delivery[deliveryQuantityField]),
    );
  }

  const draftSummaries = selectedDrafts.map((delivery) => {
    const orderId = delivery[linkedOrderIdField];
    const order = ordersById.get(orderId);
    const sourceField = getDeliveryQuantitySourceField(delivery);
    const summaryKey = `${orderId}::${sourceField}`;
    const quantity = parseNumericValue(delivery[deliveryQuantityField]);
    const deliveredBefore = orderId ? effectiveDeliveredByOrderAndSource.get(summaryKey) || 0 : 0;
    const orderQuantity = order ? getOrderQuantityForDelivery(order, delivery) : 0;
    const remainingBefore = order ? Math.max(orderQuantity - deliveredBefore, 0) : null;

    if (orderId && order) {
      const current = selectedByOrderAndSource.get(summaryKey);
      selectedByOrderAndSource.set(summaryKey, {
        orderId,
        sourceField,
        selectedQuantity: (current?.selectedQuantity || 0) + quantity,
      });
    } else {
      unlinkedQuantity += quantity;
    }

    return {
      id: delivery.id,
      deliveryNo: delivery.deliveryNo || t("未填写送货单号"),
      date: delivery.date || "",
      orderId,
      orderLabel: order ? getOrderLabel(order, orderId) : delivery.orderNo || t("未关联订单"),
      product: order?.product || delivery[deliveryOrderField("product")] || "",
      quantity,
      deliveredBefore,
      remainingBefore,
      sourceField,
    };
  });

  const orderSummaries = Array.from(selectedByOrderAndSource.values()).map(
    ({ orderId, selectedQuantity, sourceField }) => {
      const order = ordersById.get(orderId);
      const deliveredBefore =
        effectiveDeliveredByOrderAndSource.get(`${orderId}::${sourceField}`) || 0;
      const orderQuantity = parseNumericValue(order?.[sourceField]);
      const remainingBefore = Math.max(orderQuantity - deliveredBefore, 0);
      return {
        orderId,
        orderLabel: getOrderLabel(order, orderId),
        orderQuantity,
        deliveredBefore,
        remainingBefore,
        selectedQuantity,
        sourceField,
      };
    },
  );

  return {
    draftSummaries,
    orderSummaries,
    deliveryNos: [
      ...new Set(selectedDrafts.map((delivery) => delivery.deliveryNo || t("未填写送货单号"))),
    ],
    totalQuantity: selectedDrafts.reduce(
      (sum, delivery) => sum + parseNumericValue(delivery[deliveryQuantityField]),
      0,
    ),
    unlinkedQuantity,
    overDelivered: orderSummaries.filter(
      (item) => item.selectedQuantity > item.remainingBefore + 0.0000001,
    ),
  };
}

function formatDeliveryFinalizeMessage(preview, t = defaultTranslator) {
  const orderLines = preview.orderSummaries.slice(0, 8).map((item) =>
    t("{orderLabel}：本次 {selectedQuantity} / 剩余 {remainingQuantity}", {
      orderLabel: item.orderLabel,
      selectedQuantity: normalizeCalculatedNumber(item.selectedQuantity),
      remainingQuantity: normalizeCalculatedNumber(item.remainingBefore),
    }),
  );
  const draftLines = preview.draftSummaries
    .slice(0, 8)
    .map(
      (item) =>
        `${item.deliveryNo} · ${item.orderLabel} · ${normalizeCalculatedNumber(item.quantity)}`,
    );
  const moreDrafts =
    preview.draftSummaries.length > draftLines.length
      ? t("\n另有 {count} 条明细未展示", {
          count: preview.draftSummaries.length - draftLines.length,
        })
      : "";
  const unlinkedLine =
    preview.unlinkedQuantity > 0
      ? t("\n未关联订单数量：{quantity}", {
          quantity: normalizeCalculatedNumber(preview.unlinkedQuantity),
        })
      : "";

  return [
    t("将生成 {deliveryCount} 张送货单，共 {lineCount} 条明细。", {
      deliveryCount: preview.deliveryNos.length,
      lineCount: preview.draftSummaries.length,
    }),
    t("送货数量合计：{quantity}{unlinkedLine}", {
      quantity: normalizeCalculatedNumber(preview.totalQuantity),
      unlinkedLine,
    }),
    orderLines.length ? t("\n关联订单预览：\n{lines}", { lines: orderLines.join("\n") }) : "",
    draftLines.length
      ? t("\n草稿明细：\n{lines}{moreDrafts}", { lines: draftLines.join("\n"), moreDrafts })
      : "",
    t("\n确认无误后，送货单会进入“送货单”页面，默认状态为“未送”。"),
  ]
    .filter(Boolean)
    .join("\n");
}

function formatOverDeliveryMessage(issues, t = defaultTranslator) {
  const lines = issues.slice(0, 8).map((issue) =>
    t("{orderLabel}：已送 {deliveredQuantity} / 订单 {orderQuantity}，超出 {overQuantity}", {
      orderLabel: issue.orderLabel,
      deliveredQuantity: normalizeCalculatedNumber(issue.deliveredQuantity),
      orderQuantity: normalizeCalculatedNumber(issue.orderQuantity),
      overQuantity: normalizeCalculatedNumber(issue.overQuantity),
    }),
  );
  const more =
    issues.length > lines.length
      ? t("\n另有 {count} 条订单超量。", { count: issues.length - lines.length })
      : "";
  return t("以下订单送货数量超过订单数量，不能生效：\n{lines}{more}", {
    lines: lines.join("\n"),
    more,
  });
}

function deliveryOrderField(field) {
  return `${deliveryOrderFieldPrefix}${field}`;
}

function getOrderColumnsForDelivery(customer, selectedOrders) {
  const columns = getCustomerTableColumns(customer, "orders");
  const fields = new Set(columns.map((column) => column.field));
  const withKnownData = [...columns];

  for (const column of knownOrderDataColumns) {
    if (fields.has(column.field)) continue;
    if (!selectedOrders.some((order) => hasFilledValue(order, column.field))) continue;
    fields.add(column.field);
    withKnownData.push(column);
  }

  return withKnownData.filter(
    (column) => column.field !== "status" && column.field !== orderDeliveredQuantityField,
  );
}

function getDeliveryQuantityOptions(orderColumns, selectedOrders) {
  return orderColumns
    .filter(
      (column) =>
        column.type === "number" ||
        column.headerName?.includes("数量") ||
        selectedOrders.some((order) => isNumericLike(order[column.field])),
    )
    .map((column) => ({
      value: column.field,
      label: column.headerName || column.field,
    }));
}

function preferredQuantityField(options) {
  return (
    options.find((option) => option.value === orderRemainingQuantityField)?.value ||
    options.find((option) => option.value === "quantity")?.value ||
    options.find((option) => option.label.includes("数量"))?.value ||
    options[0]?.value ||
    ""
  );
}

function insertColumnsAfterField(columns, additions, afterField) {
  const existingFields = new Set(columns.map((column) => column.field));
  const columnsToAdd = additions.filter((column) => !existingFields.has(column.field));
  if (!columnsToAdd.length) return columns;

  const next = [...columns];
  const afterIndex = next.findIndex((column) => column.field === afterField);
  const insertIndex = afterIndex === -1 ? next.length : afterIndex + 1;
  next.splice(insertIndex, 0, ...columnsToAdd);
  return next;
}

function completeColumnOrder(savedOrder, columns) {
  const validFields = new Set(columns.map((column) => column.field));
  const next = (savedOrder || []).filter((field) => validFields.has(field));

  for (const column of columns) {
    if (!next.includes(column.field)) next.push(column.field);
  }

  return next;
}

function insertFieldsAfter(order, fields, afterField) {
  const fieldsToInsert = fields.filter(Boolean);
  if (!fieldsToInsert.length) return order;

  const fieldSet = new Set(fieldsToInsert);
  const next = order.filter((field) => !fieldSet.has(field));
  const afterIndex = next.indexOf(afterField);
  const insertIndex = afterIndex === -1 ? next.length : afterIndex + 1;
  next.splice(insertIndex, 0, ...fieldsToInsert);
  return next;
}

function ensureOrderDeliveryTrackingColumns(customColumns = {}, selectedOrders = []) {
  const defaultFields = new Set(tableConfigs.orders.defaultColumns.map((column) => column.field));
  const orderColumns = customColumns.orders || [];
  const existingFields = new Set([...defaultFields, ...orderColumns.map((column) => column.field)]);
  const quantityColumn = knownOrderDataColumns.find((column) => column.field === "quantity");
  const nextOrderColumns = insertColumnsAfterField(
    orderColumns,
    !existingFields.has("quantity") &&
      quantityColumn &&
      selectedOrders.some((order) => hasFilledValue(order, "quantity"))
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
    ...withTrackingColumns.filter((column) => !defaultFields.has(column.field)),
  ];
  const order = insertFieldsAfter(
    completeColumnOrder(customColumns.columnOrder?.orders, visibleOrderColumns),
    orderDeliveryTrackingColumns.map((column) => column.field),
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
  const defaultFields = new Set(tableConfigs.orders.defaultColumns.map((column) => column.field));
  const orderColumns = customColumns.orders || [];
  const existingFields = new Set([...defaultFields, ...orderColumns.map((column) => column.field)]);
  const columnsToAdd = productionScheduleColumns.filter(
    (column) => !existingFields.has(column.field),
  );
  if (!columnsToAdd.length) return customColumns;

  const withScheduleColumns = insertColumnsAfterField(orderColumns, columnsToAdd, "dueDate");
  const visibleOrderColumns = [
    ...tableConfigs.orders.defaultColumns,
    ...withScheduleColumns.filter((column) => !defaultFields.has(column.field)),
  ];
  const order = insertFieldsAfter(
    completeColumnOrder(customColumns.columnOrder?.orders, visibleOrderColumns),
    productionScheduleColumns.map((column) => column.field),
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
  const defaultFields = new Set(
    tableConfigs.deliveries.defaultColumns.map((column) => column.field),
  );
  const deliveryColumnsFromOrders = orderColumns.map((column) => ({
    field: deliveryOrderField(column.field),
    headerName: column.headerName,
    width: column.width || 140,
    flex: column.flex,
    minWidth: column.minWidth,
    wrapHeaderText: true,
    autoHeaderHeight: true,
    type: column.type,
    options: column.options,
  }));
  const nextDeliveryColumns = [
    ...(customColumns.deliveries || []),
    ...[...deliveryColumnsFromOrders, deliveryQuantityColumn].filter(
      (column) =>
        !defaultFields.has(column.field) &&
        !(customColumns.deliveries || []).some((existing) => existing.field === column.field),
    ),
  ];
  const visibleDeliveryColumns = [
    ...tableConfigs.deliveries.defaultColumns,
    ...nextDeliveryColumns.filter((column) => !defaultFields.has(column.field)),
  ];

  return {
    ...customColumns,
    deliveries: nextDeliveryColumns,
    columnOrder: {
      ...(customColumns.columnOrder || {}),
      deliveries: completeColumnOrder(
        customColumns.columnOrder?.deliveries,
        visibleDeliveryColumns,
      ),
    },
  };
}

function nextDeliveryNo(deliveries = []) {
  const dateCode = today().replace(/-/g, "");
  const existing = new Set(deliveries.map((delivery) => delivery.deliveryNo).filter(Boolean));
  let counter = deliveries.length + 1;
  let deliveryNo = "";

  do {
    deliveryNo = `DN-${dateCode}-${String(counter).padStart(3, "0")}`;
    counter += 1;
  } while (existing.has(deliveryNo));

  return deliveryNo;
}

function nextStatementNo(statements = []) {
  const dateCode = today().replace(/-/g, "");
  const existing = new Set(statements.map((statement) => statement.statementNo).filter(Boolean));
  let counter = statements.length + 1;
  let statementNo = "";

  do {
    statementNo = `ST-${dateCode}-${String(counter).padStart(3, "0")}`;
    counter += 1;
  } while (existing.has(statementNo));

  return statementNo;
}

function deliveryLineAmount(delivery = {}) {
  const quantity = parseNumericValue(delivery[deliveryQuantityField]);
  const amount = parseNumericValue(delivery[deliveryOrderField("amount")]);
  const orderQuantity = parseNumericValue(delivery[deliveryOrderField("quantity")]);
  if (amount > 0 && orderQuantity > 0) return amount * (quantity / orderQuantity);
  return amount;
}

function buildStatementFromSignedDeliveries(customer = {}) {
  const existingDeliveryIds = new Set(
    (customer.statements || []).flatMap((statement) => statement.deliveryIds || []).filter(Boolean),
  );
  const deliveries = (customer.deliveries || []).filter(
    (delivery) => isSignedDelivery(delivery) && !existingDeliveryIds.has(delivery.id),
  );
  if (!deliveries.length) return null;
  const amount = deliveries.reduce((sum, delivery) => sum + deliveryLineAmount(delivery), 0);
  return {
    id: makeId("statements"),
    statementNo: nextStatementNo(customer.statements || []),
    date: today(),
    deliveryIds: deliveries.map((delivery) => delivery.id),
    deliveryNos: [
      ...new Set(deliveries.map((delivery) => delivery.deliveryNo).filter(Boolean)),
    ].join("、"),
    lineCount: deliveries.length,
    amount: normalizeCalculatedNumber(amount),
    paidAmount: 0,
    unpaidAmount: normalizeCalculatedNumber(amount),
    status: "未收款",
    createdAt: new Date().toISOString(),
    note: "",
  };
}

function statementDeliveryIds(statement = {}) {
  if (Array.isArray(statement.deliveryIds)) return statement.deliveryIds.map(String);
  return String(statement.deliveryIds || "")
    .split(/[、,\s]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function statementReferencesDelivery(statement = {}, deliveryId = "") {
  return statementDeliveryIds(statement).includes(String(deliveryId));
}

function listPreview(values = [], limit = 5) {
  const uniqueValues = Array.from(new Set(values.map(String).filter(Boolean)));
  const visible = uniqueValues.slice(0, limit).join("、");
  const more = uniqueValues.length > limit ? ` 等 ${uniqueValues.length} 条` : "";
  return `${visible}${more}`;
}

function getDeliveryLabel(delivery = {}) {
  return (
    delivery.deliveryNo || delivery.orderNo || delivery.product || delivery.id || "未编号送货单"
  );
}

function getStatementLabel(statement = {}) {
  return statement.statementNo || statement.id || "未编号对账单";
}

function getDeleteBlockers(customer = {}, tableKey, ids = []) {
  const selectedIds = new Set(ids.map(String));
  const deliveries = customer.deliveries || [];
  const statements = customer.statements || [];
  const payments = customer.payments || [];
  const blockers = [];

  if (tableKey === "orders") {
    const linkedOrderIds = new Set(
      deliveries
        .map((delivery) => String(delivery[linkedOrderIdField] || ""))
        .filter((orderId) => selectedIds.has(orderId)),
    );
    if (linkedOrderIds.size) {
      const labels = (customer.orders || [])
        .filter((order) => linkedOrderIds.has(String(order.id)))
        .map((order) => getOrderLabel(order));
      blockers.push(`订单已生成送货单，不能直接删除：${listPreview(labels)}`);
    }
  }

  if (tableKey === "deliveries") {
    const selectedDeliveries = deliveries.filter((delivery) =>
      selectedIds.has(String(delivery.id)),
    );
    const lockedDeliveries = selectedDeliveries.filter(
      (delivery) =>
        isLockedDelivery(delivery) ||
        statements.some((statement) => statementReferencesDelivery(statement, delivery.id)),
    );
    if (lockedDeliveries.length) {
      blockers.push(
        `送货单已签收或已进入对账，不能直接删除：${listPreview(lockedDeliveries.map(getDeliveryLabel))}`,
      );
    }
  }

  if (tableKey === "statements") {
    const selectedStatements = statements.filter((statement) =>
      selectedIds.has(String(statement.id)),
    );
    const selectedStatementNos = new Set(
      selectedStatements
        .map((statement) => String(statement.statementNo || "").trim())
        .filter(Boolean),
    );
    const paidStatements = selectedStatements.filter((statement) =>
      payments.some(
        (payment) =>
          String(payment.statementNo || "").trim() === String(statement.statementNo || "").trim(),
      ),
    );
    if (paidStatements.length) {
      blockers.push(
        `对账单已有收款记录，不能直接删除：${listPreview(paidStatements.map(getStatementLabel))}`,
      );
    }

    const linkedStatements = selectedStatements.filter(
      (statement) =>
        statementDeliveryIds(statement).length ||
        deliveries.some(
          (delivery) =>
            selectedStatementNos.has(String(delivery.statementNo || "").trim()) ||
            statementReferencesDelivery(statement, delivery.id),
        ),
    );
    if (linkedStatements.length) {
      blockers.push(
        `对账单已关联送货单，不能直接删除：${listPreview(linkedStatements.map(getStatementLabel))}`,
      );
    }
  }

  return blockers;
}

function formatDeleteBlockers(blockers = []) {
  return ["不能删除选中的数据，因为会影响已生成的业务单据：", ...blockers].join("\n");
}

function getPaymentOverages(statements = [], payments = []) {
  const statementAmounts = new Map();
  for (const statement of statements || []) {
    const statementNo = String(statement.statementNo || "").trim();
    if (!statementNo) continue;
    statementAmounts.set(statementNo, parseNumericValue(statement.amount));
  }

  const paidByStatementNo = new Map();
  for (const payment of payments || []) {
    const statementNo = String(payment.statementNo || "").trim();
    if (!statementNo || !statementAmounts.has(statementNo)) continue;
    paidByStatementNo.set(
      statementNo,
      (paidByStatementNo.get(statementNo) || 0) + parseNumericValue(payment.amount),
    );
  }

  return Array.from(paidByStatementNo.entries())
    .map(([statementNo, paidAmount]) => {
      const amount = statementAmounts.get(statementNo) || 0;
      if (paidAmount <= amount + 0.0000001) return null;
      return {
        statementNo,
        amount,
        paidAmount,
        overAmount: paidAmount - amount,
      };
    })
    .filter(Boolean);
}

function formatPaymentOverages(overages = []) {
  const lines = overages
    .slice(0, 8)
    .map(
      (item) =>
        `${item.statementNo}：对账 ${normalizeCalculatedNumber(item.amount)} / 收款 ${normalizeCalculatedNumber(item.paidAmount)}，超出 ${normalizeCalculatedNumber(item.overAmount)}`,
    );
  const more =
    overages.length > lines.length ? `\n另有 ${overages.length - lines.length} 条未展示` : "";
  return `收款金额不能超过对账金额：\n${lines.join("\n")}${more}`;
}

function applyPaymentsToStatements(statements = [], payments = []) {
  const paidByStatementNo = new Map();
  for (const payment of payments || []) {
    const statementNo = String(payment.statementNo || "").trim();
    if (!statementNo) continue;
    paidByStatementNo.set(
      statementNo,
      (paidByStatementNo.get(statementNo) || 0) + parseNumericValue(payment.amount),
    );
  }
  return (statements || []).map((statement) => {
    const paidAmount = paidByStatementNo.get(statement.statementNo) || 0;
    const amount = parseNumericValue(statement.amount);
    const unpaidAmount = Math.max(amount - paidAmount, 0);
    const status = paidAmount <= 0 ? "未收款" : unpaidAmount > 0.0000001 ? "部分收款" : "已收款";
    if (
      parseNumericValue(statement.paidAmount) === paidAmount &&
      parseNumericValue(statement.unpaidAmount) === unpaidAmount &&
      statement.status === status
    ) {
      return statement;
    }
    return {
      ...statement,
      paidAmount: normalizeCalculatedNumber(paidAmount),
      unpaidAmount: normalizeCalculatedNumber(unpaidAmount),
      status,
    };
  });
}

function makeDeliveryRowsFromOrders(selectedOrders, orderColumns, quantitySourceField, deliveryNo) {
  const date = today();

  return selectedOrders.map((order) => {
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
  const sourceFieldsByOrderId = new Map();
  const deliveryOpenedOrderIds = new Set();

  for (const delivery of deliveries) {
    const orderId = delivery[linkedOrderIdField];
    if (!orderId) continue;
    if (isFinalDelivery(delivery) && normalizeFinalDeliveryStatus(delivery.status) !== "作废") {
      deliveryOpenedOrderIds.add(orderId);
    }
    const sourceField = getDeliveryQuantitySourceField(delivery);
    if (!sourceFieldsByOrderId.has(orderId)) sourceFieldsByOrderId.set(orderId, new Set());
    sourceFieldsByOrderId.get(orderId).add(sourceField);
    if (!isEffectiveDelivery(delivery)) continue;
    deliveredByOrderId.set(
      orderId,
      (deliveredByOrderId.get(orderId) || 0) + parseNumericValue(delivery[deliveryQuantityField]),
    );
  }

  return orders.map((order) => {
    const normalizedStatus = normalizeOrderStatus(order.status);
    if (normalizedStatus === "异常") return order;
    const shouldTrack =
      deliveredByOrderId.has(order.id) ||
      deliveryOpenedOrderIds.has(order.id) ||
      orderDeliveredQuantityField in order ||
      orderRemainingQuantityField in order;
    if (!shouldTrack) return order;

    const hasEffectiveDelivery = deliveredByOrderId.has(order.id);
    const deliveredQuantity = deliveredByOrderId.get(order.id) || 0;
    const sourceFields = sourceFieldsByOrderId.get(order.id);
    const sourceField = sourceFields?.size === 1 ? [...sourceFields][0] : "quantity";
    const orderQuantity = parseNumericValue(order[sourceField]);
    const remainingQuantity = Math.max(orderQuantity - deliveredQuantity, 0);
    const hasOpenedDelivery = deliveryOpenedOrderIds.has(order.id);
    const nextStatus =
      hasEffectiveDelivery && remainingQuantity <= 0.0000001
        ? "已送货"
        : hasEffectiveDelivery && remainingQuantity > 0.0000001
          ? "部分送货"
          : hasOpenedDelivery &&
              ["已完成", "已开送货单", "部分送货", "已送货"].includes(normalizedStatus)
            ? "已开送货单"
            : !hasOpenedDelivery &&
                !hasEffectiveDelivery &&
                ["已开送货单", "部分送货", "已送货"].includes(normalizedStatus)
              ? "已完成"
              : order.status;
    if (
      parseNumericValue(order[orderDeliveredQuantityField]) === deliveredQuantity &&
      parseNumericValue(order[orderRemainingQuantityField]) === remainingQuantity &&
      order.status === nextStatus
    ) {
      return order;
    }

    const nextOrder = {
      ...order,
      status: nextStatus,
      [orderDeliveredQuantityField]: deliveredQuantity,
      [orderRemainingQuantityField]: remainingQuantity,
    };
    if (order.status !== nextStatus) {
      nextOrder.statusChangedAt = new Date().toISOString();
      nextOrder.statusChangeLog = appendAuditLog(
        order.statusChangeLog,
        `进度：${order.status || "未完成"} -> ${nextStatus}`,
      );
    }
    return nextOrder;
  });
}

function useDialogController(t = defaultTranslator) {
  const [dialog, setDialog] = useState(null);
  const resolverRef = useRef(null);

  const openDialog = useCallback(
    (config) =>
      new Promise((resolve) => {
        resolverRef.current = resolve;
        setDialog(config);
      }),
    [],
  );

  const resolveDialog = useCallback((value) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setDialog(null);
    resolve?.(value);
  }, []);

  const showAlert = useCallback(
    (message, options = {}) =>
      openDialog({
        type: "alert",
        title: t(options.title || "提示"),
        message: t(message),
        tone: options.tone,
      }).then(() => true),
    [openDialog, t],
  );

  const showConfirm = useCallback(
    (message, options = {}) =>
      openDialog({
        type: "confirm",
        title: t(options.title || "确认操作"),
        message: t(message),
        tone: options.tone,
      }),
    [openDialog, t],
  );

  const showPrompt = useCallback(
    (message, options = {}) =>
      openDialog({
        type: "prompt",
        title: t(options.title || "输入内容"),
        message: t(message),
        defaultValue: options.defaultValue || "",
        placeholder: t(options.placeholder || ""),
        tone: options.tone,
      }),
    [openDialog, t],
  );

  const showSelect = useCallback(
    (message, options = {}) =>
      openDialog({
        type: "select",
        title: t(options.title || "选择内容"),
        message: t(message),
        options: (options.options || []).map((option) => ({ ...option, label: t(option.label) })),
        defaultValue: options.defaultValue || options.options?.[0]?.value || "",
        tone: options.tone,
      }),
    [openDialog, t],
  );

  return useMemo(
    () => ({
      dialog,
      alert: showAlert,
      confirm: showConfirm,
      prompt: showPrompt,
      select: showSelect,
      resolve: resolveDialog,
    }),
    [dialog, resolveDialog, showAlert, showConfirm, showPrompt, showSelect],
  );
}

function AppDialog({ dialog, onResolve }) {
  const { t } = useI18n();
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
            {(dialog.options || []).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        )}
        <div className="app-dialog-actions">
          {(isPrompt || isSelect || isConfirm) && (
            <button
              type="button"
              className="secondary-button compact"
              onClick={() => onResolve(cancelValue)}
            >
              {t("取消")}
            </button>
          )}
          <button
            autoFocus={!isPrompt && !isSelect}
            type="submit"
            className={`primary-action compact ${dialog.tone === "danger" ? "danger-confirm" : ""}`}
            disabled={isSelect && !inputValue}
          >
            {isConfirm ? t("确认") : t("确定")}
          </button>
        </div>
      </form>
    </div>
  );
}

function App() {
  const [authLoading, setAuthLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [activeZone, setActiveZone] = useState(
    () => localStorage.getItem(desktopZoneStorageKey) || "",
  );

  const persistSession = useCallback((user) => {
    api.setAuthToken(user?.token || "");
    writeStoredDesktopSession(user);
    setCurrentUser(user || null);
  }, []);

  useEffect(() => {
    let stopped = false;
    const restoreSession = async () => {
      const savedUser = readStoredDesktopSession();
      if (!savedUser?.token) {
        api.setAuthToken("");
        setAuthLoading(false);
        return;
      }

      api.setAuthToken(savedUser.token);
      try {
        const result = await api.getCurrentUser();
        if (stopped) return;
        persistSession(result.user);
      } catch {
        if (stopped) return;
        api.setAuthToken("");
        writeStoredDesktopSession(null);
        localStorage.removeItem(desktopZoneStorageKey);
        setCurrentUser(null);
        setActiveZone("");
      } finally {
        if (!stopped) setAuthLoading(false);
      }
    };

    restoreSession();
    return () => {
      stopped = true;
    };
  }, [persistSession]);

  const login = useCallback(
    async (credentials) => {
      const result = await api.login(credentials);
      if (!result?.user?.token) throw new Error("登录响应缺少会话信息");
      persistSession(result.user);
      localStorage.removeItem(desktopZoneStorageKey);
      setActiveZone("");
      return result.user;
    },
    [persistSession],
  );

  const register = useCallback(
    async (profile) => {
      const result = await api.register(profile);
      if (!result?.user?.token) throw new Error("注册响应缺少会话信息");
      persistSession(result.user);
      localStorage.removeItem(desktopZoneStorageKey);
      setActiveZone("");
      return result.user;
    },
    [persistSession],
  );

  const logout = useCallback(() => {
    api.setAuthToken("");
    writeStoredDesktopSession(null);
    localStorage.removeItem(desktopZoneStorageKey);
    setCurrentUser(null);
    setActiveZone("");
  }, []);

  const selectZone = useCallback((zone) => {
    setActiveZone(zone);
    localStorage.setItem(desktopZoneStorageKey, zone);
  }, []);

  if (!currentUser) {
    return <LoginScreen loading={authLoading} onLogin={login} onRegister={register} />;
  }

  if (!isDesktopBusinessUser(currentUser.role)) {
    return <PendingAccessScreen currentUser={currentUser} onLogout={logout} />;
  }

  if (activeZone === "customers") {
    return (
      <CustomerWorkspace
        currentUser={currentUser}
        onBackToZones={() => selectZone("")}
        onLogout={logout}
      />
    );
  }

  if (activeZone === "employees") {
    return (
      <EmployeeWorkspacePlaceholder
        currentUser={currentUser}
        onBackToZones={() => selectZone("")}
        onLogout={logout}
      />
    );
  }

  return <BusinessZoneHub currentUser={currentUser} onLogout={logout} onSelectZone={selectZone} />;
}

function CustomerWorkspace({ currentUser = null, onBackToZones, onLogout }) {
  const [systemSettings, setSystemSettings] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("foam-crm-settings") || "{}");
    } catch {
      return {};
    }
  });
  const language = normalizeLanguage(systemSettings.language);
  const t = useMemo(() => createTranslator(language), [language]);
  const i18n = useMemo(() => ({ language, t }), [language, t]);
  const dialogs = useDialogController(t);
  const [customers, setCustomers] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTable, setActiveTable] = useState("orders");
  const [searchText, setSearchText] = useState("");
  const [viewMode, setViewMode] = useState("grid");
  const [quickFilter, setQuickFilter] = useState("");
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");
  const [showGlobalSearchResults, setShowGlobalSearchResults] = useState(false);
  const [mobileUsers, setMobileUsers] = useState([]);
  const [mobileDisplaySettings, setMobileDisplaySettings] = useState(defaultMobileDisplaySettings);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showColumnModal, setShowColumnModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const backupInputRef = useRef();
  const [printDelivery, setPrintDelivery] = useState(null);
  const [productionScheduleOrders, setProductionScheduleOrders] = useState([]);
  const [showSettings, setShowSettings] = useState(false);
  const [showMobileDisplaySettings, setShowMobileDisplaySettings] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState(new Set());
  const customersRef = useRef(customers);
  const selectedCustomerIdRef = useRef(selectedCustomerId);
  const activeTableRef = useRef(activeTable);
  const lastTableByCustomerRef = useRef({});
  const undoStackRef = useRef([]);
  const undoingRef = useRef(false);
  const rowSaveQueueRef = useRef(new Map());
  const rowSaveRevisionRef = useRef(new Map());
  const fullDataSyncRevisionRef = useRef(0);
  const syncVersionRef = useRef(0);
  const customerDragTimerRef = useRef(null);
  const customerDragSourceRef = useRef(null);
  const initialCustomerDrag = useMemo(
    () => ({
      customerId: null,
      active: false,
      x: 0,
      y: 0,
      overLevel: "",
    }),
    [],
  );
  const customerDragRef = useRef(initialCustomerDrag);
  const [customerDrag, setCustomerDrag] = useState(initialCustomerDrag);

  useEffect(() => {
    document.documentElement.lang = language === "en" ? "en" : "zh-CN";
    document.title = t("泡沫厂客户管理系统");
  }, [language, t]);

  useEffect(
    () => () => {
      if (customerDragTimerRef.current) {
        window.clearTimeout(customerDragTimerRef.current);
      }
    },
    [],
  );

  const updateCustomerDrag = useCallback((updater) => {
    setCustomerDrag((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      customerDragRef.current = next;
      return next;
    });
  }, []);

  const clearCustomerDragTimer = useCallback(() => {
    if (!customerDragTimerRef.current) return;
    window.clearTimeout(customerDragTimerRef.current);
    customerDragTimerRef.current = null;
  }, []);

  const resetCustomerDrag = useCallback(() => {
    clearCustomerDragTimer();
    customerDragSourceRef.current = null;
    updateCustomerDrag(initialCustomerDrag);
  }, [clearCustomerDragTimer, initialCustomerDrag, updateCustomerDrag]);

  useEffect(() => {
    customersRef.current = customers;
  }, [customers]);

  useEffect(() => {
    selectedCustomerIdRef.current = selectedCustomerId;
  }, [selectedCustomerId]);

  useEffect(() => {
    activeTableRef.current = activeTable;
  }, [activeTable]);

  const takeUndoSnapshot = useCallback(
    () => ({
      customers: cloneData(customersRef.current),
      selectedCustomerId: selectedCustomerIdRef.current,
      activeTable: activeTableRef.current,
    }),
    [],
  );

  const pushUndoSnapshot = useCallback(
    (snapshot = takeUndoSnapshot()) => {
      if (loading || undoingRef.current) return;
      undoStackRef.current = [...undoStackRef.current, snapshot].slice(-MAX_UNDO_STEPS);
    },
    [loading, takeUndoSnapshot],
  );

  const saveRowsQueued = useCallback((customerId, tableKey, rows) => {
    const key = `${customerId}:${tableKey}`;
    const previous = rowSaveQueueRef.current.get(key) || Promise.resolve();
    const next = previous.catch(() => {}).then(() => api.setRows(customerId, tableKey, rows));

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

  const isLatestRowSaveRevision = useCallback(
    (customerId, tableKey, revision) =>
      rowSaveRevisionRef.current.get(`${customerId}:${tableKey}`) === revision,
    [],
  );

  const invalidateRowSaveRevisions = useCallback(() => {
    rowSaveRevisionRef.current = new Map(
      Array.from(rowSaveRevisionRef.current.entries(), ([key, revision]) => [key, revision + 1]),
    );
  }, []);

  const syncCustomersInBackground = useCallback(
    (customersToSync) => {
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
            void dialogs.alert(
              t("撤销已在界面完成，但同步数据库失败：{message}", { message: err.message }),
              { title: "同步失败" },
            );
          }
        }
      };

      run();
    },
    [dialogs.alert, t],
  );

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

  const loadMobileUsers = useCallback(async () => {
    try {
      const res = await api.getMobileUsers();
      setMobileUsers(res.data || res || []);
    } catch (err) {
      console.warn("Load mobile users failed:", err);
    }
  }, []);

  const loadMobileDisplaySettings = useCallback(async () => {
    try {
      const res = await api.getMobileDisplaySettings();
      setMobileDisplaySettings(normalizeMobileDisplaySettings(res.data || res || {}));
    } catch (err) {
      console.warn("Load mobile display settings failed:", err);
    }
  }, []);

  const loadCustomers = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setLoading(true);
      try {
        const [customerRes, versionRes] = await Promise.all([
          api.getCustomers({ limit: 200 }),
          api.getSyncVersion().catch(() => null),
        ]);
        const list = customerRes.data || customerRes;
        const normalizedData = normalizeCustomerOrderStatuses(list);
        customersRef.current = normalizedData;
        setCustomers(normalizedData);
        setSelectedCustomerId((current) =>
          normalizedData.some((customer) => customer.id === current)
            ? current
            : normalizedData[0]?.id || null,
        );
        const nextVersion = Number(versionRes?.version || 0);
        if (nextVersion) syncVersionRef.current = nextVersion;
      } catch (err) {
        if (silent) {
          console.warn("Background customer sync failed:", err);
        } else {
          await dialogs.alert(`加载失败：${err.message}`, { title: "加载失败" });
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [dialogs.alert],
  );

  useEffect(() => {
    loadCustomers();
    loadMobileUsers();
    loadMobileDisplaySettings();
  }, [loadCustomers, loadMobileDisplaySettings, loadMobileUsers]);

  useEffect(() => {
    if (loading) return undefined;

    let stopped = false;
    const pollSyncVersion = async () => {
      if (stopped || document.visibilityState === "hidden" || rowSaveQueueRef.current.size) return;
      try {
        const res = await api.getSyncVersion();
        const nextVersion = Number(res?.version || 0);
        if (!nextVersion) return;
        if (!syncVersionRef.current) {
          syncVersionRef.current = nextVersion;
          return;
        }
        if (nextVersion > syncVersionRef.current) {
          await loadCustomers({ silent: true });
          await loadMobileUsers();
          await loadMobileDisplaySettings();
        }
      } catch (err) {
        console.warn("Sync version check failed:", err);
      }
    };

    const intervalId = window.setInterval(pollSyncVersion, SYNC_POLL_INTERVAL_MS);
    window.addEventListener("focus", pollSyncVersion);
    return () => {
      stopped = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", pollSyncVersion);
    };
  }, [loadCustomers, loadMobileDisplaySettings, loadMobileUsers, loading]);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === selectedCustomerId),
    [customers, selectedCustomerId],
  );
  const mobileOrderFieldOptions = useMemo(
    () => buildMobileOrderFieldOptions(customers),
    [customers],
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

  const customCustomerGroups = useMemo(
    () => normalizeCustomerGroupList(systemSettings.customerGroups || []),
    [systemSettings.customerGroups],
  );

  const hiddenGroups = useMemo(
    () => new Set(systemSettings.hiddenGroups || []),
    [systemSettings.hiddenGroups],
  );

  const customerGroups = useMemo(
    () =>
      normalizeCustomerGroupList([
        ...customerLevelOptions.filter((g) => !hiddenGroups.has(g)),
        ...customCustomerGroups,
        ...customers.map(customerGroupLevel),
        UNGROUPED_CUSTOMER_GROUP,
      ]),
    [customCustomerGroups, customers, hiddenGroups],
  );

  const groupedCustomers = useMemo(() => {
    const groups = Object.fromEntries(customerGroups.map((level) => [level, []]));
    for (const customer of filteredCustomers) {
      const level = customerGroupLevel(customer);
      if (!groups[level]) groups[level] = [];
      groups[level].push(customer);
    }
    return customerGroups.map((level) => ({ level, customers: groups[level] || [] }));
  }, [customerGroups, filteredCustomers]);

  const toggleGroup = useCallback((level) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });
  }, []);

  const persistSystemSettings = useCallback((settings) => {
    const next = {
      ...settings,
      language: normalizeLanguage(settings.language),
      customerGroups: normalizeCustomerGroupList(settings.customerGroups || []),
    };
    setSystemSettings(next);
    localStorage.setItem("foam-crm-settings", JSON.stringify(next));
  }, []);

  const updateMobileUserRole = useCallback(
    async (userId, role) => {
      try {
        const res = await api.updateMobileUserRole(userId, role);
        const nextUser = res.user;
        setMobileUsers((current) =>
          current.map((user) => (user.id === userId ? { ...user, ...nextUser } : user)),
        );
      } catch (err) {
        await dialogs.alert(t("保存失败：{message}", { message: err.message }), {
          title: "保存失败",
        });
      }
    },
    [dialogs, t],
  );

  const saveMobileDisplaySettings = useCallback(
    async (settings) => {
      const currentCustomer =
        customersRef.current.find((customer) => customer.id === selectedCustomerId) ||
        selectedCustomer;
      if (!currentCustomer) return;

      try {
        const normalized = normalizeMobileDisplaySettings(settings);
        const nextCustomColumns = {
          ...(currentCustomer.customColumns || {}),
          mobileDisplaySettings: normalized,
        };
        updateSelectedCustomer((customer) => ({
          ...customer,
          customColumns: nextCustomColumns,
        }));
        const res = await api.updateCustomer(currentCustomer.id, {
          ...currentCustomer,
          customColumns: nextCustomColumns,
        });
        if (res?.customColumns) {
          updateSelectedCustomer((customer) => ({ ...customer, customColumns: res.customColumns }));
        }
      } catch (err) {
        await dialogs.alert(t("保存失败：{message}", { message: err.message }), {
          title: "保存失败",
        });
        throw err;
      }
    },
    [dialogs, selectedCustomer, selectedCustomerId, t],
  );

  const handleAddCustomerGroup = useCallback(async () => {
    const input = await dialogs.prompt("新分组名称：", {
      title: "新增分组",
      placeholder: "例如：打样客户",
    });
    const groupName = String(input || "").trim();
    if (!groupName) return;

    if (customerGroups.includes(groupName)) {
      await dialogs.alert("该分组已存在。", { title: "新增分组" });
      return;
    }

    persistSystemSettings({
      ...systemSettings,
      customerGroups: [...customCustomerGroups, groupName],
    });
    setCollapsedGroups((current) => {
      const next = new Set(current);
      next.delete(groupName);
      return next;
    });
  }, [customCustomerGroups, customerGroups, dialogs, persistSystemSettings, systemSettings]);

  const handleRenameCustomerGroup = useCallback(
    async (oldName) => {
      const isBuiltin = customerLevelOptions.includes(oldName);
      const input = await dialogs.prompt(`将 "${oldName}" 重命名为：`, {
        title: "重命名分组",
        placeholder: "输入新名称",
        value: oldName,
      });
      const newName = String(input || "").trim();
      if (!newName || newName === oldName) return;

      if (customerGroups.includes(newName)) {
        await dialogs.alert(`"${newName}" 已存在。`, { title: "重命名分组" });
        return;
      }

      const affectedCustomers = customers.filter(
        (customer) => customerGroupLevel(customer) === oldName,
      );

      // Update settings: add new name to custom groups; for built-in, hide old name
      const nextSettings = { ...systemSettings };
      if (isBuiltin) {
        nextSettings.hiddenGroups = [...(systemSettings.hiddenGroups || []), oldName];
      }
      nextSettings.customerGroups = normalizeCustomerGroupList([
        ...customCustomerGroups.filter((g) => g !== oldName),
        newName,
      ]);
      persistSystemSettings(nextSettings);

      // Update all affected customers' levels
      if (affectedCustomers.length > 0) {
        const previousCustomers = customersRef.current;
        const nextCustomers = customers.map((customer) =>
          customerGroupLevel(customer) === oldName ? { ...customer, level: newName } : customer,
        );
        customersRef.current = nextCustomers;
        setCustomers(nextCustomers);

        for (const customer of affectedCustomers) {
          try {
            await api.updateCustomer(customer.id, { ...customer, level: newName });
          } catch {
            customersRef.current = previousCustomers;
            setCustomers(previousCustomers);
            await dialogs.alert(`保存失败：重命名分组时更新客户 "${customer.name}" 出错。`, {
              title: "保存失败",
            });
            return;
          }
        }
      }
    },
    [
      customerLevelOptions,
      customCustomerGroups,
      customerGroups,
      customers,
      dialogs,
      persistSystemSettings,
      systemSettings,
    ],
  );

  const handleDeleteCustomerGroup = useCallback(
    async (groupName) => {
      const isBuiltin = customerLevelOptions.includes(groupName);
      const affectedCount = customers.filter(
        (customer) => customerGroupLevel(customer) === groupName,
      ).length;

      const confirmMsg =
        affectedCount > 0
          ? `删除分组 "${groupName}" 后，其下 ${affectedCount} 个客户将移至"未分组"。确认删除？`
          : `确认删除分组 "${groupName}"？`;

      const confirmed = await dialogs.confirm(confirmMsg, { title: "删除分组" });
      if (!confirmed) return;

      // Update settings: remove from custom groups; for built-in, hide it
      const nextSettings = { ...systemSettings };
      if (isBuiltin) {
        nextSettings.hiddenGroups = [...(systemSettings.hiddenGroups || []), groupName];
      }
      nextSettings.customerGroups = customCustomerGroups.filter((g) => g !== groupName);
      persistSystemSettings(nextSettings);

      // Move affected customers to ungrouped
      if (affectedCount > 0) {
        const previousCustomers = customersRef.current;
        const nextCustomers = customers.map((customer) =>
          customerGroupLevel(customer) === groupName ? { ...customer, level: "" } : customer,
        );
        customersRef.current = nextCustomers;
        setCustomers(nextCustomers);

        for (const customer of affectedCustomers.filter(
          (c) => customerGroupLevel(c) === groupName,
        )) {
          try {
            await api.updateCustomer(customer.id, { ...customer, level: "" });
          } catch {
            customersRef.current = previousCustomers;
            setCustomers(previousCustomers);
            await dialogs.alert(`保存失败：删除分组时更新客户 "${customer.name}" 出错。`, {
              title: "保存失败",
            });
            return;
          }
        }
      }
    },
    [
      customerLevelOptions,
      customCustomerGroups,
      customers,
      dialogs,
      persistSystemSettings,
      systemSettings,
    ],
  );

  const alertMap = useMemo(() => {
    const map = {};
    const todayTs = new Date().setHours(0, 0, 0, 0);
    const warnTs = todayTs + 3 * 86_400_000;
    for (const customer of customers) {
      let severity = null;
      for (const order of customer.orders || []) {
        if (!isOpenOrder(order.status) || !order.dueDate) continue;
        const dueTs = new Date(order.dueDate).setHours(0, 0, 0, 0);
        if (dueTs < todayTs) {
          severity = "danger";
          break;
        }
        if (dueTs <= warnTs && severity !== "danger") severity = "warning";
      }
      if (severity) map[customer.id] = severity;
    }
    return map;
  }, [customers]);

  const metrics = useMemo(() => {
    const allOrders = customers.flatMap((customer) => customer.orders || []);
    const allDeliveries = customers
      .flatMap((customer) => customer.deliveries || [])
      .filter(isFinalDelivery);
    const activeOrders = allOrders.filter((order) => isOpenOrder(order.status));
    const amount = allOrders.reduce((sum, order) => sum + Number(order.amount || 0), 0);
    return [
      {
        label: t("客户总数"),
        value: customers.length,
        detail: t("按客户独立维护表头"),
      },
      {
        label: t("进行中订单"),
        value: activeOrders.length,
        detail: t("未完成订单跟进"),
      },
      {
        label: t("订单金额"),
        value: formatCurrency(amount, language),
        detail: t("本地录入订单汇总"),
      },
      {
        label: t("送货单"),
        value: allDeliveries.length,
        detail: t("签收与回单状态"),
      },
    ];
  }, [customers, language, t]);

  // 全局搜索：搜索订单号、产品名、送货单号、客户名
  const globalSearchResults = useMemo(() => {
    const q = globalSearchQuery.trim().toLowerCase();
    if (!q || q.length < 2) return [];
    const results = [];
    for (const customer of customers) {
      if (customer.name.toLowerCase().includes(q) || customer.contact?.toLowerCase().includes(q)) {
        results.push({
          type: "customer",
          customerId: customer.id,
          customerName: customer.name,
          label: `${t("客户")} · ${customer.name}`,
          detail: customer.contact || "",
        });
      }
      for (const order of customer.orders || []) {
        if (
          (order.orderNo || "").toLowerCase().includes(q) ||
          (order.product || "").toLowerCase().includes(q)
        ) {
          results.push({
            type: "order",
            customerId: customer.id,
            customerName: customer.name,
            label: `${t("订单")} · ${order.orderNo || order.product}`,
            detail: `${order.product || ""} · ${t(normalizeOrderStatus(order.status))}`,
            orderId: order.id,
          });
        }
      }
      for (const delivery of customer.deliveries || []) {
        if ((delivery.deliveryNo || "").toLowerCase().includes(q)) {
          results.push({
            type: "delivery",
            customerId: customer.id,
            customerName: customer.name,
            label: `${t("送货单")} · ${delivery.deliveryNo}`,
            detail: t(normalizeFinalDeliveryStatus(delivery.status)),
            deliveryId: delivery.id,
          });
        }
      }
    }
    return results.slice(0, 20);
  }, [customers, globalSearchQuery, t]);

  const navigateToSearchResult = useCallback(
    (result) => {
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
    },
    [activeTable, selectedCustomerId],
  );

  const updateSelectedCustomer = (updater) => {
    setCustomers((current) =>
      current.map((customer) =>
        customer.id === selectedCustomerId ? updater(customer) : customer,
      ),
    );
  };

  const handleRowsChange = async (tableKey, rows, options = {}) => {
    const currentCustomer =
      customersRef.current.find((customer) => customer.id === selectedCustomerId) ||
      selectedCustomer;
    const calculatedRows = applyCustomerTableFormulas(
      currentCustomer,
      tableKey,
      rows,
      currentCustomer?.customColumns,
      options.formulaRowIds,
    );
    let safeRows = ensureUniqueRowIds(
      calculatedRows,
      tableKey,
      customersRef.current,
      selectedCustomerId,
    );
    if (tableKey === "deliveries") {
      safeRows = normalizeDeliveryRows(safeRows);
      const protectedRows = protectSignedDeliveries(currentCustomer?.deliveries || [], safeRows);
      safeRows = protectedRows.rows;
      if (protectedRows.blocked) {
        await dialogs.alert("已签收或已对账的送货单已锁定，不能直接修改。", {
          title: "送货单已锁定",
        });
      }
    }
    if (tableKey === "materialCosts") {
      safeRows = applyMaterialPriceHistory(currentCustomer?.materialCosts || [], safeRows);
    }
    if (tableKey === "payments") {
      const paymentOverages = getPaymentOverages(currentCustomer?.statements || [], safeRows);
      if (paymentOverages.length) {
        await dialogs.alert(formatPaymentOverages(paymentOverages), {
          title: "收款金额超出对账金额",
          tone: "danger",
        });
        return;
      }
      const nextStatements = applyPaymentsToStatements(currentCustomer?.statements || [], safeRows);
      const statementsChanged = nextStatements.some(
        (row, index) => row !== (currentCustomer?.statements || [])[index],
      );
      updateSelectedCustomer((c) => ({
        ...c,
        payments: safeRows,
        ...(statementsChanged ? { statements: nextStatements } : {}),
      }));
      const paymentRevision = nextRowSaveRevision(selectedCustomerId, "payments");
      const statementRevision = statementsChanged
        ? nextRowSaveRevision(selectedCustomerId, "statements")
        : null;
      try {
        const [paymentResult, statementResult] = await Promise.all([
          saveRowsQueued(selectedCustomerId, "payments", safeRows),
          statementsChanged
            ? saveRowsQueued(selectedCustomerId, "statements", nextStatements)
            : Promise.resolve(null),
        ]);
        if (
          paymentResult?.rows &&
          isLatestRowSaveRevision(selectedCustomerId, "payments", paymentRevision)
        ) {
          updateSelectedCustomer((c) => ({ ...c, payments: paymentResult.rows }));
        }
        if (
          statementResult?.rows &&
          isLatestRowSaveRevision(selectedCustomerId, "statements", statementRevision)
        ) {
          updateSelectedCustomer((c) => ({ ...c, statements: statementResult.rows }));
        }
      } catch (err) {
        await dialogs.alert(`保存失败：${err.message}`, { title: "保存失败" });
      }
      return;
    }
    if (tableKey === "deliveries") {
      const currentOrders = currentCustomer?.orders || [];
      const overDeliveryIssues = findEffectiveDeliveryOverages(currentOrders, safeRows);
      if (overDeliveryIssues.length) {
        updateSelectedCustomer((c) => ({
          ...c,
          deliveries: normalizeDeliveryRows(currentCustomer?.deliveries || []),
        }));
        await dialogs.alert(formatOverDeliveryMessage(overDeliveryIssues, t), {
          title: "送货数量超出订单数量",
          tone: "danger",
        });
        return;
      }

      const nextOrders = applyCustomerTableFormulas(
        currentCustomer,
        "orders",
        applyDeliveryQuantitiesToOrders(currentOrders, safeRows),
      );
      const ordersChanged = nextOrders.some((row, index) => row !== currentOrders[index]);

      updateSelectedCustomer((c) => ({
        ...c,
        deliveries: safeRows,
        ...(ordersChanged ? { orders: nextOrders } : {}),
      }));

      const deliveryRevision = nextRowSaveRevision(selectedCustomerId, "deliveries");
      const orderRevision = ordersChanged
        ? nextRowSaveRevision(selectedCustomerId, "orders")
        : null;
      try {
        const [deliveryResult, orderResult] = await Promise.all([
          saveRowsQueued(selectedCustomerId, "deliveries", safeRows),
          ordersChanged
            ? saveRowsQueued(selectedCustomerId, "orders", nextOrders)
            : Promise.resolve(null),
        ]);
        if (
          deliveryResult?.rows &&
          isLatestRowSaveRevision(selectedCustomerId, "deliveries", deliveryRevision)
        ) {
          updateSelectedCustomer((c) => ({ ...c, deliveries: deliveryResult.rows }));
        }
        if (
          orderResult?.rows &&
          isLatestRowSaveRevision(selectedCustomerId, "orders", orderRevision)
        ) {
          updateSelectedCustomer((c) => ({ ...c, orders: orderResult.rows }));
        }
      } catch (err) {
        await dialogs.alert(`保存失败：${err.message}`, { title: "保存失败" });
      }
      return;
    }

    updateSelectedCustomer((c) => ({ ...c, [tableKey]: safeRows }));
    const revision = nextRowSaveRevision(selectedCustomerId, tableKey);
    try {
      const result = await saveRowsQueued(selectedCustomerId, tableKey, safeRows);
      if (result?.rows && isLatestRowSaveRevision(selectedCustomerId, tableKey, revision)) {
        updateSelectedCustomer((c) => ({ ...c, [tableKey]: result.rows }));
      }
    } catch (err) {
      await dialogs.alert(`保存失败：${err.message}`, { title: "保存失败" });
    }
  };

  const addRow = async (tableKey) => {
    pushUndoSnapshot();
    const config = tableConfigs[tableKey];
    const currentCustomer =
      customersRef.current.find((customer) => customer.id === selectedCustomerId) ||
      selectedCustomer;

    // 订单号自动生成
    const generatedOrderNo =
      tableKey === "orders" && systemSettings.orderNoPrefix
        ? `${systemSettings.orderNoPrefix}${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String((currentCustomer?.orders?.length || 0) + 1).padStart(3, "0")}`
        : "";

    // 默认交期 = 今天 + 默认天数
    const defaultDueDate =
      tableKey === "orders" && systemSettings.defaultDueDays
        ? new Date(Date.now() + Number(systemSettings.defaultDueDays) * 86400000)
            .toISOString()
            .slice(0, 10)
        : "";

    const newRow = {
      id: makeId(tableKey),
      ...config.emptyRow,
      date: tableKey === "orders" ? today() : "",
      orderNo: generatedOrderNo || "",
      dueDate: defaultDueDate || "",
      status: tableKey === "orders" ? "未完成" : config.emptyRow.status || "",
      createdAt: ["statements", "payments"].includes(tableKey)
        ? new Date().toISOString()
        : config.emptyRow.createdAt || "",
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
    updateSelectedCustomer((c) => ({ ...c, [tableKey]: newRows }));
    const revision = nextRowSaveRevision(selectedCustomerId, tableKey);
    try {
      const result = await saveRowsQueued(selectedCustomerId, tableKey, newRows);
      if (result?.rows && isLatestRowSaveRevision(selectedCustomerId, tableKey, revision)) {
        updateSelectedCustomer((c) => ({ ...c, [tableKey]: result.rows }));
      }
    } catch (err) {
      await dialogs.alert(`保存失败：${err.message}`, { title: "保存失败" });
    }
  };

  const deleteRows = async (tableKey, ids) => {
    const currentCustomer =
      customersRef.current.find((customer) => customer.id === selectedCustomerId) ||
      selectedCustomer;
    const deleteBlockers = getDeleteBlockers(currentCustomer, tableKey, ids);
    if (deleteBlockers.length) {
      await dialogs.alert(formatDeleteBlockers(deleteBlockers), {
        title: "不能删除",
        tone: "danger",
      });
      return;
    }

    pushUndoSnapshot();
    let nextRows = ensureUniqueRowIds(
      (currentCustomer?.[tableKey] || []).filter((r) => !ids.includes(r.id)),
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

      updateSelectedCustomer((c) => ({
        ...c,
        deliveries: nextRows,
        ...(ordersChanged ? { orders: nextOrders } : {}),
      }));

      const deliveryRevision = nextRowSaveRevision(selectedCustomerId, "deliveries");
      const orderRevision = ordersChanged
        ? nextRowSaveRevision(selectedCustomerId, "orders")
        : null;
      try {
        const [deliveryResult, orderResult] = await Promise.all([
          saveRowsQueued(selectedCustomerId, "deliveries", nextRows),
          ordersChanged
            ? saveRowsQueued(selectedCustomerId, "orders", nextOrders)
            : Promise.resolve(null),
        ]);
        if (
          deliveryResult?.rows &&
          isLatestRowSaveRevision(selectedCustomerId, "deliveries", deliveryRevision)
        ) {
          updateSelectedCustomer((c) => ({ ...c, deliveries: deliveryResult.rows }));
        }
        if (
          orderResult?.rows &&
          isLatestRowSaveRevision(selectedCustomerId, "orders", orderRevision)
        ) {
          updateSelectedCustomer((c) => ({ ...c, orders: orderResult.rows }));
        }
      } catch (err) {
        await dialogs.alert(`删除失败：${err.message}`, { title: "删除失败" });
      }
      return;
    }

    if (tableKey === "payments") {
      const currentStatements = currentCustomer?.statements || [];
      const nextStatements = applyPaymentsToStatements(currentStatements, nextRows);
      const statementsChanged = nextStatements.some(
        (row, index) => row !== currentStatements[index],
      );

      updateSelectedCustomer((c) => ({
        ...c,
        payments: nextRows,
        ...(statementsChanged ? { statements: nextStatements } : {}),
      }));

      const paymentRevision = nextRowSaveRevision(selectedCustomerId, "payments");
      const statementRevision = statementsChanged
        ? nextRowSaveRevision(selectedCustomerId, "statements")
        : null;
      try {
        const [paymentResult, statementResult] = await Promise.all([
          saveRowsQueued(selectedCustomerId, "payments", nextRows),
          statementsChanged
            ? saveRowsQueued(selectedCustomerId, "statements", nextStatements)
            : Promise.resolve(null),
        ]);
        if (
          paymentResult?.rows &&
          isLatestRowSaveRevision(selectedCustomerId, "payments", paymentRevision)
        ) {
          updateSelectedCustomer((c) => ({ ...c, payments: paymentResult.rows }));
        }
        if (
          statementResult?.rows &&
          isLatestRowSaveRevision(selectedCustomerId, "statements", statementRevision)
        ) {
          updateSelectedCustomer((c) => ({ ...c, statements: statementResult.rows }));
        }
      } catch (err) {
        await dialogs.alert(`删除失败：${err.message}`, { title: "删除失败" });
      }
      return;
    }

    updateSelectedCustomer((c) => ({
      ...c,
      [tableKey]: nextRows,
    }));
    const revision = nextRowSaveRevision(selectedCustomerId, tableKey);
    try {
      const result = await saveRowsQueued(selectedCustomerId, tableKey, nextRows);
      if (result?.rows && isLatestRowSaveRevision(selectedCustomerId, tableKey, revision)) {
        updateSelectedCustomer((c) => ({ ...c, [tableKey]: result.rows }));
      }
    } catch (err) {
      await dialogs.alert(`删除失败：${err.message}`, { title: "删除失败" });
    }
  };

  const addCustomColumn = async (tableKey, column) => {
    pushUndoSnapshot();
    const currentCustomer =
      customersRef.current.find((customer) => customer.id === selectedCustomerId) ||
      selectedCustomer;
    const dataTableKey = viewSourceTableKey(tableKey);
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
      dataTableKey,
      currentCustomer[dataTableKey] || [],
      newCustomColumns,
    );
    updateSelectedCustomer((c) => ({
      ...c,
      [dataTableKey]: nextRows,
      customColumns: newCustomColumns,
    }));
    const revision =
      nextRows !== (currentCustomer[dataTableKey] || [])
        ? nextRowSaveRevision(selectedCustomerId, dataTableKey)
        : null;
    try {
      const [, rowsResult] = await Promise.all([
        api.updateCustomer(selectedCustomerId, {
          ...currentCustomer,
          customColumns: newCustomColumns,
        }),
        revision
          ? saveRowsQueued(selectedCustomerId, dataTableKey, nextRows)
          : Promise.resolve(null),
      ]);
      if (rowsResult?.rows && isLatestRowSaveRevision(selectedCustomerId, dataTableKey, revision)) {
        updateSelectedCustomer((c) => ({ ...c, [dataTableKey]: rowsResult.rows }));
      }
    } catch (err) {
      await dialogs.alert(`保存失败：${err.message}`, { title: "保存失败" });
    }
  };

  const updateCustomColumn = async (tableKey, field, patch) => {
    const currentCustomer =
      customersRef.current.find((customer) => customer.id === selectedCustomerId) ||
      selectedCustomer;
    const dataTableKey = viewSourceTableKey(tableKey);
    const existingColumns = currentCustomer.customColumns?.[tableKey] || [];
    if (!existingColumns.some((column) => column.field === field)) return;

    pushUndoSnapshot();
    const newCustomColumns = {
      ...currentCustomer.customColumns,
      [tableKey]: existingColumns.map((column) => {
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
      dataTableKey,
      currentCustomer[dataTableKey] || [],
      newCustomColumns,
    );

    updateSelectedCustomer((c) => ({
      ...c,
      [dataTableKey]: nextRows,
      customColumns: newCustomColumns,
    }));
    const revision = nextRowSaveRevision(selectedCustomerId, dataTableKey);
    try {
      const [, rowsResult] = await Promise.all([
        api.updateCustomer(selectedCustomerId, {
          ...currentCustomer,
          customColumns: newCustomColumns,
        }),
        saveRowsQueued(selectedCustomerId, dataTableKey, nextRows),
      ]);
      if (rowsResult?.rows && isLatestRowSaveRevision(selectedCustomerId, dataTableKey, revision)) {
        updateSelectedCustomer((c) => ({ ...c, [dataTableKey]: rowsResult.rows }));
      }
    } catch (err) {
      await dialogs.alert(`保存失败：${err.message}`, { title: "保存失败" });
    }
  };

  const removeCustomColumns = async (tableKey, fields) => {
    const fieldsToRemove = new Set(fields);
    if (!fieldsToRemove.size) return;

    pushUndoSnapshot();
    const currentCustomer =
      customersRef.current.find((customer) => customer.id === selectedCustomerId) ||
      selectedCustomer;
    const dataTableKey = viewSourceTableKey(tableKey);
    const derivedView = isDerivedTableView(tableKey);
    const viewCustomColumns = currentCustomer.customColumns?.[tableKey] || [];
    const viewCustomFieldSet = new Set(viewCustomColumns.map((column) => column.field));
    const defaultFieldSet = new Set(
      (tableConfigs[tableKey]?.defaultColumns || []).map((column) => column.field),
    );
    const fieldsToDelete = derivedView
      ? new Set([...fieldsToRemove].filter((field) => viewCustomFieldSet.has(field)))
      : fieldsToRemove;
    const fieldsToHide = derivedView
      ? [...fieldsToRemove].filter(
          (field) => !viewCustomFieldSet.has(field) && !defaultFieldSet.has(field),
        )
      : [];

    const cleanedRows = (currentCustomer[dataTableKey] || []).map((row) => {
      let next = row;
      for (const field of fieldsToDelete) {
        if (!(field in next)) continue;
        if (next === row) next = { ...row };
        delete next[field];
      }
      return next;
    });
    const currentHiddenFields = new Set(
      currentCustomer.customColumns?.viewHiddenColumns?.[tableKey] || [],
    );
    for (const field of fieldsToHide) currentHiddenFields.add(field);
    const newCustomColumns = {
      ...currentCustomer.customColumns,
      [tableKey]: viewCustomColumns.filter((c) => !fieldsToDelete.has(c.field)),
      viewHiddenColumns: {
        ...(currentCustomer.customColumns?.viewHiddenColumns || {}),
        ...(derivedView ? { [tableKey]: Array.from(currentHiddenFields) } : {}),
      },
      columnOrder: {
        ...(currentCustomer.customColumns?.columnOrder || {}),
        [tableKey]: (currentCustomer.customColumns?.columnOrder?.[tableKey] || []).filter(
          (field) => !fieldsToRemove.has(field),
        ),
      },
    };
    let safeRows = ensureUniqueRowIds(
      applyCustomerTableFormulas(
        { ...currentCustomer, customColumns: newCustomColumns },
        dataTableKey,
        cleanedRows,
        newCustomColumns,
      ),
      dataTableKey,
      customersRef.current,
      selectedCustomerId,
    );
    if (dataTableKey === "deliveries") {
      safeRows = normalizeDeliveryRows(safeRows);
    }
    updateSelectedCustomer((c) => ({
      ...c,
      [dataTableKey]: safeRows,
      customColumns: newCustomColumns,
    }));
    const rowsChanged = fieldsToDelete.size > 0;
    const revision = rowsChanged ? nextRowSaveRevision(selectedCustomerId, dataTableKey) : null;
    try {
      const [, rowsResult] = await Promise.all([
        api.updateCustomer(selectedCustomerId, {
          ...currentCustomer,
          customColumns: newCustomColumns,
        }),
        rowsChanged
          ? saveRowsQueued(selectedCustomerId, dataTableKey, safeRows)
          : Promise.resolve(null),
      ]);
      if (rowsResult?.rows && isLatestRowSaveRevision(selectedCustomerId, dataTableKey, revision)) {
        updateSelectedCustomer((c) => ({ ...c, [dataTableKey]: rowsResult.rows }));
      }
    } catch (err) {
      await dialogs.alert(`保存失败：${err.message}`, { title: "保存失败" });
    }
  };

  const removeCustomColumn = async (tableKey, field) => {
    await removeCustomColumns(tableKey, [field]);
  };

  const showViewColumns = async (viewKey, fields) => {
    const fieldsToShow = new Set(fields);
    if (!fieldsToShow.size) return;

    pushUndoSnapshot();
    const currentCustomer =
      customersRef.current.find((customer) => customer.id === selectedCustomerId) ||
      selectedCustomer;
    const currentHiddenFields = currentCustomer.customColumns?.viewHiddenColumns?.[viewKey] || [];
    const nextHiddenFields = currentHiddenFields.filter((field) => !fieldsToShow.has(field));
    const newCustomColumns = {
      ...currentCustomer.customColumns,
      viewHiddenColumns: {
        ...(currentCustomer.customColumns?.viewHiddenColumns || {}),
        [viewKey]: nextHiddenFields,
      },
    };
    updateSelectedCustomer((c) => ({ ...c, customColumns: newCustomColumns }));
    try {
      await api.updateCustomer(selectedCustomerId, {
        ...currentCustomer,
        customColumns: newCustomColumns,
      });
    } catch (err) {
      await dialogs.alert(`保存失败：${err.message}`, { title: "保存失败" });
    }
  };

  const handleCreateStatement = async () => {
    if (!selectedCustomer) return;
    const currentCustomer =
      customersRef.current.find((customer) => customer.id === selectedCustomerId) ||
      selectedCustomer;
    const statement = buildStatementFromSignedDeliveries(currentCustomer);
    if (!statement) {
      await dialogs.alert("没有可生成对账单的已签收送货单，或已签收送货单已经生成过对账单。", {
        title: "生成对账单",
      });
      return;
    }
    const nextStatements = [statement, ...(currentCustomer.statements || [])];
    const deliveryIds = new Set(statement.deliveryIds || []);
    const nextDeliveries = (currentCustomer.deliveries || []).map((delivery) =>
      deliveryIds.has(delivery.id)
        ? {
            ...delivery,
            statementNo: statement.statementNo,
            reconciledAt: new Date().toISOString(),
          }
        : delivery,
    );
    const nextOrders = (currentCustomer.orders || []).map((order) => {
      const linked = nextDeliveries.some(
        (delivery) => deliveryIds.has(delivery.id) && delivery[linkedOrderIdField] === order.id,
      );
      return linked && normalizeOrderStatus(order.status) === "已送货"
        ? {
            ...order,
            status: "已开对账单",
            statementNo: statement.statementNo,
            statusChangedAt: new Date().toISOString(),
            statusChangeLog: appendAuditLog(
              order.statusChangeLog,
              `生成对账单：${statement.statementNo}`,
            ),
          }
        : order;
    });

    pushUndoSnapshot();
    updateSelectedCustomer((c) => ({
      ...c,
      statements: nextStatements,
      deliveries: nextDeliveries,
      orders: nextOrders,
    }));
    setActiveTable("statements");
    const statementRevision = nextRowSaveRevision(selectedCustomerId, "statements");
    const deliveryRevision = nextRowSaveRevision(selectedCustomerId, "deliveries");
    const orderRevision = nextRowSaveRevision(selectedCustomerId, "orders");
    try {
      const [statementResult, deliveryResult, orderResult] = await Promise.all([
        saveRowsQueued(selectedCustomerId, "statements", nextStatements),
        saveRowsQueued(selectedCustomerId, "deliveries", nextDeliveries),
        saveRowsQueued(selectedCustomerId, "orders", nextOrders),
      ]);
      if (
        statementResult?.rows &&
        isLatestRowSaveRevision(selectedCustomerId, "statements", statementRevision)
      ) {
        updateSelectedCustomer((c) => ({ ...c, statements: statementResult.rows }));
      }
      if (
        deliveryResult?.rows &&
        isLatestRowSaveRevision(selectedCustomerId, "deliveries", deliveryRevision)
      ) {
        updateSelectedCustomer((c) => ({ ...c, deliveries: deliveryResult.rows }));
      }
      if (
        orderResult?.rows &&
        isLatestRowSaveRevision(selectedCustomerId, "orders", orderRevision)
      ) {
        updateSelectedCustomer((c) => ({ ...c, orders: orderResult.rows }));
      }
    } catch (err) {
      await dialogs.alert(`生成失败：${err.message}`, { title: "生成对账单" });
    }
  };

  const upsertCustomer = async (customerInput) => {
    pushUndoSnapshot();
    if (customerInput.id) {
      setCustomers((current) =>
        current.map((c) => (c.id === customerInput.id ? { ...c, ...customerInput } : c)),
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
      customColumns: {
        products: [],
        orders: [],
        deliveries: [],
        materialCosts: [],
        costEntries: [],
        statements: [],
        payments: [],
        mobileDisplaySettings: normalizeMobileDisplaySettings(mobileDisplaySettings),
      },
      products: [],
      orders: [],
      deliveries: [],
      materialCosts: [],
      costEntries: [],
      statements: [],
      payments: [],
    };
    setCustomers((current) => [newCustomer, ...current]);
    setSelectedCustomerId(newCustomer.id);
    try {
      await api.createCustomer(newCustomer);
    } catch (err) {
      await dialogs.alert(`保存失败：${err.message}`, { title: "保存失败" });
    }
  };

  const handleOrderImport = async (rows, extraColumns = []) => {
    pushUndoSnapshot();
    const currentCustomer =
      customersRef.current.find((customer) => customer.id === selectedCustomerId) ||
      selectedCustomer;
    const existingColumns = currentCustomer.customColumns?.orders || [];
    const existingFields = new Set([
      ...tableConfigs.orders.defaultColumns.map((column) => column.field),
      ...existingColumns.map((column) => column.field),
    ]);
    const newExtraColumns = extraColumns.filter((column) => !existingFields.has(column.field));
    const customColumns = {
      ...currentCustomer.customColumns,
      orders: [...existingColumns, ...newExtraColumns],
    };
    const rawRows = [
      ...(currentCustomer.orders || []),
      ...rows.map((row) => ({
        ...tableConfigs.orders.emptyRow,
        id: makeId("orders"),
        ...row,
        status: normalizeOrderStatus(row.status || tableConfigs.orders.emptyRow.status),
      })),
    ];
    const importedRowIds = rawRows.slice(currentCustomer.orders?.length || 0).map((row) => row.id);
    const newRows = ensureUniqueRowIds(
      applyCustomerTableFormulas(
        { ...currentCustomer, customColumns },
        "orders",
        rawRows,
        customColumns,
        importedRowIds,
      ),
      "orders",
      customersRef.current,
      selectedCustomerId,
    );

    updateSelectedCustomer((c) => ({ ...c, orders: newRows, customColumns }));
    const revision = nextRowSaveRevision(selectedCustomerId, "orders");
    try {
      const [, rowsResult] = await Promise.all([
        newExtraColumns.length
          ? api.updateCustomer(selectedCustomerId, { ...currentCustomer, customColumns })
          : Promise.resolve(),
        saveRowsQueued(selectedCustomerId, "orders", newRows),
      ]);
      if (rowsResult?.rows && isLatestRowSaveRevision(selectedCustomerId, "orders", revision)) {
        updateSelectedCustomer((c) => ({ ...c, orders: rowsResult.rows }));
      }
    } catch (err) {
      await dialogs.alert(`保存失败：${err.message}`, { title: "保存失败" });
    }
  };

  const handleScheduleOrders = async (orderIds) => {
    if (!selectedCustomer || !orderIds?.length) return false;

    const currentCustomer =
      customersRef.current.find((customer) => customer.id === selectedCustomerId) ||
      selectedCustomer;
    const orderById = new Map((currentCustomer.orders || []).map((order) => [order.id, order]));
    const selectedOrders = orderIds.map((id) => orderById.get(id)).filter(Boolean);

    if (!selectedOrders.length) {
      await dialogs.alert("没有找到可排产的订单行。", { title: "排产" });
      return false;
    }

    const closedOrders = selectedOrders.filter((order) => !isOpenOrder(order.status));
    if (closedOrders.length) {
      const orderNos = closedOrders
        .map((order) => order.orderNo || order.product || order.id)
        .slice(0, 5)
        .join("、");
      await dialogs.alert(
        t(
          "已完成、已开送货单、部分送货、已送货、已开对账单、已付款或异常的订单不能再排产。\n请先处理：{orders}",
          { orders: orderNos },
        ),
        { title: "排产" },
      );
      return false;
    }

    setProductionScheduleOrders(selectedOrders);
    return true;
  };

  const saveProductionSchedule = async (schedule) => {
    if (!selectedCustomer || !productionScheduleOrders.length) return;

    const currentCustomer =
      customersRef.current.find((customer) => customer.id === selectedCustomerId) ||
      selectedCustomer;
    const orderIds = new Set(productionScheduleOrders.map((order) => order.id));
    const customColumns = ensureProductionScheduleColumns(currentCustomer.customColumns || {});
    const hasSharedQuantity = String(schedule.quantity || "").trim() !== "";
    const sharedQuantity = parseNumericValue(schedule.quantity);
    const nextStatus = productionScheduleStatusOptions.includes(schedule.status)
      ? schedule.status
      : "已排产";

    const rawRows = (currentCustomer.orders || []).map((order) => {
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
    updateSelectedCustomer((c) => ({
      ...c,
      orders: nextRows,
      customColumns,
    }));
    setProductionScheduleOrders([]);
    setActiveTable(
      activeTableRef.current === "productionSchedule" ? "productionSchedule" : "orders",
    );

    const revision = nextRowSaveRevision(selectedCustomerId, "orders");
    try {
      const [, rowsResult] = await Promise.all([
        api.updateCustomer(selectedCustomerId, { ...currentCustomer, customColumns }),
        saveRowsQueued(selectedCustomerId, "orders", nextRows),
      ]);
      if (rowsResult?.rows && isLatestRowSaveRevision(selectedCustomerId, "orders", revision)) {
        updateSelectedCustomer((c) => ({ ...c, orders: rowsResult.rows }));
      }
    } catch (err) {
      await dialogs.alert(`排产保存失败：${err.message}`, { title: "排产" });
    }
  };

  const cancelProductionSchedule = async (orderIds) => {
    if (!selectedCustomer || !orderIds?.length) return false;

    const currentCustomer =
      customersRef.current.find((customer) => customer.id === selectedCustomerId) ||
      selectedCustomer;
    const orderIdSet = new Set(orderIds);
    const selectedOrders = (currentCustomer.orders || []).filter((order) =>
      orderIdSet.has(order.id),
    );
    const scheduledOrders = selectedOrders.filter(
      (order) => normalizeOrderStatus(order.status) === "已排产",
    );

    if (!scheduledOrders.length) {
      await dialogs.alert("没有找到可取消排产的订单行。", { title: "取消排产" });
      return false;
    }

    if (
      !(await dialogs.confirm(
        t("确认取消选中的 {count} 条排产？订单状态将恢复为未完成。", {
          count: scheduledOrders.length,
        }),
        { title: "取消排产" },
      ))
    ) {
      return false;
    }

    const scheduledOrderIds = new Set(scheduledOrders.map((order) => order.id));
    const rawRows = (currentCustomer.orders || []).map((order) =>
      scheduledOrderIds.has(order.id)
        ? {
            ...order,
            status: "未完成",
            [productionScheduleDateField]: "",
            [productionScheduleQuantityField]: "",
            [productionLineField]: "",
            [productionNoteField]: "",
          }
        : order,
    );
    const nextRows = ensureUniqueRowIds(
      applyCustomerTableFormulas(
        currentCustomer,
        "orders",
        rawRows,
        currentCustomer.customColumns,
        scheduledOrderIds,
      ),
      "orders",
      customersRef.current,
      selectedCustomerId,
    );

    pushUndoSnapshot();
    updateSelectedCustomer((c) => ({ ...c, orders: nextRows }));
    const revision = nextRowSaveRevision(selectedCustomerId, "orders");
    try {
      const result = await saveRowsQueued(selectedCustomerId, "orders", nextRows);
      if (result?.rows && isLatestRowSaveRevision(selectedCustomerId, "orders", revision)) {
        updateSelectedCustomer((c) => ({ ...c, orders: result.rows }));
      }
      return true;
    } catch (err) {
      await dialogs.alert(`取消排产失败：${err.message}`, { title: "取消排产" });
      return false;
    }
  };

  const handleCreateDeliveryFromOrders = async (orderIds) => {
    if (!selectedCustomer || !orderIds?.length) return false;

    const currentCustomer =
      customersRef.current.find((customer) => customer.id === selectedCustomerId) ||
      selectedCustomer;
    const orderById = new Map((currentCustomer.orders || []).map((order) => [order.id, order]));
    const selectedOrders = orderIds.map((id) => orderById.get(id)).filter(Boolean);

    if (!selectedOrders.length) {
      await dialogs.alert("没有找到可生成送货单的订单行。", { title: "生成送货单" });
      return false;
    }
    const notCompletedOrders = selectedOrders.filter(
      (order) => normalizeOrderStatus(order.status) !== "已完成",
    );
    if (notCompletedOrders.length) {
      const orderNos = notCompletedOrders
        .map((order) => order.orderNo || order.product || order.id)
        .slice(0, 5)
        .join("、");
      await dialogs.alert(
        t("只有进度为“已完成”的订单才能生成送货单。\n请先处理：{orders}", { orders: orderNos }),
        { title: "生成送货单" },
      );
      return false;
    }

    const orderColumns = getOrderColumnsForDelivery(currentCustomer, selectedOrders);
    const quantityOptions = getDeliveryQuantityOptions(orderColumns, selectedOrders);
    if (!quantityOptions.length) {
      await dialogs.alert("未找到可作为送货数量的订单表头，请先在订单里补充数量列。", {
        title: "生成送货单",
      });
      return false;
    }

    const quantitySourceField = await dialogs.select(
      "选择订单表头作为本次送货数量。生成后可以在送货单草稿中继续修改送货数量。",
      {
        title: "生成送货单",
        options: quantityOptions,
        defaultValue: preferredQuantityField(quantityOptions),
      },
    );
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
    const nextDeliveries = normalizeDeliveryRows(
      ensureUniqueRowIds(
        applyCustomerTableFormulas(
          { ...currentCustomer, customColumns },
          "deliveries",
          [...newDeliveryRows, ...(currentCustomer.deliveries || [])],
          customColumns,
          newDeliveryRows.map((row) => row.id),
        ),
        "deliveries",
        customersRef.current,
        selectedCustomerId,
      ),
    );
    const nextOrders = applyCustomerTableFormulas(
      { ...currentCustomer, customColumns },
      "orders",
      applyDeliveryQuantitiesToOrders(currentCustomer.orders || [], nextDeliveries),
      customColumns,
    );

    pushUndoSnapshot();
    updateSelectedCustomer((c) => ({
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
      if (
        deliveryResult?.rows &&
        isLatestRowSaveRevision(selectedCustomerId, "deliveries", deliveryRevision)
      ) {
        updateSelectedCustomer((c) => ({ ...c, deliveries: deliveryResult.rows }));
      }
      if (
        orderResult?.rows &&
        isLatestRowSaveRevision(selectedCustomerId, "orders", orderRevision)
      ) {
        updateSelectedCustomer((c) => ({ ...c, orders: orderResult.rows }));
      }
      return true;
    } catch (err) {
      await dialogs.alert(`生成失败：${err.message}`, { title: "生成送货单" });
      return false;
    }
  };

  const handleFinalizeDeliveryDrafts = async (deliveryIds) => {
    if (!selectedCustomer || !deliveryIds?.length) return false;

    const currentCustomer =
      customersRef.current.find((customer) => customer.id === selectedCustomerId) ||
      selectedCustomer;
    const ids = new Set(deliveryIds);
    const selectedDrafts = (currentCustomer.deliveries || []).filter(
      (delivery) => ids.has(delivery.id) && !isFinalDelivery(delivery),
    );

    if (!selectedDrafts.length) {
      await dialogs.alert("没有找到可生成的送货单草稿。", { title: "生成送货单" });
      return false;
    }

    const ordersById = new Map((currentCustomer.orders || []).map((order) => [order.id, order]));
    const unlinkedDrafts = selectedDrafts.filter(
      (delivery) => !delivery[linkedOrderIdField] || !ordersById.has(delivery[linkedOrderIdField]),
    );
    if (unlinkedDrafts.length) {
      await dialogs.alert(
        `送货单必须关联订单后才能生成正式单：${listPreview(unlinkedDrafts.map(getDeliveryLabel))}`,
        {
          title: "生成送货单",
          tone: "danger",
        },
      );
      return false;
    }

    const preview = buildDeliveryFinalizePreview(currentCustomer, selectedDrafts, t);
    if (preview.overDelivered.length) {
      await dialogs.alert(formatOverDeliveryMessage(preview.overDelivered, t), {
        title: "送货数量超出订单数量",
        tone: "danger",
      });
      return false;
    }

    const confirmed = await dialogs.confirm(formatDeliveryFinalizeMessage(preview, t), {
      title: "确认生成送货单",
    });
    if (!confirmed) return false;

    const rawDeliveries = (currentCustomer.deliveries || []).map((delivery) =>
      ids.has(delivery.id) && !isFinalDelivery(delivery)
        ? {
            ...delivery,
            [finalDeliveryField]: true,
            status: "未送",
            issuedAt: new Date().toISOString(),
          }
        : delivery,
    );
    const nextDeliveries = normalizeDeliveryRows(
      applyCustomerTableFormulas(
        currentCustomer,
        "deliveries",
        rawDeliveries,
        currentCustomer.customColumns,
        ids,
      ),
    );
    const nextOrders = applyCustomerTableFormulas(
      currentCustomer,
      "orders",
      applyDeliveryQuantitiesToOrders(currentCustomer.orders || [], nextDeliveries),
    );
    const ordersChanged = nextOrders.some(
      (row, index) => row !== (currentCustomer.orders || [])[index],
    );

    pushUndoSnapshot();
    updateSelectedCustomer((c) => ({
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
      if (
        deliveryResult?.rows &&
        isLatestRowSaveRevision(selectedCustomerId, "deliveries", deliveryRevision)
      ) {
        updateSelectedCustomer((c) => ({ ...c, deliveries: deliveryResult.rows }));
      }
      if (
        orderResult?.rows &&
        isLatestRowSaveRevision(selectedCustomerId, "orders", orderRevision)
      ) {
        updateSelectedCustomer((c) => ({ ...c, orders: orderResult.rows }));
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
      if (
        await dialogs.confirm(
          t("恢复备份将覆盖当前所有数据（共 {count} 个客户）。确认继续？", { count: data.length }),
          {
            title: "恢复备份",
            tone: "danger",
          },
        )
      ) {
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

  const handleColumnOrderChange = useCallback(
    async (tableKey, order) => {
      pushUndoSnapshot();
      const newCustomColumns = {
        ...selectedCustomer.customColumns,
        columnOrder: {
          ...(selectedCustomer.customColumns?.columnOrder || {}),
          [tableKey]: order,
        },
      };
      updateSelectedCustomer((c) => ({ ...c, customColumns: newCustomColumns }));
      try {
        await api.updateCustomer(selectedCustomerId, {
          ...selectedCustomer,
          customColumns: newCustomColumns,
        });
      } catch (err) {
        await dialogs.alert(`保存失败：${err.message}`, { title: "保存失败" });
      }
    },
    [dialogs.alert, pushUndoSnapshot, selectedCustomer, selectedCustomerId],
  );

  const deleteCustomer = async (id) => {
    if (
      !(await dialogs.confirm("确认删除该客户？此操作不可恢复，包括所有订单和送货记录。", {
        title: "删除客户",
        tone: "danger",
      }))
    )
      return;
    pushUndoSnapshot();
    setCustomers((current) => current.filter((c) => c.id !== id));
    if (selectedCustomerId === id) {
      const remaining = customers.filter((c) => c.id !== id);
      setSelectedCustomerId(remaining[0]?.id || null);
    }
    try {
      await api.deleteCustomer(id);
    } catch (err) {
      await dialogs.alert(`删除失败：${err.message}`, { title: "删除失败" });
    }
  };

  const moveCustomerToGroup = useCallback(
    async (customerId, groupLevel) => {
      const currentCustomer = customersRef.current.find((customer) => customer.id === customerId);
      if (!currentCustomer) return;

      const nextLevel = groupLevel === UNGROUPED_CUSTOMER_GROUP ? "" : groupLevel;
      if ((currentCustomer.level || "") === nextLevel) return;

      const previousCustomers = customersRef.current;
      const nextCustomer = { ...currentCustomer, level: nextLevel };
      const nextCustomers = previousCustomers.map((customer) =>
        customer.id === customerId ? nextCustomer : customer,
      );

      pushUndoSnapshot();
      customersRef.current = nextCustomers;
      setCustomers(nextCustomers);

      try {
        await api.updateCustomer(customerId, nextCustomer);
      } catch (err) {
        customersRef.current = previousCustomers;
        setCustomers(previousCustomers);
        await dialogs.alert(`保存失败：${err.message}`, { title: "保存失败" });
      }
    },
    [dialogs.alert, pushUndoSnapshot],
  );

  const startCustomerLongPress = useCallback(
    (event, customer) => {
      if (event.button != null && event.button !== 0) return;
      if (event.target?.closest?.(".customer-delete")) return;

      clearCustomerDragTimer();
      customerDragSourceRef.current = {
        customer,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        element: event.currentTarget,
      };
      updateCustomerDrag({
        customerId: customer.id,
        active: false,
        x: event.clientX,
        y: event.clientY,
        overLevel: "",
      });

      event.currentTarget.setPointerCapture?.(event.pointerId);
      customerDragTimerRef.current = window.setTimeout(() => {
        customerDragTimerRef.current = null;
        const source = customerDragSourceRef.current;
        if (!source || source.customer.id !== customer.id) return;
        updateCustomerDrag({
          customerId: customer.id,
          active: true,
          x: source.startX,
          y: source.startY,
          overLevel: customerGroupLevel(customer),
        });
      }, CUSTOMER_DRAG_HOLD_MS);
    },
    [clearCustomerDragTimer, updateCustomerDrag],
  );

  const moveCustomerDragPointer = useCallback(
    (event) => {
      const source = customerDragSourceRef.current;
      if (!source) return;

      const current = customerDragRef.current;
      const movedDistance = Math.hypot(
        event.clientX - source.startX,
        event.clientY - source.startY,
      );
      if (!current.active) {
        if (movedDistance > 8) {
          clearCustomerDragTimer();
          source.element?.releasePointerCapture?.(source.pointerId);
          updateCustomerDrag(initialCustomerDrag);
          customerDragSourceRef.current = null;
        }
        return;
      }

      event.preventDefault();
      const targetGroup = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest?.("[data-customer-group-level]");
      const overLevel = targetGroup?.getAttribute("data-customer-group-level") || "";
      updateCustomerDrag({
        ...current,
        x: event.clientX,
        y: event.clientY,
        overLevel,
      });
    },
    [clearCustomerDragTimer, initialCustomerDrag, updateCustomerDrag],
  );

  const endCustomerLongPress = useCallback(
    async (event) => {
      const source = customerDragSourceRef.current;
      const current = customerDragRef.current;
      clearCustomerDragTimer();

      source?.element?.releasePointerCapture?.(source.pointerId);
      customerDragSourceRef.current = null;
      updateCustomerDrag(initialCustomerDrag);

      if (!source || !current.active || !current.overLevel) return;
      await moveCustomerToGroup(source.customer.id, current.overLevel);
    },
    [clearCustomerDragTimer, initialCustomerDrag, moveCustomerToGroup, updateCustomerDrag],
  );

  if (loading) {
    return (
      <div className="app-shell" style={{ alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "#82e5ff", fontSize: "1rem" }}>{t("正在连接数据库...")}</p>
      </div>
    );
  }

  const activeConfig = tableConfigs[activeTable];
  const activeSourceTable = activeConfig.sourceTableKey || activeTable;
  const isHistoryOrders = activeTable === "historyOrders";
  const activeViewColumns = selectedCustomer
    ? getCustomerViewColumns(selectedCustomer, activeTable)
    : [];
  const canCreateActiveRows = !isHistoryOrders && !activeConfig.disableRowCreate;
  const exportCustomer = (() => {
    if (isHistoryOrders) {
      return {
        ...selectedCustomer,
        historyOrders: (selectedCustomer?.orders || []).filter(
          (order) => normalizeOrderStatus(order.status) === "已付款",
        ),
      };
    }
    if (activeTable === "productionSchedule") {
      return {
        ...selectedCustomer,
        productionSchedule: (selectedCustomer?.orders || []).filter(
          (order) => normalizeOrderStatus(order.status) === "已排产",
        ),
      };
    }
    if (activeTable === "deliveries") {
      return {
        ...selectedCustomer,
        deliveries: (selectedCustomer?.deliveries || []).filter((row) => !isFinalDelivery(row)),
      };
    }
    if (activeTable === "finalDeliveries") {
      return {
        ...selectedCustomer,
        finalDeliveries: (selectedCustomer?.deliveries || []).filter((row) => isFinalDelivery(row)),
      };
    }
    return selectedCustomer;
  })();
  return (
    <I18nContext.Provider value={i18n}>
      <div className="app-shell">
        <aside className="sidebar">
          <div className="brand-block">
            <div className="brand-mark">
              <LayoutDashboard size={20} />
            </div>
            <div>
              <p className="eyebrow">FOAM OPS</p>
              <h1>{t("泡沫厂客户管理系统")}</h1>
            </div>
          </div>

          <div className="sidebar-tools">
            <div className="global-search-wrap">
              <label className="search-box global-search">
                <Search size={16} />
                <input
                  value={globalSearchQuery}
                  onChange={(e) => {
                    setGlobalSearchQuery(e.target.value);
                    setShowGlobalSearchResults(true);
                  }}
                  onFocus={() => setShowGlobalSearchResults(true)}
                  onBlur={() => setTimeout(() => setShowGlobalSearchResults(false), 200)}
                  placeholder={t("搜索订单号 / 产品 / 送货单…")}
                />
              </label>
              {showGlobalSearchResults && globalSearchResults.length > 0 && (
                <div className="global-search-results">
                  {globalSearchResults.map((r, i) => (
                    <button
                      key={i}
                      className="search-result-item"
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => navigateToSearchResult(r)}
                    >
                      <span className="search-result-type">
                        {r.type === "customer" ? "👤" : r.type === "order" ? "📋" : "🚚"}
                      </span>
                      <span className="search-result-label">{r.label}</span>
                      <span className="search-result-meta">
                        {r.customerName}
                        {r.detail ? ` · ${r.detail}` : ""}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Button
              size="sm"
              onClick={() => {
                setEditingCustomer(null);
                setShowCustomerModal(true);
              }}
            >
              <UserRoundPlus size={16} data-icon="inline-start" />
              {t("新增客户")}
            </Button>

            <label className="search-box">
              <Search size={16} />
              <input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder={t("搜索客户 / 联系人")}
              />
            </label>

            <div className="customer-list-tools">
              <Button
                variant="ghost"
                size="sm"
                title={t("新增客户分组")}
                onClick={handleAddCustomerGroup}
                className="customer-group-add"
              >
                <Plus size={14} data-icon="inline-start" />
                {t("新增分组")}
              </Button>
            </div>
          </div>

          <div className="customer-list" aria-label={t("客户列表")}>
            {groupedCustomers.map(({ level, customers: groupMembers }) => {
              const collapsed = collapsedGroups.has(level);
              const count = groupMembers.length;
              return (
                <div
                  className={`customer-group ${customerDrag.active && customerDrag.overLevel === level ? "is-drop-target" : ""}`}
                  key={level}
                  data-customer-group-level={level}
                >
                  <div
                    className="customer-group-header"
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleGroup(level)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      toggleGroup(level);
                    }}
                    title={collapsed ? t("展开") : t("折叠")}
                  >
                    <span className={`group-arrow ${collapsed ? "" : "is-open"}`}>▸</span>
                    <span className="group-label">{t(level)}</span>
                    <span className="group-count">{count}</span>
                    {level !== UNGROUPED_CUSTOMER_GROUP && (
                      <span className="group-actions-inline">
                        <button
                          className="group-action-btn"
                          type="button"
                          title="重命名分组"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRenameCustomerGroup(level);
                          }}
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          className="group-action-btn"
                          type="button"
                          title="删除分组"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteCustomerGroup(level);
                          }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </span>
                    )}
                  </div>
                  {!collapsed &&
                    groupMembers.map((customer) => (
                      <div
                        className={`customer-item ${customer.id === selectedCustomerId ? "is-active" : ""} ${customerDrag.active && customerDrag.customerId === customer.id ? "is-dragging" : ""} ${customerDrag.customerId === customer.id && !customerDrag.active ? "is-hold-pending" : ""}`}
                        key={customer.id}
                        onPointerDown={(event) => startCustomerLongPress(event, customer)}
                        onPointerMove={moveCustomerDragPointer}
                        onPointerUp={endCustomerLongPress}
                        onPointerCancel={endCustomerLongPress}
                      >
                        <button
                          className="customer-item-body"
                          type="button"
                          onClick={() => {
                            if (selectedCustomerId)
                              lastTableByCustomerRef.current[selectedCustomerId] = activeTable;
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
                                title={
                                  alertMap[customer.id] === "danger"
                                    ? t("有订单已逾期")
                                    : t("有订单即将到期")
                                }
                              />
                            )}
                          </span>
                          <span className="customer-meta">
                            {customer.contact || t("未填联系人")}
                          </span>
                        </button>
                        <button
                          className="customer-delete"
                          type="button"
                          title={t("删除客户")}
                          onClick={() => deleteCustomer(customer.id)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                </div>
              );
            })}
          </div>
          {customerDrag.active && (
            <div
              className="customer-drag-ghost"
              style={{ transform: `translate(${customerDrag.x + 12}px, ${customerDrag.y + 12}px)` }}
            >
              <strong>
                {customers.find((customer) => customer.id === customerDrag.customerId)?.name || ""}
              </strong>
              <small>
                {customerDrag.overLevel
                  ? t("移至 {group}", { group: t(customerDrag.overLevel) })
                  : t("选择分组")}
              </small>
            </div>
          )}

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
              title={t("导出全部客户数据为 JSON 备份文件")}
              onClick={() => exportBackup(customers)}
            >
              <Archive size={14} />
              {t("备份数据")}
            </button>
            <button
              className="ghost-button"
              type="button"
              title={t("从备份文件恢复数据（将覆盖当前数据）")}
              onClick={() => backupInputRef.current.click()}
            >
              <Archive size={14} />
              {t("恢复备份")}
            </button>
            <button
              className="ghost-button"
              type="button"
              title={t("系统设置")}
              onClick={() => setShowSettings(true)}
            >
              <Settings2 size={14} />
              {t("系统设置")}
            </button>
          </div>
        </aside>

        <main className="workspace">
          <header className="topbar">
            <div>
              <p className="eyebrow">CUSTOMER COMMAND CENTER</p>
              <h2>{selectedCustomer?.name || t("运营仪表盘")}</h2>
            </div>
            <div className="topbar-actions">
              {currentUser && (
                <span className="session-chip customer-session-chip">
                  <UserRound size={15} />
                  {currentUser.name || currentUser.phone} · {desktopRoleLabel(currentUser.role)}
                </span>
              )}
              {onBackToZones && (
                <Button
                  variant="ghost"
                  size="icon"
                  title="返回业务专区"
                  onClick={onBackToZones}
                >
                  <ArrowLeft size={18} />
                </Button>
              )}
              {onLogout && (
                <Button variant="ghost" size="icon" title="退出登录" onClick={onLogout}>
                  <LogOut size={18} />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                title={t("编辑客户档案")}
                onClick={() => {
                  setEditingCustomer(selectedCustomer);
                  setShowCustomerModal(true);
                }}
                disabled={!selectedCustomer}
              >
                <SquarePen size={18} />
              </Button>
            </div>
          </header>

          <section className="metrics-grid" aria-label={t("业务指标")}>
            {metrics.map((metric) => (
              <Card className="metric-card" key={metric.label}>
                <CardHeader className="!p-3 !pb-1">
                  <span className="text-xs text-muted-foreground">{metric.label}</span>
                </CardHeader>
                <CardContent className="!p-3 !pt-0">
                  <strong className="text-2xl font-semibold">{metric.value}</strong>
                  <small className="text-xs text-muted-foreground block mt-1">{metric.detail}</small>
                </CardContent>
              </Card>
            ))}
          </section>

          <CustomerStatisticsPanel customers={customers} onSelectCustomer={setSelectedCustomerId} />
          <>
            {selectedCustomer ? (
              <>
                {alertMap[selectedCustomer.id] && (
                  <div
                    className={`alert-banner flex items-center gap-2 px-4 py-3 rounded-lg text-sm ${
                      alertMap[selectedCustomer.id] === "danger"
                        ? "bg-destructive/10 text-destructive border border-destructive/20"
                        : "bg-muted text-foreground border border-border"
                    }`}
                  >
                    <AlertTriangle size={15} />
                    <span>
                      {alertMap[selectedCustomer.id] === "danger"
                        ? t("该客户有订单已逾期，请尽快跟进。")
                        : t("该客户有订单 3 天内到期，请注意安排。")}
                    </span>
                  </div>
                )}

                <section className="customer-panel">
                  <div className="profile-strip">
                    <InfoPill label={t("联系人")} value={selectedCustomer?.contact} />
                    <InfoPill label={t("电话")} value={selectedCustomer?.phone} />
                    <InfoPill label={t("账期")} value={selectedCustomer?.paymentTerm} />
                    <InfoPill label={t("地址")} value={selectedCustomer?.address} wide />
                  </div>
                </section>

                <section className="table-section">
                  <div className="table-toolbar">
                    <Tabs value={activeTable} onValueChange={(key) => {
                      if (selectedCustomer)
                        lastTableByCustomerRef.current[selectedCustomer.id] = key;
                      setActiveTable(key);
                      setViewMode("grid");
                    }}>
                      <TabsList>
                        {Object.entries(tableConfigs).map(([key, config]) => {
                          const Icon = config.icon;
                          return (
                            <TabsTrigger key={key} value={key}>
                              <Icon size={17} />
                              {t(config.label)}
                            </TabsTrigger>
                          );
                        })}
                      </TabsList>
                    </Tabs>
                    {activeTable === "orders" && selectedCustomer && (
                      <Button
                        variant={viewMode === "kanban" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setViewMode((v) => (v === "kanban" ? "grid" : "kanban"))}
                        title={t("看板视图")}
                      >
                        <KanbanSquare size={16} data-icon="inline-start" />
                        {t("看板")}
                      </Button>
                    )}
                    <div className="toolbar-actions">
                      <label className="filter-box">
                        <Filter size={16} />
                        <input
                          value={quickFilter}
                          onChange={(event) => setQuickFilter(event.target.value)}
                          placeholder={t("筛选当前表格")}
                        />
                      </label>
                      {selectedCustomer && activeTable === "orders" && (
                        <OrderImportButton
                          disabled={!selectedCustomer}
                          dialogs={dialogs}
                          t={t}
                          existingOrders={selectedCustomer?.orders || []}
                          onImport={handleOrderImport}
                        />
                      )}
                      {selectedCustomer && activeTable === "orders" && (
                        <Button
                          variant="secondary"
                          size="sm"
                          title={t("生成对账单")}
                          onClick={handleCreateStatement}
                        >
                          {t("对账单")}
                        </Button>
                      )}
                      {selectedCustomer && activeTable === "productionSchedule" && (
                        <Button
                          variant="secondary"
                          size="sm"
                          title={t("设置手机端排产订单显示字段")}
                          onClick={() => setShowMobileDisplaySettings(true)}
                        >
                          <Settings2 size={16} data-icon="inline-start" />
                          {t("手机字段")}
                        </Button>
                      )}
                      {selectedCustomer && (
                        <Button
                          variant="secondary"
                          size="sm"
                          title={t("导出当前表格为 Excel")}
                          onClick={() =>
                            exportTableToExcel(
                              exportCustomer,
                              activeTable,
                              activeViewColumns.map((column) => ({
                                ...column,
                                headerName: t(column.headerName),
                              })),
                            )
                          }
                        >
                          <Download size={15} data-icon="inline-start" />
                          {t("导出 Excel")}
                        </Button>
                      )}
                      {!isHistoryOrders && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setShowColumnModal(true)}
                          disabled={!selectedCustomer}
                        >
                          <Settings2 size={17} data-icon="inline-start" />
                          {t("自定义表头")}
                        </Button>
                      )}
                      {canCreateActiveRows && (
                        <Button
                          size="sm"
                          onClick={() => addRow(activeSourceTable)}
                          disabled={!selectedCustomer}
                        >
                          <Plus size={17} data-icon="inline-start" />
                          {t("新增{rowLabel}", { rowLabel: t(activeConfig.rowLabel) })}
                        </Button>
                      )}
                    </div>
                  </div>

                  {viewMode === "kanban" && activeTable === "orders" ? (
                    <KanbanBoard
                      customer={selectedCustomer}
                      onStatusChange={(orderId, newStatus) => {
                        const currentCustomer =
                          customers.find((c) => c.id === selectedCustomerId) || selectedCustomer;
                        const updatedOrders = (currentCustomer.orders || []).map((o) =>
                          o.id === orderId ? { ...o, status: newStatus } : o,
                        );
                        pushUndoSnapshot();
                        updateSelectedCustomer((c) => ({ ...c, orders: updatedOrders }));
                        handleRowsChange("orders", updatedOrders);
                      }}
                      onSelectOrder={(orderId) => {
                        setViewMode("grid");
                      }}
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
                      onScheduleOrders={
                        activeTable === "orders" || activeTable === "productionSchedule"
                          ? handleScheduleOrders
                          : null
                      }
                      onUnscheduleOrders={
                        activeTable === "productionSchedule" ? cancelProductionSchedule : null
                      }
                      onCreateDeliveryFromOrders={
                        activeTable === "orders" ? handleCreateDeliveryFromOrders : null
                      }
                      onFinalizeDeliveryDrafts={
                        activeTable === "deliveries" ? handleFinalizeDeliveryDrafts : null
                      }
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
              <DashboardView
                customers={customers}
                alertMap={alertMap}
                onCreateCustomer={() => {
                  setEditingCustomer(null);
                  setShowCustomerModal(true);
                }}
                onSelectCustomer={setSelectedCustomerId}
              />
            )}
          </>
        </main>

        {showCustomerModal && (
          <CustomerModal
            customer={editingCustomer}
            customerGroups={customerGroups}
            onClose={() => setShowCustomerModal(false)}
            onSave={(customerInput) => {
              upsertCustomer(customerInput);
              setShowCustomerModal(false);
            }}
          />
        )}

        {showColumnModal && selectedCustomer && (
          <ColumnModal
            tableKey={activeTable}
            sourceTableKey={activeSourceTable}
            customer={selectedCustomer}
            onClose={() => setShowColumnModal(false)}
            onAddColumn={addCustomColumn}
            onUpdateColumn={updateCustomColumn}
            onRemoveColumn={removeCustomColumn}
            onShowColumns={showViewColumns}
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
            settings={systemSettings}
            t={t}
            onClose={() => setPrintDelivery(null)}
          />
        )}

        {showSettings && (
          <SettingsModal
            settings={systemSettings}
            onClose={() => setShowSettings(false)}
            onSave={async (s) => {
              persistSystemSettings({ ...systemSettings, ...s });
              setShowSettings(false);
            }}
          />
        )}

        {showMobileDisplaySettings && selectedCustomer && (
          <MobileDisplaySettingsModal
            customerName={selectedCustomer.name}
            mobileDisplaySettings={getCustomerMobileDisplaySettings(
              selectedCustomer,
              mobileDisplaySettings,
            )}
            mobileOrderFieldOptions={buildCustomerMobileOrderFieldOptions(selectedCustomer)}
            onClose={() => setShowMobileDisplaySettings(false)}
            onSave={async (nextMobileDisplaySettings) => {
              await saveMobileDisplaySettings(nextMobileDisplaySettings);
              setShowMobileDisplaySettings(false);
            }}
          />
        )}

        <AppDialog dialog={dialogs.dialog} onResolve={dialogs.resolve} />
      </div>
    </I18nContext.Provider>
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
  onUnscheduleOrders = null,
  onCreateDeliveryFromOrders = null,
  onFinalizeDeliveryDrafts = null,
  onColumnOrderChange,
  onRemoveColumns,
  onBeforeDataChange,
  onCreateUndoSnapshot,
  readOnly = false,
  dialogs,
}) {
  const { language, t } = useI18n();
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
  const [photoPreview, setPhotoPreview] = useState(null);
  const deferredQuickFilter = useDeferredValue(quickFilter);
  const localeText = useMemo(() => getGridLocaleText(language), [language]);
  const config = tableConfigs[viewKey];
  const sourceRows = customer[tableKey] || [];
  const rows = useMemo(() => {
    if (viewKey === "orders") {
      return sourceRows.filter((row) => normalizeOrderStatus(row.status) !== "已付款");
    }
    if (viewKey === "productionSchedule") {
      return sourceRows.filter((row) => normalizeOrderStatus(row.status) === "已排产");
    }
    if (viewKey === "historyOrders") {
      return sourceRows.filter((row) => normalizeOrderStatus(row.status) === "已付款");
    }
    if (viewKey === "deliveries") {
      return sourceRows.filter((row) => !isFinalDelivery(row));
    }
    if (viewKey === "finalDeliveries") {
      return sourceRows.filter((row) => isFinalDelivery(row));
    }
    return sourceRows;
  }, [sourceRows, viewKey]);
  const viewColumns = useMemo(() => getCustomerViewColumns(customer, viewKey), [customer, viewKey]);
  const viewDefaultFieldSet = useMemo(
    () => new Set(config.defaultColumns.map((column) => column.field)),
    [config.defaultColumns],
  );
  const savedOrder = customer.customColumns?.columnOrder?.[viewKey];
  const filteredRows = useMemo(() => {
    const activeFilters = Object.entries(columnFilters);
    if (!activeFilters.length) return rows;
    return rows.filter((row) =>
      activeFilters.every(([field, allowedValues]) => {
        const value =
          tableKey === "orders" && field === "status"
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
        .map((status) => {
          const count = groupRows.filter(
            (row) => normalizeFinalDeliveryStatus(row.status) === status,
          ).length;
          return count ? `${t(status)} ${count}` : "";
        })
        .filter(Boolean)
        .join(" / ");
      const quantity = groupRows.reduce(
        (sum, row) => sum + parseNumericValue(row[deliveryQuantityField]),
        0,
      );
      const linkedOrders = new Set(
        groupRows.map((row) => row[linkedOrderIdField] || row.orderNo).filter(Boolean),
      );
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
        result.push(...groupRows.map((row) => ({ ...row, __deliveryGroupChild: true })));
      }
    }

    return result;
  }, [expandedDeliveryGroups, filteredRows, viewKey]);
  const canCreateDeliveryFromOrders =
    tableKey === "orders" &&
    viewKey === "orders" &&
    !readOnly &&
    typeof onCreateDeliveryFromOrders === "function";
  const canScheduleOrders =
    tableKey === "orders" &&
    viewKey === "orders" &&
    !readOnly &&
    typeof onScheduleOrders === "function";
  const canUnscheduleOrders =
    tableKey === "orders" &&
    viewKey === "productionSchedule" &&
    !readOnly &&
    typeof onUnscheduleOrders === "function";
  const canDeleteRows =
    !readOnly && viewKey !== "productionSchedule" && typeof onDeleteRows === "function";
  const canFinalizeDeliveryDrafts =
    tableKey === "deliveries" &&
    viewKey === "deliveries" &&
    !readOnly &&
    typeof onFinalizeDeliveryDrafts === "function";
  const canCreateRows = !readOnly && !config.disableRowCreate;
  const derivedView = isDerivedTableView(viewKey);

  const toggleDeliveryGroup = useCallback((key) => {
    setExpandedDeliveryGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const updateDeliveryGroupStatus = useCallback(
    (key, status) => {
      const normalizedStatus = normalizeFinalDeliveryStatus(status);
      let changed = false;
      const changedRowIds = [];
      const updatedRows = sourceRows.map((row) => {
        if (!isFinalDelivery(row) || deliveryGroupKey(row) !== key) return row;
        if (normalizeFinalDeliveryStatus(row.status) === normalizedStatus) return row;
        changed = true;
        changedRowIds.push(row.id);
        return { ...row, status: normalizedStatus };
      });

      if (!changed) return;
      onBeforeDataChange?.();
      onRowsChange(tableKey, updatedRows, { formulaRowIds: changedRowIds });
    },
    [onBeforeDataChange, onRowsChange, sourceRows, tableKey],
  );

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
      valueGetter: (params) =>
        params.node?.rowPinned ? t("合计") : (params.node?.rowIndex ?? 0) + 1,
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
            title={t("打印送货单")}
            onClick={() => onPrintRow(params.data)}
          >
            <Printer size={14} />
          </button>
        </div>
      ),
    };

    const allCols = viewColumns.map((column) => toGridColumn(column, t, true));

    if (savedOrder?.length) {
      allCols.sort((a, b) => {
        const ai = savedOrder.indexOf(a.field);
        const bi = savedOrder.indexOf(b.field);
        return (ai === -1 ? 9999 : ai) - (bi === -1 ? 9999 : bi);
      });
    }

    const orderedCols =
      tableKey === "orders"
        ? [
            ...allCols.filter((column) => column.field !== "status"),
            ...allCols.filter((column) => column.field === "status"),
          ]
        : allCols;
    const isEditableColumn = (column, params) =>
      typeof column.editable === "function" ? column.editable(params) : column.editable !== false;
    const visibleCols = orderedCols.map((column) => {
      const nextColumn = readOnly ? { ...column, editable: false } : column;

      // Orders 视图：进度由排产、完工、送货、对账等业务动作维护。
      if (viewKey === "orders" && column.field === "status" && !readOnly) {
        return {
          ...nextColumn,
          editable: false,
          cellRenderer: (params) => {
            const value = normalizeOrderStatus(params.value);
            return <span className={`status-chip ${statusClass(value)}`}>{t(value)}</span>;
          },
        };
      }

      // Orders 视图：产品列关联客户产品库下拉选择
      if (viewKey === "orders" && column.field === "product" && !readOnly) {
        const products = customer.products || [];
        const productNames = products.map((p) => p.name);
        return {
          ...nextColumn,
          cellEditor: "agSelectCellEditor",
          cellEditorParams: {
            values: productNames,
          },
          onCellValueChanged: (params) => {
            const selectedProduct = products.find((p) => p.name === params.newValue);
            if (selectedProduct && params.data) {
              const updatedRows = sourceRows.map((row) => {
                if (row.id !== params.data.id) return row;
                return {
                  ...row,
                  product: selectedProduct.name,
                  ...(selectedProduct.spec ? { spec: selectedProduct.spec } : {}),
                  ...(selectedProduct.unit ? { unit: selectedProduct.unit } : {}),
                  ...(selectedProduct.unitPrice ? { unitPrice: selectedProduct.unitPrice } : {}),
                };
              });
              setTimeout(
                () => onRowsChange(tableKey, updatedRows, { formulaRowIds: [params.data.id] }),
                0,
              );
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
              return {
                backgroundColor: "rgba(210, 153, 34, 0.15)",
                borderLeft: "3px solid var(--amber)",
              };
            }
            return null;
          },
        };
      }

      if (viewKey !== "finalDeliveries") return nextColumn;

      if (column.field === "deliveryNo") {
        return {
          ...nextColumn,
          editable: (params) =>
            !params.data?.__isDeliveryGroup && isEditableColumn(nextColumn, params),
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
                title={params.data.__expanded ? t("收起送货单明细") : t("展开送货单明细")}
              >
                <span>{params.data.__expanded ? "▾" : "▸"}</span>
                <strong>{params.value}</strong>
                <small>
                  {t("{count} 行", { count: params.data.__deliveryGroupCount })}
                  {params.data.__deliveryGroupOrderCount
                    ? ` / ${t("{count} 单", { count: params.data.__deliveryGroupOrderCount })}`
                    : ""}
                  {` / ${normalizeCalculatedNumber(parseNumericValue(params.data[deliveryQuantityField]))}`}
                  {params.data.__deliveryGroupStatusSummary
                    ? ` / ${params.data.__deliveryGroupStatusSummary}`
                    : ""}
                </small>
              </button>
            );
          },
        };
      }

      if (column.field === "status") {
        return {
          ...nextColumn,
          editable: (params) =>
            !params.data?.__isDeliveryGroup && isEditableColumn(nextColumn, params),
          cellRenderer: (params) => {
            if (!params.data?.__isDeliveryGroup) {
              const value = normalizeFinalDeliveryStatus(params.value);
              return <span className={`status-chip ${statusClass(value)}`}>{t(value)}</span>;
            }

            const value = normalizeFinalDeliveryStatus(params.value);
            return (
              <select
                className={`delivery-group-status status-chip ${statusClass(value)}`}
                value={value}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) =>
                  updateDeliveryGroupStatus(params.data.__deliveryGroupKey, event.target.value)
                }
                title={t("设置整张送货单状态")}
              >
                {finalDeliveryStatusOptions.map((option) => (
                  <option key={option} value={option}>
                    {t(option)}
                  </option>
                ))}
              </select>
            );
          },
        };
      }

      return {
        ...nextColumn,
        editable: (params) =>
          !params.data?.__isDeliveryGroup && isEditableColumn(nextColumn, params),
      };
    });

    return onPrintRow
      ? [rowNumberColumn, ...visibleCols, actionColumn]
      : [rowNumberColumn, ...visibleCols];
  }, [
    config.defaultColumns,
    onPrintRow,
    readOnly,
    savedOrder,
    tableKey,
    t,
    toggleDeliveryGroup,
    updateDeliveryGroupStatus,
    viewColumns,
    viewKey,
  ]);

  const selectableColumnFields = useMemo(
    () =>
      columnDefs.map((column) => column.field).filter((field) => field && !field.startsWith("__")),
    [columnDefs],
  );

  const selectedColumnFields = useMemo(() => {
    if (selectionRange?.mode !== "columns") return [];

    const minCol = Math.min(selectionRange.startColIndex ?? 0, selectionRange.endColIndex ?? 0);
    const maxCol = Math.max(selectionRange.startColIndex ?? 0, selectionRange.endColIndex ?? 0);
    return selectableColumnFields.filter((_, index) => index >= minCol && index <= maxCol);
  }, [selectableColumnFields, selectionRange]);

  const removableSelectedColumnFields = useMemo(
    () => selectedColumnFields.filter((field) => !viewDefaultFieldSet.has(field)),
    [selectedColumnFields, viewDefaultFieldSet],
  );

  const tableColumns = viewColumns;
  const formulaColumnFields = useMemo(
    () =>
      tableColumns
        .filter((column) => normalizeFormulaInput(column.formula))
        .map((column) => column.field),
    [tableColumns],
  );

  const columnHeaderByField = useMemo(
    () => new Map(tableColumns.map((column) => [column.field, t(column.headerName)])),
    [tableColumns, t],
  );

  const summaryRowData = useMemo(() => {
    if (!selectableColumnFields.length) return [];

    const summary = {};
    const firstField = selectableColumnFields[0];
    summary[firstField] = t("合计 {count} 行", { count: filteredRows.length });

    for (const column of tableColumns) {
      if (column.type !== "number") continue;

      summary[column.field] = filteredRows.reduce((total, row) => {
        const value = Number(row[column.field]);
        return Number.isFinite(value) ? total + value : total;
      }, 0);
    }

    return [summary];
  }, [filteredRows, selectableColumnFields, tableColumns, t]);

  const canFillDown =
    selectionRange?.mode === "cells" &&
    Math.min(selectionRange.startRowIndex ?? 0, selectionRange.endRowIndex ?? 0) <
      Math.max(selectionRange.startRowIndex ?? 0, selectionRange.endRowIndex ?? 0);
  const canFillRight =
    selectionRange?.mode === "cells" &&
    Math.min(selectionRange.startColIndex ?? 0, selectionRange.endColIndex ?? 0) <
      Math.max(selectionRange.startColIndex ?? 0, selectionRange.endColIndex ?? 0);

  const defaultColDef = useMemo(
    () => ({
      editable: (params) => !readOnly && !params.node?.rowPinned,
      sortable: true,
      filter: false,
      resizable: true,
      minWidth: 90,
      wrapHeaderText: true,
      autoHeaderHeight: true,
      singleClickEdit: false,
    }),
    [readOnly],
  );

  const scheduleAutoSizeColumns = useCallback((options = {}) => {
    const requestedFields = Array.isArray(options.fields) ? options.fields.filter(Boolean) : null;
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
      let colIds = (pendingFields?.length ? pendingFields : fields).filter((field) =>
        fieldSet.has(field),
      );

      if (!pendingFields?.length) {
        const displayedColumns =
          api.getAllDisplayedVirtualColumns?.() || api.getAllDisplayedColumns?.() || [];
        if (displayedColumns.length) {
          const displayedIds = new Set(
            displayedColumns.map((column) => column.getColId?.() || column.colId),
          );
          colIds = colIds.filter((field) => displayedIds.has(field));
        }
      }

      if (!colIds.length) return;

      api.autoSizeColumns({
        colIds,
        skipHeader: false,
        defaultMinWidth: 90,
        columnLimits: [
          { colId: "deliveryNo", minWidth: 150, maxWidth: 220 },
          { colId: "orderNo", minWidth: 130, maxWidth: 220 },
          { colId: "status", minWidth: 110, maxWidth: 150 },
          { colId: "followUp", minWidth: 160 },
          { colId: deliveryOrderField("followUp"), minWidth: 160 },
        ],
      });
    };

    if (autoSizeTimerRef.current) {
      window.clearTimeout(autoSizeTimerRef.current);
    }
    autoSizeTimerRef.current = window.setTimeout(
      () => {
        window.requestAnimationFrame(run);
      },
      options.delay ?? (requestedFields?.length ? 90 : 160),
    );
  }, []);

  useEffect(
    () => () => {
      if (autoSizeTimerRef.current) {
        window.clearTimeout(autoSizeTimerRef.current);
      }
    },
    [],
  );

  const autoSizeSignature = useMemo(
    () => [viewKey, selectableColumnFields.join("|")].join("::"),
    [selectableColumnFields, viewKey],
  );

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
    const rowIds = new Set(rows.map((row) => row.id));
    setSelectedIds((current) => current.filter((id) => rowIds.has(id)));
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
      if (
        node.rowIndex < minRow ||
        node.rowIndex > maxRow ||
        !node.data?.id ||
        node.data.__isDeliveryGroup
      )
        return;
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
      if (node.rowPinned || node.rowIndex == null || !node.data?.id || node.data.__isDeliveryGroup)
        return;
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

  const selectRowsByRange = useCallback(
    (startRowIndex, endRowIndex) => {
      const nextSelection = { mode: "rows", startRowIndex, endRowIndex };
      selectionRangeRef.current = nextSelection;
      setSelectionRange(nextSelection);
      setSelectedIds(getVisibleRowIdsInRange(startRowIndex, endRowIndex));
    },
    [getVisibleRowIdsInRange],
  );

  const selectCellsByRange = useCallback(
    (startRowIndex, endRowIndex, startColIndex, endColIndex) => {
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
    },
    [],
  );

  const selectColumnsByRange = useCallback((startColIndex, endColIndex) => {
    const nextSelection = { mode: "columns", startColIndex, endColIndex };
    selectionRangeRef.current = nextSelection;
    setSelectionRange(nextSelection);
    setSelectedIds([]);
    gridRef.current?.api?.deselectAll();
  }, []);

  const handleCellMouseDown = useCallback(
    (event) => {
      if (
        event.event?.button !== 0 ||
        !event.node ||
        event.node.rowPinned ||
        isInteractiveTarget(event.event?.target)
      )
        return;

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
    },
    [selectableColumnFields, selectCellsByRange, selectRowsByRange, toggleDeliveryGroup],
  );

  const handleCellMouseOver = useCallback(
    (event) => {
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
    },
    [selectableColumnFields, selectCellsByRange, selectRowsByRange],
  );

  const handleCellContextMenu = useCallback(
    (event) => {
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
    },
    [
      isCellInsideSelection,
      positionContextMenu,
      selectCellsByRange,
      selectableColumnFields,
      selectRowsByRange,
    ],
  );

  const handleSelectionChanged = useCallback((event) => {
    const selectedRows = event.api.getSelectedRows().filter((row) => !row.__isDeliveryGroup);
    setSelectedIds(selectedRows.map((row) => row.id));
  }, []);

  const getSelectedAreaScope = useCallback((selection = selectionRangeRef.current) => {
    if (!selection) return null;

    const fields = selectableColumnFieldsRef.current;
    const minCol = Math.min(selection.startColIndex ?? 0, selection.endColIndex ?? 0);
    const maxCol = Math.max(selection.startColIndex ?? 0, selection.endColIndex ?? 0);
    const selectedFields =
      selection.mode === "rows"
        ? fields
        : fields.filter((_, index) => index >= minCol && index <= maxCol);
    if (!selectedFields.length) return null;

    const minRow = Math.min(selection.startRowIndex ?? 0, selection.endRowIndex ?? 0);
    const maxRow = Math.max(selection.startRowIndex ?? 0, selection.endRowIndex ?? 0);
    const rowIds = new Set();

    gridRef.current?.api?.forEachNodeAfterFilterAndSort((node) => {
      if (!node.data?.id || node.data.__isDeliveryGroup) return;
      if (selection.mode !== "columns" && (node.rowIndex < minRow || node.rowIndex > maxRow))
        return;
      rowIds.add(node.data.id);
    });

    return rowIds.size ? { fields: selectedFields, rowIds } : null;
  }, []);

  const selectionAgg = useMemo(() => {
    const scope = getSelectedAreaScope(selectionRange);
    const rowIds = scope?.rowIds || new Set(selectedIds);
    const fields = scope?.fields || selectableColumnFields;
    if (!rowIds.size || !fields.length) return null;

    const fieldSet = new Set(fields);
    const selectedRows = gridRows.filter((row) => rowIds.has(row.id) && !row.__isDeliveryGroup);
    const values = [];
    for (const row of selectedRows) {
      for (const field of fieldSet) {
        const value = row[field];
        if (!isNumericLike(value)) continue;
        values.push(parseNumericValue(value));
      }
    }
    if (!values.length) return null;
    const sum = values.reduce((a, b) => a + b, 0);
    return {
      sum: normalizeCalculatedNumber(sum),
      avg: normalizeCalculatedNumber(sum / values.length),
      count: values.length,
      min: normalizeCalculatedNumber(Math.min(...values)),
      max: normalizeCalculatedNumber(Math.max(...values)),
    };
  }, [getSelectedAreaScope, gridRows, selectableColumnFields, selectedIds, selectionRange]);

  const startColumnSelection = useCallback(
    (field, mouseEvent) => {
      if (mouseEvent.button !== 0) return;

      const colIndex = selectableColumnFields.indexOf(field);
      if (colIndex === -1) return;

      mouseEvent.preventDefault();
      dragSelectionRef.current = {
        mode: "columns",
        startColIndex: colIndex,
      };
      selectColumnsByRange(colIndex, colIndex);
    },
    [selectableColumnFields, selectColumnsByRange],
  );

  const updateColumnSelection = useCallback(
    (field, mouseEvent) => {
      const drag = dragSelectionRef.current;
      if (!drag || drag.mode !== "columns" || mouseEvent.buttons !== 1) return;

      const colIndex = selectableColumnFields.indexOf(field);
      if (colIndex === -1) return;

      selectColumnsByRange(drag.startColIndex, colIndex);
    },
    [selectableColumnFields, selectColumnsByRange],
  );

  const openHeaderContextMenu = useCallback(
    (field, mouseEvent) => {
      const colIndex = selectableColumnFields.indexOf(field);
      if (colIndex === -1) return;

      mouseEvent.preventDefault();
      if (!isCellInsideSelection(0, colIndex)) {
        selectColumnsByRange(colIndex, colIndex);
      }
      positionContextMenu(mouseEvent);
    },
    [isCellInsideSelection, positionContextMenu, selectableColumnFields, selectColumnsByRange],
  );

  const handleDragStopped = useCallback(
    (event) => {
      if (!onColumnOrderChange) return;
      const order = event.api
        .getColumnState()
        .filter((c) => c.colId !== "__actions")
        .map((c) => c.colId);
      onColumnOrderChange(viewKey, order);
    },
    [onColumnOrderChange, viewKey],
  );

  const handleBatchDelete = async () => {
    if (!canDeleteRows || !selectedIds.length) return;
    if (
      !(await dialogs.confirm(
        t("确认删除选中的 {count} 行？此操作不可恢复。", { count: selectedIds.length }),
        {
          title: "删除选中行",
          tone: "danger",
        },
      ))
    )
      return;
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

  const handleUnscheduleSelectedRows = async () => {
    if (!canUnscheduleOrders || !selectedIds.length) return;
    const unscheduled = await onUnscheduleOrders(selectedIds);
    if (!unscheduled) return;

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
    if (!canDeleteRows || !selection) return;

    if (selection.mode === "rows") {
      const rowIds = getVisibleRowIdsInRange(selection.startRowIndex, selection.endRowIndex);
      if (!rowIds.length) return;
      if (
        !(await dialogs.confirm(
          t("确认删除选中的 {count} 行？此操作不可恢复。", { count: rowIds.length }),
          {
            title: "删除选中行",
            tone: "danger",
          },
        ))
      )
        return;
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
  }, [
    canDeleteRows,
    dialogs.confirm,
    getVisibleRowIdsInRange,
    onBeforeDataChange,
    onDeleteRows,
    onRowsChange,
    sourceRows,
    tableKey,
    t,
  ]);

  const getSelectedAreaForCopy = useCallback(() => {
    const selection = selectionRangeRef.current;
    if (!selection) return null;

    const fields = selectableColumnFieldsRef.current;
    const minCol = Math.min(selection.startColIndex ?? 0, selection.endColIndex ?? 0);
    const maxCol = Math.max(selection.startColIndex ?? 0, selection.endColIndex ?? 0);
    const selectedFields =
      selection.mode === "rows"
        ? fields
        : fields.filter((_, index) => index >= minCol && index <= maxCol);
    if (!selectedFields.length) return null;

    const minRow = Math.min(selection.startRowIndex ?? 0, selection.endRowIndex ?? 0);
    const maxRow = Math.max(selection.startRowIndex ?? 0, selection.endRowIndex ?? 0);
    const rowNodes = [];

    gridRef.current?.api?.forEachNodeAfterFilterAndSort((node) => {
      if (!node.data?.id || node.data.__isDeliveryGroup) return;
      if (selection.mode !== "columns" && (node.rowIndex < minRow || node.rowIndex > maxRow))
        return;
      rowNodes.push(node);
    });

    if (!rowNodes.length) return null;
    return { rowNodes, fields: selectedFields };
  }, []);

  const getSelectedAreaText = useCallback(
    (includeHeaders = false) => {
      const area = getSelectedAreaForCopy();
      if (!area) return "";

      const body = area.rowNodes
        .map((node) =>
          area.fields.map((field) => encodeClipboardCell(node.data?.[field])).join("\t"),
        )
        .join("\r\n");
      if (!includeHeaders) return body;

      const headers = area.fields
        .map((field) => encodeClipboardCell(columnHeaderByField.get(field) || field))
        .join("\t");
      return body ? `${headers}\r\n${body}` : headers;
    },
    [columnHeaderByField, getSelectedAreaForCopy],
  );

  const copySelectedArea = useCallback(
    (clipboardData) => {
      if (!clipboardData) return false;
      const text = getSelectedAreaText();
      if (!text) return false;

      clipboardData.setData("text/plain", text);
      return true;
    },
    [getSelectedAreaText],
  );

  const pasteClipboardData = useCallback(
    (text) => {
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

      const startRowPosition = visibleNodes.findIndex((node) => node.rowIndex === anchorRowIndex);
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
        sourceRows.map((row) => updatedRowsById.get(row.id) || row),
        { formulaRowIds: updatedRowsById.keys() },
      );
      return true;
    },
    [onBeforeDataChange, onRowsChange, sourceRows, tableKey],
  );

  const fillSelectedCells = useCallback(
    (direction) => {
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
        const sourceNode = selectedNodes.find((node) => node.rowIndex === minRow);
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
        sourceRows.map((row) => updatedRowsById.get(row.id) || row),
        { formulaRowIds: updatedRowsById.keys() },
      );
      return true;
    },
    [onBeforeDataChange, onRowsChange, sourceRows, tableKey],
  );

  useEffect(() => {
    fillSelectedCellsRef.current = fillSelectedCells;
  }, [fillSelectedCells]);

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

  const setSelectedAreaValue = useCallback(
    (value) => {
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
    },
    [getSelectedAreaScope, onBeforeDataChange, onRowsChange, sourceRows, tableKey],
  );

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
    const maxCol = Math.max(
      selection?.startColIndex ?? fields.length - 1,
      selection?.endColIndex ?? fields.length - 1,
    );
    const fieldsToReplace =
      !selection || selection.mode === "rows"
        ? fields
        : fields.filter((_, index) => index >= minCol && index <= maxCol);
    if (!fieldsToReplace.length) return;

    const minRow = Math.min(
      selection?.startRowIndex ?? 0,
      selection?.endRowIndex ?? Number.MAX_SAFE_INTEGER,
    );
    const maxRow = Math.max(
      selection?.startRowIndex ?? 0,
      selection?.endRowIndex ?? Number.MAX_SAFE_INTEGER,
    );
    const targetRowIds = new Set();

    gridRef.current?.api?.forEachNodeAfterFilterAndSort((node) => {
      if (!node.data?.id || node.data.__isDeliveryGroup) return;
      if (
        selection &&
        selection.mode !== "columns" &&
        (node.rowIndex < minRow || node.rowIndex > maxRow)
      )
        return;
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
    await dialogs.alert(t("已替换 {count} 个单元格。", { count: replaceCount }), {
      title: "替换完成",
    });
  }, [dialogs.alert, dialogs.prompt, onBeforeDataChange, onRowsChange, sourceRows, tableKey, t]);

  const duplicateSelectedRows = useCallback(() => {
    if (!canCreateRows) return false;
    const selection = selectionRangeRef.current;
    if (!selection || selection.mode !== "rows") return false;

    const rowIds = getVisibleRowIdsInRange(selection.startRowIndex, selection.endRowIndex);
    if (!rowIds.length) return false;

    const selectedRowById = new Map(sourceRows.map((row) => [row.id, row]));
    const clonedRows = rowIds
      .map((id) => selectedRowById.get(id))
      .filter(Boolean)
      .map((row) => ({ ...row, id: makeId(tableKey) }));
    if (!clonedRows.length) return false;

    const maxRow = Math.max(selection.startRowIndex ?? 0, selection.endRowIndex ?? 0);
    const targetNode = getVisibleNodeAtRowIndex(maxRow);
    const originalIndex = targetNode?.data?.id
      ? sourceRows.findIndex((row) => row.id === targetNode.data.id)
      : -1;
    const insertIndex = originalIndex === -1 ? sourceRows.length : originalIndex + 1;
    const nextRows = [...sourceRows];
    nextRows.splice(insertIndex, 0, ...clonedRows);

    onBeforeDataChange?.();
    onRowsChange(tableKey, nextRows, { formulaRowIds: clonedRows.map((row) => row.id) });
    return true;
  }, [
    canCreateRows,
    getVisibleNodeAtRowIndex,
    getVisibleRowIdsInRange,
    onBeforeDataChange,
    onRowsChange,
    sourceRows,
    tableKey,
  ]);

  const getInsertRowCount = useCallback(
    (placement) => {
      const parsed = Number.parseInt(insertRowCounts[placement], 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    },
    [insertRowCounts],
  );

  const insertRowAtSelection = useCallback(
    (placement, count = 1) => {
      if (!canCreateRows) return;
      const selection = selectionRangeRef.current;
      const minRow = Math.min(selection?.startRowIndex ?? 0, selection?.endRowIndex ?? 0);
      const maxRow = Math.max(selection?.startRowIndex ?? 0, selection?.endRowIndex ?? 0);
      const targetNode = getVisibleNodeAtRowIndex(placement === "above" ? minRow : maxRow);
      const originalIndex = targetNode?.data?.id
        ? sourceRows.findIndex((row) => row.id === targetNode.data.id)
        : -1;
      const insertIndex =
        originalIndex === -1
          ? placement === "above"
            ? 0
            : sourceRows.length
          : originalIndex + (placement === "below" ? 1 : 0);
      const normalizedCount = Math.floor(count);
      const rowCount =
        Number.isFinite(normalizedCount) && normalizedCount > 0 ? normalizedCount : 1;
      const newRows = Array.from({ length: rowCount }, () => ({
        id: makeId(tableKey),
        ...config.emptyRow,
        date: today(),
      }));
      const nextRows = [...sourceRows];
      nextRows.splice(insertIndex, 0, ...newRows);

      onBeforeDataChange?.();
      onRowsChange(tableKey, nextRows, { formulaRowIds: newRows.map((row) => row.id) });
    },
    [
      canCreateRows,
      config.emptyRow,
      getVisibleNodeAtRowIndex,
      onBeforeDataChange,
      onRowsChange,
      sourceRows,
      tableKey,
    ],
  );

  const submitInsertRows = useCallback(
    (event, placement) => {
      event.preventDefault();
      insertRowAtSelection(placement, getInsertRowCount(placement));
      setContextMenu(null);
    },
    [getInsertRowCount, insertRowAtSelection],
  );

  const getSelectedRowIdsForMenu = useCallback(() => {
    const selection = selectionRangeRef.current;
    if (!selection || selection.mode !== "rows") return [];

    return getVisibleRowIdsInRange(selection.startRowIndex, selection.endRowIndex);
  }, [getVisibleRowIdsInRange]);

  const deleteRowsFromMenu = useCallback(async () => {
    if (!canDeleteRows) return;
    const rowIds = getSelectedRowIdsForMenu();
    if (!rowIds.length) return;
    if (
      !(await dialogs.confirm(
        t("确认删除选中的 {count} 行？此操作不可恢复。", { count: rowIds.length }),
        {
          title: "删除选中行",
          tone: "danger",
        },
      ))
    )
      return;

    onDeleteRows(tableKey, rowIds);
    setSelectedIds([]);
    gridRef.current?.api?.deselectAll();
    setSelectionRange(null);
  }, [canDeleteRows, dialogs.confirm, getSelectedRowIdsForMenu, onDeleteRows, tableKey, t]);

  const deleteSelectedColumnsFromMenu = useCallback(async () => {
    if (!onRemoveColumns || !removableSelectedColumnFields.length) return;

    const columnNames = removableSelectedColumnFields
      .map((field) => columnHeaderByField.get(field) || field)
      .join("、");
    const lockedCount = selectedColumnFields.length - removableSelectedColumnFields.length;
    const actionText = derivedView ? t("从当前视图移除") : t("删除");
    const lockedMessage =
      lockedCount > 0
        ? t("\n其中 {count} 个默认表头不会{action}。", { count: lockedCount, action: actionText })
        : "";

    if (
      !(await dialogs.confirm(
        t("确认{action}选中的 {count} 个自定义表头？\n{names}{lockedMessage}", {
          action: actionText,
          count: removableSelectedColumnFields.length,
          names: columnNames,
          lockedMessage,
        }),
        {
          title: "删除表头",
          tone: "danger",
        },
      ))
    )
      return;

    onRemoveColumns(tableKey, removableSelectedColumnFields);
    setSelectionRange(null);
  }, [
    columnHeaderByField,
    derivedView,
    dialogs.confirm,
    onRemoveColumns,
    removableSelectedColumnFields,
    selectedColumnFields.length,
    tableKey,
    t,
  ]);

  const sortSelectedColumnFromMenu = useCallback(
    (sort) => {
      const field = selectedColumnFields[0];
      if (!field) return;

      gridRef.current?.api?.applyColumnState({
        defaultState: { sort: null },
        state: [{ colId: field, sort }],
      });
    },
    [selectedColumnFields],
  );

  const clearSortFromMenu = useCallback(() => {
    gridRef.current?.api?.applyColumnState({
      defaultState: { sort: null },
    });
  }, []);

  const copyFromMenu = useCallback(
    async (includeHeaders = false) => {
      const text = getSelectedAreaText(includeHeaders);
      if (!text) return;

      try {
        await navigator.clipboard.writeText(text);
      } catch (err) {
        await dialogs.alert(`复制失败：${err.message}`, { title: "复制失败" });
      }
    },
    [dialogs.alert, getSelectedAreaText],
  );

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
      const direction =
        isShortcut && key === "d" ? "down" : isShortcut && key === "r" ? "right" : null;
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

  const openImagePreview = useCallback(
    (src, title) => {
      if (!src) return;
      setPhotoPreview({
        src,
        title: title || t("照片证明"),
      });
    },
    [t],
  );

  const closeImagePreview = useCallback(() => {
    setPhotoPreview(null);
  }, []);

  useEffect(() => {
    if (!photoPreview) return undefined;

    const closeOnEscape = (event) => {
      if (event.key === "Escape") closeImagePreview();
    };

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [closeImagePreview, photoPreview]);

  const cloneColumnFilters = useCallback(
    (filters) =>
      Object.fromEntries(
        Object.entries(filters).map(([field, values]) => [field, new Set(values)]),
      ),
    [],
  );

  const pushColumnFilterUndo = useCallback(() => {
    filterUndoStackRef.current = [
      ...filterUndoStackRef.current,
      cloneColumnFilters(columnFilters),
    ].slice(-MAX_UNDO_STEPS);
  }, [cloneColumnFilters, columnFilters]);

  const applyColumnFilter = useCallback(
    (field, selectedValues, allValues) => {
      pushColumnFilterUndo();
      setColumnFilters((current) => {
        const next = { ...current };
        if (selectedValues.size === allValues.length) delete next[field];
        else next[field] = new Set(selectedValues);
        return next;
      });
      setFilterPopup(null);
      gridRef.current?.api?.deselectAll();
      setSelectedIds([]);
      setSelectionRange(null);
    },
    [pushColumnFilterUndo],
  );

  const clearColumnFilter = useCallback(
    (field) => {
      pushColumnFilterUndo();
      setColumnFilters((current) => {
        const next = { ...current };
        delete next[field];
        return next;
      });
      setFilterPopup(null);
    },
    [pushColumnFilterUndo],
  );

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

  const gridContext = useMemo(
    () => ({
      language,
      t,
      openColumnFilter,
      openImagePreview,
      activeFilterFields: new Set(Object.keys(columnFilters)),
      selectionRangeRef,
      selectableColumnFieldsRef,
      selectAllRows: selectAllVisibleRows,
      startColumnSelection,
      updateColumnSelection,
      openHeaderContextMenu,
    }),
    [
      columnFilters,
      language,
      openHeaderContextMenu,
      openColumnFilter,
      openImagePreview,
      selectAllVisibleRows,
      startColumnSelection,
      t,
      updateColumnSelection,
    ],
  );

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
        const newRow = {
          ...config.emptyRow,
          id: makeId(tableKey),
          date: tableKey === "orders" ? today() : "",
          orderNo: "",
          status: "未完成",
        };
        const newRows = [...sourceRows, newRow];
        onBeforeDataChange?.();
        onRowsChange(tableKey, newRows);
        setTimeout(() => {
          const api = gridRef.current?.api;
          if (!api) return;
          const lastIndex = api.getDisplayedRowCount() - 1;
          api.ensureIndexVisible(lastIndex);
          api.startEditingCell({
            rowIndex: lastIndex,
            colKey: selectableColumnFields[1] || selectableColumnFields[0],
          });
        }, 150);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "d" && selectedIds.length === 1) {
        e.preventDefault();
        const row = sourceRows.find((r) => r.id === selectedIds[0]);
        if (row) {
          const copiedRow = { ...row, id: makeId(tableKey), orderNo: "", date: today() };
          const newRows = [...sourceRows, copiedRow];
          onBeforeDataChange?.();
          onRowsChange(tableKey, newRows);
        }
      }
      if (canDeleteRows && e.key === "Delete" && selectedIds.length > 0) {
        e.preventDefault();
        handleBatchDelete();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [canDeleteRows, selectedIds, sourceRows, tableKey, onRowsChange, onBeforeDataChange]);

  const getGridRowClass = useCallback(
    (params) => (params.data?.__isDeliveryGroup ? "delivery-group-row" : undefined),
    [],
  );

  const getGridRowId = useCallback((params) => params.data.id, []);

  const [bulkEditField, setBulkEditField] = useState("");
  const [bulkEditValue, setBulkEditValue] = useState("");
  const [showBulkEdit, setShowBulkEdit] = useState(false);

  const applyBulkEdit = () => {
    if (!bulkEditField || !selectedIds.length) return;
    const updatedRows = sourceRows.map((row) =>
      selectedIds.includes(row.id) ? { ...row, [bulkEditField]: bulkEditValue } : row,
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
          <span>{t("已选中 {count} 行", { count: selectedIds.length })}</span>
          <div className="grid-selection-actions">
            {canScheduleOrders && (
              <button
                className="secondary-button compact"
                type="button"
                onClick={handleScheduleSelectedRows}
              >
                <KanbanSquare size={14} />
                {t("排产")}
              </button>
            )}
            {canUnscheduleOrders && (
              <button
                className="secondary-button compact"
                type="button"
                onClick={handleUnscheduleSelectedRows}
              >
                <RotateCcw size={14} />
                {t("取消排产")}
              </button>
            )}
            {canCreateDeliveryFromOrders && (
              <button
                className="secondary-button compact"
                type="button"
                onClick={handleCreateDeliveryFromSelectedRows}
              >
                <Truck size={14} />
                {t("生成送货单自动关联订单")}
              </button>
            )}
            {canFinalizeDeliveryDrafts && (
              <button
                className="secondary-button compact"
                type="button"
                onClick={handleFinalizeSelectedDeliveryDrafts}
              >
                <Truck size={14} />
                {t("确认生成送货单")}
              </button>
            )}
            <button
              className="secondary-button compact"
              type="button"
              onClick={() => setShowBulkEdit(!showBulkEdit)}
            >
              <Pencil size={14} />
              {t("批量修改")}
            </button>
            {canDeleteRows && (
              <button className="danger-button compact" type="button" onClick={handleBatchDelete}>
                <Trash2 size={14} />
                {t("批量删除")}
              </button>
            )}
          </div>
          {showBulkEdit && (
            <div className="bulk-edit-row">
              <select value={bulkEditField} onChange={(e) => setBulkEditField(e.target.value)}>
                <option value="">{t("选择字段")}</option>
                {tableColumns
                  .filter((c) => c.field !== "id" && c.field !== "__actions")
                  .map((c) => (
                    <option key={c.field} value={c.field}>
                      {t(c.headerName)}
                    </option>
                  ))}
              </select>
              <input
                value={bulkEditValue}
                onChange={(e) => setBulkEditValue(e.target.value)}
                placeholder={t("新值")}
                onKeyDown={(e) => e.key === "Enter" && applyBulkEdit()}
              />
              <button
                className="primary-action compact"
                type="button"
                onClick={applyBulkEdit}
                style={{ minHeight: 32 }}
              >
                {t("应用")}
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
          headerHeight={44}
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
      {photoPreview && (
        <div
          className="photo-preview-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={photoPreview.title}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeImagePreview();
          }}
        >
          <div className="photo-preview-card">
            <div className="photo-preview-head">
              <strong>{photoPreview.title}</strong>
              <button
                className="photo-preview-close"
                type="button"
                onClick={closeImagePreview}
                title={t("关闭")}
              >
                <X size={18} />
              </button>
            </div>
            <div className="photo-preview-body">
              <img src={photoPreview.src} alt={photoPreview.title} />
            </div>
          </div>
        </div>
      )}
      {contextMenu && (
        <div
          className="grid-context-menu"
          style={{ left: contextMenu.left, top: contextMenu.top }}
          role="menu"
          onContextMenu={(event) => event.preventDefault()}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              findInTable();
              setContextMenu(null);
            }}
          >
            <Search size={14} />
            {t("查找")}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              replaceInTable();
              setContextMenu(null);
            }}
          >
            <SquarePen size={14} />
            {t("替换")}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              copyFromMenu();
              setContextMenu(null);
            }}
          >
            <Copy size={14} />
            {t("复制")}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              copyFromMenu(true);
              setContextMenu(null);
            }}
          >
            <ClipboardList size={14} />
            {t("复制带表头")}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              pasteFromMenu();
              setContextMenu(null);
            }}
          >
            <ClipboardPaste size={14} />
            {t("粘贴")}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              clearSelectedContents();
              setContextMenu(null);
            }}
          >
            <Eraser size={14} />
            {t("清空内容")}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!selectionRange}
            onClick={() => {
              batchModifySelectedArea();
              setContextMenu(null);
            }}
          >
            <SquarePen size={14} />
            {t("批量修改选区")}
          </button>
          {selectionRange?.mode === "cells" && (
            <>
              <button
                type="button"
                role="menuitem"
                disabled={!canFillDown}
                onClick={() => {
                  fillSelectedCells("down");
                  setContextMenu(null);
                }}
              >
                <ArrowDown size={14} />
                {t("向下填充")}
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={!canFillRight}
                onClick={() => {
                  fillSelectedCells("right");
                  setContextMenu(null);
                }}
              >
                <ArrowRight size={14} />
                {t("向右填充")}
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
                onClick={() => {
                  sortSelectedColumnFromMenu("asc");
                  setContextMenu(null);
                }}
              >
                <ArrowUp size={14} />
                {t("升序排序")}
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={!selectedColumnFields.length}
                onClick={() => {
                  sortSelectedColumnFromMenu("desc");
                  setContextMenu(null);
                }}
              >
                <ArrowDown size={14} />
                {t("降序排序")}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  clearSortFromMenu();
                  setContextMenu(null);
                }}
              >
                <RotateCcw size={14} />
                {t("清除排序")}
              </button>
              <div className="grid-context-menu-separator" />
              <button
                className="is-danger"
                type="button"
                role="menuitem"
                disabled={!removableSelectedColumnFields.length}
                title={
                  removableSelectedColumnFields.length
                    ? derivedView
                      ? t("从当前视图移除选中的自定义表头")
                      : t("删除选中的自定义表头")
                    : t("默认表头不可移除")
                }
                onClick={() => {
                  deleteSelectedColumnsFromMenu();
                  setContextMenu(null);
                }}
              >
                <Trash2 size={14} />
                {derivedView ? t("从当前视图移除选中列") : t("删除选中列（表头）")}
              </button>
            </>
          ) : (
            <>
              <div className="grid-context-menu-separator" />
              <button
                type="button"
                role="menuitem"
                disabled={!canCreateRows || selectionRange?.mode !== "rows"}
                onClick={() => {
                  duplicateSelectedRows();
                  setContextMenu(null);
                }}
              >
                <Copy size={14} />
                {t("复制选中行为新行")}
              </button>
              {canCreateRows && (
                <>
                  <form
                    className="grid-context-menu-insert"
                    onSubmit={(event) => submitInsertRows(event, "above")}
                  >
                    <button type="submit" role="menuitem">
                      <Plus size={14} />
                      {t("在上方插入")}
                    </button>
                    <input
                      aria-label={t("上方插入行数")}
                      inputMode="numeric"
                      min="1"
                      placeholder="1"
                      type="number"
                      value={insertRowCounts.above}
                      onChange={(event) =>
                        setInsertRowCounts((current) => ({
                          ...current,
                          above: event.target.value,
                        }))
                      }
                    />
                    <span>{t("行")}</span>
                  </form>
                  <form
                    className="grid-context-menu-insert"
                    onSubmit={(event) => submitInsertRows(event, "below")}
                  >
                    <button type="submit" role="menuitem">
                      <Plus size={14} />
                      {t("在下方插入")}
                    </button>
                    <input
                      aria-label={t("下方插入行数")}
                      inputMode="numeric"
                      min="1"
                      placeholder="1"
                      type="number"
                      value={insertRowCounts.below}
                      onChange={(event) =>
                        setInsertRowCounts((current) => ({
                          ...current,
                          below: event.target.value,
                        }))
                      }
                    />
                    <span>{t("行")}</span>
                  </form>
                </>
              )}
              {canDeleteRows && (
                <button
                  className="is-danger"
                  type="button"
                  role="menuitem"
                  disabled={selectionRange?.mode !== "rows"}
                  onClick={() => {
                    deleteRowsFromMenu();
                    setContextMenu(null);
                  }}
                >
                  <Trash2 size={14} />
                  {t("删除选中行")}
                </button>
              )}
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
      {selectionAgg && (
        <div className="selection-summary">
          <span className="selection-summary-item">
            <span className="selection-summary-label">{t("合计")}</span>
            <span className="selection-summary-value">
              {Number(selectionAgg.sum).toLocaleString()}
            </span>
          </span>
          <span className="selection-summary-item">
            <span className="selection-summary-label">{t("平均")}</span>
            <span className="selection-summary-value">
              {Number(selectionAgg.avg).toLocaleString()}
            </span>
          </span>
          <span className="selection-summary-item">
            <span className="selection-summary-label">{t("计数")}</span>
            <span className="selection-summary-value">{selectionAgg.count}</span>
          </span>
          {selectionAgg.min !== undefined && (
            <span className="selection-summary-item">
              <span className="selection-summary-label">{t("最小")}</span>
              <span className="selection-summary-value">
                {Number(selectionAgg.min).toLocaleString()}
              </span>
            </span>
          )}
          {selectionAgg.max !== undefined && (
            <span className="selection-summary-item">
              <span className="selection-summary-label">{t("最大")}</span>
              <span className="selection-summary-value">
                {Number(selectionAgg.max).toLocaleString()}
              </span>
            </span>
          )}
        </div>
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

    const selectableColumnFields =
      params.context?.selectableColumnFieldsRef?.current ??
      params.context?.selectableColumnFields ??
      [];
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
    if (
      !selection ||
      selection.mode !== "cells" ||
      params.node?.rowPinned ||
      params.node?.rowIndex == null
    ) {
      return false;
    }

    const selectableColumnFields =
      params.context?.selectableColumnFieldsRef?.current ??
      params.context?.selectableColumnFields ??
      [];
    const field = params.column?.getColId();
    const colIndex = selectableColumnFields.indexOf(field);
    if (colIndex === -1) return false;

    const maxRow = Math.max(selection.startRowIndex ?? 0, selection.endRowIndex ?? 0);
    const maxCol = Math.max(selection.startColIndex ?? 0, selection.endColIndex ?? 0);
    return params.node.rowIndex === maxRow && colIndex === maxCol;
  },
};

function toGridColumn(column, t = defaultTranslator, translateHeader = true) {
  const hasFormula = Boolean(normalizeFormulaInput(column.formula));
  const isEditable = column.editable !== false;
  const cellClasses = [
    column.required ? "required-cell" : null,
    column.type === "number" || hasFormula ? "number-cell" : null,
    hasFormula ? "formula-cell" : null,
    column.field === "status" ? "status-cell" : null,
    column.type === "image" ? "image-cell" : null,
  ].filter(Boolean);

  const gridColumn = {
    field: column.field,
    headerName: translateHeader ? t(column.headerName) : column.headerName,
    width: column.width,
    flex: column.flex,
    minWidth: column.minWidth,
    editable: (params) => isEditable && !hasFormula && !params.node?.rowPinned,
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

  if (column.type === "datetime") {
    gridColumn.valueFormatter = (params) => formatDateTimeForDisplay(params.value);
  }

  if (column.type === "image") {
    gridColumn.editable = false;
    gridColumn.cellRenderer = (params) => {
      const src = getImageSource(params.value);
      if (!src) {
        return <span className="completion-photo-empty">{t("暂无照片")}</span>;
      }

      const openPhoto = (event) => {
        event.stopPropagation();
        params.context?.openImagePreview?.(src, t("照片证明"));
      };

      return (
        <button
          className="completion-photo-button"
          type="button"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={openPhoto}
          title={t("查看照片")}
        >
          <img src={src} alt={t("照片证明")} />
          <span>{t("查看照片")}</span>
        </button>
      );
    };
  }

  if (column.type === "select") {
    gridColumn.cellEditor = "agSelectCellEditor";
    gridColumn.cellEditorParams = { values: column.options || [] };
    gridColumn.cellRenderer = (params) => {
      const value =
        column.options === statusOptions ? normalizeOrderStatus(params.value) : params.value;
      return (
        <span className={`status-chip ${statusClass(value)}`}>
          {column.field === "status" ? t(value || "未设置") : value || t("未设置")}
        </span>
      );
    };
  }

  return gridColumn;
}


export default App;
