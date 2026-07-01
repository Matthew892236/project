-- Drop permissive policies on availability table
DROP POLICY IF EXISTS delete_availability ON availability;
DROP POLICY IF EXISTS insert_availability ON availability;
DROP POLICY IF EXISTS update_availability ON availability;

-- Create secure policies for availability (authenticated users only)
CREATE POLICY "insert_availability_secure" ON availability FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "update_availability_secure" ON availability FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "delete_availability_secure" ON availability FOR DELETE
  TO authenticated USING (true);

-- Drop permissive policies on concerts table
DROP POLICY IF EXISTS delete_concerts ON concerts;
DROP POLICY IF EXISTS insert_concerts ON concerts;
DROP POLICY IF EXISTS update_concerts ON concerts;

-- Create secure policies for concerts (authenticated users only)
CREATE POLICY "insert_concerts_secure" ON concerts FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "update_concerts_secure" ON concerts FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "delete_concerts_secure" ON concerts FOR DELETE
  TO authenticated USING (true);

-- Drop permissive policies on players table
DROP POLICY IF EXISTS delete_players ON players;
DROP POLICY IF EXISTS insert_players ON players;
DROP POLICY IF EXISTS update_players ON players;

-- Create secure policies for players (authenticated users only)
CREATE POLICY "insert_players_secure" ON players FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "update_players_secure" ON players FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "delete_players_secure" ON players FOR DELETE
  TO authenticated USING (true);