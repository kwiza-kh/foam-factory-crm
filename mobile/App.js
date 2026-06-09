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

const statusOptions = ['未完成', '已排产', '已完成', '已送货', '已开对账单', '已付款'];
const completionTimeField = 'completionTime';
const completionOperatorField = 'completionOperator';
const completionNoteField = 'completionNote';
const completionPhotoField = 'completionPhoto';
const completionPhotoAtField = 'completionPhotoAt';
const mobileUserStorageKey = 'foam-crm-mobile-user';
const mobileApiStorageKey = 'foam-crm-mobile-api-url';
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
  return role === 'admin' ? 'admin' : 'employee';
}

function roleLabel(role = '') {
  return normalizeUserRole(role) === 'admin' ? '管理员' : '员工';
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
  const [registering, setRegistering] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('all');
  const [activeView, setActiveView] = useState('schedule');
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
        const [[, savedApiUrl], [, savedUser]] = await AsyncStorage.multiGet([
          mobileApiStorageKey,
          mobileUserStorageKey,
        ]);
        if (!mounted) return;
        if (savedApiUrl) {
          setApiBaseUrl(savedApiUrl);
          setApiDraft(savedApiUrl);
        }
        if (savedUser) {
          setCurrentUser(JSON.parse(savedUser));
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

  const allOrders = useMemo(() => flattenOrders(customers), [customers]);
  const currentRole = normalizeUserRole(currentUser?.role);
  const isAdmin = currentRole === 'admin';
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
    if (!isAdmin && activeView !== 'schedule') setActiveView('schedule');
  }, [activeView, isAdmin]);
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
    const nextApiUrl = apiDraft.trim().replace(/\/$/, '');
    if (!nextApiUrl) {
      Alert.alert('请填写后端地址', '格式例如：http://电脑IP:3001/api');
      return;
    }
    if (!name || !phone) {
      Alert.alert('请填写注册信息', '姓名和手机号都需要填写。');
      return;
    }

    setRegistering(true);
    setError('');
    try {
      const response = await fetch(`${nextApiUrl}/users/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone }),
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
      setLoading(true);
    } catch (err) {
      Alert.alert('注册失败', err.message || '无法连接服务器');
    } finally {
      setRegistering(false);
    }
  }, [apiDraft, registerName, registerPhone]);

  const logoutMobileUser = useCallback(async () => {
    await AsyncStorage.removeItem(mobileUserStorageKey);
    setCurrentUser(null);
    setCustomers([]);
    setSelectedOrder(null);
    setCompletionOrder(null);
    setActiveView('schedule');
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
    setSavingOrderId(completionOrder.id);
    try {
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
      const row = await saveOrderStatus(completionOrder, '已完成', patch);
      updateLocalOrder(completionOrder._customerId, row);
      setCompletionOrder(null);
      setCompletionOperator('');
      setCompletionNote('');
      setCompletionPhoto(null);
    } catch (err) {
      Alert.alert('更新失败', err.message || '无法连接服务器');
    } finally {
      setSavingOrderId('');
    }
  }, [completionNote, completionOperator, completionOrder, completionPhoto, currentUser?.name, saveOrderStatus, updateLocalOrder]);

  const openDetail = useCallback((order) => {
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
        saving={registering}
        onChangeApi={setApiDraft}
        onChangeName={setRegisterName}
        onChangePhone={setRegisterPhone}
        onSubmit={registerMobileUser}
      />
    );
  }

  const listHeader = (
    <View>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>FOAM FACTORY</Text>
          <Text style={styles.title}>手机排产</Text>
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
        <StatCard label="已排产" value={stats.open} tone="blue" />
        {isAdmin ? (
          <>
            <StatCard label="已完成" value={stats.completed} tone="green" />
            <StatCard label="订单数" value={stats.all} tone="slate" />
          </>
        ) : null}
      </View>

      {isAdmin ? (
        <View style={styles.segmented}>
          <SegmentButton label="排产" active={activeView === 'schedule'} onPress={() => setActiveView('schedule')} />
          <SegmentButton label="订单" active={activeView === 'orders'} onPress={() => setActiveView('orders')} />
          <SegmentButton label="完成" active={activeView === 'completed'} onPress={() => setActiveView('completed')} />
        </View>
      ) : null}

      <TextInput
        style={styles.searchInput}
        value={query}
        onChangeText={setQuery}
        placeholder="搜索订单号、客户、产品"
        placeholderTextColor="#7a8495"
      />

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

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>连接失败</Text>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.errorHint}>确认电脑后端已运行，并且手机和电脑在同一个 Wi-Fi。</Text>
        </View>
      ) : null}
    </View>
  );

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
  saving,
  onChangeApi,
  onChangeName,
  onChangePhone,
  onSubmit,
}) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.registerWrap}>
        <View style={styles.registerCard}>
          <Text style={styles.eyebrow}>MOBILE ACCOUNT</Text>
          <Text style={styles.registerTitle}>手机注册</Text>
          <Text style={styles.registerHint}>注册后由电脑端在系统设置里分配管理员或员工角色。</Text>

          <View style={styles.completionField}>
            <Text style={styles.completionLabel}>后端 API 地址</Text>
            <TextInput
              style={styles.completionInput}
              value={apiDraft}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              onChangeText={onChangeApi}
              placeholder="http://电脑IP:3001/api"
              placeholderTextColor="#7a8495"
            />
          </View>

          <View style={styles.completionField}>
            <Text style={styles.completionLabel}>姓名</Text>
            <TextInput
              style={styles.completionInput}
              value={name}
              onChangeText={onChangeName}
              placeholder="填写员工姓名"
              placeholderTextColor="#7a8495"
            />
          </View>

          <View style={styles.completionField}>
            <Text style={styles.completionLabel}>手机号</Text>
            <TextInput
              style={styles.completionInput}
              value={phone}
              onChangeText={onChangePhone}
              keyboardType="phone-pad"
              placeholder="用于识别账号"
              placeholderTextColor="#7a8495"
            />
          </View>

          <Pressable style={[styles.registerButton, saving && styles.doneButtonDisabled]} onPress={onSubmit} disabled={saving}>
            <Text style={styles.doneButtonText}>{saving ? '注册中' : '注册并进入'}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
  const delivered = status === '已送货';
  const reconciled = status === '已开对账单';
  const paid = status === '已付款';
  return (
    <View style={[
      styles.statusChip,
      pending && styles.statusPending,
      scheduled && styles.statusScheduled,
      completed && styles.statusCompleted,
      delivered && styles.statusDelivered,
      reconciled && styles.statusReconciled,
      paid && styles.statusPaid,
    ]}>
      <Text style={[
        styles.statusText,
        pending && styles.statusPendingText,
        scheduled && styles.statusScheduledText,
        completed && styles.statusCompletedText,
        delivered && styles.statusDeliveredText,
        reconciled && styles.statusReconciledText,
        paid && styles.statusPaidText,
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

function EmptyState() {
  return (
    <View style={styles.stateBox}>
      <Text style={styles.emptyTitle}>没有订单</Text>
      <Text style={styles.stateText}>当前筛选条件下没有需要显示的订单。</Text>
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
    justifyContent: 'center',
    padding: 18,
  },
  registerCard: {
    borderRadius: 8,
    padding: 16,
    backgroundColor: '#101827',
    borderWidth: 1,
    borderColor: '#2a3d5c',
  },
  registerTitle: {
    marginTop: 6,
    color: '#f4fbff',
    fontSize: 24,
    fontWeight: '900',
  },
  registerHint: {
    marginTop: 8,
    color: '#9eb3c8',
    lineHeight: 20,
  },
  registerButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    marginTop: 16,
    backgroundColor: '#2ed47a',
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
  statusDelivered: {
    backgroundColor: '#1a1f3d',
  },
  statusReconciled: {
    backgroundColor: '#1e1835',
  },
  statusPaid: {
    backgroundColor: '#0d2b28',
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
  statusDeliveredText: {
    color: '#9bb8ff',
  },
  statusReconciledText: {
    color: '#c4a8ff',
  },
  statusPaidText: {
    color: '#5eeadb',
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
