import { pgTable, serial, varchar, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const ga4Connections = pgTable(
  'ga4_connections',
  {
    id: serial('id').primaryKey(),
    workspaceId: varchar('workspace_id', { length: 64 }).notNull(),
    userId: varchar('user_id', { length: 128 }),
    propertyId: varchar('property_id', { length: 64 }),
    refreshToken: text('refresh_token').notNull(),
    status: varchar('status', { length: 32 }).notNull(),
    connectedAt: timestamp('connected_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => ({
    workspaceUserUniqueIdx: uniqueIndex('uidx_ga4_conn_workspace_user').on(table.workspaceId, table.userId),
  }),
);
