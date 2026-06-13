import { Router } from 'express';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'crypto';
import { prisma } from '../db.js';
import { authMiddleware } from '../auth.js';

const router = Router();
const VALID_ROLES = new Set(['pending', 'admin', 'employee']);

function normalizeRole(role) {
  return VALID_ROLES.has(role) ? role : 'pending';
}

function publicUser(user, { includeToken = true } = {}) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name || '',
    phone: user.phone || '',
    role: normalizeRole(user.role),
    ...(includeToken ? { token: user.token } : {}),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash = '') {
  const [salt, hash] = String(storedHash || '').split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function readMobileToken(req) {
  return String(req.headers['x-mobile-user-token'] || req.query.mobileToken || '').trim();
}

async function findUserByMobileToken(req) {
  const token = readMobileToken(req);
  if (!token) return null;
  return prisma.mobileUser.findUnique({ where: { token } });
}

router.post('/register', async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const phone = String(req.body?.phone || '').trim();
  const password = String(req.body?.password || '');

  if (!name) return res.status(400).json({ error: '请填写姓名' });
  if (!phone) return res.status(400).json({ error: '请填写手机号' });
  if (password.length < 6) return res.status(400).json({ error: '密码至少需要 6 位' });

  try {
    const existing = await prisma.mobileUser.findUnique({ where: { phone } });
    if (existing) {
      if (existing.passwordHash && !verifyPassword(password, existing.passwordHash)) {
        return res.status(401).json({ error: '手机号已注册，密码不正确' });
      }
      const updated = await prisma.mobileUser.update({
        where: { phone },
        data: {
          name,
          ...(existing.passwordHash ? {} : { passwordHash: hashPassword(password) }),
        },
      });
      return res.json({ ok: true, user: publicUser(updated) });
    }

    const user = await prisma.mobileUser.create({
      data: {
        id: `user-${randomUUID()}`,
        name,
        phone,
        role: 'pending',
        passwordHash: hashPassword(password),
        token: randomUUID(),
      },
    });
    res.json({ ok: true, user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/me', async (req, res) => {
  try {
    const user = await findUserByMobileToken(req);
    if (!user) return res.status(401).json({ error: '未注册或账号不存在' });
    res.json({ user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', authMiddleware, async (_req, res) => {
  try {
    const users = await prisma.mobileUser.findMany({
      orderBy: [{ role: 'asc' }, { createdAt: 'desc' }],
    });
    res.json({ data: users.map(user => publicUser(user, { includeToken: false })) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/role', authMiddleware, async (req, res) => {
  const role = normalizeRole(req.body?.role);
  try {
    const user = await prisma.mobileUser.update({
      where: { id: req.params.id },
      data: { role },
    });
    res.json({ ok: true, user: publicUser(user, { includeToken: false }) });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'User not found' });
    res.status(500).json({ error: err.message });
  }
});

export { findUserByMobileToken, normalizeRole };
export default router;
