import { Router } from 'express';
import { randomUUID } from 'crypto';
import { prisma } from '../db.js';
import { findUserByMobileToken, normalizeRole } from './users.js';

const router = Router();
const VALID_TABLES = new Set(['products', 'orders', 'deliveries', 'materialCosts', 'costEntries']);
const TABLE_DELEGATES = {
  products: 'product',
  orders: 'order',
  deliveries: 'delivery',
  materialCosts: 'materialCost',
  costEntries: 'costEntry',
};

function defaultCustomColumns() {
  return { products: [], orders: [], deliveries: [], materialCosts: [], costEntries: [] };
}

function normalizeCustomColumns(customColumns = {}) {
  return {
    ...defaultCustomColumns(),
    ...(customColumns || {}),
    columnOrder: customColumns?.columnOrder || {},
  };
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
    customColumns: normalizeCustomColumns(row.customColumns),
    products: row.products?.map(item => item.data) || [],
    orders: row.orders?.map(item => item.data) || [],
    deliveries: row.deliveries?.map(item => item.data) || [],
    materialCosts: row.materialCosts?.map(item => item.data) || [],
    costEntries: row.costEntries?.map(item => item.data) || [],
  };
}

function normalizeOrderStatus(status = '') {
  const value = String(status || '').trim();
  if (value === '已发货') return '已送货';
  return value || '未完成';
}

function filterCustomerForMobileUser(customer, user) {
  const role = normalizeRole(user?.role);
  if (!user || role === 'admin') return customer;
  if (role === 'pending') {
    return { ...customer, products: [], deliveries: [], orders: [], materialCosts: [], costEntries: [] };
  }
  return {
    ...customer,
    products: [],
    deliveries: [],
    materialCosts: customer.materialCosts || [],
    costEntries: customer.costEntries || [],
    orders: (customer.orders || []).filter(order => normalizeOrderStatus(order.status) === '已排产'),
  };
}

function hasMobileUserToken(req) {
  return Boolean(String(req.headers['x-mobile-user-token'] || req.query.mobileToken || '').trim());
}

// GET /api/customers?page=1&limit=50&search=xxx
router.get('/', async (req, res) => {
  try {
    const mobileUser = await findUserByMobileToken(req);
    if (hasMobileUserToken(req) && !mobileUser) {
      return res.status(401).json({ error: '手机账号不存在或已失效' });
    }
    const mobileRole = normalizeRole(mobileUser?.role);
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const skip = (page - 1) * limit;
    const search = (req.query.search || '').trim();

    const where = search
      ? { name: { contains: search, mode: 'insensitive' } }
      : {};

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take: limit,
        include: {
          products: { orderBy: { sortOrder: 'asc' } },
          orders: { orderBy: { sortOrder: 'asc' } },
          deliveries: { orderBy: { sortOrder: 'asc' } },
          materialCosts: { orderBy: { sortOrder: 'asc' } },
          costEntries: { orderBy: { sortOrder: 'asc' } },
        },
      }),
      prisma.customer.count({ where }),
    ]);

    const data = customers
      .map(normalize)
      .map(customer => (mobileUser ? filterCustomerForMobileUser(customer, mobileUser) : customer))
      .filter(customer => (
        !mobileUser
        || mobileRole === 'admin'
        || customer.orders.length > 0
        || customer.materialCosts.length > 0
        || customer.costEntries.length > 0
      ));

    res.json({
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: skip + customers.length < total,
      },
    });
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
      await tx.costEntry.deleteMany();
      await tx.materialCost.deleteMany();
      await tx.customer.deleteMany();

      for (const c of customers) {
        const {
          products = [],
          orders = [],
          deliveries = [],
          materialCosts = [],
          costEntries = [],
          customColumns,
          ...info
        } = c;
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
            customColumns: normalizeCustomColumns(customColumns),
          },
        });

        for (const [table, tableRows] of [
          ['products', products],
          ['orders', orders],
          ['deliveries', deliveries],
          ['materialCosts', materialCosts],
          ['costEntries', costEntries],
        ]) {
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
        customColumns: normalizeCustomColumns(customColumns),
      },
    });
    res.json({ id, name, contact, phone, address, level, paymentTerm, taxNo, note,
               customColumns: normalizeCustomColumns(customColumns),
               products: [], orders: [], deliveries: [], materialCosts: [], costEntries: [] });
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
        customColumns: normalizeCustomColumns(customColumns),
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
  const allowedExtraFields = [
    'completionTime',
    'completionOperator',
    'completionNote',
    'completionPhoto',
    'completionPhotoAt',
    'completionUserId',
    'completionUserName',
  ];
  const extraData = {};
  for (const field of allowedExtraFields) {
    if (Object.prototype.hasOwnProperty.call(req.body || {}, field)) {
      extraData[field] = req.body[field];
    }
  }

  try {
    const mobileUser = await findUserByMobileToken(req);
    if (hasMobileUserToken(req) && !mobileUser) {
      return res.status(401).json({ error: '手机账号不存在或已失效' });
    }
    const mobileRole = normalizeRole(mobileUser?.role);
    if (mobileUser && mobileRole === 'pending') {
      return res.status(403).json({ error: '账号尚未分配角色，请联系管理员' });
    }
    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        customerId: id,
      },
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (mobileUser && mobileRole === 'employee') {
      if (nextStatus !== '已完成') return res.status(403).json({ error: '员工只能完成已排产订单' });
      if (normalizeOrderStatus(order.data?.status) !== '已排产') {
        return res.status(403).json({ error: '员工只能完成已排产订单' });
      }
    }
    if (nextStatus === '已完成' && !req.body?.completionPhoto && !order.data?.completionPhoto) {
      return res.status(400).json({ error: '完成订单必须上传现场照片' });
    }
    if (mobileUser) {
      extraData.completionUserId = mobileUser.id;
      extraData.completionUserName = mobileUser.name || '';
      if (!extraData.completionOperator) extraData.completionOperator = mobileUser.name || '手机端';
    }

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

// POST /api/customers/:id/cost-entries - mobile cost entry with photo proof
router.post('/:id/cost-entries', async (req, res) => {
  const { id } = req.params;
  const body = req.body || {};
  const materialName = String(body.materialName || '').trim();
  const photo = body.photo;

  if (!materialName) return res.status(400).json({ error: '请填写物料名称' });
  if (!photo?.dataUrl) return res.status(400).json({ error: '成本录入必须上传照片' });

  try {
    const mobileUser = await findUserByMobileToken(req);
    if (!mobileUser) {
      return res.status(401).json({ error: '手机账号不存在或已失效' });
    }
    const mobileRole = normalizeRole(mobileUser?.role);
    if (mobileRole === 'pending') {
      return res.status(403).json({ error: '账号尚未分配角色，请联系管理员' });
    }

    const customer = await prisma.customer.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const row = {
      id: makeRowId('costEntries'),
      date: String(body.date || '').trim() || new Date().toISOString().slice(0, 10),
      materialName,
      quantity: Number(body.quantity || 0),
      unit: String(body.unit || '').trim(),
      unitCost: Number(body.unitCost || 0),
      amount: Number(body.amount || 0),
      note: String(body.note || '').trim(),
      photo,
      enteredAt: new Date().toISOString(),
      enteredBy: mobileUser.name || '手机端',
      enteredUserId: mobileUser.id || '',
    };

    const maxSort = await prisma.costEntry.aggregate({
      where: { customerId: id },
      _max: { sortOrder: true },
    });
    const created = await prisma.costEntry.create({
      data: {
        id: row.id,
        customerId: id,
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
        data: row,
      },
    });
    res.json({ ok: true, row: created.data });
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
