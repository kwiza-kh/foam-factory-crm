const ENV_SUPER_ADMIN_ID = "env-super-admin";

export function getEnvSuperAdmin() {
  const phone = String(process.env.SUPER_ADMIN_PHONE || "").trim();
  const password = String(process.env.SUPER_ADMIN_PASSWORD || "");
  const token = String(process.env.SUPER_ADMIN_TOKEN || "").trim();
  if (!phone || !password || !token) return null;
  const now = new Date(0);
  return {
    id: ENV_SUPER_ADMIN_ID,
    name: String(process.env.SUPER_ADMIN_NAME || "超级管理员").trim() || "超级管理员",
    phone,
    role: "admin",
    avatar: "",
    token,
    createdAt: now,
    updatedAt: now,
    password,
  };
}

export function publicEnvSuperAdmin(user = getEnvSuperAdmin()) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name || "",
    phone: user.phone || "",
    role: "admin",
    avatar: user.avatar || "",
    token: user.token,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export function isEnvSuperAdminLogin(phone, password) {
  const admin = getEnvSuperAdmin();
  return Boolean(admin && phone === admin.phone && password === admin.password);
}

export function findEnvSuperAdminByToken(token) {
  const admin = getEnvSuperAdmin();
  return admin && token === admin.token ? publicEnvSuperAdmin(admin) : null;
}
