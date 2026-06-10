export async function exportTableToExcel(customer, tableKey, columns) {
  const { default: ExcelJS } = await import('exceljs');
  const rows = customer[tableKey] || [];
  const cols = columns.filter(c => c.field !== '__actions' && c.field !== 'id');
  const headers = cols.map(c => c.headerName);
  const data = rows.map(row => cols.map(col => formatExportCell(row[col.field], col)));

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(tableKey);

  ws.columns = headers.map((h, i) => {
    const maxLen = Math.max(h.length, ...data.map(r => String(r[i] ?? '').length));
    return { header: h, width: Math.min(maxLen + 2, 40) };
  });

  data.forEach(row => ws.addRow(row));

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `${customer.name}_${tableKey}_${date}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

function formatExportCell(value, column = {}) {
  if (value == null || value === '') return '';

  if (column.type === 'datetime') {
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

  if (column.type === 'image') {
    return getExportImageSource(value) ? '有照片' : '';
  }

  if (typeof value === 'object') {
    return getExportImageSource(value) ? '有照片' : JSON.stringify(value);
  }

  return value;
}

function getExportImageSource(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value !== 'object') return '';
  return value.dataUrl || value.url || value.src || '';
}
