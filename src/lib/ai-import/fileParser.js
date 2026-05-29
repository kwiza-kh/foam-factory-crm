import Papa from 'papaparse';
import * as XLSX from 'xlsx';
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
  const text = await file.text();
  const result = Papa.parse(text, { header: true, skipEmptyLines: true });
  return { type: 'rows', rows: result.data };
}

async function parseExcel(file) {
  const ab = await file.arrayBuffer();
  const wb = XLSX.read(ab, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
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
    fullText += content.items.map(item => item.str).join(' ') + '\n';
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
