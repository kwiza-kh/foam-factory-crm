import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
const defaultMobileDisplayFields = ['product', 'quantity', 'amount', 'dueDate'];
const baseMobileOrderFields = [
  { field: 'product', label: '产品' },
  { field: 'quantity', label: '数量', type: 'number' },
  { field: 'amount', label: '金额', type: 'amount' },
  { field: 'dueDate', label: '交期', type: 'date' },
  { field: 'date', label: '订单日期', type: 'date' },
  { field: 'orderNo', label: '订单号' },
  { field: 'productionDate', label: '排产日期', type: 'date' },
  { field: 'productionQuantity', label: '排产数量', type: 'number' },
  { field: 'productionLine', label: '员工姓名' },
  { field: 'deliveredQuantity', label: '已送数量', type: 'number' },
  { field: 'remainingQuantity', label: '剩余数量', type: 'number' },
  { field: completionTimeField, label: '完成时间', type: 'datetime' },
  { field: completionOperatorField, label: '完成人' },
  { field: completionNoteField, label: '完成备注' },
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
        if (field === 'id' || field.startsWith('_') || fields.has(field)) continue;
        fields.set(field, { field, label: field });
      }
    }
  }

  return Array.from(fields.values());
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
  const [mobileDisplayFields, setMobileDisplayFields] = useState(defaultMobileDisplayFields);

  const request = useCallback(async (path, options = {}) => {
    const baseUrl = apiBaseUrl.replace(/\/$/, '');
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
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
  }, [apiBaseUrl]);

  const loadCustomers = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const result = await request('/customers?limit=200');
      const list = result.data || result;
      setCustomers(Array.isArray(list) ? list : []);
    } catch (err) {
      setError(err.message || '连接失败');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [request]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  const allOrders = useMemo(() => flattenOrders(customers), [customers]);
  const mobileDisplayFieldOptions = useMemo(() => buildMobileOrderDisplayFields(customers), [customers]);
  const selectedMobileDisplayFields = useMemo(() => {
    const optionByField = new Map(mobileDisplayFieldOptions.map(option => [option.field, option]));
    return mobileDisplayFields.map(field => optionByField.get(field)).filter(Boolean);
  }, [mobileDisplayFieldOptions, mobileDisplayFields]);
  const toggleMobileDisplayField = useCallback((field) => {
    setMobileDisplayFields(current => (
      current.includes(field)
        ? current.filter(item => item !== field)
        : [...current, field]
    ));
  }, []);
  const visibleOrders = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return allOrders
      .filter(order => selectedCustomerId === 'all' || order._customerId === selectedCustomerId)
      .filter(order => {
        const status = normalizeStatus(order.status);
        if (activeView === 'schedule') return isScheduledProductionOrder(order);
        if (activeView === 'completed') return status === '已完成';
        return true;
      })
      .filter(order => !keyword || orderSearchText(order).includes(keyword))
      .sort((a, b) => {
        if (activeView === 'schedule') {
          return parseDateValue(a.productionDate || a.dueDate) - parseDateValue(b.productionDate || b.dueDate)
            || parseDateValue(a.date) - parseDateValue(b.date)
            || a._orderIndex - b._orderIndex;
        }
        return parseDateValue(b.date) - parseDateValue(a.date)
          || b._orderIndex - a._orderIndex;
      });
  }, [activeView, allOrders, query, selectedCustomerId]);

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

  const applyApiUrl = useCallback(() => {
    const next = apiDraft.trim().replace(/\/$/, '');
    if (!next) return;
    setApiBaseUrl(next);
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
    setCompletionOperator(order[completionOperatorField] || '手机端');
    setCompletionNote(order[completionNoteField] || '');
  }, []);

  const closeCompletionModal = useCallback(() => {
    if (savingOrderId) return;
    setCompletionOrder(null);
    setCompletionOperator('');
    setCompletionNote('');
  }, [savingOrderId]);

  const submitCompletion = useCallback(async () => {
    if (!completionOrder) return;
    setSavingOrderId(completionOrder.id);
    try {
      const patch = {
        [completionTimeField]: new Date().toISOString(),
        [completionOperatorField]: completionOperator.trim() || '手机端',
        [completionNoteField]: completionNote.trim(),
      };
      const row = await saveOrderStatus(completionOrder, '已完成', patch);
      updateLocalOrder(completionOrder._customerId, row);
      setCompletionOrder(null);
      setCompletionOperator('');
      setCompletionNote('');
    } catch (err) {
      Alert.alert('更新失败', err.message || '无法连接服务器');
    } finally {
      setSavingOrderId('');
    }
  }, [completionNote, completionOperator, completionOrder, saveOrderStatus, updateLocalOrder]);

  const openDetail = useCallback((order) => {
    setSelectedOrder(order);
  }, []);

  const listHeader = (
    <View>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>FOAM FACTORY</Text>
          <Text style={styles.title}>手机排产</Text>
        </View>
        <Pressable style={styles.settingsButton} onPress={() => setShowSettings(current => !current)}>
          <Text style={styles.settingsButtonText}>接口</Text>
        </Pressable>
      </View>

      {showSettings ? (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.settingsPanel}>
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
                <Text style={styles.panelLabel}>订单卡片显示</Text>
                <Pressable onPress={() => setMobileDisplayFields(defaultMobileDisplayFields)}>
                  <Text style={styles.resetFieldsText}>恢复默认</Text>
                </Pressable>
              </View>
              <View style={styles.displayFieldChips}>
                {mobileDisplayFieldOptions.map(option => {
                  const active = mobileDisplayFields.includes(option.field);
                  return (
                    <Pressable
                      key={option.field}
                      style={[styles.displayFieldChip, active && styles.displayFieldChipActive]}
                      onPress={() => toggleMobileDisplayField(option.field)}
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
        <StatCard label="已完成" value={stats.completed} tone="green" />
        <StatCard label="订单数" value={stats.all} tone="slate" />
      </View>

      <View style={styles.segmented}>
        <SegmentButton label="排产" active={activeView === 'schedule'} onPress={() => setActiveView('schedule')} />
        <SegmentButton label="订单" active={activeView === 'orders'} onPress={() => setActiveView('orders')} />
        <SegmentButton label="完成" active={activeView === 'completed'} onPress={() => setActiveView('completed')} />
      </View>

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
            displayFields={selectedMobileDisplayFields}
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
        onClose={() => setSelectedOrder(null)}
        onComplete={markCompleted}
      />

      <CompletionModal
        order={completionOrder}
        operator={completionOperator}
        note={completionNote}
        saving={completionOrder ? savingOrderId === completionOrder.id : false}
        onChangeOperator={setCompletionOperator}
        onChangeNote={setCompletionNote}
        onCancel={closeCompletionModal}
        onSubmit={submitCompletion}
      />
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
  const visibleFields = displayFields || [];

  return (
    <Pressable style={styles.orderCard} onPress={() => onOpen(order)}>
      <View style={styles.cardTopRow}>
        <View style={styles.cardTitleWrap}>
          <Text style={styles.orderNo}>{fieldText(order.orderNo || order.id)}</Text>
          <Text style={styles.customerName}>{order._customerName}</Text>
        </View>
        <StatusChip status={status} />
      </View>

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
      ) : null}

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

function OrderDetailModal({ order, saving, onClose, onComplete }) {
  return (
    <Modal visible={Boolean(order)} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalSafeArea}>
        {order ? (
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.eyebrow}>ORDER DETAIL</Text>
                <Text style={styles.modalTitle}>{fieldText(order.orderNo || order.id)}</Text>
              </View>
              <Pressable style={styles.closeButton} onPress={onClose}>
                <Text style={styles.closeButtonText}>关闭</Text>
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.detailList}>
              <DetailRow label="客户" value={order._customerName} />
              <DetailRow label="产品" value={fieldText(order.product)} />
              <DetailRow label="数量" value={formatNumber(order.quantity)} />
              <DetailRow label="金额" value={formatNumber(order.amount)} />
              <DetailRow label="订单日期" value={fieldText(order.date)} />
              <DetailRow label="交期" value={fieldText(order.dueDate)} />
              <DetailRow label="进度" value={normalizeStatus(order.status)} />
              <DetailRow label="完成时间" value={formatDateTime(order[completionTimeField])} />
              <DetailRow label="完成人" value={fieldText(order[completionOperatorField])} />
              <DetailRow label="完成备注" value={fieldText(order[completionNoteField])} multiline />
              <DetailRow label="跟进记录" value={fieldText(order.followUp)} multiline />
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
  saving,
  onChangeOperator,
  onChangeNote,
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

            <View style={styles.completionActions}>
              <Pressable style={styles.lightButton} onPress={onCancel} disabled={saving}>
                <Text style={styles.lightButtonText}>取消</Text>
              </Pressable>
              <Pressable style={[styles.doneButton, saving && styles.doneButtonDisabled]} onPress={onSubmit} disabled={saving}>
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

function LoadingState() {
  return (
    <View style={styles.stateBox}>
      <ActivityIndicator color="#42e8ff" />
      <Text style={styles.stateText}>正在加载订单...</Text>
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
  completionActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 16,
  },
});
