import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();
const VALID_TABLES = new Set(['products', 'orders', 'deliveries']);

function normalize(row) {
  return {
    id: row.id,
    name: row.name,
    contact: row.contact || '',
    phone: row.phone || '',
    address: row.address || '',
    level: row.level || '',
    paymentTerm: row.payment_term || '',
    taxNo: row.tax_no || '',
    note: row.note || '',
    customColumns: row.custom_columns || { products: [], orders: [], deliveries: [] },
    products: row.products || [],
    orders: row.orders || [],
    deliveries: row.deliveries || [],
  };
}

// GET /api/customers
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        c.id, c.name, c.contact, c.phone, c.address, c.level,
        c.payment_term, c.tax_no, c.note, c.custom_columns,
        COALESCE((
          SELECT jsonb_agg(p.data ORDER BY p.sort_order)
          FROM products p WHERE p.customer_id = c.id
        ), '[]'::jsonb) AS products,
        COALESCE((
          SELECT jsonb_agg(o.data ORDER BY o.sort_order)
          FROM orders o WHERE o.customer_id = c.id
        ), '[]'::jsonb) AS orders,
        COALESCE((
          SELECT jsonb_agg(d.data ORDER BY d.sort_order)
          FROM deliveries d WHERE d.customer_id = c.id
        ), '[]'::jsonb) AS deliveries
      FROM customers c
      ORDER BY c.name
    `);
    res.json(rows.map(normalize));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/customers/replace-all  (must be before /:id)
router.post('/replace-all', async (req, res) => {
  const { customers } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM deliveries');
    await client.query('DELETE FROM orders');
    await client.query('DELETE FROM products');
    await client.query('DELETE FROM customers');
    for (const c of customers) {
      const { products = [], orders = [], deliveries = [], customColumns, ...info } = c;
      await client.query(
        `INSERT INTO customers
           (id, name, contact, phone, address, level, payment_term, tax_no, note, custom_columns)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [info.id, info.name, info.contact || '', info.phone || '', info.address || '',
         info.level || '', info.paymentTerm || '', info.taxNo || '', info.note || '',
         JSON.stringify(customColumns || { products: [], orders: [], deliveries: [] })],
      );
      for (const [table, tableRows] of [['products', products], ['orders', orders], ['deliveries', deliveries]]) {
        for (let i = 0; i < tableRows.length; i++) {
          await client.query(
            `INSERT INTO ${table} (id, customer_id, sort_order, data) VALUES ($1,$2,$3,$4)`,
            [tableRows[i].id, info.id, i, JSON.stringify(tableRows[i])],
          );
        }
      }
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// POST /api/customers
router.post('/', async (req, res) => {
  const { id, name, contact='', phone='', address='', level='',
          paymentTerm='', taxNo='', note='', customColumns } = req.body;
  try {
    await pool.query(
      `INSERT INTO customers
         (id, name, contact, phone, address, level, payment_term, tax_no, note, custom_columns)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [id, name, contact, phone, address, level, paymentTerm, taxNo, note,
       JSON.stringify(customColumns || { products: [], orders: [], deliveries: [] })],
    );
    res.json({ id, name, contact, phone, address, level, paymentTerm, taxNo, note,
               customColumns: customColumns || { products: [], orders: [], deliveries: [] },
               products: [], orders: [], deliveries: [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/customers/:id
router.put('/:id', async (req, res) => {
  const { name, contact='', phone='', address='', level='',
          paymentTerm='', taxNo='', note='', customColumns } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE customers
       SET name=$2, contact=$3, phone=$4, address=$5, level=$6,
           payment_term=$7, tax_no=$8, note=$9, custom_columns=$10
       WHERE id=$1 RETURNING *`,
      [req.params.id, name, contact, phone, address, level, paymentTerm, taxNo, note,
       JSON.stringify(customColumns)],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(normalize(rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/customers/:id
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM customers WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/customers/:id/:tableKey  — replace all rows
router.put('/:id/:tableKey', async (req, res) => {
  const { id, tableKey } = req.params;
  if (!VALID_TABLES.has(tableKey)) return res.status(400).json({ error: 'Invalid table' });
  const { rows } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM ${tableKey} WHERE customer_id=$1`, [id]);
    for (let i = 0; i < rows.length; i++) {
      await client.query(
        `INSERT INTO ${tableKey} (id, customer_id, sort_order, data) VALUES ($1,$2,$3,$4)`,
        [rows[i].id, id, i, JSON.stringify(rows[i])],
      );
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// DELETE /api/customers/:id/:tableKey/rows  — delete specific rows
router.delete('/:id/:tableKey/rows', async (req, res) => {
  const { id, tableKey } = req.params;
  if (!VALID_TABLES.has(tableKey)) return res.status(400).json({ error: 'Invalid table' });
  const { ids } = req.body;
  try {
    await pool.query(
      `DELETE FROM ${tableKey} WHERE customer_id=$1 AND id = ANY($2)`,
      [id, ids],
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
