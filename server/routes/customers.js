import { Router } from 'express';
import { prisma } from '../db.js';

const router = Router();
const VALID_TABLES = new Set(['products', 'orders', 'deliveries']);
const TABLE_DELEGATES = {
  products: 'product',
  orders: 'order',
  deliveries: 'delivery',
};

function defaultCustomColumns() {
  return { products: [], orders: [], deliveries: [] };
}

function normalize(row) {
  return {
    id: row.id,
    name: row.name,
    contact: row.contact || '',
    phone: row.phone || '',
    address: row.address || '',
    level: row.level || '',
    paymentTerm: row.paymentTerm || '',
    taxNo: row.taxNo || '',
    note: row.note || '',
    customColumns: row.customColumns || defaultCustomColumns(),
    products: row.products?.map(item => item.data) || [],
    orders: row.orders?.map(item => item.data) || [],
    deliveries: row.deliveries?.map(item => item.data) || [],
  };
}

// GET /api/customers
router.get('/', async (req, res) => {
  try {
    const customers = await prisma.customer.findMany({
      orderBy: { name: 'asc' },
      include: {
        products: { orderBy: { sortOrder: 'asc' } },
        orders: { orderBy: { sortOrder: 'asc' } },
        deliveries: { orderBy: { sortOrder: 'asc' } },
      },
    });
    res.json(customers.map(normalize));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/customers/replace-all  (must be before /:id)
router.post('/replace-all', async (req, res) => {
  const { customers } = req.body;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.delivery.deleteMany();
      await tx.order.deleteMany();
      await tx.product.deleteMany();
      await tx.customer.deleteMany();

      for (const c of customers) {
        const { products = [], orders = [], deliveries = [], customColumns, ...info } = c;
        await tx.customer.create({
          data: {
            id: info.id,
            name: info.name,
            contact: info.contact || '',
            phone: info.phone || '',
            address: info.address || '',
            level: info.level || '',
            paymentTerm: info.paymentTerm || '',
            taxNo: info.taxNo || '',
            note: info.note || '',
            customColumns: customColumns || defaultCustomColumns(),
          },
        });

        for (const [table, tableRows] of [['products', products], ['orders', orders], ['deliveries', deliveries]]) {
          const delegate = TABLE_DELEGATES[table];
          for (let i = 0; i < tableRows.length; i++) {
            await tx[delegate].create({
              data: {
                id: tableRows[i].id,
                customerId: info.id,
                sortOrder: i,
                data: tableRows[i],
              },
            });
          }
        }
      }
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/customers
router.post('/', async (req, res) => {
  const { id, name, contact='', phone='', address='', level='',
          paymentTerm='', taxNo='', note='', customColumns } = req.body;
  try {
    await prisma.customer.create({
      data: {
        id,
        name,
        contact,
        phone,
        address,
        level,
        paymentTerm,
        taxNo,
        note,
        customColumns: customColumns || defaultCustomColumns(),
      },
    });
    res.json({ id, name, contact, phone, address, level, paymentTerm, taxNo, note,
               customColumns: customColumns || defaultCustomColumns(),
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
    const customer = await prisma.customer.update({
      where: { id: req.params.id },
      data: {
        name,
        contact,
        phone,
        address,
        level,
        paymentTerm,
        taxNo,
        note,
        customColumns: customColumns || defaultCustomColumns(),
      },
    });
    res.json(normalize(customer));
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Not found' });
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/customers/:id
router.delete('/:id', async (req, res) => {
  try {
    await prisma.customer.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Not found' });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/customers/:id/:tableKey - replace all rows
router.put('/:id/:tableKey', async (req, res) => {
  const { id, tableKey } = req.params;
  if (!VALID_TABLES.has(tableKey)) return res.status(400).json({ error: 'Invalid table' });
  const { rows } = req.body;
  try {
    const delegate = TABLE_DELEGATES[tableKey];
    await prisma.$transaction(async (tx) => {
      await tx[delegate].deleteMany({ where: { customerId: id } });

      for (let i = 0; i < rows.length; i++) {
        await tx[delegate].create({
          data: {
            id: rows[i].id,
            customerId: id,
            sortOrder: i,
            data: rows[i],
          },
        });
      }
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/customers/:id/:tableKey/rows - delete specific rows
router.delete('/:id/:tableKey/rows', async (req, res) => {
  const { id, tableKey } = req.params;
  if (!VALID_TABLES.has(tableKey)) return res.status(400).json({ error: 'Invalid table' });
  const { ids } = req.body;
  try {
    const delegate = TABLE_DELEGATES[tableKey];
    await prisma[delegate].deleteMany({
      where: {
        customerId: id,
        id: { in: ids },
      },
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
