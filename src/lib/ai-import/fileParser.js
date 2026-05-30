import Papa from 'papaparse';
import ExcelJS from 'exceljs';
import * as pdfjs from 'pdfjs-dist';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).href;

const IMAGE_TYPES = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp']);
const MAX_PDF_PAGES = 5;
const PDF_TEXT_MIN_LENGTH = 50;

/**
 * Returns one of:
 *   { type: 'rows',  rows: Array<Object> }
 *   { type: 'text',  text: string }
 *   { type: 'image', base64: string, mimeType: string }
 */
export async function parseFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'csv')                   return parseCSV(file);
  if (ext === 'xlsx' || ext === 'xls') return parseExcel(file);
  if (ext === 'pdf')                   return parsePDF(file);
  if (IMAGE_TYPES.has(ext))            return parseImage(file);
  throw new Error(`不支持的文件格式：.${ext}（支持 CSV、Excel、PDF、PNG/JPG）`);
}

async function parseCSV(file) {
  let text = await file.text();
  // Strip UTF-8 BOM if present — otherwise the first header name gets corrupted
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const result = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    delimitersToGuess: [',', '\t', ';', '|'],
  });
  return { type: 'rows', rows: result.data };
}

function cellText(v) {
  if (v == null) return '';
  // Date objects — format as YYYY-MM-DD so AI sees a readable date, not "Tue Jan 01 2025..."
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  if (typeof v === 'object' && Array.isArray(v.richText))
    return v.richText.map(r => r.text ?? '').join('');
  if (typeof v === 'object' && v.text != null) return String(v.text);
  if (typeof v === 'object' && v.result != null) {
    // Some formula results may be Date objects
    if (v.result instanceof Date && !isNaN(v.result)) return v.result.toISOString().slice(0, 10);
    return String(v.result);
  }
  if (typeof v === 'object' && v.formula) return '';
  // Numbers — avoid trailing ".0" for integers displayed in Excel
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
  return String(v);
}

async function parseExcel(file) {
  const ab = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(ab);
  const ws = wb.worksheets[0];

  // Collect rows with per-cell metadata for header detection
  const rawRows = [];
  const rowMeta = []; // parallel array: { boldCount, hasNumeric }
  ws.eachRow({ includeEmpty: false }, (row) => {
    const cells = [];
    let boldCount = 0;
    let hasNumeric = false;
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const val = cellText(cell.value);
      // Fill sparse array so column positions are preserved
      cells[colNumber - 1] = val;
      if (cell.font?.bold) boldCount++;
      if (typeof cell.value === 'number' && !(cell.value instanceof Date)) hasNumeric = true;
    });
    rawRows.push(cells);
    rowMeta.push({ boldCount, hasNumeric });
  });

  // Find header row: score each candidate row in the first 20 rows.
  // Score components:
  //   +3 per header-hint keyword match
  //   +2 if ≥30% of cells are bold (common Excel header convention)
  //   +1 per short-string cell (≤20 chars, typical header width)
  //   +3 if row has no purely numeric cells (data rows often have numbers)
  //   +2 bonus for high uniqueness ratio (>80%)
  const HEADER_HINTS = /单号|品名|品号|数量|规格|金额|单价|备注|产品|名称|编号|日期|单位|材质|客户|电话|地址|联系人|item|qty|price|desc|name|date|code|no\.?$/i;
  const scanLimit = Math.min(rawRows.length, 20);
  let bestIdx = 0;
  let bestScore = -1;

  for (let i = 0; i < scanLimit; i++) {
    const vals = rawRows[i].filter(v => v != null && v !== '');
    if (vals.length < 2) continue; // skip almost-empty rows

    let score = 0;

    // Keyword hints
    const hintMatches = vals.filter(v => HEADER_HINTS.test(v)).length;
    score += hintMatches * 3;

    // Bold cells — strong header signal
    if (rowMeta[i] && rowMeta[i].boldCount >= Math.max(1, vals.length * 0.3))
      score += 2;

    // Short-cell count (headers are usually concise)
    const shortCount = vals.filter(v => v.length <= 20).length;
    score += shortCount;

    // Non-numeric bonus — header rows rarely contain pure numbers
    if (rowMeta[i] && !rowMeta[i].hasNumeric)
      score += 3;

    // Uniqueness bonus
    const uniqueRatio = new Set(vals).size / vals.length;
    if (uniqueRatio > 0.8) score += 2;

    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  const headerIdx = bestIdx;

  const headers = rawRows[headerIdx];
  const rows = [];
  for (let i = headerIdx + 1; i < rawRows.length; i++) {
    const r = rawRows[i];
    if (r.every(v => !v)) continue; // skip blank rows
    const obj = {};
    headers.forEach((h, j) => { obj[h || `col${j + 1}`] = r[j] ?? ''; });
    rows.push(obj);
  }

  return { type: 'rows', rows };
}

async function parsePDF(file) {
  const ab = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: ab }).promise;
  const pageCount = Math.min(pdf.numPages, MAX_PDF_PAGES);

  let fullText = '';
  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // Sort items by position: top-to-bottom (y desc), left-to-right (x asc).
    // Without this, PDF text extraction often scrambles reading order.
    const sorted = [...content.items].sort((a, b) => {
      const yDiff = (b.transform?.[5] ?? 0) - (a.transform?.[5] ?? 0);
      if (Math.abs(yDiff) > 2) return yDiff; // different lines — sort by Y
      return (a.transform?.[4] ?? 0) - (b.transform?.[4] ?? 0); // same line — sort by X
    });
    fullText += sorted.map(item => item.str).join(' ') + '\n';
  }

  if (fullText.trim().length >= PDF_TEXT_MIN_LENGTH) {
    return { type: 'text', text: fullText.trim() };
  }

  const page = await pdf.getPage(1);
  const base64 = await renderPageToBase64(page);
  return { type: 'image', base64, mimeType: 'image/jpeg' };
}

async function renderPageToBase64(page) {
  const viewport = page.getViewport({ scale: 1.5 });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  return canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
}

async function parseImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const base64 = e.target.result.split(',')[1];
      resolve({ type: 'image', base64, mimeType: file.type || 'image/jpeg' });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
