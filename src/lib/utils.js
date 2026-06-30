// @ts-check
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind classes with clsx + tailwind-merge
 * @param {...import("clsx").ClassValue} inputs
 * @returns {string}
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

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
