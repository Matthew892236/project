-- Fire after a new profile (band account) is created and seed one
-- example player and one placeholder concert for new users.
CREATE OR REPLACE FUNCTION seed_new_band()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO players (user_id, name, instrument, status, sort_order)
  VALUES (NEW.id, 'John Doe', 'Solo Cornet', 'Active', 1);

  INSERT INTO concerts (user_id, name, concert_date, start_time, end_time, location, status)
  VALUES (
    NEW.id,
    'Enter a concert name',
    CURRENT_DATE + INTERVAL '30 days',
    '19:00',
    '21:00',
    'Enter a location',
    'pending'
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER seed_band_on_profile_create
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION seed_new_band();
