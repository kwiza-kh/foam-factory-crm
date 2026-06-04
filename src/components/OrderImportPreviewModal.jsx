import { useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import {
  ClientSideRowModelModule,
  ModuleRegistry,
  TextEditorModule,
  themeQuartz,
} from 'ag-grid-community';
import { Check, X } from 'lucide-react';
import { makeId } from '../lib/utils.js';

ModuleRegistry.registerModules([ClientSideRowModelModule, TextEditorModule]);

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
    columns.map(column => ({ ...column, included: true, __columnId: makeId('col') })),
  );

  const activeColumns = useMemo(
    () => columnData.filter(column => column.included),
    [columnData],
  );

  const colDefs = useMemo(() => [
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

        <div style={{ height: 360 }}>
          <AgGridReact
            theme={gridTheme}
            rowData={rowData}
            columnDefs={colDefs}
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
