CREATE TABLE IF NOT EXISTS public_contact_messages (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NULL,
  email TEXT NOT NULL,
  message TEXT NOT NULL,
  ip TEXT NULL,
  user_agent TEXT NULL,
  referrer TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_public_contact_messages_created_at
  ON public_contact_messages(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_public_contact_messages_ip_created_at
  ON public_contact_messages(ip, created_at DESC);
