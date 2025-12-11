const DEFAULT_LOCATION = 'us-central1';
const DEFAULT_MODEL = 'text-bison';

export function getVertexConfig() {
  return {
    projectId: process.env.VERTEX_PROJECT_ID || '',
    location: process.env.VERTEX_LOCATION || DEFAULT_LOCATION,
    model: process.env.VERTEX_MODEL || process.env.VERTEX_MODEL_ID || DEFAULT_MODEL,
    endpoint: process.env.VERTEX_ENDPOINT || '',
  };
}

export function isRealVertexEnabled() {
  return String(process.env.USE_REAL_VERTEX || '').toLowerCase() === 'true';
}
