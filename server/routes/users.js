import { Router } from "express";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "crypto";
import { prisma } from "../db.js";
import { authMiddleware } from "../auth.js";
import { bumpDataVersion } from "../syncVersion.js";
import {
  findEnvSuperAdminByToken,
  isEnvSuperAdminLogin,
  publicEnvSuperAdmin,
} from "../envSuperAdmin.js";

const router = Router();
const VALID_ROLES = new Set(["pending", "admin", "employee"]);
const MOBILE_DISPLAY_SETTINGS_KEY = "mobileDisplaySettings";
const defaultMobileDisplaySettings = {
  cardFields: ["_customerName", "orderNo", "status", "product", "quantity", "dueDate"],
  detailFields: [
    "_customerName",
    "orderNo",
    "status",
    "date",
    "product",
    "quantity",
    "amount",
    "dueDate",
    "productionDate",
    "productionQuantity",
    "productionLine",
    "deliveredQuantity",
    "remainingQuantity",
    "completionTime",
    "completionOperator",
    "completionNote",
  ],
};

const TOKEN_EXPIRY_DAYS = 30;

function tokenExpiryDate() {
  return new Date(Date.now() + TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
}

function normalizeRole(role) {
  return VALID_ROLES.has(role) ? role : "pending";
}

function publicUser(user, { includeToken = true } = {}) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name || "",
    phone: user.phone || "",
    role: normalizeRole(user.role),
    avatar: user.avatar || "",
    ...(includeToken ? { token: user.token } : {}),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function normalizeFieldList(value, fallback = []) {
  if (!Array.isArray(value)) return fallback;
  return Array.from(new Set(value.map((field) => String(field || "").trim()).filter(Boolean)));
}

function normalizeMobileDisplaySettings(value = {}) {
  const data = value && typeof value === "object" ? value : {};
  return {
    cardFields: normalizeFieldList(data.cardFields, defaultMobileDisplaySettings.cardFields),
    detailFields: normalizeFieldList(data.detailFields, defaultMobileDisplaySettings.detailFields),
  };
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash = "") {
  const [salt, hash] = String(storedHash || "").split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function readMobileToken(req) {
  return String(req.headers["x-mobile-user-token"] || req.query.mobileToken || "").trim();
}

async function findUserByMobileToken(req) {
  const token = readMobileToken(req);
  if (!token) return null;
  const envAdmin = findEnvSuperAdminByToken(token);
  if (envAdmin) return envAdmin;
  const user = await prisma.mobileUser.findUnique({ where: { token } });
  if (!user) return null;
  if (user.tokenExpiresAt && new Date(user.tokenExpiresAt) < new Date()) {
    return null; // Token expired — treat as invalid
  }
  return user;
}

function mobileTokenOrAdmin(req, res, next) {
  if (readMobileToken(req)) return next();
  return authMiddleware(req, res, next);
}

router.post("/login", async (req, res) => {
  const phone = String(req.body?.phone || "").trim();
  const password = String(req.body?.password || "");

  if (!phone || !password) {
    return res.status(400).json({ error: "请填写手机号和密码" });
  }

  try {
    if (isEnvSuperAdminLogin(phone, password)) {
      return res.json({ ok: true, user: publicEnvSuperAdmin() });
    }
    const user = await prisma.mobileUser.findUnique({ where: { phone } });
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: "手机号或密码不正确" });
    }
    // Refresh token expiry on successful login
    const updated = await prisma.mobileUser.update({
      where: { id: user.id },
      data: { tokenExpiresAt: tokenExpiryDate() },
    });
    res.json({ ok: true, user: publicUser(updated) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/register", async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const phone = String(req.body?.phone || "").trim();
  const password = String(req.body?.password || "");

  if (!name) return res.status(400).json({ error: "请填写姓名" });
  if (!phone) return res.status(400).json({ error: "请填写手机号" });
  if (password.length < 6) return res.status(400).json({ error: "密码至少需要 6 位" });

  try {
    const existing = await prisma.mobileUser.findUnique({ where: { phone } });
    if (existing) {
      if (existing.passwordHash && !verifyPassword(password, existing.passwordHash)) {
        return res.status(401).json({ error: "手机号已注册，密码不正确" });
      }
      const updated = await prisma.mobileUser.update({
        where: { phone },
        data: {
          name,
          ...(existing.passwordHash ? {} : { passwordHash: hashPassword(password) }),
        },
      });
      bumpDataVersion();
      return res.json({ ok: true, user: publicUser(updated) });
    }

    const user = await prisma.mobileUser.create({
      data: {
        id: `user-${randomUUID()}`,
        name,
        phone,
        role: "pending",
        passwordHash: hashPassword(password),
        token: randomUUID(),
        tokenExpiresAt: tokenExpiryDate(),
      },
    });
    bumpDataVersion();
    res.json({ ok: true, user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/me", async (req, res) => {
  try {
    const user = await findUserByMobileToken(req);
    if (!user) return res.status(401).json({ error: "未注册或账号不存在" });
    res.json({ user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/me/avatar", async (req, res) => {
  const avatar = String(req.body?.avatar || "").trim();
  if (avatar && !avatar.startsWith("data:image/")) {
    return res.status(400).json({ error: "头像格式不正确" });
  }
  try {
    const user = await findUserByMobileToken(req);
    if (!user) return res.status(401).json({ error: "未注册或账号不存在" });
    const updated = await prisma.mobileUser.update({
      where: { id: user.id },
      data: { avatar },
    });
    bumpDataVersion();
    res.json({ ok: true, user: publicUser(updated) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/me/password", async (req, res) => {
  const currentPassword = String(req.body?.currentPassword || "");
  const newPassword = String(req.body?.newPassword || "");
  if (!currentPassword) return res.status(400).json({ error: "请填写当前密码" });
  if (newPassword.length < 6) return res.status(400).json({ error: "新密码至少需要 6 位" });

  try {
    const user = await findUserByMobileToken(req);
    if (!user) return res.status(401).json({ error: "未注册或账号不存在" });
    if (!verifyPassword(currentPassword, user.passwordHash)) {
      return res.status(401).json({ error: "当前密码不正确" });
    }
    const updated = await prisma.mobileUser.update({
      where: { id: user.id },
      data: { passwordHash: hashPassword(newPassword) },
    });
    bumpDataVersion();
    res.json({ ok: true, user: publicUser(updated) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/mobile-display-settings", mobileTokenOrAdmin, async (req, res) => {
  try {
    const mobileUser = await findUserByMobileToken(req);
    const hasMobileToken = Boolean(readMobileToken(req));
    if (hasMobileToken && !mobileUser) {
      return res.status(401).json({ error: "手机账号不存在或已失效" });
    }
    const setting = await prisma.appSetting.findUnique({
      where: { key: MOBILE_DISPLAY_SETTINGS_KEY },
    });
    res.json({ data: normalizeMobileDisplaySettings(setting?.data || {}) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/mobile-display-settings", authMiddleware, async (req, res) => {
  try {
    const data = normalizeMobileDisplaySettings(req.body || {});
    const setting = await prisma.appSetting.upsert({
      where: { key: MOBILE_DISPLAY_SETTINGS_KEY },
      create: { key: MOBILE_DISPLAY_SETTINGS_KEY, data },
      update: { data },
    });
    bumpDataVersion();
    res.json({ ok: true, data: normalizeMobileDisplaySettings(setting.data) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/", authMiddleware, async (_req, res) => {
  try {
    const users = await prisma.mobileUser.findMany({
      orderBy: [{ role: "asc" }, { createdAt: "desc" }],
    });
    res.json({ data: users.map((user) => publicUser(user, { includeToken: false })) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/:id/role", authMiddleware, async (req, res) => {
  const role = normalizeRole(req.body?.role);
  try {
    const user = await prisma.mobileUser.update({
      where: { id: req.params.id },
      data: { role },
    });
    bumpDataVersion();
    res.json({ ok: true, user: publicUser(user, { includeToken: false }) });
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ error: "User not found" });
    res.status(500).json({ error: err.message });
  }
});

export { findUserByMobileToken, normalizeMobileDisplaySettings, normalizeRole };
export default router;
