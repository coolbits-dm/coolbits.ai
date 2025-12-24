import { pgTable, serial, varchar, text, timestamp, uniqueIndex, bigint } from 'drizzle-orm/pg-core';

export const googleAdsConnections = pgTable(
  'google_ads_connections',
  {
    id: serial('id').primaryKey(),
    workspaceId: varchar('workspace_id', { length: 64 }).notNull(),
    userId: varchar('user_id', { length: 128 }),
    customerId: text('customer_id'),
    loginCustomerId: bigint('login_customer_id', { mode: 'number' }),
    refreshToken: text('refresh_token').notNull(),
    status: varchar('status', { length: 32 }).notNull(),
    connectedAt: timestamp('connected_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => ({
    workspaceUserUniqueIdx: uniqueIndex('uidx_google_ads_conn_workspace_user').on(table.workspaceId, table.userId),
  }),
);
