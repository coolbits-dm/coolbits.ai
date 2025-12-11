const required = (name) => process.env[name] || '';

const GOOGLE_CLIENT_ID = required('COOLBITS_GOOGLE_CLIENT_ID');
const GOOGLE_CLIENT_SECRET = required('COOLBITS_GOOGLE_CLIENT_SECRET');
const GOOGLE_REDIRECT_URI =
  process.env.COOLBITS_GOOGLE_REDIRECT_URI ||
  'https://coolbits.ai/api/auth/google/callback';

export {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI,
};
