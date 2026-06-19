import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

const statusOptions = ['未完成', '已排产', '已完成', '已开送货单', '部分送货', '已送货', '已开对账单', '已付款', '异常'];
const completionTimeField = 'completionTime';
const completionOperatorField = 'completionOperator';
const completionNoteField = 'completionNote';
const completionPhotoField = 'completionPhoto';
const completionPhotoAtField = 'completionPhotoAt';
const mobileUserStorageKey = 'foam-crm-mobile-user';
const mobileApiStorageKey = 'foam-crm-mobile-api-url';
const mobileOfflineQueueStorageKey = 'foam-crm-mobile-offline-queue';
const defaultMobileCardDisplayFields = [];
const internalOrderFields = new Set(['id', completionPhotoField]);
const baseMobileOrderFields = [
  { field: '_customerName', label: '客户' },
  { field: 'orderNo', label: '订单号' },
  { field: 'status', label: '进度' },
  { field: 'date', label: '订单日期', type: 'date' },
  { field: 'product', label: '产品' },
  { field: 'quantity', label: '数量', type: 'number' },
  { field: 'amount', label: '金额', type: 'amount' },
  { field: 'dueDate', label: '交期', type: 'date' },
  { field: 'productionDate', label: '排产日期', type: 'date' },
  { field: 'productionQuantity', label: '排产数量', type: 'number' },
  { field: 'productionLine', label: '员工姓名' },
  { field: 'deliveredQuantity', label: '已送数量', type: 'number' },
  { field: 'remainingQuantity', label: '剩余数量', type: 'number' },
  { field: completionTimeField, label: '完成时间', type: 'datetime' },
  { field: completionOperatorField, label: '完成人' },
  { field: completionNoteField, label: '完成备注' },
  { field: completionPhotoAtField, label: '完成照片时间', type: 'datetime' },
  { field: 'completionUserName', label: '完成账号' },
  { field: 'followUp', label: '跟进记录' },
];

function inferDevelopmentApiBaseUrl() {
  const hostUri = Constants.expoConfig?.hostUri
    || Constants.manifest2?.extra?.expoClient?.hostUri
    || Constants.manifest?.debuggerHost
    || '';
  const host = String(hostUri).split(':')[0];
  if (host) return `http://${host}:3001/api`;
  return 'http://127.0.0.1:3001/api';
}

const envApiBaseUrl = typeof process !== 'undefined'
  ? process.env?.EXPO_PUBLIC_API_BASE_URL
  : '';
const defaultApiBaseUrl = envApiBaseUrl || inferDevelopmentApiBaseUrl();

function normalizeStatus(status = '') {
  if (statusOptions.includes(status)) return status;
  if (status === '已发货') return '已送货';
  return '未完成';
}

function normalizeUserRole(role = '') {
  if (role === 'admin' || role === 'employee') return role;
  return 'pending';
}

function roleLabel(role = '') {
  const normalized = normalizeUserRole(role);
  if (normalized === 'admin') return '管理员';
  if (normalized === 'employee') return '员工';
  return '普通用户';
}

function isAssignedUserRole(role = '') {
  const normalized = normalizeUserRole(role);
  return normalized === 'admin' || normalized === 'employee';
}

function isScheduledProductionOrder(order) {
  return normalizeStatus(order.status) === '已排产';
}

function parseDateValue(value) {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER;
}

function formatNumber(value) {
  if (value === '' || value == null) return '-';
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString('zh-CN') : String(value);
}

function parseMobileNumber(value) {
  const number = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(number) ? number : 0;
}

function formatMoney(value) {
  if (value === '' || value == null || Number.isNaN(Number(value))) return '-';
  return `¥${parseMobileNumber(value).toFixed(2)}`;
}

function fieldText(value) {
  if (value === '' || value == null) return '-';
  return String(value);
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatElapsed(isoString) {
  const elapsed = Date.now() - new Date(isoString).getTime();
  if (elapsed < 60000) return '刚刚';
  if (elapsed < 3600000) return `${Math.floor(elapsed / 60000)} 分钟前`;
  if (elapsed < 86400000) return `${Math.floor(elapsed / 3600000)} 小时前`;
  return `${Math.floor(elapsed / 86400000)} 天前`;
}

function formatMobileFieldValue(order, fieldConfig) {
  const value = order?.[fieldConfig.field];
  if (fieldConfig.field === 'status') return normalizeStatus(value);
  if (fieldConfig.type === 'datetime') return formatDateTime(value);
  if (fieldConfig.type === 'number') return formatNumber(value);
  if (fieldConfig.type === 'amount') {
    if (value === '' || value == null) return '-';
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(2) : String(value);
  }
  return fieldText(value);
}

function hasOrderFieldValue(order, field) {
  if (!order) return false;
  if (field === '_customerName') return Boolean(order._customerName);
  return Object.prototype.hasOwnProperty.call(order, field);
}

function getPhotoUri(photo) {
  if (!photo) return '';
  if (typeof photo === 'string') return photo;
  return photo.uri || photo.dataUrl || photo.url || photo.src || '';
}

function materialOptionKey(material = {}, index = 0) {
  return String(material.id || `${material.materialName || 'material'}-${material.unit || ''}-${material.unitCost || ''}-${index}`);
}

function buildMobileOrderDisplayFields(customers = []) {
  const fields = new Map(baseMobileOrderFields.map(field => [field.field, field]));

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
        if (internalOrderFields.has(field) || field.startsWith('_') || fields.has(field)) continue;
        fields.set(field, { field, label: field });
      }
    }
  }

  return Array.from(fields.values());
}

function getOrderDisplayFields(order, fieldOptions = []) {
  return fieldOptions.filter(option => hasOrderFieldValue(order, option.field));
}

function flattenOrders(customers = []) {
  return customers.flatMap(customer =>
    (customer.orders || []).map((order, orderIndex) => ({
      ...order,
      _customerId: customer.id,
      _customerName: customer.name,
      _orderIndex: orderIndex,
    })),
  );
}

function flattenDeliveries(customers = []) {
  return customers.flatMap(customer =>
    (customer.deliveries || [])
      .filter(delivery => delivery?._finalDelivery !== false)
      .map((delivery, deliveryIndex) => ({
        ...delivery,
        _customerId: customer.id,
        _customerName: customer.name,
        _deliveryIndex: deliveryIndex,
      })),
  );
}

function flattenCostEntries(customers = []) {
  return customers.flatMap(customer =>
    (customer.costEntries || []).map((entry, entryIndex) => ({
      ...entry,
      _customerId: customer.id,
      _customerName: customer.name,
      _entryIndex: entryIndex,
    })),
  );
}

function isDeliverySigned(delivery = {}) {
  return delivery.status === '已送' || Boolean(delivery.signedAt);
}

function makeQueueId(type) {
  return `${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function summarizeCustomers(customers = []) {
  const allOrders = flattenOrders(customers);
  const allCosts = flattenCostEntries(customers);
  const pendingCosts = allCosts.filter(entry => (entry.approvalStatus || '待审核') === '待审核');
  const approvedCosts = allCosts.filter(entry => entry.approvalStatus === '已通过');
  const deliveries = flattenDeliveries(customers);
  return {
    orderCount: allOrders.length,
    scheduled: allOrders.filter(isScheduledProductionOrder).length,
    completed: allOrders.filter(order => normalizeStatus(order.status) === '已完成').length,
    overdue: allOrders.filter(order => {
      if (!isScheduledProductionOrder(order) || !order.dueDate) return false;
      return new Date(order.dueDate).setHours(0, 0, 0, 0) < new Date().setHours(0, 0, 0, 0);
    }).length,
    deliveryPending: deliveries.filter(delivery => !isDeliverySigned(delivery)).length,
    pendingCostCount: pendingCosts.length,
    pendingCostAmount: pendingCosts.reduce((sum, entry) => sum + parseMobileNumber(entry.amount), 0),
    approvedCostAmount: approvedCosts.reduce((sum, entry) => sum + parseMobileNumber(entry.amount), 0),
    orderAmount: allOrders.reduce((sum, order) => sum + parseMobileNumber(order.amount), 0),
    paidAmount: customers
      .flatMap(customer => customer.payments || [])
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
  ].filter(Boolean).join(' ').toLowerCase();
}

export default function App() {
  const [apiBaseUrl, setApiBaseUrl] = useState(defaultApiBaseUrl);
  const [apiDraft, setApiDraft] = useState(defaultApiBaseUrl);
  const [authLoading, setAuthLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [registerName, setRegisterName] = useState('');
  const [registerPhone, setRegisterPhone] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState('');
  const [registering, setRegistering] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('all');
  const [activeView, setActiveView] = useState('workbench');
  const [query, setQuery] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingOrderId, setSavingOrderId] = useState('');
  const [error, setError] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [completionOrder, setCompletionOrder] = useState(null);
  const [completionOperator, setCompletionOperator] = useState('');
  const [completionNote, setCompletionNote] = useState('');
  const [completionPhoto, setCompletionPhoto] = useState(null);
  const [mobileCardDisplayFields, setMobileCardDisplayFields] = useState(defaultMobileCardDisplayFields);
  const [detailUsesAllFields, setDetailUsesAllFields] = useState(true);
  const [detailDisplayFields, setDetailDisplayFields] = useState([]);
  const [costCustomerId, setCostCustomerId] = useState('');
  const [costMaterialKey, setCostMaterialKey] = useState('');
  const [costQuantity, setCostQuantity] = useState('1');
  const [costNote, setCostNote] = useState('');
  const [costPhoto, setCostPhoto] = useState(null);
  const [savingCost, setSavingCost] = useState(false);
  const [offlineQueue, setOfflineQueue] = useState([]);
  const [syncingQueue, setSyncingQueue] = useState(false);
  const [syncStatus, setSyncStatus] = useState({}); // { itemId: 'pending'|'syncing'|'synced'|'failed' }
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [deliverySign, setDeliverySign] = useState(null);
  const [deliverySigner, setDeliverySigner] = useState('');
  const [deliverySignNote, setDeliverySignNote] = useState('');
  const [deliverySignPhoto, setDeliverySignPhoto] = useState(null);
  const [savingDeliveryId, setSavingDeliveryId] = useState('');
  const [approvalNoteByEntry, setApprovalNoteByEntry] = useState({});

  const request = useCallback(async (path, options = {}) => {
    const baseUrl = apiBaseUrl.replace(/\/$/, '');
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(currentUser?.token ? { 'X-Mobile-User-Token': currentUser.token } : {}),
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
  }, [apiBaseUrl, currentUser?.token]);

  const loadCustomers = useCallback(async ({ silent = false } = {}) => {
    if (!currentUser?.token) {
      setCustomers([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (!silent) setLoading(true);
    setError('');
    try {
      const session = await request('/users/me');
      if (session.user) {
        setCurrentUser(session.user);
        await AsyncStorage.setItem(mobileUserStorageKey, JSON.stringify(session.user));
      }
      if (!isAssignedUserRole(session.user?.role)) {
        setCustomers([]);
        return;
      }
      const result = await request('/customers?limit=200');
      const list = result.data || result;
      setCustomers(Array.isArray(list) ? list : []);
    } catch (err) {
      if (err.status === 401) {
        await AsyncStorage.removeItem(mobileUserStorageKey);
        setCurrentUser(null);
        setCustomers([]);
      }
      setError(err.message || '连接失败');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentUser?.token, request]);

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
    return () => { mounted = false; };
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

  const enqueueOfflineAction = useCallback(async (action) => {
    const item = {
      id: makeQueueId(action.type || 'offline'),
      createdAt: new Date().toISOString(),
      retryCount: 0,
      lastRetryAt: null,
      ...action,
    };
    await persistOfflineQueue([...offlineQueue, item]);
    return item;
  }, [offlineQueue, persistOfflineQueue]);

  const allOrders = useMemo(() => flattenOrders(customers), [customers]);
  const allDeliveries = useMemo(() => flattenDeliveries(customers), [customers]);
  const allCostEntries = useMemo(() => flattenCostEntries(customers), [customers]);
  const currentRole = normalizeUserRole(currentUser?.role);
  const isRoleAssigned = isAssignedUserRole(currentRole);
  const isAdmin = currentRole === 'admin';
  const dashboardSummary = useMemo(() => summarizeCustomers(customers), [customers]);
  const selectedCostCustomer = useMemo(() => (
    customers.find(customer => customer.id === costCustomerId)
    || (selectedCustomerId !== 'all' ? customers.find(customer => customer.id === selectedCustomerId) : null)
    || customers.find(customer => (customer.materialCosts || []).length > 0)
    || customers[0]
    || null
  ), [costCustomerId, customers, selectedCustomerId]);
  const costMaterialOptions = selectedCostCustomer?.materialCosts || [];
  const selectedCostMaterial = useMemo(() => (
    costMaterialOptions.find((material, index) => materialOptionKey(material, index) === costMaterialKey)
    || costMaterialOptions[0]
    || null
  ), [costMaterialKey, costMaterialOptions]);
  const costUnitCost = parseMobileNumber(selectedCostMaterial?.unitCost);
  const hasVisibleCostPrice = selectedCostMaterial?.unitCost !== '' && selectedCostMaterial?.unitCost != null;
  const costAmount = hasVisibleCostPrice ? parseMobileNumber(costQuantity) * costUnitCost : null;
  const recentCostEntries = useMemo(() => (
    [...(selectedCostCustomer?.costEntries || [])]
      .sort((a, b) => parseDateValue(b.enteredAt || b.date) - parseDateValue(a.enteredAt || a.date))
      .slice(0, 12)
  ), [selectedCostCustomer?.costEntries]);
  const pendingCostEntries = useMemo(() => (
    allCostEntries
      .filter(entry => (entry.approvalStatus || '待审核') === '待审核')
      .sort((a, b) => parseDateValue(a.enteredAt || a.date) - parseDateValue(b.enteredAt || b.date))
  ), [allCostEntries]);
  const pendingDeliveries = useMemo(() => (
    allDeliveries
      .filter(delivery => !isDeliverySigned(delivery))
      .sort((a, b) => parseDateValue(a.date) - parseDateValue(b.date) || a._deliveryIndex - b._deliveryIndex)
  ), [allDeliveries]);
  const scheduledOrdersForWorkbench = useMemo(() => (
    allOrders
      .filter(isScheduledProductionOrder)
      .sort((a, b) => (
        parseDateValue(a.productionDate || a.dueDate) - parseDateValue(b.productionDate || b.dueDate)
        || parseDateValue(a.date) - parseDateValue(b.date)
        || a._orderIndex - b._orderIndex
      ))
  ), [allOrders]);
  const reminders = useMemo(() => {
    const todayTs = new Date().setHours(0, 0, 0, 0);
    const threeDaysTs = todayTs + 3 * 86400000;
    const list = [];
    for (const order of allOrders) {
      if (!isScheduledProductionOrder(order)) continue;
      if (!order.dueDate) continue;
      const dueTs = new Date(order.dueDate).setHours(0, 0, 0, 0);
      if (dueTs < todayTs) {
        list.push({ id: `overdue-${order._customerId}-${order.id}`, tone: 'danger', title: '订单已逾期', text: `${order._customerName} · ${order.orderNo || order.product}` });
      } else if (dueTs <= threeDaysTs) {
        list.push({ id: `due-${order._customerId}-${order.id}`, tone: 'warning', title: '订单即将到期', text: `${order._customerName} · ${order.orderNo || order.product} · ${order.dueDate}` });
      }
    }
    if (offlineQueue.length) {
      list.unshift({ id: 'offline-queue', tone: 'warning', title: '有离线记录待同步', text: `${offlineQueue.length} 条记录会在网络恢复后同步` });
    }
    if (isAdmin && pendingCostEntries.length) {
      list.unshift({ id: 'cost-approval', tone: 'info', title: '成本待审批', text: `${pendingCostEntries.length} 条成本记录等待审批` });
    }
    if (pendingDeliveries.length) {
      list.push({ id: 'delivery-sign', tone: 'info', title: '送货待签收', text: `${pendingDeliveries.length} 张送货单未签收` });
    }
    return list.slice(0, 8);
  }, [allOrders, isAdmin, offlineQueue.length, pendingCostEntries.length, pendingDeliveries.length]);
  const mobileDisplayFieldOptions = useMemo(() => buildMobileOrderDisplayFields(customers), [customers]);
  const selectedMobileCardDisplayFields = useMemo(() => {
    const optionByField = new Map(mobileDisplayFieldOptions.map(option => [option.field, option]));
    return mobileCardDisplayFields.map(field => optionByField.get(field)).filter(Boolean);
  }, [mobileDisplayFieldOptions, mobileCardDisplayFields]);
  const toggleMobileCardDisplayField = useCallback((field) => {
    setMobileCardDisplayFields(current => (
      current.includes(field)
        ? current.filter(item => item !== field)
        : [...current, field]
    ));
  }, []);
  const toggleDetailDisplayField = useCallback((field) => {
    setDetailUsesAllFields(false);
    setDetailDisplayFields(current => {
      const allFields = mobileDisplayFieldOptions.map(option => option.field);
      const base = detailUsesAllFields ? allFields : current;
      return base.includes(field)
        ? base.filter(item => item !== field)
        : [...base, field];
    });
  }, [detailUsesAllFields, mobileDisplayFieldOptions]);
  const showAllDetailFields = useCallback(() => {
    setDetailUsesAllFields(true);
    setDetailDisplayFields([]);
  }, []);
  const clearDetailFields = useCallback(() => {
    setDetailUsesAllFields(false);
    setDetailDisplayFields([]);
  }, []);
  useEffect(() => {
    const employeeViews = new Set(['workbench', 'alerts', 'schedule', 'delivery', 'cost']);
    if (!isAdmin && !employeeViews.has(activeView)) setActiveView('workbench');
  }, [activeView, isAdmin]);
  useEffect(() => {
    const preferredCustomerId = selectedCustomerId !== 'all'
      && customers.some(customer => customer.id === selectedCustomerId)
      ? selectedCustomerId
      : '';
    const nextCustomerId = preferredCustomerId
      || (customers.some(customer => customer.id === costCustomerId) ? costCustomerId : '')
      || customers.find(customer => (customer.materialCosts || []).length > 0)?.id
      || customers[0]?.id
      || '';
    if (nextCustomerId !== costCustomerId) setCostCustomerId(nextCustomerId);
  }, [costCustomerId, customers, selectedCustomerId]);
  useEffect(() => {
    if (!costMaterialOptions.length) {
      if (costMaterialKey) setCostMaterialKey('');
      return;
    }
    const hasSelected = costMaterialOptions.some((material, index) => materialOptionKey(material, index) === costMaterialKey);
    if (!hasSelected) setCostMaterialKey(materialOptionKey(costMaterialOptions[0], 0));
  }, [costMaterialKey, costMaterialOptions]);
  const visibleOrders = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const view = isAdmin ? activeView : 'schedule';
    return allOrders
      .filter(order => selectedCustomerId === 'all' || order._customerId === selectedCustomerId)
      .filter(order => {
        const status = normalizeStatus(order.status);
        if (view === 'schedule') return isScheduledProductionOrder(order);
        if (view === 'completed') return status === '已完成';
        return true;
      })
      .filter(order => !keyword || orderSearchText(order).includes(keyword))
      .sort((a, b) => {
        if (view === 'schedule') {
          return parseDateValue(a.productionDate || a.dueDate) - parseDateValue(b.productionDate || b.dueDate)
            || parseDateValue(a.date) - parseDateValue(b.date)
            || a._orderIndex - b._orderIndex;
        }
        return parseDateValue(b.date) - parseDateValue(a.date)
          || b._orderIndex - a._orderIndex;
      });
  }, [activeView, allOrders, isAdmin, query, selectedCustomerId]);

  const stats = useMemo(() => {
    const open = allOrders.filter(isScheduledProductionOrder).length;
    const completed = allOrders.filter(order => normalizeStatus(order.status) === '已完成').length;
    return {
      all: allOrders.length,
      open,
      completed,
    };
  }, [allOrders]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    loadCustomers({ silent: true });
  }, [loadCustomers]);

  const registerMobileUser = useCallback(async () => {
    const name = registerName.trim();
    const phone = registerPhone.trim();
    const password = registerPassword;
    const confirmPassword = registerConfirmPassword;
    const nextApiUrl = apiDraft.trim().replace(/\/$/, '');
    if (!nextApiUrl) {
      Alert.alert('请填写后端地址', '格式例如：http://电脑IP:3001/api');
      return;
    }
    if (!name || !phone) {
      Alert.alert('请填写注册信息', '姓名和手机号都需要填写。');
      return;
    }
    if (password.length < 6) {
      Alert.alert('密码太短', '密码至少需要 6 位。');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('两次密码不一致', '请重新输入并确认密码。');
      return;
    }

    setRegistering(true);
    setError('');
    try {
      const response = await fetch(`${nextApiUrl}/users/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, password }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `HTTP ${response.status}`);
      }
      const result = await response.json();
      if (!result.user?.token) throw new Error('注册失败，服务端没有返回账号信息');
      await AsyncStorage.multiSet([
        [mobileApiStorageKey, nextApiUrl],
        [mobileUserStorageKey, JSON.stringify(result.user)],
      ]);
      setApiBaseUrl(nextApiUrl);
      setApiDraft(nextApiUrl);
      setCurrentUser(result.user);
      setRegisterName('');
      setRegisterPhone('');
      setRegisterPassword('');
      setRegisterConfirmPassword('');
      setLoading(true);
    } catch (err) {
      Alert.alert('注册失败', err.message || '无法连接服务器');
    } finally {
      setRegistering(false);
    }
  }, [apiDraft, registerConfirmPassword, registerName, registerPassword, registerPhone]);

  const logoutMobileUser = useCallback(async () => {
    await AsyncStorage.removeItem(mobileUserStorageKey);
    setCurrentUser(null);
    setCustomers([]);
    setSelectedOrder(null);
    setCompletionOrder(null);
    setActiveView('workbench');
  }, []);

  const applyApiUrl = useCallback(() => {
    const next = apiDraft.trim().replace(/\/$/, '');
    if (!next) return;
    setApiBaseUrl(next);
    AsyncStorage.setItem(mobileApiStorageKey, next);
    setShowSettings(false);
  }, [apiDraft]);

  const updateLocalOrder = useCallback((customerId, row) => {
    setCustomers(current => current.map(customer => {
      if (customer.id !== customerId) return customer;
      return {
        ...customer,
        orders: (customer.orders || []).map(order => order.id === row.id ? row : order),
      };
    }));
    setSelectedOrder(current => {
      if (!current || current.id !== row.id || current._customerId !== customerId) return current;
      return { ...row, _customerId: customerId, _customerName: current._customerName };
    });
  }, []);

  const updateLocalDelivery = useCallback((customerId, row) => {
    setCustomers(current => current.map(customer => (
      customer.id === customerId
        ? { ...customer, deliveries: (customer.deliveries || []).map(delivery => delivery.id === row.id ? row : delivery) }
        : customer
    )));
    setDeliverySign(current => {
      if (!current || current.id !== row.id || current._customerId !== customerId) return current;
      return { ...row, _customerId: customerId, _customerName: current._customerName };
    });
  }, []);

  const updateLocalCostEntry = useCallback((customerId, row) => {
    setCustomers(current => current.map(customer => (
      customer.id === customerId
        ? {
          ...customer,
          costEntries: (customer.costEntries || []).map(entry => entry.id === row.id ? row : entry),
        }
        : customer
    )));
  }, []);

  const saveOrderStatus = useCallback(async (order, status, patch = {}) => {
    try {
      const result = await request(
        `/customers/${order._customerId}/orders/${order.id}/status`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status, ...patch }),
        },
      );
      return result.row || { ...order, ...patch, status };
    } catch (err) {
      if (err.status !== 404 && err.status !== 405) throw err;

      const customer = customers.find(item => item.id === order._customerId);
      if (!customer) throw err;
      const rows = (customer.orders || []).map(row =>
        row.id === order.id ? { ...row, ...patch, status } : row,
      );
      const result = await request(`/customers/${order._customerId}/orders`, {
        method: 'PUT',
        body: JSON.stringify({ rows }),
      });
      const savedRows = result.rows || rows;
      setCustomers(current => current.map(item =>
        item.id === order._customerId ? { ...item, orders: savedRows } : item,
      ));
      return savedRows.find(row => row.id === order.id) || { ...order, ...patch, status };
    }
  }, [customers, request]);

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

        setSyncStatus(current => ({ ...current, [item.id]: 'syncing' }));
        try {
          if (item.type === 'complete-order') {
            const result = await request(`/customers/${item.customerId}/orders/${item.orderId}/status`, {
              method: 'PATCH',
              body: JSON.stringify({ status: '已完成', ...(item.payload || {}) }),
            });
            updateLocalOrder(item.customerId, result.row || { ...(item.payload || {}), id: item.orderId, status: '已完成' });
          }
          if (item.type === 'cost-entry') {
            const result = await request(`/customers/${item.customerId}/cost-entries`, {
              method: 'POST',
              body: JSON.stringify(item.payload || {}),
            });
            const syncedRow = result.row || { ...(item.payload || {}), id: item.localRowId || makeQueueId('costEntries') };
            setCustomers(current => current.map(customer => (
              customer.id === item.customerId
                ? {
                  ...customer,
                  costEntries: (() => {
                    let replaced = false;
                    const nextEntries = (customer.costEntries || []).map(entry => {
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
                : customer
            )));
          }
          if (item.type === 'delivery-sign') {
            const result = await request(`/customers/${item.customerId}/deliveries/${item.deliveryId}/sign`, {
              method: 'PATCH',
              body: JSON.stringify(item.payload || {}),
            });
            updateLocalDelivery(item.customerId, result.row || { ...(item.payload || {}), id: item.deliveryId, status: '已送' });
          }

          // Success — remove from queue
          nextQueue = nextQueue.filter(queued => queued.id !== item.id);
          setSyncStatus(current => ({ ...current, [item.id]: 'synced' }));
          hasSuccess = true;
          await persistOfflineQueue(nextQueue);
        } catch {
          // Mark for retry with backoff
          const updatedItem = { ...item, retryCount: (item.retryCount || 0) + 1, lastRetryAt: new Date().toISOString() };
          nextQueue = nextQueue.map(queued => queued.id === item.id ? updatedItem : queued);
          setSyncStatus(current => ({ ...current, [item.id]: 'failed' }));
          await persistOfflineQueue(nextQueue);
          // Continue with next item — don't break on single failure
          continue;
        }
      }
    } finally {
      setSyncingQueue(false);
      if (hasSuccess) {
        setLastSyncAt(new Date().toISOString());
      }
    }
  }, [
    currentUser?.token,
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
      const hasFailedItems = offlineQueue.some(item => item.retryCount > 0);
      if (hasFailedItems) syncOfflineQueue();
    }, 30000);

    return () => clearInterval(interval);
  }, [currentUser?.token, loading, offlineQueue.length, syncOfflineQueue]);

  const markCompleted = useCallback((order) => {
    setCompletionOrder(order);
    setCompletionOperator(order[completionOperatorField] || currentUser?.name || '手机端');
    setCompletionNote(order[completionNoteField] || '');
    setCompletionPhoto(null);
  }, [currentUser?.name]);

  const closeCompletionModal = useCallback(() => {
    if (savingOrderId) return;
    setCompletionOrder(null);
    setCompletionOperator('');
    setCompletionNote('');
    setCompletionPhoto(null);
  }, [savingOrderId]);

  const takeCompletionPhoto = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('需要相机权限', '请允许相机权限后再拍照上传完成照片。');
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
      Alert.alert('拍照失败', '没有拿到照片数据，请重新拍照。');
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
      Alert.alert('需要完成照片', '请先拍照上传，才能确认订单已完成。');
      return;
    }
    const patch = {
      [completionTimeField]: new Date().toISOString(),
      [completionOperatorField]: completionOperator.trim() || currentUser?.name || '手机端',
      [completionNoteField]: completionNote.trim(),
      [completionPhotoField]: {
        dataUrl: completionPhoto.dataUrl,
        width: completionPhoto.width,
        height: completionPhoto.height,
        takenAt: completionPhoto.takenAt,
        uploadedBy: currentUser?.name || completionOperator.trim() || '手机端',
      },
      [completionPhotoAtField]: completionPhoto.takenAt || new Date().toISOString(),
    };
    setSavingOrderId(completionOrder.id);
    try {
      const row = await saveOrderStatus(completionOrder, '已完成', patch);
      updateLocalOrder(completionOrder._customerId, row);
      setCompletionOrder(null);
      setCompletionOperator('');
      setCompletionNote('');
      setCompletionPhoto(null);
    } catch {
      const offlineRow = {
        ...completionOrder,
        ...patch,
        status: '已完成',
        _offlinePending: true,
      };
      updateLocalOrder(completionOrder._customerId, offlineRow);
      await enqueueOfflineAction({
        type: 'complete-order',
        customerId: completionOrder._customerId,
        orderId: completionOrder.id,
        payload: patch,
      });
      setCompletionOrder(null);
      setCompletionOperator('');
      setCompletionNote('');
      setCompletionPhoto(null);
      Alert.alert('已离线暂存', '网络不可用，订单完成记录会在恢复连接后自动同步。');
    } finally {
      setSavingOrderId('');
    }
  }, [completionNote, completionOperator, completionOrder, completionPhoto, currentUser?.name, enqueueOfflineAction, saveOrderStatus, updateLocalOrder]);

  const takeCostPhoto = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('需要相机权限', '请允许相机权限后再拍照上传物料照片。');
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
      Alert.alert('拍照失败', '没有拿到照片数据，请重新拍照。');
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
    setDeliverySigner(delivery.signedBy || '');
    setDeliverySignNote(delivery.signedNote || '');
    setDeliverySignPhoto(null);
  }, []);

  const closeDeliverySign = useCallback(() => {
    if (savingDeliveryId) return;
    setDeliverySign(null);
    setDeliverySigner('');
    setDeliverySignNote('');
    setDeliverySignPhoto(null);
  }, [savingDeliveryId]);

  const takeDeliverySignPhoto = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('需要相机权限', '请允许相机权限后再拍照上传签收照片。');
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
      Alert.alert('拍照失败', '没有拿到照片数据，请重新拍照。');
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
      Alert.alert('请填写签收人', '送货签收需要填写客户或收货人姓名。');
      return;
    }
    if (!deliverySignPhoto?.dataUrl) {
      Alert.alert('需要签收照片', '请先拍照上传后再确认签收。');
      return;
    }
    const payload = {
      signer,
      note: deliverySignNote.trim(),
      photo: {
        dataUrl: deliverySignPhoto.dataUrl,
        width: deliverySignPhoto.width,
        height: deliverySignPhoto.height,
        takenAt: deliverySignPhoto.takenAt,
        uploadedBy: currentUser?.name || '手机端',
      },
    };
    setSavingDeliveryId(deliverySign.id);
    try {
      const result = await request(`/customers/${deliverySign._customerId}/deliveries/${deliverySign.id}/sign`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      updateLocalDelivery(deliverySign._customerId, result.row || { ...deliverySign, status: '已送', ...payload });
      closeDeliverySign();
    } catch {
      const offlineRow = {
        ...deliverySign,
        status: '已送',
        signedAt: new Date().toISOString(),
        signedBy: signer,
        signedNote: payload.note,
        signedPhoto: payload.photo,
        signedUserId: currentUser?.id || '',
        signedUserName: currentUser?.name || '',
        _offlinePending: true,
      };
      updateLocalDelivery(deliverySign._customerId, offlineRow);
      await enqueueOfflineAction({
        type: 'delivery-sign',
        customerId: deliverySign._customerId,
        deliveryId: deliverySign.id,
        payload,
      });
      closeDeliverySign();
      Alert.alert('已离线暂存', '网络不可用，送货签收会在恢复连接后自动同步。');
    } finally {
      setSavingDeliveryId('');
    }
  }, [
    closeDeliverySign,
    currentUser?.id,
    currentUser?.name,
    deliverySign,
    deliverySignNote,
    deliverySignPhoto,
    deliverySigner,
    enqueueOfflineAction,
    request,
    updateLocalDelivery,
  ]);

  const submitCostEntry = useCallback(async () => {
    if (!selectedCostCustomer?.id) {
      Alert.alert('请选择客户', '成本录入需要先选择客户。');
      return;
    }
    if (!selectedCostMaterial?.materialName) {
      Alert.alert('没有可录入物料', '请先在电脑端为该客户添加物料名称和成本价格。');
      return;
    }
    const quantity = parseMobileNumber(costQuantity);
    if (quantity <= 0) {
      Alert.alert('数量不正确', '请输入大于 0 的数量。');
      return;
    }
    if (!costPhoto?.dataUrl) {
      Alert.alert('需要照片证明', '每次物料录入都必须拍照上传。');
      return;
    }

    const payload = {
      date: new Date().toISOString().slice(0, 10),
      materialName: selectedCostMaterial.materialName,
      quantity,
      unit: selectedCostMaterial.unit || '',
      unitCost: hasVisibleCostPrice ? costUnitCost : undefined,
      amount: hasVisibleCostPrice ? quantity * costUnitCost : undefined,
      note: costNote.trim(),
      photo: {
        dataUrl: costPhoto.dataUrl,
        width: costPhoto.width,
        height: costPhoto.height,
        takenAt: costPhoto.takenAt,
        uploadedBy: currentUser?.name || '手机端',
      },
    };
    setSavingCost(true);
    try {
      const result = await request(`/customers/${selectedCostCustomer.id}/cost-entries`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const row = result.row || payload;
      setCustomers(current => current.map(customer => (
        customer.id === selectedCostCustomer.id
          ? { ...customer, costEntries: [...(customer.costEntries || []), row] }
          : customer
      )));
      setCostQuantity('1');
      setCostNote('');
      setCostPhoto(null);
      Alert.alert('录入成功', '成本记录已同步到电脑端。');
    } catch {
      const offlineRow = {
        ...payload,
        id: makeQueueId('costEntries'),
        enteredAt: new Date().toISOString(),
        enteredBy: currentUser?.name || '手机端',
        enteredUserId: currentUser?.id || '',
        approvalStatus: '待审核',
        _offlinePending: true,
      };
      setCustomers(current => current.map(customer => (
        customer.id === selectedCostCustomer.id
          ? { ...customer, costEntries: [...(customer.costEntries || []), offlineRow] }
          : customer
      )));
      await enqueueOfflineAction({
        type: 'cost-entry',
        customerId: selectedCostCustomer.id,
        localRowId: offlineRow.id,
        payload,
      });
      setCostQuantity('1');
      setCostNote('');
      setCostPhoto(null);
      Alert.alert('已离线暂存', '网络不可用，成本记录会在恢复连接后自动同步。');
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

  const approveCostEntry = useCallback(async (entry, approvalStatus) => {
    if (!isAdmin || !entry?._customerId || !entry?.id) return;
    try {
      const result = await request(`/customers/${entry._customerId}/cost-entries/${entry.id}/approval`, {
        method: 'PATCH',
        body: JSON.stringify({
          approvalStatus,
          approvalNote: approvalNoteByEntry[entry.id] || '',
        }),
      });
      updateLocalCostEntry(entry._customerId, result.row || { ...entry, approvalStatus });
      setApprovalNoteByEntry(current => {
        const next = { ...current };
        delete next[entry.id];
        return next;
      });
    } catch (err) {
      Alert.alert('审批失败', err.message || '无法连接服务器');
    }
  }, [approvalNoteByEntry, isAdmin, request, updateLocalCostEntry]);

  const openDetail = useCallback((order) => {
    setSelectedOrder(order);
  }, []);

  const openWorkbenchTask = useCallback((order) => {
    if (!order) return;
    if (order._customerId) setSelectedCustomerId(order._customerId);
    setActiveView('schedule');
    setSelectedOrder(order);
  }, []);

  if (authLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <LoadingState label="正在读取手机账号..." />
      </SafeAreaView>
    );
  }

  if (!currentUser) {
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

  const listHeader = (
    <View>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>FOAM FACTORY</Text>
          <Text style={styles.title}>手机工作台</Text>
          <Text style={styles.userBadge}>{currentUser?.name || '未注册'} · {roleLabel(currentRole)}</Text>
        </View>
        <Pressable style={styles.settingsButton} onPress={() => setShowSettings(current => !current)}>
          <Text style={styles.settingsButtonText}>设置</Text>
        </Pressable>
      </View>

      {showSettings ? (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.settingsPanel}>
            <View style={styles.accountPanel}>
              <View>
                <Text style={styles.panelLabel}>当前账号</Text>
                <Text style={styles.accountName}>{currentUser?.name || '-'} · {roleLabel(currentRole)}</Text>
              </View>
              <Pressable style={styles.secondaryAction} onPress={logoutMobileUser}>
                <Text style={styles.secondaryActionText}>退出</Text>
              </Pressable>
            </View>
            <Text style={styles.panelLabel}>后端 API 地址</Text>
            <TextInput
              style={styles.apiInput}
              value={apiDraft}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              onChangeText={setApiDraft}
              placeholder="http://电脑IP:3001/api"
              placeholderTextColor="#7a8495"
            />
            <View style={styles.settingsActions}>
              <Pressable style={styles.secondaryAction} onPress={() => setApiDraft(defaultApiBaseUrl)}>
                <Text style={styles.secondaryActionText}>自动地址</Text>
              </Pressable>
              <Pressable style={styles.primaryAction} onPress={applyApiUrl}>
                <Text style={styles.primaryActionText}>连接</Text>
              </Pressable>
            </View>
            <View style={styles.displayFieldPanel}>
              <View style={styles.displayFieldHead}>
                <Text style={styles.panelLabel}>订单卡片显示字段</Text>
                <Pressable onPress={() => setMobileCardDisplayFields([])}>
                  <Text style={styles.resetFieldsText}>清空</Text>
                </Pressable>
              </View>
              <View style={styles.displayFieldChips}>
                {mobileDisplayFieldOptions.map(option => {
                  const active = mobileCardDisplayFields.includes(option.field);
                  return (
                    <Pressable
                      key={option.field}
                      style={[styles.displayFieldChip, active && styles.displayFieldChipActive]}
                      onPress={() => toggleMobileCardDisplayField(option.field)}
                    >
                      <Text style={[styles.displayFieldChipText, active && styles.displayFieldChipTextActive]}>
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <View style={styles.displayFieldPanel}>
              <View style={styles.displayFieldHead}>
                <Text style={styles.panelLabel}>详情显示字段</Text>
                <View style={styles.displayFieldActions}>
                  <Pressable onPress={showAllDetailFields}>
                    <Text style={styles.resetFieldsText}>显示全部</Text>
                  </Pressable>
                  <Pressable onPress={clearDetailFields}>
                    <Text style={styles.resetFieldsText}>清空</Text>
                  </Pressable>
                </View>
              </View>
              <View style={styles.displayFieldChips}>
                {mobileDisplayFieldOptions.map(option => {
                  const active = detailUsesAllFields || detailDisplayFields.includes(option.field);
                  return (
                    <Pressable
                      key={option.field}
                      style={[styles.displayFieldChip, active && styles.displayFieldChipActive]}
                      onPress={() => toggleDetailDisplayField(option.field)}
                    >
                      <Text style={[styles.displayFieldChipText, active && styles.displayFieldChipTextActive]}>
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      ) : null}

      <View style={styles.statsRow}>
        <StatCard label="待完成" value={stats.open} tone="blue" />
        <StatCard label="待签收" value={dashboardSummary.deliveryPending} tone="slate" />
        {isAdmin ? (
          <>
            <StatCard label="待审批" value={dashboardSummary.pendingCostCount} tone="green" />
          </>
        ) : null}
      </View>

      <View style={styles.segmented}>
        <SegmentButton label="工作台" active={activeView === 'workbench'} onPress={() => setActiveView('workbench')} />
        <SegmentButton label="提醒" active={activeView === 'alerts'} onPress={() => setActiveView('alerts')} />
        <SegmentButton label="排产" active={activeView === 'schedule'} onPress={() => setActiveView('schedule')} />
        <SegmentButton label="签收" active={activeView === 'delivery'} onPress={() => setActiveView('delivery')} />
        <SegmentButton label="成本" active={activeView === 'cost'} onPress={() => setActiveView('cost')} />
        {isAdmin ? (
          <>
            <SegmentButton label="看板" active={activeView === 'dashboard'} onPress={() => setActiveView('dashboard')} />
            <SegmentButton label="审批" active={activeView === 'approval'} onPress={() => setActiveView('approval')} />
          </>
        ) : null}
      </View>

      {['schedule', 'orders', 'completed'].includes(activeView) ? (
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="搜索订单号、客户、产品"
          placeholderTextColor="#7a8495"
        />
      ) : null}

      {['schedule', 'orders', 'completed'].includes(activeView) ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.customerChips}>
          <Pressable
            style={[styles.customerChip, selectedCustomerId === 'all' && styles.customerChipActive]}
            onPress={() => setSelectedCustomerId('all')}
          >
            <Text style={[styles.customerChipText, selectedCustomerId === 'all' && styles.customerChipTextActive]}>
              全部客户
            </Text>
          </Pressable>
          {customers.map(customer => (
            <Pressable
              key={customer.id}
              style={[styles.customerChip, selectedCustomerId === customer.id && styles.customerChipActive]}
              onPress={() => setSelectedCustomerId(customer.id)}
            >
              <Text style={[styles.customerChipText, selectedCustomerId === customer.id && styles.customerChipTextActive]}>
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

  if (activeView === 'workbench') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <ScrollView
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#42e8ff" />}
        >
          {listHeader}
          <WorkbenchPanel
            scheduledOrders={scheduledOrdersForWorkbench}
            onOpenTask={openWorkbenchTask}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (activeView === 'alerts') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <ScrollView
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#42e8ff" />}
        >
          {listHeader}
          <ReminderPanel reminders={reminders} offlineQueue={offlineQueue} syncing={syncingQueue} onSync={syncOfflineQueue} syncStatus={syncStatus} lastSyncAt={lastSyncAt} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (activeView === 'delivery') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <FlatList
          data={pendingDeliveries}
          keyExtractor={(item) => `${item._customerId}-${item.id}`}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={loading ? <LoadingState /> : <EmptyState title="没有待签收送货单" text="当前没有需要手机端签收的送货单。" />}
          renderItem={({ item }) => (
            <DeliveryCard delivery={item} saving={savingDeliveryId === item.id} onSign={openDeliverySign} />
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#42e8ff" />}
        />
        <DeliverySignModal
          delivery={deliverySign}
          signer={deliverySigner}
          note={deliverySignNote}
          photo={deliverySignPhoto}
          saving={deliverySign ? savingDeliveryId === deliverySign.id : false}
          onChangeSigner={setDeliverySigner}
          onChangeNote={setDeliverySignNote}
          onTakePhoto={takeDeliverySignPhoto}
          onClearPhoto={() => setDeliverySignPhoto(null)}
          onCancel={closeDeliverySign}
          onSubmit={submitDeliverySign}
        />
      </SafeAreaView>
    );
  }

  if (activeView === 'dashboard' && isAdmin) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <ScrollView
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#42e8ff" />}
        >
          {listHeader}
          <ManagementDashboard summary={dashboardSummary} customers={customers} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (activeView === 'approval' && isAdmin) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <FlatList
          data={pendingCostEntries}
          keyExtractor={(item) => `${item._customerId}-${item.id}`}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={loading ? <LoadingState /> : <EmptyState title="暂无待审批成本" text="员工提交的成本记录会显示在这里。" />}
          renderItem={({ item }) => (
            <CostApprovalCard
              entry={item}
              note={approvalNoteByEntry[item.id] || ''}
              onChangeNote={(text) => setApprovalNoteByEntry(current => ({ ...current, [item.id]: text }))}
              onApprove={() => approveCostEntry(item, '已通过')}
              onReject={() => approveCostEntry(item, '已拒绝')}
            />
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#42e8ff" />}
        />
      </SafeAreaView>
    );
  }

  if (activeView === 'cost') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <ScrollView
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#42e8ff" />}
          keyboardShouldPersistTaps="handled"
        >
          {listHeader}
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
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <FlatList
        data={visibleOrders}
        keyExtractor={(item) => `${item._customerId}-${item.id}`}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={loading ? <LoadingState /> : <EmptyState />}
        renderItem={({ item }) => (
          <OrderCard
            order={item}
            saving={savingOrderId === item.id}
            displayFields={selectedMobileCardDisplayFields}
            onOpen={openDetail}
            onComplete={markCompleted}
          />
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#42e8ff" />}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews
      />

      <OrderDetailModal
        order={selectedOrder}
        saving={selectedOrder ? savingOrderId === selectedOrder.id : false}
        fieldOptions={mobileDisplayFieldOptions}
        detailUsesAllFields={detailUsesAllFields}
        detailDisplayFields={detailDisplayFields}
        onToggleDetailField={toggleDetailDisplayField}
        onShowAllDetailFields={showAllDetailFields}
        onClearDetailFields={clearDetailFields}
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
}) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.registerWrap}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.registerScroll}>
          <View style={styles.registerHero}>
            <Text style={styles.registerKicker}>FOAM FACTORY CRM</Text>
            <Text style={styles.registerTitle}>创建手机账号</Text>
            <Text style={styles.registerHint}>提交后账号为普通用户，管理员分配角色前不会显示任何订单数据。</Text>
          </View>

          <View style={styles.registerCard}>
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
                placeholderTextColor="#69758a"
              />
            </View>

            <View style={styles.registerField}>
              <Text style={styles.registerLabel}>手机号</Text>
              <TextInput
                style={styles.registerInput}
                value={phone}
                onChangeText={onChangePhone}
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                placeholder="请输入手机号"
                placeholderTextColor="#69758a"
              />
            </View>

            <View style={styles.registerField}>
              <Text style={styles.registerLabel}>姓名</Text>
              <TextInput
                style={styles.registerInput}
                value={name}
                onChangeText={onChangeName}
                textContentType="name"
                placeholder="请输入真实姓名"
                placeholderTextColor="#69758a"
              />
            </View>

            <View style={styles.registerField}>
              <Text style={styles.registerLabel}>密码</Text>
              <TextInput
                style={styles.registerInput}
                value={password}
                onChangeText={onChangePassword}
                secureTextEntry
                textContentType="newPassword"
                placeholder="至少 6 位"
                placeholderTextColor="#69758a"
              />
            </View>

            <View style={styles.registerField}>
              <Text style={styles.registerLabel}>重复输入密码</Text>
              <TextInput
                style={styles.registerInput}
                value={confirmPassword}
                onChangeText={onChangeConfirmPassword}
                secureTextEntry
                textContentType="newPassword"
                placeholder="再次输入密码"
                placeholderTextColor="#69758a"
              />
            </View>

            <View style={styles.registerNotice}>
              <Text style={styles.registerNoticeTitle}>注册后需要管理员审核</Text>
              <Text style={styles.registerNoticeText}>管理员在电脑端“系统设置 → 手机账号角色”中把账号改为员工或管理员后，手机端才会显示数据。</Text>
            </View>

            <Pressable style={[styles.registerButton, saving && styles.doneButtonDisabled]} onPress={onSubmit} disabled={saving}>
              <Text style={styles.doneButtonText}>{saving ? '提交中' : '注册账号'}</Text>
            </Pressable>
          </View>
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
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.pendingWrap}>
        <View style={styles.pendingCard}>
          <View style={styles.pendingIcon}>
            <Text style={styles.pendingIconText}>!</Text>
          </View>
          <Text style={styles.registerKicker}>ACCOUNT PENDING</Text>
          <Text style={styles.pendingTitle}>等待管理员分配角色</Text>
          <Text style={styles.pendingText}>当前账号已注册为普通用户。管理员分配“员工”或“管理员”角色前，手机端不会显示订单、客户或生产数据。</Text>

          <View style={styles.pendingAccount}>
            <Text style={styles.panelLabel}>当前账号</Text>
            <Text style={styles.accountName}>{currentUser?.name || '-'} · {currentUser?.phone || '-'}</Text>
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
              placeholderTextColor="#69758a"
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

          <Pressable style={[styles.registerButton, refreshing && styles.doneButtonDisabled]} onPress={onRefresh} disabled={refreshing}>
            <Text style={styles.doneButtonText}>{refreshing ? '检查中' : '检查授权状态'}</Text>
          </Pressable>
          <Pressable style={styles.pendingLogout} onPress={onLogout}>
            <Text style={styles.pendingLogoutText}>退出当前账号</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function WorkbenchPanel({ scheduledOrders, onOpenTask }) {
  return (
    <View style={styles.workbenchPanel}>
      <View style={styles.mobileSection}>
        <Text style={styles.panelLabel}>最近任务</Text>
        {scheduledOrders.slice(0, 8).map(order => (
          <Pressable
            key={`${order._customerId}-${order.id}`}
            style={styles.compactRow}
            onPress={() => onOpenTask(order)}
          >
            <View style={styles.recentCostText}>
              <Text style={styles.recentCostName}>{order.orderNo || order.product || '未命名订单'}</Text>
              <Text style={styles.recentCostMeta}>{order._customerName} · 交期 {order.dueDate || '-'}</Text>
            </View>
            <StatusChip status={normalizeStatus(order.status)} />
          </Pressable>
        ))}
        {!scheduledOrders.length ? <Text style={styles.stateText}>暂无待完成排产任务。</Text> : null}
      </View>
    </View>
  );
}

function ReminderPanel({ reminders, offlineQueue, syncing, onSync, syncStatus, lastSyncAt }) {
  const failedCount = Object.values(syncStatus || {}).filter(s => s === 'failed').length;
  const pendingCount = offlineQueue.length - failedCount;
  const timeSinceLastSync = lastSyncAt ? formatElapsed(lastSyncAt) : null;

  return (
    <View style={styles.mobileSection}>
      <View style={styles.sectionHeadRow}>
        <Text style={styles.panelLabel}>消息提醒</Text>
        {offlineQueue.length ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {failedCount > 0 && (
              <Text style={{ color: '#ff6b6b', fontSize: 12, fontWeight: '600' }}>
                {failedCount} 条失败
              </Text>
            )}
            <Pressable style={styles.secondaryAction} onPress={onSync} disabled={syncing}>
              <Text style={styles.secondaryActionText}>
                {syncing ? '同步中…' : `同步 (${pendingCount}条)`}
              </Text>
            </Pressable>
          </View>
        ) : timeSinceLastSync ? (
          <Text style={{ color: '#82e5ff80', fontSize: 11 }}>上次同步 {timeSinceLastSync}</Text>
        ) : null}
      </View>
      {reminders.map(item => (
        <View key={item.id} style={[styles.reminderCard, item.tone === 'danger' && styles.reminderDanger, item.tone === 'warning' && styles.reminderWarning]}>
          <Text style={styles.reminderTitle}>{item.title}</Text>
          <Text style={styles.reminderText}>{item.text}</Text>
        </View>
      ))}
      {!reminders.length ? <Text style={styles.stateText}>暂无新的提醒。</Text> : null}
    </View>
  );
}

function DeliveryCard({ delivery, saving, onSign }) {
  return (
    <View style={styles.orderCard}>
      <View style={styles.cardTopRow}>
        <View style={styles.cardTitleWrap}>
          <Text style={styles.orderNo}>{delivery.deliveryNo || delivery.id}</Text>
          <Text style={styles.customerName}>{delivery._customerName}</Text>
        </View>
        <StatusChip status={isDeliverySigned(delivery) ? '已送货' : '未送'} />
      </View>
      <View style={styles.metaGrid}>
        <Meta label="送货日期" value={delivery.date || '-'} />
        <Meta label="签收人" value={delivery.signedBy || '-'} />
        <Meta label="签收时间" value={formatDateTime(delivery.signedAt)} />
      </View>
      <View style={styles.cardActions}>
        <Pressable style={[styles.doneButton, saving && styles.doneButtonDisabled]} onPress={() => onSign(delivery)} disabled={saving || isDeliverySigned(delivery)}>
          <Text style={styles.doneButtonText}>{saving ? '保存中' : isDeliverySigned(delivery) ? '已签收' : '签收'}</Text>
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
          <Text style={styles.orderNo}>{entry.materialName || '未命名物料'}</Text>
          <Text style={styles.customerName}>{entry._customerName} · {entry.enteredBy || '手机端'}</Text>
        </View>
        <Text style={styles.costAmountText}>{formatMoney(entry.amount)}</Text>
      </View>
      <View style={styles.metaGrid}>
        <Meta label="数量" value={`${entry.quantity || 0} ${entry.unit || ''}`} />
        <Meta label="单价" value={formatMoney(entry.unitCost)} />
        <Meta label="录入时间" value={formatDateTime(entry.enteredAt || entry.date)} />
      </View>
      <TextInput
        style={[styles.completionInput, styles.approvalNoteInput]}
        value={note}
        onChangeText={onChangeNote}
        placeholder="审批备注（可选）"
        placeholderTextColor="#7a8495"
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
    .map(customer => ({
      id: customer.id,
      name: customer.name,
      amount: (customer.orders || []).reduce((sum, order) => sum + parseMobileNumber(order.amount), 0),
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
        {topCustomers.map(customer => (
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
  const hasVisiblePrice = selectedMaterial?.unitCost !== '' && selectedMaterial?.unitCost != null;

  return (
    <View style={styles.costPanel}>
      <View style={styles.costHero}>
        <Text style={styles.eyebrow}>COST ENTRY</Text>
        <Text style={styles.costTitle}>成本管理专区</Text>
        <Text style={styles.costHint}>选择电脑端维护的物料，填写数量并现场拍照，提交后电脑端成本录入表会同步显示。</Text>
      </View>

      <View style={styles.completionField}>
        <Text style={styles.completionLabel}>客户</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.customerChips}>
          {customers.map(customer => (
            <Pressable
              key={customer.id}
              style={[styles.customerChip, selectedCustomerId === customer.id && styles.customerChipActive]}
              onPress={() => onSelectCustomer(customer.id)}
              disabled={saving}
            >
              <Text style={[styles.customerChipText, selectedCustomerId === customer.id && styles.customerChipTextActive]}>
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
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.materialChips}>
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
                        <Text style={[styles.materialChipName, active && styles.materialChipNameActive]}>
                          {material.materialName || '未命名物料'}
                        </Text>
                        <Text style={[styles.materialChipPrice, active && styles.materialChipPriceActive]}>
                          {material.unitCost !== '' && material.unitCost != null
                            ? `${formatMoney(material.unitCost)} / ${material.unit || '-'}`
                            : `单位 ${material.unit || '-'}`}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              <View style={styles.costSummary}>
                <Meta label="成本单价" value={hasVisiblePrice ? `${formatMoney(selectedMaterial?.unitCost)} / ${selectedMaterial?.unit || '-'}` : '后台按物料档案计算'} />
                <Meta label="成本金额" value={hasVisiblePrice ? formatMoney(amount) : '提交后后台计算'} />
              </View>

              <View style={styles.completionField}>
                <Text style={styles.completionLabel}>数量</Text>
                <TextInput
                  style={styles.completionInput}
                  value={quantity}
                  onChangeText={onChangeQuantity}
                  keyboardType="decimal-pad"
                  placeholder="请输入数量"
                  placeholderTextColor="#7a8495"
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
                  placeholderTextColor="#7a8495"
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
                  <Text style={styles.photoButtonText}>{photoUri ? '重新拍照' : '拍照上传'}</Text>
                </Pressable>
              </View>

              <Pressable
                style={[styles.costSubmitButton, (saving || !photoUri) && styles.doneButtonDisabled]}
                onPress={onSubmit}
                disabled={saving || !photoUri}
              >
                <Text style={styles.doneButtonText}>{saving ? '保存中' : '提交成本记录'}</Text>
              </Pressable>
            </>
          ) : (
            <View style={styles.costEmptyBox}>
              <Text style={styles.emptyTitle}>暂无物料档案</Text>
              <Text style={styles.stateText}>请先在电脑端进入该客户的“物料档案”，添加物料名称和成本价格。</Text>
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
          {recentEntries.map(entry => (
            <View key={entry.id || `${entry.materialName}-${entry.enteredAt || entry.date}`} style={styles.recentCostRow}>
              <View style={styles.recentCostText}>
                <Text style={styles.recentCostName}>{entry.materialName || '-'}</Text>
                <Text style={styles.recentCostMeta}>
                  {entry.quantity || 0} {entry.unit || ''} · {formatMoney(entry.amount)} · {formatDateTime(entry.enteredAt || entry.date)}
                </Text>
              </View>
              {getPhotoUri(entry.photo) ? <Image source={{ uri: getPhotoUri(entry.photo) }} style={styles.recentCostPhoto} /> : null}
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

function SegmentButton({ label, active, onPress }) {
  return (
    <Pressable style={[styles.segmentButton, active && styles.segmentButtonActive]} onPress={onPress}>
      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
    </Pressable>
  );
}

function OrderCard({ order, saving, displayFields, onOpen, onComplete }) {
  const status = normalizeStatus(order.status);
  const canComplete = status !== '已完成';
  const visibleFields = getOrderDisplayFields(order, displayFields || []);

  return (
    <Pressable style={styles.orderCard} onPress={() => onOpen(order)}>
      {visibleFields.length > 0 ? (
        <View style={styles.metaGrid}>
          {visibleFields.map(fieldConfig => (
            <Meta
              key={fieldConfig.field}
              label={fieldConfig.label}
              value={formatMobileFieldValue(order, fieldConfig)}
            />
          ))}
        </View>
      ) : (
        <Text style={styles.cardEmptyHint}>未选择卡片显示字段</Text>
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
          <Text style={styles.doneButtonText}>{saving ? '更新中' : canComplete ? '标记已完成' : '已完成'}</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

function Meta({ label, value }) {
  return (
    <View style={styles.metaItem}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function StatusChip({ status }) {
  const pending = status === '未完成';
  const scheduled = status === '已排产';
  const completed = status === '已完成';
  const deliveryOpened = status === '已开送货单';
  const partialDelivered = status === '部分送货';
  const delivered = status === '已送货';
  const reconciled = status === '已开对账单';
  const paid = status === '已付款';
  const issue = status === '异常';
  return (
    <View style={[
      styles.statusChip,
      pending && styles.statusPending,
      scheduled && styles.statusScheduled,
      completed && styles.statusCompleted,
      deliveryOpened && styles.statusDeliveryOpened,
      partialDelivered && styles.statusPartialDelivered,
      delivered && styles.statusDelivered,
      reconciled && styles.statusReconciled,
      paid && styles.statusPaid,
      issue && styles.statusIssue,
    ]}>
      <Text style={[
        styles.statusText,
        pending && styles.statusPendingText,
        scheduled && styles.statusScheduledText,
        completed && styles.statusCompletedText,
        deliveryOpened && styles.statusDeliveryOpenedText,
        partialDelivered && styles.statusPartialDeliveredText,
        delivered && styles.statusDeliveredText,
        reconciled && styles.statusReconciledText,
        paid && styles.statusPaidText,
        issue && styles.statusIssueText,
      ]}>
        {status}
      </Text>
    </View>
  );
}

function OrderDetailModal({
  order,
  saving,
  fieldOptions,
  detailUsesAllFields,
  detailDisplayFields,
  onToggleDetailField,
  onShowAllDetailFields,
  onClearDetailFields,
  onClose,
  onComplete,
}) {
  const orderFieldOptions = useMemo(
    () => getOrderDisplayFields(order, fieldOptions),
    [fieldOptions, order],
  );
  const visibleDetailFields = useMemo(() => {
    if (!order) return [];
    if (detailUsesAllFields) return orderFieldOptions;
    const optionByField = new Map(orderFieldOptions.map(option => [option.field, option]));
    return detailDisplayFields.map(field => optionByField.get(field)).filter(Boolean);
  }, [detailDisplayFields, detailUsesAllFields, order, orderFieldOptions]);

  return (
    <Modal visible={Boolean(order)} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
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
              <View style={styles.detailFieldPanel}>
                <View style={styles.detailFieldHead}>
                  <Text style={styles.panelLabel}>详情字段显示</Text>
                  <View style={styles.displayFieldActions}>
                    <Pressable onPress={onShowAllDetailFields}>
                      <Text style={styles.resetFieldsText}>显示全部</Text>
                    </Pressable>
                    <Pressable onPress={onClearDetailFields}>
                      <Text style={styles.resetFieldsText}>清空</Text>
                    </Pressable>
                  </View>
                </View>
                <View style={styles.displayFieldChips}>
                  {orderFieldOptions.map(option => {
                    const active = detailUsesAllFields || detailDisplayFields.includes(option.field);
                    return (
                      <Pressable
                        key={option.field}
                        style={[styles.displayFieldChip, active && styles.displayFieldChipActive]}
                        onPress={() => onToggleDetailField(option.field)}
                      >
                        <Text style={[styles.displayFieldChipText, active && styles.displayFieldChipTextActive]}>
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {visibleDetailFields.length ? (
                visibleDetailFields.map(fieldConfig => (
                  <DetailRow
                    key={fieldConfig.field}
                    label={fieldConfig.label}
                    value={formatMobileFieldValue(order, fieldConfig)}
                    multiline={String(order?.[fieldConfig.field] ?? '').length > 28}
                  />
                ))
              ) : (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>未选择详情显示字段</Text>
                  <Text style={styles.detailValue}>请在上方选择需要显示的订单数据。</Text>
                </View>
              )}
            </ScrollView>

            <Pressable
              style={[styles.modalDoneButton, (normalizeStatus(order.status) === '已完成' || saving) && styles.doneButtonDisabled]}
              onPress={() => normalizeStatus(order.status) !== '已完成' && !saving && onComplete(order)}
              disabled={normalizeStatus(order.status) === '已完成' || saving}
            >
              <Text style={styles.doneButtonText}>{saving ? '更新中' : '标记已完成'}</Text>
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
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.completionKeyboard}>
          <View style={styles.completionCard}>
            <Text style={styles.eyebrow}>COMPLETE ORDER</Text>
            <Text style={styles.completionTitle}>{fieldText(order?.orderNo || order?.product || order?.id)}</Text>
            <Text style={styles.completionMeta}>{order?._customerName || ''}</Text>

            <View style={styles.completionField}>
              <Text style={styles.completionLabel}>完成人</Text>
              <TextInput
                style={styles.completionInput}
                value={operator}
                onChangeText={onChangeOperator}
                placeholder="填写操作人"
                placeholderTextColor="#7a8495"
              />
            </View>

            <View style={styles.completionField}>
              <Text style={styles.completionLabel}>完成备注</Text>
              <TextInput
                style={[styles.completionInput, styles.completionTextarea]}
                value={note}
                onChangeText={onChangeNote}
                placeholder="例如：手机端确认完成、员工备注"
                placeholderTextColor="#7a8495"
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
                <Text style={styles.photoButtonText}>{photo?.uri ? '重新拍照' : '拍照上传'}</Text>
              </Pressable>
            </View>

            <View style={styles.completionActions}>
              <Pressable style={styles.lightButton} onPress={onCancel} disabled={saving}>
                <Text style={styles.lightButtonText}>取消</Text>
              </Pressable>
              <Pressable style={[styles.doneButton, (saving || !photo?.uri) && styles.doneButtonDisabled]} onPress={onSubmit} disabled={saving || !photo?.uri}>
                <Text style={styles.doneButtonText}>{saving ? '保存中' : '确认完成'}</Text>
              </Pressable>
            </View>
          </View>
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
  onChangeSigner,
  onChangeNote,
  onTakePhoto,
  onClearPhoto,
  onCancel,
  onSubmit,
}) {
  return (
    <Modal visible={Boolean(delivery)} animationType="fade" transparent onRequestClose={onCancel}>
      <View style={styles.completionBackdrop}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.completionKeyboard}>
          <View style={styles.completionCard}>
            <Text style={styles.eyebrow}>DELIVERY SIGN</Text>
            <Text style={styles.completionTitle}>{fieldText(delivery?.deliveryNo || delivery?.id)}</Text>
            <Text style={styles.completionMeta}>{delivery?._customerName || ''}</Text>

            <View style={styles.completionField}>
              <Text style={styles.completionLabel}>签收人</Text>
              <TextInput
                style={styles.completionInput}
                value={signer}
                onChangeText={onChangeSigner}
                placeholder="填写客户或收货人姓名"
                placeholderTextColor="#7a8495"
              />
            </View>

            <View style={styles.completionField}>
              <Text style={styles.completionLabel}>签收备注</Text>
              <TextInput
                style={[styles.completionInput, styles.completionTextarea]}
                value={note}
                onChangeText={onChangeNote}
                placeholder="例如：货物已收、数量无误"
                placeholderTextColor="#7a8495"
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
                <Text style={styles.photoButtonText}>{photo?.uri ? '重新拍照' : '拍照上传'}</Text>
              </Pressable>
            </View>

            <View style={styles.completionActions}>
              <Pressable style={styles.lightButton} onPress={onCancel} disabled={saving}>
                <Text style={styles.lightButtonText}>取消</Text>
              </Pressable>
              <Pressable style={[styles.doneButton, (saving || !photo?.uri) && styles.doneButtonDisabled]} onPress={onSubmit} disabled={saving || !photo?.uri}>
                <Text style={styles.doneButtonText}>{saving ? '保存中' : '确认签收'}</Text>
              </Pressable>
            </View>
          </View>
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

function LoadingState({ label = '正在加载订单...' }) {
  return (
    <View style={styles.stateBox}>
      <ActivityIndicator color="#42e8ff" />
      <Text style={styles.stateText}>{label}</Text>
    </View>
  );
}

function EmptyState({ title = '没有订单', text = '当前筛选条件下没有需要显示的订单。' }) {
  return (
    <View style={styles.stateBox}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.stateText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#07111f',
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  eyebrow: {
    color: '#42e8ff',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0,
  },
  title: {
    marginTop: 4,
    color: '#f4fbff',
    fontSize: 28,
    fontWeight: '800',
  },
  userBadge: {
    marginTop: 6,
    color: '#9eb3c8',
    fontSize: 12,
    fontWeight: '700',
  },
  settingsButton: {
    height: 36,
    justifyContent: 'center',
    borderRadius: 8,
    paddingHorizontal: 14,
    backgroundColor: '#132036',
    borderWidth: 1,
    borderColor: '#263a5c',
  },
  settingsButtonText: {
    color: '#d9f4ff',
    fontWeight: '700',
  },
  settingsPanel: {
    gap: 10,
    marginBottom: 14,
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#101827',
    borderWidth: 1,
    borderColor: '#243755',
  },
  accountPanel: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderRadius: 8,
    padding: 10,
    backgroundColor: '#081223',
    borderWidth: 1,
    borderColor: '#243755',
  },
  accountName: {
    marginTop: 4,
    color: '#f4fbff',
    fontSize: 14,
    fontWeight: '900',
  },
  panelLabel: {
    color: '#9eb3c8',
    fontSize: 13,
    fontWeight: '700',
  },
  apiInput: {
    minHeight: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2f456a',
    paddingHorizontal: 12,
    color: '#f4fbff',
    backgroundColor: '#081223',
  },
  settingsActions: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
  },
  displayFieldPanel: {
    gap: 10,
    marginTop: 2,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#243755',
  },
  displayFieldHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  displayFieldActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  resetFieldsText: {
    color: '#42e8ff',
    fontSize: 12,
    fontWeight: '800',
  },
  displayFieldChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  displayFieldChip: {
    minHeight: 32,
    justifyContent: 'center',
    borderRadius: 999,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#2f456a',
    backgroundColor: '#081223',
  },
  displayFieldChipActive: {
    borderColor: '#42e8ff',
    backgroundColor: '#143149',
  },
  displayFieldChipText: {
    color: '#9eb3c8',
    fontSize: 12,
    fontWeight: '800',
  },
  displayFieldChipTextActive: {
    color: '#eafcff',
  },
  primaryAction: {
    height: 38,
    justifyContent: 'center',
    borderRadius: 8,
    paddingHorizontal: 16,
    backgroundColor: '#42e8ff',
  },
  primaryActionText: {
    color: '#05101d',
    fontWeight: '800',
  },
  secondaryAction: {
    height: 38,
    justifyContent: 'center',
    borderRadius: 8,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#2f456a',
  },
  secondaryActionText: {
    color: '#d9f4ff',
    fontWeight: '700',
  },
  registerWrap: {
    flex: 1,
    backgroundColor: '#07111f',
  },
  registerScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: 18,
    padding: 18,
  },
  registerHero: {
    gap: 8,
    paddingHorizontal: 2,
  },
  registerKicker: {
    color: '#42e8ff',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  registerCard: {
    gap: 14,
    borderRadius: 20,
    padding: 18,
    backgroundColor: '#0d1829',
    borderWidth: 1,
    borderColor: '#284466',
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
  },
  registerTitle: {
    color: '#f4fbff',
    fontSize: 30,
    fontWeight: '900',
  },
  registerHint: {
    color: '#9eb3c8',
    fontSize: 14,
    lineHeight: 22,
  },
  registerField: {
    gap: 7,
  },
  registerLabel: {
    color: '#c7d7ea',
    fontSize: 13,
    fontWeight: '800',
  },
  registerInput: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2c4263',
    paddingHorizontal: 14,
    color: '#f4fbff',
    backgroundColor: '#081223',
    fontSize: 15,
  },
  registerNotice: {
    gap: 4,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#2b6f8f',
    backgroundColor: '#0b2738',
  },
  registerNoticeTitle: {
    color: '#dff8ff',
    fontSize: 13,
    fontWeight: '900',
  },
  registerNoticeText: {
    color: '#9eb3c8',
    fontSize: 12,
    lineHeight: 18,
  },
  registerButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    marginTop: 2,
    backgroundColor: '#2ed47a',
  },
  pendingWrap: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 18,
  },
  pendingCard: {
    gap: 16,
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: '#284466',
    backgroundColor: '#0d1829',
  },
  pendingIcon: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d29922',
    backgroundColor: '#2c210d',
  },
  pendingIconText: {
    color: '#ffd166',
    fontSize: 30,
    fontWeight: '900',
  },
  pendingTitle: {
    color: '#f4fbff',
    fontSize: 26,
    fontWeight: '900',
  },
  pendingText: {
    color: '#9eb3c8',
    fontSize: 14,
    lineHeight: 22,
  },
  pendingAccount: {
    gap: 4,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#243755',
    backgroundColor: '#081223',
  },
  pendingRoleText: {
    color: '#ffd166',
    fontSize: 13,
    fontWeight: '800',
  },
  pendingActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  pendingLogout: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingLogoutText: {
    color: '#9eb3c8',
    fontWeight: '800',
  },
  workbenchPanel: {
    gap: 14,
  },
  workbenchHero: {
    gap: 7,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2d8cff',
    backgroundColor: '#0c2442',
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  actionTile: {
    flexGrow: 1,
    flexBasis: '45%',
    minHeight: 86,
    justifyContent: 'center',
    borderRadius: 14,
    padding: 14,
    backgroundColor: '#101827',
    borderWidth: 1,
    borderColor: '#22334d',
  },
  actionTileValue: {
    color: '#f4fbff',
    fontSize: 22,
    fontWeight: '900',
  },
  actionTileLabel: {
    marginTop: 5,
    color: '#9eb3c8',
    fontSize: 12,
    fontWeight: '800',
  },
  mobileSection: {
    gap: 10,
    borderRadius: 14,
    padding: 14,
    backgroundColor: '#0d1829',
    borderWidth: 1,
    borderColor: '#22334d',
  },
  sectionHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  compactRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#081223',
    borderWidth: 1,
    borderColor: '#1c2d46',
  },
  reminderCard: {
    gap: 4,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#2f456a',
    backgroundColor: '#081223',
  },
  reminderDanger: {
    borderColor: '#ff6b6b',
    backgroundColor: '#35161b',
  },
  reminderWarning: {
    borderColor: '#d29922',
    backgroundColor: '#2c210d',
  },
  reminderTitle: {
    color: '#f4fbff',
    fontSize: 14,
    fontWeight: '900',
  },
  reminderText: {
    color: '#9eb3c8',
    fontSize: 12,
    lineHeight: 18,
  },
  costAmountText: {
    color: '#42e8ff',
    fontSize: 15,
    fontWeight: '900',
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
    borderColor: '#2b6f8f',
    backgroundColor: '#0b2738',
  },
  costTitle: {
    color: '#f4fbff',
    fontSize: 24,
    fontWeight: '900',
  },
  costHint: {
    color: '#9eb3c8',
    fontSize: 13,
    lineHeight: 20,
  },
  costCard: {
    gap: 14,
    borderRadius: 14,
    padding: 14,
    backgroundColor: '#101827',
    borderWidth: 1,
    borderColor: '#22334d',
  },
  costCardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  costCount: {
    color: '#42e8ff',
    fontSize: 12,
    fontWeight: '900',
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
    borderColor: '#2f456a',
    backgroundColor: '#081223',
  },
  materialChipActive: {
    borderColor: '#42e8ff',
    backgroundColor: '#143149',
  },
  materialChipName: {
    color: '#d9f4ff',
    fontSize: 14,
    fontWeight: '900',
  },
  materialChipNameActive: {
    color: '#ffffff',
  },
  materialChipPrice: {
    marginTop: 5,
    color: '#8fa4ba',
    fontSize: 12,
    fontWeight: '800',
  },
  materialChipPriceActive: {
    color: '#bff7ff',
  },
  costSummary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  costSubmitButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#2ed47a',
  },
  costEmptyBox: {
    gap: 8,
    borderRadius: 14,
    padding: 16,
    backgroundColor: '#101827',
    borderWidth: 1,
    borderColor: '#22334d',
  },
  recentCostList: {
    gap: 10,
    borderRadius: 14,
    padding: 14,
    backgroundColor: '#0d1829',
    borderWidth: 1,
    borderColor: '#22334d',
  },
  recentCostRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#081223',
    borderWidth: 1,
    borderColor: '#1c2d46',
  },
  recentCostText: {
    flex: 1,
    minWidth: 0,
  },
  recentCostName: {
    color: '#f4fbff',
    fontSize: 15,
    fontWeight: '900',
  },
  recentCostMeta: {
    marginTop: 4,
    color: '#9eb3c8',
    fontSize: 12,
    fontWeight: '700',
  },
  recentCostPhoto: {
    width: 46,
    height: 46,
    borderRadius: 8,
    backgroundColor: '#101827',
  },
  statsRow: {
    flexDirection: 'row',
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
    borderColor: '#2d8cff',
    backgroundColor: '#0c2442',
  },
  statCard_green: {
    borderColor: '#2ed47a',
    backgroundColor: '#0b2b23',
  },
  statCard_slate: {
    borderColor: '#344766',
    backgroundColor: '#101827',
  },
  statLabel: {
    color: '#9eb3c8',
    fontSize: 12,
    fontWeight: '700',
  },
  statValue: {
    marginTop: 4,
    color: '#f4fbff',
    fontSize: 24,
    fontWeight: '900',
  },
  segmented: {
    flexDirection: 'row',
    borderRadius: 8,
    padding: 4,
    backgroundColor: '#101827',
    borderWidth: 1,
    borderColor: '#243755',
    marginBottom: 10,
  },
  segmentButton: {
    flex: 1,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 7,
  },
  segmentButtonActive: {
    backgroundColor: '#42e8ff',
  },
  segmentText: {
    color: '#9eb3c8',
    fontWeight: '800',
  },
  segmentTextActive: {
    color: '#04101b',
  },
  searchInput: {
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#243755',
    paddingHorizontal: 13,
    color: '#f4fbff',
    backgroundColor: '#101827',
    marginBottom: 10,
  },
  customerChips: {
    gap: 8,
    paddingBottom: 12,
  },
  customerChip: {
    minHeight: 34,
    justifyContent: 'center',
    borderRadius: 999,
    paddingHorizontal: 13,
    backgroundColor: '#101827',
    borderWidth: 1,
    borderColor: '#243755',
  },
  customerChipActive: {
    borderColor: '#42e8ff',
    backgroundColor: '#143149',
  },
  customerChipText: {
    color: '#aab9ca',
    fontWeight: '700',
  },
  customerChipTextActive: {
    color: '#eafcff',
  },
  errorBox: {
    marginBottom: 12,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#ff6b6b',
    backgroundColor: '#35161b',
  },
  errorTitle: {
    color: '#ffb4b4',
    fontWeight: '800',
  },
  errorText: {
    marginTop: 4,
    color: '#ffd7d7',
  },
  errorHint: {
    marginTop: 6,
    color: '#dba8a8',
    fontSize: 12,
  },
  orderCard: {
    marginBottom: 10,
    borderRadius: 8,
    padding: 14,
    backgroundColor: '#101827',
    borderWidth: 1,
    borderColor: '#22334d',
  },
  cardEmptyHint: {
    minHeight: 46,
    borderRadius: 8,
    padding: 12,
    color: '#8fa4ba',
    backgroundColor: '#0b1424',
    borderWidth: 1,
    borderColor: '#1c2d46',
    fontSize: 13,
    fontWeight: '700',
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  cardTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  orderNo: {
    color: '#f4fbff',
    fontSize: 16,
    fontWeight: '900',
  },
  customerName: {
    marginTop: 3,
    color: '#9eb3c8',
    fontSize: 13,
  },
  productName: {
    marginTop: 12,
    color: '#d9f4ff',
    fontSize: 17,
    fontWeight: '800',
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  metaItem: {
    minWidth: '30%',
    flexGrow: 1,
    flexBasis: '30%',
    borderRadius: 8,
    padding: 9,
    backgroundColor: '#0b1424',
    borderWidth: 1,
    borderColor: '#1c2d46',
  },
  metaLabel: {
    color: '#7f93aa',
    fontSize: 11,
    fontWeight: '700',
  },
  metaValue: {
    marginTop: 4,
    color: '#f4fbff',
    fontSize: 14,
    fontWeight: '800',
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
  },
  lightButton: {
    minHeight: 38,
    justifyContent: 'center',
    borderRadius: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#2f456a',
  },
  lightButtonText: {
    color: '#d9f4ff',
    fontWeight: '800',
  },
  doneButton: {
    minHeight: 38,
    justifyContent: 'center',
    borderRadius: 8,
    paddingHorizontal: 14,
    backgroundColor: '#2ed47a',
  },
  doneButtonDisabled: {
    opacity: 0.5,
  },
  doneButtonText: {
    color: '#04150e',
    fontWeight: '900',
  },
  statusChip: {
    flexShrink: 0,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#25314a',
  },
  statusPending: {
    backgroundColor: '#3d2210',
  },
  statusScheduled: {
    backgroundColor: '#0d2137',
  },
  statusCompleted: {
    backgroundColor: '#143c2c',
  },
  statusDeliveryOpened: {
    backgroundColor: '#0b2f42',
  },
  statusPartialDelivered: {
    backgroundColor: '#2d2a10',
  },
  statusDelivered: {
    backgroundColor: '#1a1f3d',
  },
  statusReconciled: {
    backgroundColor: '#1e1835',
  },
  statusPaid: {
    backgroundColor: '#0d2b28',
  },
  statusIssue: {
    backgroundColor: '#3a1515',
  },
  statusText: {
    color: '#c6d2e2',
    fontSize: 12,
    fontWeight: '800',
  },
  statusPendingText: {
    color: '#f0883e',
  },
  statusScheduledText: {
    color: '#58a6ff',
  },
  statusCompletedText: {
    color: '#96f2c0',
  },
  statusDeliveryOpenedText: {
    color: '#38bdf8',
  },
  statusPartialDeliveredText: {
    color: '#facc15',
  },
  statusDeliveredText: {
    color: '#9bb8ff',
  },
  statusReconciledText: {
    color: '#c4a8ff',
  },
  statusPaidText: {
    color: '#5eeadb',
  },
  statusIssueText: {
    color: '#ff8585',
  },
  stateBox: {
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  stateText: {
    color: '#9eb3c8',
  },
  emptyTitle: {
    color: '#f4fbff',
    fontSize: 18,
    fontWeight: '900',
  },
  modalSafeArea: {
    flex: 1,
    backgroundColor: '#07111f',
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  modalTitle: {
    marginTop: 4,
    color: '#f4fbff',
    fontSize: 22,
    fontWeight: '900',
  },
  closeButton: {
    height: 36,
    justifyContent: 'center',
    borderRadius: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#2f456a',
  },
  closeButtonText: {
    color: '#d9f4ff',
    fontWeight: '800',
  },
  detailList: {
    gap: 8,
    paddingBottom: 18,
  },
  detailFieldPanel: {
    gap: 10,
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#101827',
    borderWidth: 1,
    borderColor: '#22334d',
  },
  detailFieldHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  detailRow: {
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#101827',
    borderWidth: 1,
    borderColor: '#22334d',
  },
  detailLabel: {
    color: '#8fa4ba',
    fontSize: 12,
    fontWeight: '800',
  },
  detailValue: {
    marginTop: 5,
    color: '#f4fbff',
    fontSize: 16,
    fontWeight: '700',
  },
  detailValueMultiline: {
    lineHeight: 22,
  },
  modalDoneButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#2ed47a',
  },
  completionBackdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: 18,
    backgroundColor: 'rgba(3, 8, 16, 0.72)',
  },
  completionKeyboard: {
    width: '100%',
  },
  completionCard: {
    borderRadius: 8,
    padding: 16,
    backgroundColor: '#101827',
    borderWidth: 1,
    borderColor: '#2a3d5c',
  },
  completionTitle: {
    marginTop: 6,
    color: '#f4fbff',
    fontSize: 20,
    fontWeight: '900',
  },
  completionMeta: {
    marginTop: 4,
    color: '#9eb3c8',
    fontWeight: '700',
  },
  completionField: {
    gap: 7,
    marginTop: 14,
  },
  completionLabel: {
    color: '#9eb3c8',
    fontSize: 13,
    fontWeight: '800',
  },
  completionInput: {
    minHeight: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2f456a',
    paddingHorizontal: 12,
    color: '#f4fbff',
    backgroundColor: '#081223',
  },
  completionTextarea: {
    minHeight: 86,
    paddingTop: 10,
    textAlignVertical: 'top',
  },
  photoHint: {
    borderRadius: 8,
    padding: 12,
    color: '#ffd6a3',
    backgroundColor: '#332512',
    borderWidth: 1,
    borderColor: '#8a5a18',
    fontWeight: '700',
  },
  photoButton: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#42e8ff',
  },
  photoButtonText: {
    color: '#05101d',
    fontWeight: '900',
  },
  photoPreviewWrap: {
    gap: 8,
  },
  photoPreview: {
    width: '100%',
    height: 180,
    borderRadius: 8,
    backgroundColor: '#081223',
  },
  completionActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 16,
  },
});
