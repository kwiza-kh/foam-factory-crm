import { api } from "./api.js";

const desktopSessionStorageKey = "foam-crm-desktop-session";
const desktopZoneStorageKey = "foam-crm-desktop-zone";

export function readStoredDesktopSession() {
  try {
    const raw = localStorage.getItem(desktopSessionStorageKey);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writeStoredDesktopSession(user) {
  if (user) {
    localStorage.setItem(desktopSessionStorageKey, JSON.stringify(user));
  } else {
    localStorage.removeItem(desktopSessionStorageKey);
  }
}

export function normalizeDesktopRole(role = "") {
  return ["admin", "employee"].includes(role) ? role : "pending";
}

export function isDesktopBusinessUser(role = "") {
  return ["admin", "employee"].includes(normalizeDesktopRole(role));
}

export function desktopRoleLabel(role = "") {
  const normalized = normalizeDesktopRole(role);
  if (normalized === "admin") return "管理员";
  if (normalized === "employee") return "员工";
  return "待授权";
}

export { desktopSessionStorageKey, desktopZoneStorageKey };
