import { useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, themeQuartz } from 'ag-grid-community';
import { Check, X } from 'lucide-react';
import { makeId } from '../lib/utils.js';

ModuleRegistry.registerModules([AllCommunityModule]);

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

export function AIImportPreviewModal({ tableLabel, columns, rows, onConfirm, onClose }) {
  const [rowData, setRowData] = useState(() =>
    rows.map(r => ({ ...r, __previewId: makeId('prev') }))
  );

  const colDefs = useMemo(() => [
    ...columns
      .filter(c => c.field !== '__actions')
      .map(col => ({ field: col.field, headerName: col.headerName, width: col.width || 140, editable: true })),
    {
      headerName: '',
      width: 52,
      sortable: false,
      filter: false,
      resizable: false,
      cellRenderer: ({ data }) => (
        <button
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: '4px' }}
          onClick={() => setRowData(prev => prev.filter(r => r.__previewId !== data.__previewId))}
          title="删除此行"
        >
          <X size={13} />
        </button>
      ),
    },
  ], [columns]);

  const handleConfirm = () => {
    onConfirm(rowData.map(({ __previewId, ...rest }) => rest));
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-card" style={{ width: '820px', maxWidth: '96vw' }}>
        <div className="modal-head">
          <div>
            <p className="eyebrow">AI 识别结果</p>
            <h3>共识别 {rowData.length} 条{tableLabel}记录，可直接编辑后导入</h3>
          </div>
          <button className="icon-button" type="button" onClick={onClose} title="取消">
            <X size={18} />
          </button>
        </div>

        <div style={{ height: 340 }}>
          <AgGridReact
            theme={gridTheme}
            rowData={rowData}
            columnDefs={colDefs}
            onCellValueChanged={({ data }) =>
              setRowData(prev => prev.map(r => r.__previewId === data.__previewId ? data : r))
            }
          />
        </div>

        <div className="modal-actions">
          <button className="ghost-button" type="button" onClick={onClose}>取消</button>
          <button
            className="primary-action compact"
            type="button"
            onClick={handleConfirm}
            disabled={rowData.length === 0}
          >
            <Check size={15} />
            确认导入 {rowData.length} 条
          </button>
        </div>
      </div>
    </div>
  );
}
