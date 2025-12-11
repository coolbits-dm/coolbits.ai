import { workspaceServiceRepo } from '../repos/workspaceServiceRepo.js';

// Base catalog for the integrations panel. Extend as new services go live.
const BASE_SERVICE_CATALOG = [
  {
    code: 'GOOGLE_ADS',
    name: 'Google Ads',
    status: 'disconnected',
    connectedAs: null,
  },
];

export async function buildIntegrationSummary(workspaceId) {
  const dbServicesByCode = await workspaceServiceRepo.getByWorkspace(workspaceId);

  const services = BASE_SERVICE_CATALOG.map((svc) => {
    const dbRow = dbServicesByCode.get(svc.code);

    if (dbRow) {
      return {
        ...svc,
        status: dbRow.status,
        connectedAs: dbRow.connectedAs,
      };
    }

    return {
      ...svc,
      status: 'disconnected',
      connectedAs: null,
    };
  });

  // Include any services present in DB that aren't yet in the base catalog.
  for (const [code, row] of dbServicesByCode.entries()) {
    if (!services.find((svc) => svc.code === code)) {
      services.push({
        code,
        status: row.status,
        connectedAs: row.connectedAs ?? null,
      });
    }
  }

  return { services };
}

export default { buildIntegrationSummary };
