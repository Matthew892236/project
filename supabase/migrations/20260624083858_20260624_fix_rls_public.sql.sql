-- Drop restrictive policies and recreate with public access for demo
DROP POLICY IF EXISTS delete_availability_secure ON availability;
DROP POLICY IF EXISTS insert_availability_secure ON availability;
DROP POLICY IF EXISTS update_availability_secure ON availability;
DROP POLICY IF EXISTS delete_concerts_secure ON concerts;
DROP POLICY IF EXISTS insert_concerts_secure ON concerts;
DROP POLICY IF EXISTS update_concerts_secure ON concerts;
DROP POLICY IF EXISTS delete_players_secure ON players;
DROP POLICY IF EXISTS insert_players_secure ON players;
DROP POLICY IF EXISTS update_players_secure ON players;

-- Recreate policies allowing public access (demo app)
CREATE POLICY "insert_availability" ON availability FOR INSERT
  WITH CHECK (true);
CREATE POLICY "update_availability" ON availability FOR UPDATE
  USING (true) WITH CHECK (true);
CREATE POLICY "delete_availability" ON availability FOR DELETE
  USING (true);

CREATE POLICY "insert_concerts" ON concerts FOR INSERT
  WITH CHECK (true);
CREATE POLICY "update_concerts" ON concerts FOR UPDATE
  USING (true) WITH CHECK (true);
CREATE POLICY "delete_concerts" ON concerts FOR DELETE
  USING (true);

CREATE POLICY "insert_players" ON players FOR INSERT
  WITH CHECK (true);
CREATE POLICY "update_players" ON players FOR UPDATE
  USING (true) WITH CHECK (true);
CREATE POLICY "delete_players" ON players FOR DELETE
  USING (true);

-- Add status column to concerts
ALTER TABLE concerts ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'live'));