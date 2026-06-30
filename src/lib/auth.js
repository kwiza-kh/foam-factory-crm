/**
 * Shared auth helpers used by App.jsx and desktop auth components.
 * Extracted to avoid circular imports.
 */

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
