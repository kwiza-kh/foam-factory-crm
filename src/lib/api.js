// @ts-check

/** @type {string} */
const BASE = '/api';

/**
 * @param {string} method
 * @param {string} path
 * @param {unknown} [body]
 * @returns {Promise<any>}
 */
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
  /**
   * @param {{ page?: number; limit?: number; search?: string }} [params]
   * @returns {Promise<{ data: import('./types').Customer[]; pagination: { page: number; limit: number; total: number; totalPages: number; hasMore: boolean } }>}
   */
  getCustomers: (params = {}) => {
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));
    if (params.search) query.set('search', params.search);
    const qs = query.toString();
    return req('GET', `/customers${qs ? `?${qs}` : ''}`);
  },

  /** @param {import('./types').CustomerInput} customer */
  createCustomer: (customer) =>
    req('POST', '/customers', customer),

  /** @param {string} id @param {import('./types').CustomerInput} customer */
  updateCustomer: (id, customer) =>
    req('PUT', `/customers/${id}`, customer),

  /** @param {string} id */
  deleteCustomer: (id) =>
    req('DELETE', `/customers/${id}`),

  /** @param {string} customerId @param {string} tableKey @param {Record<string,any>[]} rows */
  setRows: (customerId, tableKey, rows) =>
    req('PUT', `/customers/${customerId}/${tableKey}`, { rows }),

  /** @param {string} customerId @param {string} tableKey @param {string[]} ids */
  deleteRows: (customerId, tableKey, ids) =>
    req('DELETE', `/customers/${customerId}/${tableKey}/rows`, { ids }),

  /** @param {import('./types').Customer[]} customers */
  replaceAll: (customers) =>
    req('POST', '/customers/replace-all', { customers }),

  getMobileUsers: () =>
    req('GET', '/users'),

  /** @param {string} id @param {'admin' | 'employee'} role */
  updateMobileUserRole: (id, role) =>
    req('PATCH', `/users/${id}/role`, { role }),
};
