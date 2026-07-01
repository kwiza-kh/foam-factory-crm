// @ts-check

/** @type {string} */
const BASE = "/api";
let authToken = "";

function parseErrorMessage(text, fallback) {
  if (!text) return fallback;
  try {
    const data = JSON.parse(text);
    return data?.error || data?.message || text;
  } catch {
    return text;
  }
}

/**
 * @param {string} method
 * @param {string} path
 * @param {unknown} [body]
 * @returns {Promise<any>}
 */
async function req(method, path, body) {
  const headers = {
    ...(authToken ? { "X-Mobile-User-Token": authToken } : {}),
    ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
  };
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(parseErrorMessage(text, `HTTP ${res.status}`));
  }
  return res.json();
}

export const api = {
  setAuthToken: (token = "") => {
    authToken = String(token || "").trim();
  },

  getAuthToken: () => authToken,

  getSyncVersion: () => req("GET", "/sync-version"),

  /** @param {{ phone: string; password: string }} credentials */
  login: (credentials) => req("POST", "/users/login", credentials),

  /** @param {{ name: string; phone: string; password: string }} profile */
  register: (profile) => req("POST", "/users/register", profile),

  getCurrentUser: () => req("GET", "/users/me"),

  /**
   * @param {{ page?: number; limit?: number; search?: string }} [params]
   * @returns {Promise<{ data: import('./types').Customer[]; pagination: { page: number; limit: number; total: number; totalPages: number; hasMore: boolean } }>}
   */
  getCustomers: (params = {}) => {
    const query = new URLSearchParams();
    if (params.page) query.set("page", String(params.page));
    if (params.limit) query.set("limit", String(params.limit));
    if (params.search) query.set("search", params.search);
    const qs = query.toString();
    return req("GET", `/customers${qs ? `?${qs}` : ""}`);
  },

  /** @param {import('./types').CustomerInput} customer */
  createCustomer: (customer) => req("POST", "/customers", customer),

  /** @param {string} id @param {import('./types').CustomerInput} customer */
  updateCustomer: (id, customer) => req("PUT", `/customers/${id}`, customer),

  /** @param {string} id */
  deleteCustomer: (id) => req("DELETE", `/customers/${id}`),

  /** @param {string} customerId @param {string} tableKey @param {Record<string,any>[]} rows */
  setRows: (customerId, tableKey, rows) =>
    req("PUT", `/customers/${customerId}/${tableKey}`, { rows }),

  /** @param {string} customerId @param {string} tableKey @param {string[]} ids */
  deleteRows: (customerId, tableKey, ids) =>
    req("DELETE", `/customers/${customerId}/${tableKey}/rows`, { ids }),

  /** @param {import('./types').Customer[]} customers */
  replaceAll: (customers) => req("POST", "/customers/replace-all", { customers }),

  getMobileUsers: () => req("GET", "/users"),

  /** @param {string} id @param {'pending' | 'admin' | 'employee'} role */
  updateMobileUserRole: (id, role) => req("PATCH", `/users/${id}/role`, { role }),

  getMobileDisplaySettings: () => req("GET", "/users/mobile-display-settings"),

  /** @param {{ cardFields: string[]; detailFields: string[] }} settings */
  updateMobileDisplaySettings: (settings) => req("PUT", "/users/mobile-display-settings", settings),

  // Attendance
  getAttendanceLeaves: () => req("GET", "/attendance/leaves"),

  /** @param {'approved' | 'rejected'} status */
  updateLeaveStatus: (id, status) => req("PATCH", `/attendance/leaves/${id}`, { status }),

  /** @param {string} [month] */
  getAttendanceOverview: (month) => {
    const qs = month ? `?month=${month}` : "";
    return req("GET", `/attendance/admin/overview${qs}`);
  },

  getAttendanceRules: () => req("GET", "/attendance/rules"),

  getPayrollCalendar: () => req("GET", "/attendance/payroll-calendar"),

  /** @param {{ morningStartOptions?: string[]; afternoonStartOptions?: string[]; workStart?: string; lunchStart: string; lunchEnd: string; workEnd: string; lunchBreakMin: number; workDaysPerMonth: number; overtimeMultiplier: number; lateToleMin: number; payrollCycleStartDay?: number; payDays?: number[] }} rules */
  updateAttendanceRules: (rules) => req("PUT", "/attendance/rules", rules),

  getAttendanceSalaries: () => req("GET", "/attendance/salaries"),

  /** @param {string} userId @param {number} monthlySalary */
  updateAttendanceSalary: (userId, monthlySalary) =>
    req("PUT", `/attendance/salaries/${userId}`, { monthlySalary }),
};
