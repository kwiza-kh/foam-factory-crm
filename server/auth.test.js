import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("authMiddleware", () => {
  afterEach(() => {
    delete process.env.API_KEY;
    delete process.env.SUPER_ADMIN_PHONE;
    delete process.env.SUPER_ADMIN_PASSWORD;
    delete process.env.SUPER_ADMIN_NAME;
    delete process.env.SUPER_ADMIN_TOKEN;
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("accepts a valid user token as API authentication", async () => {
    process.env.API_KEY = "admin-api-key";
    const prisma = {
      mobileUser: {
        findUnique: vi.fn().mockResolvedValue({
          id: "user-1",
          name: "王工",
          phone: "13800138000",
          role: "employee",
          token: "session-token-1",
        }),
      },
    };
    vi.doMock("./db.js", () => ({ prisma }));
    const { authMiddleware } = await import("./auth.js");

    const app = express();
    app.get("/secure", authMiddleware, (req, res) => {
      res.json({ ok: true, userId: req.authUser.id });
    });

    const res = await request(app)
      .get("/secure")
      .set("X-Mobile-User-Token", "session-token-1")
      .expect(200);

    expect(prisma.mobileUser.findUnique).toHaveBeenCalledWith({
      where: { token: "session-token-1" },
    });
    expect(res.body).toEqual({ ok: true, userId: "user-1" });
  });

  it("rejects an invalid user token before checking API key fallback", async () => {
    process.env.API_KEY = "admin-api-key";
    const prisma = {
      mobileUser: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };
    vi.doMock("./db.js", () => ({ prisma }));
    const { authMiddleware } = await import("./auth.js");

    const app = express();
    app.get("/secure", authMiddleware, (_req, res) => {
      res.json({ ok: true });
    });

    const res = await request(app)
      .get("/secure")
      .set("X-Mobile-User-Token", "expired-token")
      .expect(401);

    expect(res.body).toEqual({ error: "登录已失效，请重新登录" });
  });

  it("accepts the env super admin token without querying the user table", async () => {
    process.env.API_KEY = "admin-api-key";
    process.env.SUPER_ADMIN_PHONE = "18800000000";
    process.env.SUPER_ADMIN_PASSWORD = "env-secret-123";
    process.env.SUPER_ADMIN_NAME = "超级管理员";
    process.env.SUPER_ADMIN_TOKEN = "env-session-token";
    const prisma = {
      mobileUser: {
        findUnique: vi.fn().mockRejectedValue(new Error("database unavailable")),
      },
    };
    vi.doMock("./db.js", () => ({ prisma }));
    const { authMiddleware } = await import("./auth.js");

    const app = express();
    app.get("/secure", authMiddleware, (req, res) => {
      res.json({ ok: true, userId: req.authUser.id, role: req.authUser.role });
    });

    const res = await request(app)
      .get("/secure")
      .set("X-Mobile-User-Token", "env-session-token")
      .expect(200);

    expect(prisma.mobileUser.findUnique).not.toHaveBeenCalled();
    expect(res.body).toEqual({ ok: true, userId: "env-super-admin", role: "admin" });
  });
});
