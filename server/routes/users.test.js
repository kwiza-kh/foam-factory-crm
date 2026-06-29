import { scryptSync } from "crypto";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = {
  mobileUser: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
};

vi.mock("../db.js", () => ({ prisma }));
vi.mock("../syncVersion.js", () => ({ bumpDataVersion: vi.fn() }));

const { default: usersRouter } = await import("./users.js");

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/users", usersRouter);
  return app;
}

function hashPassword(password) {
  const salt = "0123456789abcdef0123456789abcdef";
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

describe("users auth routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SUPER_ADMIN_PHONE;
    delete process.env.SUPER_ADMIN_PASSWORD;
    delete process.env.SUPER_ADMIN_NAME;
  });

  it("logs in with phone and password and returns a reusable session token", async () => {
    const user = {
      id: "user-1",
      name: "王工",
      phone: "13800138000",
      role: "employee",
      avatar: "",
      passwordHash: hashPassword("secret123"),
      token: "session-token-1",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    };
    prisma.mobileUser.findUnique.mockResolvedValue(user);
    prisma.mobileUser.update.mockResolvedValue(user);

    const res = await request(makeApp())
      .post("/api/users/login")
      .send({ phone: "13800138000", password: "secret123" })
      .expect(200);

    expect(prisma.mobileUser.findUnique).toHaveBeenCalledWith({
      where: { phone: "13800138000" },
    });
    expect(prisma.mobileUser.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { tokenExpiresAt: expect.any(Date) },
    });
    expect(res.body).toMatchObject({
      ok: true,
      user: {
        id: "user-1",
        name: "王工",
        phone: "13800138000",
        role: "employee",
        token: "session-token-1",
      },
    });
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it("rejects a wrong password without returning user details", async () => {
    prisma.mobileUser.findUnique.mockResolvedValue({
      id: "user-1",
      name: "王工",
      phone: "13800138000",
      role: "employee",
      avatar: "",
      passwordHash: hashPassword("secret123"),
      token: "session-token-1",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    });

    const res = await request(makeApp())
      .post("/api/users/login")
      .send({ phone: "13800138000", password: "bad-password" })
      .expect(401);

    expect(res.body).toEqual({ error: "手机号或密码不正确" });
  });

  it("restores a saved session with the mobile user token header", async () => {
    prisma.mobileUser.findUnique.mockResolvedValue({
      id: "user-1",
      name: "王工",
      phone: "13800138000",
      role: "employee",
      avatar: "",
      passwordHash: hashPassword("secret123"),
      token: "session-token-1",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    });

    const res = await request(makeApp())
      .get("/api/users/me")
      .set("X-Mobile-User-Token", "session-token-1")
      .expect(200);

    expect(prisma.mobileUser.findUnique).toHaveBeenCalledWith({
      where: { token: "session-token-1" },
    });
    expect(res.body.user).toMatchObject({
      id: "user-1",
      phone: "13800138000",
      token: "session-token-1",
    });
  });

  it("logs in and restores a session with the env super admin when the user table is empty", async () => {
    process.env.SUPER_ADMIN_PHONE = "18800000000";
    process.env.SUPER_ADMIN_PASSWORD = "env-secret-123";
    process.env.SUPER_ADMIN_NAME = "超级管理员";
    process.env.SUPER_ADMIN_TOKEN = "env-session-token";
    prisma.mobileUser.findUnique.mockResolvedValue(null);

    const loginRes = await request(makeApp())
      .post("/api/users/login")
      .send({ phone: "18800000000", password: "env-secret-123" })
      .expect(200);

    expect(loginRes.body).toMatchObject({
      ok: true,
      user: {
        id: "env-super-admin",
        name: "超级管理员",
        phone: "18800000000",
        role: "admin",
        token: "env-session-token",
      },
    });
    expect(loginRes.body.user.passwordHash).toBeUndefined();

    const meRes = await request(makeApp())
      .get("/api/users/me")
      .set("X-Mobile-User-Token", "env-session-token")
      .expect(200);

    expect(meRes.body.user).toMatchObject({
      id: "env-super-admin",
      phone: "18800000000",
      role: "admin",
      token: "env-session-token",
    });
  });

  it("logs in with the env super admin even when the user table cannot be queried", async () => {
    process.env.SUPER_ADMIN_PHONE = "18800000000";
    process.env.SUPER_ADMIN_PASSWORD = "env-secret-123";
    process.env.SUPER_ADMIN_NAME = "超级管理员";
    process.env.SUPER_ADMIN_TOKEN = "env-session-token";
    prisma.mobileUser.findUnique.mockRejectedValue(new Error("database unavailable"));

    const loginRes = await request(makeApp())
      .post("/api/users/login")
      .send({ phone: "18800000000", password: "env-secret-123" })
      .expect(200);

    expect(prisma.mobileUser.findUnique).not.toHaveBeenCalled();
    expect(loginRes.body.user).toMatchObject({
      id: "env-super-admin",
      phone: "18800000000",
      role: "admin",
      token: "env-session-token",
    });
  });
});
