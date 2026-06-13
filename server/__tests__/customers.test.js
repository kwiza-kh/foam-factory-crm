import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock prisma BEFORE importing the router ──────────────────────────
const mockPrisma = vi.hoisted(() => ({
  customer: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  order: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  mobileUser: {
    findUnique: vi.fn(),
  },
  materialCost: {
    create: vi.fn(),
    deleteMany: vi.fn(),
  },
  costEntry: {
    aggregate: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock('../db.js', () => ({
  prisma: mockPrisma,
}));

import request from 'supertest';
import express from 'express';
import customersRouter from '../routes/customers.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/customers', customersRouter);
  return app;
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('Customers API Routes', () => {
  let app;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.mobileUser.findUnique.mockResolvedValue(null);
    app = createApp();
  });

  // ── GET /api/customers ──────────────────────────────────────────

  describe('GET /api/customers?page=1&limit=10', () => {
    it('should return 200 with paginated customers and default pagination', async () => {
      const mockCustomers = [
        {
          id: 'c1', name: 'Test Co', contact: '', phone: '',
          address: '', level: '', paymentTerm: '', taxNo: '', note: '',
          customColumns: { products: [], orders: [], deliveries: [] },
          products: [], orders: [], deliveries: [],
        },
      ];
      mockPrisma.customer.findMany.mockResolvedValue(mockCustomers);
      mockPrisma.customer.count.mockResolvedValue(1);

      const res = await request(app).get('/api/customers');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('pagination');
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toHaveProperty('id', 'c1');
      expect(res.body.data[0]).toHaveProperty('name', 'Test Co');
      expect(res.body.pagination).toMatchObject({
        page: 1,
        limit: 50,
        total: 1,
        totalPages: 1,
        hasMore: false,
      });
    });

    it('should respect page and limit query parameters', async () => {
      mockPrisma.customer.findMany.mockResolvedValue([]);
      mockPrisma.customer.count.mockResolvedValue(100);

      const res = await request(app).get('/api/customers?page=2&limit=10');

      expect(res.status).toBe(200);
      expect(res.body.pagination).toMatchObject({
        page: 2,
        limit: 10,
        total: 100,
        totalPages: 10,
        hasMore: true,
      });
      expect(mockPrisma.customer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });

    it('should enforce limit maximum of 200', async () => {
      mockPrisma.customer.findMany.mockResolvedValue([]);
      mockPrisma.customer.count.mockResolvedValue(0);

      const res = await request(app).get('/api/customers?limit=999');

      expect(res.status).toBe(200);
      expect(mockPrisma.customer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 200 }),
      );
    });

    it('should enforce page minimum of 1', async () => {
      mockPrisma.customer.findMany.mockResolvedValue([]);
      mockPrisma.customer.count.mockResolvedValue(0);

      const res = await request(app).get('/api/customers?page=0');

      expect(res.status).toBe(200);
      expect(mockPrisma.customer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0 }),
      );
    });

    it('should return 500 on database error', async () => {
      mockPrisma.customer.findMany.mockRejectedValue(new Error('DB connection failed'));

      const res = await request(app).get('/api/customers');

      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty('error', 'DB connection failed');
    });
  });

  // ── POST /api/customers ─────────────────────────────────────────

  describe('POST /api/customers', () => {
    it('should return 200 with created customer data', async () => {
      const body = {
        id: 'new-001', name: 'New Customer', contact: 'John',
        phone: '13800001111', address: 'Shanghai', level: '重点客户',
        paymentTerm: '30天', taxNo: 'TAX123', note: 'test',
        customColumns: { products: [], orders: [], deliveries: [] },
      };
      mockPrisma.customer.create.mockResolvedValue(body);

      const res = await request(app).post('/api/customers').send(body);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: 'new-001',
        name: 'New Customer',
        contact: 'John',
        phone: '13800001111',
        products: [],
        orders: [],
        deliveries: [],
      });
      expect(mockPrisma.customer.create).toHaveBeenCalledTimes(1);
    });

    it('should default empty string fields', async () => {
      mockPrisma.customer.create.mockResolvedValue({});

      const res = await request(app)
        .post('/api/customers')
        .send({ id: 'x', name: 'Min' });

      expect(res.status).toBe(200);
      // Verify empty defaults are passed to prisma create
      const createCall = mockPrisma.customer.create.mock.calls[0][0];
      expect(createCall.data.contact).toBe('');
      expect(createCall.data.phone).toBe('');
      expect(createCall.data.address).toBe('');
      expect(createCall.data.level).toBe('');
    });

    it('should return 500 on create error', async () => {
      mockPrisma.customer.create.mockRejectedValue(new Error('Constraint violation'));

      const res = await request(app)
        .post('/api/customers')
        .send({ id: 'dup', name: 'Duplicate' });

      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty('error', 'Constraint violation');
    });
  });

  // ── PUT /api/customers/:id ──────────────────────────────────────

  describe('PUT /api/customers/:id', () => {
    it('should return 200 with updated customer', async () => {
      const updated = {
        id: 'c1', name: 'Updated Name', contact: '', phone: '',
        address: '', level: '', paymentTerm: '', taxNo: '', note: '',
        customColumns: { products: [], orders: [], deliveries: [] },
      };
      mockPrisma.customer.update.mockResolvedValue(updated);

      const res = await request(app)
        .put('/api/customers/c1')
        .send({ name: 'Updated Name' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: 'c1', name: 'Updated Name' });
      expect(res.body).toHaveProperty('products');
      expect(res.body).toHaveProperty('orders');
      expect(res.body).toHaveProperty('deliveries');
    });

    it('should return 404 when customer does not exist (P2025)', async () => {
      const err = new Error('Record not found');
      err.code = 'P2025';
      mockPrisma.customer.update.mockRejectedValue(err);

      const res = await request(app)
        .put('/api/customers/ghost')
        .send({ name: 'Ghost' });

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'Not found');
    });

    it('should return 500 on other errors', async () => {
      mockPrisma.customer.update.mockRejectedValue(new Error('Database crash'));

      const res = await request(app)
        .put('/api/customers/c1')
        .send({ name: 'X' });

      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty('error', 'Database crash');
    });
  });

  // ── DELETE /api/customers/:id ───────────────────────────────────

  describe('DELETE /api/customers/:id', () => {
    it('should return 200 with ok true on success', async () => {
      mockPrisma.customer.delete.mockResolvedValue({});

      const res = await request(app).delete('/api/customers/c1');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
      expect(mockPrisma.customer.delete).toHaveBeenCalledWith({
        where: { id: 'c1' },
      });
    });

    it('should return 404 when customer does not exist (P2025)', async () => {
      const err = new Error('Record not found');
      err.code = 'P2025';
      mockPrisma.customer.delete.mockRejectedValue(err);

      const res = await request(app).delete('/api/customers/ghost');

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'Not found');
    });

    it('should return 500 on other errors', async () => {
      mockPrisma.customer.delete.mockRejectedValue(new Error('DB locked'));

      const res = await request(app).delete('/api/customers/c1');

      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty('error', 'DB locked');
    });
  });

  // ── PATCH /api/customers/:id/orders/:orderId/status ─────────────

  describe('PATCH /api/customers/:id/orders/:orderId/status', () => {
    it('should return 200 with updated order row', async () => {
      const existingOrder = {
        id: 'o1',
        customerId: 'c1',
        data: { status: '未完成', orderNo: 'PO-001' },
      };
      const updatedOrder = {
        id: 'o1',
        customerId: 'c1',
        data: {
          status: '已完成',
          orderNo: 'PO-001',
          completionTime: '2024-06-01',
          completionPhoto: { dataUrl: 'data:image/jpeg;base64,test' },
        },
      };
      mockPrisma.order.findFirst.mockResolvedValue(existingOrder);
      mockPrisma.order.update.mockResolvedValue(updatedOrder);

      const res = await request(app)
        .patch('/api/customers/c1/orders/o1/status')
        .send({
          status: '已完成',
          completionTime: '2024-06-01',
          completionPhoto: { dataUrl: 'data:image/jpeg;base64,test' },
        });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ ok: true });
      expect(res.body.row).toHaveProperty('status', '已完成');
      expect(res.body.row).toHaveProperty('completionTime', '2024-06-01');
      expect(res.body.row).toHaveProperty('orderNo', 'PO-001');
    });

    it('should accept extra fields (completionTime, completionOperator, completionNote)', async () => {
      const existingOrder = { id: 'o1', customerId: 'c1', data: { status: '未完成' } };
      const updatedOrder = {
        id: 'o1', customerId: 'c1',
        data: {
          status: '已完成',
          completionTime: '2024-06-01',
          completionOperator: '张三',
          completionNote: '已交付',
          completionPhoto: { dataUrl: 'data:image/jpeg;base64,test' },
        },
      };
      mockPrisma.order.findFirst.mockResolvedValue(existingOrder);
      mockPrisma.order.update.mockResolvedValue(updatedOrder);

      const res = await request(app)
        .patch('/api/customers/c1/orders/o1/status')
        .send({
          status: '已完成',
          completionTime: '2024-06-01',
          completionOperator: '张三',
          completionNote: '已交付',
          completionPhoto: { dataUrl: 'data:image/jpeg;base64,test' },
        });

      expect(res.status).toBe(200);
      expect(res.body.row).toHaveProperty('completionOperator', '张三');
      expect(res.body.row).toHaveProperty('completionNote', '已交付');
    });

    it('should return 400 when completing without a photo', async () => {
      const existingOrder = { id: 'o1', customerId: 'c1', data: { status: '已排产' } };
      mockPrisma.order.findFirst.mockResolvedValue(existingOrder);

      const res = await request(app)
        .patch('/api/customers/c1/orders/o1/status')
        .send({ status: '已完成', completionTime: '2024-06-01' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', '完成订单必须上传现场照片');
    });

    it('should return 400 when status is missing', async () => {
      const res = await request(app)
        .patch('/api/customers/c1/orders/o1/status')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'Missing status');
    });

    it('should return 400 when status is empty string', async () => {
      const res = await request(app)
        .patch('/api/customers/c1/orders/o1/status')
        .send({ status: '   ' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'Missing status');
    });

    it('should return 404 when order is not found', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(null);

      const res = await request(app)
        .patch('/api/customers/c1/orders/o999/status')
        .send({ status: '已完成' });

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'Order not found');
    });

    it('should return 500 on database error', async () => {
      mockPrisma.order.findFirst.mockRejectedValue(new Error('DB error'));

      const res = await request(app)
        .patch('/api/customers/c1/orders/o1/status')
        .send({ status: '已完成' });

      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty('error', 'DB error');
    });
  });

  describe('POST /api/customers/:id/cost-entries', () => {
    it('should return 400 when photo is missing', async () => {
      mockPrisma.mobileUser.findUnique.mockResolvedValue({
        id: 'u1',
        name: 'Worker',
        role: 'employee',
        token: 'token-1',
      });

      const res = await request(app)
        .post('/api/customers/c1/cost-entries')
        .set('X-Mobile-User-Token', 'token-1')
        .send({ materialName: 'EPS', quantity: 2 });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', '成本录入必须上传照片');
    });

    it('should create a cost entry with mobile user and photo proof', async () => {
      mockPrisma.mobileUser.findUnique.mockResolvedValue({
        id: 'u1',
        name: 'Worker',
        role: 'employee',
        token: 'token-1',
      });
      mockPrisma.customer.findUnique.mockResolvedValue({ id: 'c1' });
      mockPrisma.costEntry.aggregate.mockResolvedValue({ _max: { sortOrder: 2 } });
      mockPrisma.costEntry.create.mockImplementation(async ({ data }) => ({
        ...data,
        data: {
          ...data.data,
          id: 'costEntries-test',
        },
      }));

      const res = await request(app)
        .post('/api/customers/c1/cost-entries')
        .set('X-Mobile-User-Token', 'token-1')
        .send({
          date: '2026-06-13',
          materialName: 'EPS',
          quantity: 3,
          unit: '件',
          unitCost: 8.5,
          amount: 25.5,
          note: '入库',
          photo: { dataUrl: 'data:image/jpeg;base64,test' },
        });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ ok: true });
      expect(res.body.row).toMatchObject({
        id: 'costEntries-test',
        materialName: 'EPS',
        quantity: 3,
        unit: '件',
        unitCost: 8.5,
        amount: 25.5,
        enteredBy: 'Worker',
        enteredUserId: 'u1',
        photo: { dataUrl: 'data:image/jpeg;base64,test' },
      });
      expect(mockPrisma.costEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          customerId: 'c1',
          sortOrder: 3,
        }),
      });
    });
  });
});
