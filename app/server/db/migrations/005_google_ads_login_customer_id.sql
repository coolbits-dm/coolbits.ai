-- Store the manager (login-customer-id) used for MCC access
ALTER TABLE google_ads_connections
ADD COLUMN IF NOT EXISTS login_customer_id BIGINT;

