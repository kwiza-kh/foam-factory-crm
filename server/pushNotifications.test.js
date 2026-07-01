import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => ({
  appSetting: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
}));

vi.mock("./db.js", () => ({ prisma }));

const {
  EXPO_PUSH_URL,
  PUSH_TOKENS_SETTING_KEY,
  normalizeMobilePushTokens,
  registerMobilePushToken,
  sendMobilePushNotification,
} = await import("./pushNotifications.js");

describe("pushNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    prisma.appSetting.findUnique.mockResolvedValue(null);
    prisma.appSetting.upsert.mockResolvedValue({});
  });

  it("registers a mobile Expo push token in app settings without duplicates", async () => {
    prisma.appSetting.findUnique.mockResolvedValue({
      key: PUSH_TOKENS_SETTING_KEY,
      data: {
        tokens: [
          { token: "ExpoPushToken[old-token]", userId: "user-old", platform: "ios" },
          { token: "ExpoPushToken[token-1]", userId: "user-before", platform: "ios" },
        ],
      },
    });

    await registerMobilePushToken({
      user: { id: "user-1", name: "Worker" },
      token: "ExpoPushToken[token-1]",
      platform: "android",
    });

    expect(prisma.appSetting.upsert).toHaveBeenCalledWith({
      where: { key: PUSH_TOKENS_SETTING_KEY },
      create: {
        key: PUSH_TOKENS_SETTING_KEY,
        data: {
          tokens: expect.any(Array),
        },
      },
      update: {
        data: {
          tokens: expect.any(Array),
        },
      },
    });
    const tokens = prisma.appSetting.upsert.mock.calls[0][0].update.data.tokens;
    expect(tokens).toHaveLength(2);
    expect(tokens.find((item) => item.token === "ExpoPushToken[token-1]")).toMatchObject({
      token: "ExpoPushToken[token-1]",
      userId: "user-1",
      userName: "Worker",
      platform: "android",
    });
  });

  it("rejects invalid Expo push tokens", async () => {
    await expect(
      registerMobilePushToken({
        user: { id: "user-1", name: "Worker" },
        token: "not-a-token",
        platform: "ios",
      }),
    ).rejects.toThrow("Invalid Expo push token");

    expect(prisma.appSetting.upsert).not.toHaveBeenCalled();
  });

  it("sends Expo push notifications to all registered tokens", async () => {
    prisma.appSetting.findUnique.mockResolvedValue({
      key: PUSH_TOKENS_SETTING_KEY,
      data: {
        tokens: [
          { token: "ExpoPushToken[token-1]", userId: "user-1" },
          { token: "ExponentPushToken[token-2]", userId: "user-2" },
        ],
      },
    });
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });

    await sendMobilePushNotification({
      title: "新排产",
      body: "电脑端发布了 2 条新排产",
      data: { type: "production_schedule" },
    });

    expect(global.fetch).toHaveBeenCalledWith(
      EXPO_PUSH_URL,
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );
    const payload = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(payload).toEqual([
      {
        to: "ExpoPushToken[token-1]",
        sound: "default",
        title: "新排产",
        body: "电脑端发布了 2 条新排产",
        data: { type: "production_schedule" },
      },
      {
        to: "ExponentPushToken[token-2]",
        sound: "default",
        title: "新排产",
        body: "电脑端发布了 2 条新排产",
        data: { type: "production_schedule" },
      },
    ]);
  });

  it("does not call Expo when no registered tokens exist", async () => {
    await sendMobilePushNotification({ title: "新提醒", body: "有新的提醒" });

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("normalizes token settings from legacy array data", () => {
    expect(normalizeMobilePushTokens([{ token: "ExpoPushToken[token-1]" }])).toEqual([
      { token: "ExpoPushToken[token-1]", platform: "", userId: "", userName: "", updatedAt: "" },
    ]);
  });
});
