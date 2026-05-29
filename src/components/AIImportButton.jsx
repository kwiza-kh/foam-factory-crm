import { useRef, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { parseFile } from '../lib/ai-import/fileParser.js';
import { buildImportMessages, parseImportResponse } from '../lib/ai-import/fieldMapper.js';
import { callAI } from '../lib/ai-import/aiClient.js';
import { AIImportPreviewModal } from './AIImportPreviewModal.jsx';

export function AIImportButton({ tableKey, tableLabel, columns, aiSettings, onImport }) {
  const [phase, setPhase] = useState('idle'); // idle | parsing | calling | preview
  const [previewRows, setPreviewRows] = useState([]);
  const [error, setError] = useState(null);
  const inputRef = useRef();

  const hasKey = Boolean(aiSettings?.apiKey);

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    setError(null);

    try {
      setPhase('parsing');
      const parsed = await parseFile(file);

      setPhase('calling');
      const messages = buildImportMessages(tableLabel, columns, parsed);
      const responseText = await callAI(aiSettings, messages);
      const rows = parseImportResponse(responseText);

      setPreviewRows(rows);
      setPhase('preview');
    } catch (err) {
      setError(err.message);
      setPhase('idle');
    }
  };

  const handleConfirm = (rows) => {
    onImport(tableKey, rows);
    setPhase('idle');
    setPreviewRows([]);
  };

  const busy = phase === 'parsing' || phase === 'calling';
  const label = phase === 'parsing' ? '解析中…' : phase === 'calling' ? 'AI 识别中…' : 'AI 导入';

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,.xls,.pdf,.png,.jpg,.jpeg,.webp"
        style={{ display: 'none' }}
        onChange={handleFile}
      />
      <button
        className="secondary-button"
        type="button"
        disabled={busy || !hasKey}
        title={!hasKey ? '请先在顶栏 AI 设置中填写 API Key' : 'AI 识别文件自动录入'}
        onClick={() => !busy && inputRef.current.click()}
      >
        {busy
          ? <Loader2 size={15} style={{ animation: 'spin 0.9s linear infinite' }} />
          : <Sparkles size={15} />
        }
        {label}
      </button>
      {error && (
        <span style={{ color: 'var(--red)', fontSize: '12px', maxWidth: 220 }} title={error}>
          识别失败
        </span>
      )}
      {phase === 'preview' && (
        <AIImportPreviewModal
          tableLabel={tableLabel}
          columns={columns}
          rows={previewRows}
          onConfirm={handleConfirm}
          onClose={() => setPhase('idle')}
        />
      )}
    </>
  );
}
