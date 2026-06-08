// Simple API key middleware for basic access control
// Set API_KEY in .env to enable; if unset, all requests are allowed

const API_KEY = process.env.API_KEY;

export function authMiddleware(req, res, next) {
  // If no API_KEY configured, allow all requests (development-friendly)
  if (!API_KEY) {
    return next();
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
