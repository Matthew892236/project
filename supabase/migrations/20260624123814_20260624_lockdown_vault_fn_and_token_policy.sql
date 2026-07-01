-- ============================================================
-- 1. Fully lock down get_vault_secret
--    PostgreSQL grants EXECUTE to PUBLIC by default; revoking
--    from named roles alone is not enough.
-- ============================================================
REVOKE EXECUTE ON FUNCTION get_vault_secret(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_vault_secret(TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION get_vault_secret(TEXT) FROM authenticated;
-- service_role keeps its explicit grant from the earlier migration

-- ============================================================
-- 2. response_tokens: add explicit policies so the table is
--    not left in the "RLS on, no policies" state.
--    All mutation goes through service_role edge functions
--    (which bypass RLS), so client-side access is read-only
--    and scoped to the authenticated band manager's own players.
-- ============================================================
CREATE POLICY "select_own_tokens" ON response_tokens FOR SELECT
  TO authenticated
  USING (
    player_id IN (
      SELECT id FROM players WHERE user_id = auth.uid()
    )
  );
