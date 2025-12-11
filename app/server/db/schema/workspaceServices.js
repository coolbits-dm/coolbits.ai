import { pgTable, varchar, text, timestamp, primaryKey } from 'drizzle-orm/pg-core';

export const workspaceServices = pgTable(
  'workspace_services',
  {
    workspaceId: varchar('workspace_id', { length: 64 }).notNull(),
    serviceCode: varchar('service_code', { length: 64 }).notNull(),
    status: varchar('status', { length: 32 }).notNull(), // 'connected' | 'degraded' | 'disconnected'
    connectedAs: text('connected_as'),
    updatedBy: varchar('updated_by', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.workspaceId, table.serviceCode] }),
  }),
);
