import { StatusBar } from "expo-status-bar";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

const statusOptions = [
  "未完成",
  "已排产",
  "已完成",
  "已开送货单",
  "部分送货",
  "已送货",
  "已开对账单",
  "已付款",
  "异常",
];
const completionTimeField = "completionTime";
const completionOperatorField = "completionOperator";
const completionNoteField = "completionNote";
const completionPhotoField = "completionPhoto";
const completionPhotoAtField = "completionPhotoAt";
const mobileUserStorageKey = "foam-crm-mobile-user";
const mobileApiStorageKey = "foam-crm-mobile-api-url";
const mobileOfflineQueueStorageKey = "foam-crm-mobile-offline-queue";
const syncPollIntervalMs = 3000;
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
    completionTimeField,
    completionOperatorField,
    completionNoteField,
  ],
};
const mobileNavigationTabs = [
  { key: "workbench", label: "工作台", icon: "workbench" },
  { key: "alerts", label: "提醒", icon: "alerts" },
  { key: "schedule", label: "排产", icon: "schedule" },
  { key: "delivery", label: "签收", icon: "delivery" },
  { key: "cost", label: "成本", icon: "cost" },
  { key: "dashboard", label: "看板", icon: "dashboard", adminOnly: true },
  { key: "approval", label: "审批", icon: "approval", adminOnly: true },
  { key: "attendance", label: "考勤", icon: "attendance" },
];
const internalOrderFields = new Set(["id", completionPhotoField]);
const baseMobileOrderFields = [
  { field: "_customerName", label: "客户" },
  { field: "orderNo", label: "订单号" },
  { field: "status", label: "进度" },
  { field: "date", label: "订单日期", type: "date" },
  { field: "product", label: "产品" },
  { field: "quantity", label: "数量", type: "number" },
  { field: "amount", label: "金额", type: "amount" },
  { field: "dueDate", label: "交期", type: "date" },
  { field: "productionDate", label: "排产日期", type: "date" },
  { field: "productionQuantity", label: "排产数量", type: "number" },
  { field: "productionLine", label: "员工姓名" },
  { field: "deliveredQuantity", label: "已送数量", type: "number" },
  { field: "remainingQuantity", label: "剩余数量", type: "number" },
  { field: completionTimeField, label: "完成时间", type: "datetime" },
  { field: completionOperatorField, label: "完成人" },
  { field: completionNoteField, label: "完成备注" },
  { field: completionPhotoAtField, label: "完成照片时间", type: "datetime" },
  { field: "completionUserName", label: "完成账号" },
  { field: "followUp", label: "跟进记录" },
];

function inferDevelopmentApiBaseUrl() {
  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.manifest2?.extra?.expoClient?.hostUri ||
    Constants.manifest?.debuggerHost ||
    "";
  const host = String(hostUri).split(":")[0];
  if (host) return `http://${host}:3001/api`;
  return "http://127.0.0.1:3001/api";
}

const envApiBaseUrl = typeof process !== "undefined" ? process.env?.EXPO_PUBLIC_API_BASE_URL : "";
const defaultApiBaseUrl = envApiBaseUrl || inferDevelopmentApiBaseUrl();

const iosPalette = {
  background: "#F5F6FA",
  surface: "#FFFFFF",
  grouped: "#EEF2F7",
  pressed: "#E7ECF4",
  line: "#DDE3EC",
  strongLine: "#CBD5E1",
  text: "#111827",
  textSoft: "#334155",
  muted: "#667085",
  placeholder: "#667085",
  accent: "#0A84FF",
  accentSoft: "#E8F2FF",
  success: "#34C759",
  successSoft: "#E8F8EF",
  warning: "#FF9F0A",
  warningSoft: "#FFF4DE",
  danger: "#FF3B30",
  dangerSoft: "#FFE8E6",
  purple: "#AF52DE",
  purpleSoft: "#F4E8FB",
  teal: "#30B0C7",
  tealSoft: "#E5F7FA",
};

const shadowSoft = {
  shadowColor: "#0F172A",
  shadowOpacity: 0.06,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 6 },
  elevation: 2,
};

const shadowCard = {
  shadowColor: "#0F172A",
  shadowOpacity: 0.08,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 10 },
  elevation: 3,
};

function normalizeStatus(status = "") {
  if (statusOptions.includes(status)) return status;
  if (status === "已发货") return "已送货";
  return "未完成";
}

function normalizeUserRole(role = "") {
  if (role === "admin" || role === "employee") return role;
  return "pending";
}

function roleLabel(role = "") {
  const normalized = normalizeUserRole(role);
  if (normalized === "admin") return "管理员";
  if (normalized === "employee") return "员工";
  return "普通用户";
}

function isAssignedUserRole(role = "") {
  const normalized = normalizeUserRole(role);
  return normalized === "admin" || normalized === "employee";
}

function isScheduledProductionOrder(order) {
  return normalizeStatus(order.status) === "已排产";
}

function parseDateValue(value) {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER;
}

function formatNumber(value) {
  if (value === "" || value == null) return "-";
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString("zh-CN") : String(value);
}

function parseMobileNumber(value) {
  const number = Number(
    String(value ?? "")
      .replace(/,/g, "")
      .trim(),
  );
  return Number.isFinite(number) ? number : 0;
}

function formatMoney(value) {
  if (value === "" || value == null || Number.isNaN(Number(value))) return "-";
  return `¥${parseMobileNumber(value).toFixed(2)}`;
}

function fieldText(value) {
  if (value === "" || value == null) return "-";
  return String(value);
}

function formatDateTime(value) {
  if (!value) return "-";
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

function formatElapsed(isoString) {
  const elapsed = Date.now() - new Date(isoString).getTime();
  if (elapsed < 60000) return "刚刚";
  if (elapsed < 3600000) return `${Math.floor(elapsed / 60000)} 分钟前`;
  if (elapsed < 86400000) return `${Math.floor(elapsed / 3600000)} 小时前`;
  return `${Math.floor(elapsed / 86400000)} 天前`;
}

function formatMobileFieldValue(order, fieldConfig) {
  const value = order?.[fieldConfig.field];
  if (fieldConfig.field === "status") return normalizeStatus(value);
  if (fieldConfig.type === "datetime") return formatDateTime(value);
  if (fieldConfig.type === "number") return formatNumber(value);
  if (fieldConfig.type === "amount") {
    if (value === "" || value == null) return "-";
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(2) : String(value);
  }
  return fieldText(value);
}

function hasOrderFieldValue(order, field) {
  if (!order) return false;
  if (field === "_customerName") return Boolean(order._customerName);
  return Object.prototype.hasOwnProperty.call(order, field);
}

function getPhotoUri(photo) {
  if (!photo) return "";
  if (typeof photo === "string") return photo;
  return photo.uri || photo.dataUrl || photo.url || photo.src || "";
}

function materialOptionKey(material = {}, index = 0) {
  return String(
    material.id ||
      `${material.materialName || "material"}-${material.unit || ""}-${material.unitCost || ""}-${index}`,
  );
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

function buildCustomerDisplayFields(
  order,
  customers = [],
  allFieldOptions = [],
  fieldType = "card",
) {
  const customer = customers.find((item) => item.id === order?._customerId);
  const settings = getCustomerMobileDisplaySettings(customer);
  const fields = fieldType === "detail" ? settings.detailFields : settings.cardFields;
  const optionByField = new Map(allFieldOptions.map((option) => [option.field, option]));
  return fields.map((field) => optionByField.get(field)).filter(Boolean);
}

function buildMobileOrderDisplayFields(customers = []) {
  const fields = new Map(baseMobileOrderFields.map((field) => [field.field, field]));

  for (const customer of customers) {
    for (const column of customer.customColumns?.orders || []) {
      if (!column?.field || fields.has(column.field)) continue;
      fields.set(column.field, {
        field: column.field,
        label: column.headerName || column.field,
        type: column.type,
      });
    }
    for (const order of customer.orders || []) {
      for (const field of Object.keys(order)) {
        if (internalOrderFields.has(field) || field.startsWith("_") || fields.has(field)) continue;
        fields.set(field, { field, label: field });
      }
    }
  }

  return Array.from(fields.values());
}

function getOrderDisplayFields(order, fieldOptions = []) {
  return fieldOptions.filter((option) => hasOrderFieldValue(order, option.field));
}

function flattenOrders(customers = []) {
  return customers.flatMap((customer) =>
    (customer.orders || []).map((order, orderIndex) => ({
      ...order,
      _customerId: customer.id,
      _customerName: customer.name,
      _orderIndex: orderIndex,
    })),
  );
}

function flattenDeliveries(customers = []) {
  return customers.flatMap((customer) =>
    (customer.deliveries || [])
      .filter((delivery) => delivery?._finalDelivery !== false)
      .map((delivery, deliveryIndex) => ({
        ...delivery,
        _customerId: customer.id,
        _customerName: customer.name,
        _deliveryIndex: deliveryIndex,
      })),
  );
}

function flattenCostEntries(customers = []) {
  return customers.flatMap((customer) =>
    (customer.costEntries || []).map((entry, entryIndex) => ({
      ...entry,
      _customerId: customer.id,
      _customerName: customer.name,
      _entryIndex: entryIndex,
    })),
  );
}

function normalizeDeliveryStatus(status = "") {
  const value = String(status || "").trim();
  if (value === "部分签收" || value === "部分送货") return "部分签收";
  if (value === "已签收" || value.includes("签收")) return "已签收";
  if (value === "已送" || value === "已送货" || value === "已发货") return "已签收";
  if (value === "作废") return "作废";
  return value || "未送";
}

function isDeliverySigned(delivery = {}) {
  return normalizeDeliveryStatus(delivery.status) === "已签收" || Boolean(delivery.signedAt);
}

function deliveryGroupKey(delivery = {}) {
  return `${delivery._customerId || ""}:${delivery.deliveryNo || delivery.id || ""}`;
}

function deliverySignItemId(delivery = {}, index = 0) {
  return String(
    delivery.id || delivery._linkedOrderId || `${delivery.deliveryNo || "delivery"}-${index}`,
  );
}

function deliverySignItemLabel(delivery = {}) {
  const orderLabel = delivery.orderNo || delivery.order_orderNo || delivery.orderNoText || "";
  const productLabel = delivery.product || delivery.order_product || delivery.productName || "";
  if (orderLabel && productLabel) return `${orderLabel} · ${productLabel}`;
  return String(
    orderLabel ||
      delivery.product ||
      delivery.order_product ||
      delivery.order_no ||
      delivery._linkedOrderId ||
      delivery.id ||
      "送货明细",
  );
}

function getDeliverySignItems(delivery = {}) {
  const existing = Array.isArray(delivery.signItems) ? delivery.signItems : [];
  if (existing.length) {
    return existing.map((item, index) => ({
      id: String(item.id || item.deliveryId || `${deliverySignItemId(delivery)}-${index}`),
      deliveryId: String(item.deliveryId || delivery.id || ""),
      label: String(item.label || item.orderNo || item.product || deliverySignItemLabel(delivery)),
      quantity: item.quantity ?? delivery.deliveryQuantity ?? "",
      unit: item.unit || delivery.unit || delivery.order_unit || "",
      signed: Boolean(item.signed || item.signedAt),
      signedAt: item.signedAt || "",
      signedBy: item.signedBy || "",
      note: item.note || "",
    }));
  }
  return [
    {
      id: deliverySignItemId(delivery),
      deliveryId: String(delivery.id || ""),
      label: deliverySignItemLabel(delivery),
      quantity: delivery.deliveryQuantity ?? delivery.quantity ?? "",
      unit: delivery.unit || delivery.order_unit || "",
      signed: isDeliverySigned(delivery),
      signedAt: delivery.signedAt || "",
      signedBy: delivery.signedBy || "",
      note: delivery.signedNote || "",
    },
  ];
}

function getDeliveryGroupSignItems(group = {}) {
  return (group.deliveries || []).flatMap((delivery, index) =>
    getDeliverySignItems(delivery).map((item) => ({
      ...item,
      id: item.id || deliverySignItemId(delivery, index),
      deliveryId: item.deliveryId || delivery.id,
      deliveryNo: delivery.deliveryNo || group.deliveryNo,
      customerName: delivery._customerName || group._customerName,
    })),
  );
}

function getDeliveryPrimaryId(delivery = {}) {
  return delivery.primaryDeliveryId || delivery.deliveries?.[0]?.id || delivery.id || "";
}

function isDeliveryGroupSigned(group = {}) {
  const items = getDeliveryGroupSignItems(group);
  return items.length > 0 && items.every((item) => item.signed);
}

function buildDeliveryGroups(deliveries = []) {
  const groups = new Map();
  for (const delivery of deliveries) {
    const key = deliveryGroupKey(delivery);
    const group = groups.get(key) || {
      ...delivery,
      id: key,
      groupId: key,
      primaryDeliveryId: delivery.id,
      deliveryNo: delivery.deliveryNo || delivery.id,
      deliveries: [],
    };
    group.deliveries.push(delivery);
    group._deliveryIndex = Math.min(
      group._deliveryIndex ?? delivery._deliveryIndex,
      delivery._deliveryIndex,
    );
    groups.set(key, group);
  }
  return Array.from(groups.values())
    .map((group) => {
      const items = getDeliveryGroupSignItems(group);
      const signedCount = items.filter((item) => item.signed).length;
      const status =
        items.length > 0 && signedCount === items.length
          ? "已签收"
          : signedCount > 0
            ? "部分签收"
            : "未送";
      const historyById = new Map();
      for (const entry of group.deliveries.flatMap((delivery) =>
        Array.isArray(delivery.signHistory) ? delivery.signHistory : [],
      )) {
        const key = entry?.id || `${entry?.signedAt || ""}-${entry?.signedBy || ""}`;
        if (key && !historyById.has(key)) historyById.set(key, entry);
      }
      return {
        ...group,
        status,
        signItems: items,
        signedCount,
        totalCount: items.length,
        signHistory: Array.from(historyById.values()).sort(
          (a, b) => parseDateValue(b.signedAt) - parseDateValue(a.signedAt),
        ),
      };
    })
    .sort(
      (a, b) =>
        parseDateValue(a.date) - parseDateValue(b.date) || a._deliveryIndex - b._deliveryIndex,
    );
}

function buildOfflineDeliverySignRows(
  group = {},
  selectedItemIds = [],
  payload = {},
  currentUser = {},
) {
  const selected = new Set(selectedItemIds.map((item) => String(item || "")).filter(Boolean));
  const historyId = makeQueueId("sign-history");
  const signedAt = new Date().toISOString();
  const signer = payload.signer || "";
  const note = payload.note || "";
  const rows = group.deliveries?.length ? group.deliveries : [group];

  return rows.map((delivery) => {
    const signedItemIds = [];
    const signItems = getDeliverySignItems(delivery).map((item) => {
      if (item.signed || !selected.has(String(item.id))) return item;
      signedItemIds.push(String(item.id));
      return {
        ...item,
        signed: true,
        signedAt,
        signedBy: signer,
        note: note || item.note || "",
      };
    });
    const allSigned = signItems.length > 0 && signItems.every((item) => item.signed);
    const partiallySigned = signItems.some((item) => item.signed);
    const signHistory = Array.isArray(delivery.signHistory) ? delivery.signHistory : [];
    const signedPatch = signedItemIds.length
      ? {
          signedAt,
          signedBy: signer,
          signedNote: note,
          signedPhoto: payload.photo || null,
          signedUserId: currentUser?.id || "",
          signedUserName: currentUser?.name || "",
        }
      : {
          signedAt: delivery.signedAt || "",
          signedBy: delivery.signedBy || "",
          signedNote: delivery.signedNote || "",
          signedPhoto: delivery.signedPhoto || null,
          signedUserId: delivery.signedUserId || "",
          signedUserName: delivery.signedUserName || "",
        };

    return {
      ...delivery,
      signItems,
      ...(signedItemIds.length
        ? {
            signHistory: [
              ...signHistory,
              {
                id: historyId,
                signedAt,
                signedBy: signer,
                note,
                photo: payload.photo || null,
                itemIds: signedItemIds,
                signedUserId: currentUser?.id || "",
                signedUserName: currentUser?.name || "",
              },
            ],
          }
        : {}),
      status: allSigned ? "已签收" : partiallySigned ? "部分签收" : "未送",
      ...(allSigned
        ? signedPatch
        : {
            signedAt: "",
            signedBy: "",
            signedNote: "",
            signedPhoto: null,
            signedUserId: "",
            signedUserName: "",
          }),
      _offlinePending: true,
    };
  });
}

function makeQueueId(type) {
  return `${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function summarizeCustomers(customers = []) {
  const allOrders = flattenOrders(customers);
  const allCosts = flattenCostEntries(customers);
  const pendingCosts = allCosts.filter((entry) => (entry.approvalStatus || "待审核") === "待审核");
  const approvedCosts = allCosts.filter((entry) => entry.approvalStatus === "已通过");
  const deliveries = flattenDeliveries(customers);
  return {
    orderCount: allOrders.length,
    scheduled: allOrders.filter(isScheduledProductionOrder).length,
    completed: allOrders.filter((order) => normalizeStatus(order.status) === "已完成").length,
    overdue: allOrders.filter((order) => {
      if (!isScheduledProductionOrder(order) || !order.dueDate) return false;
      return new Date(order.dueDate).setHours(0, 0, 0, 0) < new Date().setHours(0, 0, 0, 0);
    }).length,
    deliveryPending: deliveries.filter((delivery) => !isDeliverySigned(delivery)).length,
    pendingCostCount: pendingCosts.length,
    pendingCostAmount: pendingCosts.reduce(
      (sum, entry) => sum + parseMobileNumber(entry.amount),
      0,
    ),
    approvedCostAmount: approvedCosts.reduce(
      (sum, entry) => sum + parseMobileNumber(entry.amount),
      0,
    ),
    orderAmount: allOrders.reduce((sum, order) => sum + parseMobileNumber(order.amount), 0),
    paidAmount: customers
      .flatMap((customer) => customer.payments || [])
      .reduce((sum, payment) => sum + parseMobileNumber(payment.amount), 0),
  };
}

function orderSearchText(order) {
  return [
    order.orderNo,
    order.product,
    order._customerName,
    order.spec,
    order.followUp,
    order.status,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function scheduleOrderGroupKey(order = {}) {
  const orderNo = String(order.orderNo || "").trim();
  return orderNo || `${order._customerId || ""}:${order.id || ""}`;
}

function buildScheduleOrderGroups(orders = []) {
  const groups = new Map();
  for (const order of orders) {
    const key = scheduleOrderGroupKey(order);
    if (!groups.has(key)) {
      groups.set(key, {
        type: "schedule-group",
        key,
        orderNo: order.orderNo || "未填写订单号",
        customerNames: new Set(),
        orders: [],
      });
    }
    const group = groups.get(key);
    if (order._customerName) group.customerNames.add(order._customerName);
    group.orders.push(order);
  }

  return Array.from(groups.values()).map((group) => ({
    ...group,
    customerName:
      group.customerNames.size === 1
        ? Array.from(group.customerNames)[0]
        : `${group.customerNames.size} 个客户`,
  }));
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

const defaultAttendanceRules = {
  morningStartOptions: ["07:00", "08:00"],
  afternoonStartOptions: ["13:00", "14:00"],
  workStart: "07:00",
  lunchStart: "12:00",
  lunchEnd: "13:00",
  workEnd: "18:00",
  lunchBreakMin: 60,
  workDaysPerMonth: 26,
  overtimeMultiplier: 1,
  lateToleMin: 10,
  payrollCycleStartDay: 11,
  payDays: [25, 10],
};

function timeToMinutes(value, fallback = 0) {
  const [hours, minutes] = String(value || "")
    .split(":")
    .map((part) => Number(part));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return fallback;
  return hours * 60 + minutes;
}

function minutesBetween(start, end) {
  return Math.max(0, timeToMinutes(end) - timeToMinutes(start));
}

function normalizeAttendanceRules(rules = {}) {
  const merged = { ...defaultAttendanceRules, ...(rules || {}) };
  const morningStartOptions = normalizeTimeOptions(
    merged.morningStartOptions,
    defaultAttendanceRules.morningStartOptions,
  );
  const afternoonStartOptions = normalizeTimeOptions(
    merged.afternoonStartOptions,
    defaultAttendanceRules.afternoonStartOptions,
  );
  const lunchBreakMin =
    minutesBetween(merged.lunchStart, merged.lunchEnd) || Number(merged.lunchBreakMin) || 0;
  return {
    ...merged,
    morningStartOptions,
    afternoonStartOptions,
    workStart: morningStartOptions[0],
    lunchBreakMin,
    workDaysPerMonth: Number(merged.workDaysPerMonth) || defaultAttendanceRules.workDaysPerMonth,
    overtimeMultiplier: 1,
    lateToleMin: Number(merged.lateToleMin) || 0,
    payrollCycleStartDay:
      Number(merged.payrollCycleStartDay) || defaultAttendanceRules.payrollCycleStartDay,
    payDays: Array.isArray(merged.payDays) && merged.payDays.length
      ? merged.payDays
      : defaultAttendanceRules.payDays,
  };
}

function normalizeTimeOptions(value, fallback) {
  const options = Array.isArray(value) ? value : [];
  const normalized = options
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .sort((a, b) => timeToMinutes(a) - timeToMinutes(b))
    .slice(0, 2);
  return [...normalized, ...fallback].slice(0, 2);
}

function buildAttendanceScheduleSegments(rules = {}) {
  const normalized = normalizeAttendanceRules(rules);
  return [
    {
      key: "morning",
      label: "上午上班",
      time: `${normalized.morningStartOptions.join(" / ")} - ${normalized.lunchStart}`,
      minutes: minutesBetween(normalized.morningStartOptions[0], normalized.lunchStart),
    },
    {
      key: "lunch",
      label: "中午午休",
      time: `${normalized.lunchStart} - ${normalized.lunchEnd}`,
      minutes: minutesBetween(normalized.lunchStart, normalized.lunchEnd),
    },
    {
      key: "afternoon",
      label: "下午上班",
      time: `${normalized.afternoonStartOptions.join(" / ")} - ${normalized.workEnd}`,
      minutes: minutesBetween(normalized.afternoonStartOptions[0], normalized.workEnd),
    },
  ];
}

function formatScheduleHours(minutes) {
  const safeMinutes = Math.max(0, Number(minutes) || 0);
  return `${(safeMinutes / 60).toFixed(safeMinutes % 60 === 0 ? 0 : 1)}h`;
}

function MobileApp() {
  const [apiBaseUrl, setApiBaseUrl] = useState(defaultApiBaseUrl);
  const [apiDraft, setApiDraft] = useState(defaultApiBaseUrl);
  const [authLoading, setAuthLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [registerName, setRegisterName] = useState("");
  const [registerPhone, setRegisterPhone] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState("");
  const [registering, setRegistering] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [loginPhone, setLoginPhone] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("all");
  const [activeView, setActiveView] = useState("workbench");
  const [query, setQuery] = useState("");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingOrderId, setSavingOrderId] = useState("");
  const [error, setError] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [completionOrder, setCompletionOrder] = useState(null);
  const [completionOperator, setCompletionOperator] = useState("");
  const [completionNote, setCompletionNote] = useState("");
  const [completionPhoto, setCompletionPhoto] = useState(null);
  const [attendanceRecord, setAttendanceRecord] = useState(null);
  const [attendanceStats, setAttendanceStats] = useState(null);
  const [attendanceLeaves, setAttendanceLeaves] = useState([]);
  const [attendanceRules, setAttendanceRules] = useState(defaultAttendanceRules);
  const [payrollCalendar, setPayrollCalendar] = useState(null);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [leaveType, setLeaveType] = useState("事假");
  const [leaveStartDate, setLeaveStartDate] = useState("");
  const [leaveEndDate, setLeaveEndDate] = useState("");
  const [leaveReason, setLeaveReason] = useState("");
  const [leavingSubmitting, setLeavingSubmitting] = useState(false);
  const [liveElapsed, setLiveElapsed] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [costCustomerId, setCostCustomerId] = useState("");
  const [costMaterialKey, setCostMaterialKey] = useState("");
  const [costQuantity, setCostQuantity] = useState("1");
  const [costNote, setCostNote] = useState("");
  const [costPhoto, setCostPhoto] = useState(null);
  const [savingCost, setSavingCost] = useState(false);
  const [offlineQueue, setOfflineQueue] = useState([]);
  const [syncingQueue, setSyncingQueue] = useState(false);
  const [syncStatus, setSyncStatus] = useState({}); // { itemId: 'pending'|'syncing'|'synced'|'failed' }
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [deliverySign, setDeliverySign] = useState(null);
  const [deliverySigner, setDeliverySigner] = useState("");
  const [deliverySignNote, setDeliverySignNote] = useState("");
  const [deliverySignPhoto, setDeliverySignPhoto] = useState(null);
  const [deliverySelectedItems, setDeliverySelectedItems] = useState([]);
  const [expandedDeliveryGroups, setExpandedDeliveryGroups] = useState({});
  const [expandedScheduleGroups, setExpandedScheduleGroups] = useState({});
  const [savingDeliveryId, setSavingDeliveryId] = useState("");
  const [approvalNoteByEntry, setApprovalNoteByEntry] = useState({});
  const syncVersionRef = useRef(0);

  const request = useCallback(
    async (path, options = {}) => {
      const baseUrl = apiBaseUrl.replace(/\/$/, "");
      const response = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...(currentUser?.token ? { "X-Mobile-User-Token": currentUser.token } : {}),
          ...(options.headers || {}),
        },
      });
      if (!response.ok) {
        const text = await response.text();
        const error = new Error(text || `HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
      return response.json();
    },
    [apiBaseUrl, currentUser?.token],
  );

  const loadCustomers = useCallback(
    async ({ silent = false } = {}) => {
      if (!currentUser?.token) {
        setCustomers([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }
      if (!silent) setLoading(true);
      setError("");
      try {
        const session = await request("/users/me");
        if (session.user) {
          setCurrentUser(session.user);
          await AsyncStorage.setItem(mobileUserStorageKey, JSON.stringify(session.user));
        }
        if (!isAssignedUserRole(session.user?.role)) {
          setCustomers([]);
          return;
        }
        const [firstPage, versionResult] = await Promise.all([
          request("/customers?limit=200"),
          request("/sync-version").catch(() => null),
        ]);
        let list = firstPage.data || firstPage;
        list = Array.isArray(list) ? list : [];

        // Load remaining pages if more exist
        const pagination = firstPage.pagination;
        if (pagination && pagination.totalPages > 1) {
          const remainingPages = [];
          for (let page = 2; page <= pagination.totalPages; page++) {
            remainingPages.push(request(`/customers?page=${page}&limit=200`));
          }
          const extraResults = await Promise.all(remainingPages);
          for (const result of extraResults) {
            const pageData = result.data || result;
            if (Array.isArray(pageData)) list = list.concat(pageData);
          }
        }

        setCustomers(list);
        const nextVersion = Number(versionResult?.version || 0);
        if (nextVersion) syncVersionRef.current = nextVersion;
      } catch (err) {
        if (err.status === 401) {
          await AsyncStorage.removeItem(mobileUserStorageKey);
          await AsyncStorage.removeItem(mobileOfflineQueueStorageKey);
          setCurrentUser(null);
          setCustomers([]);
          setOfflineQueue([]);
        }
        setError(err.message || "连接失败");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [currentUser?.token, request],
  );

  useEffect(() => {
    let mounted = true;
    const restoreSession = async () => {
      try {
        const [[, savedApiUrl], [, savedUser], [, savedQueue]] = await AsyncStorage.multiGet([
          mobileApiStorageKey,
          mobileUserStorageKey,
          mobileOfflineQueueStorageKey,
        ]);
        if (!mounted) return;
        if (savedApiUrl) {
          setApiBaseUrl(savedApiUrl);
          setApiDraft(savedApiUrl);
        }
        if (savedUser) {
          setCurrentUser(JSON.parse(savedUser));
        }
        if (savedQueue) {
          const parsedQueue = JSON.parse(savedQueue);
          setOfflineQueue(Array.isArray(parsedQueue) ? parsedQueue : []);
        }
      } catch {
        await AsyncStorage.removeItem(mobileUserStorageKey);
      } finally {
        if (mounted) setAuthLoading(false);
      }
    };
    restoreSession();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!currentUser?.token) {
      setLoading(false);
      return;
    }
    loadCustomers();
  }, [authLoading, currentUser?.token, loadCustomers]);

  const persistOfflineQueue = useCallback(async (nextQueue) => {
    setOfflineQueue(nextQueue);
    await AsyncStorage.setItem(mobileOfflineQueueStorageKey, JSON.stringify(nextQueue));
  }, []);

  const enqueueOfflineAction = useCallback(
    async (action) => {
      const item = {
        id: makeQueueId(action.type || "offline"),
        createdAt: new Date().toISOString(),
        retryCount: 0,
        lastRetryAt: null,
        ...action,
      };
      await persistOfflineQueue([...offlineQueue, item]);
      return item;
    },
    [offlineQueue, persistOfflineQueue],
  );

  const allOrders = useMemo(() => flattenOrders(customers), [customers]);
  const allDeliveries = useMemo(() => flattenDeliveries(customers), [customers]);
  const deliveryGroups = useMemo(() => buildDeliveryGroups(allDeliveries), [allDeliveries]);
  const allCostEntries = useMemo(() => flattenCostEntries(customers), [customers]);
  const currentRole = normalizeUserRole(currentUser?.role);
  const isRoleAssigned = isAssignedUserRole(currentRole);
  const isAdmin = currentRole === "admin";
  const dashboardSummary = useMemo(() => {
    const summary = summarizeCustomers(customers);
    return {
      ...summary,
      deliveryPending: deliveryGroups.filter((group) => !isDeliveryGroupSigned(group)).length,
    };
  }, [customers, deliveryGroups]);
  const selectedCostCustomer = useMemo(
    () =>
      customers.find((customer) => customer.id === costCustomerId) ||
      (selectedCustomerId !== "all"
        ? customers.find((customer) => customer.id === selectedCustomerId)
        : null) ||
      customers.find((customer) => (customer.materialCosts || []).length > 0) ||
      customers[0] ||
      null,
    [costCustomerId, customers, selectedCustomerId],
  );
  const costMaterialOptions = selectedCostCustomer?.materialCosts || [];
  const selectedCostMaterial = useMemo(
    () =>
      costMaterialOptions.find(
        (material, index) => materialOptionKey(material, index) === costMaterialKey,
      ) ||
      costMaterialOptions[0] ||
      null,
    [costMaterialKey, costMaterialOptions],
  );
  const costUnitCost = parseMobileNumber(selectedCostMaterial?.unitCost);
  const hasVisibleCostPrice =
    selectedCostMaterial?.unitCost !== "" && selectedCostMaterial?.unitCost != null;
  const costAmount = hasVisibleCostPrice ? parseMobileNumber(costQuantity) * costUnitCost : null;
  const recentCostEntries = useMemo(
    () =>
      [...(selectedCostCustomer?.costEntries || [])]
        .sort(
          (a, b) => parseDateValue(b.enteredAt || b.date) - parseDateValue(a.enteredAt || a.date),
        )
        .slice(0, 12),
    [selectedCostCustomer?.costEntries],
  );
  const pendingCostEntries = useMemo(
    () =>
      allCostEntries
        .filter((entry) => (entry.approvalStatus || "待审核") === "待审核")
        .sort(
          (a, b) => parseDateValue(a.enteredAt || a.date) - parseDateValue(b.enteredAt || b.date),
        ),
    [allCostEntries],
  );
  const pendingDeliveries = useMemo(
    () =>
      deliveryGroups
        .filter((delivery) => !isDeliveryGroupSigned(delivery))
        .sort(
          (a, b) =>
            parseDateValue(a.date) - parseDateValue(b.date) || a._deliveryIndex - b._deliveryIndex,
        ),
    [deliveryGroups],
  );
  const scheduledOrdersForWorkbench = useMemo(
    () =>
      allOrders
        .filter(isScheduledProductionOrder)
        .sort(
          (a, b) =>
            parseDateValue(a.productionDate || a.dueDate) -
              parseDateValue(b.productionDate || b.dueDate) ||
            parseDateValue(a.date) - parseDateValue(b.date) ||
            a._orderIndex - b._orderIndex,
        ),
    [allOrders],
  );
  const reminders = useMemo(() => {
    const todayTs = new Date().setHours(0, 0, 0, 0);
    const threeDaysTs = todayTs + 3 * 86400000;
    const list = [];
    for (const order of allOrders) {
      if (!isScheduledProductionOrder(order)) continue;
      if (!order.dueDate) continue;
      const dueTs = new Date(order.dueDate).setHours(0, 0, 0, 0);
      if (dueTs < todayTs) {
        list.push({
          id: `overdue-${order._customerId}-${order.id}`,
          tone: "danger",
          title: "订单已逾期",
          text: `${order._customerName} · ${order.orderNo || order.product}`,
        });
      } else if (dueTs <= threeDaysTs) {
        list.push({
          id: `due-${order._customerId}-${order.id}`,
          tone: "warning",
          title: "订单即将到期",
          text: `${order._customerName} · ${order.orderNo || order.product} · ${order.dueDate}`,
        });
      }
    }
    if (offlineQueue.length) {
      list.unshift({
        id: "offline-queue",
        tone: "warning",
        title: "有离线记录待同步",
        text: `${offlineQueue.length} 条记录会在网络恢复后同步`,
      });
    }
    if (isAdmin && pendingCostEntries.length) {
      list.unshift({
        id: "cost-approval",
        tone: "info",
        title: "成本待审批",
        text: `${pendingCostEntries.length} 条成本记录等待审批`,
      });
    }
    if (pendingDeliveries.length) {
      list.push({
        id: "delivery-sign",
        tone: "info",
        title: "送货待签收",
        text: `${pendingDeliveries.length} 张送货单未签收`,
      });
    }
    return list.slice(0, 8);
  }, [
    allOrders,
    isAdmin,
    offlineQueue.length,
    pendingCostEntries.length,
    pendingDeliveries.length,
  ]);
  const mobileDisplayFieldOptions = useMemo(
    () => buildMobileOrderDisplayFields(customers),
    [customers],
  );
  useEffect(() => {
    const employeeViews = new Set(["workbench", "alerts", "schedule", "delivery", "cost"]);
    if (!isAdmin && !employeeViews.has(activeView)) setActiveView("workbench");
  }, [activeView, isAdmin]);
  useEffect(() => {
    const preferredCustomerId =
      selectedCustomerId !== "all" &&
      customers.some((customer) => customer.id === selectedCustomerId)
        ? selectedCustomerId
        : "";
    const nextCustomerId =
      preferredCustomerId ||
      (customers.some((customer) => customer.id === costCustomerId) ? costCustomerId : "") ||
      customers.find((customer) => (customer.materialCosts || []).length > 0)?.id ||
      customers[0]?.id ||
      "";
    if (nextCustomerId !== costCustomerId) setCostCustomerId(nextCustomerId);
  }, [costCustomerId, customers, selectedCustomerId]);
  useEffect(() => {
    if (!costMaterialOptions.length) {
      if (costMaterialKey) setCostMaterialKey("");
      return;
    }
    const hasSelected = costMaterialOptions.some(
      (material, index) => materialOptionKey(material, index) === costMaterialKey,
    );
    if (!hasSelected) setCostMaterialKey(materialOptionKey(costMaterialOptions[0], 0));
  }, [costMaterialKey, costMaterialOptions]);
  const visibleOrders = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const view = isAdmin ? activeView : "schedule";
    return allOrders
      .filter((order) => selectedCustomerId === "all" || order._customerId === selectedCustomerId)
      .filter((order) => {
        const status = normalizeStatus(order.status);
        if (view === "schedule") return isScheduledProductionOrder(order);
        if (view === "completed") return status === "已完成";
        return true;
      })
      .filter((order) => !keyword || orderSearchText(order).includes(keyword))
      .sort((a, b) => {
        if (view === "schedule") {
          return (
            parseDateValue(a.productionDate || a.dueDate) -
              parseDateValue(b.productionDate || b.dueDate) ||
            parseDateValue(a.date) - parseDateValue(b.date) ||
            a._orderIndex - b._orderIndex
          );
        }
        return parseDateValue(b.date) - parseDateValue(a.date) || b._orderIndex - a._orderIndex;
      });
  }, [activeView, allOrders, isAdmin, query, selectedCustomerId]);
  const scheduleOrderGroups = useMemo(
    () => buildScheduleOrderGroups(visibleOrders),
    [visibleOrders],
  );
  const scheduleListItems = useMemo(
    () =>
      scheduleOrderGroups.flatMap((group) => {
        if (group.orders.length <= 1) return group.orders;
        if (!expandedScheduleGroups[group.key]) return [group];
        return [
          group,
          ...group.orders.map((order) => ({ ...order, _scheduleGroupKey: group.key })),
        ];
      }),
    [expandedScheduleGroups, scheduleOrderGroups],
  );
  const orderListItems = activeView === "schedule" ? scheduleListItems : visibleOrders;

  const stats = useMemo(() => {
    const open = allOrders.filter(isScheduledProductionOrder).length;
    const completed = allOrders.filter(
      (order) => normalizeStatus(order.status) === "已完成",
    ).length;
    return {
      all: allOrders.length,
      open,
      completed,
    };
  }, [allOrders]);
  const visibleMobileTabs = useMemo(
    () => mobileNavigationTabs.filter((tab) => isAdmin || !tab.adminOnly),
    [isAdmin],
  );
  const activeViewTitle =
    visibleMobileTabs.find((tab) => tab.key === activeView)?.label ||
    mobileNavigationTabs.find((tab) => tab.key === activeView)?.label ||
    "工作台";

  // Live elapsed timer while checked in but not yet checked out
  useEffect(() => {
    if (!attendanceRecord?.checkIn || attendanceRecord?.checkOut) {
      setLiveElapsed("");
      return;
    }
    const tick = () => {
      const diff = Date.now() - new Date(attendanceRecord.checkIn).getTime();
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setLiveElapsed(
        h > 0
          ? `${h}小时 ${String(m).padStart(2, "0")}分 ${String(s).padStart(2, "0")}秒`
          : `${m}分 ${String(s).padStart(2, "0")}秒`
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [attendanceRecord?.checkIn, attendanceRecord?.checkOut]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    loadCustomers({ silent: true });
  }, [loadCustomers]);

  useEffect(() => {
    if (authLoading || !currentUser?.token || !isRoleAssigned) return undefined;

    let stopped = false;
    const pollSyncVersion = async () => {
      if (
        stopped ||
        offlineQueue.length ||
        syncingQueue ||
        savingOrderId ||
        savingCost ||
        savingDeliveryId
      ) {
        return;
      }
      try {
        const result = await request("/sync-version");
        const nextVersion = Number(result?.version || 0);
        if (!nextVersion) return;
        if (!syncVersionRef.current) {
          syncVersionRef.current = nextVersion;
          return;
        }
        if (nextVersion > syncVersionRef.current) {
          await loadCustomers({ silent: true });
        }
      } catch {
        // Keep the current mobile data visible when the network is temporarily unavailable.
      }
    };

    const intervalId = setInterval(pollSyncVersion, syncPollIntervalMs);
    return () => {
      stopped = true;
      clearInterval(intervalId);
    };
  }, [
    authLoading,
    currentUser?.token,
    isRoleAssigned,
    loadCustomers,
    offlineQueue.length,
    request,
    savingCost,
    savingDeliveryId,
    savingOrderId,
    syncingQueue,
  ]);

  const registerMobileUser = useCallback(async () => {
    const name = registerName.trim();
    const phone = registerPhone.trim();
    const password = registerPassword;
    const confirmPassword = registerConfirmPassword;
    const nextApiUrl = apiDraft.trim().replace(/\/$/, "");
    if (!nextApiUrl) {
      Alert.alert("请填写后端地址", "格式例如：http://电脑IP:3001/api");
      return;
    }
    if (!name || !phone) {
      Alert.alert("请填写注册信息", "姓名和手机号都需要填写。");
      return;
    }
    if (password.length < 6) {
      Alert.alert("密码太短", "密码至少需要 6 位。");
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("两次密码不一致", "请重新输入并确认密码。");
      return;
    }

    setRegistering(true);
    setError("");
    try {
      const response = await fetch(`${nextApiUrl}/users/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, password }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `HTTP ${response.status}`);
      }
      const result = await response.json();
      if (!result.user?.token) throw new Error("注册失败，服务端没有返回账号信息");
      await AsyncStorage.multiSet([
        [mobileApiStorageKey, nextApiUrl],
        [mobileUserStorageKey, JSON.stringify(result.user)],
      ]);
      setApiBaseUrl(nextApiUrl);
      setApiDraft(nextApiUrl);
      setCurrentUser(result.user);
      setRegisterName("");
      setRegisterPhone("");
      setRegisterPassword("");
      setRegisterConfirmPassword("");
      setLoading(true);
    } catch (err) {
      Alert.alert("注册失败", err.message || "无法连接服务器");
    } finally {
      setRegistering(false);
    }
  }, [apiDraft, registerConfirmPassword, registerName, registerPassword, registerPhone]);

  const loginMobileUser = useCallback(async () => {
    const phone = loginPhone.trim();
    const password = loginPassword;
    const nextApiUrl = apiDraft.trim().replace(/\/$/, "");
    if (!nextApiUrl) {
      Alert.alert("请填写后端地址", "格式例如：http://电脑IP:3001/api");
      return;
    }
    if (!phone || !password) {
      Alert.alert("请填写登录信息", "手机号和密码都需要填写。");
      return;
    }

    setLoggingIn(true);
    setError("");
    try {
      const response = await fetch(`${nextApiUrl}/users/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, password }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || `登录失败 (${response.status})`);
      }
      const result = await response.json();
      if (!result.user?.token) throw new Error("登录失败，服务端没有返回账号信息");
      await AsyncStorage.multiSet([
        [mobileApiStorageKey, nextApiUrl],
        [mobileUserStorageKey, JSON.stringify(result.user)],
      ]);
      setApiBaseUrl(nextApiUrl);
      setApiDraft(nextApiUrl);
      setCurrentUser(result.user);
      setLoginPhone("");
      setLoginPassword("");
      setLoading(true);
    } catch (err) {
      Alert.alert("登录失败", err.message || "无法连接服务器");
    } finally {
      setLoggingIn(false);
    }
  }, [apiDraft, loginPassword, loginPhone]);

  const logoutMobileUser = useCallback(async () => {
    await AsyncStorage.removeItem(mobileUserStorageKey);
    setCurrentUser(null);
    setCustomers([]);
    setShowSettings(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmNewPassword("");
    setSelectedOrder(null);
    setCompletionOrder(null);
    setActiveView("workbench");
    setShowRegister(false);
  }, []);

  const updateCurrentUser = useCallback(async (user) => {
    setCurrentUser(user);
    await AsyncStorage.setItem(mobileUserStorageKey, JSON.stringify(user));
  }, []);

  const pickProfileAvatar = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("无法选择头像", "请允许访问相册后再试。");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [1, 1],
      base64: true,
      quality: 0.65,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if (!asset.base64) {
      Alert.alert("头像读取失败", "请选择一张本地图片后再试。");
      return;
    }
    const avatar = `data:${asset.mimeType || "image/jpeg"};base64,${asset.base64}`;
    try {
      setSavingProfile(true);
      const response = await request("/users/me/avatar", {
        method: "PATCH",
        body: JSON.stringify({ avatar }),
      });
      if (response.user) await updateCurrentUser(response.user);
    } catch (err) {
      Alert.alert("头像保存失败", err.message || "请稍后再试");
    } finally {
      setSavingProfile(false);
    }
  }, [request, updateCurrentUser]);

  const changePassword = useCallback(async () => {
    if (!currentPassword || !newPassword) {
      Alert.alert("请填写密码", "当前密码和新密码都需要填写。");
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert("新密码太短", "新密码至少需要 6 位。");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      Alert.alert("两次密码不一致", "请重新输入新密码。");
      return;
    }
    try {
      setSavingProfile(true);
      const response = await request("/users/me/password", {
        method: "PATCH",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (response.user) await updateCurrentUser(response.user);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      Alert.alert("密码已更新", "下次登录请使用新密码。");
    } catch (err) {
      Alert.alert("密码修改失败", err.message || "请稍后再试");
    } finally {
      setSavingProfile(false);
    }
  }, [confirmNewPassword, currentPassword, newPassword, request, updateCurrentUser]);

  const applyApiUrl = useCallback(
    ({ closeProfile = true } = {}) => {
      const next = apiDraft.trim().replace(/\/$/, "");
      if (!next) return;
      setApiBaseUrl(next);
      AsyncStorage.setItem(mobileApiStorageKey, next);
      if (closeProfile) setShowSettings(false);
    },
    [apiDraft],
  );

  const loadAttendanceToday = useCallback(async () => {
    setAttendanceLoading(true);
    try {
      const res = await request("/attendance/today");
      setAttendanceRecord(res.record);
    } catch (err) {
      console.warn("loadAttendanceToday:", err.message);
    } finally {
      setAttendanceLoading(false);
    }
  }, [request]);

  const checkIn = useCallback(async () => {
    setAttendanceLoading(true);
    try {
      const res = await request("/attendance/check-in", { method: "POST" });
      if (res.ok) setAttendanceRecord(res.record);
    } catch (err) {
      Alert.alert("签到失败", err.message);
    } finally {
      setAttendanceLoading(false);
    }
  }, [request]);

  const checkOut = useCallback(async () => {
    setAttendanceLoading(true);
    try {
      const res = await request("/attendance/check-out", { method: "POST" });
      if (res.ok) setAttendanceRecord(res.record);
    } catch (err) {
      Alert.alert("签退失败", err.message);
    } finally {
      setAttendanceLoading(false);
    }
  }, [request]);

  const loadAttendanceStats = useCallback(async (month) => {
    try {
      const res = await request(`/attendance/stats?month=${month || ""}`);
      setAttendanceStats(res);
    } catch (err) {
      console.warn("loadAttendanceStats:", err.message);
    }
  }, [request]);

  const loadAttendanceRules = useCallback(async () => {
    try {
      const res = await request("/attendance/rules");
      if (res.rules) setAttendanceRules(normalizeAttendanceRules(res.rules));
    } catch (err) {
      console.warn("loadAttendanceRules:", err.message);
    }
  }, [request]);

  const loadPayrollCalendar = useCallback(async () => {
    try {
      const res = await request("/attendance/payroll-calendar");
      if (res.calendar) setPayrollCalendar(res.calendar);
    } catch (err) {
      console.warn("loadPayrollCalendar:", err.message);
    }
  }, [request]);

  const loadLeaves = useCallback(async () => {
    try {
      const res = await request("/attendance/leaves");
      setAttendanceLeaves(res.leaves || []);
    } catch (err) {
      console.warn("loadLeaves:", err.message);
    }
  }, [request]);

  useEffect(() => {
    if (activeView === "attendance" && currentUser?.token) {
      loadAttendanceToday();
      loadAttendanceRules();
      loadPayrollCalendar();
      loadLeaves();
      loadAttendanceStats("");
    }
  }, [
    activeView,
    currentUser?.token,
    loadAttendanceToday,
    loadAttendanceRules,
    loadPayrollCalendar,
    loadLeaves,
    loadAttendanceStats,
  ]);

  const submitLeave = useCallback(async () => {
    if (!leaveStartDate || !leaveEndDate) {
      Alert.alert("请填写日期", "请选择请假的起止日期。");
      return;
    }
    setLeavingSubmitting(true);
    try {
      await request("/attendance/leaves", {
        method: "POST",
        body: JSON.stringify({
          type: leaveType,
          startDate: leaveStartDate,
          endDate: leaveEndDate,
          reason: leaveReason,
        }),
      });
      Alert.alert("提交成功", "请假申请已提交，等待管理员审批。");
      setLeaveStartDate("");
      setLeaveEndDate("");
      setLeaveReason("");
      setLeaveType("事假");
      loadLeaves();
    } catch (err) {
      Alert.alert("提交失败", err.message);
    } finally {
      setLeavingSubmitting(false);
    }
  }, [leaveStartDate, leaveEndDate, leaveReason, leaveType, request, loadLeaves]);

  const updateLocalOrder = useCallback((customerId, row) => {
    setCustomers((current) =>
      current.map((customer) => {
        if (customer.id !== customerId) return customer;
        return {
          ...customer,
          orders: (customer.orders || []).map((order) => (order.id === row.id ? row : order)),
        };
      }),
    );
    setSelectedOrder((current) => {
      if (!current || current.id !== row.id || current._customerId !== customerId) return current;
      return { ...row, _customerId: customerId, _customerName: current._customerName };
    });
  }, []);

  const updateLocalDelivery = useCallback((customerId, row) => {
    setCustomers((current) =>
      current.map((customer) =>
        customer.id === customerId
          ? {
              ...customer,
              deliveries: (customer.deliveries || []).map((delivery) =>
                delivery.id === row.id ? row : delivery,
              ),
            }
          : customer,
      ),
    );
    setDeliverySign((current) => {
      if (!current || current.id !== row.id || current._customerId !== customerId) return current;
      return { ...row, _customerId: customerId, _customerName: current._customerName };
    });
  }, []);

  const updateLocalCostEntry = useCallback((customerId, row) => {
    setCustomers((current) =>
      current.map((customer) =>
        customer.id === customerId
          ? {
              ...customer,
              costEntries: (customer.costEntries || []).map((entry) =>
                entry.id === row.id ? row : entry,
              ),
            }
          : customer,
      ),
    );
  }, []);

  const saveOrderStatus = useCallback(
    async (order, status, patch = {}) => {
      try {
        const result = await request(`/customers/${order._customerId}/orders/${order.id}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status, ...patch }),
        });
        return result.row || { ...order, ...patch, status };
      } catch (err) {
        if (err.status !== 404 && err.status !== 405) throw err;

        const customer = customers.find((item) => item.id === order._customerId);
        if (!customer) throw err;
        const rows = (customer.orders || []).map((row) =>
          row.id === order.id ? { ...row, ...patch, status } : row,
        );
        const result = await request(`/customers/${order._customerId}/orders`, {
          method: "PUT",
          body: JSON.stringify({ rows }),
        });
        const savedRows = result.rows || rows;
        setCustomers((current) =>
          current.map((item) =>
            item.id === order._customerId ? { ...item, orders: savedRows } : item,
          ),
        );
        return savedRows.find((row) => row.id === order.id) || { ...order, ...patch, status };
      }
    },
    [customers, request],
  );

  const syncOfflineQueue = useCallback(async () => {
    if (syncingQueue || !offlineQueue.length || !currentUser?.token) return;
    setSyncingQueue(true);
    let nextQueue = [...offlineQueue];
    const now = Date.now();
    let hasSuccess = false;

    try {
      for (const item of nextQueue) {
        // Skip items that failed recently (exponential backoff)
        if (item.retryCount > 0 && item.lastRetryAt) {
          const backoffMs = Math.min(Math.pow(2, item.retryCount) * 1000, 60000);
          const elapsed = now - new Date(item.lastRetryAt).getTime();
          if (elapsed < backoffMs) continue;
        }

        setSyncStatus((current) => ({ ...current, [item.id]: "syncing" }));
        try {
          if (item.type === "complete-order") {
            const body = { status: "已完成", ...(item.payload || {}) };
            if (item.ifMatchStatus) body.ifMatchStatus = item.ifMatchStatus;
            const result = await request(
              `/customers/${item.customerId}/orders/${item.orderId}/status`,
              {
                method: "PATCH",
                body: JSON.stringify(body),
              },
            );
            updateLocalOrder(
              item.customerId,
              result.row || { ...(item.payload || {}), id: item.orderId, status: "已完成" },
            );
          }
          if (item.type === "cost-entry") {
            const result = await request(`/customers/${item.customerId}/cost-entries`, {
              method: "POST",
              body: JSON.stringify(item.payload || {}),
            });
            const syncedRow = result.row || {
              ...(item.payload || {}),
              id: item.localRowId || item.payload?.id || item.id,
            };
            setCustomers((current) =>
              current.map((customer) =>
                customer.id === item.customerId
                  ? {
                      ...customer,
                      costEntries: (() => {
                        let replaced = false;
                        const nextEntries = (customer.costEntries || []).map((entry) => {
                          if (item.localRowId && entry.id === item.localRowId) {
                            replaced = true;
                            return syncedRow;
                          }
                          if (syncedRow.id && entry.id === syncedRow.id) {
                            replaced = true;
                            return syncedRow;
                          }
                          return entry;
                        });
                        return replaced ? nextEntries : [...nextEntries, syncedRow];
                      })(),
                    }
                  : customer,
              ),
            );
          }
          if (item.type === "delivery-sign") {
            const result = await request(
              `/customers/${item.customerId}/deliveries/${item.deliveryId}/sign`,
              {
                method: "PATCH",
                body: JSON.stringify(item.payload || {}),
              },
            );
            const rows = Array.isArray(result.rows) ? result.rows : [result.row].filter(Boolean);
            if (rows.length) {
              rows.forEach((row) => updateLocalDelivery(item.customerId, row));
            } else {
              updateLocalDelivery(item.customerId, {
                ...(item.payload || {}),
                id: item.deliveryId,
                status: "已签收",
              });
            }
          }

          // Success — remove from queue
          nextQueue = nextQueue.filter((queued) => queued.id !== item.id);
          setSyncStatus((current) => ({ ...current, [item.id]: "synced" }));
          hasSuccess = true;
          await persistOfflineQueue(nextQueue);
        } catch (err) {
          // 409 Conflict — data changed on server since queued; drop the item
          if (err.status === 409) {
            nextQueue = nextQueue.filter((queued) => queued.id !== item.id);
            setSyncStatus((current) => ({ ...current, [item.id]: "synced" }));
            await persistOfflineQueue(nextQueue);
            continue;
          }
          // Mark for retry with backoff
          const updatedItem = {
            ...item,
            retryCount: (item.retryCount || 0) + 1,
            lastRetryAt: new Date().toISOString(),
          };
          nextQueue = nextQueue.map((queued) => (queued.id === item.id ? updatedItem : queued));
          setSyncStatus((current) => ({ ...current, [item.id]: "failed" }));
          await persistOfflineQueue(nextQueue);
          // Continue with next item — don't break on single failure
          continue;
        }
      }
    } finally {
      setSyncingQueue(false);
      if (hasSuccess) {
        setLastSyncAt(new Date().toISOString());
        await loadCustomers({ silent: true });
      }
    }
  }, [
    currentUser?.token,
    loadCustomers,
    offlineQueue,
    persistOfflineQueue,
    request,
    syncingQueue,
    updateLocalDelivery,
    updateLocalOrder,
  ]);

  // Auto-sync on token/network change + periodic retry for failed items
  useEffect(() => {
    if (!offlineQueue.length || !currentUser?.token || loading) return;
    syncOfflineQueue();

    // Periodic retry for failed items (every 30 seconds)
    const interval = setInterval(() => {
      const hasFailedItems = offlineQueue.some((item) => item.retryCount > 0);
      if (hasFailedItems) syncOfflineQueue();
    }, 30000);

    return () => clearInterval(interval);
  }, [currentUser?.token, loading, offlineQueue.length, syncOfflineQueue]);

  const markCompleted = useCallback(
    (order) => {
      setCompletionOrder(order);
      setCompletionOperator(order[completionOperatorField] || currentUser?.name || "手机端");
      setCompletionNote(order[completionNoteField] || "");
      setCompletionPhoto(null);
    },
    [currentUser?.name],
  );

  const closeCompletionModal = useCallback(() => {
    if (savingOrderId) return;
    setCompletionOrder(null);
    setCompletionOperator("");
    setCompletionNote("");
    setCompletionPhoto(null);
  }, [savingOrderId]);

  const takeCompletionPhoto = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("需要相机权限", "请允许相机权限后再拍照上传完成照片。");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      base64: true,
      quality: 0.55,
    });
    if (result.canceled || !result.assets?.length) return;

    const asset = result.assets[0];
    if (!asset.base64) {
      Alert.alert("拍照失败", "没有拿到照片数据，请重新拍照。");
      return;
    }
    setCompletionPhoto({
      uri: asset.uri,
      dataUrl: `data:image/jpeg;base64,${asset.base64}`,
      width: asset.width,
      height: asset.height,
      takenAt: new Date().toISOString(),
    });
  }, []);

  const submitCompletion = useCallback(async () => {
    if (!completionOrder) return;
    if (!completionPhoto?.dataUrl) {
      Alert.alert("需要完成照片", "请先拍照上传，才能确认订单已完成。");
      return;
    }
    const patch = {
      [completionTimeField]: new Date().toISOString(),
      [completionOperatorField]: completionOperator.trim() || currentUser?.name || "手机端",
      [completionNoteField]: completionNote.trim(),
      [completionPhotoField]: {
        dataUrl: completionPhoto.dataUrl,
        width: completionPhoto.width,
        height: completionPhoto.height,
        takenAt: completionPhoto.takenAt,
        uploadedBy: currentUser?.name || completionOperator.trim() || "手机端",
      },
      [completionPhotoAtField]: completionPhoto.takenAt || new Date().toISOString(),
    };
    setSavingOrderId(completionOrder.id);
    try {
      const row = await saveOrderStatus(completionOrder, "已完成", patch);
      updateLocalOrder(completionOrder._customerId, row);
      setCompletionOrder(null);
      setCompletionOperator("");
      setCompletionNote("");
      setCompletionPhoto(null);
    } catch {
      const offlineRow = {
        ...completionOrder,
        ...patch,
        status: "已完成",
        _offlinePending: true,
      };
      updateLocalOrder(completionOrder._customerId, offlineRow);
      await enqueueOfflineAction({
        type: "complete-order",
        customerId: completionOrder._customerId,
        orderId: completionOrder.id,
        ifMatchStatus: completionOrder.status,
        payload: patch,
      });
      setCompletionOrder(null);
      setCompletionOperator("");
      setCompletionNote("");
      setCompletionPhoto(null);
      Alert.alert("已离线暂存", "网络不可用，订单完成记录会在恢复连接后自动同步。");
    } finally {
      setSavingOrderId("");
    }
  }, [
    completionNote,
    completionOperator,
    completionOrder,
    completionPhoto,
    currentUser?.name,
    enqueueOfflineAction,
    saveOrderStatus,
    updateLocalOrder,
  ]);

  const takeCostPhoto = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("需要相机权限", "请允许相机权限后再拍照上传物料照片。");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      base64: true,
      quality: 0.55,
    });
    if (result.canceled || !result.assets?.length) return;

    const asset = result.assets[0];
    if (!asset.base64) {
      Alert.alert("拍照失败", "没有拿到照片数据，请重新拍照。");
      return;
    }
    setCostPhoto({
      uri: asset.uri,
      dataUrl: `data:image/jpeg;base64,${asset.base64}`,
      width: asset.width,
      height: asset.height,
      takenAt: new Date().toISOString(),
    });
  }, []);

  const openDeliverySign = useCallback((delivery) => {
    setDeliverySign(delivery);
    setDeliverySigner(delivery.signedBy || "");
    setDeliverySignNote(delivery.signedNote || "");
    setDeliverySignPhoto(null);
    setDeliverySelectedItems([]);
  }, []);

  const closeDeliverySign = useCallback(() => {
    if (savingDeliveryId) return;
    setDeliverySign(null);
    setDeliverySigner("");
    setDeliverySignNote("");
    setDeliverySignPhoto(null);
    setDeliverySelectedItems([]);
  }, [savingDeliveryId]);

  const toggleDeliverySignItem = useCallback((itemId) => {
    setDeliverySelectedItems((current) =>
      current.includes(itemId) ? current.filter((item) => item !== itemId) : [...current, itemId],
    );
  }, []);

  const toggleDeliveryGroupExpanded = useCallback((groupId) => {
    setExpandedDeliveryGroups((current) => ({ ...current, [groupId]: !current[groupId] }));
  }, []);

  const toggleScheduleGroupExpanded = useCallback((groupId) => {
    setExpandedScheduleGroups((current) => ({ ...current, [groupId]: !current[groupId] }));
  }, []);

  const takeDeliverySignPhoto = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("需要相机权限", "请允许相机权限后再拍照上传签收照片。");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      base64: true,
      quality: 0.55,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    if (!asset.base64) {
      Alert.alert("拍照失败", "没有拿到照片数据，请重新拍照。");
      return;
    }
    setDeliverySignPhoto({
      uri: asset.uri,
      dataUrl: `data:image/jpeg;base64,${asset.base64}`,
      width: asset.width,
      height: asset.height,
      takenAt: new Date().toISOString(),
    });
  }, []);

  const submitDeliverySign = useCallback(async () => {
    if (!deliverySign) return;
    const signer = deliverySigner.trim();
    if (!signer) {
      Alert.alert("请填写签收人", "送货签收需要填写客户或收货人姓名。");
      return;
    }
    if (!deliverySignPhoto?.dataUrl) {
      Alert.alert("需要签收照片", "请先拍照上传后再确认签收。");
      return;
    }
    if (!deliverySelectedItems.length) {
      Alert.alert("请选择签收明细", "请至少选择一条未签收明细。");
      return;
    }
    const payload = {
      signer,
      note: deliverySignNote.trim(),
      itemIds: deliverySelectedItems,
      photo: {
        dataUrl: deliverySignPhoto.dataUrl,
        width: deliverySignPhoto.width,
        height: deliverySignPhoto.height,
        takenAt: deliverySignPhoto.takenAt,
        uploadedBy: currentUser?.name || "手机端",
      },
    };
    const deliveryId = getDeliveryPrimaryId(deliverySign);
    setSavingDeliveryId(deliverySign.id);
    try {
      const result = await request(
        `/customers/${deliverySign._customerId}/deliveries/${deliveryId}/sign`,
        {
          method: "PATCH",
          body: JSON.stringify(payload),
        },
      );
      const rows = Array.isArray(result.rows) ? result.rows : [result.row].filter(Boolean);
      if (rows.length) {
        rows.forEach((row) => updateLocalDelivery(deliverySign._customerId, row));
      } else {
        updateLocalDelivery(deliverySign._customerId, {
          ...deliverySign,
          status: "部分签收",
          ...payload,
        });
      }
      closeDeliverySign();
    } catch {
      const offlineRows = buildOfflineDeliverySignRows(
        deliverySign,
        deliverySelectedItems,
        payload,
        currentUser,
      );
      offlineRows.forEach((row) => updateLocalDelivery(deliverySign._customerId, row));
      await enqueueOfflineAction({
        type: "delivery-sign",
        customerId: deliverySign._customerId,
        deliveryId,
        payload,
      });
      closeDeliverySign();
      Alert.alert("已离线暂存", "网络不可用，送货签收会在恢复连接后自动同步。");
    } finally {
      setSavingDeliveryId("");
    }
  }, [
    closeDeliverySign,
    currentUser?.id,
    currentUser?.name,
    deliverySign,
    deliverySignNote,
    deliverySignPhoto,
    deliverySelectedItems,
    deliverySigner,
    enqueueOfflineAction,
    request,
    updateLocalDelivery,
  ]);

  const submitCostEntry = useCallback(async () => {
    if (!selectedCostCustomer?.id) {
      Alert.alert("请选择客户", "成本录入需要先选择客户。");
      return;
    }
    if (!selectedCostMaterial?.materialName) {
      Alert.alert("没有可录入物料", "请先在电脑端为该客户添加物料名称和成本价格。");
      return;
    }
    const quantity = parseMobileNumber(costQuantity);
    if (quantity <= 0) {
      Alert.alert("数量不正确", "请输入大于 0 的数量。");
      return;
    }
    if (!costPhoto?.dataUrl) {
      Alert.alert("需要照片证明", "每次物料录入都必须拍照上传。");
      return;
    }

    const payload = {
      date: new Date().toISOString().slice(0, 10),
      materialName: selectedCostMaterial.materialName,
      quantity,
      unit: selectedCostMaterial.unit || "",
      unitCost: hasVisibleCostPrice ? costUnitCost : undefined,
      amount: hasVisibleCostPrice ? quantity * costUnitCost : undefined,
      note: costNote.trim(),
      photo: {
        dataUrl: costPhoto.dataUrl,
        width: costPhoto.width,
        height: costPhoto.height,
        takenAt: costPhoto.takenAt,
        uploadedBy: currentUser?.name || "手机端",
      },
    };
    setSavingCost(true);
    try {
      const result = await request(`/customers/${selectedCostCustomer.id}/cost-entries`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const row = result.row || payload;
      setCustomers((current) =>
        current.map((customer) =>
          customer.id === selectedCostCustomer.id
            ? { ...customer, costEntries: [...(customer.costEntries || []), row] }
            : customer,
        ),
      );
      setCostQuantity("1");
      setCostNote("");
      setCostPhoto(null);
      Alert.alert("录入成功", "成本记录已同步到电脑端。");
    } catch {
      const offlineRow = {
        ...payload,
        id: makeQueueId("costEntries"),
        enteredAt: new Date().toISOString(),
        enteredBy: currentUser?.name || "手机端",
        enteredUserId: currentUser?.id || "",
        approvalStatus: "待审核",
        _offlinePending: true,
      };
      setCustomers((current) =>
        current.map((customer) =>
          customer.id === selectedCostCustomer.id
            ? { ...customer, costEntries: [...(customer.costEntries || []), offlineRow] }
            : customer,
        ),
      );
      await enqueueOfflineAction({
        type: "cost-entry",
        customerId: selectedCostCustomer.id,
        localRowId: offlineRow.id,
        payload,
      });
      setCostQuantity("1");
      setCostNote("");
      setCostPhoto(null);
      Alert.alert("已离线暂存", "网络不可用，成本记录会在恢复连接后自动同步。");
    } finally {
      setSavingCost(false);
    }
  }, [
    costNote,
    costPhoto,
    costQuantity,
    costUnitCost,
    hasVisibleCostPrice,
    currentUser?.name,
    currentUser?.id,
    enqueueOfflineAction,
    request,
    selectedCostCustomer,
    selectedCostMaterial,
  ]);

  const approveCostEntry = useCallback(
    async (entry, approvalStatus) => {
      if (!isAdmin || !entry?._customerId || !entry?.id) return;
      try {
        const result = await request(
          `/customers/${entry._customerId}/cost-entries/${entry.id}/approval`,
          {
            method: "PATCH",
            body: JSON.stringify({
              approvalStatus,
              approvalNote: approvalNoteByEntry[entry.id] || "",
            }),
          },
        );
        updateLocalCostEntry(entry._customerId, result.row || { ...entry, approvalStatus });
        setApprovalNoteByEntry((current) => {
          const next = { ...current };
          delete next[entry.id];
          return next;
        });
      } catch (err) {
        Alert.alert("审批失败", err.message || "无法连接服务器");
      }
    },
    [approvalNoteByEntry, isAdmin, request, updateLocalCostEntry],
  );

  const openDetail = useCallback((order) => {
    setSelectedOrder(order);
  }, []);

  const openWorkbenchTask = useCallback((order) => {
    if (!order) return;
    if (order._customerId) setSelectedCustomerId(order._customerId);
    setActiveView("schedule");
    setSelectedOrder(order);
  }, []);

  if (authLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        <LoadingState label="正在读取手机账号..." />
      </SafeAreaView>
    );
  }

  if (!currentUser) {
    if (showRegister) {
      return (
        <RegisterScreen
          apiDraft={apiDraft}
          name={registerName}
          phone={registerPhone}
          password={registerPassword}
          confirmPassword={registerConfirmPassword}
          saving={registering}
          onChangeApi={setApiDraft}
          onChangeName={setRegisterName}
          onChangePhone={setRegisterPhone}
          onChangePassword={setRegisterPassword}
          onChangeConfirmPassword={setRegisterConfirmPassword}
          onSubmit={registerMobileUser}
          onSwitchToLogin={() => setShowRegister(false)}
        />
      );
    }
    return (
      <LoginScreen
        apiDraft={apiDraft}
        phone={loginPhone}
        password={loginPassword}
        saving={loggingIn}
        onChangeApi={setApiDraft}
        onChangePhone={setLoginPhone}
        onChangePassword={setLoginPassword}
        onSubmit={loginMobileUser}
        onSwitchToRegister={() => setShowRegister(true)}
      />
    );
  }

  if (!isRoleAssigned) {
    return (
      <PendingRoleScreen
        apiDraft={apiDraft}
        currentUser={currentUser}
        refreshing={refreshing || loading}
        onChangeApi={setApiDraft}
        onApplyApi={applyApiUrl}
        onResetApi={() => setApiDraft(defaultApiBaseUrl)}
        onRefresh={refresh}
        onLogout={logoutMobileUser}
      />
    );
  }

  if (showSettings) {
    return (
      <ProfileScreen
        apiDraft={apiDraft}
        currentUser={currentUser}
        currentRole={currentRole}
        currentPassword={currentPassword}
        newPassword={newPassword}
        confirmNewPassword={confirmNewPassword}
        saving={savingProfile}
        onBack={() => setShowSettings(false)}
        onChangeApi={setApiDraft}
        onApplyApi={() => applyApiUrl({ closeProfile: false })}
        onResetApi={() => setApiDraft(defaultApiBaseUrl)}
        onPickAvatar={pickProfileAvatar}
        onChangeCurrentPassword={setCurrentPassword}
        onChangeNewPassword={setNewPassword}
        onChangeConfirmNewPassword={setConfirmNewPassword}
        onChangePassword={changePassword}
        onLogout={logoutMobileUser}
      />
    );
  }

  const contentHeader = (
    <View>
      <View style={styles.statsRow}>
        <StatCard label="待完成" value={stats.open} tone="blue" />
        <StatCard label="待签收" value={dashboardSummary.deliveryPending} tone="slate" />
        {isAdmin ? (
          <>
            <StatCard label="待审批" value={dashboardSummary.pendingCostCount} tone="green" />
          </>
        ) : null}
      </View>

      {["schedule", "orders", "completed"].includes(activeView) ? (
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="搜索订单号、客户、产品"
          placeholderTextColor={iosPalette.placeholder}
        />
      ) : null}

      {["schedule", "orders", "completed"].includes(activeView) ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.customerChips}
        >
          <Pressable
            style={[styles.customerChip, selectedCustomerId === "all" && styles.customerChipActive]}
            onPress={() => setSelectedCustomerId("all")}
          >
            <Text
              style={[
                styles.customerChipText,
                selectedCustomerId === "all" && styles.customerChipTextActive,
              ]}
            >
              全部客户
            </Text>
          </Pressable>
          {customers.map((customer) => (
            <Pressable
              key={customer.id}
              style={[
                styles.customerChip,
                selectedCustomerId === customer.id && styles.customerChipActive,
              ]}
              onPress={() => setSelectedCustomerId(customer.id)}
            >
              <Text
                style={[
                  styles.customerChipText,
                  selectedCustomerId === customer.id && styles.customerChipTextActive,
                ]}
              >
                {customer.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>连接失败</Text>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.errorHint}>确认电脑后端已运行，并且手机和电脑在同一个 Wi-Fi。</Text>
        </View>
      ) : null}
    </View>
  );
  const appChrome = (content, overlays = null) => (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <AppTopBar
        title={activeViewTitle}
        currentUser={currentUser}
        currentRole={currentRole}
        onAvatarPress={() => setShowSettings(true)}
      />
      <View style={styles.mobileBody}>{content}</View>
      <BottomTabBar tabs={visibleMobileTabs} activeView={activeView} onChange={setActiveView} />
      {overlays}
    </SafeAreaView>
  );

  if (activeView === "workbench") {
    return appChrome(
      <ScrollView
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={iosPalette.accent}
          />
        }
      >
        {contentHeader}
        <WorkbenchPanel
          scheduledOrders={scheduledOrdersForWorkbench}
          onOpenTask={openWorkbenchTask}
        />
      </ScrollView>,
    );
  }

  if (activeView === "alerts") {
    return appChrome(
      <ScrollView
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={iosPalette.accent}
          />
        }
      >
        {contentHeader}
        <ReminderPanel
          reminders={reminders}
          offlineQueue={offlineQueue}
          syncing={syncingQueue}
          onSync={syncOfflineQueue}
          syncStatus={syncStatus}
          lastSyncAt={lastSyncAt}
        />
      </ScrollView>,
    );
  }

  if (activeView === "delivery") {
    return appChrome(
      <FlatList
        data={pendingDeliveries}
        keyExtractor={(item) => `${item._customerId}-${item.id}`}
        ListHeaderComponent={contentHeader}
        ListEmptyComponent={
          loading ? (
            <LoadingState />
          ) : (
            <EmptyState title="没有待签收送货单" text="当前没有需要手机端签收的送货单。" />
          )
        }
        renderItem={({ item }) => (
          <DeliveryCard
            delivery={item}
            expanded={Boolean(expandedDeliveryGroups[item.id])}
            saving={savingDeliveryId === item.id}
            onToggle={toggleDeliveryGroupExpanded}
            onSign={openDeliverySign}
          />
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={iosPalette.accent}
          />
        }
      />,
      <DeliverySignModal
        delivery={deliverySign}
        signer={deliverySigner}
        note={deliverySignNote}
        photo={deliverySignPhoto}
        saving={deliverySign ? savingDeliveryId === deliverySign.id : false}
        selectedItemIds={deliverySelectedItems}
        onChangeSigner={setDeliverySigner}
        onChangeNote={setDeliverySignNote}
        onToggleItem={toggleDeliverySignItem}
        onTakePhoto={takeDeliverySignPhoto}
        onClearPhoto={() => setDeliverySignPhoto(null)}
        onCancel={closeDeliverySign}
        onSubmit={submitDeliverySign}
      />,
    );
  }

  if (activeView === "dashboard" && isAdmin) {
    return appChrome(
      <ScrollView
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={iosPalette.accent}
          />
        }
      >
        {contentHeader}
        <ManagementDashboard summary={dashboardSummary} customers={customers} />
      </ScrollView>,
    );
  }

  if (activeView === "approval" && isAdmin) {
    return appChrome(
      <FlatList
        data={pendingCostEntries}
        keyExtractor={(item) => `${item._customerId}-${item.id}`}
        ListHeaderComponent={contentHeader}
        ListEmptyComponent={
          loading ? (
            <LoadingState />
          ) : (
            <EmptyState title="暂无待审批成本" text="员工提交的成本记录会显示在这里。" />
          )
        }
        renderItem={({ item }) => (
          <CostApprovalCard
            entry={item}
            note={approvalNoteByEntry[item.id] || ""}
            onChangeNote={(text) =>
              setApprovalNoteByEntry((current) => ({ ...current, [item.id]: text }))
            }
            onApprove={() => approveCostEntry(item, "已通过")}
            onReject={() => approveCostEntry(item, "已拒绝")}
          />
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={iosPalette.accent}
          />
        }
      />,
    );
  }

  if (activeView === "cost") {
    return appChrome(
      <ScrollView
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={iosPalette.accent}
          />
        }
        keyboardShouldPersistTaps="handled"
      >
        {contentHeader}
        <CostEntryPanel
          customers={customers}
          selectedCustomer={selectedCostCustomer}
          selectedCustomerId={selectedCostCustomer?.id || costCustomerId}
          materialOptions={costMaterialOptions}
          selectedMaterialKey={costMaterialKey}
          selectedMaterial={selectedCostMaterial}
          quantity={costQuantity}
          note={costNote}
          photo={costPhoto}
          amount={costAmount}
          saving={savingCost}
          recentEntries={recentCostEntries}
          onSelectCustomer={(id) => {
            setCostCustomerId(id);
            if (id) setSelectedCustomerId(id);
          }}
          onSelectMaterial={setCostMaterialKey}
          onChangeQuantity={setCostQuantity}
          onChangeNote={setCostNote}
          onTakePhoto={takeCostPhoto}
          onClearPhoto={() => setCostPhoto(null)}
          onSubmit={submitCostEntry}
        />
      </ScrollView>,
    );
  }

  if (activeView === "attendance") {
    const normalizedAttendanceRules = normalizeAttendanceRules(attendanceRules);
    const attendanceSegments = buildAttendanceScheduleSegments(normalizedAttendanceRules);
    const dailyWorkMinutes = attendanceSegments
      .filter((segment) => segment.key !== "lunch")
      .reduce((sum, segment) => sum + segment.minutes, 0);

    return appChrome(
      <ScrollView
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={attendanceLoading}
            onRefresh={() => {
              loadAttendanceToday();
              loadAttendanceRules();
              loadPayrollCalendar();
              loadLeaves();
              loadAttendanceStats("");
            }}
            tintColor={iosPalette.accent}
          />
        }
        keyboardShouldPersistTaps="handled"
        onLayout={() => {
          loadAttendanceToday();
          loadAttendanceRules();
          loadPayrollCalendar();
          loadLeaves();
          loadAttendanceStats("");
        }}
      >
        {/* Today's Status Card — enhanced */}
        <View style={styles.attendanceCard}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <Text style={styles.attendanceCardTitle}>今日考勤</Text>
            <Text style={styles.attendanceDate}>{todayDate()}</Text>
          </View>

          {/* Live Duration Banner */}
          {attendanceRecord?.checkIn && !attendanceRecord?.checkOut && liveElapsed ? (
            <View style={styles.attendanceLiveBanner}>
              <View style={styles.attendanceLiveDot} />
              <Text style={styles.attendanceLiveLabel}>在岗时长</Text>
              <Text style={styles.attendanceLiveTime}>{liveElapsed}</Text>
            </View>
          ) : attendanceRecord?.checkIn && attendanceRecord?.checkOut ? (
            <View style={[styles.attendanceLiveBanner, styles.attendanceLiveBannerDone]}>
              <Text style={styles.attendanceLiveLabelDone}>✓ 已完成签到签退</Text>
            </View>
          ) : (
            <View style={styles.attendanceNotChecked}>
              <Text style={styles.attendanceNotCheckedText}>今日尚未签到</Text>
            </View>
          )}

          {/* Status Chips */}
          {attendanceRecord?.checkIn ? (
            <View style={styles.attendanceStatusRow}>
              <View style={styles.attendanceChip}>
                <Text style={styles.attendanceChipIcon}>✓</Text>
                <View>
                  <Text style={styles.attendanceChipLabel}>签到</Text>
                  <Text style={styles.attendanceChipTime}>
                    {new Date(attendanceRecord.checkIn).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                </View>
              </View>
              {attendanceRecord?.checkOut ? (
                <View style={styles.attendanceChip}>
                  <Text style={styles.attendanceChipIcon}>✓</Text>
                  <View>
                    <Text style={styles.attendanceChipLabel}>签退</Text>
                    <Text style={styles.attendanceChipTime}>
                      {new Date(attendanceRecord.checkOut).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={styles.attendanceChipMuted}>
                  <Text style={styles.attendanceChipIconMuted}>○</Text>
                  <View>
                    <Text style={styles.attendanceChipLabelMuted}>签退</Text>
                    <Text style={styles.attendanceChipTimeMuted}>待签退</Text>
                  </View>
                </View>
              )}
            </View>
          ) : null}

          {/* Large Check In / Check Out Buttons */}
          <View style={styles.attendanceActions}>
            <Pressable
              style={({ pressed }) => [
                styles.attendanceBtnLarge,
                attendanceRecord?.checkIn ? styles.attendanceBtnLargeDone : styles.attendanceBtnLargeIn,
                pressed && !attendanceRecord?.checkIn && { transform: [{ scale: 0.97 }] },
              ]}
              onPress={checkIn}
              disabled={!!attendanceRecord?.checkIn || attendanceLoading}
            >
              {attendanceLoading && !attendanceRecord?.checkIn ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={styles.attendanceBtnLargeIcon}>{attendanceRecord?.checkIn ? "✓" : "⏱"}</Text>
                  <Text style={styles.attendanceBtnLargeText}>
                    {attendanceRecord?.checkIn ? "已签到" : "上班打卡"}
                  </Text>
                  {!attendanceRecord?.checkIn && (
                    <Text style={styles.attendanceBtnLargeSub}>点击记录到岗时间</Text>
                  )}
                </>
              )}
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.attendanceBtnLarge,
                attendanceRecord?.checkOut
                  ? styles.attendanceBtnLargeDone
                  : !attendanceRecord?.checkIn
                  ? styles.attendanceBtnLargeDisabled
                  : styles.attendanceBtnLargeOut,
                pressed && attendanceRecord?.checkIn && !attendanceRecord?.checkOut && { transform: [{ scale: 0.97 }] },
              ]}
              onPress={checkOut}
              disabled={!attendanceRecord?.checkIn || !!attendanceRecord?.checkOut || attendanceLoading}
            >
              {attendanceLoading && attendanceRecord?.checkIn && !attendanceRecord?.checkOut ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={styles.attendanceBtnLargeIcon}>{attendanceRecord?.checkOut ? "✓" : "🏠"}</Text>
                  <Text style={styles.attendanceBtnLargeText}>
                    {attendanceRecord?.checkOut ? "已签退" : !attendanceRecord?.checkIn ? "未签到" : "下班打卡"}
                  </Text>
                  {attendanceRecord?.checkIn && !attendanceRecord?.checkOut && (
                    <Text style={styles.attendanceBtnLargeSub}>点击记录离岗时间</Text>
                  )}
                </>
              )}
            </Pressable>
          </View>
        </View>

        <View style={styles.attendanceScheduleCard}>
          <View style={styles.attendanceScheduleHeader}>
            <View>
              <Text style={styles.attendanceScheduleKicker}>今日班次</Text>
              <Text style={styles.attendanceScheduleTitle}>
                {normalizedAttendanceRules.morningStartOptions.join(" / ")}
              </Text>
              <Text style={styles.attendanceScheduleSubtitle}>
                下午 {normalizedAttendanceRules.afternoonStartOptions.join(" / ")} · 下班 {normalizedAttendanceRules.workEnd}
              </Text>
            </View>
            <View style={styles.attendanceScheduleTotal}>
              <Text style={styles.attendanceScheduleTotalValue}>
                {formatScheduleHours(dailyWorkMinutes)}
              </Text>
              <Text style={styles.attendanceScheduleTotalLabel}>日净工时</Text>
            </View>
          </View>

          <View style={styles.attendanceScheduleTimeline}>
            {attendanceSegments.map((segment) => (
              <View key={segment.key} style={styles.attendanceScheduleSegment}>
                <View style={[styles.attendanceScheduleDot, styles[`attendanceScheduleDot_${segment.key}`]]} />
                <View style={styles.attendanceScheduleSegmentText}>
                  <Text style={styles.attendanceScheduleSegmentLabel}>{segment.label}</Text>
                  <Text style={styles.attendanceScheduleSegmentTime}>{segment.time}</Text>
                </View>
                <Text style={styles.attendanceScheduleSegmentHours}>
                  {formatScheduleHours(segment.minutes)}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.attendanceScheduleFooter}>
            <Text style={styles.attendanceScheduleFooterText}>
              迟到容忍 {normalizedAttendanceRules.lateToleMin} 分钟
            </Text>
            <Text style={styles.attendanceScheduleFooterText}>
              午休 {normalizedAttendanceRules.lunchStart} - {normalizedAttendanceRules.lunchEnd}
            </Text>
            <Text style={styles.attendanceScheduleFooterText}>
              加班同普通时薪
            </Text>
          </View>
        </View>

        <View style={styles.attendanceScheduleCard}>
          <View style={styles.attendanceScheduleHeader}>
            <View>
              <Text style={styles.attendanceScheduleKicker}>工资日历</Text>
              <Text style={styles.attendanceScheduleTitle}>
                {payrollCalendar?.cycle?.label || "每月 11 号起算"}
              </Text>
              <Text style={styles.attendanceScheduleSubtitle}>已从服务器同步</Text>
            </View>
          </View>
          <View style={styles.attendanceScheduleFooter}>
            {(payrollCalendar?.payDates?.length ? payrollCalendar.payDates : ["25号", "10号"]).map((date) => (
              <Text key={date} style={styles.attendanceScheduleFooterText}>
                发薪 {date}
              </Text>
            ))}
          </View>
        </View>

        {/* Monthly Stats */}
        {attendanceStats ? (
          <View style={styles.attendanceCard}>
            <Text style={styles.attendanceCardTitle}>
              本周期统计 · {attendanceStats.cycle?.label || attendanceStats.month}
            </Text>
            <View style={styles.attendanceStatsGrid}>
              <View style={styles.attendanceStatItem}>
                <Text style={styles.attendanceStatValue}>{attendanceStats.workDays}</Text>
                <Text style={styles.attendanceStatLabel}>出勤天数</Text>
              </View>
              <View style={styles.attendanceStatItem}>
                <Text style={styles.attendanceStatValue}>{attendanceStats.totalHours}</Text>
                <Text style={styles.attendanceStatLabel}>工时(h)</Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* Leave Section */}
        <View style={styles.attendanceCard}>
          <Text style={styles.attendanceCardTitle}>请假申请</Text>

          {/* Leave Form */}
          <View style={styles.leaveForm}>
            <View style={styles.leaveField}>
              <Text style={styles.authLabel}>请假类型</Text>
              <View style={styles.leaveTypeRow}>
                {["事假", "病假", "年假", "其他"].map((t) => (
                  <Pressable
                    key={t}
                    style={[styles.leaveTypeChip, leaveType === t && styles.leaveTypeChipActive]}
                    onPress={() => setLeaveType(t)}
                  >
                    <Text style={[styles.leaveTypeChipText, leaveType === t && styles.leaveTypeChipTextActive]}>{t}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={styles.leaveFieldRow}>
              <View style={[styles.leaveField, { flex: 1 }]}>
                <Text style={styles.authLabel}>开始日期</Text>
                <TextInput
                  style={styles.authInput}
                  value={leaveStartDate}
                  onChangeText={setLeaveStartDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#546E8A"
                />
              </View>
              <View style={[styles.leaveField, { flex: 1 }]}>
                <Text style={styles.authLabel}>结束日期</Text>
                <TextInput
                  style={styles.authInput}
                  value={leaveEndDate}
                  onChangeText={setLeaveEndDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#546E8A"
                />
              </View>
            </View>
            <View style={styles.leaveField}>
              <Text style={styles.authLabel}>请假原因</Text>
              <TextInput
                style={[styles.authInput, { minHeight: 80 }]}
                value={leaveReason}
                onChangeText={setLeaveReason}
                placeholder="请简单说明请假原因"
                placeholderTextColor="#546E8A"
                multiline
                textAlignVertical="top"
              />
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.authButton,
                styles.authButtonRegister,
                leavingSubmitting && styles.authButtonDisabled,
                pressed && styles.authButtonPressed,
              ]}
              onPress={submitLeave}
              disabled={leavingSubmitting}
            >
              {leavingSubmitting ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.authButtonText}>提交请假</Text>
              )}
            </Pressable>
          </View>
        </View>

        {/* Leave History */}
        {attendanceLeaves.length > 0 ? (
          <View style={styles.attendanceCard}>
            <Text style={styles.attendanceCardTitle}>请假记录</Text>
            {attendanceLeaves.map((leave) => (
              <View key={leave.id} style={styles.leaveRow}>
                <View style={styles.leaveRowLeft}>
                  <Text style={styles.leaveRowType}>{leave.type}</Text>
                  <Text style={styles.leaveRowDates}>
                    {leave.startDate} ~ {leave.endDate}
                  </Text>
                  {leave.reason ? (
                    <Text style={styles.leaveRowReason}>{leave.reason}</Text>
                  ) : null}
                </View>
                <View style={[
                  styles.leaveStatusBadge,
                  leave.status === "approved" && styles.leaveStatusApproved,
                  leave.status === "rejected" && styles.leaveStatusRejected,
                ]}>
                  <Text style={[
                    styles.leaveStatusText,
                    leave.status === "approved" && styles.leaveStatusTextApproved,
                    leave.status === "rejected" && styles.leaveStatusTextRejected,
                  ]}>
                    {leave.status === "approved" ? "已批准" : leave.status === "rejected" ? "已拒绝" : "待审批"}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>,
    );
  }

  return appChrome(
    <FlatList
      data={orderListItems}
      keyExtractor={(item) =>
        item.type === "schedule-group"
          ? `schedule-group-${item.key}`
          : `${item._customerId}-${item.id}`
      }
      ListHeaderComponent={contentHeader}
      ListEmptyComponent={loading ? <LoadingState /> : <EmptyState />}
      renderItem={({ item }) =>
        item.type === "schedule-group" ? (
          <ScheduleOrderGroupCard
            group={item}
            expanded={Boolean(expandedScheduleGroups[item.key])}
            onToggle={toggleScheduleGroupExpanded}
          />
        ) : (
          <OrderCard
            order={item}
            saving={savingOrderId === item.id}
            customers={customers}
            displayFieldOptions={mobileDisplayFieldOptions}
            onOpen={openDetail}
            onComplete={markCompleted}
          />
        )
      }
      contentContainerStyle={styles.listContent}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={iosPalette.accent} />
      }
      initialNumToRender={12}
      maxToRenderPerBatch={10}
      windowSize={7}
      removeClippedSubviews
    />,
    <>
      <OrderDetailModal
        order={selectedOrder}
        saving={selectedOrder ? savingOrderId === selectedOrder.id : false}
        customers={customers}
        displayFieldOptions={mobileDisplayFieldOptions}
        onClose={() => setSelectedOrder(null)}
        onComplete={markCompleted}
      />

      <CompletionModal
        order={completionOrder}
        operator={completionOperator}
        note={completionNote}
        photo={completionPhoto}
        saving={completionOrder ? savingOrderId === completionOrder.id : false}
        onChangeOperator={setCompletionOperator}
        onChangeNote={setCompletionNote}
        onTakePhoto={takeCompletionPhoto}
        onClearPhoto={() => setCompletionPhoto(null)}
        onCancel={closeCompletionModal}
        onSubmit={submitCompletion}
      />
    </>,
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <MobileApp />
    </SafeAreaProvider>
  );
}

function LoginScreen({
  apiDraft,
  phone,
  password,
  saving,
  onChangeApi,
  onChangePhone,
  onChangePassword,
  onSubmit,
  onSwitchToRegister,
}) {
  return (
    <SafeAreaView style={styles.authSafeArea}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.authWrap}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.authScroll}
          contentInsetAdjustmentBehavior="automatic"
        >
          {/* Hero */}
          <View style={styles.authHero}>
            <View style={styles.authIconRing}>
              <Text style={styles.authIconText}>F</Text>
            </View>
            <Text style={styles.authKicker}>FOAM FACTORY CRM</Text>
            <Text style={styles.authTitle}>登录</Text>
            <Text style={styles.authHint}>
              使用手机号与密码登录员工账号
            </Text>
          </View>

          {/* Card */}
          <View style={styles.authCard}>
            <View style={styles.authField}>
              <Text style={styles.authLabel}>后端 API 地址</Text>
              <TextInput
                style={styles.authInput}
                value={apiDraft}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                onChangeText={onChangeApi}
                placeholder="http://电脑IP:3001/api"
                placeholderTextColor="#546E8A"
              />
            </View>

            <View style={styles.authField}>
              <Text style={styles.authLabel}>手机号</Text>
              <TextInput
                style={styles.authInput}
                value={phone}
                onChangeText={onChangePhone}
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                placeholder="请输入手机号"
                placeholderTextColor="#546E8A"
                returnKeyType="next"
              />
            </View>

            <View style={styles.authField}>
              <Text style={styles.authLabel}>密码</Text>
              <TextInput
                style={styles.authInput}
                value={password}
                onChangeText={onChangePassword}
                secureTextEntry
                textContentType="password"
                placeholder="请输入密码"
                placeholderTextColor="#546E8A"
                returnKeyType="done"
                onSubmitEditing={onSubmit}
              />
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.authButton,
                saving && styles.authButtonDisabled,
                pressed && styles.authButtonPressed,
              ]}
              onPress={onSubmit}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.authButtonText}>登录</Text>
              )}
            </Pressable>
          </View>

          {/* Toggle */}
          <Pressable style={styles.authToggle} onPress={onSwitchToRegister}>
            <Text style={styles.authToggleText}>
              还没有账号？<Text style={styles.authToggleLink}>注册新账号</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function RegisterScreen({
  apiDraft,
  name,
  phone,
  password,
  confirmPassword,
  saving,
  onChangeApi,
  onChangeName,
  onChangePhone,
  onChangePassword,
  onChangeConfirmPassword,
  onSubmit,
  onSwitchToLogin,
}) {
  return (
    <SafeAreaView style={styles.authSafeArea}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.authWrap}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.authScroll}
          contentInsetAdjustmentBehavior="automatic"
        >
          {/* Hero */}
          <View style={styles.authHero}>
            <View style={styles.authIconRing}>
              <Text style={styles.authIconText}>F</Text>
            </View>
            <Text style={styles.authKicker}>FOAM FACTORY CRM</Text>
            <Text style={styles.authTitle}>创建手机账号</Text>
            <Text style={styles.authHint}>
              提交后账号为普通用户，管理员分配角色前不会显示任何订单数据。
            </Text>
          </View>

          {/* Card */}
          <View style={styles.authCard}>
            <View style={styles.authField}>
              <Text style={styles.authLabel}>后端 API 地址</Text>
              <TextInput
                style={styles.authInput}
                value={apiDraft}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                onChangeText={onChangeApi}
                placeholder="http://电脑IP:3001/api"
                placeholderTextColor="#546E8A"
              />
            </View>

            <View style={styles.authField}>
              <Text style={styles.authLabel}>手机号</Text>
              <TextInput
                style={styles.authInput}
                value={phone}
                onChangeText={onChangePhone}
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                placeholder="请输入手机号"
                placeholderTextColor="#546E8A"
                returnKeyType="next"
              />
            </View>

            <View style={styles.authField}>
              <Text style={styles.authLabel}>姓名</Text>
              <TextInput
                style={styles.authInput}
                value={name}
                onChangeText={onChangeName}
                textContentType="name"
                placeholder="请输入真实姓名"
                placeholderTextColor="#546E8A"
                returnKeyType="next"
              />
            </View>

            <View style={styles.authField}>
              <Text style={styles.authLabel}>密码</Text>
              <TextInput
                style={styles.authInput}
                value={password}
                onChangeText={onChangePassword}
                secureTextEntry
                textContentType="newPassword"
                placeholder="至少 6 位"
                placeholderTextColor="#546E8A"
                returnKeyType="next"
              />
            </View>

            <View style={styles.authField}>
              <Text style={styles.authLabel}>重复输入密码</Text>
              <TextInput
                style={styles.authInput}
                value={confirmPassword}
                onChangeText={onChangeConfirmPassword}
                secureTextEntry
                textContentType="newPassword"
                placeholder="再次输入密码"
                placeholderTextColor="#546E8A"
                returnKeyType="done"
                onSubmitEditing={onSubmit}
              />
            </View>

            <View style={styles.authNotice}>
              <Text style={styles.authNoticeTitle}>注册后需要管理员审核</Text>
              <Text style={styles.authNoticeText}>
                管理员在电脑端"系统设置 → 手机账号角色"中把账号改为员工或管理员后，手机端才会显示数据。
              </Text>
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.authButton,
                styles.authButtonRegister,
                saving && styles.authButtonDisabled,
                pressed && styles.authButtonPressed,
              ]}
              onPress={onSubmit}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.authButtonText}>注册账号</Text>
              )}
            </Pressable>
          </View>

          {/* Toggle */}
          <Pressable style={styles.authToggle} onPress={onSwitchToLogin}>
            <Text style={styles.authToggleText}>
              已有账号？<Text style={styles.authToggleLink}>立即登录</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function PendingRoleScreen({
  apiDraft,
  currentUser,
  refreshing,
  onChangeApi,
  onApplyApi,
  onResetApi,
  onRefresh,
  onLogout,
}) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.pendingWrap}>
        <View style={styles.pendingCard}>
          <View style={styles.pendingIcon}>
            <Text style={styles.pendingIconText}>!</Text>
          </View>
          <Text style={styles.registerKicker}>ACCOUNT PENDING</Text>
          <Text style={styles.pendingTitle}>等待管理员分配角色</Text>
          <Text style={styles.pendingText}>
            当前账号已注册为普通用户。管理员分配“员工”或“管理员”角色前，手机端不会显示订单、客户或生产数据。
          </Text>

          <View style={styles.pendingAccount}>
            <Text style={styles.panelLabel}>当前账号</Text>
            <Text style={styles.accountName}>
              {currentUser?.name || "-"} · {currentUser?.phone || "-"}
            </Text>
            <Text style={styles.pendingRoleText}>角色：普通用户</Text>
          </View>

          <View style={styles.registerField}>
            <Text style={styles.registerLabel}>后端 API 地址</Text>
            <TextInput
              style={styles.registerInput}
              value={apiDraft}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              onChangeText={onChangeApi}
              placeholder="http://电脑IP:3001/api"
              placeholderTextColor={iosPalette.placeholder}
            />
          </View>

          <View style={styles.pendingActions}>
            <Pressable style={styles.secondaryAction} onPress={onResetApi}>
              <Text style={styles.secondaryActionText}>自动地址</Text>
            </Pressable>
            <Pressable style={styles.primaryAction} onPress={onApplyApi}>
              <Text style={styles.primaryActionText}>连接</Text>
            </Pressable>
          </View>

          <Pressable
            style={[styles.registerButton, refreshing && styles.doneButtonDisabled]}
            onPress={onRefresh}
            disabled={refreshing}
          >
            <Text style={styles.doneButtonText}>{refreshing ? "检查中" : "检查授权状态"}</Text>
          </Pressable>
          <Pressable style={styles.pendingLogout} onPress={onLogout}>
            <Text style={styles.pendingLogoutText}>退出当前账号</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ProfileScreen({
  apiDraft,
  currentUser,
  currentRole,
  currentPassword,
  newPassword,
  confirmNewPassword,
  saving,
  onBack,
  onChangeApi,
  onApplyApi,
  onResetApi,
  onPickAvatar,
  onChangeCurrentPassword,
  onChangeNewPassword,
  onChangeConfirmNewPassword,
  onChangePassword,
  onLogout,
}) {
  const avatarLetter = (currentUser?.name || "员").trim().slice(0, 1) || "员";
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.profileWrap}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.profileScroll}
        >
          <View style={styles.profileHeader}>
            <Pressable style={styles.profileBackButton} onPress={onBack}>
              <Text style={styles.secondaryActionText}>返回主页</Text>
            </Pressable>
            <Text style={styles.profileTitle}>员工信息</Text>
            <Text style={styles.profileSubtitle}>管理头像、连接地址和登录密码。</Text>
          </View>

          <View style={styles.profileCard}>
            <Pressable style={styles.profileAvatar} onPress={onPickAvatar} disabled={saving}>
              {currentUser?.avatar ? (
                <Image source={{ uri: currentUser.avatar }} style={styles.profileAvatarImage} />
              ) : (
                <Text style={styles.profileAvatarText}>{avatarLetter}</Text>
              )}
            </Pressable>
            <Text style={styles.profileName}>{currentUser?.name || "-"}</Text>
            <Text style={styles.profileMeta}>
              {roleLabel(currentRole)} · {currentUser?.phone || "-"}
            </Text>
            <Pressable
              style={[styles.profileUploadButton, saving && styles.doneButtonDisabled]}
              onPress={onPickAvatar}
              disabled={saving}
            >
              <Text style={styles.secondaryActionText}>
                {currentUser?.avatar ? "更换头像" : "上传头像"}
              </Text>
            </Pressable>
          </View>

          <View style={styles.profileSection}>
            <Text style={styles.panelLabel}>API 连接设置</Text>
            <TextInput
              style={styles.apiInput}
              value={apiDraft}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              onChangeText={onChangeApi}
              placeholder="http://电脑IP:3001/api"
              placeholderTextColor={iosPalette.placeholder}
            />
            <View style={styles.settingsActions}>
              <Pressable style={styles.secondaryAction} onPress={onResetApi}>
                <Text style={styles.secondaryActionText}>自动地址</Text>
              </Pressable>
              <Pressable style={styles.primaryAction} onPress={onApplyApi}>
                <Text style={styles.primaryActionText}>保存连接</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.profileSection}>
            <Text style={styles.panelLabel}>修改密码</Text>
            <TextInput
              style={styles.apiInput}
              value={currentPassword}
              secureTextEntry
              onChangeText={onChangeCurrentPassword}
              placeholder="当前密码"
              placeholderTextColor={iosPalette.placeholder}
            />
            <TextInput
              style={styles.apiInput}
              value={newPassword}
              secureTextEntry
              onChangeText={onChangeNewPassword}
              placeholder="新密码（至少 6 位）"
              placeholderTextColor={iosPalette.placeholder}
            />
            <TextInput
              style={styles.apiInput}
              value={confirmNewPassword}
              secureTextEntry
              onChangeText={onChangeConfirmNewPassword}
              placeholder="重复输入新密码"
              placeholderTextColor={iosPalette.placeholder}
            />
            <Pressable
              style={[styles.primaryAction, saving && styles.doneButtonDisabled]}
              onPress={onChangePassword}
              disabled={saving}
            >
              <Text style={styles.primaryActionText}>{saving ? "保存中" : "保存密码"}</Text>
            </Pressable>
          </View>

          <Pressable
            style={[styles.profileLogoutButton, saving && styles.doneButtonDisabled]}
            onPress={onLogout}
            disabled={saving}
          >
            <Text style={styles.profileLogoutText}>退出登录</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function WorkbenchPanel({ scheduledOrders, onOpenTask }) {
  return (
    <View style={styles.workbenchPanel}>
      <View style={styles.mobileSection}>
        <Text style={styles.panelLabel}>最近任务</Text>
        {scheduledOrders.slice(0, 8).map((order) => (
          <Pressable
            key={`${order._customerId}-${order.id}`}
            style={styles.compactRow}
            onPress={() => onOpenTask(order)}
          >
            <View style={styles.recentCostText}>
              <Text style={styles.recentCostName}>
                {order.orderNo || order.product || "未命名订单"}
              </Text>
              <Text style={styles.recentCostMeta}>
                {order._customerName} · 交期 {order.dueDate || "-"}
              </Text>
            </View>
            <StatusChip status={normalizeStatus(order.status)} />
          </Pressable>
        ))}
        {!scheduledOrders.length ? (
          <Text style={styles.stateText}>暂无待完成排产任务。</Text>
        ) : null}
      </View>
    </View>
  );
}

function ReminderPanel({ reminders, offlineQueue, syncing, onSync, syncStatus, lastSyncAt }) {
  const failedCount = Object.values(syncStatus || {}).filter((s) => s === "failed").length;
  const pendingCount = offlineQueue.length - failedCount;
  const timeSinceLastSync = lastSyncAt ? formatElapsed(lastSyncAt) : null;

  return (
    <View style={styles.mobileSection}>
      <View style={styles.sectionHeadRow}>
        <Text style={styles.panelLabel}>消息提醒</Text>
        {offlineQueue.length ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {failedCount > 0 && (
              <Text style={{ color: iosPalette.danger, fontSize: 12, fontWeight: "600" }}>
                {failedCount} 条失败
              </Text>
            )}
            <Pressable style={styles.secondaryAction} onPress={onSync} disabled={syncing}>
              <Text style={styles.secondaryActionText}>
                {syncing ? "同步中…" : `同步 (${pendingCount}条)`}
              </Text>
            </Pressable>
          </View>
        ) : timeSinceLastSync ? (
          <Text style={{ color: iosPalette.muted, fontSize: 11 }}>
            上次同步 {timeSinceLastSync}
          </Text>
        ) : null}
      </View>
      {reminders.map((item) => (
        <View
          key={item.id}
          style={[
            styles.reminderCard,
            item.tone === "danger" && styles.reminderDanger,
            item.tone === "warning" && styles.reminderWarning,
          ]}
        >
          <Text style={styles.reminderTitle}>{item.title}</Text>
          <Text style={styles.reminderText}>{item.text}</Text>
        </View>
      ))}
      {!reminders.length ? <Text style={styles.stateText}>暂无新的提醒。</Text> : null}
    </View>
  );
}

function DeliveryCard({ delivery, expanded, saving, onToggle, onSign }) {
  const items = getDeliveryGroupSignItems(delivery);
  const signedCount = items.filter((item) => item.signed).length;
  const unsignedCount = items.length - signedCount;
  const fullySigned = items.length > 0 && signedCount === items.length;
  const partiallySigned = signedCount > 0 && !fullySigned;
  const status = fullySigned ? "已签收" : partiallySigned ? "部分签收" : "未送";
  const signHistory = Array.isArray(delivery.signHistory) ? delivery.signHistory : [];

  return (
    <View style={styles.orderCard}>
      <Pressable style={styles.deliveryCardPressArea} onPress={() => onToggle(delivery.id)}>
        <View style={styles.cardTopRow}>
          <View style={styles.cardTitleWrap}>
            <Text style={styles.orderNo}>{delivery.deliveryNo || delivery.id}</Text>
            <Text style={styles.customerName}>
              {delivery._customerName} · {items.length} 条明细
            </Text>
          </View>
          <StatusChip status={status} />
        </View>
        <View style={styles.deliveryProgressTrack}>
          <View
            style={[
              styles.deliveryProgressFill,
              { width: `${items.length ? (signedCount / items.length) * 100 : 0}%` },
            ]}
          />
        </View>
        <View style={styles.metaGrid}>
          <Meta label="送货日期" value={delivery.date || "-"} />
          <Meta label="已签收" value={`${signedCount}/${items.length}`} />
          <Meta label="未签收" value={`${unsignedCount}`} />
        </View>
        <Text style={styles.deliveryExpandHint}>{expanded ? "收起明细" : "点击展开全部明细"}</Text>
      </Pressable>

      {expanded ? (
        <View style={styles.deliveryExpandedArea}>
          <View style={styles.deliveryItemList}>
            {items.map((item) => (
              <View key={item.id} style={styles.deliveryItemRow}>
                <View style={styles.deliveryItemMain}>
                  <Text style={styles.deliveryItemTitle}>{item.label}</Text>
                  <Text style={styles.deliveryItemMeta}>
                    数量 {formatNumber(item.quantity)} {item.unit || ""}
                    {item.signedAt ? ` · ${formatDateTime(item.signedAt)}` : ""}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.deliveryItemStatus,
                    item.signed ? styles.deliveryItemStatusDone : styles.deliveryItemStatusPending,
                  ]}
                >
                  {item.signed ? "已签收" : "未签收"}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.deliveryHistoryBox}>
            <Text style={styles.deliveryHistoryTitle}>签收历史</Text>
            {signHistory.length ? (
              signHistory.map((entry, index) => (
                <View
                  key={entry.id || `${entry.signedAt}-${index}`}
                  style={styles.deliveryHistoryRow}
                >
                  <Text style={styles.deliveryHistoryMain}>
                    {entry.signedBy || entry.signedUserName || "签收人"} ·{" "}
                    {(entry.itemIds || []).length || 1} 条
                  </Text>
                  <Text style={styles.deliveryHistoryMeta}>
                    {formatDateTime(entry.signedAt)}
                    {entry.note ? ` · ${entry.note}` : ""}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={styles.deliveryHistoryEmpty}>暂无签收记录。</Text>
            )}
          </View>
        </View>
      ) : null}

      <View style={styles.metaGrid}>
        <Meta label="最近签收人" value={signHistory[0]?.signedBy || delivery.signedBy || "-"} />
        <Meta
          label="最近签收时间"
          value={formatDateTime(signHistory[0]?.signedAt || delivery.signedAt)}
        />
      </View>
      <View style={styles.cardActions}>
        <Pressable
          style={[styles.doneButton, saving && styles.doneButtonDisabled]}
          onPress={() => onSign(delivery)}
          disabled={saving || fullySigned}
        >
          <Text style={styles.doneButtonText}>
            {saving ? "保存中" : fullySigned ? "已签收" : partiallySigned ? "继续签收" : "签收"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function CostApprovalCard({ entry, note, onChangeNote, onApprove, onReject }) {
  return (
    <View style={styles.orderCard}>
      <View style={styles.cardTopRow}>
        <View style={styles.cardTitleWrap}>
          <Text style={styles.orderNo}>{entry.materialName || "未命名物料"}</Text>
          <Text style={styles.customerName}>
            {entry._customerName} · {entry.enteredBy || "手机端"}
          </Text>
        </View>
        <Text style={styles.costAmountText}>{formatMoney(entry.amount)}</Text>
      </View>
      <View style={styles.metaGrid}>
        <Meta label="数量" value={`${entry.quantity || 0} ${entry.unit || ""}`} />
        <Meta label="单价" value={formatMoney(entry.unitCost)} />
        <Meta label="录入时间" value={formatDateTime(entry.enteredAt || entry.date)} />
      </View>
      <TextInput
        style={[styles.completionInput, styles.approvalNoteInput]}
        value={note}
        onChangeText={onChangeNote}
        placeholder="审批备注（可选）"
        placeholderTextColor={iosPalette.placeholder}
      />
      <View style={styles.cardActions}>
        <Pressable style={styles.lightButton} onPress={onReject}>
          <Text style={styles.lightButtonText}>拒绝</Text>
        </Pressable>
        <Pressable style={styles.doneButton} onPress={onApprove}>
          <Text style={styles.doneButtonText}>通过</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ManagementDashboard({ summary, customers }) {
  const topCustomers = [...customers]
    .map((customer) => ({
      id: customer.id,
      name: customer.name,
      amount: (customer.orders || []).reduce(
        (sum, order) => sum + parseMobileNumber(order.amount),
        0,
      ),
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8);

  return (
    <View style={styles.workbenchPanel}>
      <View style={styles.workbenchHero}>
        <Text style={styles.eyebrow}>MANAGEMENT</Text>
        <Text style={styles.costTitle}>管理层看板</Text>
        <Text style={styles.costHint}>手机端查看订单、回款、送货签收和成本审批的关键指标。</Text>
      </View>
      <View style={styles.actionGrid}>
        <MetricTile label="订单额" value={formatMoney(summary.orderAmount)} />
        <MetricTile label="已付金额" value={formatMoney(summary.paidAmount)} />
        <MetricTile label="待审成本" value={formatMoney(summary.pendingCostAmount)} />
        <MetricTile label="已审成本" value={formatMoney(summary.approvedCostAmount)} />
        <MetricTile label="未完成" value={summary.scheduled} />
        <MetricTile label="已完成" value={summary.completed} />
      </View>
      <View style={styles.mobileSection}>
        <Text style={styles.panelLabel}>客户订单额排行</Text>
        {topCustomers.map((customer) => (
          <View key={customer.id} style={styles.compactRow}>
            <Text style={styles.recentCostName}>{customer.name}</Text>
            <Text style={styles.costAmountText}>{formatMoney(customer.amount)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function MetricTile({ label, value }) {
  return (
    <View style={styles.actionTile}>
      <Text style={styles.actionTileValue}>{value}</Text>
      <Text style={styles.actionTileLabel}>{label}</Text>
    </View>
  );
}

function CostEntryPanel({
  customers,
  selectedCustomer,
  selectedCustomerId,
  materialOptions,
  selectedMaterialKey,
  selectedMaterial,
  quantity,
  note,
  photo,
  amount,
  saving,
  recentEntries,
  onSelectCustomer,
  onSelectMaterial,
  onChangeQuantity,
  onChangeNote,
  onTakePhoto,
  onClearPhoto,
  onSubmit,
}) {
  const hasMaterials = materialOptions.length > 0;
  const photoUri = getPhotoUri(photo);
  const hasVisiblePrice = selectedMaterial?.unitCost !== "" && selectedMaterial?.unitCost != null;

  return (
    <View style={styles.costPanel}>
      <View style={styles.costHero}>
        <Text style={styles.eyebrow}>COST ENTRY</Text>
        <Text style={styles.costTitle}>成本管理专区</Text>
        <Text style={styles.costHint}>
          选择电脑端维护的物料，填写数量并现场拍照，提交后电脑端成本录入表会同步显示。
        </Text>
      </View>

      <View style={styles.completionField}>
        <Text style={styles.completionLabel}>客户</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.customerChips}
        >
          {customers.map((customer) => (
            <Pressable
              key={customer.id}
              style={[
                styles.customerChip,
                selectedCustomerId === customer.id && styles.customerChipActive,
              ]}
              onPress={() => onSelectCustomer(customer.id)}
              disabled={saving}
            >
              <Text
                style={[
                  styles.customerChipText,
                  selectedCustomerId === customer.id && styles.customerChipTextActive,
                ]}
              >
                {customer.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {selectedCustomer ? (
        <View style={styles.costCard}>
          <View style={styles.costCardHead}>
            <View>
              <Text style={styles.panelLabel}>当前客户</Text>
              <Text style={styles.accountName}>{selectedCustomer.name}</Text>
            </View>
            <Text style={styles.costCount}>{materialOptions.length} 个物料</Text>
          </View>

          {hasMaterials ? (
            <>
              <View style={styles.completionField}>
                <Text style={styles.completionLabel}>物料</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.materialChips}
                >
                  {materialOptions.map((material, index) => {
                    const key = materialOptionKey(material, index);
                    const active = key === selectedMaterialKey;
                    return (
                      <Pressable
                        key={key}
                        style={[styles.materialChip, active && styles.materialChipActive]}
                        onPress={() => onSelectMaterial(key)}
                        disabled={saving}
                      >
                        <Text
                          style={[styles.materialChipName, active && styles.materialChipNameActive]}
                        >
                          {material.materialName || "未命名物料"}
                        </Text>
                        <Text
                          style={[
                            styles.materialChipPrice,
                            active && styles.materialChipPriceActive,
                          ]}
                        >
                          {material.unitCost !== "" && material.unitCost != null
                            ? `${formatMoney(material.unitCost)} / ${material.unit || "-"}`
                            : `单位 ${material.unit || "-"}`}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              <View style={styles.costSummary}>
                <Meta
                  label="成本单价"
                  value={
                    hasVisiblePrice
                      ? `${formatMoney(selectedMaterial?.unitCost)} / ${selectedMaterial?.unit || "-"}`
                      : "后台按物料档案计算"
                  }
                />
                <Meta
                  label="成本金额"
                  value={hasVisiblePrice ? formatMoney(amount) : "提交后后台计算"}
                />
              </View>

              <View style={styles.completionField}>
                <Text style={styles.completionLabel}>数量</Text>
                <TextInput
                  style={styles.completionInput}
                  value={quantity}
                  onChangeText={onChangeQuantity}
                  keyboardType="decimal-pad"
                  placeholder="请输入数量"
                  placeholderTextColor={iosPalette.placeholder}
                  editable={!saving}
                />
              </View>

              <View style={styles.completionField}>
                <Text style={styles.completionLabel}>备注</Text>
                <TextInput
                  style={[styles.completionInput, styles.completionTextarea]}
                  value={note}
                  onChangeText={onChangeNote}
                  placeholder="例如：本批次入库、消耗、采购说明"
                  placeholderTextColor={iosPalette.placeholder}
                  multiline
                  editable={!saving}
                />
              </View>

              <View style={styles.completionField}>
                <Text style={styles.completionLabel}>照片证明</Text>
                {photoUri ? (
                  <View style={styles.photoPreviewWrap}>
                    <Image source={{ uri: photoUri }} style={styles.photoPreview} />
                    <Pressable style={styles.lightButton} onPress={onClearPhoto} disabled={saving}>
                      <Text style={styles.lightButtonText}>删除照片</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Text style={styles.photoHint}>每次物料录入必须拍照上传，不能空提交。</Text>
                )}
                <Pressable style={styles.photoButton} onPress={onTakePhoto} disabled={saving}>
                  <Text style={styles.photoButtonText}>{photoUri ? "重新拍照" : "拍照上传"}</Text>
                </Pressable>
              </View>

              <Pressable
                style={[
                  styles.costSubmitButton,
                  (saving || !photoUri) && styles.doneButtonDisabled,
                ]}
                onPress={onSubmit}
                disabled={saving || !photoUri}
              >
                <Text style={styles.doneButtonText}>{saving ? "保存中" : "提交成本记录"}</Text>
              </Pressable>
            </>
          ) : (
            <View style={styles.costEmptyBox}>
              <Text style={styles.emptyTitle}>暂无物料档案</Text>
              <Text style={styles.stateText}>
                请先在电脑端进入该客户的“物料档案”，添加物料名称和成本价格。
              </Text>
            </View>
          )}
        </View>
      ) : (
        <View style={styles.costEmptyBox}>
          <Text style={styles.emptyTitle}>暂无客户</Text>
          <Text style={styles.stateText}>电脑端添加客户和物料后，手机端刷新即可录入成本。</Text>
        </View>
      )}

      {recentEntries.length ? (
        <View style={styles.recentCostList}>
          <Text style={styles.panelLabel}>最近成本记录</Text>
          {recentEntries.map((entry) => (
            <View
              key={entry.id || `${entry.materialName}-${entry.enteredAt || entry.date}`}
              style={styles.recentCostRow}
            >
              <View style={styles.recentCostText}>
                <Text style={styles.recentCostName}>{entry.materialName || "-"}</Text>
                <Text style={styles.recentCostMeta}>
                  {entry.quantity || 0} {entry.unit || ""} · {formatMoney(entry.amount)} ·{" "}
                  {formatDateTime(entry.enteredAt || entry.date)}
                </Text>
              </View>
              {getPhotoUri(entry.photo) ? (
                <Image source={{ uri: getPhotoUri(entry.photo) }} style={styles.recentCostPhoto} />
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function StatCard({ label, value, tone }) {
  return (
    <View style={[styles.statCard, styles[`statCard_${tone}`]]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function AppTopBar({ title, currentUser, currentRole, onAvatarPress }) {
  const avatarText =
    String(currentUser?.name || currentUser?.phone || "员")
      .trim()
      .slice(0, 1) || "员";

  return (
    <View style={styles.topBar}>
      <View style={styles.topBarTitleWrap}>
        <Text style={styles.topBarTitle}>{title}</Text>
        <Text style={styles.topBarSubtitle}>{roleLabel(currentRole)} · 移动端</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="打开员工信息"
        style={styles.avatarButton}
        onPress={onAvatarPress}
      >
        {currentUser?.avatar ? (
          <Image source={{ uri: currentUser.avatar }} style={styles.avatarImage} />
        ) : (
          <Text style={styles.avatarInitial}>{avatarText}</Text>
        )}
      </Pressable>
    </View>
  );
}

function BottomTabBar({ tabs, activeView, onChange }) {
  return (
    <View style={styles.bottomTabsWrap}>
      <View style={styles.bottomTabs}>
        {tabs.map((tab) => {
          const active = tab.key === activeView;
          return (
            <Pressable
              key={tab.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={[styles.bottomTab, active && styles.bottomTabActive]}
              onPress={() => onChange(tab.key)}
            >
              <BottomTabIcon name={tab.icon} active={active} />
              <Text
                numberOfLines={1}
                style={[styles.bottomTabLabel, active && styles.bottomTabLabelActive]}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function BottomTabIcon({ name, active }) {
  const color = active ? iosPalette.accent : iosPalette.muted;
  const softColor = active ? iosPalette.accentSoft : iosPalette.grouped;

  if (name === "workbench") {
    return (
      <View style={styles.bottomTabIconWrap}>
        <View style={styles.tabIconGrid}>
          {[0, 1, 2, 3].map((item) => (
            <View key={item} style={[styles.tabIconTile, { backgroundColor: color }]} />
          ))}
        </View>
      </View>
    );
  }

  if (name === "alerts") {
    return (
      <View style={styles.bottomTabIconWrap}>
        <View style={[styles.tabIconCircle, { borderColor: color, backgroundColor: softColor }]}>
          <Text style={[styles.tabIconGlyph, { color }]}>!</Text>
        </View>
      </View>
    );
  }

  if (name === "schedule") {
    return (
      <View style={styles.bottomTabIconWrap}>
        <View style={[styles.tabIconCalendar, { borderColor: color }]}>
          <View style={[styles.tabIconCalendarTop, { backgroundColor: color }]} />
          <View style={styles.tabIconCalendarDots}>
            {[0, 1, 2, 3].map((item) => (
              <View key={item} style={[styles.tabIconDot, { backgroundColor: color }]} />
            ))}
          </View>
        </View>
      </View>
    );
  }

  if (name === "delivery") {
    return (
      <View style={styles.bottomTabIconWrap}>
        <View style={[styles.tabIconCircle, { borderColor: color }]}>
          <Text style={[styles.tabIconGlyph, styles.tabIconCheck, { color }]}>✓</Text>
        </View>
      </View>
    );
  }

  if (name === "cost") {
    return (
      <View style={styles.bottomTabIconWrap}>
        <View style={[styles.tabIconCoin, { borderColor: color, backgroundColor: softColor }]}>
          <Text style={[styles.tabIconGlyph, { color }]}>¥</Text>
        </View>
      </View>
    );
  }

  if (name === "dashboard") {
    return (
      <View style={styles.bottomTabIconWrap}>
        <View style={styles.tabIconBars}>
          {[10, 16, 7].map((height, index) => (
            <View
              key={`${height}-${index}`}
              style={[styles.tabIconBar, { height, backgroundColor: color }]}
            />
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.bottomTabIconWrap}>
      <View style={[styles.tabIconApproval, { borderColor: color, backgroundColor: softColor }]}>
        <Text style={[styles.tabIconGlyph, styles.tabIconCheck, { color }]}>✓</Text>
      </View>
    </View>
  );
}

function ScheduleOrderGroupCard({ group, expanded, onToggle }) {
  const totalQuantity = group.orders.reduce(
    (sum, order) => sum + parseMobileNumber(order.productionQuantity || order.quantity),
    0,
  );
  const firstOrder = group.orders[0] || {};
  const scheduleDate = firstOrder.productionDate || firstOrder.dueDate || "";

  return (
    <Pressable style={styles.scheduleGroupCard} onPress={() => onToggle(group.key)}>
      <View style={styles.scheduleGroupHeader}>
        <View style={styles.scheduleGroupTitleWrap}>
          <Text style={styles.scheduleGroupTitle}>{group.orderNo}</Text>
          <Text style={styles.scheduleGroupMeta}>
            {group.customerName} · {group.orders.length} 条明细
          </Text>
        </View>
        <View style={styles.scheduleGroupBadge}>
          <Text style={styles.scheduleGroupBadgeText}>{expanded ? "收起" : "展开"}</Text>
        </View>
      </View>
      <View style={styles.scheduleGroupSummary}>
        <Meta label="排产数量" value={formatNumber(totalQuantity)} />
        <Meta label="排产日期" value={scheduleDate || "-"} />
        <Meta label="产品" value={firstOrder.product || "-"} />
      </View>
    </Pressable>
  );
}

function OrderCard({ order, saving, customers, displayFieldOptions, onOpen, onComplete }) {
  const status = normalizeStatus(order.status);
  const canComplete = status !== "已完成";
  const displayFields = buildCustomerDisplayFields(
    order,
    customers,
    displayFieldOptions || [],
    "card",
  );
  const visibleFields = getOrderDisplayFields(order, displayFields);

  return (
    <Pressable style={styles.orderCard} onPress={() => onOpen(order)}>
      {visibleFields.length > 0 ? (
        <View style={styles.orderMetaList}>
          {visibleFields.map((fieldConfig) => (
            <Meta
              key={fieldConfig.field}
              label={fieldConfig.label}
              value={formatMobileFieldValue(order, fieldConfig)}
              variant="row"
              valueNumberOfLines={null}
            />
          ))}
        </View>
      ) : (
        <Text style={styles.cardEmptyHint}>请联系管理员在电脑端设置手机端卡片字段</Text>
      )}

      <View style={styles.cardActions}>
        <Pressable style={styles.lightButton} onPress={() => onOpen(order)}>
          <Text style={styles.lightButtonText}>详情</Text>
        </Pressable>
        <Pressable
          style={[styles.doneButton, (!canComplete || saving) && styles.doneButtonDisabled]}
          onPress={() => canComplete && !saving && onComplete(order)}
          disabled={!canComplete || saving}
        >
          <Text style={styles.doneButtonText}>
            {saving ? "更新中" : canComplete ? "标记已完成" : "已完成"}
          </Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

function Meta({ label, value, variant = "tile", valueNumberOfLines = 1 }) {
  const isRow = variant === "row";
  const valueLineProps = valueNumberOfLines ? { numberOfLines: valueNumberOfLines } : {};

  return (
    <View style={isRow ? styles.orderMetaRow : styles.metaItem}>
      <Text style={isRow ? styles.orderMetaLabel : styles.metaLabel}>{label}</Text>
      <Text style={isRow ? styles.orderMetaValue : styles.metaValue} {...valueLineProps}>
        {value}
      </Text>
    </View>
  );
}

function StatusChip({ status }) {
  const pending = status === "未完成";
  const deliveryPending = status === "未送";
  const scheduled = status === "已排产";
  const completed = status === "已完成";
  const deliveryOpened = status === "已开送货单";
  const partialDelivered = status === "部分送货" || status === "部分签收";
  const delivered = status === "已送货" || status === "已签收";
  const reconciled = status === "已开对账单";
  const paid = status === "已付款";
  const issue = status === "异常";
  return (
    <View
      style={[
        styles.statusChip,
        pending && styles.statusPending,
        deliveryPending && styles.statusPending,
        scheduled && styles.statusScheduled,
        completed && styles.statusCompleted,
        deliveryOpened && styles.statusDeliveryOpened,
        partialDelivered && styles.statusPartialDelivered,
        delivered && styles.statusDelivered,
        reconciled && styles.statusReconciled,
        paid && styles.statusPaid,
        issue && styles.statusIssue,
      ]}
    >
      <Text
        style={[
          styles.statusText,
          pending && styles.statusPendingText,
          deliveryPending && styles.statusPendingText,
          scheduled && styles.statusScheduledText,
          completed && styles.statusCompletedText,
          deliveryOpened && styles.statusDeliveryOpenedText,
          partialDelivered && styles.statusPartialDeliveredText,
          delivered && styles.statusDeliveredText,
          reconciled && styles.statusReconciledText,
          paid && styles.statusPaidText,
          issue && styles.statusIssueText,
        ]}
      >
        {status}
      </Text>
    </View>
  );
}

function OrderDetailModal({ order, saving, customers, displayFieldOptions, onClose, onComplete }) {
  const visibleDetailFields = useMemo(
    () =>
      getOrderDisplayFields(
        order,
        buildCustomerDisplayFields(order, customers, displayFieldOptions || [], "detail"),
      ),
    [customers, displayFieldOptions, order],
  );

  return (
    <Modal
      visible={Boolean(order)}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.modalSafeArea}>
        {order ? (
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.eyebrow}>ORDER DETAIL</Text>
                <Text style={styles.modalTitle}>订单详情</Text>
              </View>
              <Pressable style={styles.closeButton} onPress={onClose}>
                <Text style={styles.closeButtonText}>关闭</Text>
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.detailList}>
              {visibleDetailFields.length ? (
                visibleDetailFields.map((fieldConfig) => (
                  <DetailRow
                    key={fieldConfig.field}
                    label={fieldConfig.label}
                    value={formatMobileFieldValue(order, fieldConfig)}
                    multiline={String(order?.[fieldConfig.field] ?? "").length > 28}
                  />
                ))
              ) : (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>暂无详情字段</Text>
                  <Text style={styles.detailValue}>请联系管理员在电脑端设置手机端详情字段。</Text>
                </View>
              )}
            </ScrollView>

            <Pressable
              style={[
                styles.modalDoneButton,
                (normalizeStatus(order.status) === "已完成" || saving) && styles.doneButtonDisabled,
              ]}
              onPress={() =>
                normalizeStatus(order.status) !== "已完成" && !saving && onComplete(order)
              }
              disabled={normalizeStatus(order.status) === "已完成" || saving}
            >
              <Text style={styles.doneButtonText}>{saving ? "更新中" : "标记已完成"}</Text>
            </Pressable>
          </View>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

function CompletionModal({
  order,
  operator,
  note,
  photo,
  saving,
  onChangeOperator,
  onChangeNote,
  onTakePhoto,
  onClearPhoto,
  onCancel,
  onSubmit,
}) {
  return (
    <Modal visible={Boolean(order)} animationType="fade" transparent onRequestClose={onCancel}>
      <View style={styles.completionBackdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.completionKeyboard}
        >
          <ScrollView
            style={styles.completionScroll}
            contentContainerStyle={styles.completionScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.completionCard}>
              <Text style={styles.eyebrow}>COMPLETE ORDER</Text>
              <Text style={styles.completionTitle}>
                {fieldText(order?.orderNo || order?.product || order?.id)}
              </Text>
              <Text style={styles.completionMeta}>{order?._customerName || ""}</Text>

              <View style={styles.completionField}>
                <Text style={styles.completionLabel}>完成人</Text>
                <TextInput
                  style={styles.completionInput}
                  value={operator}
                  onChangeText={onChangeOperator}
                  placeholder="填写操作人"
                  placeholderTextColor={iosPalette.placeholder}
                />
              </View>

              <View style={styles.completionField}>
                <Text style={styles.completionLabel}>完成备注</Text>
                <TextInput
                  style={[styles.completionInput, styles.completionTextarea]}
                  value={note}
                  onChangeText={onChangeNote}
                  placeholder="例如：手机端确认完成、员工备注"
                  placeholderTextColor={iosPalette.placeholder}
                  multiline
                />
              </View>

              <View style={styles.completionField}>
                <Text style={styles.completionLabel}>完成照片</Text>
                {photo?.uri ? (
                  <View style={styles.photoPreviewWrap}>
                    <Image source={{ uri: photo.uri }} style={styles.photoPreview} />
                    <Pressable style={styles.lightButton} onPress={onClearPhoto} disabled={saving}>
                      <Text style={styles.lightButtonText}>删除照片</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Text style={styles.photoHint}>必须拍照上传后才能确认完成。</Text>
                )}
                <Pressable style={styles.photoButton} onPress={onTakePhoto} disabled={saving}>
                  <Text style={styles.photoButtonText}>{photo?.uri ? "重新拍照" : "拍照上传"}</Text>
                </Pressable>
              </View>

              <View style={styles.completionActions}>
                <Pressable style={styles.lightButton} onPress={onCancel} disabled={saving}>
                  <Text style={styles.lightButtonText}>取消</Text>
                </Pressable>
                <Pressable
                  style={[styles.doneButton, (saving || !photo?.uri) && styles.doneButtonDisabled]}
                  onPress={onSubmit}
                  disabled={saving || !photo?.uri}
                >
                  <Text style={styles.doneButtonText}>{saving ? "保存中" : "确认完成"}</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function DeliverySignModal({
  delivery,
  signer,
  note,
  photo,
  saving,
  selectedItemIds = [],
  onChangeSigner,
  onChangeNote,
  onToggleItem,
  onTakePhoto,
  onClearPhoto,
  onCancel,
  onSubmit,
}) {
  const items = delivery ? getDeliveryGroupSignItems(delivery) : [];
  const unsignedItems = items.filter((item) => !item.signed);
  const selectedCount = selectedItemIds.length;
  const willFullySign = unsignedItems.length > 0 && selectedCount === unsignedItems.length;
  const canSubmit = Boolean(photo?.uri) && selectedCount > 0;

  return (
    <Modal visible={Boolean(delivery)} animationType="fade" transparent onRequestClose={onCancel}>
      <View style={styles.completionBackdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.completionKeyboard}
        >
          <ScrollView
            style={styles.completionScroll}
            contentContainerStyle={styles.completionScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.completionCard}>
              <Text style={styles.eyebrow}>DELIVERY SIGN</Text>
              <Text style={styles.completionTitle}>
                {fieldText(delivery?.deliveryNo || delivery?.id)}
              </Text>
              <Text style={styles.completionMeta}>
                {delivery?._customerName || ""} · 本次选择 {selectedCount} 条
              </Text>

              <View style={styles.completionField}>
                <Text style={styles.completionLabel}>选择签收明细</Text>
                <View style={styles.deliverySignItemList}>
                  {items.map((item) => {
                    const selected = selectedItemIds.includes(item.id);
                    return (
                      <Pressable
                        key={item.id}
                        style={[
                          styles.deliverySignItem,
                          selected && styles.deliverySignItemSelected,
                          item.signed && styles.deliverySignItemDisabled,
                        ]}
                        onPress={() => !item.signed && onToggleItem(item.id)}
                        disabled={saving || item.signed}
                      >
                        <View
                          style={[
                            styles.deliverySignCheck,
                            selected && styles.deliverySignCheckSelected,
                            item.signed && styles.deliverySignCheckDone,
                          ]}
                        >
                          <Text
                            style={[
                              styles.deliverySignCheckText,
                              (selected || item.signed) && styles.deliverySignCheckTextActive,
                            ]}
                          >
                            {item.signed ? "✓" : selected ? "✓" : ""}
                          </Text>
                        </View>
                        <View style={styles.deliverySignItemText}>
                          <Text style={styles.deliveryItemTitle}>{item.label}</Text>
                          <Text style={styles.deliveryItemMeta}>
                            数量 {formatNumber(item.quantity)} {item.unit || ""}
                            {item.signedAt ? ` · 已签 ${formatDateTime(item.signedAt)}` : ""}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
                {!unsignedItems.length ? (
                  <Text style={styles.deliveryHistoryEmpty}>这张送货单已全部签收。</Text>
                ) : null}
              </View>

              <View style={styles.completionField}>
                <Text style={styles.completionLabel}>签收人</Text>
                <TextInput
                  style={styles.completionInput}
                  value={signer}
                  onChangeText={onChangeSigner}
                  placeholder="填写客户或收货人姓名"
                  placeholderTextColor={iosPalette.placeholder}
                />
              </View>

              <View style={styles.completionField}>
                <Text style={styles.completionLabel}>签收备注</Text>
                <TextInput
                  style={[styles.completionInput, styles.completionTextarea]}
                  value={note}
                  onChangeText={onChangeNote}
                  placeholder="例如：货物已收、数量无误"
                  placeholderTextColor={iosPalette.placeholder}
                  multiline
                />
              </View>

              <View style={styles.completionField}>
                <Text style={styles.completionLabel}>签收照片</Text>
                {photo?.uri ? (
                  <View style={styles.photoPreviewWrap}>
                    <Image source={{ uri: photo.uri }} style={styles.photoPreview} />
                    <Pressable style={styles.lightButton} onPress={onClearPhoto} disabled={saving}>
                      <Text style={styles.lightButtonText}>删除照片</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Text style={styles.photoHint}>必须拍照上传后才能确认签收。</Text>
                )}
                <Pressable style={styles.photoButton} onPress={onTakePhoto} disabled={saving}>
                  <Text style={styles.photoButtonText}>{photo?.uri ? "重新拍照" : "拍照上传"}</Text>
                </Pressable>
              </View>

              {delivery?.signHistory?.length ? (
                <View style={styles.deliveryHistoryBox}>
                  <Text style={styles.deliveryHistoryTitle}>签收历史</Text>
                  {delivery.signHistory.slice(0, 3).map((entry, index) => (
                    <View
                      key={entry.id || `${entry.signedAt}-${index}`}
                      style={styles.deliveryHistoryRow}
                    >
                      <Text style={styles.deliveryHistoryMain}>
                        {entry.signedBy || entry.signedUserName || "签收人"} ·{" "}
                        {(entry.itemIds || []).length || 1} 条
                      </Text>
                      <Text style={styles.deliveryHistoryMeta}>
                        {formatDateTime(entry.signedAt)}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}

              <View style={styles.completionActions}>
                <Pressable style={styles.lightButton} onPress={onCancel} disabled={saving}>
                  <Text style={styles.lightButtonText}>取消</Text>
                </Pressable>
                <Pressable
                  style={[styles.doneButton, (saving || !canSubmit) && styles.doneButtonDisabled]}
                  onPress={onSubmit}
                  disabled={saving || !canSubmit}
                >
                  <Text style={styles.doneButtonText}>
                    {saving ? "保存中" : willFullySign ? "确认签收" : "确认部分签收"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function DetailRow({ label, value, multiline = false }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, multiline && styles.detailValueMultiline]}>{value}</Text>
    </View>
  );
}

function LoadingState({ label = "正在加载订单..." }) {
  return (
    <View style={styles.stateBox}>
      <ActivityIndicator color={iosPalette.accent} />
      <Text style={styles.stateText}>{label}</Text>
    </View>
  );
}

function EmptyState({ title = "没有订单", text = "当前筛选条件下没有需要显示的订单。" }) {
  return (
    <View style={styles.stateBox}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.stateText}>{text}</Text>
    </View>
  );
}

const legacyStyles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#07111f",
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  eyebrow: {
    color: "#42e8ff",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0,
  },
  title: {
    marginTop: 4,
    color: "#f4fbff",
    fontSize: 28,
    fontWeight: "800",
  },
  userBadge: {
    marginTop: 6,
    color: "#9eb3c8",
    fontSize: 12,
    fontWeight: "700",
  },
  settingsButton: {
    height: 36,
    justifyContent: "center",
    borderRadius: 8,
    paddingHorizontal: 14,
    backgroundColor: "#132036",
    borderWidth: 1,
    borderColor: "#263a5c",
  },
  settingsButtonText: {
    color: "#d9f4ff",
    fontWeight: "700",
  },
  settingsPanel: {
    gap: 10,
    marginBottom: 14,
    borderRadius: 8,
    padding: 12,
    backgroundColor: "#101827",
    borderWidth: 1,
    borderColor: "#243755",
  },
  accountPanel: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    borderRadius: 8,
    padding: 10,
    backgroundColor: "#081223",
    borderWidth: 1,
    borderColor: "#243755",
  },
  accountName: {
    marginTop: 4,
    color: "#f4fbff",
    fontSize: 14,
    fontWeight: "900",
  },
  panelLabel: {
    color: "#9eb3c8",
    fontSize: 13,
    fontWeight: "700",
  },
  apiInput: {
    minHeight: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2f456a",
    paddingHorizontal: 12,
    color: "#f4fbff",
    backgroundColor: "#081223",
  },
  settingsActions: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-end",
  },
  displayFieldPanel: {
    gap: 10,
    marginTop: 2,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#243755",
  },
  displayFieldHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  displayFieldActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  resetFieldsText: {
    color: "#42e8ff",
    fontSize: 12,
    fontWeight: "800",
  },
  displayFieldChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  displayFieldChip: {
    minHeight: 32,
    justifyContent: "center",
    borderRadius: 999,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#2f456a",
    backgroundColor: "#081223",
  },
  displayFieldChipActive: {
    borderColor: "#42e8ff",
    backgroundColor: "#143149",
  },
  displayFieldChipText: {
    color: "#9eb3c8",
    fontSize: 12,
    fontWeight: "800",
  },
  displayFieldChipTextActive: {
    color: "#eafcff",
  },
  primaryAction: {
    height: 38,
    justifyContent: "center",
    borderRadius: 8,
    paddingHorizontal: 16,
    backgroundColor: "#42e8ff",
  },
  primaryActionText: {
    color: "#05101d",
    fontWeight: "800",
  },
  secondaryAction: {
    height: 38,
    justifyContent: "center",
    borderRadius: 8,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#2f456a",
  },
  secondaryActionText: {
    color: "#d9f4ff",
    fontWeight: "700",
  },
  registerWrap: {
    flex: 1,
    backgroundColor: "#07111f",
  },
  registerScroll: {
    flexGrow: 1,
    justifyContent: "center",
    gap: 18,
    padding: 18,
  },
  registerHero: {
    gap: 8,
    paddingHorizontal: 2,
  },
  registerKicker: {
    color: "#42e8ff",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  registerCard: {
    gap: 14,
    borderRadius: 20,
    padding: 18,
    backgroundColor: "#0d1829",
    borderWidth: 1,
    borderColor: "#284466",
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
  },
  registerTitle: {
    color: "#f4fbff",
    fontSize: 30,
    fontWeight: "900",
  },
  registerHint: {
    color: "#9eb3c8",
    fontSize: 14,
    lineHeight: 22,
  },
  registerField: {
    gap: 7,
  },
  registerLabel: {
    color: "#c7d7ea",
    fontSize: 13,
    fontWeight: "800",
  },
  registerInput: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2c4263",
    paddingHorizontal: 14,
    color: "#f4fbff",
    backgroundColor: "#081223",
    fontSize: 15,
  },
  registerNotice: {
    gap: 4,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#2b6f8f",
    backgroundColor: "#0b2738",
  },
  registerNoticeTitle: {
    color: "#dff8ff",
    fontSize: 13,
    fontWeight: "900",
  },
  registerNoticeText: {
    color: "#9eb3c8",
    fontSize: 12,
    lineHeight: 18,
  },
  registerButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    marginTop: 2,
    backgroundColor: "#2ed47a",
  },
  pendingWrap: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 18,
  },
  pendingCard: {
    gap: 16,
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: "#284466",
    backgroundColor: "#0d1829",
  },
  pendingIcon: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#d29922",
    backgroundColor: "#2c210d",
  },
  pendingIconText: {
    color: "#ffd166",
    fontSize: 30,
    fontWeight: "900",
  },
  pendingTitle: {
    color: "#f4fbff",
    fontSize: 26,
    fontWeight: "900",
  },
  pendingText: {
    color: "#9eb3c8",
    fontSize: 14,
    lineHeight: 22,
  },
  pendingAccount: {
    gap: 4,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#243755",
    backgroundColor: "#081223",
  },
  pendingRoleText: {
    color: "#ffd166",
    fontSize: 13,
    fontWeight: "800",
  },
  pendingActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  pendingLogout: {
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  pendingLogoutText: {
    color: "#9eb3c8",
    fontWeight: "800",
  },
  workbenchPanel: {
    gap: 14,
  },
  workbenchHero: {
    gap: 7,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#2d8cff",
    backgroundColor: "#0c2442",
  },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  actionTile: {
    flexGrow: 1,
    flexBasis: "45%",
    minHeight: 86,
    justifyContent: "center",
    borderRadius: 14,
    padding: 14,
    backgroundColor: "#101827",
    borderWidth: 1,
    borderColor: "#22334d",
  },
  actionTileValue: {
    color: "#f4fbff",
    fontSize: 22,
    fontWeight: "900",
  },
  actionTileLabel: {
    marginTop: 5,
    color: "#9eb3c8",
    fontSize: 12,
    fontWeight: "800",
  },
  mobileSection: {
    gap: 10,
    borderRadius: 14,
    padding: 14,
    backgroundColor: "#0d1829",
    borderWidth: 1,
    borderColor: "#22334d",
  },
  sectionHeadRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  compactRow: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    borderRadius: 10,
    padding: 10,
    backgroundColor: "#081223",
    borderWidth: 1,
    borderColor: "#1c2d46",
  },
  reminderCard: {
    gap: 4,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#2f456a",
    backgroundColor: "#081223",
  },
  reminderDanger: {
    borderColor: iosPalette.danger,
    backgroundColor: "#35161b",
  },
  reminderWarning: {
    borderColor: "#d29922",
    backgroundColor: "#2c210d",
  },
  reminderTitle: {
    color: "#f4fbff",
    fontSize: 14,
    fontWeight: "900",
  },
  reminderText: {
    color: "#9eb3c8",
    fontSize: 12,
    lineHeight: 18,
  },
  costAmountText: {
    color: "#42e8ff",
    fontSize: 15,
    fontWeight: "900",
  },
  approvalNoteInput: {
    marginTop: 12,
  },
  costPanel: {
    gap: 14,
  },
  costHero: {
    gap: 7,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#2b6f8f",
    backgroundColor: "#0b2738",
  },
  costTitle: {
    color: "#f4fbff",
    fontSize: 24,
    fontWeight: "900",
  },
  costHint: {
    color: "#9eb3c8",
    fontSize: 13,
    lineHeight: 20,
  },
  costCard: {
    gap: 14,
    borderRadius: 14,
    padding: 14,
    backgroundColor: "#101827",
    borderWidth: 1,
    borderColor: "#22334d",
  },
  costCardHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  costCount: {
    color: "#42e8ff",
    fontSize: 12,
    fontWeight: "900",
  },
  materialChips: {
    gap: 8,
    paddingBottom: 2,
  },
  materialChip: {
    minWidth: 142,
    borderRadius: 12,
    padding: 11,
    borderWidth: 1,
    borderColor: "#2f456a",
    backgroundColor: "#081223",
  },
  materialChipActive: {
    borderColor: "#42e8ff",
    backgroundColor: "#143149",
  },
  materialChipName: {
    color: "#d9f4ff",
    fontSize: 14,
    fontWeight: "900",
  },
  materialChipNameActive: {
    color: "#ffffff",
  },
  materialChipPrice: {
    marginTop: 5,
    color: "#8fa4ba",
    fontSize: 12,
    fontWeight: "800",
  },
  materialChipPriceActive: {
    color: "#bff7ff",
  },
  costSummary: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  costSubmitButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: "#2ed47a",
  },
  costEmptyBox: {
    gap: 8,
    borderRadius: 14,
    padding: 16,
    backgroundColor: "#101827",
    borderWidth: 1,
    borderColor: "#22334d",
  },
  recentCostList: {
    gap: 10,
    borderRadius: 14,
    padding: 14,
    backgroundColor: "#0d1829",
    borderWidth: 1,
    borderColor: "#22334d",
  },
  recentCostRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    borderRadius: 10,
    padding: 10,
    backgroundColor: "#081223",
    borderWidth: 1,
    borderColor: "#1c2d46",
  },
  recentCostText: {
    flex: 1,
    minWidth: 0,
  },
  recentCostName: {
    color: "#f4fbff",
    fontSize: 15,
    fontWeight: "900",
  },
  recentCostMeta: {
    marginTop: 4,
    color: "#9eb3c8",
    fontSize: 12,
    fontWeight: "700",
  },
  recentCostPhoto: {
    width: 46,
    height: 46,
    borderRadius: 8,
    backgroundColor: "#101827",
  },
  statsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
  },
  statCard_blue: {
    borderColor: "#2d8cff",
    backgroundColor: "#0c2442",
  },
  statCard_green: {
    borderColor: "#2ed47a",
    backgroundColor: "#0b2b23",
  },
  statCard_slate: {
    borderColor: "#344766",
    backgroundColor: "#101827",
  },
  statLabel: {
    color: "#9eb3c8",
    fontSize: 12,
    fontWeight: "700",
  },
  statValue: {
    marginTop: 4,
    color: "#f4fbff",
    fontSize: 24,
    fontWeight: "900",
  },
  segmented: {
    flexDirection: "row",
    borderRadius: 8,
    padding: 4,
    backgroundColor: "#101827",
    borderWidth: 1,
    borderColor: "#243755",
    marginBottom: 10,
  },
  segmentButton: {
    flex: 1,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 7,
  },
  segmentButtonActive: {
    backgroundColor: "#42e8ff",
  },
  segmentText: {
    color: "#9eb3c8",
    fontWeight: "800",
  },
  segmentTextActive: {
    color: "#04101b",
  },
  searchInput: {
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#243755",
    paddingHorizontal: 13,
    color: "#f4fbff",
    backgroundColor: "#101827",
    marginBottom: 10,
  },
  customerChips: {
    gap: 8,
    paddingBottom: 12,
  },
  customerChip: {
    minHeight: 34,
    justifyContent: "center",
    borderRadius: 999,
    paddingHorizontal: 13,
    backgroundColor: "#101827",
    borderWidth: 1,
    borderColor: "#243755",
  },
  customerChipActive: {
    borderColor: "#42e8ff",
    backgroundColor: "#143149",
  },
  customerChipText: {
    color: "#aab9ca",
    fontWeight: "700",
  },
  customerChipTextActive: {
    color: "#eafcff",
  },
  errorBox: {
    marginBottom: 12,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: iosPalette.danger,
    backgroundColor: "#35161b",
  },
  errorTitle: {
    color: "#ffb4b4",
    fontWeight: "800",
  },
  errorText: {
    marginTop: 4,
    color: "#ffd7d7",
  },
  errorHint: {
    marginTop: 6,
    color: "#dba8a8",
    fontSize: 12,
  },
  orderCard: {
    marginBottom: 10,
    borderRadius: 8,
    padding: 14,
    backgroundColor: "#101827",
    borderWidth: 1,
    borderColor: "#22334d",
  },
  scheduleGroupCard: {
    marginBottom: 10,
    borderRadius: 8,
    padding: 14,
    backgroundColor: "#0b1424",
    borderWidth: 1,
    borderColor: "#2f456a",
  },
  scheduleGroupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  scheduleGroupTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  scheduleGroupTitle: {
    color: "#f4fbff",
    fontSize: 16,
    fontWeight: "900",
  },
  scheduleGroupMeta: {
    marginTop: 4,
    color: "#9eb3c8",
    fontSize: 12,
    fontWeight: "700",
  },
  scheduleGroupBadge: {
    minHeight: 30,
    justifyContent: "center",
    borderRadius: 8,
    paddingHorizontal: 10,
    backgroundColor: "#10243e",
  },
  scheduleGroupBadgeText: {
    color: "#9ed8ff",
    fontSize: 12,
    fontWeight: "900",
  },
  scheduleGroupSummary: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  cardEmptyHint: {
    minHeight: 46,
    borderRadius: 8,
    padding: 12,
    color: "#8fa4ba",
    backgroundColor: "#0b1424",
    borderWidth: 1,
    borderColor: "#1c2d46",
    fontSize: 13,
    fontWeight: "700",
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  cardTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  orderNo: {
    color: "#f4fbff",
    fontSize: 16,
    fontWeight: "900",
  },
  customerName: {
    marginTop: 3,
    color: "#9eb3c8",
    fontSize: 13,
  },
  productName: {
    marginTop: 12,
    color: "#d9f4ff",
    fontSize: 17,
    fontWeight: "800",
  },
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  metaItem: {
    minWidth: "30%",
    flexGrow: 1,
    flexBasis: "30%",
    borderRadius: 8,
    padding: 9,
    backgroundColor: "#0b1424",
    borderWidth: 1,
    borderColor: "#1c2d46",
  },
  metaLabel: {
    color: "#7f93aa",
    fontSize: 11,
    fontWeight: "700",
  },
  metaValue: {
    marginTop: 4,
    color: "#f4fbff",
    fontSize: 14,
    fontWeight: "800",
  },
  orderMetaList: {
    gap: 8,
    marginTop: 12,
  },
  orderMetaRow: {
    width: "100%",
    minHeight: 42,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 10,
    backgroundColor: "#0b1424",
    borderWidth: 1,
    borderColor: "#1c2d46",
  },
  orderMetaLabel: {
    width: 82,
    flexShrink: 0,
    color: "#7f93aa",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
  },
  orderMetaValue: {
    flex: 1,
    color: "#f4fbff",
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 20,
    textAlign: "right",
  },
  cardActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 12,
  },
  lightButton: {
    minHeight: 38,
    justifyContent: "center",
    borderRadius: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#2f456a",
  },
  lightButtonText: {
    color: "#d9f4ff",
    fontWeight: "800",
  },
  doneButton: {
    minHeight: 38,
    justifyContent: "center",
    borderRadius: 8,
    paddingHorizontal: 14,
    backgroundColor: "#2ed47a",
  },
  doneButtonDisabled: {
    opacity: 0.5,
  },
  doneButtonText: {
    color: "#04150e",
    fontWeight: "900",
  },
  statusChip: {
    flexShrink: 0,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "#25314a",
  },
  statusPending: {
    backgroundColor: "#3d2210",
  },
  statusScheduled: {
    backgroundColor: "#0d2137",
  },
  statusCompleted: {
    backgroundColor: "#143c2c",
  },
  statusDeliveryOpened: {
    backgroundColor: "#0b2f42",
  },
  statusPartialDelivered: {
    backgroundColor: "#2d2a10",
  },
  statusDelivered: {
    backgroundColor: "#1a1f3d",
  },
  statusReconciled: {
    backgroundColor: "#1e1835",
  },
  statusPaid: {
    backgroundColor: "#0d2b28",
  },
  statusIssue: {
    backgroundColor: "#3a1515",
  },
  statusText: {
    color: "#c6d2e2",
    fontSize: 12,
    fontWeight: "800",
  },
  statusPendingText: {
    color: "#f0883e",
  },
  statusScheduledText: {
    color: "#58a6ff",
  },
  statusCompletedText: {
    color: "#96f2c0",
  },
  statusDeliveryOpenedText: {
    color: "#38bdf8",
  },
  statusPartialDeliveredText: {
    color: "#facc15",
  },
  statusDeliveredText: {
    color: "#9bb8ff",
  },
  statusReconciledText: {
    color: "#c4a8ff",
  },
  statusPaidText: {
    color: "#5eeadb",
  },
  statusIssueText: {
    color: "#ff8585",
  },
  stateBox: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  stateText: {
    color: "#9eb3c8",
  },
  emptyTitle: {
    color: "#f4fbff",
    fontSize: 18,
    fontWeight: "900",
  },
  modalSafeArea: {
    flex: 1,
    backgroundColor: "#07111f",
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  modalTitle: {
    marginTop: 4,
    color: "#f4fbff",
    fontSize: 22,
    fontWeight: "900",
  },
  closeButton: {
    height: 36,
    justifyContent: "center",
    borderRadius: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#2f456a",
  },
  closeButtonText: {
    color: "#d9f4ff",
    fontWeight: "800",
  },
  detailList: {
    gap: 8,
    paddingBottom: 18,
  },
  detailFieldPanel: {
    gap: 10,
    borderRadius: 8,
    padding: 12,
    backgroundColor: "#101827",
    borderWidth: 1,
    borderColor: "#22334d",
  },
  detailFieldHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  detailRow: {
    borderRadius: 8,
    padding: 12,
    backgroundColor: "#101827",
    borderWidth: 1,
    borderColor: "#22334d",
  },
  detailLabel: {
    color: "#8fa4ba",
    fontSize: 12,
    fontWeight: "800",
  },
  detailValue: {
    marginTop: 5,
    color: "#f4fbff",
    fontSize: 16,
    fontWeight: "700",
  },
  detailValueMultiline: {
    lineHeight: 22,
  },
  modalDoneButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "#2ed47a",
  },
  completionBackdrop: {
    flex: 1,
    justifyContent: "center",
    padding: 18,
    backgroundColor: "rgba(3, 8, 16, 0.72)",
  },
  completionKeyboard: {
    width: "100%",
  },
  completionCard: {
    borderRadius: 8,
    padding: 16,
    backgroundColor: "#101827",
    borderWidth: 1,
    borderColor: "#2a3d5c",
  },
  completionTitle: {
    marginTop: 6,
    color: "#f4fbff",
    fontSize: 20,
    fontWeight: "900",
  },
  completionMeta: {
    marginTop: 4,
    color: "#9eb3c8",
    fontWeight: "700",
  },
  completionField: {
    gap: 7,
    marginTop: 14,
  },
  completionLabel: {
    color: "#9eb3c8",
    fontSize: 13,
    fontWeight: "800",
  },
  completionInput: {
    minHeight: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2f456a",
    paddingHorizontal: 12,
    color: "#f4fbff",
    backgroundColor: "#081223",
  },
  completionTextarea: {
    minHeight: 86,
    paddingTop: 10,
    textAlignVertical: "top",
  },
  photoHint: {
    borderRadius: 8,
    padding: 12,
    color: "#ffd6a3",
    backgroundColor: "#332512",
    borderWidth: 1,
    borderColor: "#8a5a18",
    fontWeight: "700",
  },
  photoButton: {
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "#42e8ff",
  },
  photoButtonText: {
    color: "#05101d",
    fontWeight: "900",
  },
  photoPreviewWrap: {
    gap: 8,
  },
  photoPreview: {
    width: "100%",
    height: 180,
    borderRadius: 8,
    backgroundColor: "#081223",
  },
  completionActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 16,
  },
  /* ── Auth screens (Apple-level dark theme) ── */
  authSafeArea: {
    flex: 1,
    backgroundColor: "#080D14",
  },
  authWrap: {
    flex: 1,
  },
  authScroll: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
    gap: 24,
  },
  authHero: {
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 4,
    paddingTop: 8,
    paddingBottom: 4,
  },
  authIconRing: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: "#007AFF",
    boxShadow: "0 8px 32px rgba(0, 122, 255, 0.28)",
  },
  authIconText: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "900",
    fontFamily: Platform.OS === "ios" ? "SF Pro Display" : undefined,
  },
  authKicker: {
    color: "#007AFF",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    fontFamily: Platform.OS === "ios" ? "SF Pro Text" : undefined,
  },
  authTitle: {
    color: "#F5F7FA",
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: -0.5,
    fontFamily: Platform.OS === "ios" ? "SF Pro Display" : undefined,
  },
  authHint: {
    color: "#8E97A6",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    paddingHorizontal: 12,
  },
  authCard: {
    gap: 16,
    borderRadius: 20,
    padding: 22,
    backgroundColor: "#0E1521",
    borderWidth: 1,
    borderColor: "#1C2940",
    boxShadow: "0 2px 24px rgba(0, 0, 0, 0.40)",
  },
  authField: {
    gap: 7,
  },
  authLabel: {
    color: "#B0BEC5",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.2,
    textTransform: "uppercase",
    fontFamily: Platform.OS === "ios" ? "SF Pro Text" : undefined,
  },
  authInput: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1F2D45",
    paddingHorizontal: 16,
    color: "#F5F7FA",
    backgroundColor: "#060B14",
    fontSize: 16,
    fontFamily: Platform.OS === "ios" ? "SF Pro Text" : undefined,
  },
  authNotice: {
    gap: 4,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#1A3152",
    backgroundColor: "#080F1E",
  },
  authNoticeTitle: {
    color: "#8BB8FF",
    fontSize: 13,
    fontWeight: "800",
  },
  authNoticeText: {
    color: "#8E97A6",
    fontSize: 12,
    lineHeight: 18,
  },
  authButton: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    marginTop: 4,
    backgroundColor: "#007AFF",
    boxShadow: "0 4px 16px rgba(0, 122, 255, 0.32)",
  },
  authButtonRegister: {
    backgroundColor: "#34C759",
    boxShadow: "0 4px 16px rgba(52, 199, 89, 0.32)",
  },
  authButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  authButtonDisabled: {
    opacity: 0.5,
  },
  authButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.2,
    fontFamily: Platform.OS === "ios" ? "SF Pro Text" : undefined,
  },
  authToggle: {
    alignItems: "center",
    paddingVertical: 12,
  },
  authToggleText: {
    color: "#8E97A6",
    fontSize: 14,
    fontFamily: Platform.OS === "ios" ? "SF Pro Text" : undefined,
  },
  authToggleLink: {
    color: "#007AFF",
    fontWeight: "700",
  },
  /* ── Attendance ── */
  attendanceCard: {
    gap: 14,
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    backgroundColor: "#0D1829",
    borderWidth: 1,
    borderColor: "#284466",
  },
  attendanceCardTitle: {
    color: "#F5F7FA",
    fontSize: 16,
    fontWeight: "800",
  },
  attendanceDate: {
    color: "#9EB3C8",
    fontSize: 13,
    fontWeight: "600",
  },
  attendanceScheduleCard: {
    gap: 14,
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    backgroundColor: "#FFFFFF",
    ...shadowSoft,
  },
  attendanceScheduleHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  attendanceScheduleKicker: {
    color: iosPalette.muted,
    fontSize: 12,
    fontWeight: "800",
  },
  attendanceScheduleTitle: {
    marginTop: 4,
    color: iosPalette.text,
    fontSize: 22,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  attendanceScheduleSubtitle: {
    marginTop: 4,
    color: iosPalette.muted,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
  },
  attendanceScheduleTotal: {
    minWidth: 84,
    alignItems: "flex-end",
  },
  attendanceScheduleTotalValue: {
    color: iosPalette.accent,
    fontSize: 24,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  attendanceScheduleTotalLabel: {
    color: iosPalette.muted,
    fontSize: 11,
    fontWeight: "800",
  },
  attendanceScheduleTimeline: {
    gap: 9,
  },
  attendanceScheduleSegment: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    padding: 12,
    backgroundColor: iosPalette.grouped,
  },
  attendanceScheduleDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: iosPalette.accent,
  },
  attendanceScheduleDot_morning: {
    backgroundColor: iosPalette.accent,
  },
  attendanceScheduleDot_lunch: {
    backgroundColor: iosPalette.warning,
  },
  attendanceScheduleDot_afternoon: {
    backgroundColor: iosPalette.success,
  },
  attendanceScheduleSegmentText: {
    flex: 1,
    minWidth: 0,
  },
  attendanceScheduleSegmentLabel: {
    color: iosPalette.text,
    fontSize: 14,
    fontWeight: "900",
  },
  attendanceScheduleSegmentTime: {
    marginTop: 3,
    color: iosPalette.muted,
    fontSize: 13,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  attendanceScheduleSegmentHours: {
    color: iosPalette.textSoft,
    fontSize: 13,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  attendanceScheduleFooter: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  attendanceScheduleFooterText: {
    overflow: "hidden",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: iosPalette.textSoft,
    backgroundColor: iosPalette.accentSoft,
    fontSize: 12,
    fontWeight: "800",
  },
  attendanceStatusRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
  },
  attendanceChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    padding: 14,
    backgroundColor: "#0A2E1A",
    borderWidth: 1,
    borderColor: "#1A5C38",
  },
  attendanceChipIcon: {
    color: "#34C759",
    fontSize: 22,
    fontWeight: "900",
  },
  attendanceChipLabel: {
    color: "#8BB8A0",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  attendanceChipTime: {
    color: "#D4F5E0",
    fontSize: 18,
    fontWeight: "800",
    marginTop: 2,
  },
  attendanceChipMuted: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    padding: 14,
    backgroundColor: "#151D2A",
    borderWidth: 1,
    borderColor: "#25364A",
  },
  attendanceChipIconMuted: {
    color: "#546E8A",
    fontSize: 22,
    fontWeight: "900",
  },
  attendanceChipLabelMuted: {
    color: "#546E8A",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  attendanceChipTimeMuted: {
    color: "#647890",
    fontSize: 18,
    fontWeight: "800",
    marginTop: 2,
  },
  attendanceNotChecked: {
    alignItems: "center",
    paddingVertical: 20,
  },
  attendanceNotCheckedText: {
    color: "#647890",
    fontSize: 15,
    fontWeight: "600",
  },
  attendanceActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 6,
  },
  attendanceBtn: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  attendanceBtnIn: {
    backgroundColor: "#007AFF",
  },
  attendanceBtnOut: {
    backgroundColor: "#34C759",
  },
  attendanceBtnDone: {
    opacity: 0.4,
  },
  attendanceBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
  attendanceStatsGrid: {
    flexDirection: "row",
    gap: 12,
  },
  attendanceStatItem: {
    flex: 1,
    alignItems: "center",
    gap: 4,
    borderRadius: 12,
    padding: 14,
    backgroundColor: "#081223",
    borderWidth: 1,
    borderColor: "#243755",
  },
  attendanceStatValue: {
    color: "#F5F7FA",
    fontSize: 26,
    fontWeight: "900",
  },
  attendanceStatLabel: {
    color: "#8E97A6",
    fontSize: 12,
    fontWeight: "600",
  },
  attendanceLiveBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#041A0F",
    borderWidth: 1,
    borderColor: "#1A5C38",
  },
  attendanceLiveBannerDone: {
    backgroundColor: "#0A1A12",
    borderColor: "#1A3E28",
    justifyContent: "center",
  },
  attendanceLiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#34C759",
  },
  attendanceLiveLabel: {
    color: "#8BB8A0",
    fontSize: 12,
    fontWeight: "700",
    flex: 1,
  },
  attendanceLiveTime: {
    color: "#34C759",
    fontSize: 16,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  attendanceLiveLabelDone: {
    color: "#34C759",
    fontSize: 14,
    fontWeight: "700",
  },
  attendanceBtnLarge: {
    flex: 1,
    minHeight: 100,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    gap: 4,
    paddingVertical: 14,
  },
  attendanceBtnLargeIn: {
    backgroundColor: "#007AFF",
  },
  attendanceBtnLargeOut: {
    backgroundColor: "#30B060",
  },
  attendanceBtnLargeDone: {
    backgroundColor: "#1A2A3A",
    borderWidth: 1,
    borderColor: "#25364A",
  },
  attendanceBtnLargeDisabled: {
    backgroundColor: "#111822",
    borderWidth: 1,
    borderColor: "#1E2A38",
  },
  attendanceBtnLargeIcon: {
    fontSize: 28,
  },
  attendanceBtnLargeText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "800",
  },
  attendanceBtnLargeSub: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
  },
  leaveForm: {
    gap: 14,
  },
  leaveField: {
    gap: 6,
  },
  leaveFieldRow: {
    flexDirection: "row",
    gap: 12,
  },
  leaveTypeRow: {
    flexDirection: "row",
    gap: 8,
  },
  leaveTypeChip: {
    minHeight: 34,
    justifyContent: "center",
    borderRadius: 10,
    paddingHorizontal: 14,
    backgroundColor: "#081223",
    borderWidth: 1,
    borderColor: "#2F456A",
  },
  leaveTypeChipActive: {
    borderColor: "#34C759",
    backgroundColor: "#0A2E1A",
  },
  leaveTypeChipText: {
    color: "#8E97A6",
    fontSize: 13,
    fontWeight: "700",
  },
  leaveTypeChipTextActive: {
    color: "#34C759",
  },
  leaveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#081223",
    borderWidth: 1,
    borderColor: "#243755",
    marginTop: 8,
  },
  leaveRowLeft: {
    flex: 1,
    gap: 3,
  },
  leaveRowType: {
    color: "#F5F7FA",
    fontSize: 14,
    fontWeight: "800",
  },
  leaveRowDates: {
    color: "#8E97A6",
    fontSize: 12,
  },
  leaveRowReason: {
    color: "#647890",
    fontSize: 12,
    marginTop: 2,
  },
  leaveStatusBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "#1A2538",
  },
  leaveStatusApproved: {
    backgroundColor: "#0A2E1A",
  },
  leaveStatusRejected: {
    backgroundColor: "#3A1A1A",
  },
  leaveStatusText: {
    color: "#8E97A6",
    fontSize: 12,
    fontWeight: "700",
  },
  leaveStatusTextApproved: {
    color: "#34C759",
  },
  leaveStatusTextRejected: {
    color: "#FF3B30",
  },
});

const styles = {
  ...legacyStyles,
  ...StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: iosPalette.background,
    },
    mobileBody: {
      flex: 1,
    },
    listContent: {
      paddingHorizontal: 18,
      paddingTop: 14,
      paddingBottom: 32,
    },
    topBar: {
      minHeight: 72,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 14,
      paddingHorizontal: 18,
      paddingTop: 8,
      paddingBottom: 10,
      backgroundColor: iosPalette.background,
      borderBottomWidth: 1,
      borderBottomColor: iosPalette.line,
    },
    topBarTitleWrap: {
      flex: 1,
      minWidth: 0,
    },
    topBarTitle: {
      color: iosPalette.text,
      fontSize: 30,
      fontWeight: "900",
      letterSpacing: -0.4,
    },
    topBarSubtitle: {
      marginTop: 4,
      color: iosPalette.muted,
      fontSize: 12,
      fontWeight: "800",
    },
    avatarButton: {
      width: 48,
      height: 48,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 24,
      backgroundColor: iosPalette.surface,
      overflow: "hidden",
      ...shadowSoft,
    },
    avatarInitial: {
      color: iosPalette.accent,
      fontSize: 18,
      fontWeight: "900",
    },
    avatarImage: {
      width: "100%",
      height: "100%",
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 16,
      marginBottom: 18,
    },
    eyebrow: {
      color: iosPalette.accent,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 0.5,
    },
    title: {
      marginTop: 3,
      color: iosPalette.text,
      fontSize: 34,
      fontWeight: "900",
      letterSpacing: -0.5,
    },
    userBadge: {
      marginTop: 7,
      color: iosPalette.muted,
      fontSize: 13,
      fontWeight: "700",
    },
    settingsButton: {
      minHeight: 44,
      justifyContent: "center",
      borderRadius: 999,
      paddingHorizontal: 17,
      backgroundColor: iosPalette.surface,
      ...shadowSoft,
    },
    settingsButtonText: {
      color: iosPalette.accent,
      fontWeight: "800",
    },
    settingsPanel: {
      gap: 14,
      marginBottom: 18,
      borderRadius: 18,
      padding: 16,
      backgroundColor: iosPalette.surface,
      ...shadowCard,
    },
    accountPanel: {
      minHeight: 62,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      borderRadius: 14,
      padding: 12,
      backgroundColor: iosPalette.grouped,
    },
    accountAvatarLarge: {
      width: 46,
      height: 46,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 16,
      backgroundColor: iosPalette.accent,
      overflow: "hidden",
    },
    accountAvatarImage: {
      width: "100%",
      height: "100%",
    },
    accountAvatarText: {
      color: "#FFFFFF",
      fontSize: 18,
      fontWeight: "900",
    },
    accountInfo: {
      flex: 1,
      minWidth: 0,
    },
    accountName: {
      marginTop: 4,
      color: iosPalette.text,
      fontSize: 15,
      fontWeight: "900",
    },
    accountMeta: {
      marginTop: 4,
      color: iosPalette.muted,
      fontSize: 12,
      fontWeight: "700",
    },
    profileUploadButton: {
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 14,
      backgroundColor: iosPalette.grouped,
    },
    panelLabel: {
      color: iosPalette.muted,
      fontSize: 13,
      fontWeight: "800",
    },
    apiInput: {
      minHeight: 48,
      borderRadius: 12,
      paddingHorizontal: 14,
      color: iosPalette.text,
      backgroundColor: iosPalette.grouped,
      fontSize: 15,
    },
    settingsActions: {
      flexDirection: "row",
      gap: 10,
      justifyContent: "flex-end",
    },
    displayFieldPanel: {
      gap: 12,
      marginTop: 4,
      paddingTop: 14,
      borderTopWidth: 1,
      borderTopColor: iosPalette.line,
    },
    displayFieldHead: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    displayFieldActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    resetFieldsText: {
      color: iosPalette.accent,
      fontSize: 12,
      fontWeight: "800",
    },
    displayFieldChips: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    displayFieldChip: {
      minHeight: 36,
      justifyContent: "center",
      borderRadius: 999,
      paddingHorizontal: 13,
      backgroundColor: iosPalette.grouped,
    },
    displayFieldChipActive: {
      backgroundColor: iosPalette.accent,
    },
    displayFieldChipText: {
      color: iosPalette.textSoft,
      fontSize: 12,
      fontWeight: "800",
    },
    displayFieldChipTextActive: {
      color: "#FFFFFF",
    },
    primaryAction: {
      minHeight: 44,
      justifyContent: "center",
      borderRadius: 999,
      paddingHorizontal: 18,
      backgroundColor: iosPalette.accent,
    },
    primaryActionText: {
      color: "#FFFFFF",
      fontWeight: "800",
    },
    secondaryAction: {
      minHeight: 44,
      justifyContent: "center",
      borderRadius: 999,
      paddingHorizontal: 16,
      backgroundColor: iosPalette.grouped,
    },
    secondaryActionText: {
      color: iosPalette.textSoft,
      fontWeight: "800",
    },
    registerWrap: {
      flex: 1,
      backgroundColor: iosPalette.background,
    },
    registerScroll: {
      flexGrow: 1,
      justifyContent: "center",
      gap: 20,
      paddingHorizontal: 20,
      paddingVertical: 24,
    },
    registerHero: {
      gap: 10,
      borderRadius: 20,
      padding: 18,
      backgroundColor: iosPalette.accentSoft,
    },
    registerKicker: {
      color: iosPalette.accent,
      fontSize: 11,
      fontWeight: "900",
      letterSpacing: 0.7,
    },
    registerCard: {
      gap: 15,
      borderRadius: 20,
      padding: 18,
      backgroundColor: iosPalette.surface,
      ...shadowCard,
    },
    registerTitle: {
      color: iosPalette.text,
      fontSize: 32,
      fontWeight: "900",
      letterSpacing: -0.5,
    },
    registerHint: {
      color: iosPalette.textSoft,
      fontSize: 14,
      lineHeight: 22,
    },
    registerField: {
      gap: 8,
    },
    registerLabel: {
      color: iosPalette.textSoft,
      fontSize: 13,
      fontWeight: "800",
    },
    registerInput: {
      minHeight: 50,
      borderRadius: 12,
      paddingHorizontal: 14,
      color: iosPalette.text,
      backgroundColor: iosPalette.grouped,
      fontSize: 15,
    },
    registerNotice: {
      gap: 6,
      borderRadius: 14,
      padding: 12,
      backgroundColor: iosPalette.warningSoft,
    },
    registerNoticeTitle: {
      color: "#7A4B00",
      fontSize: 13,
      fontWeight: "900",
    },
    registerNoticeText: {
      color: "#6B4E16",
      fontSize: 12,
      lineHeight: 18,
    },
    registerButton: {
      minHeight: 52,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 14,
      marginTop: 2,
      backgroundColor: iosPalette.accent,
    },
    pendingWrap: {
      flexGrow: 1,
      justifyContent: "center",
      padding: 20,
      backgroundColor: iosPalette.background,
    },
    pendingCard: {
      gap: 16,
      borderRadius: 20,
      padding: 20,
      backgroundColor: iosPalette.surface,
      ...shadowCard,
    },
    pendingIcon: {
      width: 56,
      height: 56,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 18,
      backgroundColor: iosPalette.warningSoft,
    },
    pendingIconText: {
      color: iosPalette.warning,
      fontSize: 30,
      fontWeight: "900",
    },
    pendingTitle: {
      color: iosPalette.text,
      fontSize: 26,
      fontWeight: "900",
      letterSpacing: -0.3,
    },
    pendingText: {
      color: iosPalette.textSoft,
      fontSize: 14,
      lineHeight: 22,
    },
    pendingAccount: {
      gap: 5,
      borderRadius: 14,
      padding: 12,
      backgroundColor: iosPalette.grouped,
    },
    pendingRoleText: {
      color: "#9A6200",
      fontSize: 13,
      fontWeight: "800",
    },
    pendingActions: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 10,
    },
    pendingLogout: {
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    pendingLogoutText: {
      color: iosPalette.muted,
      fontWeight: "800",
    },
    profileWrap: {
      flex: 1,
      backgroundColor: iosPalette.background,
    },
    profileScroll: {
      flexGrow: 1,
      gap: 16,
      paddingHorizontal: 18,
      paddingTop: 12,
      paddingBottom: 28,
    },
    profileHeader: {
      gap: 8,
    },
    profileBackButton: {
      alignSelf: "flex-start",
      minHeight: 40,
      justifyContent: "center",
      borderRadius: 999,
      paddingHorizontal: 14,
      backgroundColor: iosPalette.surface,
      ...shadowSoft,
    },
    profileTitle: {
      color: iosPalette.text,
      fontSize: 32,
      fontWeight: "900",
      letterSpacing: -0.4,
    },
    profileSubtitle: {
      color: iosPalette.textSoft,
      fontSize: 14,
      lineHeight: 21,
    },
    profileCard: {
      alignItems: "center",
      gap: 10,
      borderRadius: 20,
      padding: 18,
      backgroundColor: iosPalette.surface,
      ...shadowCard,
    },
    profileAvatar: {
      width: 88,
      height: 88,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 28,
      backgroundColor: iosPalette.accent,
      overflow: "hidden",
    },
    profileAvatarImage: {
      width: "100%",
      height: "100%",
    },
    profileAvatarText: {
      color: "#FFFFFF",
      fontSize: 34,
      fontWeight: "900",
    },
    profileName: {
      color: iosPalette.text,
      fontSize: 22,
      fontWeight: "900",
    },
    profileMeta: {
      color: iosPalette.muted,
      fontSize: 13,
      fontWeight: "700",
    },
    profileSection: {
      gap: 12,
      borderRadius: 18,
      padding: 16,
      backgroundColor: iosPalette.surface,
      ...shadowSoft,
    },
    profileLogoutButton: {
      minHeight: 50,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 14,
      backgroundColor: iosPalette.dangerSoft,
    },
    profileLogoutText: {
      color: iosPalette.danger,
      fontWeight: "900",
    },
    workbenchPanel: {
      gap: 16,
    },
    workbenchHero: {
      gap: 8,
      borderRadius: 16,
      padding: 16,
      backgroundColor: iosPalette.accentSoft,
    },
    actionGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 12,
    },
    actionTile: {
      flexGrow: 1,
      flexBasis: "45%",
      minHeight: 88,
      justifyContent: "center",
      borderRadius: 16,
      padding: 14,
      backgroundColor: iosPalette.surface,
      ...shadowSoft,
    },
    actionTileValue: {
      color: iosPalette.text,
      fontSize: 22,
      fontWeight: "900",
    },
    actionTileLabel: {
      marginTop: 5,
      color: iosPalette.muted,
      fontSize: 12,
      fontWeight: "800",
    },
    mobileSection: {
      gap: 12,
      borderRadius: 18,
      padding: 15,
      backgroundColor: iosPalette.surface,
      ...shadowSoft,
    },
    sectionHeadRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
    },
    compactRow: {
      minHeight: 64,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      borderRadius: 14,
      padding: 12,
      backgroundColor: iosPalette.grouped,
    },
    reminderCard: {
      gap: 5,
      borderRadius: 14,
      padding: 13,
      backgroundColor: iosPalette.grouped,
    },
    reminderDanger: {
      backgroundColor: iosPalette.dangerSoft,
    },
    reminderWarning: {
      backgroundColor: iosPalette.warningSoft,
    },
    reminderTitle: {
      color: iosPalette.text,
      fontSize: 14,
      fontWeight: "900",
    },
    reminderText: {
      color: iosPalette.textSoft,
      fontSize: 12,
      lineHeight: 18,
    },
    costAmountText: {
      color: iosPalette.accent,
      fontSize: 15,
      fontWeight: "900",
    },
    approvalNoteInput: {
      marginTop: 12,
    },
    costPanel: {
      gap: 16,
    },
    costHero: {
      gap: 8,
      borderRadius: 16,
      padding: 16,
      backgroundColor: iosPalette.tealSoft,
    },
    costTitle: {
      color: iosPalette.text,
      fontSize: 24,
      fontWeight: "900",
      letterSpacing: -0.3,
    },
    costHint: {
      color: iosPalette.textSoft,
      fontSize: 13,
      lineHeight: 20,
    },
    costCard: {
      gap: 16,
      borderRadius: 18,
      padding: 15,
      backgroundColor: iosPalette.surface,
      ...shadowSoft,
    },
    costCardHead: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    costCount: {
      color: iosPalette.accent,
      fontSize: 12,
      fontWeight: "900",
    },
    materialChips: {
      gap: 8,
      paddingBottom: 2,
    },
    materialChip: {
      minWidth: 142,
      borderRadius: 14,
      padding: 12,
      backgroundColor: iosPalette.grouped,
    },
    materialChipActive: {
      backgroundColor: iosPalette.accent,
    },
    materialChipName: {
      color: iosPalette.text,
      fontSize: 14,
      fontWeight: "900",
    },
    materialChipNameActive: {
      color: "#FFFFFF",
    },
    materialChipPrice: {
      marginTop: 5,
      color: iosPalette.muted,
      fontSize: 12,
      fontWeight: "800",
    },
    materialChipPriceActive: {
      color: "#EAF4FF",
    },
    costSummary: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    costSubmitButton: {
      minHeight: 52,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 14,
      backgroundColor: iosPalette.success,
    },
    costEmptyBox: {
      gap: 8,
      borderRadius: 16,
      padding: 16,
      backgroundColor: iosPalette.surface,
      ...shadowSoft,
    },
    recentCostList: {
      gap: 12,
      borderRadius: 18,
      padding: 15,
      backgroundColor: iosPalette.surface,
      ...shadowSoft,
    },
    recentCostRow: {
      minHeight: 66,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      borderRadius: 14,
      padding: 12,
      backgroundColor: iosPalette.grouped,
    },
    recentCostText: {
      flex: 1,
      minWidth: 0,
    },
    recentCostName: {
      color: iosPalette.text,
      fontSize: 15,
      fontWeight: "900",
    },
    recentCostMeta: {
      marginTop: 4,
      color: iosPalette.muted,
      fontSize: 12,
      fontWeight: "700",
    },
    recentCostPhoto: {
      width: 46,
      height: 46,
      borderRadius: 12,
      backgroundColor: iosPalette.grouped,
    },
    statsRow: {
      flexDirection: "row",
      gap: 10,
      marginBottom: 14,
    },
    statCard: {
      flex: 1,
      minHeight: 82,
      borderRadius: 16,
      padding: 13,
      backgroundColor: iosPalette.surface,
      ...shadowSoft,
    },
    statCard_blue: {
      backgroundColor: iosPalette.accentSoft,
    },
    statCard_green: {
      backgroundColor: iosPalette.successSoft,
    },
    statCard_slate: {
      backgroundColor: iosPalette.surface,
    },
    statLabel: {
      color: iosPalette.muted,
      fontSize: 12,
      fontWeight: "800",
    },
    statValue: {
      marginTop: 6,
      color: iosPalette.text,
      fontSize: 24,
      fontWeight: "900",
    },
    segmentedScroller: {
      marginBottom: 12,
    },
    segmented: {
      flexDirection: "row",
      gap: 8,
      paddingVertical: 2,
      paddingRight: 4,
    },
    segmentButton: {
      minHeight: 40,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 999,
      paddingHorizontal: 15,
      backgroundColor: iosPalette.surface,
    },
    segmentButtonActive: {
      backgroundColor: iosPalette.text,
    },
    segmentText: {
      color: iosPalette.textSoft,
      fontSize: 14,
      fontWeight: "800",
    },
    segmentTextActive: {
      color: "#FFFFFF",
    },
    searchInput: {
      minHeight: 48,
      borderRadius: 14,
      paddingHorizontal: 15,
      color: iosPalette.text,
      backgroundColor: iosPalette.surface,
      marginBottom: 12,
      fontSize: 15,
    },
    customerChips: {
      gap: 8,
      paddingBottom: 14,
    },
    customerChip: {
      minHeight: 38,
      justifyContent: "center",
      borderRadius: 999,
      paddingHorizontal: 14,
      backgroundColor: iosPalette.surface,
    },
    customerChipActive: {
      backgroundColor: iosPalette.accent,
    },
    customerChipText: {
      color: iosPalette.textSoft,
      fontWeight: "800",
    },
    customerChipTextActive: {
      color: "#FFFFFF",
    },
    bottomTabsWrap: {
      paddingHorizontal: 10,
      paddingTop: 8,
      paddingBottom: Platform.OS === "ios" ? 10 : 8,
      backgroundColor: iosPalette.background,
      borderTopWidth: 1,
      borderTopColor: iosPalette.line,
    },
    bottomTabs: {
      minHeight: 68,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderRadius: 18,
      paddingHorizontal: 6,
      paddingVertical: 6,
      backgroundColor: iosPalette.surface,
      ...shadowCard,
    },
    bottomTab: {
      flex: 1,
      minHeight: 56,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 14,
      paddingHorizontal: 2,
      gap: 3,
    },
    bottomTabActive: {
      backgroundColor: iosPalette.accentSoft,
    },
    bottomTabIconWrap: {
      width: 24,
      height: 24,
      alignItems: "center",
      justifyContent: "center",
    },
    tabIconGrid: {
      width: 20,
      height: 20,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 4,
      alignItems: "center",
      justifyContent: "center",
    },
    tabIconTile: {
      width: 7,
      height: 7,
      borderRadius: 2,
    },
    tabIconCircle: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      alignItems: "center",
      justifyContent: "center",
    },
    tabIconGlyph: {
      fontSize: 13,
      lineHeight: 16,
      fontWeight: "900",
      textAlign: "center",
    },
    tabIconCheck: {
      fontSize: 14,
      lineHeight: 17,
    },
    tabIconCalendar: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 2,
      overflow: "hidden",
      backgroundColor: iosPalette.surface,
    },
    tabIconCalendarTop: {
      height: 5,
      width: "100%",
    },
    tabIconCalendarDots: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 3,
      paddingHorizontal: 4,
      paddingTop: 4,
    },
    tabIconDot: {
      width: 4,
      height: 4,
      borderRadius: 2,
      opacity: 0.85,
    },
    tabIconCoin: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      alignItems: "center",
      justifyContent: "center",
    },
    tabIconBars: {
      width: 22,
      height: 22,
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent: "center",
      gap: 3,
    },
    tabIconBar: {
      width: 4,
      borderRadius: 2,
    },
    tabIconApproval: {
      width: 22,
      height: 22,
      borderRadius: 7,
      borderWidth: 2,
      alignItems: "center",
      justifyContent: "center",
    },
    bottomTabLabel: {
      color: iosPalette.muted,
      fontSize: 10,
      fontWeight: "800",
    },
    bottomTabLabelActive: {
      color: iosPalette.accent,
    },
    errorBox: {
      marginBottom: 14,
      borderRadius: 16,
      padding: 14,
      backgroundColor: iosPalette.dangerSoft,
    },
    errorTitle: {
      color: "#A21B16",
      fontWeight: "900",
    },
    errorText: {
      marginTop: 4,
      color: "#7A1E1A",
    },
    errorHint: {
      marginTop: 6,
      color: "#8C3A35",
      fontSize: 12,
    },
    orderCard: {
      marginBottom: 12,
      borderRadius: 18,
      padding: 15,
      backgroundColor: iosPalette.surface,
      ...shadowSoft,
    },
    scheduleGroupCard: {
      marginBottom: 12,
      borderRadius: 18,
      padding: 15,
      backgroundColor: iosPalette.surface,
      borderWidth: 1,
      borderColor: iosPalette.line,
      ...shadowSoft,
    },
    scheduleGroupHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
    },
    scheduleGroupTitleWrap: {
      flex: 1,
      minWidth: 0,
    },
    scheduleGroupTitle: {
      color: iosPalette.text,
      fontSize: 16,
      fontWeight: "900",
    },
    scheduleGroupMeta: {
      marginTop: 4,
      color: iosPalette.muted,
      fontSize: 12,
      fontWeight: "800",
    },
    scheduleGroupBadge: {
      minHeight: 31,
      justifyContent: "center",
      borderRadius: 12,
      paddingHorizontal: 11,
      backgroundColor: iosPalette.accentSoft,
    },
    scheduleGroupBadgeText: {
      color: iosPalette.accent,
      fontSize: 12,
      fontWeight: "900",
    },
    scheduleGroupSummary: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 13,
    },
    deliveryCardPressArea: {
      gap: 12,
    },
    cardEmptyHint: {
      minHeight: 48,
      borderRadius: 14,
      padding: 12,
      color: iosPalette.muted,
      backgroundColor: iosPalette.grouped,
      fontSize: 13,
      fontWeight: "700",
    },
    cardTopRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
    },
    cardTitleWrap: {
      flex: 1,
      minWidth: 0,
    },
    orderNo: {
      color: iosPalette.text,
      fontSize: 16,
      fontWeight: "900",
    },
    customerName: {
      marginTop: 3,
      color: iosPalette.muted,
      fontSize: 13,
    },
    productName: {
      marginTop: 12,
      color: iosPalette.text,
      fontSize: 17,
      fontWeight: "800",
    },
    metaGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 13,
    },
    metaItem: {
      minWidth: "30%",
      flexGrow: 1,
      flexBasis: "30%",
      borderRadius: 14,
      padding: 10,
      backgroundColor: iosPalette.grouped,
    },
    metaLabel: {
      color: iosPalette.muted,
      fontSize: 11,
      fontWeight: "800",
    },
    metaValue: {
      marginTop: 4,
      color: iosPalette.text,
      fontSize: 14,
      fontWeight: "800",
    },
    orderMetaList: {
      gap: 8,
      marginTop: 13,
    },
    orderMetaRow: {
      width: "100%",
      minHeight: 44,
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
      borderRadius: 12,
      paddingVertical: 10,
      paddingHorizontal: 11,
      backgroundColor: iosPalette.grouped,
    },
    orderMetaLabel: {
      width: 84,
      flexShrink: 0,
      color: iosPalette.muted,
      fontSize: 12,
      fontWeight: "800",
      lineHeight: 18,
    },
    orderMetaValue: {
      flex: 1,
      color: iosPalette.text,
      fontSize: 14,
      fontWeight: "800",
      lineHeight: 20,
      textAlign: "right",
    },
    cardActions: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 10,
      marginTop: 14,
    },
    deliveryProgressTrack: {
      height: 7,
      overflow: "hidden",
      borderRadius: 999,
      backgroundColor: iosPalette.grouped,
    },
    deliveryProgressFill: {
      height: "100%",
      borderRadius: 999,
      backgroundColor: iosPalette.success,
    },
    deliveryExpandHint: {
      color: iosPalette.accent,
      fontSize: 12,
      fontWeight: "800",
    },
    deliveryExpandedArea: {
      gap: 12,
      marginTop: 14,
    },
    deliveryItemList: {
      gap: 8,
    },
    deliveryItemRow: {
      minHeight: 58,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      borderRadius: 14,
      padding: 12,
      backgroundColor: iosPalette.grouped,
    },
    deliveryItemMain: {
      flex: 1,
      minWidth: 0,
    },
    deliveryItemTitle: {
      color: iosPalette.text,
      fontSize: 14,
      fontWeight: "900",
    },
    deliveryItemMeta: {
      marginTop: 4,
      color: iosPalette.muted,
      fontSize: 12,
      fontWeight: "700",
      lineHeight: 17,
    },
    deliveryItemStatus: {
      flexShrink: 0,
      overflow: "hidden",
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
      fontSize: 12,
      fontWeight: "900",
    },
    deliveryItemStatusPending: {
      color: "#9A6200",
      backgroundColor: iosPalette.warningSoft,
    },
    deliveryItemStatusDone: {
      color: "#1F8B4C",
      backgroundColor: iosPalette.successSoft,
    },
    deliveryHistoryBox: {
      gap: 8,
      borderRadius: 14,
      padding: 12,
      backgroundColor: iosPalette.grouped,
    },
    deliveryHistoryTitle: {
      color: iosPalette.textSoft,
      fontSize: 13,
      fontWeight: "900",
    },
    deliveryHistoryRow: {
      gap: 3,
      borderRadius: 12,
      padding: 10,
      backgroundColor: iosPalette.surface,
    },
    deliveryHistoryMain: {
      color: iosPalette.text,
      fontSize: 13,
      fontWeight: "900",
    },
    deliveryHistoryMeta: {
      color: iosPalette.muted,
      fontSize: 12,
      lineHeight: 17,
    },
    deliveryHistoryEmpty: {
      color: iosPalette.muted,
      fontSize: 12,
      fontWeight: "700",
      lineHeight: 18,
    },
    lightButton: {
      minHeight: 44,
      justifyContent: "center",
      borderRadius: 999,
      paddingHorizontal: 16,
      backgroundColor: iosPalette.grouped,
    },
    lightButtonText: {
      color: iosPalette.textSoft,
      fontWeight: "800",
    },
    doneButton: {
      minHeight: 44,
      justifyContent: "center",
      borderRadius: 999,
      paddingHorizontal: 16,
      backgroundColor: iosPalette.success,
    },
    doneButtonDisabled: {
      opacity: 0.5,
    },
    doneButtonText: {
      color: "#FFFFFF",
      fontWeight: "900",
    },
    statusChip: {
      flexShrink: 0,
      borderRadius: 999,
      paddingHorizontal: 11,
      paddingVertical: 6,
      backgroundColor: iosPalette.grouped,
    },
    statusPending: {
      backgroundColor: iosPalette.warningSoft,
    },
    statusScheduled: {
      backgroundColor: iosPalette.accentSoft,
    },
    statusCompleted: {
      backgroundColor: iosPalette.successSoft,
    },
    statusDeliveryOpened: {
      backgroundColor: iosPalette.tealSoft,
    },
    statusPartialDelivered: {
      backgroundColor: iosPalette.warningSoft,
    },
    statusDelivered: {
      backgroundColor: "#ECEBFF",
    },
    statusReconciled: {
      backgroundColor: iosPalette.purpleSoft,
    },
    statusPaid: {
      backgroundColor: "#E3FBF7",
    },
    statusIssue: {
      backgroundColor: iosPalette.dangerSoft,
    },
    statusText: {
      color: iosPalette.textSoft,
      fontSize: 12,
      fontWeight: "800",
    },
    statusPendingText: {
      color: "#9A6200",
    },
    statusScheduledText: {
      color: iosPalette.accent,
    },
    statusCompletedText: {
      color: "#1F8B4C",
    },
    statusDeliveryOpenedText: {
      color: "#087D92",
    },
    statusPartialDeliveredText: {
      color: "#9A6200",
    },
    statusDeliveredText: {
      color: "#4E4CC9",
    },
    statusReconciledText: {
      color: iosPalette.purple,
    },
    statusPaidText: {
      color: "#0D9488",
    },
    statusIssueText: {
      color: iosPalette.danger,
    },
    stateBox: {
      minHeight: 180,
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      padding: 20,
    },
    stateText: {
      color: iosPalette.muted,
      textAlign: "center",
      lineHeight: 20,
    },
    emptyTitle: {
      color: iosPalette.text,
      fontSize: 18,
      fontWeight: "900",
      textAlign: "center",
    },
    modalSafeArea: {
      flex: 1,
      backgroundColor: iosPalette.background,
    },
    modalContent: {
      flex: 1,
      paddingHorizontal: 18,
      paddingTop: 14,
      paddingBottom: 18,
    },
    modalHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 16,
    },
    modalTitle: {
      marginTop: 4,
      color: iosPalette.text,
      fontSize: 24,
      fontWeight: "900",
    },
    closeButton: {
      minHeight: 44,
      justifyContent: "center",
      borderRadius: 999,
      paddingHorizontal: 16,
      backgroundColor: iosPalette.surface,
    },
    closeButtonText: {
      color: iosPalette.accent,
      fontWeight: "800",
    },
    detailList: {
      gap: 10,
      paddingBottom: 18,
    },
    detailFieldPanel: {
      gap: 12,
      borderRadius: 18,
      padding: 14,
      backgroundColor: iosPalette.surface,
      ...shadowSoft,
    },
    detailFieldHead: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    detailRow: {
      borderRadius: 16,
      padding: 14,
      backgroundColor: iosPalette.surface,
      ...shadowSoft,
    },
    detailLabel: {
      color: iosPalette.muted,
      fontSize: 12,
      fontWeight: "800",
    },
    detailValue: {
      marginTop: 5,
      color: iosPalette.text,
      fontSize: 16,
      fontWeight: "700",
    },
    detailValueMultiline: {
      lineHeight: 22,
    },
    modalDoneButton: {
      minHeight: 52,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 14,
      backgroundColor: iosPalette.success,
    },
    completionBackdrop: {
      flex: 1,
      justifyContent: "center",
      padding: 18,
      backgroundColor: "rgba(15, 23, 42, 0.38)",
    },
    completionKeyboard: {
      width: "100%",
      maxHeight: "92%",
    },
    completionScroll: {
      width: "100%",
    },
    completionScrollContent: {
      flexGrow: 1,
      justifyContent: "center",
    },
    completionCard: {
      borderRadius: 20,
      padding: 18,
      backgroundColor: iosPalette.surface,
      ...shadowCard,
    },
    completionTitle: {
      marginTop: 6,
      color: iosPalette.text,
      fontSize: 20,
      fontWeight: "900",
    },
    completionMeta: {
      marginTop: 4,
      color: iosPalette.muted,
      fontWeight: "700",
    },
    completionField: {
      gap: 8,
      marginTop: 14,
    },
    deliverySignItemList: {
      gap: 8,
    },
    deliverySignItem: {
      minHeight: 60,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderRadius: 14,
      padding: 12,
      backgroundColor: iosPalette.grouped,
    },
    deliverySignItemSelected: {
      backgroundColor: iosPalette.accentSoft,
    },
    deliverySignItemDisabled: {
      opacity: 0.68,
    },
    deliverySignCheck: {
      width: 26,
      height: 26,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 13,
      backgroundColor: iosPalette.surface,
    },
    deliverySignCheckSelected: {
      backgroundColor: iosPalette.accent,
    },
    deliverySignCheckDone: {
      backgroundColor: iosPalette.success,
    },
    deliverySignCheckText: {
      color: iosPalette.muted,
      fontSize: 15,
      fontWeight: "900",
    },
    deliverySignCheckTextActive: {
      color: "#FFFFFF",
    },
    deliverySignItemText: {
      flex: 1,
      minWidth: 0,
    },
    completionLabel: {
      color: iosPalette.textSoft,
      fontSize: 13,
      fontWeight: "800",
    },
    completionInput: {
      minHeight: 48,
      borderRadius: 12,
      paddingHorizontal: 14,
      color: iosPalette.text,
      backgroundColor: iosPalette.grouped,
      fontSize: 15,
    },
    completionTextarea: {
      minHeight: 86,
      paddingTop: 10,
      textAlignVertical: "top",
    },
    photoHint: {
      borderRadius: 14,
      padding: 12,
      color: "#7A4B00",
      backgroundColor: iosPalette.warningSoft,
      fontWeight: "700",
    },
    photoButton: {
      minHeight: 46,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 14,
      backgroundColor: iosPalette.accent,
    },
    photoButtonText: {
      color: "#FFFFFF",
      fontWeight: "900",
    },
    photoPreviewWrap: {
      gap: 10,
    },
    photoPreview: {
      width: "100%",
      height: 180,
      borderRadius: 16,
      backgroundColor: iosPalette.grouped,
    },
    completionActions: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 10,
      marginTop: 16,
    },
  }),
};
