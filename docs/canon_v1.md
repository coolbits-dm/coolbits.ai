# Canon v1.0.0

## Files
- `app/shared/canon/canon.v1.json`
- `app/shared/canon/models.v1.json`

## Canon schema
- `version` string
- `workspaces` map keyed by `P|B|A|D` with `{ id, label, roles[] }`
- `groups.council` array of role ids
- `roles[]` objects: `{ id, workspaceId, label, subtitle, description, connectors[], capabilities[] }`
- `routingPolicy` map keyed by role id with `{ primaryModelId, fallbackModelIds[], allowedProviders[], latencyTier, providerOverride, promptId? }`
- `industries[]` objects: `{ id, label, description, recommendedRoles{P,B,A,D}, connectorPriority[] }`
- `defaultIndustryId` string

## Models registry schema
- `version` string
- `models[]` objects: `{ modelId, provider, providerModel }`

## Invariants (validated in load + script)
- version is `1.0.0`
- workspaces keys are exactly `P,B,A,D`
- each workspace has exactly 5 roles
- total unique role ids = 20
- `groups.council` equals `workspaces.B.roles` and is ordered `ceo,cmo,cfo,coo,cto`
- every workspace role id exists in `roles[]`
- every role has required fields and valid `workspaceId`
- `routingPolicy` exists for every role id
- every referenced model id exists in `models.v1.json`
- models providers include `vertex` and `openai`
- `defaultIndustryId` exists in `industries[]`
- `cbAgents.config.json` contains entries for all 20 role ids
- `council.js` and `councilUtils.js` contain no hardcoded council id lists

## Flow
- UI loads `/api/canon` and renders council/workspaces/roles from canon data
- Chat routing resolves role id -> routingPolicy -> modelId -> provider/providerModel
- Any mismatch or missing mapping returns a hard error (no silent fallback)
- Responses include `meta.resolved.provider`, `meta.resolved.model`, `meta.canonHash`
