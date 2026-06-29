import { prisma } from "./db.js";
import { findEnvSuperAdminByToken } from "./envSuperAdmin.js";

const API_KEY = process.env.API_KEY;

function readUserToken(req) {
  return String(
    req.headers["x-mobile-user-token"] ||
      req.headers["x-desktop-user-token"] ||
      req.query?.mobileToken ||
      "",
  ).trim();
}

export async function authMiddleware(req, res, next) {
  const userToken = readUserToken(req);
  if (userToken) {
    const envAdmin = findEnvSuperAdminByToken(userToken);
    if (envAdmin) {
      req.authUser = envAdmin;
      return next();
    }
    try {
      const user = await prisma.mobileUser.findUnique({ where: { token: userToken } });
      if (!user) return res.status(401).json({ error: "登录已失效，请重新登录" });
      if (user.tokenExpiresAt && new Date(user.tokenExpiresAt) < new Date()) {
        return res.status(401).json({ error: "登录已过期，请重新登录" });
      }
      req.authUser = user;
      return next();
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (!API_KEY) {
    const clientIp = req.ip || req.socket?.remoteAddress || "";
    const isLocalhost =
      clientIp === "127.0.0.1" ||
      clientIp === "::1" ||
      clientIp === "::ffff:127.0.0.1" ||
      clientIp === "localhost";
    if (isLocalhost) {
      return next();
    }
    console.warn(
      "API_KEY is not set — rejecting non-localhost request. Set API_KEY in .env for production.",
    );
    return res.status(401).json({ error: "Authentication required" });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }

  const token = authHeader.slice(7);
  if (token !== API_KEY) {
    return res.status(403).json({ error: "Invalid API key" });
  }

  next();
}
