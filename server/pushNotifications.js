import { prisma } from "./db.js";

export const PUSH_TOKENS_SETTING_KEY = "mobilePushTokens";
export const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

const EXPO_PUSH_TOKEN_RE = /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/;

function isValidExpoPushToken(token) {
  return EXPO_PUSH_TOKEN_RE.test(String(token || "").trim());
}

export function normalizeMobilePushTokens(data) {
  const rawTokens = Array.isArray(data) ? data : data?.tokens;
  if (!Array.isArray(rawTokens)) return [];

  const seen = new Set();
  const tokens = [];
  for (const item of rawTokens) {
    const token = String(item?.token || "").trim();
    if (!isValidExpoPushToken(token) || seen.has(token)) continue;
    seen.add(token);
    tokens.push({
      token,
      platform: String(item?.platform || "").trim(),
      userId: String(item?.userId || "").trim(),
      userName: String(item?.userName || "").trim(),
      updatedAt: String(item?.updatedAt || "").trim(),
    });
  }
  return tokens;
}

async function readRegisteredPushTokens() {
  const setting = await prisma.appSetting.findUnique({
    where: { key: PUSH_TOKENS_SETTING_KEY },
  });
  return normalizeMobilePushTokens(setting?.data || {});
}

export async function registerMobilePushToken({ user, token, platform = "" }) {
  const normalizedToken = String(token || "").trim();
  if (!isValidExpoPushToken(normalizedToken)) {
    throw new Error("Invalid Expo push token");
  }

  const existing = await readRegisteredPushTokens();
  const nextToken = {
    token: normalizedToken,
    userId: String(user?.id || "").trim(),
    userName: String(user?.name || "").trim(),
    platform: String(platform || "").trim(),
    updatedAt: new Date().toISOString(),
  };
  const tokens = [nextToken, ...existing.filter((item) => item.token !== normalizedToken)];
  const data = { tokens };

  await prisma.appSetting.upsert({
    where: { key: PUSH_TOKENS_SETTING_KEY },
    create: { key: PUSH_TOKENS_SETTING_KEY, data },
    update: { data },
  });
}

export async function sendMobilePushNotification({ title, body, data = {} }) {
  const tokens = await readRegisteredPushTokens();
  if (!tokens.length) return;

  const messages = tokens.map((item) => ({
    to: item.token,
    sound: "default",
    title,
    body,
    data,
  }));

  const response = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(messages),
  });
  if (!response.ok) throw new Error(`Expo push failed: ${response.status}`);
}

export function notifyProductionSchedulePublished({ count, customerName = "" }) {
  if (!count) return Promise.resolve();
  const body = customerName
    ? `${customerName} 发布了 ${count} 条新排产`
    : `电脑端发布了 ${count} 条新排产`;
  return sendMobilePushNotification({
    title: "新排产",
    body,
    data: { type: "production_schedule" },
  }).catch(() => {});
}
