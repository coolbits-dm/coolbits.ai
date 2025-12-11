// Drizzle-backed repository for workspace_services.
import { db } from '../db.js';
import { workspaceServices } from '../db/schema/workspaceServices.js';
import { eq } from 'drizzle-orm';

async function upsert({ workspaceId, serviceCode, status, connectedAs, updatedBy }) {
  const now = new Date();

  // Idempotent upsert on (workspace_id, service_code)
  await db
    .insert(workspaceServices)
    .values({
      workspaceId,
      serviceCode,
      status,
      connectedAs: connectedAs ?? null,
      updatedBy: updatedBy ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [workspaceServices.workspaceId, workspaceServices.serviceCode],
      set: {
        status,
        connectedAs: connectedAs ?? null,
        updatedBy: updatedBy ?? null,
        updatedAt: now,
      },
    });
}

/**
 * Optional helper for the integrations summary:
 * get all services for a workspace, keyed by service_code.
 */
async function getByWorkspace(workspaceId) {
  const rows = await db
    .select()
    .from(workspaceServices)
    .where(eq(workspaceServices.workspaceId, workspaceId));

  // Map by service_code for quick lookups in the summary builder
  const byCode = new Map();
  for (const row of rows) {
    byCode.set(row.serviceCode, row);
  }
  return byCode;
}

export const workspaceServiceRepo = {
  upsert,
  getByWorkspace,
};

export default workspaceServiceRepo;
