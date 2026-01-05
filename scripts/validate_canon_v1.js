import fs from 'node:fs';
import path from 'node:path';
import { loadCanon } from '../app/shared/canon/loadCanon.js';

const ROOT = process.cwd();
const COUNCIL_IDS = ['ceo', 'cmo', 'cfo', 'coo', 'cto'];
const REQUIRED_WORKSPACES = ['P', 'B', 'A', 'D'];

const errors = [];
const warn = (msg) => errors.push(msg);

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function assertListEqual(actual, expected, label) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    warn(`${label}: expected ${b}, got ${a}`);
  }
}

function validateCanonFiles() {
  const { canon, models, version } = loadCanon();

  if (version !== '1.0.0') {
    warn(`canon_version_invalid:${version}`);
  }

  const workspaceKeys = Object.keys(canon.workspaces || {});
  assertListEqual(workspaceKeys.sort(), REQUIRED_WORKSPACES.slice().sort(), 'workspaces_keys');

  REQUIRED_WORKSPACES.forEach((key) => {
    const ws = canon.workspaces?.[key];
    if (!ws) {
      warn(`workspace_missing:${key}`);
      return;
    }
    if (!Array.isArray(ws.roles) || ws.roles.length !== 5) {
      warn(`workspace_roles_invalid:${key}`);
    }
  });

  assertListEqual(canon.groups?.council || [], COUNCIL_IDS, 'council_group');
  assertListEqual(canon.workspaces?.B?.roles || [], COUNCIL_IDS, 'council_workspace_roles');

  const roles = Array.isArray(canon.roles) ? canon.roles : [];
  if (roles.length !== 20) {
    warn(`roles_count_invalid:${roles.length}`);
  }
  const roleIds = new Set(roles.map((role) => role.id));
  if (roleIds.size !== roles.length) {
    warn('roles_ids_not_unique');
  }

  const workspaceRoleIds = new Set();
  REQUIRED_WORKSPACES.forEach((key) => {
    (canon.workspaces?.[key]?.roles || []).forEach((roleId) => workspaceRoleIds.add(roleId));
  });
  if (workspaceRoleIds.size !== 20) {
    warn(`workspace_role_count_invalid:${workspaceRoleIds.size}`);
  }
  workspaceRoleIds.forEach((roleId) => {
    if (!roleIds.has(roleId)) {
      warn(`role_missing_in_roles:${roleId}`);
    }
  });

  roles.forEach((role) => {
    const required = ['id', 'workspaceId', 'label', 'subtitle', 'description', 'connectors', 'capabilities'];
    required.forEach((field) => {
      if (role?.[field] === undefined) {
        warn(`role_field_missing:${role?.id || 'unknown'}:${field}`);
      }
    });
    if (!REQUIRED_WORKSPACES.includes(role.workspaceId)) {
      warn(`role_workspace_invalid:${role.id}:${role.workspaceId}`);
    }
  });

  const routing = canon.routingPolicy || {};
  roleIds.forEach((roleId) => {
    const policy = routing[roleId];
    if (!policy) {
      warn(`routing_policy_missing:${roleId}`);
      return;
    }
    if (typeof policy.primaryModelId !== 'string') {
      warn(`routing_primary_model_missing:${roleId}`);
    }
    if (!Array.isArray(policy.allowedProviders) || !policy.allowedProviders.length) {
      warn(`routing_allowed_providers_missing:${roleId}`);
    }
    if (!['fast', 'balanced', 'deep'].includes(policy.latencyTier)) {
      warn(`routing_latency_invalid:${roleId}`);
    }
    if (typeof policy.providerOverride !== 'boolean') {
      warn(`routing_provider_override_missing:${roleId}`);
    }
  });

  const modelList = Array.isArray(models.models) ? models.models : [];
  if (!modelList.length) {
    warn('models_list_empty');
  }
  const modelIds = new Set(modelList.map((m) => m.modelId));
  if (modelIds.size !== modelList.length) {
    warn('model_ids_not_unique');
  }
  const providers = new Set(modelList.map((m) => m.provider));
  if (!providers.has('vertex')) {
    warn('models_provider_vertex_missing');
  }
  if (!providers.has('openai')) {
    warn('models_provider_openai_missing');
  }

  roleIds.forEach((roleId) => {
    const policy = routing[roleId];
    if (!policy) return;
    if (!modelIds.has(policy.primaryModelId)) {
      warn(`routing_model_missing:${roleId}:${policy.primaryModelId}`);
    }
    (policy.fallbackModelIds || []).forEach((modelId) => {
      if (!modelIds.has(modelId)) {
        warn(`routing_fallback_model_missing:${roleId}:${modelId}`);
      }
    });
  });

  const industries = Array.isArray(canon.industries) ? canon.industries : [];
  if (industries.length < 10) {
    warn(`industries_count_invalid:${industries.length}`);
  }
  const industryIds = new Set();
  industries.forEach((industry) => {
    if (!industry?.id) {
      warn('industry_id_missing');
      return;
    }
    industryIds.add(industry.id);
    if (!industry.label) {
      warn(`industry_label_missing:${industry.id}`);
    }
    if (!industry.description) {
      warn(`industry_description_missing:${industry.id}`);
    }
    if (!industry.recommendedRoles || typeof industry.recommendedRoles !== 'object') {
      warn(`industry_roles_missing:${industry.id}`);
    } else {
      REQUIRED_WORKSPACES.forEach((key) => {
        const list = industry.recommendedRoles[key];
        if (!Array.isArray(list)) {
          warn(`industry_roles_workspace_missing:${industry.id}:${key}`);
        } else {
          list.forEach((roleId) => {
            if (!roleIds.has(roleId)) {
              warn(`industry_role_invalid:${industry.id}:${roleId}`);
            }
          });
        }
      });
    }
    if (!Array.isArray(industry.connectorPriority)) {
      warn(`industry_connector_priority_missing:${industry.id}`);
    }
  });
  if (!canon.defaultIndustryId) {
    warn('default_industry_missing');
  } else if (!industryIds.has(canon.defaultIndustryId)) {
    warn(`default_industry_invalid:${canon.defaultIndustryId}`);
  }
}

function validateCbAgentsConfig() {
  const configPath = path.join(ROOT, 'app', 'server', 'config', 'cbAgents.config.json');
  const config = readJson(configPath);
  const keys = new Set(Object.keys(config || {}));
  const { canon } = loadCanon();
  const roleIds = Array.isArray(canon.roles) ? canon.roles.map((role) => role.id) : [];
  const missing = roleIds.filter((id) => !keys.has(id));

  if (missing.length) {
    warn(`cbAgents_config_missing_roles:${missing.join(',')}`);
  }
}

function validateNoHardcodedCouncilIds() {
  const files = [
    path.join(ROOT, 'app', 'server', 'config', 'council.js'),
    path.join(ROOT, 'app', 'server', 'utils', 'councilUtils.js'),
  ];
  const pattern = new RegExp(`\\b(${COUNCIL_IDS.join('|')})\\b`, 'i');

  files.forEach((filePath) => {
    const content = fs.readFileSync(filePath, 'utf8');
    if (pattern.test(content)) {
      warn(`hardcoded_council_ids_found:${filePath}`);
    }
  });
}

function main() {
  try {
    validateCanonFiles();
    validateCbAgentsConfig();
    validateNoHardcodedCouncilIds();
  } catch (err) {
    warn(`validator_exception:${err?.message || err}`);
  }

  if (errors.length) {
    console.error('CANON_VALIDATE_FAILED');
    errors.forEach((err) => console.error(err));
    process.exit(1);
  }

  console.log('CANON_VALIDATE_OK');
}

main();
