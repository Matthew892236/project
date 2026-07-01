-- Add spare player assignment to availability
ALTER TABLE availability ADD COLUMN IF NOT EXISTS spare_player_id UUID REFERENCES players(id) ON DELETE SET NULL;

-- Extend status to include 'Spare Assigned'
ALTER TABLE availability DROP CONSTRAINT IF EXISTS availability_status_check;
ALTER TABLE availability ADD CONSTRAINT availability_status_check 
  CHECK (status IN ('Available', 'Not Available', 'Not Responded', 'Spare Assigned'));

-- Response tokens for email-based availability responses
CREATE TABLE IF NOT EXISTS response_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  concert_id UUID NOT NULL REFERENCES concerts(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(player_id, concert_id)
);

ALTER TABLE response_tokens ENABLE ROW LEVEL SECURITY;

-- Public read/update for response tokens (needed for unauthenticated email responses)
CREATE POLICY "public_read_tokens" ON response_tokens FOR SELECT
  USING (true);
CREATE POLICY "public_update_tokens" ON response_tokens FOR UPDATE
  USING (true) WITH CHECK (true);

-- Allow public insert on availability for token-based responses
DROP POLICY IF EXISTS "insert_availability" ON availability;
CREATE POLICY "insert_availability" ON availability FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "update_availability" ON availability;
CREATE POLICY "update_availability" ON availability FOR UPDATE
  USING (true) WITH CHECK (true);