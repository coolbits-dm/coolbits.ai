const defaultSecret = process.env.COOLBITS_JWT_SECRET || 'dev-secret';
export const authConfig = {
  jwtSecret: defaultSecret,
  jwtExpiresIn: process.env.COOLBITS_JWT_TTL || '30d',
};
