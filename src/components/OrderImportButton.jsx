import { useRef, useState } from 'react';
import { FileUp } from 'lucide-react';
import { parseOrderFile } from '../lib/orderImport.js';
import { OrderImportPreviewModal } from './OrderImportPreviewModal.jsx';

export function OrderImportButton({ onImport, disabled }) {
  const inputRef = useRef(null);
  const [parsed, setParsed] = useState(null);
  const [busy, setBusy] = useState(false);

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setBusy(true);
    try {
      const result = await parseOrderFile(file);
      if (!result.rows.length) {
        alert('没有识别到可导入的订单数据。');
        return;
      }
      setParsed(result);
    } catch (err) {
      alert(`导入失败：${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx"
        style={{ display: 'none' }}
        onChange={handleFile}
      />
      <button
        className="secondary-button"
        type="button"
        disabled={disabled || busy}
        title="从 CSV 或 XLSX 自动识别表头并导入订单"
        onClick={() => inputRef.current?.click()}
      >
        <FileUp size={15} />
        {busy ? '解析中' : '导入订单'}
      </button>

      {parsed && (
        <OrderImportPreviewModal
          columns={parsed.columns}
          rows={parsed.rows}
          headerRowNumber={parsed.headerRowNumber}
          onClose={() => setParsed(null)}
          onConfirm={(rows, columns) => {
            onImport(rows, columns);
            setParsed(null);
          }}
        />
      )}
    </>
  );
}
