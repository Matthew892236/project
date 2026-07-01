-- Reliable vault secret reader callable by service_role (used from edge functions via RPC)
CREATE OR REPLACE FUNCTION get_vault_secret(secret_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = vault, public
AS $$
DECLARE
  secret_value TEXT;
BEGIN
  SELECT decrypted_secret INTO secret_value
  FROM vault.decrypted_secrets
  WHERE name = secret_name
  LIMIT 1;
  RETURN secret_value;
END;
$$;

GRANT EXECUTE ON FUNCTION get_vault_secret(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION get_vault_secret(TEXT) TO authenticated;

-- Custom instruments table — instruments added here appear in all dropdowns alongside the standard list
CREATE TABLE IF NOT EXISTS custom_instruments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE custom_instruments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_custom_instruments" ON custom_instruments FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_custom_instruments" ON custom_instruments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "delete_custom_instruments" ON custom_instruments FOR DELETE TO authenticated USING (true);
