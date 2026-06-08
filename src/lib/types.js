// @ts-check

/**
 * Shared type definitions for the CRM (used by JSDoc annotations).
 * @module types
 */

/**
 * @typedef {Object} Customer
 * @property {string} id
 * @property {string} name
 * @property {string} contact
 * @property {string} phone
 * @property {string} address
 * @property {string} level
 * @property {string} paymentTerm
 * @property {string} taxNo
 * @property {string} note
 * @property {CustomColumns} customColumns
 * @property {Record<string,any>[]} products
 * @property {Record<string,any>[]} orders
 * @property {Record<string,any>[]} deliveries
 */

/**
 * @typedef {Object} CustomerInput
 * @property {string} name
 * @property {string} [contact]
 * @property {string} [phone]
 * @property {string} [address]
 * @property {string} [level]
 * @property {string} [paymentTerm]
 * @property {string} [taxNo]
 * @property {string} [note]
 * @property {CustomColumns} [customColumns]
 */

/**
 * @typedef {Object} CustomColumns
 * @property {ColumnDef[]} products
 * @property {ColumnDef[]} orders
 * @property {ColumnDef[]} deliveries
 */

/**
 * @typedef {Object} ColumnDef
 * @property {string} field
 * @property {string} headerName
 * @property {string} [type]
 * @property {number} [width]
 */

export {};
