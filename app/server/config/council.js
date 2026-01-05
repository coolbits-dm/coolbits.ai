import { loadCanon } from '../../shared/canon/loadCanon.js';

const WORKSPACE_ALIASES = {
  business: 'B',
  agency: 'A',
  developer: 'D',
  dev: 'D',
  personal: 'P',
};

function resolveWorkspaceKey(input) {
  const raw = String(input || '').trim();
  if (!raw) return 'B';
  const lower = raw.toLowerCase();
  if (WORKSPACE_ALIASES[lower]) return WORKSPACE_ALIASES[lower];
  const upper = raw.toUpperCase();
  if (['P', 'B', 'A', 'D'].includes(upper)) return upper;
  return 'B';
}

function buildCouncilDefs() {
  const { canon } = loadCanon();
  const rolesById = new Map((canon.roles || []).map((role) => [role.id, role]));

  const buildRoles = (roleIds) =>
    roleIds.map((roleId) => {
      const role = rolesById.get(roleId) || {};
      return {
        id: roleId,
        label: role.label || roleId,
        domain: role.subtitle || '',
        description: role.description || '',
      };
    });

  const buildWorkspace = (workspaceKey) => {
    const ws = canon.workspaces[workspaceKey];
    return {
      id: ws.id,
      label: ws.label,
      baseIntro: `You are part of the ${ws.label} council.`,
      roles: buildRoles(ws.roles),
    };
  };

  return {
    business: buildWorkspace('B'),
    agency: buildWorkspace('A'),
    developer: buildWorkspace('D'),
    personal: buildWorkspace('P'),
  };
}

export const COUNCIL_DEFS = buildCouncilDefs();

export function getCouncilForWorkspace(workspaceId = 'business') {
  const key = resolveWorkspaceKey(workspaceId);
  if (key === 'A') return COUNCIL_DEFS.agency;
  if (key === 'D') return COUNCIL_DEFS.developer;
  if (key === 'P') return COUNCIL_DEFS.personal;
  return COUNCIL_DEFS.business;
}

export function buildCouncilSystemPrompt({ workspaceId = 'business', councilMembers = [] } = {}) {
  const council = getCouncilForWorkspace(workspaceId);
  const baseIntro =
    council.baseIntro ||
    `You are part of the ${council.label}. This council provides multiple role viewpoints for the user.`;

  const memberIds = Array.isArray(councilMembers) ? councilMembers.filter(Boolean) : [];
  const selected = council.roles.filter((r) => memberIds.includes(r.id));

  if (!selected.length) {
    return [
      baseIntro,
      '',
      'Guidelines:',
      '- The user may explicitly ask for advice from specific council roles.',
      '- When they name one or more roles, separate your answer per role (e.g. "Role 1:" ... "Role 2:").',
      '- If they do not reference any role, answer normally as a general assistant for this workspace.',
    ].join('\n');
  }

  const activeList = selected.map((r) => `${r.label} (${r.domain})`).join(', ');

  const rolesBlock = [
    `Active council members for this conversation: ${activeList}.`,
    '',
    'Guidelines:',
    '- Always answer from these active members’ perspectives, even if the user does not mention them explicitly.',
    '- If more than one member is active, structure your answer with clear sections, one per role.',
    '- If the user asks which council members are active, tell them the list above.',
    '- If the user says to include another council role, add that role’s perspective as well.',
  ].join('\n');

  return `${baseIntro}\n\n${rolesBlock}`;
}

export default { COUNCIL_DEFS, getCouncilForWorkspace, buildCouncilSystemPrompt };
