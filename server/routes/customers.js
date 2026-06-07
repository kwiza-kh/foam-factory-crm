import { Router } from 'express';
import { randomUUID } from 'crypto';
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

function makeRowId(tableKey) {
  return `${tableKey}-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
}

function uniqueRows(rows = [], tableKey, usedIds = new Set()) {
  return rows.map(row => {
    let id = row?.id;
    while (!id || usedIds.has(id)) {
      id = makeRowId(tableKey);
    }
    usedIds.add(id);
    return id === row?.id ? row : { ...row, id };
  });
}

function normalizeIncomingCustomers(customers = []) {
  const usedIdsByTable = Object.fromEntries(
    Object.keys(TABLE_DELEGATES).map(tableKey => [tableKey, new Set()]),
  );

  return customers.map(customer => {
    const next = { ...customer };
    for (const tableKey of Object.keys(TABLE_DELEGATES)) {
      next[tableKey] = uniqueRows(customer[tableKey] || [], tableKey, usedIdsByTable[tableKey]);
    }
    return next;
  });
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
  const customers = normalizeIncomingCustomers(req.body.customers || []);
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
    res.json({ ok: true, customers });
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

// PATCH /api/customers/:id/orders/:orderId/status - update one order status
router.patch('/:id/orders/:orderId/status', async (req, res) => {
  const { id, orderId } = req.params;
  const { status } = req.body || {};
  const nextStatus = String(status || '').trim();
  if (!nextStatus) return res.status(400).json({ error: 'Missing status' });
  const allowedExtraFields = ['completionTime', 'completionOperator', 'completionNote'];
  const extraData = {};
  for (const field of allowedExtraFields) {
    if (Object.prototype.hasOwnProperty.call(req.body || {}, field)) {
      extraData[field] = req.body[field];
    }
  }

  try {
    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        customerId: id,
      },
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const data = {
      ...(order.data || {}),
      ...extraData,
      status: nextStatus,
    };
    const updated = await prisma.order.update({
      where: { id: orderId },
      data: { data },
    });
    res.json({ ok: true, row: updated.data });
  } catch (err) {
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
    let savedRows = [];
    await prisma.$transaction(async (tx) => {
      const existingRows = await tx[delegate].findMany({
        where: { customerId: { not: id } },
        select: { id: true },
      });
      const usedIds = new Set(existingRows.map(row => row.id));
      savedRows = uniqueRows(rows || [], tableKey, usedIds);
      const savedIds = savedRows.map(row => row.id);

      if (savedIds.length) {
        await tx[delegate].deleteMany({
          where: {
            customerId: id,
            id: { notIn: savedIds },
          },
        });
      } else {
        await tx[delegate].deleteMany({ where: { customerId: id } });
      }

      for (let i = 0; i < savedRows.length; i++) {
        await tx[delegate].upsert({
          where: { id: savedRows[i].id },
          update: {
            customerId: id,
            sortOrder: i,
            data: savedRows[i],
          },
          create: {
            id: savedRows[i].id,
            customerId: id,
            sortOrder: i,
            data: savedRows[i],
          },
        });
      }
    });
    res.json({ ok: true, rows: savedRows });
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
