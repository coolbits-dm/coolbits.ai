import { db } from '../db.js';
import { googleAdsConnections } from '../db/schema/googleAdsConnections.js';
import { eq, and } from 'drizzle-orm';

function workspaceSelector(workspaceId, userId) {
  const clauses = [eq(googleAdsConnections.workspaceId, workspaceId)];
  if (userId) {
    clauses.push(eq(googleAdsConnections.userId, userId));
  } else {
    clauses.push(eq(googleAdsConnections.userId, null));
  }
  return and(...clauses);
}

export async function getConnectionByWorkspace(workspaceId, userId) {
  if (!workspaceId) return null;
  const rows = await db
    .select()
    .from(googleAdsConnections)
    .where(workspaceSelector(workspaceId, userId))
    .limit(1);
  return rows[0] || null;
}

export async function upsertConnection({ workspaceId, userId, customerId, refreshToken, status, connectedAt, loginCustomerId }) {
  const now = new Date();
  const updateSet = {
    customerId: customerId || null,
    refreshToken,
    status,
    connectedAt: connectedAt || now,
    updatedAt: now,
  };
  if (loginCustomerId !== undefined) {
    updateSet.loginCustomerId = loginCustomerId || null;
  }

  await db
    .insert(googleAdsConnections)
    .values({
      workspaceId,
      userId: userId || null,
      customerId: customerId || null,
      loginCustomerId: loginCustomerId || null,
      refreshToken,
      status,
      connectedAt: connectedAt || now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [googleAdsConnections.workspaceId, googleAdsConnections.userId],
      set: updateSet,
    });
}

export async function markDisconnected({ workspaceId, userId }) {
  if (!workspaceId) return;
  const now = new Date();
  await db
    .update(googleAdsConnections)
    .set({
      status: 'disconnected',
      updatedAt: now,
    })
    .where(workspaceSelector(workspaceId, userId));
}

export async function updateCustomerId({ workspaceId, userId, customerId, loginCustomerId }) {
  if (!workspaceId) return;
  const now = new Date();
  await db
    .update(googleAdsConnections)
    .set({
      customerId: customerId || null,
      loginCustomerId: loginCustomerId || null,
      updatedAt: now,
    })
    .where(workspaceSelector(workspaceId, userId));
}

export default {
  getConnectionByWorkspace,
  upsertConnection,
  markDisconnected,
  updateCustomerId,
};
