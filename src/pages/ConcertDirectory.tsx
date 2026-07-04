import { useEffect, useState } from 'react';
import { Plus, Edit, Trash2, Calendar, MapPin, Clock, X, Eye, EyeOff, Mail, Bell, ChevronDown, Send, ChevronLeft, ChevronRight, List, CalendarDays } from 'lucide-react';
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
  
  const [bandId, setBandId] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingConcert, setEditingConcert] = useState<Concert | null>(null);
  
  const [formData, setFormData] = useState({ 
    name: '', concert_date: '', start_time: '19:00', end_time: '21:00', venue_name: '', postcode: '' 
  });
  const [toast, setToast] = useState<string | null>(null);

  const [actionModal, setActionModal] = useState<{ concert: Concert; type: ConcertActions } | null>(null);
  const [activeActions, setActiveActions] = useState<string | null>(null);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [publishCompose, setPublishCompose] = useState<Concert | null>(null);
  const [publishSubject, setPublishSubject] = useState('');
  const [publishMessage, setPublishMessage] = useState('');

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: bandData } = await supabase.from('bands').select('id').eq('manager_id', user.id).maybeSingle();

      if (bandData) {
        setBandId(bandData.id);
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
    if (upcoming.length > 0 && upcoming[0].id === concertId) return "Next Up";
    return undefined;
  }

  function openAddModal() {
    setEditingConcert(null);
    setFormData({ name: '', concert_date: '', start_time: '19:00', end_time: '21:00', venue_name: '', postcode: '' });
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
    setFormData({ name: concert.name, concert_date: concert.concert_date, start_time: concert.start_time.slice(0, 5), end_time: concert.end_time.slice(0, 5), venue_name: vName, postcode: pCode });
    setIsModalOpen(true);
  }

  function isValidUKPostcode(postcode: string): boolean {
    const regex = /^[A-Z]{1,2}[0-9][A-Z0-9]? ?[0-9][A-Z]{2}$/i;
    return regex.test(postcode.trim());
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!bandId) { showToast('❌ Missing Band Profile ID correlation.'); return; }

    const rawPostcode = formData.postcode.trim();

    if (rawPostcode && !isValidUKPostcode(rawPostcode)) {
      showToast('❌ Invalid UK Postcode format. Please check and try again.');
      return;
    }

    const cleanPostcode = rawPostcode.replace(/\s+/g, '').toUpperCase();
    let latValue: number | null = null;
    let lngValue: number | null = null;

    if (cleanPostcode) {
      try {
        const geoResponse = await fetch(`https://api.postcodes.io/postcodes/${cleanPostcode}`);
        if (geoResponse.ok) {
          const geoData = await geoResponse.json();
          latValue = geoData.result.latitude ? parseFloat(geoData.result.latitude) : null;
          lngValue = geoData.result.longitude ? parseFloat(geoData.result.longitude) : null;
        } else {
          showToast('❌ Postcode not recognized by GPS registry.');
          return;
        }
      } catch (err) { console.error("Postcode validation skipped:", err); }
    }

    const formattedPostcodeDisplay = rawPostcode.toUpperCase();
    const fullLocation = formattedPostcodeDisplay ? `${formData.venue_name}, ${formattedPostcodeDisplay}` : formData.venue_name;
    const submissionPayload = { name: formData.name, concert_date: formData.concert_date, start_time: formData.start_time, end_time: formData.end_time, location: fullLocation, latitude: latValue, longitude: lngValue, band_id: bandId };
    
    if (editingConcert) {
      const { error } = await supabase.from('concerts').update(submissionPayload).eq('id', editingConcert.id);
      if (error) { showToast(`❌ Update Error: ${error.message}`); return; }
      showToast('Concert updated');
    } else {
      const { error } = await supabase.from('concerts').insert({ ...submissionPayload, status: 'pending' });
      if (error) { showToast(`❌ Creation Error: ${error.message}`); return; }
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

  // 🌟 NEW FUNCTION: Publish Quietly Without Sending
  async function publishWithoutEmail(e: React.MouseEvent) {
    e.preventDefault();
    if (!publishCompose) return;
    const { error } = await supabase.from('concerts').update({ status: 'live' }).eq('id', publishCompose.id);
    if (error) { showToast(`Error publishing concert: ${error.message}`); return; }
    showToast('Concert published quietly (no emails sent).');
    setPublishCompose(null);
    await fetchData();
  }

  async function confirmPublish(e: React.FormEvent) {
    e.preventDefault();
    if (!publishCompose) return;
    const { error } = await supabase.from('concerts').update({ status: 'live' }).eq('id', publishCompose.id);
    if (error) { showToast(`Error publishing concert: ${error.message}`); return; }
    const { error: fnError } = await supabase.functions.invoke('send-concert-emails', {
      body: { concert_id: publishCompose.id, subject: publishSubject, message: publishMessage },
    });
    showToast(fnError ? `Concert is live — could not send emails (${fnError.message})` : 'Concert is live — availability emails sent to all active players');
    setPublishCompose(null);
    await fetchData();
  }

  async function sendConfirmedLineup(concert: Concert) {
    const confirmed = players.filter((p) => { 
      const s = getStatus(p.id, concert.id); 
      return s === 'Available' || s === 'Spare Assigned'; 
    });

    if (confirmed.length === 0) {
      showToast(`No confirmed players available for ${concert.name} yet.`);
      setActionModal(null);
      return;
    }

    const { error } = await supabase.functions.invoke('send-concert-emails', { 
      body: { concert_id: concert.id, player_ids: confirmed.map((p) => p.id), subject: emailSubject, message: emailMessage } 
    });
    
    showToast(error ? `Error sending lineup email (${error.message})` : `Confirmed lineup sent for ${concert.name} (${confirmed.length} players)`);
    setActionModal(null);
  }

  async function chaseNonResponders(concert: Concert) {
    const nonResponders = players.filter((p) => p.status === 'Active' && getStatus(p.id, concert.id) === 'Not Responded');
    const { error = null } = await supabase.functions.invoke('send-concert-emails', { body: { concert_id: concert.id, player_ids: nonResponders.map((p) => p.id), chase: true, subject: emailSubject, message: emailMessage } });
    showToast(error ? `Error sending reminders (${error.message})` : `Reminders sent to ${nonResponders.length} non-responder(s) for ${concert.name}`);
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
    setCurrentCalendarDate(prev => { const next = new Date(prev); next.setMonth(next.getMonth() + direction); return next; });
  };

  const getDaysInMonthGrid = () => {
    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const prevMonthTotalDays = new Date(year, month, 0).getDate();
    const gridCells = [];
    const mondayShiftedIndex = firstDayIndex === 0 ? 6 : firstDayIndex - 1;
    for (let i = mondayShiftedIndex; i > 0; i--) { gridCells.push({ dayNum: prevMonthTotalDays - i + 1, isCurrentMonth: false, dateString: `${year}-${String(month).padStart(2, '0')}-${String(prevMonthTotalDays - i + 1).padStart(2, '0')}` }); }
    for (let i = 1; i <= totalDays; i++) { gridCells.push({ dayNum: i, isCurrentMonth: true, dateString: `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}` }); }
    const remainingCells = 42 - gridCells.length;
    for (let i = 1; i <= remainingCells; i++) { gridCells.push({ dayNum: i, isCurrentMonth: false, dateString: `${year}-${String(month + 2).padStart(2, '0')}-${String(i).padStart(2, '0')}` }); }
    return gridCells;
  };

  function ConcertRow({ concert, label }: { concert: Concert; label?: string }) {
    const isLive = concert.status === 'live';
    const confirmed = activePlayers.filter((p) => { const s = getStatus(p.id, concert.id); return s === 'Available' || s === 'Spare Assigned'; }).length;
    const notResponded = activePlayers.filter((p) => getStatus(p.id, concert.id) === 'Not Responded').length;
    const notAvailable = activePlayers.filter((p) => getStatus(p.id, concert.id) === 'Not Available').length;
    const isActionsOpen = activeActions === concert.id;

    const gcalStartDate = concert.concert_date.replace(/-/g, '');
    const gcalStartTime = concert.start_time.slice(0, 5).replace(':', '') + '00';
    const gcalEndTime = concert.end_time.slice(0, 5).replace(':', '') + '00';
    const gcalDates = `${gcalStartDate}T${gcalStartTime}/${gcalStartDate}T${gcalEndTime}`;
    const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(concert.name)}&dates=${gcalDates}&details=${encodeURIComponent('Band Performance')}&location=${encodeURIComponent(concert.location)}`;

    return (
      <tr key={concert.id}>
        <td style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9' }}>
          {label && <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#ea580c', marginBottom: '2px' }}>{label}</div>}
          <span style={{ fontWeight: 600, color: '#0f172a' }}>{concert.name}</span>
        </td>
        <td style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', color: '#475569' }}><div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Calendar size={16} />{new Date(concert.concert_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div></td>
        <td style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', color: '#475569' }}><div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Clock size={16} />{concert.start_time.slice(0, 5)} – {concert.end_time.slice(0, 5)}</div></td>
        <td style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', color: '#475569' }}><div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><MapPin size={16} />{concert.location}</div></td>
        <td style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9' }}>
          <span style={{ fontSize: '12px', padding: '4px 8px', borderRadius: '12px', fontWeight: 600, backgroundColor: isLive ? '#dcfce7' : '#f1f5f9', color: isLive ? '#166534' : '#64748b' }}>{isLive ? 'Live' : 'Pending'}</span>
        </td>
        <td style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9' }}>
          {isLive ? (
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '12px', background: '#dcfce7', color: '#166534', fontWeight: 600 }}>{confirmed} ✓</span>
              {notResponded > 0 && <span style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '12px', background: '#f1f5f9', color: '#475569', fontWeight: 600 }}>{notResponded} ?</span>}
              {notAvailable > 0 && <span style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '12px', background: '#fef2f2', color: '#991b1b', fontWeight: 600 }}>{notAvailable} ✕</span>}
            </div>
          ) : <span style={{ color: '#94a3b8', fontSize: '13px' }}>—</span>}
        </td>
        <td style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <button 
              onClick={() => toggleStatus(concert)}
              style={{ padding: '6px 10px', fontSize: '13px', fontWeight: 600, borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', border: 'none', backgroundColor: concert.status === 'pending' ? '#1e3a5f' : '#f1f5f9', color: concert.status === 'pending' ? '#fff' : '#475569' }}
            >
              {concert.status === 'pending' ? <><Eye size={14} /> Publish</> : <><EyeOff size={14} /> Unpublish</>}
            </button>
            {isLive && (
              <div style={{ position: 'relative' }}>
                <button onClick={() => setActiveActions(isActionsOpen ? null : concert.id)} style={{ padding: '6px 10px', fontSize: '13px', fontWeight: 600, borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', border: 'none', backgroundColor: '#f1f5f9', color: '#475569' }}>
                  Email <ChevronDown size={14} />
                </button>
                {isActionsOpen && (
                  <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', padding: '4px', zIndex: 10, minWidth: '220px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div onClick={() => { setActiveActions(null); setEmailSubject(`Confirmed lineup: ${concert.name}`); setEmailMessage(''); setActionModal({ concert, type: 'email-confirmed' }); }} style={{ padding: '8px 12px', fontSize: '13px', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', borderRadius: '4px' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}><Mail size={14} /> Email Confirmed Lineup</div>
                    <div onClick={() => { setActiveActions(null); setEmailSubject(`Reminder: please respond for ${concert.name}`); setEmailMessage(''); setActionModal({ concert, type: 'chase' }); }} style={{ padding: '8px 12px', fontSize: '13px', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', borderRadius: '4px' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}><Bell size={14} /> Chase Non-Responders ({notResponded})</div>
                  </div>
                )}
              </div>
            )}
            
            <a 
              href={gcalUrl}
              target="_blank"
              rel="noreferrer"
              title="Add to Google Calendar" 
              style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', color: '#10b981', cursor: 'pointer', borderRadius: '6px' }} 
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#ecfdf5'} 
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <Calendar size={16} />
            </a>

            <button onClick={() => openEditModal(concert)} title="Edit" style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', borderRadius: '6px' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}><Edit size={16} /></button>
            <button onClick={() => handleDelete(concert)} title="Delete" style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', borderRadius: '6px' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#fef2f2'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}><Trash2 size={16} /></button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <div style={{ padding: '32px', fontFamily: 'system-ui, sans-serif', maxWidth: '1400px', margin: '0 auto', boxSizing: 'border-box' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <CalendarDays size={36} color="#1e3a5f" />
          <div>
            <h1 style={{ fontSize: '32px', fontWeight: 800, color: '#1e3a5f', margin: 0 }}>Concerts & Events</h1>
            <p style={{ color: '#64748b', margin: '4px 0 0 0', fontSize: '14px' }}>Manage upcoming concerts and events across the calendar year</p>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '12px' }}>
          <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <button 
              onClick={() => setViewMode('calendar')}
              style={{ padding: '6px 12px', fontSize: '13px', fontWeight: 600, border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s', background: viewMode === 'calendar' ? '#fff' : 'transparent', color: viewMode === 'calendar' ? '#0f172a' : '#64748b', boxShadow: viewMode === 'calendar' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
            >
              <Calendar size={14} /> Calendar View
            </button>
            <button 
              onClick={() => setViewMode('list')}
              style={{ padding: '6px 12px', fontSize: '13px', fontWeight: 600, border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s', background: viewMode === 'list' ? '#fff' : 'transparent', color: viewMode === 'list' ? '#0f172a' : '#64748b', boxShadow: viewMode === 'list' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
            >
              <List size={14} /> List View
            </button>
          </div>
          <button onClick={openAddModal} style={{ padding: '10px 16px', backgroundColor: '#1e3a5f', color: '#ffffff', border: 'none', borderRadius: '8px', fontWeight: 600, fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Plus size={18} /> Add New Concert
          </button>
        </div>
      </div>

      {viewMode === 'calendar' ? (
        <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
              {currentCalendarDate.toLocaleString('en-GB', { month: 'long', year: 'numeric' })}
            </h2>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button style={{ padding: '6px 12px', fontSize: '13px', fontWeight: 600, backgroundColor: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }} onClick={() => changeMonth(-1)}>
                <ChevronLeft size={16} /> Previous
              </button>
              <button style={{ padding: '6px 12px', fontSize: '13px', fontWeight: 600, backgroundColor: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '6px', cursor: 'pointer' }} onClick={() => setCurrentCalendarDate(new Date())}>
                Today
              </button>
              <button style={{ padding: '6px 12px', fontSize: '13px', fontWeight: 600, backgroundColor: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }} onClick={() => changeMonth(1)}>
                Next <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px', background: '#e2e8f0', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
              <div key={d} style={{ background: '#f8fafc', padding: '12px', textTransform: 'uppercase', fontSize: '12px', fontWeight: 700, color: '#64748b', textAlign: 'center' }}>
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
                    background: cell.isCurrentMonth ? '#fff' : '#f8fafc', 
                    minHeight: '120px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '6px',
                    opacity: cell.isCurrentMonth ? 1 : 0.5
                  }}
                >
                  <span style={{ 
                    fontSize: '13px', fontWeight: isToday ? 800 : 600, color: isToday ? '#1e3a5f' : '#0f172a',
                    background: isToday ? '#e0f2fe' : 'transparent', padding: isToday ? '2px 8px' : '2px',
                    borderRadius: '12px', width: 'fit-content'
                  }}>
                    {cell.dayNum}
                  </span>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto' }}>
                    {matches.map(concert => {
                      const isLive = concert.status === 'live';
                      return (
                        <div 
                          key={concert.id}
                          onClick={() => openEditModal(concert)}
                          style={{
                            fontSize: '11px', padding: '6px 8px', borderRadius: '4px',
                            background: isLive ? '#dcfce7' : '#f1f5f9', color: isLive ? '#166534' : '#475569',
                            borderLeft: isLive ? '3px solid #166534' : '3px solid #94a3b8',
                            fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
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
        <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ padding: '16px', fontWeight: 600, color: '#475569' }}>Concert Name</th>
                <th style={{ padding: '16px', fontWeight: 600, color: '#475569' }}>Date</th>
                <th style={{ padding: '16px', fontWeight: 600, color: '#475569' }}>Time</th>
                <th style={{ padding: '16px', fontWeight: 600, color: '#475569' }}>Location</th>
                <th style={{ padding: '16px', fontWeight: 600, color: '#475569' }}>Status</th>
                <th style={{ padding: '16px', fontWeight: 600, color: '#475569' }}>Availability</th>
                <th style={{ padding: '16px', fontWeight: 600, color: '#475569', width: '220px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {liveAll.map((c) => (
                <ConcertRow key={c.id} concert={c} label={getLiveLabel(c.id, liveAll)} />
              ))}
              
              {pendingAll.length > 0 && (
                <>
                  <tr>
                    <td colSpan={7} style={{ background: '#f8fafc', padding: '12px 16px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b' }}>
                      Pending — draft layout models
                    </td>
                  </tr>
                  {pendingAll.map((c) => <ConcertRow key={c.id} concert={c} />)}
                </>
              )}
              
              {liveAll.length === 0 && pendingAll.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: '#64748b', fontStyle: 'italic' }}>No concerts scheduled yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 🌟 MODALS */}
      {actionModal?.type === 'email-confirmed' && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000 }} onClick={() => setActionModal(null)}>
          <div style={{ background: '#ffffff', width: '460px', maxWidth: '90vw', borderRadius: '12px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8fafc' }}>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>Email Confirmed Lineup</h2>
              <button onClick={() => setActionModal(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={18} /></button>
            </div>
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{ margin: 0, fontSize: '14px', color: '#475569' }}>Send confirmed lineup email for <strong>{actionModal.concert.name}</strong>.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '150px', overflowY: 'auto' }}>
                {(['Available', 'Spare Assigned'] as AvailabilityStatus[]).flatMap((s) =>
                  activePlayers.filter((p) => getStatus(p.id, actionModal.concert.id) === s).map((p) => (
                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#dcfce7', borderRadius: '6px', fontSize: '13px' }}>
                      <span style={{ fontWeight: 600, color: '#166534' }}>{p.name}</span>
                      <span style={{ color: '#166534', opacity: 0.8 }}>{p.instrument}</span>
                    </div>
                  ))
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Subject</label>
                <input type="text" value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} required style={{ padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Message <span style={{ color: '#94a3b8', fontWeight: 400 }}>(optional)</span></label>
                <textarea value={emailMessage} onChange={(e) => setEmailMessage(e.target.value)} placeholder="Add a note to the email…" rows={3} style={{ padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', resize: 'vertical', fontFamily: 'inherit' }} />
              </div>
            </div>
            <div style={{ padding: '16px 20px', background: '#fff', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => setActionModal(null)} style={{ padding: '8px 16px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => sendConfirmedLineup(actionModal.concert)} disabled={!emailSubject.trim()} style={{ padding: '8px 16px', background: '#1e3a5f', color: '#ffffff', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '13px', cursor: !emailSubject.trim() ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px', opacity: !emailSubject.trim() ? 0.7 : 1 }}>
                <Send size={14} /> Send Email
              </button>
            </div>
          </div>
        </div>
      )}

      {actionModal?.type === 'chase' && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000 }} onClick={() => setActionModal(null)}>
          <div style={{ background: '#ffffff', width: '460px', maxWidth: '90vw', borderRadius: '12px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8fafc' }}>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>Chase Non-Responders</h2>
              <button onClick={() => setActionModal(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={18} /></button>
            </div>
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{ margin: 0, fontSize: '14px', color: '#475569' }}>Send a reminder to players who haven't responded for <strong>{actionModal.concert.name}</strong>.</p>
              {activePlayers.filter((p) => getStatus(p.id, actionModal.concert.id) === 'Not Responded').length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '150px', overflowY: 'auto' }}>
                  {activePlayers.filter((p) => getStatus(p.id, actionModal.concert.id) === 'Not Responded').map((p) => (
                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#f1f5f9', borderRadius: '6px', fontSize: '13px' }}>
                      <span style={{ fontWeight: 600, color: '#0f172a' }}>{p.name}</span>
                      <span style={{ color: '#64748b' }}>{p.email || 'No email'}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: '#166534', fontWeight: 600, margin: 0, fontSize: '14px' }}>All players have responded!</p>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Subject</label>
                <input type="text" value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} required style={{ padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Message <span style={{ color: '#94a3b8', fontWeight: 400 }}>(optional)</span></label>
                <textarea value={emailMessage} onChange={(e) => setEmailMessage(e.target.value)} placeholder="Add a note to the reminder…" rows={3} style={{ padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', resize: 'vertical', fontFamily: 'inherit' }} />
              </div>
            </div>
            <div style={{ padding: '16px 20px', background: '#fff', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => setActionModal(null)} style={{ padding: '8px 16px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => chaseNonResponders(actionModal.concert)} disabled={!emailSubject.trim() || activePlayers.filter((p) => getStatus(p.id, actionModal.concert.id) === 'Not Responded').length === 0} style={{ padding: '8px 16px', background: '#1e3a5f', color: '#ffffff', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '13px', cursor: (!emailSubject.trim() || activePlayers.filter((p) => getStatus(p.id, actionModal.concert.id) === 'Not Responded').length === 0) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Send size={14} /> Send Reminders
              </button>
            </div>
          </div>
        </div>
      )}

      {publishCompose && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000 }} onClick={() => setPublishCompose(null)}>
          <div style={{ background: '#ffffff', width: '460px', maxWidth: '90vw', borderRadius: '12px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8fafc' }}>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>Publish &amp; Send Emails</h2>
              <button onClick={() => setPublishCompose(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={18} /></button>
            </div>
            <form onSubmit={confirmPublish} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{ margin: 0, fontSize: '14px', color: '#475569' }}>Publishing <strong style={{ color: '#0f172a' }}>{publishCompose.name}</strong> will make it live and send availability request emails to all active players.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Subject</label>
                <input type="text" value={publishSubject} onChange={(e) => setPublishSubject(e.target.value)} required autoFocus style={{ padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Message <span style={{ color: '#94a3b8', fontWeight: 400 }}>(optional)</span></label>
                <textarea value={publishMessage} onChange={(e) => setPublishMessage(e.target.value)} placeholder="Add any extra details for the band…" rows={3} style={{ padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', resize: 'vertical', fontFamily: 'inherit' }} />
              </div>
              
              {/* 🌟 NEW: Added the 'Publish Only (No Email)' option to the footer */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
                <button type="button" onClick={() => setPublishCompose(null)} style={{ padding: '8px 16px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}>
                  Cancel
                </button>
                <button 
                  type="button" 
                  onClick={publishWithoutEmail} 
                  style={{ padding: '8px 16px', background: '#e2e8f0', color: '#475569', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s' }} 
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#cbd5e1'} 
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#e2e8f0'}
                >
                  Publish Only
                </button>
                <button type="submit" disabled={!publishSubject.trim()} style={{ padding: '8px 16px', background: '#1e3a5f', color: '#ffffff', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '13px', cursor: !publishSubject.trim() ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Send size={14} /> Publish &amp; Send
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000 }} onClick={() => setIsModalOpen(false)}>
          <div style={{ background: '#ffffff', width: '460px', maxWidth: '90vw', borderRadius: '12px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8fafc' }}>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>{editingConcert ? 'Edit Concert' : 'Add New Concert'}</h2>
              <button onClick={() => setIsModalOpen(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Concert Name</label>
                <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g., Summer Gala Concert" required style={{ padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Date</label>
                <input type="date" value={formData.concert_date} onChange={(e) => setFormData({ ...formData, concert_date: e.target.value })} required style={{ padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
              </div>
              <div style={{ display: 'flex', gap: '16px' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Start Time</label>
                  <input type="time" value={formData.start_time} onChange={(e) => setFormData({ ...formData, start_time: e.target.value })} required style={{ padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>End Time</label>
                  <input type="time" value={formData.end_time} onChange={(e) => setFormData({ ...formData, end_time: e.target.value })} required style={{ padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Venue Name / Street</label>
                <input type="text" value={formData.venue_name} onChange={(e) => setFormData({ ...formData, venue_name: e.target.value })} placeholder="e.g., Victoria Hall, Main Street" required style={{ padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Venue Postcode</label>
                <input type="text" value={formData.postcode} onChange={(e) => setFormData({ ...formData, postcode: e.target.value })} placeholder="e.g., ST1 3AD" required style={{ padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', textTransform: 'uppercase' }} />
              </div>
              {!editingConcert && (
                <p style={{ color: '#64748b', fontSize: '12px', margin: 0, fontStyle: 'italic' }}>
                  New concerts are created as "Pending" and won't appear in the Availability Matrix until published.
                </p>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
                <button type="button" onClick={() => setIsModalOpen(false)} style={{ padding: '8px 16px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" style={{ padding: '8px 16px', background: '#1e3a5f', color: '#ffffff', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}>
                  {editingConcert ? 'Update Concert' : 'Add Concert'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', background: '#0f172a', color: '#fff', padding: '12px 24px', borderRadius: '8px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', zIndex: 10000, fontWeight: 500, fontSize: '14px' }}>
          {toast}
        </div>
      )}
    </div>
  );
}