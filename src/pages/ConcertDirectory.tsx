import { useEffect, useState } from 'react';
import { Plus, Edit, Trash2, Calendar, MapPin, Clock, X, Eye, EyeOff, Mail, Bell, ChevronDown, Send, ChevronLeft, ChevronRight, List } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Concert, Player, Availability, AvailabilityStatus } from '../lib/supabase';

type ConcertActions = 'email-confirmed' | 'chase';
type ViewMode = 'list' | 'calendar';

export default function ConcertDirectory() {
  const [concerts, setConcerts] = useState<Concert[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [availability, setAvailability] = useState<Availability[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('list'); 
  const [currentCalendarDate, setCurrentCalendarDate] = useState(new Date());
  
  // 🏢 Multi-tenant state to sandbox this directory to your band
  const [bandId, setBandId] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingConcert, setEditingConcert] = useState<Concert | null>(null);
  
  const [formData, setFormData] = useState({ 
    name: '', 
    concert_date: '', 
    start_time: '19:00', 
    end_time: '21:00', 
    venue_name: '', 
    postcode: '' 
  });
  const [toast, setToast] = useState<string | null>(null);

  // Per-concert action modal
  const [actionModal, setActionModal] = useState<{ concert: Concert; type: ConcertActions } | null>(null);
  const [activeActions, setActiveActions] = useState<string | null>(null);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  // Publish compose: concert pending confirmation before going live
  const [publishCompose, setPublishCompose] = useState<Concert | null>(null);
  const [publishSubject, setPublishSubject] = useState('');
  const [publishMessage, setPublishMessage] = useState('');

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    try {
      // Get logged in manager
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Find their band relationship
      const { data: bandData } = await supabase
        .from('bands')
        .select('id')
        .eq('manager_id', user.id)
        .maybeSingle();

      if (bandData) {
        setBandId(bandData.id);

        // Fetch only records belonging specifically to this band configuration
        const [concertsRes, playersRes, availabilityRes] = await Promise.all([
          supabase.from('concerts').select('*').eq('band_id', bandData.id).order('concert_date'),
          supabase.from('players').select('id, name, email, instrument, status').eq('band_id', bandData.id),
          supabase.from('availability').select('player_id, concert_id, status, spare_player_id'),
        ]);

        if (concertsRes.data) setConcerts(concertsRes.data as Concert[]);
        if (playersRes.data) setPlayers(playersRes.data as Player[]);
        if (availabilityRes.data) setAvailability(availabilityRes.data as Availability[]);
      }
    } catch (err: any) {
      showToast(`Error syncing data: ${err.message}`);
    }
  }

  function getStatus(playerId: string, concertId: string): AvailabilityStatus {
    return availability.find((a) => a.player_id === playerId && a.concert_id === concertId)?.status || 'Not Responded';
  }

  function getLiveLabel(concertId: string, liveList: Concert[]): string | undefined {
    const todayStr = new Date().toISOString().split('T')[0];
    const upcoming = liveList.filter(c => c.concert_date >= todayStr);
    if (upcoming.length > 0 && upcoming[0].id === concertId) {
      return "Next Up";
    }
    return undefined;
  }

  function openAddModal() {
    setEditingConcert(null);
    setFormData({ 
      name: '', 
      concert_date: '', 
      start_time: '19:00', 
      end_time: '21:00', 
      venue_name: '', 
      postcode: '' 
    });
    setIsModalOpen(true);
  }

  function openEditModal(concert: Concert) {
    setEditingConcert(concert);
    
    let vName = concert.location;
    let pCode = '';
    const lastCommaIndex = concert.location.lastIndexOf(',');
    if (lastCommaIndex !== -1) {
      vName = concert.location.slice(0, lastCommaIndex).trim();
      pCode = concert.location.slice(lastCommaIndex + 1).trim();
    }

    setFormData({ 
      name: concert.name, 
      concert_date: concert.concert_date, 
      start_time: concert.start_time.slice(0, 5), 
      end_time: concert.end_time.slice(0, 5), 
      venue_name: vName, 
      postcode: pCode 
    });
    setIsModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!bandId) {
      showToast('❌ Missing Band Profile ID correlation.');
      return;
    }

    // 1. Fetch geographic points dynamically
    const cleanPostcode = formData.postcode.replace(/\s+/g, '').toUpperCase();
    let latValue: number | null = null;
    let lngValue: number | null = null;

    if (cleanPostcode) {
      try {
        const geoResponse = await fetch(`https://api.postcodes.io/postcodes/${cleanPostcode}`);
        if (geoResponse.ok) {
          const geoData = await geoResponse.json();
          latValue = geoData.result.latitude ? parseFloat(geoData.result.latitude) : null;
          lngValue = geoData.result.longitude ? parseFloat(geoData.result.longitude) : null;
        }
      } catch (err) {
        console.error("Postcode validation skipped:", err);
      }
    }

    const fullLocation = formData.postcode 
      ? `${formData.venue_name}, ${formData.postcode.toUpperCase()}` 
      : formData.venue_name;

    // 2. Build explicit schema object containing the necessary foreign keys
    const submissionPayload = {
      name: formData.name,
      concert_date: formData.concert_date,
      start_time: formData.start_time,
      end_time: formData.end_time,
      location: fullLocation,
      latitude: latValue,
      longitude: lngValue,
      band_id: bandId // ◄ Ties the concert directly to your logged-in band profile
    };
    
    if (editingConcert) {
      const { error } = await supabase.from('concerts').update(submissionPayload).eq('id', editingConcert.id);
      if (error) { showToast(`❌ Update Error: ${error.message}`); return; } // ◄ Shows real message
      showToast('Concert updated');
    } else {
      const { error } = await supabase.from('concerts').insert({ ...submissionPayload, status: 'pending' });
      if (error) { showToast(`❌ Creation Error: ${error.message}`); return; } // ◄ Shows real message
      showToast('Concert added');
    }
    setIsModalOpen(false);
    await fetchData();
  }

  async function handleDelete(concert: Concert) {
    if (!confirm(`Delete "${concert.name}"?`)) return;
    const { error } = await supabase.from('concerts').delete().eq('id', concert.id);
    if (error) { showToast(`Error deleting concert: ${error.message}`); return; }
    showToast('Concert deleted');
    await fetchData();
  }

  async function toggleStatus(concert: Concert) {
    if (concert.status === 'pending') {
      setPublishSubject(`Availability Request: ${concert.name}`);
      setPublishMessage('');
      setPublishCompose(concert);
    } else {
      const { error } = await supabase.from('concerts').update({ status: 'pending' }).eq('id', concert.id);
      if (error) { showToast(`Error updating status: ${error.message}`); return; }
      showToast('Concert set to pending');
      await fetchData();
    }
  }

  async function confirmPublish(e: React.FormEvent) {
    e.preventDefault();
    if (!publishCompose) return;
    const { error } = await supabase.from('concerts').update({ status: 'live' }).eq('id', publishCompose.id);
    if (error) { showToast(`Error publishing concert: ${error.message}`); return; }
    const { error: fnError } = await supabase.functions.invoke('send-concert-emails', {
      body: { concert_id: publishCompose.id, subject: publishSubject, message: publishMessage },
    });
    showToast(fnError
      ? `Concert is live — could not send emails (${fnError.message})`
      : 'Concert is live — availability emails sent to all active players');
    setPublishCompose(null);
    await fetchData();
  }

  async function sendConfirmedLineup(concert: Concert) {
    const confirmed = players.filter((p) => {
      const s = getStatus(p.id, concert.id);
      return s === 'Available' || s === 'Spare Assigned';
    });
    const { error } = await supabase.functions.invoke('send-concert-emails', {
      body: { concert_id: concert.id, player_ids: confirmed.map((p) => p.id), subject: emailSubject, message: emailMessage },
    });
    showToast(error
      ? `Error sending lineup email (${error.message})`
      : `Confirmed lineup sent for ${concert.name} (${confirmed.length} players)`
    );
    setActionModal(null);
  }

  async function chaseNonResponders(concert: Concert) {
    const nonResponders = players.filter((p) => p.status === 'Active' && getStatus(p.id, concert.id) === 'Not Responded');
    const { error = null } = await supabase.functions.invoke('send-concert-emails', {
      body: { concert_id: concert.id, player_ids: nonResponders.map((p) => p.id), chase: true, subject: emailSubject, message: emailMessage },
    });
    showToast(error
      ? `Error sending reminders (${error.message})`
      : `Reminders sent to ${nonResponders.length} non-responder(s) for ${concert.name}`
    );
    setActionModal(null);
  }

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 5000);
  }

  const activePlayers = players.filter((p) => p.status === 'Active');
  const liveAll = concerts.filter((c) => c.status === 'live').sort((a, b) => a.concert_date.localeCompare(b.concert_date));
  const pendingAll = concerts.filter((c) => c.status === 'pending').sort((a, b) => a.concert_date.localeCompare(b.concert_date));

  const changeMonth = (direction: number) => {
    setCurrentCalendarDate(prev => {
      const next = new Date(prev);
      next.setMonth(next.getMonth() + direction);
      return next;
    });
  };

  const getDaysInMonthGrid = () => {
    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    
    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const prevMonthTotalDays = new Date(year, month, 0).getDate();

    const gridCells = [];

    const mondayShiftedIndex = firstDayIndex === 0 ? 6 : firstDayIndex - 1;
    for (let i = mondayShiftedIndex; i > 0; i--) {
      gridCells.push({
        dayNum: prevMonthTotalDays - i + 1,
        isCurrentMonth: false,
        dateString: `${year}-${String(month).padStart(2, '0')}-${String(prevMonthTotalDays - i + 1).padStart(2, '0')}`
      });
    }

    for (let i = 1; i <= totalDays; i++) {
      gridCells.push({
        dayNum: i,
        isCurrentMonth: true,
        dateString: `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`
      });
    }

    const remainingCells = 42 - gridCells.length;
    for (let i = 1; i <= remainingCells; i++) {
      gridCells.push({
        dayNum: i,
        isCurrentMonth: false,
        dateString: `${year}-${String(month + 2).padStart(2, '0')}-${String(i).padStart(2, '0')}`
      });
    }

    return gridCells;
  };

  function ConcertRow({ concert, label }: { concert: Concert; label?: string }) {
    const isLive = concert.status === 'live';
    const confirmed = activePlayers.filter((p) => { const s = getStatus(p.id, concert.id); return s === 'Available' || s === 'Spare Assigned'; }).length;
    const notResponded = activePlayers.filter((p) => getStatus(p.id, concert.id) === 'Not Responded').length;
    const notAvailable = activePlayers.filter((p) => getStatus(p.id, concert.id) === 'Not Available').length;
    const isActionsOpen = activeActions === concert.id;
    return (
      <tr key={concert.id}>
        <td>
          {label && <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--secondary-dark)', marginBottom: '2px' }}>{label}</div>}
          <span style={{ fontWeight: 600 }}>{concert.name}</span>
        </td>
        <td><div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Calendar size={16} />{new Date(concert.concert_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div></td>
        <td><div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Clock size={16} />{concert.start_time.slice(0, 5)} – {concert.end_time.slice(0, 5)}</div></td>
        <td><div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><MapPin size={16} />{concert.location}</div></td>
        <td><span className="status-badge" style={{ background: isLive ? 'var(--success-bg)' : 'var(--neutral-bg)', color: isLive ? 'var(--success-text)' : 'var(--text-light)' }}>{isLive ? 'Live' : 'Pending'}</span></td>
        <td>
          {isLive ? (
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '12px', background: 'var(--success-bg)', color: 'var(--success-text)', fontWeight: 600 }}>{confirmed} ✓</span>
              {notResponded > 0 && <span style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '12px', background: 'var(--neutral-bg)', color: 'var(--neutral-text)', fontWeight: 600 }}>{notResponded} ?</span>}
              {notAvailable > 0 && <span style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '12px', background: 'var(--error-bg)', color: 'var(--error-text)', fontWeight: 600 }}>{notAvailable} ✕</span>}
            </div>
          ) : <span style={{ color: 'var(--text-light)', fontSize: '13px' }}>—</span>}
        </td>
        <td>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <button className={`btn btn-sm ${concert.status === 'pending' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => toggleStatus(concert)}>
              {concert.status === 'pending' ? <><Eye size={14} /> Publish</> : <><EyeOff size={14} /> Unpublish</>}
            </button>
            {isLive && (
              <div style={{ position: 'relative' }}>
                <button className="btn btn-sm btn-secondary" onClick={() => setActiveActions(isActionsOpen ? null : concert.id)} style={{ gap: '4px' }}>
                  Email <ChevronDown size={12} />
                </button>
                {isActionsOpen && (
                  <div className="dropdown" style={{ right: 0, left: 'auto', minWidth: '210px', top: '110%', transform: 'none', zIndex: 10 }}>
                    <div className="dropdown-item" onClick={() => { setActiveActions(null); setEmailSubject(`Confirmed lineup: ${concert.name}`); setEmailMessage(''); setActionModal({ concert, type: 'email-confirmed' }); }}><Mail size={14} /> Email Confirmed Lineup</div>
                    <div className="dropdown-item" onClick={() => { setActiveActions(null); setEmailSubject(`Reminder: please respond for ${concert.name}`); setEmailMessage(''); setActionModal({ concert, type: 'chase' }); }}><Bell size={14} /> Chase Non-Responders ({notResponded})</div>
                  </div>
                )}
              </div>
            )}
            <button className="btn-icon" onClick={() => openEditModal(concert)} title="Edit"><Edit size={16} /></button>
            <button className="btn-icon" onClick={() => handleDelete(concert)} title="Delete" style={{ color: 'var(--error-text)' }}><Trash2 size={16} /></button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Concert Directory</h1>
          <p>Manage upcoming concerts and events across the calendar year</p>
        </div>
        
        <div style={{ display: 'flex', gap: '10px' }}>
          <div style={{ display: 'flex', background: '#e2e8f0', padding: '4px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <button 
              className={`btn btn-sm`} 
              style={{ background: viewMode === 'calendar' ? 'white' : 'transparent', boxShadow: viewMode === 'calendar' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', color: 'var(--text)' }}
              onClick={() => setViewMode('calendar')}
            >
              <Calendar size={14} style={{ marginRight: '4px' }} /> Calendar View
            </button>
            <button 
              className={`btn btn-sm`} 
              style={{ background: viewMode === 'list' ? 'white' : 'transparent', boxShadow: viewMode === 'list' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', color: 'var(--text)' }}
              onClick={() => setViewMode('list')}
            >
              <List size={14} style={{ marginRight: '4px' }} /> List View
            </button>
          </div>
          <button className="btn btn-primary" onClick={openAddModal}><Plus size={18} /> Add New Concert</button>
        </div>
      </div>

      {viewMode === 'calendar' ? (
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--primary-dark)' }}>
              {currentCalendarDate.toLocaleString('en-GB', { month: 'long', year: 'numeric' })}
            </h2>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-secondary" style={{ padding: '6px 12px' }} onClick={() => changeMonth(-1)}>
                <ChevronLeft size={16} /> Previous
              </button>
              <button className="btn btn-secondary" style={{ padding: '6px 12px' }} onClick={() => setCurrentCalendarDate(new Date())}>
                Today
              </button>
              <button className="btn btn-secondary" style={{ padding: '6px 12px' }} onClick={() => changeMonth(1)}>
                Next <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px', background: 'var(--border)', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)' }}>
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
              <div key={d} style={{ background: '#f8fafc', padding: '10px', textTransform: 'uppercase', fontSize: '11px', fontWeight: 700, color: 'var(--text-light)', textAlign: 'center' }}>
                {d}
              </div>
            ))}

            {getDaysInMonthGrid().map((cell, idx) => {
              const matches = concerts.filter(c => c.concert_date === cell.dateString);
              const isToday = cell.dateString === new Date().toISOString().split('T')[0];

              return (
                <div 
                  key={idx} 
                  style={{ 
                    background: cell.isCurrentMonth ? 'white' : '#f8fafc', 
                    minHeight: '110px', 
                    padding: '8px', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '4px',
                    opacity: cell.isCurrentMonth ? 1 : 0.45
                  }}
                >
                  <span style={{ 
                    fontSize: '13px', 
                    fontWeight: isToday ? 800 : 500, 
                    color: isToday ? 'var(--primary)' : 'var(--text)',
                    background: isToday ? 'var(--primary-light)' : 'transparent',
                    padding: isToday ? '2px 6px' : '0',
                    borderRadius: '4px',
                    width: 'fit-content'
                  }}>
                    {cell.dayNum}
                  </span>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '2px', overflowY: 'auto' }}>
                    {matches.map(concert => {
                      const isLive = concert.status === 'live';
                      return (
                        <div 
                          key={concert.id}
                          onClick={() => openEditModal(concert)}
                          style={{
                            fontSize: '11px',
                            padding: '4px 6px',
                            borderRadius: '4px',
                            background: isLive ? 'var(--success-bg)' : 'var(--neutral-bg)',
                            color: isLive ? 'var(--success-text)' : 'var(--text)',
                            borderLeft: isLive ? '3px solid var(--success-text)' : '3px solid var(--text-light)',
                            fontWeight: 600,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}
                          title={`${concert.name} (${concert.start_time.slice(0,5)})`}
                        >
                          {concert.start_time.slice(0,5)} {concert.name}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Concert Name</th>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th>Availability</th>
                  <th style={{ width: '220px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {liveAll.map((c) => (
                  <ConcertRow key={c.id} concert={c} label={getLiveLabel(c.id, liveAll)} />
                ))}
                
                {pendingAll.length > 0 && (
                  <>
                    <tr>
                      <td colSpan={7} style={{ background: 'var(--bg)', padding: '8px 16px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-light)' }}>
                        Pending — draft layout models
                      </td>
                    </tr>
                    {pendingAll.map((c) => <ConcertRow key={c.id} concert={c} />)}
                  </>
                )}
                
                {liveAll.length === 0 && pendingAll.length === 0 && (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-light)' }}>No concerts scheduled yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Email confirmed lineup modal */}
      {actionModal?.type === 'email-confirmed' && (
        <div className="modal-overlay" onClick={() => setActionModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Email Confirmed Lineup</h2>
              <button className="btn-icon" onClick={() => setActionModal(null)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: '12px' }}>Send confirmed lineup email for <strong>{actionModal.concert.name}</strong>.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
                {(['Available', 'Spare Assigned'] as AvailabilityStatus[]).flatMap((s) =>
                  activePlayers.filter((p) => getStatus(p.id, actionModal.concert.id) === s).map((p) => (
                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--success-bg)', borderRadius: '6px', fontSize: '13px' }}>
                      <span style={{ fontWeight: 600 }}>{p.name}</span>
                      <span style={{ color: 'var(--text-light)' }}>{p.instrument}</span>
                    </div>
                  ))
                )}
              </div>
              <div className="form-group">
                <label>Subject</label>
                <input type="text" value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Message <span style={{ color: 'var(--text-light)', fontWeight: 400 }}>(optional)</span></label>
                <textarea value={emailMessage} onChange={(e) => setEmailMessage(e.target.value)} placeholder="Add a note to the email…" rows={3} style={{ resize: 'vertical' }} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setActionModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => sendConfirmedLineup(actionModal.concert)} disabled={!emailSubject.trim()}>
                <Send size={16} /> Send Email
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chase non-responders modal */}
      {actionModal?.type === 'chase' && (
        <div className="modal-overlay" onClick={() => setActionModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Chase Non-Responders</h2>
              <button className="btn-icon" onClick={() => setActionModal(null)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: '12px' }}>Send a reminder to players who haven't responded for <strong>{actionModal.concert.name}</strong>.</p>
              {activePlayers.filter((p) => getStatus(p.id, actionModal.concert.id) === 'Not Responded').length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
                  {activePlayers.filter((p) => getStatus(p.id, actionModal.concert.id) === 'Not Responded').map((p) => (
                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--neutral-bg)', borderRadius: '6px', fontSize: '13px' }}>
                      <span style={{ fontWeight: 600 }}>{p.name}</span>
                      <span style={{ color: 'var(--text-light)' }}>{p.email || 'No email'}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: 'var(--success-text)', fontWeight: 600, marginBottom: '16px' }}>All players have responded!</p>
              )}
              <div className="form-group">
                <label>Subject</label>
                <input type="text" value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Message <span style={{ color: 'var(--text-light)', fontWeight: 400 }}>(optional)</span></label>
                <textarea value={emailMessage} onChange={(e) => setEmailMessage(e.target.value)} placeholder="Add a note to the reminder…" rows={3} style={{ resize: 'vertical' }} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setActionModal(null)}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={(() => chaseNonResponders(actionModal.concert))}
                disabled={!emailSubject.trim() || activePlayers.filter((p) => getStatus(p.id, actionModal.concert.id) === 'Not Responded').length === 0}
              >
                <Send size={16} /> Send Reminders
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Publish + email compose modal */}
      {publishCompose && (
        <div className="modal-overlay" onClick={() => setPublishCompose(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Publish &amp; Send Availability Emails</h2>
              <button className="btn-icon" onClick={() => setPublishCompose(null)}><X size={20} /></button>
            </div>
            <form onSubmit={confirmPublish}>
              <div className="modal-body">
                <p style={{ marginBottom: '16px', color: 'var(--text-light)', fontSize: '13px' }}>
                  Publishing <strong style={{ color: 'var(--text)' }}>{publishCompose.name}</strong> will make it live and send availability request emails to all active players.
                </p>
                <div className="form-group">
                  <label>Subject</label>
                  <input
                    type="text"
                    value={publishSubject}
                    onChange={(e) => setPublishSubject(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <div className="form-group">
                  <label>Message <span style={{ color: 'var(--text-light)', fontWeight: 400 }}>(optional)</span></label>
                  <textarea
                    value={publishMessage}
                    onChange={(e) => setPublishMessage(e.target.value)}
                    placeholder="Add any extra details for the band…"
                    rows={3}
                    style={{ resize: 'vertical' }}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setPublishCompose(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={!publishSubject.trim()}>
                  <Eye size={16} /> Publish &amp; Send Emails
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add/edit concert modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingConcert ? 'Edit Concert' : 'Add New Concert'}</h2>
              <button className="btn-icon" onClick={() => setIsModalOpen(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Concert Name</label>
                  <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g., Summer Gala Concert" required />
                </div>
                <div className="form-group">
                  <label>Date</label>
                  <input type="date" value={formData.concert_date} onChange={(e) => setFormData({ ...formData, concert_date: e.target.value })} required />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Start Time</label>
                    <input type="time" value={formData.start_time} onChange={(e) => setFormData({ ...formData, start_time: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label>End Time</label>
                    <input type="time" value={formData.end_time} onChange={(e) => setFormData({ ...formData, end_time: e.target.value })} required />
                  </div>
                </div>
                
                {/* 📍 Segmented Location Form Fields */}
                <div className="form-group">
                  <label>Venue Name / Street</label>
                  <input type="text" value={formData.venue_name} onChange={(e) => setFormData({ ...formData, venue_name: e.target.value })} placeholder="e.g., Victoria Hall, Main Street" required />
                </div>
                <div className="form-group">
                  <label>Venue Postcode</label>
                  <input type="text" value={formData.postcode} onChange={(e) => setFormData({ ...formData, postcode: e.target.value })} placeholder="e.g., ST1 3AD" required />
                </div>

                {!editingConcert && (
                  <p style={{ color: 'var(--text-light)', fontSize: '13px', marginTop: '12px' }}>
                    New concerts are created as "Pending" and won't appear in the Availability Matrix until published.
                  </p>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editingConcert ? 'Update Concert' : 'Add Concert'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}