import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Player = {
  id: string;
  name: string;
  instrument: string;
  email: string | null;
  phone: string | null;
  status: 'Active' | 'Spare';
  sort_order: number | null;
  tags: string[];
  created_at: string;
  updated_at: string;
};

export type ConcertStatus = 'pending' | 'live';

export type Concert = {
  id: string;
  name: string;
  concert_date: string;
  start_time: string;
  end_time: string;
  location: string;
  status: ConcertStatus;
  created_at: string;
  updated_at: string;
};

export type AvailabilityStatus = 'Available' | 'Not Available' | 'Not Responded' | 'Spare Assigned';

export type Availability = {
  id: string;
  player_id: string;
  concert_id: string;
  status: AvailabilityStatus;
  spare_player_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ResponseToken = {
  id: string;
  player_id: string;
  concert_id: string;
  token: string;
  used_at: string | null;
  created_at: string;
};

export type AvailabilityWithDetails = Availability & {
  player: Player;
  concert: Concert;
};

export const INSTRUMENTS = [
  'Conductor',
  'Solo Cornet',
  'Repiano Cornet',
  '2nd Cornet',
  '3rd Cornet',
  'Flugel Horn',
  'Solo Horn',
  '1st Horn',
  '2nd Horn',
  '1st Baritone',
  '2nd Baritone',
  '1st Trombone',
  '2nd Trombone',
  'Bass Trombone',
  'Euphonium',
  'EEb Bass',
  'BBb Bass',
  'Percussion',
];

// Instruments in the same family are interchangeable for spare coverage
const INSTRUMENT_FAMILIES: Record<string, string> = {
  'Solo Cornet':    'Cornet',
  'Repiano Cornet': 'Cornet',
  '2nd Cornet':     'Cornet',
  '3rd Cornet':     'Cornet',
  'Solo Horn':      'Horn',
  '1st Horn':       'Horn',
  '2nd Horn':       'Horn',
  '1st Baritone':   'Baritone',
  '2nd Baritone':   'Baritone',
  '1st Trombone':   'Trombone',
  '2nd Trombone':   'Trombone',
  'Bass Trombone':  'Trombone',
  'EEb Bass':       'Bass',
  'BBb Bass':       'Bass',
};

export function getInstrumentFamily(instrument: string): string {
  return INSTRUMENT_FAMILIES[instrument] ?? instrument;
}

export type CustomInstrument = {
  id: string;
  name: string;
  created_at: string;
};

export async function fetchAllInstruments(): Promise<string[]> {
  const { data } = await supabase.from('custom_instruments').select('name').order('created_at');
  const customNames = data?.map((r: { name: string }) => r.name) ?? [];
  return [...INSTRUMENTS, ...customNames];
}
