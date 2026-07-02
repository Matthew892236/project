import { useState, useEffect } from 'react';
import { Users, UserPlus, Trash2, ShieldAlert, CheckCircle, Loader2, Mail, GripVertical, Send, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core'; 
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface Player {
  id: string;
  name: string;
  instrument: string;
  email: string;
  phone?: string;
  status: string;
  band_id: number;
  sort_order?: number;
}

interface Concert {
  id: string;
  name: string;
  concert_date: string;
}

const STANDARD_INSTRUMENTS = [
  "Principal Cornet", "Solo Cornet", "Soprano Cornet", "Repiano Cornet",
  "2nd Cornet", "3rd Cornet", "Flugelhorn", "Solo Horn", "1st Horn", "2nd Horn",
  "1st Baritone", "2nd Baritone", "Euphonium", "1st Trombone", "2nd Trombone",
  "Bass Trombone", "EEb Bass", "BBb Bass", "Percussion"
];

// --- Sortable Player Row Component ---
function SortablePlayerRow({ player, onDelete, onEmailClick }: { player: Player, onDelete: (p: Player) => void, onEmailClick: (p: Player) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: player.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    display: 'flex',
    alignItems: 'center',
    padding: '8px 16px',
    backgroundColor: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    gap: '12px',
    position: 'relative' as const,
    zIndex: isDragging ? 10 : 1
  };

  return (
    <div ref={setNodeRef} style={style}>
      {/* Drag Handle */}
      <div {...attributes} {...listeners} style={{ cursor: 'grab', color: '#94a3b8', display: 'flex', padding: '4px' }}>
        <GripVertical size={16} />
      </div>
      
      {/* Player Name */}
      <div style={{ flex: 1, fontWeight: 600, color: '#0f172a', fontSize: '14px' }}>
        {player.name}
      </div>

      {/* Status Tag */}
      <div style={{ width: '100px' }}>
        <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '12px', fontWeight: 600, backgroundColor: player.status === 'Active' ? '#dcfce7' : '#fef3c7', color: player.status === 'Active' ? '#166534' : '#92400e' }}>
          {player.status}
        </span>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '8px' }}>
        {/* 🌟 Changed from <a> to a button that triggers our local context popup modal */}
        <button 
          type="button"
          onClick={() => onEmailClick(player)}
          title={`Compose dispatch to ${player.name}`}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '6px', backgroundColor: '#eff6ff', color: '#3b82f6', border: 'none', cursor: 'pointer', transition: 'background 0.2s' }}
        >
          <Mail size={16} />
        </button>
        <button 
          type="button"
          onClick={() => onDelete(player)} 
          title="Remove from roster"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '6px', backgroundColor: '#fef2f2', color: '#ef4444', border: 'none', cursor: 'pointer', transition: 'background 0.2s' }}
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}

export default function BandRoster() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [concerts, setConcerts] = useState<Concert[]>([]); // 🌟 Concert Dropdown Options State
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
  const [status, setStatus] = useState('Active');

  // 🌟 Email Modal Overlay State
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [activeEmailPlayer, setActiveEmailPlayer] = useState<Player | null>(null);
  const [emailContext, setEmailContext] = useState('general');
  const [emailMessage, setEmailMessage] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

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

      // Fetch band roster and upcoming live concerts simultaneously
      const [rosterData, concertsData] = await Promise.all([
        supabase.from('players').select('*').eq('band_id', band.id).order('sort_order'),
        supabase.from('concerts').select('id, name, concert_date').eq('band_id', band.id).eq('status', 'live').order('concert_date')
      ]);

      if (rosterData.data) setPlayers(rosterData.data as Player[]);
      if (concertsData.data) setConcerts(concertsData.data as Concert[]);
    } catch (err: any) {
      setError(err.message || "Failed to load roster configuration.");
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
      const sectionPlayers = players.filter(p => p.instrument === instrument);
      const newSortOrder = sectionPlayers.length;

      const { data: newPlayer, error: insertError } = await supabase
        .from('players')
        .insert({ name: name.trim(), instrument, email: email.trim().toLowerCase(), phone: phone.trim() || null, status, band_id: bandId, sort_order: newSortOrder })
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

  async function handleDragEnd(event: DragEndEvent, instrumentSection: string) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const section = players.filter(p => p.instrument === instrumentSection);
    const oldIdx = section.findIndex(p => p.id === active.id);
    const newIdx = section.findIndex(p => p.id === over.id);

    if (oldIdx === -1 || newIdx === -1) return;

    const reordered = arrayMove(section, oldIdx, newIdx);

    setPlayers(prev => {
      const others = prev.filter(p => p.instrument !== instrumentSection);
      return [...others, ...reordered];
    });

    await Promise.all(
      reordered.map((p, i) => supabase.from('players').update({ sort_order: i }).eq('id', p.id))
    );
  }

  // 🌟 Open Popup with Target Player Details Passed Down From Row Button
  function openEmailModal(player: Player) {
    setActiveEmailPlayer(player);
    setEmailContext('general');
    setEmailMessage('');
    setEmailModalOpen(true);
  }

  // 🌟 Handle Custom Message Dispatch via System Client Mailto Fallback Loop
  async function handleSendEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!activeEmailPlayer) return;
    setSendingEmail(true);

    const selectedConcert = concerts.find(c => c.id === emailContext);
    const subjectLine = emailContext === 'general' 
      ? `General Update — Band Management`
      : `Gig Notice: ${selectedConcert?.name}`;

    try {
      // Intended for background edge dispatch integration
      const { error: dispatchError } = await supabase.functions.invoke('send-custom-email', {
        body: { to: activeEmailPlayer.email, subject: subjectLine, msg: emailMessage }
      });
      if (dispatchError) throw dispatchError;
      setSuccess(`Message routed successfully to ${activeEmailPlayer.name}.`);
    } catch {
      // Clean fallback if background automation suite hasn't compiled yet
      window.location.href = `mailto:${activeEmailPlayer.email}?subject=${encodeURIComponent(subjectLine)}&body=${encodeURIComponent(emailMessage)}`;
      setSuccess(`Opened system mailing client for ${activeEmailPlayer.name}.`);
    } finally {
      setSendingEmail(false);
      setEmailModalOpen(false);
    }
  }

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'system-ui' }}><Loader2 className="animate-spin" /> Loading roster...</div>;

  return (
    <div style={{ padding: '32px', fontFamily: 'system-ui', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
        <Users size={36} color="#1e3a5f" />
        <h1 style={{ fontSize: '32px', fontWeight: 800, color: '#1e3a5f', margin: 0 }}>Band Roster</h1>
      </div>

      {error && <div style={{ backgroundColor: '#fef2f2', color: '#991b1b', padding: '16px', borderRadius: '8px', marginBottom: '24px', display: 'flex', gap: '8px' }}><ShieldAlert size={20}/> {error}</div>}
      {success && <div style={{ backgroundColor: '#f0fdf4', color: '#166534', padding: '16px', borderRadius: '8px', marginBottom: '24px', display: 'flex', gap: '8px' }}><CheckCircle size={20}/> {success}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(320px, 1fr)', gap: '32px', alignItems: 'start' }}>
        
        {/* LEFT COLUMN: Roster Table Row Matrix */}
        <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 24px', backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
             <h2 style={{ fontSize: '18px', margin: 0, color: '#0f172a' }}>Current Instrumentation</h2>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {STANDARD_INSTRUMENTS.map(inst => {
              const seatPlayers = players.filter(p => p.instrument === inst);
              
              return (
                <div key={inst} style={{ display: 'flex', borderBottom: '1px solid #f1f5f9', minHeight: '56px' }}>
                  <div style={{ width: '200px', padding: '16px 20px', backgroundColor: '#f8fafc', fontWeight: 600, color: '#475569', fontSize: '14px', borderRight: '1px solid #e2e8f0', flexShrink: 0 }}>
                    {inst}
                  </div>
                  
                  <div style={{ flex: 1, padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', backgroundColor: '#ffffff' }}>
                    {seatPlayers.length > 0 ? (
                      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEnd(e, inst)}>
                        <SortableContext items={seatPlayers.map(p => p.id)} strategy={verticalListSortingStrategy}>
                          {seatPlayers.map(p => (
                            <SortablePlayerRow key={p.id} player={p} onDelete={handleDeletePlayer} onEmailClick={openEmailModal} />
                          ))}
                        </SortableContext>
                      </DndContext>
                    ) : (
                      <div style={{ color: '#64748b', fontSize: '13px', display: 'flex', alignItems: 'center', fontWeight: 500, backgroundColor: '#f8fafc', border: '1px dashed #cbd5e1', padding: '8px 16px', borderRadius: '6px', width: 'fit-content', fontStyle: 'italic' }}>
                        Position Vacant
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT COLUMN: Player Form */}
        <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', position: 'sticky', top: '24px' }}>
          <h2 style={{ fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px', color: '#0f172a', margin: '0 0 20px 0' }}><UserPlus size={20} /> Add Musician</h2>
          <form onSubmit={handleAddPlayer} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <input type="text" required value={name} onChange={e => setName(e.target.value)} placeholder="Full Name" style={{ padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
            <select required value={instrument} onChange={e => setInstrument(e.target.value)} style={{ padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#fff', fontSize: '14px' }}>
              <option value="">Select instrument...</option>
              {STANDARD_INSTRUMENTS.map(inst => <option key={inst} value={inst}>{inst}</option>)}
            </select>
            <select required value={status} onChange={e => setStatus(e.target.value)} style={{ padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#fff', fontSize: '14px' }}>
              <option value="Active">Active Core Player</option>
              <option value="Spare">Local Spare / Dep</option>
            </select>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="Email Address" style={{ padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone (Optional)" style={{ padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
            <button type="submit" disabled={submitting} style={{ padding: '12px', backgroundColor: '#1e3a5f', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: 'bold', marginTop: '8px', cursor: submitting ? 'not-allowed' : 'pointer' }}>{submitting ? 'Saving...' : 'Add Player'}</button>
          </form>
        </div>

      </div>

      {/* 🌟 CONTEXT EMAIL POPUP MODAL SCREEN */}
      {emailModalOpen && activeEmailPlayer && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000 }}>
          <div style={{ background: '#ffffff', width: '460px', maxWidth: '90vw', borderRadius: '12px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            
            {/* Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8fafc' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>Message {activeEmailPlayer.name}</h3>
                <span style={{ fontSize: '12px', color: '#64748b' }}>Direct dispatch to ({activeEmailPlayer.email})</span>
              </div>
              <button type="button" onClick={() => setEmailModalOpen(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={18} /></button>
            </div>

            {/* Modal Content Body Form */}
            <form onSubmit={handleSendEmail} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* Dynamic Context Selector Dropdown */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Email Topic / Reference</label>
                <select 
                  value={emailContext} 
                  onChange={e => setEmailContext(e.target.value)}
                  style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#fff', fontSize: '14px' }}
                >
                  <option value="general">General Message (No gig reference)</option>
                  {concerts.map(concert => (
                    <option key={concert.id} value={concert.id}>
                      Regarding Gig: {concert.name} ({new Date(concert.concert_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })})
                    </option>
                  ))}
                </select>
              </div>

              {/* Message Box */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Message Content</label>
                <textarea 
                  required
                  rows={5}
                  value={emailMessage}
                  onChange={e => setEmailMessage(e.target.value)}
                  placeholder="Type your notice description or instructions here..."
                  style={{ padding: '12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>

              {/* Modal Footer Controls */}
              <div style={{ display: 'flex', gap: '12px', marginTop: '8px', justifyContent: 'flex-end' }}>
                <button 
                  type="button" 
                  onClick={() => setEmailModalOpen(false)} 
                  style={{ padding: '8px 16px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={sendingEmail}
                  style={{ padding: '8px 16px', background: '#1e3a5f', color: '#ffffff', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Send size={14} /> {sendingEmail ? 'Dispatching...' : 'Send Message'}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
}
