const HEADER_ALIASES = {
  orderNo: ['订单号', '订单编号', '订单 no', '客户订单号', '单号', 'po', 'po号', 'po no', 'pono', 'order no', 'orderno'],
  date: ['下单日期', '订单日期', '接单日期', '日期', 'date', 'order date'],
  product: ['产品', '产品名称', '品名', '货品', '物料', '物料名称', '名称', 'product', 'item', 'description'],
  quantity: ['数量', '订单数量', '订购数量', '采购数量', 'qty', 'quantity', '数量合计'],
  amount: ['金额', '订单金额', '总金额', '合计金额', '价税合计', '合计', 'total', 'amount'],
  dueDate: ['交期', '交货日期', '交付日期', '要求交期', '计划交期', '到货日期', 'due date', 'delivery date'],
  status: ['状态', '订单状态', '跟进状态', '进度', 'status'],
  followUp: ['跟进记录', '跟进', '备注', '说明', 'note', 'notes', 'remark', 'remarks'],
};

const FIELD_TYPES = {
  quantity: 'number',
  amount: 'number',
  date: 'date',
  dueDate: 'date',
};

const HEADER_HINTS = new RegExp(
  Object.values(HEADER_ALIASES).flat().map(escapeRegExp).join('|'),
  'i',
);

export async function parseOrderFile(file) {
  const ext = file.name.split('.').pop()?.toLowerCase();
  const rawRows = ext === 'csv'
    ? await parseCSV(file)
    : ext === 'xlsx'
      ? await parseExcel(file)
      : null;

  if (!rawRows) {
    throw new Error(`不支持的文件格式：.${ext}（支持 CSV、XLSX）`);
  }

  const { headerIndex, headers } = detectHeader(rawRows);
  const mappings = buildMappings(headers);
  const rows = [];

  for (let i = headerIndex + 1; i < rawRows.length; i++) {
    const sourceRow = rawRows[i] || [];
    if (!sourceRow.some(value => String(value ?? '').trim())) continue;

    const row = {};
    for (const mapping of mappings) {
      const field = mapping.field || mapping.customField;
      const value = normalizeValue(sourceRow[mapping.index], mapping.type);
      row[field] = value;
    }

    if (!Object.values(row).some(value => String(value ?? '').trim())) continue;
    rows.push(row);
  }

  const columns = mappings
    .map(mapping => {
      const field = mapping.field || mapping.customField;
      return {
        field,
        headerName: mapping.headerName,
        type: mapping.customField && mapping.type === 'text'
          ? inferColumnType(rows.map(row => row[field]))
          : mapping.type,
        width: 140,
      };
    });

  return {
    rows,
    columns,
    headerRowNumber: headerIndex + 1,
  };
}

async function parseCSV(file) {
  const { default: Papa } = await import('papaparse');
  let text = await file.text();
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  const result = Papa.parse(text, {
    header: false,
    skipEmptyLines: false,
    delimitersToGuess: [',', '\t', ';', '|'],
  });

  if (result.errors?.length) {
    throw new Error(result.errors[0].message);
  }

  return result.data.map(row => row.map(cellText));
}

async function parseExcel(file) {
  const { default: ExcelJS } = await import('exceljs');
  const ab = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(ab);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const rows = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values = [];
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      values[colNumber - 1] = cellText(cell.value);
    });
    rows.push(values);
  });
  return rows;
}

function detectHeader(rows) {
  if (!rows.length) throw new Error('文件中没有可导入的数据');

  const scanLimit = Math.min(rows.length, 30);
  let bestIndex = 0;
  let bestScore = -1;

  for (let i = 0; i < scanLimit; i++) {
    const cells = (rows[i] || []).map(cell => String(cell ?? '').trim()).filter(Boolean);
    if (cells.length < 2) continue;

    const knownMatches = cells.filter(cell => matchField(cell)).length;
    const hintMatches = cells.filter(cell => HEADER_HINTS.test(cell)).length;
    const shortTextCount = cells.filter(cell => cell.length <= 24 && !isNumericText(cell)).length;
    const uniqueRatio = new Set(cells.map(normalizeHeader)).size / cells.length;
    const numericCount = cells.filter(isNumericText).length;

    const score =
      knownMatches * 6 +
      hintMatches * 3 +
      shortTextCount +
      (uniqueRatio > 0.8 ? 3 : 0) +
      (numericCount === 0 ? 2 : 0);

    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  const headers = (rows[bestIndex] || []).map((header, index) =>
    String(header ?? '').trim() || `未命名列${index + 1}`,
  );

  return { headerIndex: bestIndex, headers };
}

function buildMappings(headers) {
  const usedFields = new Set();
  const usedCustomFields = new Set();

  return headers.map((headerName, index) => {
    const field = matchField(headerName);
    if (field && !usedFields.has(field)) {
      usedFields.add(field);
      return { index, field, headerName, type: FIELD_TYPES[field] || 'text' };
    }

    const customField = uniqueCustomField(headerName, usedCustomFields);
    return { index, customField, headerName, type: 'text' };
  });
}

function matchField(headerName) {
  const normalized = normalizeHeader(headerName);
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.some(alias => normalized === normalizeHeader(alias))) return field;
  }
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.some(alias => {
      const normalizedAlias = normalizeHeader(alias);
      return normalizedAlias.length >= 3 && normalized.includes(normalizedAlias);
    })) return field;
  }
  return null;
}

function uniqueCustomField(headerName, usedFields) {
  const base = `import_${normalizeHeader(headerName).replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, '_') || 'column'}`;
  let field = base;
  let counter = 2;
  while (usedFields.has(field)) {
    field = `${base}_${counter}`;
    counter++;
  }
  usedFields.add(field);
  return field;
}

function normalizeValue(value, type) {
  const text = cellText(value).trim();
  if (type === 'number') return text === '' ? 0 : Number(String(text).replace(/,/g, '')) || 0;
  if (type === 'date') return normalizeDate(text);
  return text;
}

function normalizeDate(value) {
  if (!value) return '';
  const cleaned = String(value).trim().replace(/[./]/g, '-');
  const match = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    const [, year, month, day] = match;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  const parsed = new Date(cleaned);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString().slice(0, 10);
}

function inferColumnType(values) {
  const filled = values.map(value => String(value ?? '').trim()).filter(Boolean);
  if (!filled.length) return 'text';
  if (filled.every(value => !Number.isNaN(Number(value.replace(/,/g, ''))))) return 'number';
  if (filled.every(value => normalizeDate(value) !== value || /^\d{4}-\d{1,2}-\d{1,2}$/.test(value))) return 'date';
  return 'text';
}

function cellText(value) {
  if (value == null) return '';
  if (value instanceof Date && !Number.isNaN(value)) return value.toISOString().slice(0, 10);
  if (typeof value === 'object' && Array.isArray(value.richText)) {
    return value.richText.map(part => part.text ?? '').join('');
  }
  if (typeof value === 'object' && value.text != null) return String(value.text);
  if (typeof value === 'object' && value.result != null) return cellText(value.result);
  if (typeof value === 'object' && value.formula) return '';
  return String(value);
}

function isNumericText(value) {
  const text = String(value ?? '').trim().replace(/,/g, '');
  return text !== '' && !Number.isNaN(Number(text));
}

function normalizeHeader(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[：:（）()[\]【】._\-#/\\]/g, '');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
