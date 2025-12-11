import { db } from '../db.js';
import { ga4Connections } from '../db/schema/ga4Connections.js';
import { eq, and } from 'drizzle-orm';

function workspaceSelector(workspaceId, userId) {
  const clauses = [eq(ga4Connections.workspaceId, workspaceId)];
  if (userId) {
    clauses.push(eq(ga4Connections.userId, userId));
  } else {
    clauses.push(eq(ga4Connections.userId, null));
  }
  return and(...clauses);
}

export async function getConnectionByWorkspace(workspaceId, userId) {
  if (!workspaceId) return null;
  const rows = await db
    .select()
    .from(ga4Connections)
    .where(workspaceSelector(workspaceId, userId))
    .limit(1);
  return rows[0] || null;
}

export async function upsertConnection({ workspaceId, userId, propertyId, refreshToken, status, connectedAt }) {
  const now = new Date();
  await db
    .insert(ga4Connections)
    .values({
      workspaceId,
      userId: userId || null,
      propertyId: propertyId || null,
      refreshToken,
      status,
      connectedAt: connectedAt || now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [ga4Connections.workspaceId, ga4Connections.userId],
      set: {
        propertyId: propertyId || null,
        refreshToken,
        status,
        connectedAt: connectedAt || now,
        updatedAt: now,
      },
    });
}

export async function markDisconnected({ workspaceId, userId }) {
  if (!workspaceId) return;
  const now = new Date();
  await db
    .update(ga4Connections)
    .set({
      status: 'disconnected',
      updatedAt: now,
    })
    .where(workspaceSelector(workspaceId, userId));
}

export async function updateProperty({ workspaceId, userId, propertyId }) {
  if (!workspaceId) return;
  const now = new Date();
  await db
    .update(ga4Connections)
    .set({
      propertyId: propertyId || null,
      updatedAt: now,
    })
    .where(workspaceSelector(workspaceId, userId));
}

export default {
  getConnectionByWorkspace,
  upsertConnection,
  markDisconnected,
  updateProperty,
};
