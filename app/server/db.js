import pkg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';

const { Pool } = pkg;

const connectionString = process.env.COOLBITS_DATABASE_URL;

if (!connectionString) {
  console.error('[DB] COOLBITS_DATABASE_URL is not set.');
  throw new Error('COOLBITS_DATABASE_URL missing');
}

const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false,
  },
});

export const db = drizzle(pool);

export async function query(text, params) {
  try {
    return await pool.query(text, params);
  } catch (err) {
    console.error('[DB] query error', err);
    throw err;
  }
}

export async function getClient() {
  try {
    return await pool.connect();
  } catch (err) {
    console.error('[DB] getClient error', err);
    throw err;
  }
}

export default { query, getClient, db };
