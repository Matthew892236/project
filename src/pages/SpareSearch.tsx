import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Search, MapPin, Music, ShieldAlert, Loader } from 'lucide-react';

// 🎺 Definitive Brass Band Roster Instrument Layout
const BRASS_BAND_INSTRUMENTS = [
  'Soprano Cornet',
  'Solo Cornet',
  'Repiano Cornet',
  '2nd Cornet',
  '3rd Cornet',
  'Flugelhorn',
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
  'Percussion'
];

interface Concert {
  id: string;
  name: string;
  concert_date: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
}

interface SparePlayerResult {
  id: string;
  name: string;
  instrument: string;
  distance: number;
  band_name: string;
}

export default function SpareSearch() {
  const [concerts, setConcerts] = useState<Concert[]>([]);
  const [myBandId, setMyBandId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Search Parameters State
  const [selectedConcertId, setSelectedConcertId] = useState('');
  const [instrumentNeeded, setInstrumentNeeded] = useState(''); // ◄ Managed by Dropdown selection now!
  const [radiusMiles, setRadiusMiles] = useState('25');
  
  // Results State
  const [searchResults, setSearchResults] = useState<SparePlayerResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchTriggered, setSearchTriggered] = useState(false);

  function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 3958.8; // Radius of the Earth in miles
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
        
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; 
  }

  useEffect(() => {
    async function loadSearchBasics() {
      try {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: bandData } = await supabase
          .from('bands')
          .select('id')
          .eq('manager_id', user.id)
          .maybeSingle();

        if (bandData) {
          setMyBandId(bandData.id);

          const { data: concertData } = await supabase
            .from('concerts')
            .select('id, name, concert_date, location, latitude, longitude')
            .eq('band_id', bandData.id)
            .order('concert_date', { ascending: true });

          setConcerts(concertData || []);
        }
      } catch (err: any) {
        console.error("Error setting up search panel:", err.message);
      } finally {
        setLoading(false);
      }
    }
    loadSearchBasics();
  }, []);

  const handleSearchSpares = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConcertId || !instrumentNeeded || !myBandId) return;

    setSearching(true);
    setSearchTriggered(true);
    setSearchResults([]);

    try {
      const targetConcert = concerts.find(c => c.id === selectedConcertId);
      if (!targetConcert || targetConcert.latitude === null || targetConcert.longitude === null) {
        alert("⚠️ This concert lacks valid postcode coordinates. Please edit the concert location first!");
        setSearching(false);
        return;
      }

      const { data: globalSpares, error } = await supabase
        .from('players')
        .select(`
          id,
          name,
          instrument,
          band_id,
          bands ( name, latitude, longitude )
        `)
        .eq('is_global_spare', true)
        .neq('band_id', myBandId) 
        .ilike('instrument', `%${instrumentNeeded.trim()}%`); 

      if (error) throw error;

      const verifiedMatches: SparePlayerResult[] = [];

      if (globalSpares) {
        globalSpares.forEach((record: any) => {
          const playerHomeBand = record.bands;
          
          if (playerHomeBand && playerHomeBand.latitude !== null && playerHomeBand.longitude !== null) {
            const milesAway = calculateDistance(
              targetConcert.latitude!,
              targetConcert.longitude!,
              playerHomeBand.latitude,
              playerHomeBand.longitude
            );

            if (milesAway <= parseFloat(radiusMiles)) {
              verifiedMatches.push({
                id: record.id,
                name: record.name,
                instrument: record.instrument,
                distance: Math.round(milesAway * 10) / 10, 
                band_name: playerHomeBand.name
              });
            }
          }
        });
      }

      verifiedMatches.sort((a, b) => a.distance - b.distance);
      setSearchResults(verifiedMatches);

    } catch (err: any) {
      alert(`Search failed: ${err.message}`);
    } finally {
      setSearching(false);
    }
  };

  if (loading) {
    return <div style={{ padding: '4px', fontFamily: 'sans-serif' }}>Setting up tracking grid...</div>;
  }

  return (
    <div style={{ fontFamily: 'sans-serif', padding: '20px', maxWidth: '1000px', margin: '0 auto' }}>
      <h2>Global Spare Search Matrix</h2>
      <p style={{ color: '#666' }}>Locate regional guest players based on calculated distances to your selected performance venue.</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '40px', marginTop: '30px' }}>
        
        {/* LEFT COMPONENT: Search Control Panel */}
        <div style={{ backgroundColor: '#f8fafc', padding: '24px', borderRadius: '8px', border: '1px solid #e2e8f0', height: 'fit-content' }}>
          <form onSubmit={handleSearchSpares} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold', fontSize: '13px' }}>1. Select Targeted Concert</label>
              <select 
                required 
                value={selectedConcertId} 
                onChange={(e) => setSelectedConcertId(e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
              >
                <option value="">-- Choose an upcoming gig --</option>
                {concerts.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({new Date(c.concert_date).toLocaleDateString('en-GB', {day:'numeric', month:'short'})})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold', fontSize: '13px' }}>2. Instrument Needed</label>
              {/* 🔄 Upgraded from a manual text box to an intentional selection drop menu! */}
              <select
                required
                value={instrumentNeeded}
                onChange={(e) => setInstrumentNeeded(e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
              >
                <option value="">-- Choose instrument --</option>
                {BRASS_BAND_INSTRUMENTS.map(inst => (
                  <option key={inst} value={inst}>{inst}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold', fontSize: '13px' }}>3. Search Distance Radius</label>
              <select 
                value={radiusMiles} 
                onChange={(e) => setRadiusMiles(e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
              >
                <option value="10">Within 10 miles</option>
                <option value="25">Within 25 miles</option>
                <option value="50">Within 50 miles</option>
                <option value="100">Within 100 miles</option>
              </select>
            </div>

            <button 
              type="submit" 
              disabled={searching}
              style={{ 
                padding: '12px', 
                backgroundColor: '#0070f3', 
                color: 'white', 
                border: 'none', 
                borderRadius: '6px', 
                fontWeight: 'bold', 
                cursor: 'pointer', 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center', 
                gap: '8px',
                marginTop: '10px'
              }}
            >
              {searching ? <Loader size={16} className="spin" /> : <><Search size={16} /> Scan Regional Network</>}
            </button>
          </form>
        </div>

        {/* RIGHT COMPONENT: Search Results Panel */}
        <div>
          <h3 style={{ marginTop: 0 }}>Matching Regional Candidates ({searchResults.length})</h3>
          
          {!searchTriggered && (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', border: '2px dashed #e2e8f0', borderRadius: '8px' }}>
              <Music size={32} style={{ marginBottom: '8px' }} />
              <p style={{ margin: 0, fontSize: '14px' }}>Select an event and an instrument on the left to map available players.</p>
            </div>
          )}

          {searchTriggered && searchResults.length === 0 && !searching && (
            <div style={{ padding: '20px', backgroundColor: '#fff7ed', borderRadius: '6px', border: '1px solid #ffedd5', color: '#c2410c', display: 'flex', gap: '10px', alignItems: 'center' }}>
              <ShieldAlert size={20} />
              <span style={{ fontSize: '14px' }}>No global spares registered matching "{instrumentNeeded}" within a {radiusMiles}-mile radius of this venue.</span>
            </div>
          )}

          {searchResults.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {searchResults.map((player) => (
                <div 
                  key={player.id} 
                  style={{ 
                    padding: '16px', 
                    border: '1px solid #e2e8f0', 
                    borderRadius: '8px', 
                    backgroundColor: 'white', 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.02)' 
                  }}
                >
                  <div>
                    <h4 style={{ margin: '0 0 4px 0', color: '#1e293b', fontSize: '15px' }}>{player.name}</h4>
                    <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                      🎺 {player.instrument} • Home Band: <strong>{player.band_name}</strong>
                    </p>
                  </div>
                  <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#0f172a', backgroundColor: '#f1f5f9', padding: '4px 10px', borderRadius: '20px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <MapPin size={12} /> {player.distance} miles away
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}