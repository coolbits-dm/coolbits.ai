import { query, getClient } from '../db.js';
import { getUserByEmail, upsertUser } from '../userStore.js';
import { PLANS } from '../config/plans.js';
import { getProjectForUser } from './projectService.js';
import { getCouncilForWorkspace, buildCouncilSystemPrompt } from '../config/council.js';

const SYSTEM_PROMPT = `You are the CoolBits.ai Assistant. Always respond in English unless the user explicitly requests another language. If the user asks for a different language, use that language for that turn only.`;

async function ensureUser(email) {
  let user = await getUserByEmail(email);
  if (!user) {
    user = await upsertUser({ email });
  }
  return user;
}

// In-memory maps for council/workspace context (no DB schema change yet)
const chatCouncil = new Map(); // chatId -> array of council member ids
const chatWorkspace = new Map(); // chatId -> workspaceId

function sanitizeCouncil(councilMembers) {
  if (!Array.isArray(councilMembers)) return [];
  return councilMembers.map((c) => String(c || '').trim()).filter(Boolean).slice(0, 5);
}

function buildCouncilSystemMessage(workspaceId, councilMembers) {
  const prompt = buildCouncilSystemPrompt({ workspaceId, councilMembers });
  if (!prompt) return null;
  if (process.env.CB_DEBUG_COUNCIL === '1') {
    console.debug('[COUNCIL_PROMPT]', { workspaceId, councilMembers, prompt });
  }
  return { role: 'system', content: prompt };
}


export async function listChatsForUser(email, { limit = 20, offset = 0, workspaceId = 'business' } = {}) {
  const user = await ensureUser(email);
  const { rows } = await query(
    `SELECT id, user_id, title, model, temperature, project_id, workspace_id, archived_at, created_at, updated_at
     FROM chats
     WHERE user_id = $1 AND archived_at IS NULL AND COALESCE(workspace_id, 'business') = $4
     ORDER BY updated_at DESC
     LIMIT $2 OFFSET $3`,
    [user.id, limit, offset, workspaceId || 'business'],
  );
  return rows.map((row) => ({
    ...row,
    projectId: row.project_id ?? null,
    councilMembers: chatCouncil.get(row.id) || [],
    workspaceId: chatWorkspace.get(row.id) || row.workspace_id || 'business',
  }));
}

export async function getChatWithMessages(email, chatId) {
  const user = await ensureUser(email);
  const { rows: chatRows } = await query(
    `SELECT id, user_id, title, model, temperature, project_id, workspace_id, archived_at, created_at, updated_at
     FROM chats
     WHERE id = $1 AND user_id = $2 AND archived_at IS NULL
     LIMIT 1`,
    [chatId, user.id],
  );
  if (!chatRows.length) return null;
  const chat = chatRows[0];
  const { rows: messages } = await query(
    `SELECT id, chat_id, role, content, token_count AS token_count, created_at
     FROM messages
     WHERE chat_id = $1
     ORDER BY created_at ASC`,
    [chatId],
  );
  const mappedChat = {
    ...chat,
    projectId: chat.project_id ?? null,
    councilMembers: chatCouncil.get(chat.id) || [],
    workspaceId: chatWorkspace.get(chat.id) || chat.workspace_id || 'business',
  };
  chatWorkspace.set(chat.id, mappedChat.workspaceId);
  return { chat: mappedChat, messages };
}

export async function createChat(email, firstMessageContent, options = {}) {
  const user = await ensureUser(email);
  const plan = PLANS[user.planId] || PLANS.STARTER_FREE || PLANS.GUEST;
  if (plan?.isPaid && user.subscriptionStatus !== 'active') {
    const err = new Error('PLAN_INACTIVE');
    err.status = 402;
    throw err;
  }
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const title = options.title || (firstMessageContent || '').slice(0, 80);
    const model = options.model || 'vertex-gemini-2.5-flash-lite';
    const temperature = options.temperature ?? 0.3;
    let projectId = options.projectId || null;
    const workspaceId = options.workspaceId || 'business';
    const councilMembers = sanitizeCouncil(options.councilMembers);

    if (projectId) {
      const project = await getProjectForUser(user.id, projectId);
      if (project && !project.archived) {
        projectId = project.id;
      } else {
        projectId = null;
      }
    }

    const { rows: chatRows } = await client.query(
      `INSERT INTO chats (user_id, title, model, temperature, project_id, workspace_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, user_id, title, model, temperature, project_id, workspace_id, created_at, updated_at`,
      [user.id, title, model, temperature, projectId, workspaceId || 'business'],
    );
    const chat = chatRows[0];

    const { rows: msgRows } = await client.query(
      `INSERT INTO messages (chat_id, role, content)
       VALUES ($1, 'user', $2)
       RETURNING id, chat_id, role, content, token_count, created_at`,
      [chat.id, firstMessageContent],
    );
    const userMessage = msgRows[0];

    await client.query('COMMIT');
    chatCouncil.set(chat.id, councilMembers);
    chatWorkspace.set(chat.id, workspaceId || 'business');
    const mappedChat = {
      ...chat,
      projectId: chat.project_id ?? null,
      councilMembers,
      workspaceId: workspaceId || 'business',
    };
    return { chat: mappedChat, userMessage, systemPrompt: SYSTEM_PROMPT, model, temperature };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function appendUserMessage(email, chatId, content, councilMembers = []) {
  const user = await ensureUser(email);
  const { rows: chats } = await query(
    `SELECT id FROM chats WHERE id = $1 AND user_id = $2 LIMIT 1`,
    [chatId, user.id],
  );
  if (!chats.length) {
    const err = new Error('Chat not found');
    err.status = 404;
    throw err;
  }
  const cleanCouncil = sanitizeCouncil(councilMembers);
  if (cleanCouncil.length) {
    chatCouncil.set(chatId, cleanCouncil);
  }
  const { rows } = await query(
    `INSERT INTO messages (chat_id, role, content)
     VALUES ($1, 'user', $2)
     RETURNING id, chat_id, role, content, token_count, created_at`,
    [chatId, content],
  );
  const msg = rows[0];
  msg.councilMembers = cleanCouncil.length ? cleanCouncil : (chatCouncil.get(chatId) || []);
  return msg;
}

export async function saveAssistantMessage(chatId, content, tokensIn = null, tokensOut = null) {
  const { rows } = await query(
    `INSERT INTO messages (chat_id, role, content, token_count)
     VALUES ($1, 'assistant', $2, $3)
     RETURNING id, chat_id, role, content, token_count, created_at`,
    [chatId, content, tokensOut],
  );
  await query(`UPDATE chats SET updated_at = now() WHERE id = $1`, [chatId]);
  return rows[0];
}

export async function getMessagesForChat(email, chatId) {
  const combo = await getChatWithMessages(email, chatId);
  return combo ? combo.messages : [];
}

export function buildHistory(systemPrompt, messages) {
  const history = [];
  if (systemPrompt) {
    history.push({ role: 'system', content: systemPrompt });
  }
  for (const m of messages || []) {
    history.push({ role: m.role, content: m.content });
  }
  return history;
}

export { SYSTEM_PROMPT };


export async function updateChatTitle({ userEmail, chatId, title }) {
  const user = await ensureUser(userEmail);
  const trimmed = String(title || '').trim();
  if (!trimmed) return null;
  const safeTitle = trimmed.slice(0, 80);
  const res = await query(
    `UPDATE chats
       SET title = $3,
           updated_at = now()
     WHERE id = $1 AND user_id = $2
     RETURNING id, title`,
    [chatId, user.id, safeTitle],
  );
  if (!res.rows.length) return null;
  return { id: res.rows[0].id, title: res.rows[0].title };
}


export async function archiveChat({ chatId, userEmail }) {
  const user = await ensureUser(userEmail);
  const res = await query(
    `UPDATE chats
       SET archived_at = now()
     WHERE id = $1 AND user_id = $2 AND archived_at IS NULL
     RETURNING id`,
    [chatId, user.id],
  );
  if (!res.rows.length) {
    const err = new Error('not_found');
    err.status = 404;
    throw err;
  }
  return true;
}

export function getChatCouncil(chatId) {
  return chatCouncil.get(chatId) || [];
}

export function getChatWorkspace(chatId) {
  return chatWorkspace.get(chatId) || 'business';
}

export function buildCouncilSystem(workspaceId, councilMembers) {
  return buildCouncilSystemMessage(workspaceId, councilMembers);
}
