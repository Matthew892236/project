import { useState, useEffect } from 'react';
import { Users, UserPlus, Trash2, ShieldAlert, CheckCircle, Loader2, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Player {
  id: string;
  name: string;
  instrument: string;
  email: string;
  phone?: string;
  status: string;
  band_id: number;
}

const STANDARD_INSTRUMENTS = [
  "Principal Cornet", "Solo Cornet", "Soprano Cornet", "Repiano Cornet",
  "2nd Cornet", "3rd Cornet", "Flugelhorn", "Solo Horn", "1st Horn", "2nd Horn",
  "1st Baritone", "2nd Baritone", "Euphonium", "1st Trombone", "2nd Trombone",
  "Bass Trombone", "EEb Bass", "BBb Bass", "Percussion"
];

export default function BandRoster() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [bandId, setBandId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form Fields State
  const [name, setName] = useState('');
  const [instrument, setInstrument] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState('Active'); // 🌟 Added Status State

  useEffect(() => {
    fetchIsolatedRoster();
  }, []);

  async function fetchIsolatedRoster() {
    setLoading(true);
    setError(null);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) throw new Error("Authentication session expired.");

      const { data: band } = await supabase
        .from('bands')
        .select('id')
        .eq('manager_id', userData.user.id)
        .maybeSingle();

      if (!band) {
        setLoading(false);
        return;
      }

      setBandId(band.id);

      // 🌟 SECURE ISOLATION: Fetch only this band's players
      const { data: rosterData, error: rosterError } = await supabase
        .from('players')
        .select('*')
        .eq('band_id', band.id);

      if (rosterError) throw rosterError;
      setPlayers(rosterData as Player[] || []);

    } catch (err: any) {
      setError(err.message || "Failed to load your band roster registry.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddPlayer(e: React.FormEvent) {
    e.preventDefault();
    if (!bandId) return setError("No active band profile resolved.");

    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      const { data: newPlayer, error: insertError } = await supabase
        .from('players')
        .insert({
          name: name.trim(),
          instrument: instrument,
          email: email.trim().toLowerCase(),
          phone: phone.trim() || null,
          status: status, // 🌟 Saves Active or Spare status
          band_id: bandId
        })
        .select()
        .single();

      if (insertError) throw insertError;

      setPlayers(prev => [...prev, newPlayer as Player]);
      setSuccess(`${name.trim()} added successfully!`);
      
      setName('');
      setInstrument('');
      setEmail('');
      setPhone('');
      setStatus('Active');

    } catch (err: any) {
      setError(err.message || "Could not register player profile.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeletePlayer(player: Player) {
    if (!bandId || !confirm(`Remove ${player.name} from the registry?`)) return;

    try {
      const { error: deleteError } = await supabase
        .from('players')
        .delete()
        .match({ id: player.id, band_id: bandId });

      if (deleteError) throw deleteError;
      setPlayers(prev => prev.filter(p => p.id !== player.id));
    } catch (err: any) {
      setError("Security block: Unable to drop player asset.");
    }
  }

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}><Loader2 className="animate-spin" /> Loading roster...</div>;

  return (
    <div style={{ padding: '24px', fontFamily: 'system-ui', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
        <Users size={32} color="#1e3a5f" />
        <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#1e3a5f', margin: 0 }}>Band Roster Registry</h1>
      </div>

      {error && <div style={{ backgroundColor: '#fef2f2', color: '#991b1b', padding: '12px', borderRadius: '8px', marginBottom: '24px' }}><ShieldAlert size={18}/> {error}</div>}
      {success && <div style={{ backgroundColor: '#f0fdf4', color: '#166534', padding: '12px', borderRadius: '8px', marginBottom: '24px' }}><CheckCircle size={18}/> {success}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '32px', alignItems: 'start' }}>
        
        {/* FORM */}
        <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px' }}>
          <h2 style={{ fontSize: '18px', marginBottom: '20px' }}><UserPlus size={20} /> Add Musician</h2>
          <form onSubmit={handleAddPlayer} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <input type="text" required value={name} onChange={e => setName(e.target.value)} placeholder="Full Name" style={{ padding: '10px' }} />
            
            <select required value={instrument} onChange={e => setInstrument(e.target.value)} style={{ padding: '10px' }}>
              <option value="">Select instrument...</option>
              {STANDARD_INSTRUMENTS.map(inst => <option key={inst} value={inst}>{inst}</option>)}
            </select>

            {/* 🌟 RESTORED STATUS DROPDOWN */}
            <select required value={status} onChange={e => setStatus(e.target.value)} style={{ padding: '10px' }}>
              <option value="Active">Active Core Player</option>
              <option value="Spare">Spare / Dep List</option>
            </select>

            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" style={{ padding: '10px' }} />
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone (Optional)" style={{ padding: '10px' }} />
            <button type="submit" disabled={submitting} style={{ padding: '12px', backgroundColor: '#1e3a5f', color: '#fff', border: 'none', borderRadius: '6px' }}>{submitting ? 'Saving...' : 'Add Player'}</button>
          </form>
        </div>

        {/* MATRIX GRID WITH VACANCIES */}
        <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px' }}>
          <h2 style={{ fontSize: '18px', marginBottom: '20px' }}>Current Instrumentation</h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '600px', overflowY: 'auto' }}>
            {STANDARD_INSTRUMENTS.map(inst => {
              const seatPlayers = players.filter(p => p.instrument === inst);
              
              return (
                <div key={inst} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                  <div style={{ backgroundColor: '#f8fafc', padding: '8px 12px', fontWeight: 600, borderBottom: '1px solid #e2e8f0', color: '#1e3a5f' }}>
                    {inst}
                  </div>
                  <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {seatPlayers.length > 0 ? (
                      seatPlayers.map(p => (
                        <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <span style={{ fontWeight: 500 }}>{p.name}</span>
                            <span style={{ fontSize: '12px', marginLeft: '8px', padding: '2px 6px', borderRadius: '4px', backgroundColor: p.status === 'Active' ? '#dcfce7' : '#fef3c7', color: p.status === 'Active' ? '#166534' : '#92400e' }}>
                              {p.status}
                            </span>
                          </div>
                          <button onClick={() => handleDeletePlayer(p)} style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer' }}><Trash2 size={16} /></button>
                        </div>
                      ))
                    ) : (
                      <div style={{ color: '#ef4444', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 500 }}>
                        <AlertTriangle size={16} /> Vacant Position
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}