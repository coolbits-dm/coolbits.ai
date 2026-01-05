import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const CANON_PATH = path.resolve(process.cwd(), 'app', 'shared', 'canon', 'canon.v1.json');
const MODELS_PATH = path.resolve(process.cwd(), 'app', 'shared', 'canon', 'models.v1.json');

const REQUIRED_VERSION = '1.0.0';
const REQUIRED_WORKSPACES = ['P', 'B', 'A', 'D'];
const REQUIRED_COUNCIL = ['ceo', 'cmo', 'cfo', 'coo', 'cto'];

let cached = null;

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function sortKeys(value) {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  const out = {};
  Object.keys(value)
    .sort()
    .forEach((key) => {
      out[key] = sortKeys(value[key]);
    });
  return out;
}

function stableStringify(value) {
  return JSON.stringify(sortKeys(value));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function validateCanon(canon, models) {
  assert(canon && typeof canon === 'object', 'canon_missing');
  assert(canon.version === REQUIRED_VERSION, `canon_version_invalid:${canon.version}`);
  assert(models && typeof models === 'object', 'models_missing');
  assert(models.version === REQUIRED_VERSION, `models_version_invalid:${models.version}`);

  const workspaces = canon.workspaces || {};
  const workspaceKeys = Object.keys(workspaces);
  REQUIRED_WORKSPACES.forEach((key) => {
    const ws = workspaces[key];
    assert(ws, `workspace_missing:${key}`);
    assert(ws.id === key, `workspace_id_invalid:${key}`);
    assert(Array.isArray(ws.roles) && ws.roles.length === 5, `workspace_roles_invalid:${key}`);
  });
  assert(workspaceKeys.length === REQUIRED_WORKSPACES.length, 'workspace_key_count_invalid');

  const council = canon.groups?.council;
  assert(Array.isArray(council), 'council_missing');
  assert(
    JSON.stringify(council) === JSON.stringify(REQUIRED_COUNCIL),
    'council_mismatch',
  );
  assert(
    JSON.stringify(workspaces.B?.roles || []) === JSON.stringify(REQUIRED_COUNCIL),
    'workspace_council_mismatch',
  );

  const roles = Array.isArray(canon.roles) ? canon.roles : [];
  assert(roles.length === 20, 'roles_count_invalid');

  const roleIds = new Set();
  roles.forEach((role) => {
    assert(role && typeof role === 'object', 'role_invalid');
    const requiredFields = ['id', 'workspaceId', 'label', 'subtitle', 'description', 'connectors', 'capabilities'];
    requiredFields.forEach((field) => {
      assert(role[field] !== undefined, `role_field_missing:${role.id || 'unknown'}:${field}`);
    });
    assert(typeof role.id === 'string' && role.id, 'role_id_missing');
    assert(typeof role.workspaceId === 'string', `role_workspace_missing:${role.id}`);
    assert(typeof role.label === 'string', `role_label_missing:${role.id}`);
    assert(typeof role.subtitle === 'string', `role_subtitle_missing:${role.id}`);
    assert(typeof role.description === 'string', `role_description_missing:${role.id}`);
    assert(Array.isArray(role.connectors), `role_connectors_missing:${role.id}`);
    assert(Array.isArray(role.capabilities), `role_capabilities_missing:${role.id}`);
    roleIds.add(role.id);
  });
  assert(roleIds.size === roles.length, 'role_id_unique_invalid');

  const workspaceRoleIds = new Set();
  REQUIRED_WORKSPACES.forEach((key) => {
    workspaces[key].roles.forEach((roleId) => workspaceRoleIds.add(roleId));
  });
  assert(workspaceRoleIds.size === 20, 'workspace_role_count_invalid');
  workspaceRoleIds.forEach((roleId) => {
    assert(roleIds.has(roleId), `role_missing_in_roles:${roleId}`);
  });

  const rolesById = new Map(roles.map((role) => [role.id, role]));
  rolesById.forEach((role) => {
    const ws = workspaces[role.workspaceId];
    assert(ws, `role_workspace_invalid:${role.id}`);
    assert(ws.roles.includes(role.id), `role_workspace_mismatch:${role.id}`);
  });

  const routingPolicy = canon.routingPolicy || {};
  roleIds.forEach((roleId) => {
    const policy = routingPolicy[roleId];
    assert(policy && typeof policy === 'object', `routing_policy_missing:${roleId}`);
    assert(typeof policy.primaryModelId === 'string', `routing_primary_model_missing:${roleId}`);
    assert(Array.isArray(policy.allowedProviders), `routing_allowed_providers_missing:${roleId}`);
    assert(policy.allowedProviders.length > 0, `routing_allowed_providers_empty:${roleId}`);
    assert(['fast', 'balanced', 'deep'].includes(policy.latencyTier), `routing_latency_invalid:${roleId}`);
    assert(typeof policy.providerOverride === 'boolean', `routing_provider_override_missing:${roleId}`);
    if (policy.fallbackModelIds !== undefined) {
      assert(Array.isArray(policy.fallbackModelIds), `routing_fallback_invalid:${roleId}`);
    }
    if (policy.promptId !== undefined) {
      assert(typeof policy.promptId === 'string', `routing_prompt_invalid:${roleId}`);
    }
  });

  const modelList = Array.isArray(models.models) ? models.models : [];
  assert(modelList.length > 0, 'models_list_empty');
  const modelIds = new Set();
  const providerSet = new Set();
  modelList.forEach((model) => {
    assert(model && typeof model === 'object', 'model_invalid');
    assert(typeof model.modelId === 'string', 'model_id_missing');
    assert(typeof model.provider === 'string', `model_provider_missing:${model.modelId}`);
    assert(typeof model.providerModel === 'string', `model_provider_model_missing:${model.modelId}`);
    modelIds.add(model.modelId);
    providerSet.add(model.provider);
  });
  assert(modelIds.size === modelList.length, 'model_id_unique_invalid');
  assert(providerSet.has('vertex'), 'models_provider_vertex_missing');
  assert(providerSet.has('openai'), 'models_provider_openai_missing');

  roleIds.forEach((roleId) => {
    const policy = routingPolicy[roleId];
    assert(modelIds.has(policy.primaryModelId), `routing_model_missing:${roleId}:${policy.primaryModelId}`);
    (policy.fallbackModelIds || []).forEach((modelId) => {
      assert(modelIds.has(modelId), `routing_fallback_model_missing:${roleId}:${modelId}`);
    });
  });

  const industries = Array.isArray(canon.industries) ? canon.industries : [];
  assert(industries.length >= 10, 'industries_missing');
  const industryIds = new Set();
  industries.forEach((industry) => {
    assert(industry && typeof industry === 'object', 'industry_invalid');
    assert(typeof industry.id === 'string', 'industry_id_missing');
    assert(typeof industry.label === 'string', `industry_label_missing:${industry.id}`);
    assert(typeof industry.description === 'string', `industry_description_missing:${industry.id}`);
    assert(industry.recommendedRoles && typeof industry.recommendedRoles === 'object', `industry_roles_missing:${industry.id}`);
    REQUIRED_WORKSPACES.forEach((key) => {
      const list = industry.recommendedRoles[key];
      assert(Array.isArray(list), `industry_roles_workspace_missing:${industry.id}:${key}`);
      list.forEach((roleId) => {
        assert(roleIds.has(roleId), `industry_role_invalid:${industry.id}:${roleId}`);
      });
    });
    assert(Array.isArray(industry.connectorPriority), `industry_connector_priority_missing:${industry.id}`);
    industryIds.add(industry.id);
  });
  assert(typeof canon.defaultIndustryId === 'string', 'default_industry_missing');
  assert(industryIds.has(canon.defaultIndustryId), 'default_industry_invalid');
}

export function loadCanon() {
  if (cached) return cached;
  const canon = readJson(CANON_PATH);
  const models = readJson(MODELS_PATH);
  validateCanon(canon, models);
  const canonHash = crypto
    .createHash('sha256')
    .update(stableStringify({ canon, models }))
    .digest('hex');
  cached = {
    canon,
    models,
    canonHash,
    version: canon.version,
  };
  return cached;
}

export default loadCanon;
