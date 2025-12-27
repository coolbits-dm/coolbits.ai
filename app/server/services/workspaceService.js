import {
  listWorkspacesByOwner,
  listSystemWorkspaces,
  insertWorkspace,
  getWorkspaceById,
  countCustomWorkspaces,
  updateWorkspaceName,
  deleteWorkspace,
} from '../repositories/workspacesRepo.js';
import {
  getSystemWorkspaceDefinitions,
  getCustomWorkspaceCap,
  isReservedWorkspaceSlug,
  isReservedWorkspaceId,
  buildCustomWorkspaceId,
  orderSystemWorkspaces,
} from '../config/workspaceConfig.js';

function buildWorkspaceError(code, message, status = 400) {
  const err = new Error(message || code);
  err.code = code;
  err.status = status;
  return err;
}

function normalizeOwnerId(ownerId) {
  const trimmed = String(ownerId || '').trim();
  if (!trimmed) {
    throw buildWorkspaceError('owner_required', 'Owner is required.', 400);
  }
  return trimmed;
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

function ensureName(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    throw buildWorkspaceError('workspace_name_required', 'Workspace name is required.', 400);
  }
  return trimmed.slice(0, 120);
}

async function ensureSlugAvailable(ownerId, baseSlug) {
  let slug = baseSlug;
  if (!slug) {
    slug = `workspace-${Math.random().toString(36).slice(2, 7)}`;
  }
  if (isReservedWorkspaceSlug(slug) || isReservedWorkspaceId(slug)) {
    throw buildWorkspaceError('workspace_slug_reserved', 'Workspace slug is reserved.', 400);
  }
  const existing = await listWorkspacesByOwner(ownerId);
  const used = new Set(existing.map((row) => row.slug));
  if (!used.has(slug)) return slug;
  let idx = 2;
  let candidate = `${slug}-${idx}`;
  while (used.has(candidate)) {
    idx += 1;
    candidate = `${slug}-${idx}`;
  }
  return candidate;
}

export async function ensureSystemWorkspaces({ ownerId, createdBy = null } = {}) {
  const normalizedOwner = normalizeOwnerId(ownerId);
  const definitions = getSystemWorkspaceDefinitions();
  const existing = await listSystemWorkspaces(normalizedOwner);
  const existingKinds = new Set(existing.map((row) => row.systemKind));
  const created = [];

  for (const def of definitions) {
    if (existingKinds.has(def.systemKind)) continue;
    const inserted = await insertWorkspace({
      ownerId: normalizedOwner,
      id: def.id,
      workspaceType: 'system',
      systemKind: def.systemKind,
      slug: def.slug,
      name: def.name,
      isDeletable: false,
      createdBy,
    });
    if (inserted) created.push(inserted);
  }

  return { created, existing };
}

export async function assertWorkspaceAccess({ ownerId, workspaceId }) {
  const normalizedOwner = normalizeOwnerId(ownerId);
  const trimmedWorkspace = String(workspaceId || '').trim().toLowerCase();
  if (!trimmedWorkspace) {
    throw buildWorkspaceError('workspace_required', 'workspaceId is required.', 400);
  }
  await ensureSystemWorkspaces({ ownerId: normalizedOwner, createdBy: normalizedOwner });
  let workspace = await getWorkspaceById(normalizedOwner, trimmedWorkspace);
  if (!workspace && (trimmedWorkspace === 'dev' || trimmedWorkspace === 'developer')) {
    const systems = await listSystemWorkspaces(normalizedOwner);
    workspace = systems.find((row) => row.systemKind === 'dev') || null;
  }
  if (!workspace) {
    throw buildWorkspaceError('workspace_mismatch', 'Workspace does not belong to this user.', 403);
  }
  return workspace;
}

export async function listWorkspaces({ ownerId }) {
  const normalizedOwner = normalizeOwnerId(ownerId);
  await ensureSystemWorkspaces({ ownerId: normalizedOwner, createdBy: normalizedOwner });
  const rows = await listWorkspacesByOwner(normalizedOwner);
  const system = rows.filter((row) => row.workspaceType === 'system');
  const custom = rows.filter((row) => row.workspaceType !== 'system');
  const orderedSystem = orderSystemWorkspaces(system);
  const orderedCustom = custom.slice().sort((a, b) => {
    const aTime = new Date(a.createdAt || 0).getTime();
    const bTime = new Date(b.createdAt || 0).getTime();
    return aTime - bTime;
  });
  return [...orderedSystem, ...orderedCustom];
}

export async function createCustomWorkspace({ ownerId, createdBy, name }) {
  const normalizedOwner = normalizeOwnerId(ownerId);
  const safeName = ensureName(name);
  const cap = getCustomWorkspaceCap(createdBy?.planId || createdBy?.plan_id || 'starter');
  const current = await countCustomWorkspaces(normalizedOwner);
  if (current >= cap) {
    throw buildWorkspaceError('workspace_limit_reached', 'Workspace limit reached for your plan.', 403);
  }

  const baseSlug = slugify(safeName);
  const slug = await ensureSlugAvailable(normalizedOwner, baseSlug);
  const id = buildCustomWorkspaceId();

  const created = await insertWorkspace({
    ownerId: normalizedOwner,
    id,
    workspaceType: 'custom',
    systemKind: null,
    slug,
    name: safeName,
    isDeletable: true,
    createdBy: createdBy?.id || createdBy?.email || null,
  });

  if (!created) {
    throw buildWorkspaceError('workspace_create_failed', 'Unable to create workspace.', 500);
  }

  return created;
}

export async function renameWorkspace({ ownerId, id, name }) {
  const normalizedOwner = normalizeOwnerId(ownerId);
  const safeName = ensureName(name);
  const workspace = await getWorkspaceById(normalizedOwner, id);
  if (!workspace) {
    throw buildWorkspaceError('workspace_not_found', 'Workspace not found.', 404);
  }
  const updated = await updateWorkspaceName(normalizedOwner, id, safeName);
  if (!updated) {
    throw buildWorkspaceError('workspace_update_failed', 'Unable to update workspace.', 500);
  }
  return updated;
}

export async function deleteWorkspaceById({ ownerId, id }) {
  const normalizedOwner = normalizeOwnerId(ownerId);
  const workspace = await getWorkspaceById(normalizedOwner, id);
  if (!workspace) {
    throw buildWorkspaceError('workspace_not_found', 'Workspace not found.', 404);
  }
  if (!workspace.isDeletable || workspace.workspaceType === 'system') {
    throw buildWorkspaceError('workspace_not_deletable', 'System workspaces cannot be deleted.', 403);
  }
  const deleted = await deleteWorkspace(normalizedOwner, id);
  if (!deleted) {
    throw buildWorkspaceError('workspace_delete_failed', 'Unable to delete workspace.', 500);
  }
  return { ok: true };
}

export default {
  ensureSystemWorkspaces,
  assertWorkspaceAccess,
  listWorkspaces,
  createCustomWorkspace,
  renameWorkspace,
  deleteWorkspaceById,
};
