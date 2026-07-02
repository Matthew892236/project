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

  const [name, setName] = useState('');
  const [instrument, setInstrument] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState('Active');

  useEffect(() => {
    fetchIsolatedRoster();
  }, []);

  async function fetchIsolatedRoster() {
    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return;

      const { data: band } = await supabase.from('bands').select('id').eq('manager_id', userData.user.id).maybeSingle();
      if (!band) return setLoading(false);

      setBandId(band.id);

      const { data: rosterData } = await supabase.from('players').select('*').eq('band_id', band.id);
      if (rosterData) setPlayers(rosterData as Player[]);
    } catch (err: any) {
      setError(err.message || "Failed to load roster.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddPlayer(e: React.FormEvent) {
    e.preventDefault();
    if (!bandId) return setError("No active band profile resolved.");
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const { data: newPlayer, error: insertError } = await supabase
        .from('players')
        .insert({ name: name.trim(), instrument, email: email.trim().toLowerCase(), phone: phone.trim() || null, status, band_id: bandId })
        .select()
        .single();

      if (insertError) throw insertError;

      setPlayers(prev => [...prev, newPlayer as Player]);
      setSuccess(`${name.trim()} added successfully!`);
      setName(''); setInstrument(''); setEmail(''); setPhone(''); setStatus('Active');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeletePlayer(player: Player) {
    if (!bandId || !confirm(`Remove ${player.name} from the registry?`)) return;
    try {
      await supabase.from('players').delete().match({ id: player.id, band_id: bandId });
      setPlayers(prev => prev.filter(p => p.id !== player.id));
    } catch (err) {
      setError("Security block: Unable to delete.");
    }
  }

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}><Loader2 className="animate-spin" /> Loading roster...</div>;

  return (
    <div style={{ padding: '32px', fontFamily: 'system-ui', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
        <Users size={36} color="#1e3a5f" />
        <h1 style={{ fontSize: '32px', fontWeight: 800, color: '#1e3a5f', margin: 0 }}>Band Roster Registry</h1>
      </div>

      {error && <div style={{ backgroundColor: '#fef2f2', color: '#991b1b', padding: '16px', borderRadius: '8px', marginBottom: '24px', display: 'flex', gap: '8px' }}><ShieldAlert size={20}/> {error}</div>}
      {success && <div style={{ backgroundColor: '#f0fdf4', color: '#166534', padding: '16px', borderRadius: '8px', marginBottom: '24px', display: 'flex', gap: '8px' }}><CheckCircle size={20}/> {success}</div>}

      {/* 🌟 RESPONSIVE GRID FIX: Will stack smoothly on small screens */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '32px', alignItems: 'start' }}>
        
        {/* Left: Form */}
        <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '32px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
          <h2 style={{ fontSize: '20px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px', color: '#0f172a' }}><UserPlus size={20} /> Add Musician</h2>
          <form onSubmit={handleAddPlayer} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <input type="text" required value={name} onChange={e => setName(e.target.value)} placeholder="Full Name" style={{ padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
            <select required value={instrument} onChange={e => setInstrument(e.target.value)} style={{ padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#fff' }}>
              <option value="">Select instrument...</option>
              {STANDARD_INSTRUMENTS.map(inst => <option key={inst} value={inst}>{inst}</option>)}
            </select>
            <select required value={status} onChange={e => setStatus(e.target.value)} style={{ padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#fff' }}>
              <option value="Active">Active Core Player</option>
              <option value="Spare">Spare / Dep List</option>
            </select>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" style={{ padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone (Optional)" style={{ padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
            <button type="submit" disabled={submitting} style={{ padding: '14px', backgroundColor: '#1e3a5f', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: 'bold', marginTop: '8px', cursor: 'pointer' }}>{submitting ? 'Saving...' : 'Add Player'}</button>
          </form>
        </div>

        {/* Right: Un-Jammed Matrix Grid */}
        <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '32px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
          <h2 style={{ fontSize: '20px', marginBottom: '24px', color: '#0f172a' }}>Current Instrumentation</h2>
          
          {/* Scrollable container with padding */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '650px', overflowY: 'auto', paddingRight: '8px' }}>
            {STANDARD_INSTRUMENTS.map(inst => {
              const seatPlayers = players.filter(p => p.instrument === inst);
              return (
                <div key={inst} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                  <div style={{ backgroundColor: '#f8fafc', padding: '12px 16px', fontWeight: 600, borderBottom: '1px solid #e2e8f0', color: '#1e3a5f', fontSize: '15px' }}>
                    {inst}
                  </div>
                  <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {seatPlayers.length > 0 ? (
                      seatPlayers.map(p => (
                        <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 600, fontSize: '15px', color: '#334155' }}>{p.name}</span>
                            <span style={{ fontSize: '12px', padding: '4px 8px', borderRadius: '6px', fontWeight: 600, backgroundColor: p.status === 'Active' ? '#dcfce7' : '#fef3c7', color: p.status === 'Active' ? '#166534' : '#92400e' }}>
                              {p.status}
                            </span>
                          </div>
                          <button onClick={() => handleDeletePlayer(p)} style={{ border: 'none', background: '#fef2f2', color: '#ef4444', padding: '8px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))
                    ) : (
                      <div style={{ color: '#ef4444', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, padding: '4px 0' }}>
                        <AlertTriangle size={18} /> Vacant Position
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