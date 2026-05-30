import ExcelJS from 'exceljs';

export async function exportTableToExcel(customer, tableKey, columns) {
  const rows = customer[tableKey] || [];
  const cols = columns.filter(c => c.field !== '__actions' && c.field !== 'id');
  const headers = cols.map(c => c.headerName);
  const data = rows.map(row => cols.map(col => row[col.field] ?? ''));

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
