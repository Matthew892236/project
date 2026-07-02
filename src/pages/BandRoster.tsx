import { useState, useEffect } from 'react';
import { Users, UserPlus, Trash2, ShieldAlert, CheckCircle, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Player {
  id: string;
  name: string;
  instrument: string;
  email: string;
  phone?: string;
  status: 'Active' | 'Inactive';
  band_id: number;
}

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

  useEffect(() => {
    fetchIsolatedRoster();
  }, []);

  async function fetchIsolatedRoster() {
    setLoading(true);
    setError(null);
    try {
      // 1. Resolve current active authentication session
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) throw new Error("Authentication session expired.");

      // 2. Identify the specific band mapped to this manager account
      const { data: band, error: bandError } = await supabase
        .from('bands')
        .select('id')
        .eq('manager_id', userData.user.id)
        .maybeSingle();

      if (bandError) throw bandError;

      if (!band) {
        // If no band exists yet, keep roster beautifully empty/clean
        setLoading(false);
        return;
      }

      setBandId(band.id);

      // 3. 🌟 SECURITY FILTER: Pull ONLY players assigned to this unique band
      const { data: rosterData, error: rosterError } = await supabase
        .from('players')
        .select('*')
        .eq('band_id', band.id)
        .order('instrument', { ascending: true })
        .order('name', { ascending: true });

      if (rosterError) throw rosterError;
      setPlayers(rosterData as Player[] || []);

    } catch (err: any) {
      console.error("Roster compilation error:", err);
      setError(err.message || "Failed to load your band roster registry.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddPlayer(e: React.FormEvent) {
    e.preventDefault();
    if (!bandId) {
      setError("No active band profile resolved. Complete onboarding first.");
      return;
    }

    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      // 🌟 INSULATION: Explicitly inject the current band_id into the payload
      const { data: newPlayer, error: insertError } = await supabase
        .from('players')
        .insert({
          name: name.trim(),
          instrument: instrument,
          email: email.trim().toLowerCase(),
          phone: phone.trim() || null,
          status: 'Active',
          band_id: bandId
        })
        .select()
        .single();

      if (insertError) throw insertError;

      setPlayers(prev => [...prev, newPlayer as Player].sort((a, b) => a.instrument.localeCompare(b.instrument)));
      setSuccess(`${name.trim()} added to your roster successfully!`);
      
      // Reset form fields
      setName('');
      setInstrument('');
      setEmail('');
      setPhone('');

    } catch (err: any) {
      setError(err.message || "Could not register player profile.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeletePlayer(player: Player) {
    if (!bandId) return;
    if (!confirm(`Are you absolutely sure you want to remove ${player.name} from your registry?`)) return;

    setError(null);
    setSuccess(null);

    try {
      // 🌟 SECURE MATCHING: Ensure they can only delete if the row matches BOTH player ID and their own band ID
      const { error: deleteError } = await supabase
        .from('players')
        .delete()
        .match({ id: player.id, band_id: bandId });

      if (deleteError) throw deleteError;

      setPlayers(prev => prev.filter(p => p.id !== player.id));
      setSuccess('Player profile detached from registry.');

    } catch (err: any) {
      setError(err.message || "Security block: Unable to drop player asset.");
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh', gap: '10px' }}>
        <Loader2 className="animate-spin" color="#1e3a5f" size={32} />
        <span style={{ color: '#64748b', fontWeight: 500 }}>Syncing secure roster data...</span>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', fontFamily: 'system-ui, sans-serif', maxWidth: '1200px', margin: '0 auto' }}>
      
      {/* Header Block */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
        <Users size={32} color="#1e3a5f" />
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#1e3a5f', margin: 0 }}>Band Roster Registry</h1>
          <p style={{ color: '#64748b', margin: '4px 0 0 0', fontSize: '14px' }}>Manage players securely isolated within your operational suite.</p>
        </div>
      </div>

      {/* Dynamic Feedback Overlays */}
      {error && (
        <div style={{ display: 'flex', gap: '8px', backgroundColor: '#fef2f2', border: '1px solid #fee2e2', color: '#991b1b', padding: '12px 16px', borderRadius: '8px', marginBottom: '24px', fontSize: '14px' }}>
          <ShieldAlert size={18} style={{ flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div style={{ display: 'flex', gap: '8px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', padding: '12px 16px', borderRadius: '8px', marginBottom: '24px', fontSize: '14px' }}>
          <CheckCircle size={18} style={{ flexShrink: 0 }} />
          <span>{success}</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '32px', alignItems: 'start' }}>
        
        {/* Left Column: Form Intake Box */}
        <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: '0 0 20px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <UserPlus size={20} color="#1e3a5f" /> Add New Musician
          </h2>
          
          <form onSubmit={handleAddPlayer} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Full Name</label>
              <input type="text" required value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Jane Doe" style={{ padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Instrument Assignment</label>
              <select required value={instrument} onChange={e => setInstrument(e.target.value)} style={{ padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px', backgroundColor: '#fff' }}>
                <option value="">Select section position...</option>
                <option value="Principal Cornet">Principal Cornet</option>
                <option value="Solo Cornet">Solo Cornet</option>
                <option value="Soprano Cornet">Soprano Cornet</option>
                <option value="Repiano Cornet">Repiano Cornet</option>
                <option value="2nd Cornet">2nd Cornet</option>
                <option value="3rd Cornet">3rd Cornet</option>
                <option value="Flugelhorn">Flugelhorn</option>
                <option value="Solo Horn">Solo Horn</option>
                <option value="1st Horn">1st Horn</option>
                <option value="2nd Horn">2nd Horn</option>
                <option value="1st Baritone">1st Baritone</option>
                <option value="2nd Baritone">2nd Baritone</option>
                <option value="Euphonium">Euphonium</option>
                <option value="1st Trombone">1st Trombone</option>
                <option value="2nd Trombone">2nd Trombone</option>
                <option value="Bass Trombone">Bass Trombone</option>
                <option value="EEb Bass">EEb Bass</option>
                <option value="BBb Bass">BBb Bass</option>
                <option value="Percussion">Percussion</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Email Address (For Notifications)</label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="musician@example.com" style={{ padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Phone Number (Optional)</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g., 07123 456789" style={{ padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px' }} />
            </div>

            <button type="submit" disabled={submitting} style={{ backgroundColor: '#1e3a5f', color: '#fff', border: 'none', padding: '12px', borderRadius: '6px', fontWeight: 600, fontSize: '14px', marginTop: '8px', cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.8 : 1 }}>
              {submitting ? 'Registering...' : 'Add to Band Roster'}
            </button>
          </form>
        </div>

        {/* Right Column: Grid Roster Table View */}
        <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: '0 0 20px 0' }}>
            Registered Members ({players.length})
          </h2>

          {players.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', border: '2px dashed #e2e8f0', borderRadius: '8px', color: '#64748b' }}>
              <Users size={24} style={{ margin: '0 auto 8px auto', opacity: 0.6 }} />
              <p style={{ margin: 0, fontSize: '14px', fontWeight: 500 }}>Your roster is empty.</p>
              <p style={{ margin: '4px 0 0 0', fontSize: '12px', opacity: 0.8 }}>Add players using the configuration interface to get started.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '550px', overflowY: 'auto' }}>
              {players.map(player => (
                <div key={player.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px', border: '1px solid #f1f5f9', backgroundColor: '#f8fafc', borderRadius: '8px' }}>
                  <div>
                    <h4 style={{ margin: '0 0 2px 0', fontSize: '15px', fontWeight: 600, color: '#0f172a' }}>{player.name}</h4>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#1e3a5f', backgroundColor: '#e0f2fe', padding: '2px 8px', borderRadius: '4px', display: 'inline-block', marginBottom: '4px' }}>
                      {player.instrument}
                    </span>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>{player.email}</div>
                  </div>
                  
                  <button onClick={() => handleDeletePlayer(player)} title="Delete player from database" style={{ border: 'none', backgroundColor: 'transparent', color: '#ef4444', cursor: 'pointer', padding: '8px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background-color 0.2s' }}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}