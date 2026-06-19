import { useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import {
  CellStyleModule,
  ClientSideRowModelModule,
  ModuleRegistry,
  RowSelectionModule,
  TextEditorModule,
  themeQuartz,
} from 'ag-grid-community';
import { Check, X, Pencil, AlertTriangle } from 'lucide-react';
import { makeId, today } from '../lib/utils.js';
import { statusOptions } from '../lib/statusWorkflow.js';

ModuleRegistry.registerModules([CellStyleModule, ClientSideRowModelModule, RowSelectionModule, TextEditorModule]);

const gridTheme = themeQuartz.withParams({
  accentColor: '#42e8ff',
  backgroundColor: '#0b101b',
  borderColor: 'rgba(130, 229, 255, 0.18)',
  browserColorScheme: 'dark',
  chromeBackgroundColor: '#101827',
  columnBorder: true,
  foregroundColor: '#d9f4ff',
  headerBackgroundColor: '#121d30',
  headerFontWeight: 700,
  oddRowBackgroundColor: 'rgba(255, 255, 255, 0.025)',
  rowBorder: true,
  spacing: 8,
});

export function OrderImportPreviewModal({
  columns,
  rows,
  headerRowNumber,
  duplicates = [],
  onConfirm,
  onClose,
  t = (text, vars) => String(text ?? "").replace(/\{(\\w+)\}/g, (match, key) => (
    Object.prototype.hasOwnProperty.call(vars || {}, key) ? String(vars[key]) : match
  )),
}) {
  const duplicateIndices = new Set(duplicates.map(d => d.index));
  const duplicateCount = duplicates.length;
  const existingCount = duplicates.filter(d => d.type === 'existing').length;
  const internalCount = duplicates.filter(d => d.type === 'internal').length;
  const fuzzyCount = duplicates.filter(d => d.type === 'fuzzy').length;

  const [showDuplicates, setShowDuplicates] = useState(true);
  const [rowData, setRowData] = useState(() =>
    rows.map(row => ({ ...row, __previewId: makeId('prev') })),
  );
  const [columnData, setColumnData] = useState(() =>
    columns.map(column => ({ ...column, included: column.field !== 'status', __columnId: makeId('col') })),
  );
  const [selectedRowIds, setSelectedRowIds] = useState(new Set());
  const [batchField, setBatchField] = useState("dueDate");
  const [batchValue, setBatchValue] = useState("");

  const activeColumns = useMemo(
    () => columnData.filter(column => column.included),
    [columnData],
  );

  const colDefs = useMemo(() => [
    {
      headerName: '',
      width: 52,
      checkboxSelection: true,
      headerCheckboxSelection: true,
      sortable: false,
      filter: false,
      resizable: false,
      pinned: "left",
    },
    ...activeColumns.map(column => ({
      field: column.field,
      headerName: column.headerName,
      width: column.width || 140,
      editable: true,
    })),
    {
      headerName: '',
      width: 52,
      sortable: false,
      filter: false,
      resizable: false,
      cellRenderer: ({ data }) => (
        <button
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: '4px' }}
          onClick={() => setRowData(current => current.filter(row => row.__previewId !== data.__previewId))}
          title={t("删除此行")}
        >
          <X size={13} />
        </button>
      ),
    },
  ], [activeColumns]);

  const handleSelectionChanged = (event) => {
    const selected = event.api.getSelectedRows();
    setSelectedRowIds(new Set(selected.map(r => r.__previewId)));
  };

  const applyBatchFill = () => {
    if (!batchValue.trim() || selectedRowIds.size === 0) return;
    setRowData(current =>
      current.map(row =>
        selectedRowIds.has(row.__previewId)
          ? { ...row, [batchField]: batchField === "quantity" || batchField === "amount" ? Number(batchValue) || 0 : batchValue }
          : row
      )
    );
  };

  const handleConfirm = () => {
    const activeFields = new Set(activeColumns.map(column => column.field));
    const cleanedRows = rowData.map(({ __previewId, ...row }) => {
      const cleaned = {};
      for (const [field, value] of Object.entries(row)) {
        if (activeFields.has(field)) cleaned[field] = value;
      }
      return cleaned;
    });
    const cleanedColumns = activeColumns.map(({ included, __columnId, ...column }) => ({
      ...column,
      headerName: column.headerName.trim() || column.field,
    }));
    onConfirm(cleanedRows, cleanedColumns);
  };

  const updateColumn = (columnId, patch) => {
    setColumnData(current =>
      current.map(column => column.__columnId === columnId ? { ...column, ...patch } : column),
    );
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-card" style={{ width: '920px', maxWidth: '96vw' }}>
        <div className="modal-head">
          <div>
            <p className="eyebrow">ORDER IMPORT</p>
            <h3>{t("识别到 {count} 条订单，表头位于第 {row} 行", { count: rowData.length, row: headerRowNumber })}</h3>
          </div>
          <button className="icon-button" type="button" onClick={onClose} title={t("取消")}>
            <X size={18} />
          </button>
        </div>

        <div className="import-header-editor">
          {duplicateCount > 0 && (
            <div style={{
              background: 'rgba(255, 107, 107, 0.10)',
              border: '1px solid rgba(255, 107, 107, 0.25)',
              borderRadius: 8,
              padding: '10px 14px',
              marginBottom: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              fontSize: 13,
            }}>
              <span style={{ color: '#ff6b6b' }}>
                <AlertTriangle size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
                发现 {duplicateCount} 条疑似重复订单
                {existingCount > 0 && `（${existingCount} 条已存在）`}
                {internalCount > 0 && `（${internalCount} 条文件内重复）`}
                {fuzzyCount > 0 && `（${fuzzyCount} 条疑似重复）`}
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', color: '#82e5ff', fontSize: 12 }}>
                  <input
                    type="checkbox"
                    checked={showDuplicates}
                    onChange={e => setShowDuplicates(e.target.checked)}
                  />
                  显示重复行
                </label>
                <button
                  className="ghost-button"
                  type="button"
                  style={{ fontSize: 12, padding: '2px 10px', minHeight: 26 }}
                  onClick={() => {
                    const dupIds = new Set(
                      duplicates.map(d => rows.findIndex(r => r === d.row))
                    );
                    setRowData(current => current.filter((_, i) => {
                      const origIdx = rows.findIndex(r => r.orderNo === current[i]?.orderNo && r.product === current[i]?.product);
                      return !duplicateIndices.has(origIdx);
                    }));
                  }}
                >
                  移除重复行
                </button>
              </div>
            </div>
          )}
          {columnData.map(column => (
            <label className={`import-header-item ${column.included ? '' : 'is-disabled'}`} key={column.__columnId}>
              <input
                type="checkbox"
                checked={column.included}
                onChange={(event) => updateColumn(column.__columnId, { included: event.target.checked })}
              />
              <input
                value={column.headerName}
                disabled={!column.included}
                onChange={(event) => updateColumn(column.__columnId, { headerName: event.target.value })}
                aria-label={t("导入表头名称")}
              />
            </label>
          ))}
        </div>

        {selectedRowIds.size > 0 && (
          <div className="bulk-edit-panel" style={{ marginBottom: 8 }}>
            <span style={{ color: "var(--accent)", fontWeight: 600, fontSize: 13 }}>
              <Pencil size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
              {t("已选 {count} 行 · 批量填充：", { count: selectedRowIds.size })}
            </span>
            <select value={batchField} onChange={e => setBatchField(e.target.value)}>
              <option value="dueDate">{t("交期")}</option>
              <option value="status">{t("状态")}</option>
              <option value="followUp">{t("跟进记录")}</option>
              <option value="quantity">{t("数量")}</option>
              <option value="amount">{t("金额")}</option>
            </select>
            {batchField === "status" ? (
              <select value={batchValue} onChange={e => setBatchValue(e.target.value)}>
                <option value="">{t("选择状态")}</option>
                {statusOptions.map(s => (
                  <option key={s} value={s}>{t(s)}</option>
                ))}
              </select>
            ) : batchField === "dueDate" ? (
              <input type="date" value={batchValue} onChange={e => setBatchValue(e.target.value)} />
            ) : (
              <input
                value={batchValue}
                onChange={e => setBatchValue(e.target.value)}
                placeholder={batchField === "followUp" ? t("统一备注内容") : t("值")}
                onKeyDown={e => e.key === "Enter" && applyBatchFill()}
              />
            )}
            <button className="secondary-button" type="button" onClick={applyBatchFill} style={{ minHeight: 32 }}>
              {t("应用")}
            </button>
          </div>
        )}

        <div style={{ height: 360 }}>
          <AgGridReact
            theme={gridTheme}
            rowData={rowData}
            columnDefs={colDefs}
            rowSelection="multiple"
            onSelectionChanged={handleSelectionChanged}
            onCellValueChanged={({ data }) =>
              setRowData(current => current.map(row => row.__previewId === data.__previewId ? data : row))
            }
          />
        </div>

        <div className="modal-actions">
          <button className="ghost-button" type="button" onClick={onClose}>{t("取消")}</button>
          <button
            className="primary-action compact"
            type="button"
            onClick={handleConfirm}
            disabled={rowData.length === 0 || activeColumns.length === 0}
          >
            <Check size={15} />
            {t("确认导入 {count} 条", { count: rowData.length })}
          </button>
        </div>
      </div>
    </div>
  );
}
