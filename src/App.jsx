import { useEffect, useMemo, useRef, useState } from "react";
import { makeId, today } from "./lib/utils.js";
import { loadAISettings } from "./lib/aiSettings.js";
import { AISettingsModal } from "./components/AISettingsModal.jsx";
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
  LayoutDashboard,
  PackageCheck,
  Plus,
  Save,
  Search,
  Settings2,
  SquarePen,
  Truck,
  UserRoundPlus,
  X,
  Bot,
} from "lucide-react";

ModuleRegistry.registerModules([AllCommunityModule]);

const STORAGE_KEY = "foam-factory-crm:v1";

const statusOptions = ["待确认", "生产中", "待发货", "已发货", "已完成", "异常"];
const deliveryStatusOptions = ["待装车", "配送中", "已签收", "回单异常"];
const customerLevelOptions = ["重点客户", "稳定客户", "新客户", "暂停合作"];

const tableConfigs = {
  products: {
    label: "产品录入",
    icon: Boxes,
    rowLabel: "产品",
    defaultColumns: [
      { field: "name", headerName: "产品名称", width: 150, required: true },
      { field: "spec", headerName: "规格尺寸", width: 150 },
      { field: "material", headerName: "泡沫材质", width: 130 },
      { field: "unit", headerName: "单位", width: 90 },
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
    defaultColumns: [
      { field: "orderNo", headerName: "订单号", width: 140, required: true },
      { field: "date", headerName: "下单日期", width: 130, type: "date" },
      { field: "product", headerName: "产品", width: 150 },
      { field: "quantity", headerName: "数量", width: 100, type: "number" },
      { field: "amount", headerName: "金额", width: 120, type: "number" },
      { field: "dueDate", headerName: "交期", width: 130, type: "date" },
      {
        field: "status",
        headerName: "跟进状态",
        width: 130,
        type: "select",
        options: statusOptions,
      },
      { field: "followUp", headerName: "跟进记录", flex: 1, minWidth: 220 },
    ],
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

function loadCustomers() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialCustomers;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : initialCustomers;
  } catch {
    return initialCustomers;
  }
}

function App() {
  const [customers, setCustomers] = useState(loadCustomers);
  const [selectedCustomerId, setSelectedCustomerId] = useState(
    () => loadCustomers()[0]?.id,
  );
  const [activeTable, setActiveTable] = useState("orders");
  const [searchText, setSearchText] = useState("");
  const [quickFilter, setQuickFilter] = useState("");
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showColumnModal, setShowColumnModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [aiSettings, setAISettings] = useState(loadAISettings);
  const [showAISettings, setShowAISettings] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(customers));
  }, [customers]);

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

  const handleRowsChange = (tableKey, rows) => {
    updateSelectedCustomer((customer) => ({
      ...customer,
      [tableKey]: rows,
    }));
  };

  const addRow = (tableKey) => {
    const config = tableConfigs[tableKey];
    updateSelectedCustomer((customer) => ({
      ...customer,
      [tableKey]: [
        { id: makeId(tableKey), ...config.emptyRow, date: today() },
        ...(customer[tableKey] || []),
      ],
    }));
  };

  const deleteRows = (tableKey, ids) => {
    updateSelectedCustomer((customer) => ({
      ...customer,
      [tableKey]: (customer[tableKey] || []).filter((row) => !ids.includes(row.id)),
    }));
  };

  const addCustomColumn = (tableKey, column) => {
    updateSelectedCustomer((customer) => ({
      ...customer,
      customColumns: {
        ...customer.customColumns,
        [tableKey]: [...(customer.customColumns?.[tableKey] || []), column],
      },
    }));
  };

  const removeCustomColumn = (tableKey, field) => {
    updateSelectedCustomer((customer) => {
      const rows = (customer[tableKey] || []).map((row) => {
        const nextRow = { ...row };
        delete nextRow[field];
        return nextRow;
      });
      return {
        ...customer,
        [tableKey]: rows,
        customColumns: {
          ...customer.customColumns,
          [tableKey]: (customer.customColumns?.[tableKey] || []).filter(
            (column) => column.field !== field,
          ),
        },
      };
    });
  };

  const upsertCustomer = (customerInput) => {
    if (customerInput.id) {
      setCustomers((current) =>
        current.map((customer) =>
          customer.id === customerInput.id ? { ...customer, ...customerInput } : customer,
        ),
      );
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
    setCustomers((current) => [newCustomer, ...current]);
    setSelectedCustomerId(newCustomer.id);
  };

  const resetDemoData = () => {
    setCustomers(initialCustomers);
    setSelectedCustomerId(initialCustomers[0]?.id);
    setActiveTable("orders");
  };

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
            <button
              className={`customer-item ${
                customer.id === selectedCustomerId ? "is-active" : ""
              }`}
              key={customer.id}
              type="button"
              onClick={() => setSelectedCustomerId(customer.id)}
            >
              <span className="customer-name">{customer.name}</span>
              <span className="customer-meta">
                {customer.contact || "未填联系人"} · {customer.level}
              </span>
            </button>
          ))}
        </div>

        <div className="sidebar-footer">
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
              title="AI 设置"
              onClick={() => setShowAISettings(true)}
            >
              <Bot size={18} />
            </button>
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
            />
          ) : (
            <div className="empty-state">请先新增或选择一个客户。</div>
          )}
        </section>
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

      {showAISettings && (
        <AISettingsModal
          settings={aiSettings}
          onClose={() => setShowAISettings(false)}
          onSave={setAISettings}
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
}) {
  const gridRef = useRef(null);
  const config = tableConfigs[tableKey];
  const rows = customer[tableKey] || [];
  const customColumns = customer.customColumns?.[tableKey] || [];

  const columnDefs = useMemo(() => {
    const actionColumn = {
      field: "__actions",
      headerName: "",
      width: 68,
      pinned: "right",
      sortable: false,
      filter: false,
      resizable: false,
      editable: false,
      cellRenderer: (params) => (
        <button
          className="grid-delete"
          type="button"
          title="删除该行"
          onClick={() => onDeleteRows(tableKey, [params.data.id])}
        >
          <X size={15} />
        </button>
      ),
    };

    return [
      ...config.defaultColumns.map(toGridColumn),
      ...customColumns.map(toGridColumn),
      actionColumn,
    ];
  }, [config.defaultColumns, customColumns, onDeleteRows, tableKey]);

  const defaultColDef = useMemo(
    () => ({
      editable: true,
      sortable: true,
      filter: true,
      resizable: true,
      minWidth: 90,
      singleClickEdit: true,
    }),
    [],
  );

  const handleCellValueChanged = (event) => {
    const updatedRows = rows.map((row) =>
      row.id === event.data.id ? { ...event.data } : row,
    );
    onRowsChange(tableKey, updatedRows);
  };

  return (
    <div className="grid-shell">
      <AgGridReact
        ref={gridRef}
        theme={gridTheme}
        rowData={rows}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        rowSelection="multiple"
        animateRows
        stopEditingWhenCellsLoseFocus
        localeText={localeText}
        quickFilterText={quickFilter}
        onCellValueChanged={handleCellValueChanged}
        getRowId={(params) => params.data.id}
      />
    </div>
  );
}

function toGridColumn(column) {
  const gridColumn = {
    field: column.field,
    headerName: column.headerName,
    width: column.width,
    flex: column.flex,
    minWidth: column.minWidth,
    editable: true,
    cellClass: column.required ? "required-cell" : undefined,
  };

  if (column.type === "number") {
    gridColumn.valueParser = (params) => Number(params.newValue || 0);
    gridColumn.valueFormatter = (params) =>
      params.value === "" || params.value == null ? "" : Number(params.value).toString();
    gridColumn.cellClass = "number-cell";
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

function statusClass(value = "") {
  if (value.includes("完成") || value.includes("签收")) return "is-done";
  if (value.includes("异常")) return "is-risk";
  if (value.includes("生产") || value.includes("配送")) return "is-live";
  if (value.includes("发货") || value.includes("装车")) return "is-waiting";
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
