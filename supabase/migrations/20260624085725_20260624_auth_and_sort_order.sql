-- Add sort_order to players for drag-and-drop reordering
ALTER TABLE players ADD COLUMN IF NOT EXISTS sort_order INTEGER;

-- Backfill sort_order based on current ordering
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY instrument ORDER BY name) AS rn
  FROM players
)
UPDATE players SET sort_order = numbered.rn
FROM numbered WHERE players.id = numbered.id;

-- Create profiles table for band name
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  band_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_profile" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);
CREATE POLICY "insert_own_profile" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "delete_own_profile" ON profiles FOR DELETE
  TO authenticated USING (auth.uid() = id);