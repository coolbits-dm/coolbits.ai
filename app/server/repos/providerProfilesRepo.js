import { query } from '../db.js';

export async function upsertProviderProfile(profile = {}) {
  const {
    workspaceId,
    name,
    provider,
    defaultModel,
    allowWeb = false,
    allowedTools = [],
    allowedScopes = [],
    responseFormat = {},
    refusalPolicy = {},
    limits = {},
    safetyProfileVer = 'v1',
    promptEnvelopeVer = 'v1',
    isEnabled = true,
  } = profile;

  if (!workspaceId || !name || !provider || !defaultModel) {
    throw new Error('invalid_provider_profile');
  }

  await query(
    `
    INSERT INTO provider_profiles (
      workspace_id,
      name,
      provider,
      default_model,
      allow_web,
      allowed_tools,
      allowed_scopes,
      response_format,
      refusal_policy,
      limits,
      safety_profile_ver,
      prompt_envelope_ver,
      is_enabled
    ) VALUES (
      $1,$2,$3,$4,$5,
      $6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,
      $11,$12,$13
    )
    ON CONFLICT (workspace_id, name) DO UPDATE SET
      provider = EXCLUDED.provider,
      default_model = EXCLUDED.default_model,
      allow_web = EXCLUDED.allow_web,
      allowed_tools = EXCLUDED.allowed_tools,
      allowed_scopes = EXCLUDED.allowed_scopes,
      response_format = EXCLUDED.response_format,
      refusal_policy = EXCLUDED.refusal_policy,
      limits = EXCLUDED.limits,
      safety_profile_ver = EXCLUDED.safety_profile_ver,
      prompt_envelope_ver = EXCLUDED.prompt_envelope_ver,
      is_enabled = EXCLUDED.is_enabled,
      updated_at = NOW()
    `,
    [
      workspaceId,
      name,
      provider,
      defaultModel,
      allowWeb,
      JSON.stringify(allowedTools),
      JSON.stringify(allowedScopes),
      JSON.stringify(responseFormat),
      JSON.stringify(refusalPolicy),
      JSON.stringify(limits),
      safetyProfileVer,
      promptEnvelopeVer,
      isEnabled,
    ],
  );
}

export async function getProviderProfile(workspaceId, name) {
  if (!workspaceId || !name) return null;
  const { rows } = await query(
    `
    SELECT *
    FROM provider_profiles
    WHERE workspace_id = $1 AND name = $2
    LIMIT 1
    `,
    [workspaceId, name],
  );
  return rows[0] || null;
}

export async function listProviderProfiles(workspaceId) {
  if (!workspaceId) return [];
  const { rows } = await query(
    `
    SELECT *
    FROM provider_profiles
    WHERE workspace_id = $1
    ORDER BY name ASC
    `,
    [workspaceId],
  );
  return rows;
}

export default {
  upsertProviderProfile,
  getProviderProfile,
  listProviderProfiles,
};
