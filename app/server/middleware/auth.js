import { verifyToken } from '../jwtService.js';

function extractToken(req) {
  const authHeader = req.headers.authorization || '';
  const bearer = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : '';
  if (bearer) return bearer;
  // fallback to cb_token cookie
  const cookieHeader = req.headers.cookie || '';
  const cookieMatch = cookieHeader.match(/cb_token=([^;]+)/);
  if (cookieMatch && cookieMatch[1]) return cookieMatch[1];
  if (req.cookies && req.cookies.cb_token) return req.cookies.cb_token;
  return '';
}

export function requireUserOptional(req, _res, next) {
  const token = extractToken(req);
  if (token) {
    const decoded = verifyToken(token);
    if (decoded?.email) {
      req.userEmail = decoded.email;
      req.userPlan = decoded.plan;
    }
  }
  return next();
}

export function requireUser(req, res, next) {
  const token = extractToken(req);
  const cookieHeader = req.headers.cookie || '';
  const cbCookie = (cookieHeader.match(/cb_token=([^;]+)/) || [])[1] || (req.cookies && req.cookies.cb_token);
  const authPreview = token ? `${token.slice(0, 10)}...` : null;
  const cookiePreview = cbCookie ? `${cbCookie.slice(0, 10)}...` : null;
  console.log('[REQUIRE_USER]', req.method, req.originalUrl, { auth: authPreview, cookie: cookiePreview });

  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const decoded = verifyToken(token);
  if (!decoded?.email) return res.status(401).json({ error: 'Unauthorized' });
  req.userEmail = decoded.email;
  req.userPlan = decoded.plan;
  return next();
}
