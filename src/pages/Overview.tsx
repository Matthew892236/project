import { useEffect, useState } from 'react';
import { CalendarDays, Users, CheckCircle, XCircle, Mail, Send, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Player, Concert } from '../lib/supabase';

export default function Overview() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [concerts, setConcerts] = useState<Concert[]>([]);
  const [availability, setAvailability] = useState<any[]>([]); // Swapped out strict join type to prevent schema errors
  const [loading, setLoading] = useState(true);
  const [composeOpen, setComposeOpen] = useState(false);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    // Authenticated mode: Direct table fetch structure matching our updated database sync strategy
    const [playersRes, concertsRes, availabilityRes] = await Promise.all([
      supabase.from('players').select('*').order('instrument, name'),
      supabase.from('concerts').select('*').order('concert_date'),
      supabase.from('availability').select('*'), 
    ]);
    if (playersRes.data) setPlayers(playersRes.data as Player[]);
    if (concertsRes.data) setConcerts(concertsRes.data as Concert[]);
    if (availabilityRes.data) setAvailability(availabilityRes.data);
    setLoading(false);
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 4000); }

  function openCompose() {
    setEmailSubject('Schedule Update');
    setEmailMessage('');
    setComposeOpen(true);
  }

  async function sendBandEmail(e: React.FormEvent) {
    e.preventDefault();
    
    // 🌟 Gather the IDs of all active players who actually have an email address
    const targetPlayerIds = activePlayers
      .filter((p) => p.email)
      .map((p) => p.id);

    if (targetPlayerIds.length === 0) {
      showToast("No active players have email addresses!");
      return;
    }

    setSending(true);
    setComposeOpen(false);
    
    const { data, error } = await supabase.functions.invoke('send-concert-emails', {
      body: { 
        player_ids: targetPlayerIds, // 🌟 FIXED: Now the mailroom knows who to send it to!
        general: true, 
        subject: emailSubject, 
        message: emailMessage 
      },
    });
    
    setSending(false);
    
    if (error) {
      showToast('Error sending emails');
    } else {
      showToast(`Emails successfully sent to ${targetPlayerIds.length} players!`);
    }
  }

  if (loading) return <div>Loading...</div>;

  const today = new Date().toISOString().split('T')[0];
  const activePlayers = players.filter((p) => p.status === 'Active');
  const sparePlayers = players.filter((p) => p.status === 'Spare');
  const liveConcerts = concerts.filter((c) => c.status === 'live' && c.concert_date >= today);
  const pendingConcerts = concerts.filter((c) => c.status === 'pending');
  const nextConcert = liveConcerts[0] ?? null;

  const liveConcertIds = new Set(liveConcerts.map((c) => c.id));
  const liveAvailability = availability.filter((a) => liveConcertIds.has(a.concert_id));
  const respondedCount = liveAvailability.filter((a) => a.status !== 'Not Responded').length;
  const totalSlots = liveAvailability.length || 1;
  const responseRate = Math.round((respondedCount / totalSlots) * 100);
  const availableCount = liveAvailability.filter((a) => a.status === 'Available' || a.status === 'Spare Assigned').length;
  const notRespondedCount = liveAvailability.filter((a) => a.status === 'Not Responded').length;
  const playersWithEmail = activePlayers.filter((p) => p.email).length;

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Dashboard Overview</h1>
          <p>Welcome to Brassbandwidth — your brass band management hub</p>
        </div>
        <button className="btn btn-primary" onClick={openCompose} disabled={sending}>
          <Mail size={18} /> {sending ? 'Sending…' : 'Email the Band'}
        </button>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon primary"><Users size={20} /></div>
          <div className="stat-value">{activePlayers.length}</div>
          <div className="stat-label">Active Players</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon secondary"><Users size={20} /></div>
          <div className="stat-value">{sparePlayers.length}</div>
          <div className="stat-label">Spare Players</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon success"><CalendarDays size={20} /></div>
          <div className="stat-value">{liveConcerts.length}</div>
          <div className="stat-label">Live Concerts</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon warning"><CheckCircle size={20} /></div>
          <div className="stat-value">{liveAvailability.length > 0 ? `${responseRate}%` : '—'}</div>
          <div className="stat-label">Response Rate</div>
        </div>
      </div>

      <div className="stats-grid">
        <div className="card">
          <div className="card-header"><h2>Next Live Concert</h2></div>
          <div className="card-body">
            {nextConcert ? (
              <div>
                <h3 style={{ marginBottom: '8px' }}>{nextConcert.name}</h3>
                <p style={{ color: 'var(--text-light)', marginBottom: '4px' }}>
                  {new Date(nextConcert.concert_date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
                <p style={{ color: 'var(--text-light)', marginBottom: '4px' }}>{nextConcert.start_time.slice(0, 5)} – {nextConcert.end_time.slice(0, 5)}</p>
                <p style={{ color: 'var(--text-light)', marginBottom: '16px' }}>{nextConcert.location}</p>
                
                {/* Updated Layout Badge block to show Available, Not Available, and Spares cleanly */}
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <div className="status-badge availability-available">
                    <CheckCircle size={14} style={{ marginRight: '4px' }} />
                    {availability.filter((a) => a.concert_id === nextConcert.id && a.status === 'Available').length} Available
                  </div>
                  <div className="status-badge availability-not-available">
                    <XCircle size={14} style={{ marginRight: '4px' }} />
                    {availability.filter((a) => a.concert_id === nextConcert.id && a.status === 'Not Available').length} Not Available
                  </div>
                  <div className="status-badge" style={{ backgroundColor: '#fff7ed', color: '#c2410c', border: '1px solid #ffedd5', display: 'flex', alignItems: 'center' }}>
                    <Users size={14} style={{ marginRight: '4px' }} />
                    {availability.filter((a) => a.concert_id === nextConcert.id && a.status === 'Spare Assigned').length} Spares Assigned
                  </div>
                </div>
              </div>
            ) : (
              <p style={{ color: 'var(--text-light)' }}>No live upcoming concerts scheduled</p>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h2>Concert Status</h2></div>
          <div className="card-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Live Concerts</span>
                <strong style={{ color: 'var(--success-text)' }}>{liveConcerts.length}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Pending (Not Published)</span>
                <strong style={{ color: 'var(--warning-text)' }}>{pendingConcerts.length}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Confirmed Available</span>
                <strong style={{ color: 'var(--success-text)' }}>{availableCount}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Pending Responses</span>
                <strong style={{ color: 'var(--warning-text)' }}>{notRespondedCount}</strong>
              </div>
            </div>
          </div>
        </div>
      </div>

      {composeOpen && (
        <div className="modal-overlay" onClick={() => setComposeOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Email the Band</h2>
              <button className="btn-icon" onClick={() => setComposeOpen(false)}><X size={20} /></button>
            </div>
            <form onSubmit={sendBandEmail}>
              <div className="modal-body">
                <p style={{ marginBottom: '16px', color: 'var(--text-light)', fontSize: '13px' }}>
                  Sending to <strong style={{ color: 'var(--text)' }}>{playersWithEmail}</strong> active players with email addresses.
                  Upcoming concerts and an availability matrix link will be included automatically.
                </p>
                <div className="form-group">
                  <label>Subject</label>
                  <input
                    type="text"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    placeholder="e.g., Schedule Update"
                    required
                    autoFocus
                  />
                </div>
                <div className="form-group">
                  <label>Message <span style={{ color: 'var(--text-light)', fontWeight: 400 }}>(optional)</span></label>
                  <textarea
                    value={emailMessage}
                    onChange={(e) => setEmailMessage(e.target.value)}
                    placeholder="Add a personal note to the band…"
                    rows={8}
                    style={{ resize: 'vertical', minHeight: '140px' }}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setComposeOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={!emailSubject.trim()}>
                  <Send size={16} /> Send to {playersWithEmail} players
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}