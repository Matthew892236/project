-- ============================================================
-- Security: add per-user ownership and tighten all RLS policies
-- ============================================================

-- 1. Add user_id column to all core tables (no DEFAULT yet — backfill first)
ALTER TABLE players          ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE concerts         ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE custom_instruments ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE availability     ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- 2. Backfill existing rows to the first registered user
DO $$
DECLARE first_user UUID;
BEGIN
  SELECT id INTO first_user FROM auth.users ORDER BY created_at ASC LIMIT 1;
  IF first_user IS NOT NULL THEN
    UPDATE players           SET user_id = first_user WHERE user_id IS NULL;
    UPDATE concerts          SET user_id = first_user WHERE user_id IS NULL;
    UPDATE custom_instruments SET user_id = first_user WHERE user_id IS NULL;
    -- Derive availability ownership from the parent concert
    UPDATE availability a SET user_id = c.user_id
      FROM concerts c WHERE a.concert_id = c.id AND a.user_id IS NULL;
    -- Catch any orphaned rows
    UPDATE availability SET user_id = first_user WHERE user_id IS NULL;
  END IF;
END $$;

-- 3. Set DEFAULT auth.uid() so future inserts auto-assign ownership
ALTER TABLE players           ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE concerts          ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE custom_instruments ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE availability      ALTER COLUMN user_id SET DEFAULT auth.uid();

-- ============================================================
-- 4. Rebuild players policies
-- ============================================================
DROP POLICY IF EXISTS "insert_players"  ON players;
DROP POLICY IF EXISTS "update_players"  ON players;
DROP POLICY IF EXISTS "delete_players"  ON players;
DROP POLICY IF EXISTS "select_players"  ON players;

CREATE POLICY "select_players" ON players FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_players" ON players FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_players" ON players FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_players" ON players FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- 5. Rebuild concerts policies
-- ============================================================
DROP POLICY IF EXISTS "insert_concerts"  ON concerts;
DROP POLICY IF EXISTS "update_concerts"  ON concerts;
DROP POLICY IF EXISTS "delete_concerts"  ON concerts;
DROP POLICY IF EXISTS "select_concerts"  ON concerts;

CREATE POLICY "select_concerts" ON concerts FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_concerts" ON concerts FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_concerts" ON concerts FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_concerts" ON concerts FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- 6. Rebuild availability policies
-- ============================================================
DROP POLICY IF EXISTS "insert_availability"  ON availability;
DROP POLICY IF EXISTS "update_availability"  ON availability;
DROP POLICY IF EXISTS "delete_availability"  ON availability;
DROP POLICY IF EXISTS "select_availability"  ON availability;

CREATE POLICY "select_availability" ON availability FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_availability" ON availability FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_availability" ON availability FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_availability" ON availability FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- 7. Rebuild custom_instruments policies
-- ============================================================
DROP POLICY IF EXISTS "insert_custom_instruments"  ON custom_instruments;
DROP POLICY IF EXISTS "update_custom_instruments"  ON custom_instruments;
DROP POLICY IF EXISTS "delete_custom_instruments"  ON custom_instruments;
DROP POLICY IF EXISTS "select_custom_instruments"  ON custom_instruments;

CREATE POLICY "select_custom_instruments" ON custom_instruments FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_custom_instruments" ON custom_instruments FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_custom_instruments" ON custom_instruments FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_custom_instruments" ON custom_instruments FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- 8. response_tokens: remove open policies — handled by service_role edge function
-- ============================================================
DROP POLICY IF EXISTS "public_read_tokens"   ON response_tokens;
DROP POLICY IF EXISTS "public_update_tokens" ON response_tokens;
-- No public access; the respond-to-concert edge function uses service_role

-- ============================================================
-- 9. Revoke get_vault_secret from non-service roles
-- ============================================================
REVOKE EXECUTE ON FUNCTION get_vault_secret(TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION get_vault_secret(TEXT) FROM anon;
-- service_role retains access (already granted in previous migration)
