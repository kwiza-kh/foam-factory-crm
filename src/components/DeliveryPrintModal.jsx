import { useEffect, useMemo, useRef, useState } from 'react';
import { Printer, X, Eye, EyeOff } from 'lucide-react';
import { deliveryQuantityField, deliveryOrderFieldPrefix, productionScheduleDateField, productionScheduleQuantityField, productionLineField, productionNoteField, orderDeliveredQuantityField, orderRemainingQuantityField, linkedOrderQuantitySourceField } from '../lib/columnDefs.js';
import { tableConfigs } from '../config/tableConfigs.js';

function deliveryOrderField(field) {
  return `${deliveryOrderFieldPrefix}${field}`;
}

// Fields to exclude from delivery note (order status / internal / production schedule / delivery tracking)
const EXCLUDE_FIELDS = new Set([
  'status', 'completionTime', 'completionOperator', 'completionPhoto',
  'deliveredQuantity', 'remainingQuantity', 'dueDate',
  '_linkedOrderId', '_linkedOrderQuantitySourceField', '_finalDelivery',
  productionScheduleDateField, productionScheduleQuantityField,
  productionLineField, productionNoteField,
  orderDeliveredQuantityField, orderRemainingQuantityField,
]);

const A4_PREVIEW_WIDTH_PX = 794;
const A4_PREVIEW_HEIGHT_PX = 1123;
const PREVIEW_CHROME_HEIGHT_PX = 230;

const PRINT_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  @page { size: A4; margin: 0; }
  body { font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans Khmer", sans-serif; font-size: 9pt; color: #000; padding: 0; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .dn-page { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 14mm 12mm; background: #fff; }
  .dn-co-name { text-align: center; font-size: 18pt; font-weight: 700; margin-bottom: 2px; }
  .dn-co-name-en { text-align: center; font-size: 12pt; font-weight: 700; margin-bottom: 2px; text-transform: uppercase; }
  .dn-co-addr { text-align: left; font-size: 7.5pt; color: #000; margin-bottom: 1px; line-height: 1.5; }
  .dn-co-addr-en { text-align: left; font-size: 7pt; color: #000; margin-bottom: 10px; line-height: 1.4; }
  .dn-title { text-align: center; font-size: 16pt; font-weight: 700; margin: 10px 0 10px; letter-spacing: 6px; }
  .dn-info-row { display: flex; justify-content: space-between; font-size: 10pt; margin-bottom: 2px; font-weight: 500; }
  .dn-table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 7pt; }
  .dn-table th, .dn-table td { border: 0.5pt solid #000; padding: 2pt 4pt; vertical-align: middle; text-align: center; word-break: break-all; }
  .dn-table th { background: #f5f5f5; font-weight: 700; font-size: 7pt; text-align: center; border-bottom: 1pt solid #000; }
  .dn-table td { font-weight: 400; font-size: 7pt; text-align: center; }
  .dn-table .tl { text-align: center; }
  .dn-table .tc { text-align: center; }
  .dn-table .tr { text-align: center; font-variant-numeric: tabular-nums; }
  .dn-total-row td { font-weight: 700; font-size: 8pt; }
  .dn-total-label { background: #f5f5f5; }
  .dn-sign-area { display: flex; margin-top: 32px; font-size: 11pt; }
  .dn-sign-left { flex: 0 0 40%; }
  .dn-sign-right { flex: 1; text-align: right; }
  .dn-sign-label { font-weight: 700; }
  @media print {
    body { padding: 0; }
    .dn-page { box-shadow: none; }
    .no-print { display: none !important; }
  }
`;

function getPrintHtml(innerHtml, title) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>${PRINT_CSS}</style>
</head>
<body><div class="dn-page">${innerHtml}</div></body>
</html>`;
}

function fmtNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : '';
}

function columnAlign(column) {
  if (column.type === 'number') return 'tr';
  if (column.type === 'date' || column.type === 'datetime') return 'tc';
  return 'tl';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Build delivery note columns derived from the SAME order column definitions
 * that the orders grid uses: defaultColumns + customer custom columns.
 */
function getQuantitySourceFields(deliveries = []) {
  return new Set(deliveries.map(line => line?.[linkedOrderQuantitySourceField]).filter(Boolean));
}

function shouldIncludeOrderColumn(column, quantitySourceFields) {
  return !EXCLUDE_FIELDS.has(column.field) && !quantitySourceFields.has(column.field);
}

function buildDeliveryColumns(customer, deliveries = []) {
  const config = tableConfigs.orders;
  const defaultFields = new Set(config.defaultColumns.map(c => c.field));
  const quantitySourceFields = getQuantitySourceFields(deliveries);
  const columns = [];

  // Default order columns (system-managed: status, completionTime, etc.)
  for (const col of config.defaultColumns) {
    if (!shouldIncludeOrderColumn(col, quantitySourceFields)) continue;
    columns.push({ ...col });
  }

  // Customer custom columns (these carry the actual data: orderNo, product, spec, etc.)
  const customCols = customer?.customColumns?.orders || [];
  for (const col of customCols) {
    if (defaultFields.has(col.field)) continue;
    if (!shouldIncludeOrderColumn(col, quantitySourceFields)) continue;
    columns.push({ ...col });
  }

  // Always append delivery quantity at the end
  const hasQty = columns.some(c => c.field === deliveryQuantityField);
  if (!hasQty) {
    columns.push({
      field: deliveryQuantityField,
      headerName: '送货数量',
      type: 'number',
    });
  }

  return columns;
}

function cellValue(line, column) {
  const field = column.field;
  if (field === deliveryQuantityField) return line[deliveryQuantityField] ?? '';
  return line[deliveryOrderField(field)] ?? '';
}

function buildDeliveryHtml(delivery, customer, allDeliveries, settings) {
  const companyName = settings.companyName || '';
  const companyNameEn = settings.companyNameEn || '';
  const companyAddr = settings.companyAddress || '';
  const companyPhone = settings.companyPhone || '';
  const companyAddrEn = settings.companyAddressEn || '';

  const lines = allDeliveries.length > 0 ? allDeliveries : [delivery];
  const columns = buildDeliveryColumns(customer, lines);

  // Compute total quantity
  const qtyCol = columns.find(c => c.field === deliveryQuantityField);
  const totalQty = qtyCol
    ? lines.reduce((sum, line) => sum + (fmtNum(line[deliveryQuantityField]) || 0), 0)
    : 0;

  // Check for amount column
  const amountCol = columns.find(c => c.field === 'amount');
  let totalAmount = 0;
  if (amountCol) {
    for (const line of lines) {
      totalAmount += fmtNum(line[deliveryOrderField('amount')]) || 0;
    }
  }

  let html = '';

  if (companyName) html += `<div class="dn-co-name">${escapeHtml(companyName)}</div>`;
  if (companyNameEn) html += `<div class="dn-co-name-en">${escapeHtml(companyNameEn)}</div>`;
  if (companyAddr) {
    html += `<div class="dn-co-addr">地址：${escapeHtml(companyAddr)}${companyPhone ? '    Tel:' + escapeHtml(companyPhone) : ''}</div>`;
  }
  if (companyAddrEn) html += `<div class="dn-co-addr-en">${escapeHtml(companyAddrEn)}</div>`;

  html += `
    <div class="dn-title">送 货 单</div>
    <div class="dn-info-row">
      <span>客户：${escapeHtml(customer.name)}</span>
      <span>日期：${escapeHtml(delivery.date)}</span>
    </div>
    <div class="dn-info-row">
      <span>地址：${escapeHtml(customer.address)}</span>
      <span>送货单号：${escapeHtml(delivery.deliveryNo)}</span>
    </div>
    <table class="dn-table">
      <thead><tr>`;

  for (const col of columns) {
    html += `<th>${escapeHtml(col.headerName)}</th>`;
  }
  html += `</tr></thead><tbody>`;

  for (const line of lines) {
    html += '<tr>';
    for (const col of columns) {
      const val = cellValue(line, col);
      html += `<td class="${columnAlign(col)}">${escapeHtml(val)}</td>`;
    }
    html += '</tr>';
  }

  // Total row
  if (columns.length > 0) {
    let totalLabel, totalValue, totalColIdx;

    if (amountCol) {
      totalLabel = '总金额';
      totalValue = totalAmount.toFixed(2);
      totalColIdx = columns.findIndex(c => c.field === 'amount');
    } else if (qtyCol) {
      totalLabel = '合计';
      totalValue = totalQty;
      totalColIdx = columns.findIndex(c => c.field === deliveryQuantityField);
    }

    if (totalColIdx != null && totalColIdx >= 0) {
      const after = columns.length - totalColIdx - 1;
      html += `
      </tbody>
      <tfoot>
        <tr class="dn-total-row">
          <td colspan="${totalColIdx}" class="dn-total-label tr">${totalLabel}</td>
          <td class="tr">${escapeHtml(totalValue)}</td>
          ${after > 0 ? `<td colspan="${after}"></td>` : ''}
        </tr>
      </tfoot>`;
    }
  }

  html += `
    </table>

    <div class="dn-sign-area">
      <div class="dn-sign-left">
        <div class="dn-sign-label">送货方</div>
      </div>
      <div class="dn-sign-right">
        <div class="dn-sign-label">收货方</div>
      </div>
    </div>`;

  return html;
}

export function DeliveryPrintModal({ delivery, customer, settings = {}, onClose, t = (text, vars) => String(text ?? "").replace(/\{(\\w+)\}/g, (match, key) => (
  Object.prototype.hasOwnProperty.call(vars || {}, key) ? String(vars[key]) : match
)) }) {
  const [showPreview, setShowPreview] = useState(true);
  const [previewScale, setPreviewScale] = useState(0.55);
  const previewFrameRef = useRef(null);

  const allDeliveries = useMemo(() => {
    const list = customer?.deliveries || [];
    return list.filter(d => d.deliveryNo === delivery.deliveryNo);
  }, [customer?.deliveries, delivery.deliveryNo]);

  useEffect(() => {
    if (!showPreview) return undefined;

    const updatePreviewScale = () => {
      const frameWidth = previewFrameRef.current?.getBoundingClientRect().width || window.innerWidth * 0.9;
      const availableWidth = Math.max(280, frameWidth - 20);
      const availableHeight = Math.max(360, window.innerHeight - PREVIEW_CHROME_HEIGHT_PX);
      const nextScale = Math.min(
        1,
        availableWidth / A4_PREVIEW_WIDTH_PX,
        availableHeight / A4_PREVIEW_HEIGHT_PX,
      );
      setPreviewScale(Number(nextScale.toFixed(3)));
    };

    updatePreviewScale();
    window.addEventListener('resize', updatePreviewScale);
    return () => window.removeEventListener('resize', updatePreviewScale);
  }, [showPreview]);

  const deliveryHtml = useMemo(
    () => buildDeliveryHtml(delivery, customer, allDeliveries, settings),
    [delivery, customer, allDeliveries, settings],
  );

  const handlePrint = () => {
    const win = window.open('', '_blank', 'width=880,height=750');
    win.document.write(getPrintHtml(deliveryHtml, t("送货单 {deliveryNo}", { deliveryNo: delivery.deliveryNo })));
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-card" style={{ width: 'min(1120px, 98vw)', maxWidth: '98vw' }}>
        <div className="modal-head">
          <div>
            <p className="eyebrow">{t("送货单预览")}</p>
            <h3>{delivery.deliveryNo}</h3>
            {allDeliveries.length > 1 && (
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                {allDeliveries.length} 条明细
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              className="ghost-button compact"
              type="button"
              onClick={() => setShowPreview(p => !p)}
            >
              {showPreview ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            <button className="icon-button" type="button" onClick={onClose} title={t("关闭")}>
              <X size={18} />
            </button>
          </div>
        </div>

        <style>{PRINT_CSS}</style>

        {showPreview && (
          <div ref={previewFrameRef} style={{
            background: '#c0c0c0',
            borderRadius: 12,
            padding: '18px 10px',
            marginBottom: 16,
            overflow: 'hidden',
          }}>
            <div
              style={{
                width: A4_PREVIEW_WIDTH_PX * previewScale,
                height: A4_PREVIEW_HEIGHT_PX * previewScale,
                margin: '0 auto',
                position: 'relative',
              }}
            >
              <div
                className="dn-page"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: A4_PREVIEW_WIDTH_PX,
                  minHeight: A4_PREVIEW_HEIGHT_PX,
                  margin: 0,
                  color: '#000',
                  boxShadow: '0 2px 16px rgba(0,0,0,0.18)',
                  transform: `scale(${previewScale})`,
                  transformOrigin: 'top left',
                }}
                dangerouslySetInnerHTML={{ __html: deliveryHtml }}
              />
            </div>
          </div>
        )}

        <div className="modal-actions">
          <button className="ghost-button" type="button" onClick={onClose}>{t("关闭")}</button>
          <button className="primary-action compact" type="button" onClick={handlePrint}>
            <Printer size={15} />
            {t("打印 / 导出 PDF")}
          </button>
        </div>
      </div>
    </div>
  );
}
