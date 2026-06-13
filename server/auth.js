// Simple API key middleware for basic access control
// Set API_KEY in .env to enable; if unset, all requests are allowed

const API_KEY = process.env.API_KEY;

export function authMiddleware(req, res, next) {
  const hasMobileUserToken = Boolean(req.headers['x-mobile-user-token']);
  const isMobileCustomerRead = req.baseUrl === '/api/customers'
    && req.method === 'GET'
    && (req.path === '/' || req.path === '');
  const isMobileOrderStatusUpdate = req.baseUrl === '/api/customers'
    && req.method === 'PATCH'
    && /^\/[^/]+\/orders\/[^/]+\/status$/.test(req.path);
  const isMobileCostEntryCreate = req.baseUrl === '/api/customers'
    && req.method === 'POST'
    && /^\/[^/]+\/cost-entries$/.test(req.path);
  const isMobileDeliverySign = req.baseUrl === '/api/customers'
    && req.method === 'PATCH'
    && /^\/[^/]+\/deliveries\/[^/]+\/sign$/.test(req.path);
  const isMobileCostEntryApproval = req.baseUrl === '/api/customers'
    && req.method === 'PATCH'
    && /^\/[^/]+\/cost-entries\/[^/]+\/approval$/.test(req.path);

  if (hasMobileUserToken && (
    isMobileCustomerRead
    || isMobileOrderStatusUpdate
    || isMobileCostEntryCreate
    || isMobileDeliverySign
    || isMobileCostEntryApproval
  )) {
    return next();
  }

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
