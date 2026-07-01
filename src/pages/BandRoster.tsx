import { useEffect, useState, Fragment } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus, Edit, Trash2, X, Mail, Phone, Tag, Search, Send, GripVertical, Music } from 'lucide-react';
import { supabase, INSTRUMENTS, fetchAllInstruments } from '../lib/supabase';
import type { Player, Concert, CustomInstrument } from '../lib/supabase';

function SortablePlayerRow({
  player,
  onEdit,
  onDelete,
  onInvite,
  showInvite,
}: {
  player: Player;
  onEdit: (p: Player) => void;
  onDelete: (p: Player) => void;
  onInvite: (p: Player) => void;
  showInvite: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: player.id });
  return (
    <tr
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
    >
      <td style={{ width: '28px', padding: '0 4px 0 8px' }}>
        <span {...attributes} {...listeners} className="drag-handle" style={{ cursor: 'grab', display: 'flex', alignItems: 'center', color: 'var(--text-light)' }}>
          <GripVertical size={14} />
        </span>
      </td>
      <td style={{ fontWeight: 600 }}>{player.name}</td>
      <td>
        {player.email && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Mail size={14} />
            <a href={`mailto:${player.email}`} style={{ color: 'var(--primary)', textDecoration: 'none' }}>{player.email}</a>
          </div>
        )}
      </td>
      <td>
        {player.phone && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Phone size={14} />{player.phone}
          </div>
        )}
      </td>
      <td>
        <span className={`status-badge status-${player.status.toLowerCase()}`}>{player.status}</span>
      </td>
      <td>
        {player.tags.length > 0 && (
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {player.tags.map((tag) => (
              <span key={tag} style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Tag size={12} />{tag}
              </span>
            ))}
          </div>
        )}
      </td>
      <td>
        <div style={{ display: 'flex', gap: '6px' }}>
          {showInvite && (
            <button className="btn-icon" onClick={() => onInvite(player)} title="Email player" style={{ color: 'var(--primary)' }}>
              <Send size={15} />
            </button>
          )}
          <button className="btn-icon" onClick={() => onEdit(player)} title="Edit"><Edit size={16} /></button>
          <button className="btn-icon" onClick={() => onDelete(player)} title="Delete" style={{ color: 'var(--error-text)' }}><Trash2 size={16} /></button>
        </div>
      </td>
    </tr>
  );
}

export default function BandRoster() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [concerts, setConcerts] = useState<Concert[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [allInstruments, setAllInstruments] = useState<string[]>(INSTRUMENTS);
  const [formData, setFormData] = useState({ name: '', instrument: INSTRUMENTS[1], email: '', phone: '', status: 'Active' as 'Active' | 'Spare', tags: '' });
  const [customInstrument, setCustomInstrument] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [dragActiveId, setDragActiveId] = useState<string | null>(null);

  // Instrument management
  const [instrumentModalOpen, setInstrumentModalOpen] = useState(false);
  const [customInstruments, setCustomInstruments] = useState<CustomInstrument[]>([]);
  const [newInstrumentName, setNewInstrumentName] = useState('');
  const [savingInstrument, setSavingInstrument] = useState(false);

  // Invite states with upgraded custom message and request-type handling rules
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invitePlayer, setInvitePlayer] = useState<Player | null>(null);
  const [inviteType, setInviteType] = useState<'availability' | 'general'>('availability');
  const [inviteConcertId, setInviteConcertId] = useState('');
  const [inviteSubject, setInviteSubject] = useState('');
  const [inviteMessage, setInviteMessage] = useState('');
  const [sending, setSending] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    const [playersRes, concertsRes, instruments] = await Promise.all([
      supabase.from('players').select('*').order('instrument').order('sort_order').order('name'),
      supabase.from('concerts').select('*').eq('status', 'live').gte('concert_date', new Date().toISOString().split('T')[0]).order('concert_date'),
      fetchAllInstruments(),
    ]);
    if (playersRes.data) setPlayers(playersRes.data as Player[]);
    if (concertsRes.data) setConcerts(concertsRes.data as Concert[]);
    setAllInstruments(instruments);
    const { data: ci } = await supabase.from('custom_instruments').select('*').order('created_at');
    if (ci) setCustomInstruments(ci as CustomInstrument[]);
    loading && setLoading(false);
  }

  // Modals management
  function openAddModal() {
    setEditingPlayer(null);
    setFormData({ name: '', instrument: allInstruments[1] || INSTRUMENTS[1], email: '', phone: '', status: 'Active', tags: '' });
    setCustomInstrument('');
    setIsModalOpen(true);
  }

  function openEditModal(player: Player) {
    setEditingPlayer(player);
    const isCustom = !allInstruments.includes(player.instrument);
    setFormData({ name: player.name, instrument: isCustom ? '__custom__' : player.instrument, email: player.email || '', phone: player.phone || '', status: player.status, tags: player.tags.join(', ') });
    setCustomInstrument(isCustom ? player.instrument : '');
    setIsModalOpen(true);
  }

  async function handleAddInstrument(e: React.FormEvent) {
    e.preventDefault();
    const name = newInstrumentName.trim();
    if (!name) return;
    if (allInstruments.includes(name)) { showToast(`"${name}" already exists`); return; }
    setSavingInstrument(true);
    const { error } = await supabase.from('custom_instruments').insert({ name });
    if (error) { showToast('Error adding instrument'); setSavingInstrument(false); return; }
    setNewInstrumentName('');
    setSavingInstrument(false);
    await fetchData();
    showToast(`"${name}" added to instruments`);
  }

  async function handleDeleteInstrument(instrument: CustomInstrument) {
    if (!confirm(`Remove "${instrument.name}" from the instruments list?`)) return;
    await supabase.from('custom_instruments').delete().eq('id', instrument.id);
    await fetchData();
    showToast(`"${instrument.name}" removed`);
  }

  function openInviteModal(player: Player) {
    setInvitePlayer(player);
    setInviteType('availability'); 
    const firstConcert = concerts[0];
    setInviteConcertId(firstConcert?.id || '');
    setInviteSubject(firstConcert ? `Availability Request: ${firstConcert.name}` : 'Availability Request');
    setInviteMessage('');
    setInviteOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const playerData = {
      name: formData.name,
      instrument: formData.instrument === '__custom__' ? customInstrument.trim() : formData.instrument,
      email: formData.email || null,
      phone: formData.phone || null,
      status: formData.status,
      tags: formData.tags.split(',').map((t) => t.trim()).filter(Boolean),
    };
    if (!playerData.instrument) { showToast('Please enter an instrument name'); return; }

    if (editingPlayer) {
      const { error } = await supabase.from('players').update(playerData).eq('id', editingPlayer.id);
      if (error) { showToast('Error updating player'); return; }
      showToast('Player updated successfully');
    } else {
      const { data: newPlayer, error } = await supabase.from('players').insert(playerData).select();
      if (error) { showToast('Error adding player'); return; }
      if (newPlayer?.[0]) {
        const { data: liveConcerts } = await supabase.from('concerts').select('id').eq('status', 'live').gte('concert_date', new Date().toISOString().split('T')[0]);
        if (liveConcerts?.length) {
          await supabase.from('availability').insert(liveConcerts.map((c) => ({ player_id: newPlayer[0].id, concert_id: c.id, status: 'Not Responded' as const })));
        }
      }
      showToast('Player added successfully');
    }
    setIsModalOpen(false);
    await fetchData();
  }

  async function handleDelete(player: Player) {
    if (!confirm(`Delete "${player.name}"?`)) return;
    await supabase.from('availability').delete().eq('player_id', player.id);
    const { error } = await supabase.from('players').delete().eq('id', player.id);
    if (error) { showToast('Error deleting player'); return; }
    showToast('Player deleted');
    await fetchData();
  }

  async function handleDragEnd(event: DragEndEvent, instrument: string) {
    const { active, over } = event;
    setDragActiveId(null);
    if (!over || active.id === over.id) return;
    const section = getActiveSectionPlayers(instrument);
    const oldIdx = section.findIndex((p) => p.id === active.id);
    const newIdx = section.findIndex((p) => p.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(section, oldIdx, newIdx);
    setPlayers((prev) => {
      const others = prev.filter((p) => p.instrument !== instrument || p.status !== 'Active');
      return [...others, ...reordered].sort((a, b) => allInstruments.indexOf(a.instrument) - allInstruments.indexOf(b.instrument));
    });
    await Promise.all(reordered.map((p, i) => supabase.from('players').update({ sort_order: i + 1 }).eq('id', p.id)));
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!invitePlayer) return;
    if (inviteType === 'availability' && !inviteConcertId) return;
    
    setSending(true);

    const payload = inviteType === 'general'
      ? { player_ids: [invitePlayer.id], general: true, subject: inviteSubject, message: inviteMessage }
      : { concert_id: inviteConcertId, player_ids: [invitePlayer.id], subject: inviteSubject, message: inviteMessage };

    const { error } = await supabase.functions.invoke('send-concert-emails', {
      body: payload,
    });

    if (error) {
      showToast(`Error sending email to ${invitePlayer.name}`);
    } else {
      if (inviteType === 'general') {
        showToast(`General request email successfully sent to ${invitePlayer.name}`);
      } else {
        const concert = concerts.find((c) => c.id === inviteConcertId);
        showToast(`Availability request sent to ${invitePlayer.name} for ${concert?.name}`);
      }
    }
    setInviteOpen(false);
    setSending(false);
  }

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 3500);
  }

  function getActiveSectionPlayers(instrument: string) {
    return players.filter((p) => p.instrument === instrument && p.status === 'Active');
  }

  const activePlayers = players.filter((p) => p.status === 'Active');
  const sparePlayers = players.filter((p) => p.status === 'Spare').sort((a, b) => a.name.localeCompare(b.name));
  const searchLower = search.toLowerCase();
  const filteredActive = activePlayers.filter((p) => !search || p.name.toLowerCase().includes(searchLower) || p.instrument.toLowerCase().includes(searchLower));
  const filteredSpares = sparePlayers.filter((p) => !search || p.name.toLowerCase().includes(searchLower) || p.instrument.toLowerCase().includes(searchLower));
  
  const instrumentsToRender = search
    ? allInstruments.filter((inst) => inst.toLowerCase().includes(searchLower) || filteredActive.some((p) => p.instrument === inst))
    : allInstruments;

  const draggedPlayer = dragActiveId ? players.find((p) => p.id === dragActiveId) : null;

  const tableHeader = (
    <thead>
      <tr>
        <th style={{ width: '28px' }} />
        <th>Name</th>
        <th>Email</th>
        <th>Phone</th>
        <th>Status</th>
        <th>Tags</th>
        <th style={{ width: '120px' }}>Actions</th>
      </tr>
    </thead>
  );

  if (loading) return <div>Loading…</div>;

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Band Roster</h1>
          <p>Manage band members and their information</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-secondary" onClick={() => setInstrumentModalOpen(true)}><Music size={16} /> Manage Instruments</button>
          <button className="btn btn-primary" onClick={openAddModal}><Plus size={18} /> Add Player</button>
        </div>
      </div>

      <div className="roster-search-bar">
        <Search size={16} className="roster-search-icon" />
        <input
          type="text"
          placeholder="Search players by name or instrument…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="roster-search-input"
        />
        {search && <button className="btn-icon" onClick={() => setSearch('')} style={{ padding: '4px' }}><X size={14} /></button>}
      </div>

      {/* Active players */}
      {instrumentsToRender.length > 0 && (
        <div className="card" style={{ marginBottom: '24px' }}>
          <div className="card-header">
            <h2>Active Members ({filteredActive.length})</h2>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-light)' }}>Use <Send size={12} style={{ display: 'inline', verticalAlign: 'middle' }} /> to message an individual player</span>
              {!search && <span style={{ fontSize: '13px', color: 'var(--text-light)' }}>Drag <GripVertical size={12} style={{ display: 'inline', verticalAlign: 'middle' }} /> to reorder within each section</span>}
            </div>
          </div>
          <div className="table-container">
            <table>
              {tableHeader}
              <tbody>
                {instrumentsToRender.map((instrument) => {
                  const section = filteredActive.filter((p) => p.instrument === instrument);
                  const canDrag = !search && section.length > 0;

                  if (section.length === 0) {
                    return (
                      <Fragment key={instrument}>
                        <tr>
                          <td colSpan={7} style={{ background: 'var(--bg)', fontWeight: 700, color: 'var(--primary)', padding: '8px 16px', fontSize: '13px', borderBottom: '1px solid var(--border)' }}>
                            {instrument} <span style={{ fontWeight: 400, fontSize: '12px', color: 'var(--text-light)' }}>(0)</span>
                          </td>
                        </tr>
                        <tr>
                          <td />
                          <td colSpan={5} style={{ color: 'var(--text-light)', fontStyle: 'italic', padding: '12px 12px', fontWeight: 500 }}>
                            <span style={{ color: '#e67e22', marginRight: '8px', fontWeight: 'bold' }}>○</span> Position Vacant
                          </td>
                          <td />
                        </tr>
                      </Fragment>
                    );
                  }

                  return (
                    <DndContext
                      key={instrument}
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragStart={(e: DragStartEvent) => setDragActiveId(String(e.active.id))}
                      onDragEnd={(e) => handleDragEnd(e, instrument)}
                      onDragCancel={() => setDragActiveId(null)}
                    >
                      <SortableContext items={section.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                        <>
                          <tr>
                            <td colSpan={7} style={{ background: 'var(--bg)', fontWeight: 700, color: 'var(--primary)', padding: '8px 16px', fontSize: '13px', borderBottom: '1px solid var(--border)' }}>
                              {instrument} <span style={{ fontWeight: 400, fontSize: '12px', color: 'var(--text-light)' }}>({section.length})</span>
                            </td>
                          </tr>
                          {section.map((player) => (
                            canDrag ? (
                              <SortablePlayerRow
                                key={player.id}
                                player={player}
                                onEdit={openEditModal}
                                onDelete={handleDelete}
                                onInvite={openInviteModal}
                                showInvite={true}
                              />
                            ) : (
                              <tr key={player.id}>
                                <td />
                                <td style={{ fontWeight: 600 }}>{player.name}</td>
                                <td>{player.email && <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Mail size={14} /><a href={`mailto:${player.email}`} style={{ color: 'var(--primary)', textDecoration: 'none' }}>{player.email}</a></div>}</td>
                                <td>{player.phone && <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Phone size={14} />{player.phone}</div>}</td>
                                <td><span className={`status-badge status-${player.status.toLowerCase()}`}>{player.status}</span></td>
                                <td>{player.tags.length > 0 && <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>{player.tags.map((tag) => <span key={tag} style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}><Tag size={12} />{tag}</span>)}</div>}</td>
                                <td><div style={{ display: 'flex', gap: '6px' }}><button className="btn-icon" onClick={() => openInviteModal(player)} title="Email player" style={{ color: 'var(--primary)' }}><Send size={15} /></button><button className="btn-icon" onClick={() => openEditModal(player)}><Edit size={16} /></button><button className="btn-icon" onClick={() => handleDelete(player)} style={{ color: 'var(--error-text)' }}><Trash2 size={16} /></button></div></td>
                              </tr>
                            )
                          ))}
                        </>
                      </SortableContext>
                      <DragOverlay>
                        {draggedPlayer && draggedPlayer.instrument === instrument && (
                          <table style={{ opacity: 0.9, boxShadow: 'var(--shadow-lg)', background: 'var(--bg-white)', borderRadius: '6px', width: '600px' }}>
                            <tbody>
                              <tr>
                                <td style={{ width: '28px', padding: '8px' }}><GripVertical size={14} /></td>
                                <td style={{ padding: '8px 12px', fontWeight: 600 }}>{draggedPlayer.name}</td>
                                <td style={{ padding: '8px 12px', color: 'var(--text-light)' }}>{draggedPlayer.instrument}</td>
                              </tr>
                            </tbody>
                          </table>
                        )}
                      </DragOverlay>
                    </DndContext>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Spare players */}
      {filteredSpares.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h2>Spare Players ({filteredSpares.length})</h2>
          </div>
          <div className="table-container">
            <table>
              {tableHeader}
              <tbody>
                {filteredSpares.map((player) => (
                  <tr key={player.id}>
                    <td />
                    <td style={{ fontWeight: 600 }}>{player.name}</td>
                    <td>{player.email && <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Mail size={14} /><a href={`mailto:${player.email}`} style={{ color: 'var(--primary)', textDecoration: 'none' }}>{player.email}</a></div>}</td>
                    <td>{player.phone && <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Phone size={14} />{player.phone}</div>}</td>
                    <td><span className={`status-badge status-${player.status.toLowerCase()}`}>{player.status}</span></td>
                    <td>{player.tags.length > 0 && <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>{player.tags.map((tag) => <span key={tag} style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}><Tag size={12} />{tag}</span>)}</div>}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button className="btn-icon" onClick={() => openInviteModal(player)} title="Email player" style={{ color: 'var(--primary)' }}><Send size={15} /></button>
                        <button className="btn-icon" onClick={() => openEditModal(player)} title="Edit"><Edit size={16} /></button>
                        <button className="btn-icon" onClick={() => handleDelete(player)} title="Delete" style={{ color: 'var(--error-text)' }}><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {instrumentsToRender.length === 0 && filteredSpares.length === 0 && (
        <div className="card" style={{ padding: '48px', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-light)' }}>{search ? `No players matching "${search}"` : 'No players added yet.'}</p>
        </div>
      )}

      {/* Add / edit player modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingPlayer ? 'Edit Player' : 'Add New Player'}</h2>
              <button className="btn-icon" onClick={() => setIsModalOpen(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Full Name</label>
                  <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g., John Smith" required />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Instrument</label>
                    <select value={formData.instrument} onChange={(e) => { setFormData({ ...formData, instrument: e.target.value }); if (e.target.value !== '__custom__') setCustomInstrument(''); }}>
                      {allInstruments.map((inst) => <option key={inst} value={inst}>{inst}</option>)}
                      <option value="__custom__">Other…</option>
                    </select>
                    {formData.instrument === '__custom__' && (
                      <input
                        type="text"
                        value={customInstrument}
                        onChange={(e) => setCustomInstrument(e.target.value)}
                        placeholder="Enter instrument name"
                        required
                        autoFocus
                        style={{ marginTop: '8px' }}
                      />
                    )}
                  </div>
                  <div className="form-group">
                    <label>Status</label>
                    <select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value as 'Active' | 'Spare' })}>
                      <option value="Active">Active</option>
                      <option value="Spare">Spare</option>
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="e.g., john@example.com" />
                </div>
                <div className="form-group">
                  <label>Phone</label>
                  <input type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="e.g., 555-0101" />
                </div>
                <div className="form-group">
                  <label>Tags (comma-separated)</label>
                  <input type="text" value={formData.tags} onChange={(e) => setFormData({ ...formData, tags: e.target.value })} placeholder="e.g., section-leader, founder" />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editingPlayer ? 'Update Player' : 'Add Player'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Multi-Option Compose Modal window */}
      {inviteOpen && invitePlayer && (
        <div className="modal-overlay" onClick={() => setInviteOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Compose Message to Player</h2>
              <button className="btn-icon" onClick={() => setInviteOpen(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleInvite}>
              <div className="modal-body">
                <p style={{ marginBottom: '16px' }}>
                  Composing email for <strong>{invitePlayer.name}</strong> ({invitePlayer.instrument}):
                </p>

                <div className="form-group">
                  <label>Email Type / Purpose</label>
                  <select 
                    value={inviteType} 
                    onChange={(e) => {
                      const mode = e.target.value as 'availability' | 'general';
                      setInviteType(mode);
                      if (mode === 'general') {
                        setInviteSubject('Message from Band Manager');
                      } else {
                        const firstLive = concerts.find(c => c.id === inviteConcertId) || concerts[0];
                        setInviteSubject(firstLive ? `Availability Request: ${firstLive.name}` : 'Availability Request');
                      }
                    }}
                  >
                    <option value="availability">Concert Availability Request (Includes Update Link)</option>
                    <option value="general">General Request / Message (Direct Note Only)</option>
                  </select>
                </div>

                {inviteType === 'availability' && (
                  <div className="form-group">
                    <label>Target Concert Event</label>
                    {concerts.length === 0 ? (
                      <p style={{ color: 'var(--error-text)', fontSize: '13px', padding: '4px 0 0' }}>✕ No upcoming live concerts available to route.</p>
                    ) : (
                      <select 
                        value={inviteConcertId} 
                        onChange={(e) => {
                          const cid = e.target.value;
                          setInviteConcertId(cid);
                          const selected = concerts.find(c => c.id === cid);
                          if (selected) setInviteSubject(`Availability Request: ${selected.name}`);
                        }} 
                        required
                      >
                        {concerts.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} — {new Date(c.concert_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}

                <div className="form-group">
                  <label>Email Subject Line</label>
                  <input 
                    type="text" 
                    value={inviteSubject} 
                    onChange={(e) => setInviteSubject(e.target.value)} 
                    placeholder="Enter email subject header"
                    required 
                  />
                </div>

                <div className="form-group">
                  <label>Message Text Note Content</label>
                  <textarea 
                    value={inviteMessage} 
                    onChange={(e) => setInviteMessage(e.target.value)} 
                    placeholder={inviteType === 'general' ? "Type your general request, details, updates, or instructions here…" : "Type personal notes, rehearsal details, or scheduling changes to accompany the response tracking links…"} 
                    rows={7} 
                    style={{ resize: 'vertical', minHeight: '140px' }} 
                  />
                </div>

                {!invitePlayer.email && (
                  <div style={{ padding: '10px 14px', background: 'var(--warning-bg)', borderRadius: '8px', fontSize: '13px', color: 'var(--warning-text)' }}>
                    This player has no email address on file. Add one before sending an invite.
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setInviteOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={sending || !invitePlayer.email || (inviteType === 'availability' && concerts.length === 0)}>
                  <Send size={16} /> {sending ? 'Sending…' : 'Send Message'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manage Instruments modal */}
      {instrumentModalOpen && (
        <div className="modal-overlay" onClick={() => setInstrumentModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Manage Instruments</h2>
              <button className="btn-icon" onClick={() => setInstrumentModalOpen(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '13px', color: 'var(--text-light)', marginBottom: '16px' }}>
                Add custom instrument types below. They appear at the bottom of the instrument dropdown alongside the standard brass band instruments.
              </p>

              {/* Standard instruments */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-light)', marginBottom: '8px' }}>Standard Instruments</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {INSTRUMENTS.map((inst) => (
                    <span key={inst} style={{ fontSize: '12px', padding: '3px 10px', borderRadius: '12px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-light)' }}>
                      {inst}
                    </span>
                  ))}
                </div>
              </div>

              {/* Custom instruments */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-light)', marginBottom: '8px' }}>Custom Instruments</div>
                {customInstruments.length === 0 ? (
                  <p style={{ fontSize: '13px', color: 'var(--text-light)' }}>No custom instruments added yet.</p>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {customInstruments.map((ci) => (
                      <span key={ci.id} style={{ fontSize: '13px', padding: '4px 10px', borderRadius: '12px', background: 'var(--primary-light)', color: 'var(--primary)', border: '1px solid var(--primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {ci.name}
                        <button
                          className="btn-icon"
                          onClick={() => handleDeleteInstrument(ci)}
                          style={{ padding: '0', color: 'var(--primary)', lineHeight: 1 }}
                          title="Remove"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Add new instrument */}
              <form onSubmit={handleAddInstrument} style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  value={newInstrumentName}
                  onChange={(e) => setNewInstrumentName(e.target.value)}
                  placeholder="e.g., Soprano Cornet, Tenor Horn…"
                  style={{ flex: 1 }}
                  required
                />
                <button type="submit" className="btn btn-primary" disabled={savingInstrument}>
                  <Plus size={16} /> Add
                </button>
              </form>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setInstrumentModalOpen(false)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}