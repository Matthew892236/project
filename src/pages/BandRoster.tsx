import { useState, useEffect } from 'react';
import { Users, Trash2, Loader2, Mail, GripVertical, Send, X, Edit, Search, Settings, ChevronUp, ChevronDown, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, useDroppable } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core'; 
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
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
  tags?: string[];
}

interface Concert {
  id: string;
  name: string;
  concert_date: string;
}

const STANDARD_INSTRUMENTS = [
  "Conductor", "Soprano Cornet", "Principal Cornet", "Solo Cornet", "Repiano Cornet",
  "2nd Cornet", "3rd Cornet", "Flugelhorn", "Solo Horn", "1st Horn", "2nd Horn",
  "1st Baritone", "2nd Baritone", "Euphonium", "1st Trombone", "2nd Trombone",
  "Bass Trombone", "EEb Bass", "BBb Bass", "Percussion"
];

function EmptyChairDropzone({ instrument }: { instrument: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: `empty-${instrument}` });
  return (
    <div ref={setNodeRef} style={{ color: '#94a3b8', fontSize: '13px', display: 'flex', alignItems: 'center', fontWeight: 500, backgroundColor: isOver ? '#e0f2fe' : '#f8fafc', border: isOver ? '1px dashed #0284c7' : '1px dashed #e2e8f0', padding: '6px 12px', borderRadius: '6px', width: 'fit-content', fontStyle: 'italic', transition: 'all 0.2s', minHeight: '32px' }}>
      Position Vacant
    </div>
  );
}

function SortablePlayerRow({ player, onDelete, onEmailClick, onEditClick }: { player: Player, onDelete: (p: Player) => void, onEmailClick: (p: Player) => void, onEditClick: (p: Player) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: player.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    display: 'flex',
    alignItems: 'center',
    padding: '4px 12px', 
    backgroundColor: isDragging ? '#f8fafc' : '#ffffff',
    border: isDragging ? '1px solid #93c5fd' : '1px solid #e2e8f0',
    borderRadius: '6px',
    gap: '8px',
    position: 'relative' as const,
    zIndex: isDragging ? 50 : 1
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div {...attributes} {...listeners} style={{ cursor: 'grab', color: '#cbd5e1', display: 'flex', padding: '2px' }}>
        <GripVertical size={14} />
      </div>
      
      <div style={{ flex: 1, fontWeight: 600, color: '#0f172a', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          {player.name}
          {player.tags && player.tags.filter(t => t.trim() !== '').map(tag => (
            <span key={tag} style={{ fontSize: '10px', backgroundColor: '#f1f5f9', color: '#475569', padding: '1px 6px', borderRadius: '4px', border: '1px solid #e2e8f0', fontWeight: 500 }}>
              {tag}
            </span>
          ))}
        </div>
        {player.status === 'Spare' && <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>{player.instrument}</span>}
      </div>

      <div style={{ width: '80px' }}>
        <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '10px', fontWeight: 600, backgroundColor: player.status === 'Active' ? '#dcfce7' : '#fef3c7', color: player.status === 'Active' ? '#166534' : '#92400e' }}>
          {player.status}
        </span>
      </div>

      <div style={{ display: 'flex', gap: '4px' }}>
        <button type="button" onClick={() => onEditClick(player)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px', borderRadius: '4px', backgroundColor: '#f1f5f9', color: '#475569', border: 'none', cursor: 'pointer' }}>
          <Edit size={14} />
        </button>
        <button type="button" onClick={() => onEmailClick(player)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px', borderRadius: '4px', backgroundColor: '#eff6ff', color: '#3b82f6', border: 'none', cursor: 'pointer' }}>
          <Mail size={14} />
        </button>
        <button type="button" onClick={() => onDelete(player)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px', borderRadius: '4px', backgroundColor: '#fef2f2', color: '#ef4444', border: 'none', cursor: 'pointer' }}>
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

export default function BandRoster() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [concerts, setConcerts] = useState<Concert[]>([]); 
  const [bandId, setBandId] = useState<number | null>(null);
  const [bandInstruments, setBandInstruments] = useState<string[]>(STANDARD_INSTRUMENTS);
  const [manageSectionsOpen, setManageSectionsOpen] = useState(false);
  const [editInstruments, setEditInstruments] = useState<string[]>([]);
  const [newInstName, setNewInstName] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [hideEmpty, setHideEmpty] = useState(false);

  const [name, setName] = useState('');
  const [instrument, setInstrument] = useState('');
  const [customAddInstrument, setCustomAddInstrument] = useState('');
  const [secondaryInstrumentsInput, setSecondaryInstrumentsInput] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState('Active');

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editPlayer, setEditPlayer] = useState<Player | null>(null);
  const [editCustomInstrument, setEditCustomInstrument] = useState('');
  const [editSecondaryInput, setEditSecondaryInput] = useState('');

  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [activeEmailPlayer, setActiveEmailPlayer] = useState<Player | null>(null);
  const [emailContext, setEmailContext] = useState('general');
  const [emailMessage, setEmailMessage] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);

  const [toast, setToast] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => { fetchIsolatedRoster(); }, []);

  async function fetchIsolatedRoster() {
    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return;
      const { data: band } = await supabase.from('bands').select('*').eq('manager_id', userData.user.id).maybeSingle();
      if (!band) return setLoading(false);
      setBandId(band.id);
      if (band.instrumentation && Array.isArray(band.instrumentation)) {
        setBandInstruments(band.instrumentation);
      }
      const [rosterData, concertsData] = await Promise.all([
        supabase.from('players').select('*').eq('band_id', band.id).order('sort_order'),
        supabase.from('concerts').select('id, name, concert_date').eq('band_id', band.id).eq('status', 'live').order('concert_date')
      ]);
      if (rosterData.data) setPlayers(rosterData.data as Player[]);
      if (concertsData.data) setConcerts(concertsData.data as Concert[]);
    } catch (err: any) { setError(err.message || "Failed to load roster configuration."); } finally { setLoading(false); }
  }

  function openManageSections() {
    setEditInstruments([...bandInstruments]);
    setNewInstName('');
    setManageSectionsOpen(true);
  }

  function moveInstUp(index: number) {
    if (index === 0) return;
    const newArr = [...editInstruments];
    [newArr[index - 1], newArr[index]] = [newArr[index], newArr[index - 1]];
    setEditInstruments(newArr);
  }

  function moveInstDown(index: number) {
    if (index === editInstruments.length - 1) return;
    const newArr = [...editInstruments];
    [newArr[index + 1], newArr[index]] = [newArr[index], newArr[index + 1]];
    setEditInstruments(newArr);
  }

  function removeInst(index: number) {
    setEditInstruments(prev => prev.filter((_, i) => i !== index));
  }

  function addInst() {
    if (!newInstName.trim()) return;
    setEditInstruments(prev => [...prev, newInstName.trim()]);
    setNewInstName('');
  }

  async function saveInstrumentation() {
    if (!bandId) return;
    setSubmitting(true);
    try {
      const { error: updateError } = await supabase.from('bands').update({ instrumentation: editInstruments }).eq('id', bandId);
      if (updateError) throw updateError;
      setBandInstruments(editInstruments);
      setSuccess("Instrumentation updated.");
      setManageSectionsOpen(false);
    } catch { setError("Database synchronization blocked."); } finally { setSubmitting(false); }
  }

  async function handleAddPlayer(e: React.FormEvent) {
    e.preventDefault();
    if (!bandId) return setError("No active band profile resolved.");
    setSubmitting(true); setError(null); setSuccess(null);
    const finalInstrument = instrument === 'custom' ? customAddInstrument.trim() : instrument;
    const cleanEmail = email.trim().toLowerCase();
    const cleanTags = secondaryInstrumentsInput.split(',').map(t => t.trim()).filter(t => t !== '');

    try {
      const sectionPlayers = players.filter(p => p.instrument === finalInstrument);
      const { data: newPlayer, error: insErr } = await supabase.from('players').insert({ name: name.trim(), instrument: finalInstrument, email: cleanEmail, phone: phone.trim() || null, status, band_id: bandId, sort_order: sectionPlayers.length, tags: cleanTags }).select().single();
      if (insErr) throw insErr;
      setPlayers(prev => [...prev, newPlayer as Player]);
      setSuccess(`${name.trim()} added successfully!`);
      setName(''); setInstrument(''); setCustomAddInstrument(''); setSecondaryInstrumentsInput(''); setEmail(''); setPhone(''); setStatus('Active');
    } catch (err: any) { setError(err.message); } finally { setSubmitting(false); }
  }

  function openEditModal(player: Player) {
    setEditPlayer({ ...player });
    setEditCustomInstrument(bandInstruments.includes(player.instrument) ? '' : player.instrument);
    setEditSecondaryInput(player.tags ? player.tags.join(', ') : '');
    if (!bandInstruments.includes(player.instrument)) { setEditPlayer({ ...player, instrument: 'custom' }); }
    setEditModalOpen(true);
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editPlayer) return;
    setSubmitting(true);
    const finalInstrument = editPlayer.instrument === 'custom' ? editCustomInstrument.trim() : editPlayer.instrument;
    const cleanTags = editSecondaryInput.split(',').map(t => t.trim()).filter(t => t !== '');

    try {
      const { error: upErr } = await supabase.from('players').update({ name: editPlayer.name.trim(), instrument: finalInstrument, email: editPlayer.email.trim().toLowerCase(), phone: editPlayer.phone?.trim() || null, status: editPlayer.status, tags: cleanTags }).eq('id', editPlayer.id);
      if (upErr) throw upErr;
      setPlayers(prev => prev.map(p => p.id === editPlayer.id ? { ...editPlayer, instrument: finalInstrument, tags: cleanTags } : p));
      setSuccess("Profile updated.");
      setEditModalOpen(false);
    } catch (err: any) { setError(err.message); } finally { setSubmitting(false); }
  }

  async function handleDeletePlayer(player: Player) {
    if (!bandId || !confirm(`Remove ${player.name}?`)) return;
    try {
      await supabase.from('players').delete().match({ id: player.id, band_id: bandId });
      setPlayers(prev => prev.filter(p => p.id !== player.id));
    } catch { setError("Security blocker active."); }
  }

  function openEmailModal(player: Player) {
    setActiveEmailPlayer(player); setEmailContext('general'); setEmailMessage(''); setEmailModalOpen(true);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activePlayer = players.find(p => p.id === active.id);
    if (!activePlayer) return;

    const overIdStr = String(over.id);

    if (activePlayer.status === 'Spare') {
      const overPlayer = players.find(p => p.id === over.id);
      if (!overPlayer || overPlayer.status !== 'Spare') return;
      const section = players.filter(p => p.status === 'Spare');
      const oldIdx = section.findIndex(p => p.id === active.id);
      const newIdx = section.findIndex(p => p.id === over.id);
      const reordered = arrayMove(section, oldIdx, newIdx);
      setPlayers(prev => [...prev.filter(p => p.status !== 'Spare'), ...reordered]);
      await Promise.all(reordered.map((p, i) => supabase.from('players').update({ sort_order: i }).eq('id', p.id)));
      return;
    }

    let targetInstrument = '';
    let targetIndex = -1;

    if (overIdStr.startsWith('empty-')) {
      targetInstrument = overIdStr.replace('empty-', '');
      targetIndex = 0;
    } else {
      const overPlayer = players.find(p => p.id === over.id);
      if (overPlayer && overPlayer.status !== 'Spare') {
        targetInstrument = overPlayer.instrument;
        const section = players.filter(p => p.instrument === targetInstrument && p.status === 'Active');
        targetIndex = section.findIndex(p => p.id === over.id);
      }
    }

    if (!targetInstrument) return;

    // 🌟 FULL FREEDOM: No isMoveAllowed checks. Move ANYONE to ANY SEAT.
    let newPlayers = [...players];
    const activeIdx = newPlayers.findIndex(p => p.id === activePlayer.id);

    if (activePlayer.instrument === targetInstrument) {
      // Reordering within the SAME section
      const section = newPlayers.filter(p => p.instrument === targetInstrument && p.status === 'Active');
      const oIdx = section.findIndex(p => p.id === active.id);
      const nIdx = section.findIndex(p => p.id === over.id);
      const reorderedSection = arrayMove(section, oIdx, nIdx);
      setPlayers([...newPlayers.filter(p => !(p.instrument === targetInstrument && p.status === 'Active')), ...reorderedSection]);
      await Promise.all(reorderedSection.map((p, i) => supabase.from('players').update({ sort_order: i }).eq('id', p.id)));
    } else {
      // Moving to a DIFFERENT section
      const movingPlayer = { ...newPlayers[activeIdx], instrument: targetInstrument };
      newPlayers.splice(activeIdx, 1);
      
      const targetSection = newPlayers.filter(p => p.instrument === targetInstrument && p.status === 'Active');
      targetSection.splice(targetIndex === -1 ? targetSection.length : targetIndex, 0, movingPlayer);
      
      const oldSection = newPlayers.filter(p => p.instrument === activePlayer.instrument && p.status === 'Active');
      
      const unchangedPlayers = newPlayers.filter(p => 
         !(p.instrument === targetInstrument && p.status === 'Active') && 
         !(p.instrument === activePlayer.instrument && p.status === 'Active')
      );
      
      setPlayers([...unchangedPlayers, ...oldSection, ...targetSection]);
      
      await supabase.from('players').update({ instrument: targetInstrument }).eq('id', movingPlayer.id);
      await Promise.all(targetSection.map((p, i) => supabase.from('players').update({ sort_order: i }).eq('id', p.id)));
      await Promise.all(oldSection.map((p, i) => supabase.from('players').update({ sort_order: i }).eq('id', p.id)));
    }
  }

  async function handleSendEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!activeEmailPlayer) return;
    setSendingEmail(true);
    const selectedConcert = concerts.find(c => c.id === emailContext);
    const subjectLine = emailContext === 'general' ? `General Notice` : `Gig Notice: ${selectedConcert?.name}`;
    try {
      await supabase.functions.invoke('send-custom-email', { body: { to: activeEmailPlayer.email, subject: subjectLine, msg: emailMessage } });
      setToast('Message dispatched.');
    } catch { setError('Email routing error.'); } finally { setSendingEmail(false); setEmailModalOpen(false); }
  }

  const activePlayers = players.filter(p => p.status === 'Active');
  const sparePlayers = players.filter(p => p.status === 'Spare');
  const existingInstruments = Array.from(new Set(activePlayers.map(p => p.instrument)));
  const displayInstruments = Array.from(new Set([...bandInstruments, ...existingInstruments]));
  
  const filteredInstruments = displayInstruments.filter(inst => {
    // 🌟 REMOVED TAG CHECK: Only checks exact primary instrument match now
    const seatPlayers = activePlayers.filter(p => p.instrument === inst);
    if (hideEmpty && seatPlayers.length === 0) return false;
    if (searchQuery.trim() !== '') {
      return inst.toLowerCase().includes(searchQuery.toLowerCase()) || seatPlayers.some(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    return true;
  });

  const visibleSpares = searchQuery.trim() !== '' 
    ? sparePlayers.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : sparePlayers;

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'system-ui', color: '#64748b' }}><Loader2 className="animate-spin" /> Loading Roster Dashboard...</div>;

  return (
    <div style={{ padding: '24px', fontFamily: 'system-ui, sans-serif', maxWidth: '1400px', margin: '0 auto', boxSizing: 'border-box' }}>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <Users size={28} color="#1e3a5f" />
        <div><h1 style={{ fontSize: '24px', fontWeight: 800, color: '#1e3a5f', margin: 0 }}>Band Roster</h1></div>
      </div>

      {error && <div style={{ backgroundColor: '#fef2f2', color: '#991b1b', padding: '10px', borderRadius: '6px', marginBottom: '16px', fontSize: '13px' }}>{error}</div>}
      {success && <div style={{ backgroundColor: '#f0fdf4', color: '#166534', padding: '10px', borderRadius: '6px', marginBottom: '16px', fontSize: '13px' }}>{success}</div>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'flex-start' }}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <div style={{ flex: '1 1 600px', minWidth: '300px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', backgroundColor: '#fff', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                <input type="text" placeholder="Search roster..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ width: '100%', padding: '6px 10px 6px 32px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box', outline: 'none' }} />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: '#475569', cursor: 'pointer' }}>
                <input type="checkbox" checked={hideEmpty} onChange={e => setHideEmpty(e.target.checked)} style={{ width: '14px', height: '14px' }} /> Hide Empty Chairs
              </label>
            </div>

            <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
              <div style={{ padding: '10px 16px', backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                 <h2 style={{ fontSize: '14px', fontWeight: 700, margin: 0, color: '#0f172a' }}>Current Instrumentation Grid</h2>
                 <button onClick={openManageSections} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px', backgroundColor: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', fontWeight: 600, color: '#475569', cursor: 'pointer' }}><Settings size={12} /> Edit Sections</button>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {filteredInstruments.map(inst => {
                  // 🌟 REMOVED TAG CHECK: Only checks exact primary instrument match now
                  const seatPlayers = activePlayers.filter(p => p.instrument === inst);
                  const visiblePlayers = searchQuery.trim() !== '' ? seatPlayers.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase())) : seatPlayers;
                  return (
                    <div key={inst} style={{ display: 'flex', flexWrap: 'wrap', borderBottom: '1px solid #f1f5f9', minHeight: '38px' }}>
                      <div style={{ width: '180px', padding: '8px 14px', backgroundColor: '#f8fafc', fontWeight: 600, color: '#475569', fontSize: '13px', borderRight: '1px solid #e2e8f0', flexShrink: 0 }}>{inst}</div>
                      <div style={{ flex: '1 1 300px', padding: '6px', display: 'flex', flexDirection: 'column', gap: '4px', backgroundColor: '#ffffff' }}>
                        <SortableContext id={`context-${inst}`} items={visiblePlayers.map(p => p.id)} strategy={verticalListSortingStrategy}>
                          {visiblePlayers.length > 0 ? visiblePlayers.map(p => (
                            <SortablePlayerRow key={p.id} player={p} onDelete={handleDeletePlayer} onEmailClick={openEmailModal} onEditClick={openEditModal} />
                          )) : <EmptyChairDropzone instrument={inst} />}
                        </SortableContext>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {visibleSpares.length > 0 && (
              <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                <div style={{ padding: '10px 16px', backgroundColor: '#1e3a5f', borderBottom: '1px solid #e2e8f0' }}><h2 style={{ fontSize: '14px', margin: 0, color: '#ffffff', fontWeight: 700 }}>Local Band Spares / Dep List</h2></div>
                <div style={{ padding: '6px', display: 'flex', flexDirection: 'column', gap: '4px', backgroundColor: '#ffffff' }}>
                  <SortableContext id="context-spares" items={visibleSpares.map(p => p.id)} strategy={verticalListSortingStrategy}>
                    {visibleSpares.map(p => (
                      <SortablePlayerRow key={p.id} player={p} onDelete={handleDeletePlayer} onEmailClick={openEmailModal} onEditClick={openEditModal} />
                    ))}
                  </SortableContext>
                </div>
              </div>
            )}
          </div>
        </DndContext>

        <div style={{ flex: '1 1 300px', minWidth: '260px', backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', position: 'sticky', top: '24px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', margin: '0 0 12px 0' }}>Add Musician</h2>
          <form onSubmit={handleAddPlayer} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <input type="text" required value={name} onChange={e => setName(e.target.value)} placeholder="Full Name" style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none' }} />
            <select required value={instrument} onChange={e => setInstrument(e.target.value)} style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#fff', fontSize: '13px', outline: 'none' }}>
              <option value="">Primary instrument...</option>
              {bandInstruments.map(inst => <option key={inst} value={inst}>{inst}</option>)}
              <option value="custom">+ Custom Instrument...</option>
            </select>
            {instrument === 'custom' && <input type="text" required value={customAddInstrument} onChange={e => setCustomAddInstrument(e.target.value)} placeholder="Custom instrument name..." style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid #2563eb', fontSize: '13px', backgroundColor: '#eff6ff' }} />}
            <input type="text" value={secondaryInstrumentsInput} onChange={e => setSecondaryInstrumentsInput(e.target.value)} placeholder="Secondary Instruments (e.g. Solo Horn, 1st Horn)" style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none' }} />
            <select required value={status} onChange={e => setStatus(e.target.value)} style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#fff', fontSize: '13px' }}>
              <option value="Active">Active Core Player</option>
              <option value="Spare">Local Spare / Dep</option>
            </select>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="Email Address" style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }} />
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone (Optional)" style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }} />
            <button type="submit" disabled={submitting} style={{ padding: '10px', backgroundColor: '#1e3a5f', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}>{submitting ? 'Saving...' : 'Add Player'}</button>
          </form>
        </div>
      </div>

      {manageSectionsOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000 }}>
          <div style={{ background: '#ffffff', width: '460px', maxWidth: '90vw', borderRadius: '12px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8fafc' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>Manage Instrumentation</h3>
              <button type="button" onClick={() => setManageSectionsOpen(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={18} /></button>
            </div>
            <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {editInstruments.map((inst, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>{inst}</span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button onClick={() => moveInstUp(idx)} disabled={idx === 0} style={{ padding: '4px', background: 'transparent', border: 'none', cursor: 'pointer' }}><ChevronUp size={16}/></button>
                      <button onClick={() => moveInstDown(idx)} disabled={idx === editInstruments.length - 1} style={{ padding: '4px', background: 'transparent', border: 'none', cursor: 'pointer' }}><ChevronDown size={16}/></button>
                      <button onClick={() => removeInst(idx)} style={{ padding: '4px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#ef4444' }}><Trash2 size={16}/></button>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
                <input type="text" value={newInstName} onChange={e => setNewInstName(e.target.value)} placeholder="Add new section name..." style={{ flex: 1, padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
                <button type="button" onClick={addInst} style={{ padding: '10px 16px', background: '#e0f2fe', color: '#0369a1', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}><Plus size={16} /></button>
              </div>
            </div>
            <div style={{ padding: '16px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '12px', backgroundColor: '#fff' }}>
              <button type="button" onClick={() => setManageSectionsOpen(false)} style={{ padding: '8px 16px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '13px' }}>Cancel</button>
              <button type="button" onClick={saveInstrumentation} disabled={submitting} style={{ padding: '8px 16px', background: '#1e3a5f', color: '#ffffff', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '13px' }}>{submitting ? 'Saving...' : 'Save Configuration'}</button>
            </div>
          </div>
        </div>
      )}

      {editModalOpen && editPlayer && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000 }}>
          <div style={{ background: '#ffffff', width: '400px', maxWidth: '90vw', borderRadius: '12px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8fafc' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>Edit Player Profile</h3>
              <button type="button" onClick={() => setEditModalOpen(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={18} /></button>
            </div>
            <form onSubmit={handleEditSubmit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Name</label>
                <input type="text" required value={editPlayer.name} onChange={e => setEditPlayer({...editPlayer, name: e.target.value})} style={{ padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Primary Instrument</label>
                <select required value={editPlayer.instrument} onChange={e => setEditPlayer({...editPlayer, instrument: e.target.value})} style={{ padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#fff', fontSize: '14px' }}>
                  {bandInstruments.map(inst => <option key={inst} value={inst}>{inst}</option>)}
                  <option value="custom">+ Custom / Other...</option>
                </select>
                {editPlayer.instrument === 'custom' && (
                  <input type="text" required value={editCustomInstrument} onChange={e => setEditCustomInstrument(e.target.value)} placeholder="Type custom instrument name..." style={{ padding: '10px 12px', borderRadius: '6px', border: '1px solid #2563eb', fontSize: '14px', backgroundColor: '#eff6ff', marginTop: '4px' }} />
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Secondary Instruments / Tags</label>
                <input type="text" value={editSecondaryInput} onChange={e => setEditSecondaryInput(e.target.value)} placeholder="e.g. Solo Horn, 2nd Cornet" style={{ padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Status</label>
                <select required value={editPlayer.status} onChange={e => setEditPlayer({...editPlayer, status: e.target.value})} style={{ padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#fff', fontSize: '14px' }}>
                  <option value="Active">Active Core Player</option>
                  <option value="Spare">Local Spare / Dep</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Email</label>
                  <input type="email" required value={editPlayer.email} onChange={e => setEditPlayer({...editPlayer, email: e.target.value})} style={{ padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Phone</label>
                  <input type="tel" value={editPlayer.phone || ''} onChange={e => setEditPlayer({...editPlayer, phone: e.target.value})} style={{ padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '8px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setEditModalOpen(false)} style={{ padding: '8px 16px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '13px' }}>Cancel</button>
                <button type="submit" disabled={submitting} style={{ padding: '8px 16px', background: '#1e3a5f', color: '#ffffff', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '13px' }}>Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {emailModalOpen && activeEmailPlayer && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000 }}>
          <div style={{ background: '#ffffff', width: '460px', maxWidth: '90vw', borderRadius: '12px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8fafc' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>Message {activeEmailPlayer.name}</h3>
                <span style={{ fontSize: '12px', color: '#64748b' }}>Direct dispatch to ({activeEmailPlayer.email})</span>
              </div>
              <button type="button" onClick={() => setEmailModalOpen(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={18} /></button>
            </div>
            <form onSubmit={handleSendEmail} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Email Topic / Reference</label>
                <select value={emailContext} onChange={e => setEmailContext(e.target.value)} style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#fff', fontSize: '14px' }}>
                  <option value="general">General Message (No gig reference)</option>
                  {concerts.map(concert => (
                    <option key={concert.id} value={concert.id}>Regarding Gig: {concert.name} ({new Date(concert.concert_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })})</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Message Content</label>
                <textarea required rows={5} value={emailMessage} onChange={e => setEmailMessage(e.target.value)} placeholder="Type your notice description here..." style={{ padding: '12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', resize: 'vertical', fontFamily: 'inherit' }} />
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '8px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setEmailModalOpen(false)} style={{ padding: '8px 16px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '13px' }}>Cancel</button>
                <button type="submit" disabled={sendingEmail} style={{ padding: '8px 16px', background: '#1e3a5f', color: '#ffffff', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}><Send size={14} /> {sendingEmail ? 'Dispatching...' : 'Send Message'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && <div style={{ position: 'fixed', bottom: '24px', right: '24px', background: '#0f172a', color: '#fff', padding: '12px 24px', borderRadius: '8px', zIndex: 10000, fontWeight: 500 }}>{toast}</div>}
    </div>
  );
}