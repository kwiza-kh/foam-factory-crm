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
import { Check, X, Pencil } from 'lucide-react';
import { makeId, today } from '../lib/utils.js';

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
  onConfirm,
  onClose,
}) {
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
          title="删除此行"
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
            <h3>识别到 {rowData.length} 条订单，表头位于第 {headerRowNumber} 行</h3>
          </div>
          <button className="icon-button" type="button" onClick={onClose} title="取消">
            <X size={18} />
          </button>
        </div>

        <div className="import-header-editor">
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
                aria-label="导入表头名称"
              />
            </label>
          ))}
        </div>

        {selectedRowIds.size > 0 && (
          <div className="bulk-edit-panel" style={{ marginBottom: 8 }}>
            <span style={{ color: "var(--accent)", fontWeight: 600, fontSize: 13 }}>
              <Pencil size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
              已选 {selectedRowIds.size} 行 · 批量填充：
            </span>
            <select value={batchField} onChange={e => setBatchField(e.target.value)}>
              <option value="dueDate">交期</option>
              <option value="status">状态</option>
              <option value="followUp">跟进记录</option>
              <option value="quantity">数量</option>
              <option value="amount">金额</option>
            </select>
            {batchField === "status" ? (
              <select value={batchValue} onChange={e => setBatchValue(e.target.value)}>
                <option value="">选择状态</option>
                {["未完成","已排产","已完成","已送货","已开对账单","已付款"].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            ) : batchField === "dueDate" ? (
              <input type="date" value={batchValue} onChange={e => setBatchValue(e.target.value)} />
            ) : (
              <input
                value={batchValue}
                onChange={e => setBatchValue(e.target.value)}
                placeholder={batchField === "followUp" ? "统一备注内容" : "值"}
                onKeyDown={e => e.key === "Enter" && applyBatchFill()}
              />
            )}
            <button className="secondary-button" type="button" onClick={applyBatchFill} style={{ minHeight: 32 }}>
              应用
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
          <button className="ghost-button" type="button" onClick={onClose}>取消</button>
          <button
            className="primary-action compact"
            type="button"
            onClick={handleConfirm}
            disabled={rowData.length === 0 || activeColumns.length === 0}
          >
            <Check size={15} />
            确认导入 {rowData.length} 条
          </button>
        </div>
      </div>
    </div>
  );
}
