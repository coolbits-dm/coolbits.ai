import jwt from 'jsonwebtoken';
import { authConfig } from './config/auth.js';

function ensureSecret() {
  if (!authConfig.jwtSecret) {
    throw new Error('JWT secret not configured (COOLBITS_JWT_SECRET)');
  }
}

export function signUser(payload) {
  ensureSecret();
  return jwt.sign(
    { email: payload.email, plan: payload.plan },
    authConfig.jwtSecret,
    { expiresIn: authConfig.jwtExpiresIn || '30d' },
  );
}

export function verifyToken(token) {
  ensureSecret();
  try {
    return jwt.verify(token, authConfig.jwtSecret);
  } catch (err) {
    return null;
  }
}
