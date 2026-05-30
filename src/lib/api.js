const BASE = '/api';

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  getCustomers: () =>
    req('GET', '/customers'),

  createCustomer: (customer) =>
    req('POST', '/customers', customer),

  updateCustomer: (id, customer) =>
    req('PUT', `/customers/${id}`, customer),

  deleteCustomer: (id) =>
    req('DELETE', `/customers/${id}`),

  setRows: (customerId, tableKey, rows) =>
    req('PUT', `/customers/${customerId}/${tableKey}`, { rows }),

  deleteRows: (customerId, tableKey, ids) =>
    req('DELETE', `/customers/${customerId}/${tableKey}/rows`, { ids }),

  replaceAll: (customers) =>
    req('POST', '/customers/replace-all', { customers }),
};
