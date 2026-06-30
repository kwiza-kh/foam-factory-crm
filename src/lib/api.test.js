import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./api.js";

function jsonResponse(data, ok = true, status = 200) {
  return {
    ok,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  };
}

describe("desktop api auth token", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    api.setAuthToken("");
  });

  it("logs in through the users endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        ok: true,
        user: { id: "user-1", phone: "13800138000", token: "session-token-1" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await api.login({ phone: "13800138000", password: "secret123" });

    expect(fetchMock).toHaveBeenCalledWith("/api/users/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13800138000", password: "secret123" }),
    });
    expect(result.user.token).toBe("session-token-1");
  });

  it("registers a desktop user through the users endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        ok: true,
        user: {
          id: "user-2",
          name: "张三",
          phone: "13900139000",
          role: "pending",
          token: "session-token-2",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await api.register({
      name: "张三",
      phone: "13900139000",
      password: "secret123",
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/users/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "张三",
        phone: "13900139000",
        password: "secret123",
      }),
    });
    expect(result.user.role).toBe("pending");
    expect(result.user.token).toBe("session-token-2");
  });

  it("sends the saved user token with protected requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [],
        pagination: { page: 1, limit: 200, total: 0, totalPages: 0, hasMore: false },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    api.setAuthToken("session-token-1");
    await api.getCustomers({ limit: 200 });

    expect(fetchMock).toHaveBeenCalledWith("/api/customers?limit=200", {
      method: "GET",
      headers: { "X-Mobile-User-Token": "session-token-1" },
      body: undefined,
    });
  });

  it("loads the current user from a saved token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        user: { id: "user-1", phone: "13800138000", token: "session-token-1" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    api.setAuthToken("session-token-1");
    const result = await api.getCurrentUser();

    expect(fetchMock).toHaveBeenCalledWith("/api/users/me", {
      method: "GET",
      headers: { "X-Mobile-User-Token": "session-token-1" },
      body: undefined,
    });
    expect(result.user.id).toBe("user-1");
  });
});
