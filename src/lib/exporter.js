import * as XLSX from 'xlsx';

export function exportTableToExcel(customer, tableKey, columns) {
  const rows = customer[tableKey] || [];
  const cols = columns.filter(c => c.field !== '__actions' && c.field !== 'id');

  const headers = cols.map(c => c.headerName);
  const data = rows.map(row => cols.map(col => row[col.field] ?? ''));

  const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);

  // Auto-width columns
  const colWidths = headers.map((h, i) => {
    const maxLen = Math.max(
      h.length,
      ...data.map(r => String(r[i] ?? '').length),
    );
    return { wch: Math.min(maxLen + 2, 40) };
  });
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, tableKey);

  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `${customer.name}_${tableKey}_${date}.xlsx`);
}
