// Shared utility functions extracted from App.jsx
// These are used across CustomerWorkspace, BusinessGrid, and modals

import { makeId, today } from "./utils.js";
import { formatCurrencyForLanguage, getGridLocaleText, languageOptions, normalizeLanguage } from "./i18n.js";
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
} from "./statusWorkflow.js";
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
} from "./columnDefs.js";
import { tableConfigs } from "../config/tableConfigs.js";

// Re-export commonly used utilities from statusWorkflow and columnDefs
export {
  statusOptions,
  closedOrderStatuses,
  isOpenOrder,
  normalizeOrderStatus,
  statusTransitions,
  deliveryStatusOptions,
  customerLevelOptions,
  materialOptions,
  unitOptions,
};
export {
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
};
export { formatCurrencyForLanguage, getGridLocaleText, languageOptions, normalizeLanguage };
export { makeId, today };

export const defaultTranslator = (text, params = {}) => {
  if (!params || !Object.keys(params).length) return text;
  return Object.entries(params).reduce((acc, [key, value]) => {
    return acc.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }, text);
};

export const desktopSessionStorageKey = "foam-crm-desktop-session";
export const desktopZoneStorageKey = "foam-crm-desktop-zone";

export const defaultMobileDisplaySettings = {
  cardFields: ["_customerName", "orderNo", "status", "product", "quantity", "dueDate"],
  detailFields: [
    "_customerName", "orderNo", "status", "date", "product", "quantity", "amount",
    "dueDate", "productionDate", "productionQuantity", "productionLine",
    "deliveredQuantity", "remainingQuantity", "completionTime",
    "completionOperator", "completionNote",
  ],
};

export const MAX_UNDO_STEPS = 50;
export const UNGROUPED_CUSTOMER_GROUP = "未分组";
export const CUSTOMER_DRAG_HOLD_MS = 420;
export const SYNC_POLL_INTERVAL_MS = 3000;

export function normalizeDesktopRole(role = "") { return ["admin", "employee"].includes(role) ? role : "pending"; }
export function isDesktopBusinessUser(role = "") { return ["admin", "employee"].includes(normalizeDesktopRole(role)); }
export function desktopRoleLabel(role = "") {
  const normalized = normalizeDesktopRole(role);
  if (normalized === "admin") return "管理员";
  if (normalized === "employee") return "员工";
  return "待授权";
}
export function readStoredDesktopSession() {
  try { return JSON.parse(localStorage.getItem(desktopSessionStorageKey) || "null"); }
  catch { return null; }
}
export function writeStoredDesktopSession(user) {
  if (!user?.token) { localStorage.removeItem(desktopSessionStorageKey); return; }
  localStorage.setItem(desktopSessionStorageKey, JSON.stringify(user));
}

export function normalizeCustomerGroupList(groups = []) {
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

export function customerGroupLevel(customer) { return customer?.level || UNGROUPED_CUSTOMER_GROUP; }

export function cloneData(data) {
  if (typeof structuredClone === "function") return structuredClone(data);
  return JSON.parse(JSON.stringify(data));
}

export function uniqueRowId(tableKey, usedIds) {
  let id = makeId(tableKey);
  while (usedIds.has(id)) id = makeId(tableKey);
  usedIds.add(id);
  return id;
}

export function ensureUniqueRowIds(rows, tableKey, customers, currentCustomerId) {
  const usedIds = new Set();
  for (const customer of customers || []) {
    if (customer.id === currentCustomerId) continue;
    for (const row of customer[tableKey] || []) {
      if (row.id) usedIds.add(row.id);
    }
  }
  return (rows || []).map((row) => {
    const id = row.id;
    if (!id || usedIds.has(id)) return { ...row, id: uniqueRowId(tableKey, usedIds) };
    usedIds.add(id);
    return row;
  });
}

export function ensureUniqueCustomerRowIds(customers) {
  const tableKeys = Object.keys(tableConfigs).filter((t) => !tableConfigs[t].sourceTableKey);
  const usedIdsByTable = tableKeys.reduce((acc, t) => { acc[t] = new Set(); return acc; }, {});
  return (customers || []).map((customer) => {
    const nextCustomer = { ...customer };
    for (const tableKey of tableKeys) {
      nextCustomer[tableKey] = (customer[tableKey] || []).map((row) => {
        const usedIds = usedIdsByTable[tableKey];
        const id = row.id;
        if (!id || usedIds.has(id)) return { ...row, id: uniqueRowId(tableKey, usedIds) };
        usedIds.add(id);
        return row;
      });
    }
    return nextCustomer;
  });
}

export function normalizeCustomerOrderStatuses(customers) {
  return (customers || []).map((customer) => ({
    ...customer,
    products: customer.products || [],
    orders: (customer.orders || []).map((order) => ({ ...order, status: normalizeOrderStatus(order.status) })),
    deliveries: normalizeDeliveryRows(customer.deliveries || []),
    materialCosts: customer.materialCosts || [],
    costEntries: customer.costEntries || [],
    statements: customer.statements || [],
    payments: customer.payments || [],
  }));
}

export function summarizeCustomerOrders(customer = {}) {
  const summary = { orderAmount: 0, unfinishedOrders: 0, completedOrders: 0, statementAmount: 0, paidAmount: 0, unpaidAmount: 0 };
  for (const order of customer.orders || []) {
    const amount = parseNumericValue(order.amount);
    const status = normalizeOrderStatus(order.status);
    summary.orderAmount += amount;
    if (isOpenOrder(status)) summary.unfinishedOrders += 1;
    if (["已完成", "已开送货单", "部分送货", "已送货", "已开对账单", "已付款"].includes(status)) summary.completedOrders += 1;
  }
  summary.statementAmount = (customer.statements || []).reduce((sum, row) => sum + parseNumericValue(row.amount), 0);
  summary.paidAmount = (customer.payments || []).reduce((sum, row) => sum + parseNumericValue(row.amount), 0);
  summary.unpaidAmount = Math.max(summary.statementAmount - summary.paidAmount, 0);
  return summary;
}

export function encodeClipboardCell(value) {
  const text = String(value ?? "");
  if (!/["\t\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

export function parseClipboardTable(text) {
  const rows = [];
  let row = []; let cell = ""; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i]; const next = text[i + 1];
    if (quoted) {
      if (char === '"' && next === '"') { cell += '"'; i++; }
      else if (char === '"') quoted = false;
      else cell += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === "\t") { row.push(cell); cell = ""; }
    else if (char === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (char !== "\r") cell += char;
  }
  row.push(cell);
  if (row.length > 1 || row[0] !== "" || text.endsWith("\t")) rows.push(row);
  return rows;
}

export const formatCurrency = (value, language = "zh") => formatCurrencyForLanguage(value, language);

export const toFieldKey = (label) => `custom_${label.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "_").replace(/^_+|_+$/g, "")}_${Math.random().toString(36).slice(2, 5)}`;

export function parseNumericValue(value) {
  if (value == null || value === "") return 0;
  const number = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(number) ? number : 0;
}

export function normalizeCalculatedNumber(value) {
  if (!Number.isFinite(value)) return "";
  const rounded = Number(value.toFixed(10));
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function isAmountColumn(column = {}) {
  const label = `${column.field || ""} ${column.headerName || ""}`;
  return column.field === "amount" || /金额|货款|合计|总价|小计/.test(label);
}

export function formatNumberForDisplay(value, column = {}) {
  if (value === "" || value == null) return "";
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  const normalized = normalizeCalculatedNumber(number);
  return isAmountColumn(column) ? normalized.toFixed(2) : normalized.toString();
}

export function formatDateTimeForDisplay(value) {
  if (value === "" || value == null) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

export function getImageSource(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value !== "object") return "";
  return value.dataUrl || value.url || value.src || "";
}

export function formatGridValueForDisplay(value, column = {}, t = defaultTranslator) {
  if (column.type === "datetime") return formatDateTimeForDisplay(value);
  if (column.type === "image") return getImageSource(value) ? t("有照片") : "";
  if (value && typeof value === "object") {
    if (getImageSource(value)) return t("有照片");
    return JSON.stringify(value);
  }
  return value ?? "";
}

export const formulaReferenceAliases = {
  "采购数量": "quantity", "订单数量": "quantity", "订购数量": "quantity", "数量": "quantity",
  Quantity: "quantity", "Order Quantity": "quantity", "Purchase Quantity": "quantity",
  "单价": "unitPrice", UnitPrice: "unitPrice", "Unit Price": "unitPrice",
  "金额": "amount", "订单金额": "amount", Amount: "amount", "Order Amount": "amount",
  "送货数量": deliveryQuantityField, DeliveryQuantity: deliveryQuantityField, "Delivery Quantity": deliveryQuantityField,
  "已送数量": orderDeliveredQuantityField, DeliveredQuantity: orderDeliveredQuantityField, "Delivered Quantity": orderDeliveredQuantityField,
  "剩余数量": orderRemainingQuantityField, RemainingQuantity: orderRemainingQuantityField, "Remaining Quantity": orderRemainingQuantityField,
};

export function normalizeFormulaInput(formula) {
  const text = String(formula || "").trim();
  if (!text) return "";
  return text.startsWith("=") ? text : `=${text}`;
}

export function formulaKey(value) { return String(value || "").trim().toLowerCase().replace(/\s+/g, ""); }

export function buildFormulaReferenceMap(columns) {
  const map = new Map();
  for (const [alias, field] of Object.entries(formulaReferenceAliases)) map.set(formulaKey(alias), field);
  for (const column of columns) { map.set(formulaKey(column.field), column.field); map.set(formulaKey(column.headerName), column.field); }
  return map;
}

export function tokenizeFormula(formula) {
  const expression = normalizeFormulaInput(formula).replace(/^=/, "");
  const tokens = []; let index = 0;
  while (index < expression.length) {
    const char = expression[index];
    if (/\s/.test(char)) { index += 1; continue; }
    if ("+-*/()×".includes(char) || char === "x" || char === "X") {
      tokens.push({ type: "operator", value: char === "×" || char === "x" || char === "X" ? "*" : char });
      index += 1; continue;
    }
    if (char === "[") {
      const end = expression.indexOf("]", index + 1);
      if (end === -1) return null;
      tokens.push({ type: "reference", value: expression.slice(index + 1, end).trim() });
      index = end + 1; continue;
    }
    if (/\d|\./.test(char)) {
      let end = index + 1;
      while (end < expression.length && /[\d.]/.test(expression[end])) end += 1;
      const value = Number(expression.slice(index, end));
      if (!Number.isFinite(value)) return null;
      tokens.push({ type: "number", value }); index = end; continue;
    }
    let end = index + 1;
    while (end < expression.length && !/\s/.test(expression[end]) && !"+-*/()[]×xX".includes(expression[end])) end += 1;
    tokens.push({ type: "reference", value: expression.slice(index, end).trim() });
    index = end;
  }
  return tokens;
}

export function evaluateFormula(formula, row, referenceMap, targetField) {
  const tokens = tokenizeFormula(formula);
  if (!tokens?.length) return "";
  let position = 0;
  const readReference = (name) => { const field = referenceMap.get(formulaKey(name)) || name; if (!field || field === targetField) return 0; return parseNumericValue(row[field]); };
  const parseFactor = () => {
    const token = tokens[position]; if (!token) return NaN;
    if (token.type === "operator" && token.value === "+") { position += 1; return parseFactor(); }
    if (token.type === "operator" && token.value === "-") { position += 1; return -parseFactor(); }
    if (token.type === "number") { position += 1; return token.value; }
    if (token.type === "reference") { position += 1; return readReference(token.value); }
    if (token.type === "operator" && token.value === "(") { position += 1; const value = parseExpression(); if (tokens[position]?.type !== "operator" || tokens[position]?.value !== ")") return NaN; position += 1; return value; }
    return NaN;
  };
  const parseTerm = () => { let value = parseFactor(); while (tokens[position]?.type === "operator" && (tokens[position].value === "*" || tokens[position].value === "/")) { const operator = tokens[position].value; position += 1; const right = parseFactor(); value = operator === "*" ? value * right : value / right; } return value; };
  const parseExpression = () => { let value = parseTerm(); while (tokens[position]?.type === "operator" && (tokens[position].value === "+" || tokens[position].value === "-")) { const operator = tokens[position].value; position += 1; const right = parseTerm(); value = operator === "+" ? value + right : value - right; } return value; };
  const value = parseExpression();
  return position === tokens.length && Number.isFinite(value) ? normalizeCalculatedNumber(value) : "";
}

export function normalizeRowIdSet(rowIds) { if (!rowIds) return null; const set = rowIds instanceof Set ? rowIds : new Set(rowIds); return set.size ? set : null; }

export function applyTableFormulas(rows, columns, rowIds = null) {
  const formulaColumns = columns.filter((c) => normalizeFormulaInput(c.formula));
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

export function isNumericLike(value) { const text = String(value ?? "").trim().replace(/,/g, ""); return text !== "" && Number.isFinite(Number(text)); }

export function getCustomerTableColumns(customer, tableKey) {
  const config = tableConfigs[tableKey];
  const defaultFields = new Set(config.defaultColumns.map((c) => c.field));
  return [...config.defaultColumns, ...(customer.customColumns?.[tableKey] || []).filter((c) => !defaultFields.has(c.field))];
}

export function viewSourceTableKey(viewKey) { return tableConfigs[viewKey]?.sourceTableKey || viewKey; }
export function isDerivedTableView(viewKey) { return Boolean(tableConfigs[viewKey]?.sourceTableKey); }
export function getViewHiddenColumnSet(customer, viewKey) { return new Set(customer?.customColumns?.viewHiddenColumns?.[viewKey] || []); }

export function getCustomerViewColumns(customer, viewKey) {
  const config = tableConfigs[viewKey];
  if (!config) return [];
  const sourceTableKey = viewSourceTableKey(viewKey);
  const defaultFields = new Set(config.defaultColumns.map((c) => c.field));
  const hiddenFields = getViewHiddenColumnSet(customer, viewKey);
  const sourceCustomColumns = (customer?.customColumns?.[sourceTableKey] || []).filter((c) => !defaultFields.has(c.field));
  const viewCustomColumns = sourceTableKey === viewKey ? [] : (customer?.customColumns?.[viewKey] || []).filter((c) => !defaultFields.has(c.field));
  const seen = new Set();
  return [...config.defaultColumns, ...sourceCustomColumns, ...viewCustomColumns].filter((c) => {
    if (!c?.field || hiddenFields.has(c.field) || seen.has(c.field)) return false;
    seen.add(c.field); return true;
  });
}

export function getCustomerFormulaColumns(customer, tableKey) {
  const relatedViewColumns = Object.keys(tableConfigs).filter((vk) => tableConfigs[vk]?.sourceTableKey === tableKey).flatMap((vk) => customer?.customColumns?.[vk] || []);
  const columns = [...getCustomerTableColumns(customer, tableKey), ...relatedViewColumns];
  const seen = new Set();
  return columns.filter((c) => { if (!c?.field || seen.has(c.field)) return false; seen.add(c.field); return true; });
}

export function normalizeFieldList(value, fallback = []) {
  if (!Array.isArray(value)) return fallback;
  return Array.from(new Set(value.map((f) => String(f || "").trim()).filter(Boolean)));
}

export function normalizeMobileDisplaySettings(value = {}) {
  const data = value && typeof value === "object" ? value : {};
  return { cardFields: normalizeFieldList(data.cardFields, defaultMobileDisplaySettings.cardFields), detailFields: normalizeFieldList(data.detailFields, defaultMobileDisplaySettings.detailFields) };
}

export function getCustomerMobileDisplaySettings(customer, fallback = defaultMobileDisplaySettings) {
  return normalizeMobileDisplaySettings(customer?.customColumns?.mobileDisplaySettings || fallback);
}

export function buildMobileOrderFieldOptions(customers = []) {
  const fields = new Map([["_customerName", { field: "_customerName", label: "客户" }], ["orderNo", { field: "orderNo", label: "订单号" }]]);
  const addColumn = (column = {}) => { if (!column.field || fields.has(column.field)) return; fields.set(column.field, { field: column.field, label: column.headerName || column.field, type: column.type }); };
  tableConfigs.orders.defaultColumns.forEach(addColumn);
  knownOrderDataColumns.forEach(addColumn);
  productionScheduleColumns.forEach(addColumn);
  orderDeliveryTrackingColumns.forEach(addColumn);
  for (const customer of customers) {
    (customer.customColumns?.orders || []).forEach(addColumn);
    (customer.orders || []).forEach((order) => {
      Object.keys(order || {}).forEach((field) => { if (field === "id" || field.startsWith("_") || fields.has(field)) return; fields.set(field, { field, label: field }); });
    });
  }
  return Array.from(fields.values());
}

export function buildCustomerMobileOrderFieldOptions(customer) { return buildMobileOrderFieldOptions(customer ? [customer] : []); }

export function applyCustomerTableFormulas(customer, tableKey, rows, customColumns = customer?.customColumns, rowIds = null) {
  return applyTableFormulas(rows, getCustomerFormulaColumns({ ...(customer || {}), customColumns }, tableKey), rowIds);
}

export function hasFilledValue(row, field) { const value = row?.[field]; return value !== "" && value != null; }

export function isFinalDelivery(delivery) { return delivery?.[finalDeliveryField] === true; }

export function normalizeFinalDeliveryStatus(status = "") {
  const text = String(status || "");
  if (text === "作废" || text.includes("作废") || text.includes("取消") || text.includes("无效")) return "作废";
  if (text === "部分签收" || text === "部分送货") return "部分签收";
  if (status === "已送" || status === "已送货" || status === "已发货" || String(status).includes("签收")) return "已签收";
  return "未送";
}

export function isEffectiveDelivery(delivery) { return isFinalDelivery(delivery) && normalizeFinalDeliveryStatus(delivery.status) === "已签收"; }

export function isSignedDelivery(delivery) { return isFinalDelivery(delivery) && (normalizeFinalDeliveryStatus(delivery.status) === "已签收" || Boolean(delivery?.signedAt)); }

export function isReconciledDelivery(delivery) { return Boolean(delivery?.statementNo || delivery?.reconciledAt); }

export function isLockedDelivery(delivery) { return isSignedDelivery(delivery) || isReconciledDelivery(delivery); }

export function appendAuditLog(log = "", message = "") { const line = `[${new Date().toLocaleString()}] ${message}`; return [String(log || "").trim(), line].filter(Boolean).join("\n"); }

export function protectSignedDeliveries(previousRows = [], nextRows = []) {
  const previousById = new Map(previousRows.map((r) => [r.id, r]));
  let blocked = false;
  const rows = nextRows.map((row) => {
    const previous = previousById.get(row.id);
    if (!previous || !isLockedDelivery(previous)) return row;
    const allowed = { __selected: row.__selected };
    if (JSON.stringify({ ...previous, ...allowed }) !== JSON.stringify(row)) blocked = true;
    return { ...previous, ...allowed };
  });
  return { rows, blocked };
}

export function applyMaterialPriceHistory(previousRows = [], nextRows = []) {
  const previousById = new Map(previousRows.map((r) => [r.id, r]));
  return nextRows.map((row) => {
    const previous = previousById.get(row.id);
    if (!previous) return row;
    const previousCost = parseNumericValue(previous.unitCost);
    const nextCost = parseNumericValue(row.unitCost);
    if (previousCost === nextCost) return row;
    return { ...row, priceUpdatedAt: new Date().toISOString(), priceHistory: appendAuditLog(previous.priceHistory, `成本单价：${previousCost} -> ${nextCost}`) };
  });
}

export function normalizeDeliveryRows(deliveries = []) {
  return deliveries.map((delivery) => {
    const hasFinalFlag = Object.prototype.hasOwnProperty.call(delivery, finalDeliveryField);
    const finalDelivery = hasFinalFlag ? Boolean(delivery[finalDeliveryField]) : true;
    return { ...delivery, [finalDeliveryField]: finalDelivery, status: finalDelivery ? normalizeFinalDeliveryStatus(delivery.status) : delivery.status || "未送" };
  });
}

export function deliveryGroupKey(delivery) { return String(delivery?.deliveryNo || delivery?.id || "未编号送货单"); }

export function getDeliveryGroupStatus(deliveries = []) {
  if (!deliveries.length) return "未送";
  const statuses = deliveries.map((d) => normalizeFinalDeliveryStatus(d.status));
  if (statuses.every((s) => s === "已签收")) return "已签收";
  if (statuses.some((s) => s === "已签收" || s === "部分签收")) return "部分签收";
  if (statuses.every((s) => s === "作废")) return "作废";
  return "未送";
}

export function getOrderLabel(order, fallback = "") { return order?.orderNo || order?.product || fallback || order?.id || "未编号订单"; }
export function getDeliveryQuantitySourceField(delivery = {}) { return delivery?.[linkedOrderQuantitySourceField] || "quantity"; }
export function getOrderQuantityForDelivery(order, delivery = {}) { if (!order) return 0; return parseNumericValue(order[getDeliveryQuantitySourceField(delivery)]); }

export function findEffectiveDeliveryOverages(orders = [], deliveries = []) {
  const ordersById = new Map(orders.map((o) => [o.id, o]));
  const deliveryTotalsByOrderAndSource = new Map();
  for (const delivery of deliveries) {
    if (!isEffectiveDelivery(delivery)) continue;
    const orderId = delivery[linkedOrderIdField]; if (!orderId) continue;
    const sourceField = getDeliveryQuantitySourceField(delivery);
    const key = `${orderId}::${sourceField}`;
    deliveryTotalsByOrderAndSource.set(key, { orderId, sourceField, deliveredQuantity: (deliveryTotalsByOrderAndSource.get(key)?.deliveredQuantity || 0) + parseNumericValue(delivery[deliveryQuantityField]) });
  }
  return Array.from(deliveryTotalsByOrderAndSource.values()).map(({ orderId, deliveredQuantity, sourceField }) => {
    const order = ordersById.get(orderId); if (!order) return null;
    const orderQuantity = parseNumericValue(order[sourceField]);
    if (deliveredQuantity <= orderQuantity + 0.0000001) return null;
    return { orderId, orderLabel: getOrderLabel(order, orderId), orderQuantity, deliveredQuantity, overQuantity: deliveredQuantity - orderQuantity };
  }).filter(Boolean);
}

export function buildDeliveryFinalizePreview(customer, selectedDrafts, t = defaultTranslator) {
  const orders = customer?.orders || [];
  const deliveries = customer?.deliveries || [];
  const ordersById = new Map(orders.map((o) => [o.id, o]));
  const selectedDraftIds = new Set(selectedDrafts.map((d) => d.id));
  const effectiveDeliveredByOrderAndSource = new Map();
  const selectedByOrderAndSource = new Map();
  let unlinkedQuantity = 0;
  for (const delivery of deliveries) {
    if (selectedDraftIds.has(delivery.id) || !isEffectiveDelivery(delivery)) continue;
    const orderId = delivery[linkedOrderIdField]; if (!orderId) continue;
    const sourceField = getDeliveryQuantitySourceField(delivery);
    const key = `${orderId}::${sourceField}`;
    effectiveDeliveredByOrderAndSource.set(key, (effectiveDeliveredByOrderAndSource.get(key) || 0) + parseNumericValue(delivery[deliveryQuantityField]));
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
      selectedByOrderAndSource.set(summaryKey, { orderId, sourceField, selectedQuantity: (current?.selectedQuantity || 0) + quantity });
    } else { unlinkedQuantity += quantity; }
    return { id: delivery.id, deliveryNo: delivery.deliveryNo || t("未填写送货单号"), date: delivery.date || "", orderId, orderLabel: order ? getOrderLabel(order, orderId) : delivery.orderNo || t("未关联订单"), product: order?.product || delivery[deliveryOrderField("product")] || "", quantity, deliveredBefore, remainingBefore, sourceField };
  });
  const orderSummaries = Array.from(selectedByOrderAndSource.values()).map(({ orderId, selectedQuantity, sourceField }) => {
    const order = ordersById.get(orderId);
    const deliveredBefore = effectiveDeliveredByOrderAndSource.get(`${orderId}::${sourceField}`) || 0;
    const orderQuantity = parseNumericValue(order?.[sourceField]);
    const remainingBefore = Math.max(orderQuantity - deliveredBefore, 0);
    return { orderId, orderLabel: getOrderLabel(order, orderId), orderQuantity, deliveredBefore, remainingBefore, selectedQuantity, sourceField };
  });
  return { draftSummaries, orderSummaries, deliveryNos: [...new Set(selectedDrafts.map((d) => d.deliveryNo || t("未填写送货单号")))], totalQuantity: selectedDrafts.reduce((sum, d) => sum + parseNumericValue(d[deliveryQuantityField]), 0), unlinkedQuantity, overDelivered: orderSummaries.filter((item) => item.selectedQuantity > item.remainingBefore + 0.0000001) };
}

export function formatDeliveryFinalizeMessage(preview, t = defaultTranslator) {
  const orderLines = preview.orderSummaries.slice(0, 8).map((item) => t("{orderLabel}：本次 {selectedQuantity} / 剩余 {remainingQuantity}", { orderLabel: item.orderLabel, selectedQuantity: normalizeCalculatedNumber(item.selectedQuantity), remainingQuantity: normalizeCalculatedNumber(item.remainingBefore) }));
  const draftLines = preview.draftSummaries.slice(0, 8).map((item) => `${item.deliveryNo} · ${item.orderLabel} · ${normalizeCalculatedNumber(item.quantity)}`);
  const moreDrafts = preview.draftSummaries.length > draftLines.length ? t("\n另有 {count} 条明细未展示", { count: preview.draftSummaries.length - draftLines.length }) : "";
  const unlinkedLine = preview.unlinkedQuantity > 0 ? t("\n未关联订单数量：{quantity}", { quantity: normalizeCalculatedNumber(preview.unlinkedQuantity) }) : "";
  return [t("将生成 {deliveryCount} 张送货单，共 {lineCount} 条明细。", { deliveryCount: preview.deliveryNos.length, lineCount: preview.draftSummaries.length }), t("送货数量合计：{quantity}{unlinkedLine}", { quantity: normalizeCalculatedNumber(preview.totalQuantity), unlinkedLine }), orderLines.length ? t("\n关联订单预览：\n{lines}", { lines: orderLines.join("\n") }) : "", draftLines.length ? t("\n草稿明细：\n{lines}{moreDrafts}", { lines: draftLines.join("\n"), moreDrafts }) : "", t("\n确认无误后，送货单会进入「送货单」页面，默认状态为「未送」。")].filter(Boolean).join("\n");
}

export function formatOverDeliveryMessage(issues, t = defaultTranslator) {
  const lines = issues.slice(0, 8).map((issue) => t("{orderLabel}：已送 {deliveredQuantity} / 订单 {orderQuantity}，超出 {overQuantity}", { orderLabel: issue.orderLabel, deliveredQuantity: normalizeCalculatedNumber(issue.deliveredQuantity), orderQuantity: normalizeCalculatedNumber(issue.orderQuantity), overQuantity: normalizeCalculatedNumber(issue.overQuantity) }));
  const more = issues.length > lines.length ? t("\n另有 {count} 条订单超量。", { count: issues.length - lines.length }) : "";
  return t("以下订单送货数量超过订单数量，不能生效：\n{lines}{more}", { lines: lines.join("\n"), more });
}

export function deliveryOrderField(field) { return `${deliveryOrderFieldPrefix}${field}`; }

export function getOrderColumnsForDelivery(customer, selectedOrders) {
  const columns = getCustomerTableColumns(customer, "orders");
  const fields = new Set(columns.map((c) => c.field));
  const withKnownData = [...columns];
  for (const column of knownOrderDataColumns) { if (fields.has(column.field)) continue; if (!selectedOrders.some((o) => hasFilledValue(o, column.field))) continue; fields.add(column.field); withKnownData.push(column); }
  return withKnownData.filter((c) => c.field !== "status" && c.field !== orderDeliveredQuantityField);
}

export function getDeliveryQuantityOptions(orderColumns, selectedOrders) {
  return orderColumns.filter((c) => c.type === "number" || c.headerName?.includes("数量") || selectedOrders.some((o) => isNumericLike(o[c.field]))).map((c) => ({ value: c.field, label: c.headerName || c.field }));
}

export function preferredQuantityField(options) {
  return options.find((o) => o.value === orderRemainingQuantityField)?.value || options.find((o) => o.value === "quantity")?.value || options.find((o) => o.label.includes("数量"))?.value || options[0]?.value || "";
}

export function insertColumnsAfterField(columns, additions, afterField) {
  const existingFields = new Set(columns.map((c) => c.field));
  const columnsToAdd = additions.filter((c) => !existingFields.has(c.field));
  if (!columnsToAdd.length) return columns;
  const next = [...columns];
  const afterIndex = next.findIndex((c) => c.field === afterField);
  const insertIndex = afterIndex === -1 ? next.length : afterIndex + 1;
  next.splice(insertIndex, 0, ...columnsToAdd);
  return next;
}

export function completeColumnOrder(savedOrder, columns) {
  const validFields = new Set(columns.map((c) => c.field));
  const next = (savedOrder || []).filter((f) => validFields.has(f));
  for (const column of columns) { if (!next.includes(column.field)) next.push(column.field); }
  return next;
}

export function insertFieldsAfter(order, fields, afterField) {
  const fieldsToInsert = fields.filter(Boolean);
  if (!fieldsToInsert.length) return order;
  const fieldSet = new Set(fieldsToInsert);
  const next = order.filter((f) => !fieldSet.has(f));
  const afterIndex = next.indexOf(afterField);
  const insertIndex = afterIndex === -1 ? next.length : afterIndex + 1;
  next.splice(insertIndex, 0, ...fieldsToInsert);
  return next;
}

export function ensureOrderDeliveryTrackingColumns(customColumns = {}, selectedOrders = []) {
  const defaultFields = new Set(tableConfigs.orders.defaultColumns.map((c) => c.field));
  const orderColumns = customColumns.orders || [];
  const existingFields = new Set([...defaultFields, ...orderColumns.map((c) => c.field)]);
  const quantityColumn = knownOrderDataColumns.find((c) => c.field === "quantity");
  const nextOrderColumns = insertColumnsAfterField(orderColumns, !existingFields.has("quantity") && quantityColumn && selectedOrders.some((o) => hasFilledValue(o, "quantity")) ? [quantityColumn] : [], null);
  const withTrackingColumns = insertColumnsAfterField(nextOrderColumns, orderDeliveryTrackingColumns, "quantity");
  const visibleOrderColumns = [...tableConfigs.orders.defaultColumns, ...withTrackingColumns.filter((c) => !defaultFields.has(c.field))];
  const order = insertFieldsAfter(completeColumnOrder(customColumns.columnOrder?.orders, visibleOrderColumns), orderDeliveryTrackingColumns.map((c) => c.field), "quantity");
  return { ...customColumns, orders: withTrackingColumns, columnOrder: { ...(customColumns.columnOrder || {}), orders: order } };
}

export function ensureProductionScheduleColumns(customColumns = {}) {
  const defaultFields = new Set(tableConfigs.orders.defaultColumns.map((c) => c.field));
  const orderColumns = customColumns.orders || [];
  const existingFields = new Set([...defaultFields, ...orderColumns.map((c) => c.field)]);
  const columnsToAdd = productionScheduleColumns.filter((c) => !existingFields.has(c.field));
  if (!columnsToAdd.length) return customColumns;
  const withScheduleColumns = insertColumnsAfterField(orderColumns, columnsToAdd, "dueDate");
  const visibleOrderColumns = [...tableConfigs.orders.defaultColumns, ...withScheduleColumns.filter((c) => !defaultFields.has(c.field))];
  const order = insertFieldsAfter(completeColumnOrder(customColumns.columnOrder?.orders, visibleOrderColumns), productionScheduleColumns.map((c) => c.field), "dueDate");
  return { ...customColumns, orders: withScheduleColumns, columnOrder: { ...(customColumns.columnOrder || {}), orders: order } };
}

export function ensureDeliveryColumns(customColumns = {}, orderColumns = []) {
  const defaultFields = new Set(tableConfigs.deliveries.defaultColumns.map((c) => c.field));
  const deliveryColumnsFromOrders = orderColumns.map((c) => ({ field: deliveryOrderField(c.field), headerName: c.headerName, width: c.width || 140, flex: c.flex, minWidth: c.minWidth, wrapHeaderText: true, autoHeaderHeight: true, type: c.type, options: c.options }));
  const nextDeliveryColumns = [...(customColumns.deliveries || []), ...[...deliveryColumnsFromOrders, deliveryQuantityColumn].filter((c) => !defaultFields.has(c.field) && !(customColumns.deliveries || []).some((existing) => existing.field === c.field))];
  const visibleDeliveryColumns = [...tableConfigs.deliveries.defaultColumns, ...nextDeliveryColumns.filter((c) => !defaultFields.has(c.field))];
  return { ...customColumns, deliveries: nextDeliveryColumns, columnOrder: { ...(customColumns.columnOrder || {}), deliveries: completeColumnOrder(customColumns.columnOrder?.deliveries, visibleDeliveryColumns) } };
}

export function nextDeliveryNo(deliveries = []) {
  const dateCode = today().replace(/-/g, "");
  const existing = new Set(deliveries.map((d) => d.deliveryNo).filter(Boolean));
  let counter = deliveries.length + 1;
  let deliveryNo = "";
  do { deliveryNo = `DN-${dateCode}-${String(counter).padStart(3, "0")}`; counter += 1; } while (existing.has(deliveryNo));
  return deliveryNo;
}

export function nextStatementNo(statements = []) {
  const dateCode = today().replace(/-/g, "");
  const existing = new Set(statements.map((s) => s.statementNo).filter(Boolean));
  let counter = statements.length + 1;
  let statementNo = "";
  do { statementNo = `ST-${dateCode}-${String(counter).padStart(3, "0")}`; counter += 1; } while (existing.has(statementNo));
  return statementNo;
}

export function deliveryLineAmount(delivery = {}) {
  const quantity = parseNumericValue(delivery[deliveryQuantityField]);
  const amount = parseNumericValue(delivery[deliveryOrderField("amount")]);
  const orderQuantity = parseNumericValue(delivery[deliveryOrderField("quantity")]);
  if (amount > 0 && orderQuantity > 0) return amount * (quantity / orderQuantity);
  return amount;
}

export function buildStatementFromSignedDeliveries(customer = {}) {
  const existingDeliveryIds = new Set((customer.statements || []).flatMap((s) => s.deliveryIds || []).filter(Boolean));
  const deliveries = (customer.deliveries || []).filter((d) => isSignedDelivery(d) && !existingDeliveryIds.has(d.id));
  if (!deliveries.length) return null;
  const amount = deliveries.reduce((sum, d) => sum + deliveryLineAmount(d), 0);
  return { id: makeId("statements"), statementNo: nextStatementNo(customer.statements || []), date: today(), deliveryIds: deliveries.map((d) => d.id), deliveryNos: [...new Set(deliveries.map((d) => d.deliveryNo).filter(Boolean))].join("、"), lineCount: deliveries.length, amount: normalizeCalculatedNumber(amount), paidAmount: 0, unpaidAmount: normalizeCalculatedNumber(amount), status: "未收款", createdAt: new Date().toISOString(), note: "" };
}

export function statementDeliveryIds(statement = {}) {
  if (Array.isArray(statement.deliveryIds)) return statement.deliveryIds.map(String);
  return String(statement.deliveryIds || "").split(/[、,\s]+/).map((v) => v.trim()).filter(Boolean);
}

export function statementReferencesDelivery(statement = {}, deliveryId = "") { return statementDeliveryIds(statement).includes(String(deliveryId)); }

export function listPreview(values = [], limit = 5) {
  const uniqueValues = Array.from(new Set(values.map(String).filter(Boolean)));
  const visible = uniqueValues.slice(0, limit).join("、");
  const more = uniqueValues.length > limit ? ` 等 ${uniqueValues.length} 条` : "";
  return `${visible}${more}`;
}

export function getDeliveryLabel(delivery = {}) { return delivery.deliveryNo || delivery.orderNo || delivery.product || delivery.id || "未编号送货单"; }
export function getStatementLabel(statement = {}) { return statement.statementNo || statement.id || "未编号对账单"; }

export function getDeleteBlockers(customer = {}, tableKey, ids = []) {
  const selectedIds = new Set(ids.map(String));
  const deliveries = customer.deliveries || [];
  const statements = customer.statements || [];
  const payments = customer.payments || [];
  const blockers = [];
  if (tableKey === "orders") {
    const linkedOrderIds = new Set(deliveries.map((d) => String(d[linkedOrderIdField] || "")).filter((oid) => selectedIds.has(oid)));
    if (linkedOrderIds.size) {
      const labels = (customer.orders || []).filter((o) => linkedOrderIds.has(String(o.id))).map((o) => getOrderLabel(o));
      blockers.push(`订单已生成送货单，不能直接删除：${listPreview(labels)}`);
    }
  }
  if (tableKey === "deliveries") {
    const selectedDeliveries = deliveries.filter((d) => selectedIds.has(String(d.id)));
    const lockedDeliveries = selectedDeliveries.filter((d) => isLockedDelivery(d) || statements.some((s) => statementReferencesDelivery(s, d.id)));
    if (lockedDeliveries.length) blockers.push(`送货单已签收或已进入对账，不能直接删除：${listPreview(lockedDeliveries.map(getDeliveryLabel))}`);
  }
  if (tableKey === "statements") {
    const selectedStatements = statements.filter((s) => selectedIds.has(String(s.id)));
    const selectedStatementNos = new Set(selectedStatements.map((s) => String(s.statementNo || "").trim()).filter(Boolean));
    const paidStatements = selectedStatements.filter((s) => payments.some((p) => String(p.statementNo || "").trim() === String(s.statementNo || "").trim()));
    if (paidStatements.length) blockers.push(`对账单已有收款记录，不能直接删除：${listPreview(paidStatements.map(getStatementLabel))}`);
    const linkedStatements = selectedStatements.filter((s) => statementDeliveryIds(s).length || deliveries.some((d) => selectedStatementNos.has(String(d.statementNo || "").trim()) || statementReferencesDelivery(s, d.id)));
    if (linkedStatements.length) blockers.push(`对账单已关联送货单，不能直接删除：${listPreview(linkedStatements.map(getStatementLabel))}`);
  }
  return blockers;
}

export function formatDeleteBlockers(blockers = []) { return ["不能删除选中的数据，因为会影响已生成的业务单据：", ...blockers].join("\n"); }

export function getPaymentOverages(statements = [], payments = []) {
  const statementAmounts = new Map();
  for (const statement of statements || []) { const sn = String(statement.statementNo || "").trim(); if (!sn) continue; statementAmounts.set(sn, parseNumericValue(statement.amount)); }
  const paidByStatementNo = new Map();
  for (const payment of payments || []) { const sn = String(payment.statementNo || "").trim(); if (!sn || !statementAmounts.has(sn)) continue; paidByStatementNo.set(sn, (paidByStatementNo.get(sn) || 0) + parseNumericValue(payment.amount)); }
  return Array.from(paidByStatementNo.entries()).map(([sn, paidAmount]) => { const amount = statementAmounts.get(sn) || 0; if (paidAmount <= amount + 0.0000001) return null; return { statementNo: sn, amount, paidAmount, overAmount: paidAmount - amount }; }).filter(Boolean);
}

export function formatPaymentOverages(overages = []) {
  const lines = overages.slice(0, 8).map((item) => `${item.statementNo}：对账 ${normalizeCalculatedNumber(item.amount)} / 收款 ${normalizeCalculatedNumber(item.paidAmount)}，超出 ${normalizeCalculatedNumber(item.overAmount)}`);
  const more = overages.length > lines.length ? `\n另有 ${overages.length - lines.length} 条未展示` : "";
  return `收款金额不能超过对账金额：\n${lines.join("\n")}${more}`;
}

export function applyPaymentsToStatements(statements = [], payments = []) {
  const paidByStatementNo = new Map();
  for (const payment of payments || []) { const sn = String(payment.statementNo || "").trim(); if (!sn) continue; paidByStatementNo.set(sn, (paidByStatementNo.get(sn) || 0) + parseNumericValue(payment.amount)); }
  return (statements || []).map((statement) => {
    const paidAmount = paidByStatementNo.get(statement.statementNo) || 0;
    const amount = parseNumericValue(statement.amount);
    const unpaidAmount = Math.max(amount - paidAmount, 0);
    const status = paidAmount <= 0 ? "未收款" : unpaidAmount > 0.0000001 ? "部分收款" : "已收款";
    if (parseNumericValue(statement.paidAmount) === paidAmount && parseNumericValue(statement.unpaidAmount) === unpaidAmount && statement.status === status) return statement;
    return { ...statement, paidAmount: normalizeCalculatedNumber(paidAmount), unpaidAmount: normalizeCalculatedNumber(unpaidAmount), status };
  });
}

export function makeDeliveryRowsFromOrders(selectedOrders, orderColumns, quantitySourceField, deliveryNo) {
  const date = today();
  return selectedOrders.map((order) => {
    const deliveryRow = { ...tableConfigs.deliveries.emptyRow, id: makeId("deliveries"), deliveryNo, date, orderNo: order.orderNo || "", status: "未送", [finalDeliveryField]: false, [linkedOrderIdField]: order.id, [linkedOrderQuantitySourceField]: quantitySourceField, [deliveryQuantityField]: parseNumericValue(order[quantitySourceField]) };
    for (const column of orderColumns) deliveryRow[deliveryOrderField(column.field)] = order[column.field] ?? "";
    return deliveryRow;
  });
}

export function applyDeliveryQuantitiesToOrders(orders = [], deliveries = []) {
  const deliveredByOrderId = new Map();
  const sourceFieldsByOrderId = new Map();
  const deliveryOpenedOrderIds = new Set();
  for (const delivery of deliveries) {
    const orderId = delivery[linkedOrderIdField]; if (!orderId) continue;
    if (isFinalDelivery(delivery) && normalizeFinalDeliveryStatus(delivery.status) !== "作废") deliveryOpenedOrderIds.add(orderId);
    const sourceField = getDeliveryQuantitySourceField(delivery);
    if (!sourceFieldsByOrderId.has(orderId)) sourceFieldsByOrderId.set(orderId, new Set());
    sourceFieldsByOrderId.get(orderId).add(sourceField);
    if (!isEffectiveDelivery(delivery)) continue;
    deliveredByOrderId.set(orderId, (deliveredByOrderId.get(orderId) || 0) + parseNumericValue(delivery[deliveryQuantityField]));
  }
  return orders.map((order) => {
    const normalizedStatus = normalizeOrderStatus(order.status);
    if (normalizedStatus === "异常") return order;
    const shouldTrack = deliveredByOrderId.has(order.id) || deliveryOpenedOrderIds.has(order.id) || orderDeliveredQuantityField in order || orderRemainingQuantityField in order;
    if (!shouldTrack) return order;
    const hasEffectiveDelivery = deliveredByOrderId.has(order.id);
    const deliveredQuantity = deliveredByOrderId.get(order.id) || 0;
    const sourceFields = sourceFieldsByOrderId.get(order.id);
    const sourceField = sourceFields?.size === 1 ? [...sourceFields][0] : "quantity";
    const orderQuantity = parseNumericValue(order[sourceField]);
    const remainingQuantity = Math.max(orderQuantity - deliveredQuantity, 0);
    const hasOpenedDelivery = deliveryOpenedOrderIds.has(order.id);
    const nextStatus = hasEffectiveDelivery && remainingQuantity <= 0.0000001 ? "已送货" : hasEffectiveDelivery && remainingQuantity > 0.0000001 ? "部分送货" : hasOpenedDelivery && ["已完成", "已开送货单", "部分送货", "已送货"].includes(normalizedStatus) ? "已开送货单" : !hasOpenedDelivery && !hasEffectiveDelivery && ["已开送货单", "部分送货", "已送货"].includes(normalizedStatus) ? "已完成" : order.status;
    if (parseNumericValue(order[orderDeliveredQuantityField]) === deliveredQuantity && parseNumericValue(order[orderRemainingQuantityField]) === remainingQuantity && order.status === nextStatus) return order;
    const nextOrder = { ...order, status: nextStatus, [orderDeliveredQuantityField]: deliveredQuantity, [orderRemainingQuantityField]: remainingQuantity };
    if (order.status !== nextStatus) { nextOrder.statusChangedAt = new Date().toISOString(); nextOrder.statusChangeLog = appendAuditLog(order.statusChangeLog, `进度：${order.status || "未完成"} -> ${nextStatus}`); }
    return nextOrder;
  });
}

export function filterValue(value) {
  const raw = value == null || value === "" ? "" : String(formatGridValueForDisplay(value, {}));
  return { key: raw, label: raw || "(空白)" };
}

export function statusClass(value = "") {
  if (value === "作废") return "is-void";
  if (value === "已付款") return "is-paid";
  if (value === "已开对账单") return "is-reconciled";
  if (value === "已开送货单") return "is-delivery-opened";
  if (value === "部分送货" || value === "部分签收") return "is-partial-delivered";
  if (value === "已送货" || value === "已发货" || value === "已签收") return "is-delivered";
  if (value === "已完成") return "is-completed";
  if (value === "已排产") return "is-scheduled";
  if (value === "未完成") return "is-pending";
  if (value === "未排产" || value === "未送" || value === "待确认" || value === "待发货") return "is-unfinished";
  if (value === "已送") return "is-delivered";
  if (value.includes("异常")) return "is-risk";
  if (value.includes("配送")) return "is-live";
  if (value.includes("装车")) return "is-waiting";
  if (value.includes("完成")) return "is-completed";
  return "";
}

export function generateStatement(customer, settings = {}, t = defaultTranslator) {
  const billableOrders = (customer.orders || []).filter((o) => { const s = normalizeOrderStatus(o.status); return s === "已送货" || s === "已开对账单" || s === "已付款"; });
  if (!billableOrders.length) { alert(t('客户 "{name}" 没有可对账的订单（需要已送货/已开对账单/已付款状态）。', { name: customer.name })); return; }
  const total = billableOrders.reduce((sum, o) => sum + Number(o.amount || 0), 0);
  const companyName = settings.companyName || t("泡沫厂");
  const totalText = formatCurrencyForLanguage(total, settings.language);
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${t("对账单")} - ${customer.name}</title>
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
<h1>${t("对 账 单")}</h1>
<p class="subtitle">${companyName}</p>
<div class="info">
  <div><strong>${t("客户")}：</strong>${customer.name}<br/><strong>${t("联系人")}：</strong>${customer.contact || "-"}<br/><strong>${t("电话")}：</strong>${customer.phone || "-"}</div>
  <div><strong>${t("日期")}：</strong>${today()}<br/><strong>${t("账期")}：</strong>${customer.paymentTerm || "-"}<br/><strong>${t("地址")}：</strong>${customer.address || "-"}</div>
</div>
<table>
<thead><tr><th>${t("订单号")}</th><th>${t("日期")}</th><th>${t("产品")}</th><th class="num">${t("数量")}</th><th class="num">${t("金额")}</th><th>${t("状态")}</th></tr></thead>
<tbody>
${billableOrders.map((o) => `<tr><td>${o.orderNo || "-"}</td><td>${o.date || "-"}</td><td>${o.product || "-"}</td><td class="num">${o.quantity || 0}</td><td class="num">${Number(o.amount || 0).toFixed(2)}</td><td>${t(normalizeOrderStatus(o.status))}</td></tr>`).join("")}
</tbody>
</table>
<p class="total">${t("合计金额：")} ${totalText}</p>
<div class="footer">
  <div>${t("制单人：___________")}</div>
  <div>${t("客户确认：___________")}</div>
</div>
</body></html>`;
  const w = window.open("", "_blank", "width=900,height=700");
  if (w) { w.document.write(html); w.document.close(); }
}
