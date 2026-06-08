// @ts-check

/**
 * @param {string} [prefix]
 * @returns {string}
 */
export const makeId = (prefix = 'row') =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/**
 * @returns {string} ISO date string (YYYY-MM-DD)
 */
export const today = () => new Date().toISOString().slice(0, 10);
