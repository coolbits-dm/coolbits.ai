const dotenv = require('dotenv');
const path = require('path');

// încarcă .env din /opt/coolbits.ai/.env
const envPath = path.join(__dirname, '.env');
const parsedEnv = dotenv.config({ path: envPath }).parsed || {};

const sharedEnv = {
  NODE_ENV: 'production',
  ...parsedEnv,
  VERTEX_MODEL_ID: parsedEnv?.VERTEX_MODEL_ID || 'gemini-2.5-flash-lite',
  COOLBITS_GOOGLE_CLIENT_ID:
    parsedEnv?.COOLBITS_GOOGLE_CLIENT_ID || 'REPLACE_ME_GOOGLE_CLIENT_ID',
  COOLBITS_GOOGLE_CLIENT_SECRET:
    parsedEnv?.COOLBITS_GOOGLE_CLIENT_SECRET || 'REPLACE_ME_GOOGLE_CLIENT_SECRET',
};

module.exports = {
  apps: [
    {
      name: 'coolbits',
      script: 'app/server/server.js',
      cwd: '/opt/coolbits.ai',
      env: { ...sharedEnv },
      env_production: { ...sharedEnv },
      watch: false,
    },
  ],
};
