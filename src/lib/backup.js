export function exportBackup(customers) {
  const payload = JSON.stringify(customers, null, 2);
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `foam-crm-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importBackup(file) {
  const text = await file.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('文件解析失败，请确认是有效的备份文件');
  }
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('备份文件格式不正确（应为客户数组）');
  }
  return data;
}
