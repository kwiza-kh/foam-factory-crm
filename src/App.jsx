import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { makeId, today } from "./lib/utils.js";
import { api } from "./lib/api.js";
import { OrderImportButton } from "./components/OrderImportButton.jsx";
import { exportTableToExcel } from "./lib/exporter.js";
import { exportBackup, importBackup } from "./lib/backup.js";
import { DeliveryPrintModal } from "./components/DeliveryPrintModal.jsx";
import { AgGridReact } from "ag-grid-react";
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
} from "ag-grid-community";
import {
  Boxes,
  ClipboardList,
  FilePlus2,
  Filter,
  KanbanSquare,
  LayoutDashboard,
  PackageCheck,
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
} from "lucide-react";

ModuleRegistry.registerModules([AllCommunityModule]);

const statusOptions = ["待确认", "生产中", "待发货", "已发货", "已完成", "异常"];
const deliveryStatusOptions = ["待装车", "配送中", "已签收", "回单异常"];
const customerLevelOptions = ["重点客户", "稳定客户", "新客户", "暂停合作"];
const materialOptions = ["EPS", "EPE", "EPP", "珍珠棉", "海绵", "其他"];
const unitOptions = ["件", "套", "箱", "个", "㎡", "m³", "kg"];

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
    defaultColumns: [],
    emptyRow: {
      orderNo: "",
      date: "",
      product: "",
      quantity: 0,
      amount: 0,
      dueDate: "",
      status: "待确认",
      followUp: "",
    },
  },
  deliveries: {
    label: "送货单录入",
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
      { field: "orderNo", headerName: "关联订单", width: 140 },
      { field: "receiver", headerName: "收货人", width: 120 },
      { field: "address", headerName: "送货地址", flex: 1, minWidth: 220 },
      { field: "packages", headerName: "件数", width: 100, type: "number" },
      {
        field: "status",
        headerName: "送货状态",
        width: 130,
        type: "select",
        options: deliveryStatusOptions,
      },
      { field: "signedNote", headerName: "签收备注", flex: 1, minWidth: 180 },
    ],
    emptyRow: {
      deliveryNo: "",
      date: "",
      orderNo: "",
      receiver: "",
      address: "",
      packages: 0,
      status: "待装车",
      signedNote: "",
    },
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
        status: "生产中",
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
        status: "待发货",
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
  const usedIdsByTable = Object.keys(tableConfigs).reduce((acc, tableKey) => {
    acc[tableKey] = new Set();
    return acc;
  }, {});

  return (customers || []).map((customer) => {
    const nextCustomer = { ...customer };

    for (const tableKey of Object.keys(tableConfigs)) {
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

function App() {
  const [customers, setCustomers] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTable, setActiveTable] = useState("orders");
  const [searchText, setSearchText] = useState("");
  const [quickFilter, setQuickFilter] = useState("");
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showColumnModal, setShowColumnModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const backupInputRef = useRef();
  const [printDelivery, setPrintDelivery] = useState(null);
  const [showKanban, setShowKanban] = useState(false);
  const customersRef = useRef(customers);
  const selectedCustomerIdRef = useRef(selectedCustomerId);
  const activeTableRef = useRef(activeTable);
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
          alert(`撤销已在界面完成，但同步数据库失败：${err.message}`);
        }
      }
    };

    run();
  }, []);

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

      event.preventDefault();
      restoreLastUndoSnapshot();
    };

    window.addEventListener("keydown", handleUndoKeyDown, true);
    return () => window.removeEventListener("keydown", handleUndoKeyDown, true);
  }, [restoreLastUndoSnapshot]);

  useEffect(() => {
    api.getCustomers()
      .then(data => {
        setCustomers(data);
        if (data.length) setSelectedCustomerId(data[0].id);
      })
      .catch(err => alert(`加载失败：${err.message}`))
      .finally(() => setLoading(false));
  }, []);

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
        if (["已完成", "异常"].includes(order.status) || !order.dueDate) continue;
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
    const allDeliveries = customers.flatMap((customer) => customer.deliveries || []);
    const activeOrders = allOrders.filter(
      (order) => !["已完成", "异常"].includes(order.status),
    );
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
        detail: "生产、待发货、配送前跟进",
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

  const updateSelectedCustomer = (updater) => {
    setCustomers((current) =>
      current.map((customer) =>
        customer.id === selectedCustomerId ? updater(customer) : customer,
      ),
    );
  };

  const handleRowsChange = async (tableKey, rows) => {
    const safeRows = ensureUniqueRowIds(rows, tableKey, customersRef.current, selectedCustomerId);
    updateSelectedCustomer(c => ({ ...c, [tableKey]: safeRows }));
    const revision = nextRowSaveRevision(selectedCustomerId, tableKey);
    try {
      const result = await saveRowsQueued(selectedCustomerId, tableKey, safeRows);
      if (result?.rows && isLatestRowSaveRevision(selectedCustomerId, tableKey, revision)) {
        updateSelectedCustomer(c => ({ ...c, [tableKey]: result.rows }));
      }
    } catch (err) {
      alert(`保存失败：${err.message}`);
    }
  };

  const addRow = async (tableKey) => {
    pushUndoSnapshot();
    const config = tableConfigs[tableKey];
    const newRow = { id: makeId(tableKey), ...config.emptyRow, date: today() };
    const newRows = ensureUniqueRowIds(
      [newRow, ...(selectedCustomer?.[tableKey] || [])],
      tableKey,
      customersRef.current,
      selectedCustomerId,
    );
    updateSelectedCustomer(c => ({ ...c, [tableKey]: newRows }));
    const revision = nextRowSaveRevision(selectedCustomerId, tableKey);
    try {
      const result = await saveRowsQueued(selectedCustomerId, tableKey, newRows);
      if (result?.rows && isLatestRowSaveRevision(selectedCustomerId, tableKey, revision)) {
        updateSelectedCustomer(c => ({ ...c, [tableKey]: result.rows }));
      }
    } catch (err) {
      alert(`保存失败：${err.message}`);
    }
  };

  const deleteRows = async (tableKey, ids) => {
    pushUndoSnapshot();
    const nextRows = ensureUniqueRowIds(
      (selectedCustomer?.[tableKey] || []).filter(r => !ids.includes(r.id)),
      tableKey,
      customersRef.current,
      selectedCustomerId,
    );
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
      alert(`删除失败：${err.message}`);
    }
  };

  const addCustomColumn = async (tableKey, column) => {
    pushUndoSnapshot();
    const newCustomColumns = {
      ...selectedCustomer.customColumns,
      [tableKey]: [...(selectedCustomer.customColumns?.[tableKey] || []), column],
    };
    updateSelectedCustomer(c => ({ ...c, customColumns: newCustomColumns }));
    try {
      await api.updateCustomer(selectedCustomerId, { ...selectedCustomer, customColumns: newCustomColumns });
    } catch (err) {
      alert(`保存失败：${err.message}`);
    }
  };

  const removeCustomColumns = async (tableKey, fields) => {
    const fieldsToRemove = new Set(fields);
    if (!fieldsToRemove.size) return;

    pushUndoSnapshot();
    const cleanedRows = (selectedCustomer[tableKey] || []).map(row => {
      let next = row;
      for (const field of fieldsToRemove) {
        if (!(field in next)) continue;
        if (next === row) next = { ...row };
        delete next[field];
      }
      return next;
    });
    const safeRows = ensureUniqueRowIds(cleanedRows, tableKey, customersRef.current, selectedCustomerId);
    const newCustomColumns = {
      ...selectedCustomer.customColumns,
      [tableKey]: (selectedCustomer.customColumns?.[tableKey] || []).filter(c => !fieldsToRemove.has(c.field)),
      columnOrder: {
        ...(selectedCustomer.customColumns?.columnOrder || {}),
        [tableKey]: (selectedCustomer.customColumns?.columnOrder?.[tableKey] || [])
          .filter(field => !fieldsToRemove.has(field)),
      },
    };
    updateSelectedCustomer(c => ({ ...c, [tableKey]: safeRows, customColumns: newCustomColumns }));
    const revision = nextRowSaveRevision(selectedCustomerId, tableKey);
    try {
      const [, rowsResult] = await Promise.all([
        api.updateCustomer(selectedCustomerId, { ...selectedCustomer, customColumns: newCustomColumns }),
        saveRowsQueued(selectedCustomerId, tableKey, safeRows),
      ]);
      if (rowsResult?.rows && isLatestRowSaveRevision(selectedCustomerId, tableKey, revision)) {
        updateSelectedCustomer(c => ({ ...c, [tableKey]: rowsResult.rows }));
      }
    } catch (err) {
      alert(`保存失败：${err.message}`);
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
        alert(`保存失败：${err.message}`);
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
      alert(`保存失败：${err.message}`);
    }
  };

  const handleOrderImport = async (rows, extraColumns = []) => {
    pushUndoSnapshot();
    const existingColumns = selectedCustomer.customColumns?.orders || [];
    const existingFields = new Set([
      ...tableConfigs.orders.defaultColumns.map(column => column.field),
      ...existingColumns.map(column => column.field),
    ]);
    const newExtraColumns = extraColumns.filter(column => !existingFields.has(column.field));
    const customColumns = {
      ...selectedCustomer.customColumns,
      orders: [...existingColumns, ...newExtraColumns],
    };
    const newRows = ensureUniqueRowIds(
      [
        ...(selectedCustomer.orders || []),
        ...rows.map(row => ({
          ...tableConfigs.orders.emptyRow,
          id: makeId("orders"),
          ...row,
          status: row.status || tableConfigs.orders.emptyRow.status,
        })),
      ],
      "orders",
      customersRef.current,
      selectedCustomerId,
    );

    updateSelectedCustomer(c => ({ ...c, orders: newRows, customColumns }));
    const revision = nextRowSaveRevision(selectedCustomerId, "orders");
    try {
      const [, rowsResult] = await Promise.all([
        newExtraColumns.length
          ? api.updateCustomer(selectedCustomerId, { ...selectedCustomer, customColumns })
          : Promise.resolve(),
        saveRowsQueued(selectedCustomerId, "orders", newRows),
      ]);
      if (rowsResult?.rows && isLatestRowSaveRevision(selectedCustomerId, "orders", revision)) {
        updateSelectedCustomer(c => ({ ...c, orders: rowsResult.rows }));
      }
    } catch (err) {
      alert(`保存失败：${err.message}`);
    }
  };

  const handleRestore = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = "";
    try {
      const data = await importBackup(file);
      if (window.confirm(`恢复备份将覆盖当前所有数据（共 ${data.length} 个客户）。确认继续？`)) {
        const safeData = ensureUniqueCustomerRowIds(data);
        pushUndoSnapshot();
        const result = await api.replaceAll(safeData);
        setCustomers(result?.customers || safeData);
        setSelectedCustomerId((result?.customers || safeData)[0]?.id);
      }
    } catch (err) {
      alert(`恢复失败：${err.message}`);
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
      alert(`保存失败：${err.message}`);
    }
  }, [pushUndoSnapshot, selectedCustomer, selectedCustomerId]);

  const deleteCustomer = async (id) => {
    if (!window.confirm('确认删除该客户？此操作不可恢复，包括所有订单和送货记录。')) return;
    pushUndoSnapshot();
    setCustomers(current => current.filter(c => c.id !== id));
    if (selectedCustomerId === id) {
      const remaining = customers.filter(c => c.id !== id);
      setSelectedCustomerId(remaining[0]?.id || null);
    }
    try {
      await api.deleteCustomer(id);
    } catch (err) {
      alert(`删除失败：${err.message}`);
    }
  };

  const resetDemoData = async () => {
    try {
      const safeInitialCustomers = ensureUniqueCustomerRowIds(initialCustomers);
      pushUndoSnapshot();
      const result = await api.replaceAll(safeInitialCustomers);
      setCustomers(result?.customers || safeInitialCustomers);
      setSelectedCustomerId((result?.customers || safeInitialCustomers)[0]?.id);
      setActiveTable("orders");
    } catch (err) {
      alert(`重置失败：${err.message}`);
    }
  };

  if (loading) {
    return (
      <div className="app-shell" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#82e5ff', fontSize: '1rem' }}>正在连接数据库...</p>
      </div>
    );
  }

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

        <button
          className={`ghost-button kanban-toggle ${showKanban ? 'is-active' : ''}`}
          type="button"
          onClick={() => setShowKanban(v => !v)}
        >
          <KanbanSquare size={15} />
          订单看板
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
                onClick={() => setSelectedCustomerId(customer.id)}
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
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">CUSTOMER COMMAND CENTER</p>
            <h2>{selectedCustomer?.name || "请选择客户"}</h2>
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

        {showKanban ? (
          <OrderKanban customers={customers} onSelectCustomer={id => { setSelectedCustomerId(id); setShowKanban(false); }} />
        ) : (
          <>
            {selectedCustomer && alertMap[selectedCustomer.id] && (
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
                        onClick={() => setActiveTable(key)}
                      >
                        <Icon size={17} />
                        {config.label}
                      </button>
                    );
                  })}
                </div>
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
                      onImport={handleOrderImport}
                    />
                  )}
                  {selectedCustomer && (
                    <button
                      className="secondary-button"
                      type="button"
                      title="导出当前表格为 Excel"
                      onClick={() =>
                        exportTableToExcel(selectedCustomer, activeTable, [
                          ...tableConfigs[activeTable].defaultColumns,
                          ...(selectedCustomer.customColumns?.[activeTable] || []),
                        ])
                      }
                    >
                      <Download size={15} />
                      导出 Excel
                    </button>
                  )}
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => setShowColumnModal(true)}
                    disabled={!selectedCustomer}
                  >
                    <Settings2 size={17} />
                    自定义表头
                  </button>
                  <button
                    className="primary-action compact"
                    type="button"
                    onClick={() => addRow(activeTable)}
                    disabled={!selectedCustomer}
                  >
                    <Plus size={17} />
                    新增{tableConfigs[activeTable].rowLabel}
                  </button>
                </div>
              </div>

              {selectedCustomer ? (
                <BusinessGrid
                  key={`${selectedCustomer.id}-${activeTable}`}
                  customer={selectedCustomer}
                  tableKey={activeTable}
                  quickFilter={quickFilter}
                  onRowsChange={handleRowsChange}
                  onDeleteRows={deleteRows}
                  onPrintRow={activeTable === "deliveries" ? setPrintDelivery : null}
                  onColumnOrderChange={handleColumnOrderChange}
                  onRemoveColumns={removeCustomColumns}
                  onBeforeDataChange={pushUndoSnapshot}
                  onCreateUndoSnapshot={takeUndoSnapshot}
                />
              ) : (
                <div className="empty-state">请先新增或选择一个客户。</div>
              )}
            </section>
          </>
        )}
      </main>

      <aside className="inspector">
        <div className="inspector-header">
          <span>客户摘要</span>
          <PackageCheck size={18} />
        </div>
        <div className="status-ring" aria-label="客户订单状态概览">
          <strong>{selectedCustomer?.orders?.length || 0}</strong>
          <span>订单</span>
        </div>
        <SummaryList customer={selectedCustomer} />
        <div className="note-panel">
          <span>客户备注</span>
          <p>{selectedCustomer?.note || "暂无备注"}</p>
        </div>
      </aside>

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
          tableKey={activeTable}
          customer={selectedCustomer}
          onClose={() => setShowColumnModal(false)}
          onAddColumn={addCustomColumn}
          onRemoveColumn={removeCustomColumn}
        />
      )}


      {printDelivery && selectedCustomer && (
        <DeliveryPrintModal
          delivery={printDelivery}
          customer={selectedCustomer}
          onClose={() => setPrintDelivery(null)}
        />
      )}
    </div>
  );
}

function BusinessGrid({
  customer,
  tableKey,
  quickFilter,
  onRowsChange,
  onDeleteRows,
  onPrintRow = null,
  onColumnOrderChange,
  onRemoveColumns,
  onBeforeDataChange,
  onCreateUndoSnapshot,
}) {
  const gridRef = useRef(null);
  const gridShellRef = useRef(null);
  const dragSelectionRef = useRef(null);
  const fillSelectedCellsRef = useRef(null);
  const pendingEditSnapshotRef = useRef(null);
  const selectionRangeRef = useRef(null);
  const selectableColumnFieldsRef = useRef([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectionRange, setSelectionRange] = useState(null);
  const [columnFilters, setColumnFilters] = useState({});
  const [filterPopup, setFilterPopup] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [insertRowCounts, setInsertRowCounts] = useState({ above: "", below: "" });
  const config = tableConfigs[tableKey];
  const rows = customer[tableKey] || [];
  const customColumns = customer.customColumns?.[tableKey] || [];
  const savedOrder = customer.customColumns?.columnOrder?.[tableKey];
  const filteredRows = useMemo(() => {
    const activeFilters = Object.entries(columnFilters);
    if (!activeFilters.length) return rows;
    return rows.filter(row =>
      activeFilters.every(([field, allowedValues]) =>
        allowedValues.has(filterValue(row[field]).key),
      ),
    );
  }, [rows, columnFilters]);

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
      valueGetter: (params) => (params.node?.rowPinned ? "合计" : (params.node?.rowIndex ?? 0) + 1),
      cellClass: "row-number-cell",
      cellClassRules: selectionCellClassRules,
    };

    const actionColumn = {
      field: "__actions",
      headerName: "",
      width: onPrintRow ? 100 : 68,
      pinned: "right",
      sortable: false,
      filter: false,
      resizable: false,
      editable: false,
      cellRenderer: (params) => (
        <div style={{ display: "flex", gap: 4, alignItems: "center", height: "100%" }}>
          {onPrintRow && (
            <button
              className="grid-delete"
              type="button"
              title="打印送货单"
              onClick={() => onPrintRow(params.data)}
            >
              <Printer size={14} />
            </button>
          )}
          <button
            className="grid-delete"
            type="button"
            title="删除该行"
            onClick={() => onDeleteRows(tableKey, [params.data.id])}
          >
            <X size={15} />
          </button>
        </div>
      ),
    };

    const allCols = [
      ...config.defaultColumns.map(toGridColumn),
      ...customColumns.map(toGridColumn),
    ];

    if (savedOrder?.length) {
      allCols.sort((a, b) => {
        const ai = savedOrder.indexOf(a.field);
        const bi = savedOrder.indexOf(b.field);
        return (ai === -1 ? 9999 : ai) - (bi === -1 ? 9999 : bi);
      });
    }

    return [rowNumberColumn, ...allCols, actionColumn];
  }, [config.defaultColumns, customColumns, onDeleteRows, tableKey, savedOrder]);

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
      editable: (params) => !params.node?.rowPinned,
      sortable: true,
      filter: false,
      resizable: true,
      minWidth: 90,
      singleClickEdit: false,
    }),
    [],
  );

  const handleCellValueChanged = (event) => {
    if (pendingEditSnapshotRef.current) {
      onBeforeDataChange?.(pendingEditSnapshotRef.current);
      pendingEditSnapshotRef.current = null;
    } else {
      onBeforeDataChange?.();
    }

    const updatedRows = rows.map((row) =>
      row.id === event.data.id ? { ...event.data } : row,
    );
    onRowsChange(tableKey, updatedRows);
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
      if (node.rowIndex < minRow || node.rowIndex > maxRow || !node.data?.id) return;
      ids.push(node.data.id);
    });

    return ids;
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
  }, [selectableColumnFields, selectCellsByRange, selectRowsByRange]);

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
    setSelectedIds(event.api.getSelectedRows().map(row => row.id));
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

  const handleBatchDelete = () => {
    if (!selectedIds.length) return;
    if (!window.confirm(`确认删除选中的 ${selectedIds.length} 行？此操作不可恢复。`)) return;
    onDeleteRows(tableKey, selectedIds);
    setSelectedIds([]);
    gridRef.current?.api?.deselectAll();
    setSelectionRange(null);
  };

  const deleteSelectedArea = useCallback(() => {
    const selection = selectionRangeRef.current;
    if (!selection) return;

    if (selection.mode === "rows") {
      const rowIds = getVisibleRowIdsInRange(selection.startRowIndex, selection.endRowIndex);
      if (!rowIds.length) return;
      if (!window.confirm(`确认删除选中的 ${rowIds.length} 行？此操作不可恢复。`)) return;
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
      if (!node.data?.id) return;
      if (selection.mode === "cells" && (node.rowIndex < minRow || node.rowIndex > maxRow)) return;
      targetRowIds.add(node.data.id);
    });

    if (!targetRowIds.size) return;

    let changed = false;
    const clearedRows = rows.map((row) => {
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
    onRowsChange(tableKey, clearedRows);
  }, [getVisibleRowIdsInRange, onBeforeDataChange, onDeleteRows, onRowsChange, rows, tableKey]);

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
      if (!node.data?.id) return;
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
      if (node.data?.id) visibleNodes.push(node);
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
      rows.map(row => updatedRowsById.get(row.id) || row),
    );
    return true;
  }, [onBeforeDataChange, onRowsChange, rows, tableKey]);

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
      if (!node.data?.id) return;
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
      rows.map(row => updatedRowsById.get(row.id) || row),
    );
    return true;
  }, [onBeforeDataChange, onRowsChange, rows, tableKey]);

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
      if (!node.data?.id) return;
      if (selection.mode !== "columns" && (node.rowIndex < minRow || node.rowIndex > maxRow)) return;
      rowIds.add(node.data.id);
    });

    return rowIds.size ? { fields: selectedFields, rowIds } : null;
  }, []);

  const clearSelectedContents = useCallback(() => {
    const scope = getSelectedAreaScope();
    if (!scope) return false;

    let changed = false;
    const clearedRows = rows.map((row) => {
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
    onRowsChange(tableKey, clearedRows);
    return true;
  }, [getSelectedAreaScope, onBeforeDataChange, onRowsChange, rows, tableKey]);

  const setSelectedAreaValue = useCallback((value) => {
    const scope = getSelectedAreaScope();
    if (!scope) return false;

    let changed = false;
    const updatedRows = rows.map((row) => {
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
    onRowsChange(tableKey, updatedRows);
    return true;
  }, [getSelectedAreaScope, onBeforeDataChange, onRowsChange, rows, tableKey]);

  const batchModifySelectedArea = useCallback(() => {
    if (!selectionRangeRef.current) return;

    const value = window.prompt("批量修改选区为：");
    if (value === null) return;
    setSelectedAreaValue(value);
  }, [setSelectedAreaValue]);

  const findInTable = useCallback(() => {
    const query = window.prompt("查找内容：");
    if (!query) return;

    const fields = selectableColumnFieldsRef.current;
    let match = null;

    gridRef.current?.api?.forEachNodeAfterFilterAndSort((node) => {
      if (match || !node.data?.id) return;

      for (let colIndex = 0; colIndex < fields.length; colIndex++) {
        const field = fields[colIndex];
        if (String(node.data[field] ?? "").includes(query)) {
          match = { rowIndex: node.rowIndex, colIndex, field };
          break;
        }
      }
    });

    if (!match) {
      alert("未找到匹配内容。");
      return;
    }

    selectCellsByRange(match.rowIndex, match.rowIndex, match.colIndex, match.colIndex);
    gridRef.current?.api?.ensureIndexVisible(match.rowIndex, "middle");
    gridRef.current?.api?.ensureColumnVisible(match.field);
  }, [selectCellsByRange]);

  const replaceInTable = useCallback(() => {
    const findText = window.prompt("查找内容：");
    if (!findText) return;

    const replacement = window.prompt("替换为：");
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
      if (!node.data?.id) return;
      if (selection && selection.mode !== "columns" && (node.rowIndex < minRow || node.rowIndex > maxRow)) return;
      targetRowIds.add(node.data.id);
    });

    let replaceCount = 0;
    const updatedRows = rows.map((row) => {
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
      alert("未找到可替换内容。");
      return;
    }

    onBeforeDataChange?.();
    onRowsChange(tableKey, updatedRows);
    alert(`已替换 ${replaceCount} 个单元格。`);
  }, [onBeforeDataChange, onRowsChange, rows, tableKey]);

  const duplicateSelectedRows = useCallback(() => {
    const selection = selectionRangeRef.current;
    if (!selection || selection.mode !== "rows") return false;

    const rowIds = getVisibleRowIdsInRange(selection.startRowIndex, selection.endRowIndex);
    if (!rowIds.length) return false;

    const selectedRowById = new Map(rows.map(row => [row.id, row]));
    const clonedRows = rowIds
      .map(id => selectedRowById.get(id))
      .filter(Boolean)
      .map(row => ({ ...row, id: makeId(tableKey) }));
    if (!clonedRows.length) return false;

    const maxRow = Math.max(selection.startRowIndex ?? 0, selection.endRowIndex ?? 0);
    const targetNode = getVisibleNodeAtRowIndex(maxRow);
    const originalIndex = targetNode?.data?.id
      ? rows.findIndex(row => row.id === targetNode.data.id)
      : -1;
    const insertIndex = originalIndex === -1 ? rows.length : originalIndex + 1;
    const nextRows = [...rows];
    nextRows.splice(insertIndex, 0, ...clonedRows);

    onBeforeDataChange?.();
    onRowsChange(tableKey, nextRows);
    return true;
  }, [getVisibleNodeAtRowIndex, getVisibleRowIdsInRange, onBeforeDataChange, onRowsChange, rows, tableKey]);

  const getInsertRowCount = useCallback((placement) => {
    const parsed = Number.parseInt(insertRowCounts[placement], 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  }, [insertRowCounts]);

  const insertRowAtSelection = useCallback((placement, count = 1) => {
    const selection = selectionRangeRef.current;
    const minRow = Math.min(selection?.startRowIndex ?? 0, selection?.endRowIndex ?? 0);
    const maxRow = Math.max(selection?.startRowIndex ?? 0, selection?.endRowIndex ?? 0);
    const targetNode = getVisibleNodeAtRowIndex(placement === "above" ? minRow : maxRow);
    const originalIndex = targetNode?.data?.id
      ? rows.findIndex(row => row.id === targetNode.data.id)
      : -1;
    const insertIndex = originalIndex === -1
      ? (placement === "above" ? 0 : rows.length)
      : originalIndex + (placement === "below" ? 1 : 0);
    const normalizedCount = Math.floor(count);
    const rowCount = Number.isFinite(normalizedCount) && normalizedCount > 0 ? normalizedCount : 1;
    const newRows = Array.from({ length: rowCount }, () => ({
      id: makeId(tableKey),
      ...config.emptyRow,
      date: today(),
    }));
    const nextRows = [...rows];
    nextRows.splice(insertIndex, 0, ...newRows);

    onBeforeDataChange?.();
    onRowsChange(tableKey, nextRows);
  }, [config.emptyRow, getVisibleNodeAtRowIndex, onBeforeDataChange, onRowsChange, rows, tableKey]);

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

  const deleteRowsFromMenu = useCallback(() => {
    const rowIds = getSelectedRowIdsForMenu();
    if (!rowIds.length) return;
    if (!window.confirm(`确认删除选中的 ${rowIds.length} 行？此操作不可恢复。`)) return;

    onDeleteRows(tableKey, rowIds);
    setSelectedIds([]);
    gridRef.current?.api?.deselectAll();
    setSelectionRange(null);
  }, [getSelectedRowIdsForMenu, onDeleteRows, tableKey]);

  const deleteSelectedColumnsFromMenu = useCallback(() => {
    if (!onRemoveColumns || !removableSelectedColumnFields.length) return;

    const columnNames = removableSelectedColumnFields
      .map(field => columnHeaderByField.get(field) || field)
      .join("、");
    const lockedCount = selectedColumnFields.length - removableSelectedColumnFields.length;
    const lockedMessage = lockedCount > 0
      ? `\n其中 ${lockedCount} 个默认表头不会删除。`
      : "";

    if (!window.confirm(`确认删除选中的 ${removableSelectedColumnFields.length} 个自定义表头？\n${columnNames}${lockedMessage}`)) return;

    onRemoveColumns(tableKey, removableSelectedColumnFields);
    setSelectionRange(null);
  }, [
    columnHeaderByField,
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
      alert(`复制失败：${err.message}`);
    }
  }, [getSelectedAreaText]);

  const pasteFromMenu = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      pasteClipboardData(text);
    } catch (err) {
      alert(`粘贴失败：${err.message}`);
    }
  }, [pasteClipboardData]);

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

  const openColumnFilter = useCallback((field, headerName, anchorRect) => {
    setFilterPopup({
      field,
      headerName,
      left: Math.min(anchorRect.left, window.innerWidth - 270),
      top: Math.max(12, Math.min(anchorRect.bottom + 6, window.innerHeight - 390)),
    });
  }, []);

  const closeColumnFilter = useCallback(() => {
    setFilterPopup(null);
  }, []);

  const applyColumnFilter = useCallback((field, selectedValues, allValues) => {
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
  }, []);

  const clearColumnFilter = useCallback((field) => {
    setColumnFilters(current => {
      const next = { ...current };
      delete next[field];
      return next;
    });
    setFilterPopup(null);
  }, []);

  const gridContext = useMemo(() => ({
    openColumnFilter,
    activeFilterFields: new Set(Object.keys(columnFilters)),
    selectionRangeRef,
    selectableColumnFieldsRef,
    startColumnSelection,
    updateColumnSelection,
    openHeaderContextMenu,
  }), [
    columnFilters,
    openHeaderContextMenu,
    openColumnFilter,
    startColumnSelection,
    updateColumnSelection,
  ]);

  return (
    <>
      {selectedIds.length > 0 && (
        <div className="grid-selection-bar">
          <span>已选中 {selectedIds.length} 行</span>
          <button className="danger-button compact" type="button" onClick={handleBatchDelete}>
            <Trash2 size={14} />
            批量删除
          </button>
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
          rowData={filteredRows}
          pinnedBottomRowData={summaryRowData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          context={gridContext}
          rowSelection="multiple"
          suppressRowClickSelection
          animateRows
          stopEditingWhenCellsLoseFocus
          localeText={localeText}
          quickFilterText={quickFilter}
          onCellValueChanged={handleCellValueChanged}
          onCellEditingStarted={handleCellEditingStarted}
          onCellEditingStopped={handleCellEditingStopped}
          onDragStopped={handleDragStopped}
          onCellMouseDown={handleCellMouseDown}
          onCellMouseOver={handleCellMouseOver}
          onCellContextMenu={handleCellContextMenu}
          onSelectionChanged={handleSelectionChanged}
          getRowId={(params) => params.data.id}
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
                disabled={selectionRange?.mode !== "rows"}
                onClick={() => { duplicateSelectedRows(); setContextMenu(null); }}
              >
                <Copy size={14} />
                复制选中行为新行
              </button>
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
  const cellClasses = [
    column.required ? "required-cell" : null,
    column.type === "number" ? "number-cell" : null,
  ].filter(Boolean);

  const gridColumn = {
    field: column.field,
    headerName: column.headerName,
    width: column.width,
    flex: column.flex,
    minWidth: column.minWidth,
    editable: (params) => !params.node?.rowPinned,
    filter: false,
    headerComponent: ColumnHeader,
    cellClass: cellClasses.length ? cellClasses : undefined,
    cellClassRules: selectionCellClassRules,
  };

  if (column.type === "number") {
    gridColumn.valueParser = (params) => Number(params.newValue || 0);
    gridColumn.valueFormatter = (params) =>
      params.value === "" || params.value == null ? "" : Number(params.value).toString();
  }

  if (column.type === "date") {
    gridColumn.cellEditor = "agDateStringCellEditor";
  }

  if (column.type === "select") {
    gridColumn.cellEditor = "agSelectCellEditor";
    gridColumn.cellEditorParams = { values: column.options || [] };
    gridColumn.cellRenderer = (params) => (
      <span className={`status-chip ${statusClass(params.value)}`}>
        {params.value || "未设置"}
      </span>
    );
  }

  return gridColumn;
}

function ColumnHeader(props) {
  const isFiltered = props.context?.activeFilterFields?.has(props.column.getColId());
  const field = props.column.getColId();

  const openFilter = (event) => {
    event.stopPropagation();
    props.context?.openColumnFilter(
      props.column.getColId(),
      props.displayName,
      event.currentTarget.getBoundingClientRect(),
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
      className="column-header"
      onMouseDown={startColumnSelection}
      onMouseEnter={updateColumnSelection}
      onContextMenu={openHeaderContextMenu}
    >
      <button
        className="column-header-label"
        type="button"
        onClick={(event) => event.preventDefault()}
        title={props.displayName}
      >
        {props.displayName}
      </button>
      <button
        className={`column-filter-button ${isFiltered ? "is-active" : ""}`}
        type="button"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={openFilter}
        title="筛选"
      >
        ▾
      </button>
    </div>
  );
}

function ColumnValueFilter({ popup, rows, appliedValues, onApply, onClear, onClose }) {
  const values = useMemo(() => {
    const seen = new Set();
    const result = [];
    for (const row of rows) {
      const value = filterValue(row[popup.field]);
      if (seen.has(value.key)) continue;
      seen.add(value.key);
      result.push(value);
    }
    return result.sort((a, b) => a.label.localeCompare(b.label, "zh-CN", { numeric: true }));
  }, [popup.field, rows]);

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
  if (value.includes("完成") || value.includes("签收")) return "is-done";
  if (value.includes("异常")) return "is-risk";
  if (value.includes("生产") || value.includes("配送")) return "is-live";
  if (value.includes("发货") || value.includes("装车")) return "is-waiting";
  return "";
}

const KANBAN_COLS = ["待确认", "生产中", "待发货", "已发货"];

function OrderKanban({ customers, onSelectCustomer }) {
  const cards = useMemo(() => {
    const result = {};
    for (const col of KANBAN_COLS) result[col] = [];
    for (const c of customers) {
      for (const o of c.orders || []) {
        if (KANBAN_COLS.includes(o.status)) {
          result[o.status].push({ ...o, customerName: c.name, customerId: c.id });
        }
      }
    }
    return result;
  }, [customers]);

  return (
    <section className="kanban-board">
      {KANBAN_COLS.map(col => (
        <div key={col} className="kanban-col">
          <div className={`kanban-col-header status-chip ${statusClass(col)}`}>
            {col} <span className="kanban-count">{cards[col].length}</span>
          </div>
          <div className="kanban-cards">
            {cards[col].map(order => (
              <button
                key={order.id}
                className="kanban-card"
                type="button"
                onClick={() => onSelectCustomer(order.customerId)}
              >
                <span className="kanban-customer">{order.customerName}</span>
                <span className="kanban-order-no">{order.orderNo}</span>
                {order.amount > 0 && (
                  <span className="kanban-amount">
                    ¥{Number(order.amount).toLocaleString("zh-CN")}
                  </span>
                )}
                {order.dueDate && (
                  <span className={`kanban-due ${new Date(order.dueDate) < new Date() ? "is-overdue" : ""}`}>
                    交期 {order.dueDate}
                  </span>
                )}
              </button>
            ))}
            {cards[col].length === 0 && (
              <p className="kanban-empty">暂无订单</p>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}

function InfoPill({ label, value, wide = false }) {
  return (
    <div className={`info-pill ${wide ? "is-wide" : ""}`}>
      <span>{label}</span>
      <strong>{value || "未填写"}</strong>
    </div>
  );
}

function SummaryList({ customer }) {
  const rows = [
    ["产品数", customer?.products?.length || 0],
    ["订单数", customer?.orders?.length || 0],
    ["送货单", customer?.deliveries?.length || 0],
    [
      "待跟进",
      customer?.orders?.filter((order) => !["已完成", "异常"].includes(order.status))
        .length || 0,
    ],
    ["客户等级", customer?.level || "未设置"],
  ];

  return (
    <div className="summary-list">
      {rows.map(([label, value]) => (
        <div className="summary-row" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
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
  onRemoveColumn,
}) {
  const [headerName, setHeaderName] = useState("");
  const [type, setType] = useState("text");
  const customColumns = customer.customColumns?.[tableKey] || [];
  const config = tableConfigs[tableKey];

  const submit = (event) => {
    event.preventDefault();
    if (!headerName.trim()) return;
    onAddColumn(tableKey, {
      field: toFieldKey(headerName),
      headerName: headerName.trim(),
      type,
      width: type === "number" ? 120 : 140,
    });
    setHeaderName("");
    setType("text");
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
            <div className="tag-wrap">
              {customColumns.length ? (
                customColumns.map((column) => (
                  <button
                    className="column-tag removable"
                    type="button"
                    key={column.field}
                    onClick={() => onRemoveColumn(tableKey, column.field)}
                    title="点击删除该自定义表头"
                  >
                    {column.headerName}
                    <X size={13} />
                  </button>
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

export default App;
