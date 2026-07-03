import { useEffect, useState } from 'react';
import { CalendarDays, Users, CheckCircle, XCircle, Mail, Send, X, LayoutDashboard } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Player, Concert } from '../lib/supabase';

export default function Overview() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [concerts, setConcerts] = useState<Concert[]>([]);
  const [availability, setAvailability] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [composeOpen, setComposeOpen] = useState(false);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return;

      const { data: band } = await supabase
        .from('bands')
        .select('id')
        .eq('manager_id', userData.user.id)
        .maybeSingle();

      if (!band) {
        setLoading(false);
        return; 
      }

      const [playersRes, concertsRes, availabilityRes] = await Promise.all([
        supabase.from('players').select('*').eq('band_id', band.id).order('instrument, name'),
        supabase.from('concerts').select('*').eq('band_id', band.id).order('concert_date'),
        // 🌟 THE FIX: Removed .eq('band_id') since this join table relies on player_id/concert_id!
        supabase.from('availability').select('*')
      ]);

      if (playersRes.data) setPlayers(playersRes.data as Player[]);
      if (concertsRes.data) setConcerts(concertsRes.data as Concert[]);
      if (availabilityRes.data) setAvailability(availabilityRes.data);
    } catch (err) {
      console.error("Error securing isolated band data:", err);
    } finally {
      setLoading(false);
    }
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 4000); }

  function openCompose() {
    setEmailSubject('Schedule Update');
    setEmailMessage('');
    setComposeOpen(true);
  }

  async function sendBandEmail(e: React.FormEvent) {
    e.preventDefault();
    
    const targetPlayerIds = activePlayers
      .filter((p) => p.email)
      .map((p) => p.id);

    if (targetPlayerIds.length === 0) {
      showToast("No active players have email addresses!");
      return;
    }

    setSending(true);
    setComposeOpen(false);
    
    const { error } = await supabase.functions.invoke('send-concert-emails', {
      body: { 
        player_ids: targetPlayerIds, 
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

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'system-ui', color: '#64748b' }}>Loading Command Center...</div>;

  const today = new Date().toISOString().split('T')[0];
  const activePlayers = players.filter((p) => p.status === 'Active');
  const sparePlayers = players.filter((p) => p.status === 'Spare');
  const liveConcerts = concerts.filter((c) => c.status === 'live' && c.concert_date >= today);
  const pendingConcerts = concerts.filter((c) => c.status === 'pending');
  const nextConcert = liveConcerts[0] ?? null;

  // 🌟 BULLETPROOF MATH ENGINE
  const liveConcertIds = new Set(liveConcerts.map((c) => c.id));
  const activePlayerIds = new Set(activePlayers.map((p) => p.id));
  
  // Total expected responses = Every core player x Every live gig
  const totalExpectedResponses = activePlayers.length * liveConcerts.length;

  // 🌟 THE FIX: Count ANY valid state that isn't "Not Responded" for a core chair
  const respondedCount = availability.filter(
    (a) => liveConcertIds.has(a.concert_id) && 
           activePlayerIds.has(a.player_id) && 
           a.status !== 'Not Responded'
  ).length;

  let responseRate = 0;
  if (totalExpectedResponses > 0) {
    responseRate = Math.round((respondedCount / totalExpectedResponses) * 100);
    if (responseRate > 100) responseRate = 100; // Safeguard limit
  }

  // True Pending Responses: Expected minus what we actually have
  const truePendingResponses = totalExpectedResponses > 0 ? (totalExpectedResponses - respondedCount) : 0;

  // Total Available Count (Core players + Assigned Spares)
  const availableCount = availability.filter(
    (a) => liveConcertIds.has(a.concert_id) && 
           (a.status === 'Available' || a.status === 'Spare Assigned')
  ).length;

  const playersWithEmail = activePlayers.filter((p) => p.email).length;

  return (
    <div style={{ padding: '32px', fontFamily: 'system-ui, sans-serif', maxWidth: '1400px', margin: '0 auto', boxSizing: 'border-box' }}>
      
      {/* 🌟 UNIFIED MASTER PAGE HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <LayoutDashboard size={36} color="#1e3a5f" />
          <div>
            <h1 style={{ fontSize: '32px', fontWeight: 800, color: '#1e3a5f', margin: 0 }}>Dashboard</h1>
            <p style={{ color: '#64748b', margin: '4px 0 0 0', fontSize: '14px' }}>Real-time overview of metrics and operations status configurations.</p>
          </div>
        </div>
        <button 
          onClick={openCompose} 
          disabled={sending}
          style={{ padding: '10px 16px', backgroundColor: '#1e3a5f', color: '#ffffff', border: 'none', borderRadius: '8px', fontWeight: 600, fontSize: '14px', cursor: sending ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'opacity 0.2s', opacity: sending ? 0.7 : 1 }}
        >
          <Mail size={18} /> {sending ? 'Sending…' : 'Email the Band'}
        </button>
      </div>

      {/* 🌟 UNIFIED STATS GRID */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '24px', marginBottom: '32px' }}>
        
        <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Users size={20} color="#3b82f6" />
          </div>
          <div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{activePlayers.length}</div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#64748b', marginTop: '6px' }}>Active Core Players</div>
          </div>
        </div>

        <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Users size={20} color="#8b5cf6" />
          </div>
          <div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{sparePlayers.length}</div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#64748b', marginTop: '6px' }}>Local Band Spares</div>
          </div>
        </div>

        <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CalendarDays size={20} color="#10b981" />
          </div>
          <div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{liveConcerts.length}</div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#64748b', marginTop: '6px' }}>Live Concerts</div>
          </div>
        </div>

        <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircle size={20} color="#ef4444" />
          </div>
          <div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>
              {totalExpectedResponses > 0 ? `${responseRate}%` : '—'}
            </div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#64748b', marginTop: '6px' }}>Response Rate</div>
          </div>
        </div>

      </div>

      {/* LOWER DATA GRIDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px' }}>
        
        {/* Next Concert Card */}
        <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#0f172a' }}>Next Live Concert</h2>
          </div>
          <div style={{ padding: '20px' }}>
            {nextConcert ? (
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#1e3a5f', margin: '0 0 8px 0' }}>{nextConcert.name}</h3>
                <p style={{ color: '#475569', fontSize: '14px', margin: '0 0 4px 0' }}>
                  {new Date(nextConcert.concert_date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
                <p style={{ color: '#64748b', fontSize: '14px', margin: '0 0 4px 0' }}>{nextConcert.start_time.slice(0, 5)} – {nextConcert.end_time.slice(0, 5)}</p>
                <p style={{ color: '#64748b', fontSize: '14px', margin: '0 0 20px 0' }}>{nextConcert.location}</p>
                
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, backgroundColor: '#dcfce7', color: '#166534', padding: '6px 12px', borderRadius: '20px' }}>
                    <CheckCircle size={14} />
                    {availability.filter((a) => a.concert_id === nextConcert.id && a.status === 'Available').length} Available
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, backgroundColor: '#fef2f2', color: '#991b1b', padding: '6px 12px', borderRadius: '20px' }}>
                    <XCircle size={14} />
                    {availability.filter((a) => a.concert_id === nextConcert.id && a.status === 'Not Available').length} Not Available
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, backgroundColor: '#fff7ed', color: '#c2410c', padding: '6px 12px', borderRadius: '20px', border: '1px solid #ffedd5' }}>
                    <Users size={14} />
                    {availability.filter((a) => a.concert_id === nextConcert.id && a.status === 'Spare Assigned').length} Spares Assigned
                  </div>
                </div>
              </div>
            ) : (
              <p style={{ color: '#64748b', fontSize: '14px', fontStyle: 'italic', margin: 0 }}>No live upcoming concerts scheduled</p>
            )}
          </div>
        </div>

        {/* Concert Status Card */}
        <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#0f172a' }}>Concert Status</h2>
          </div>
          <div style={{ padding: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ fontSize: '14px', color: '#475569', fontWeight: 500 }}>Live Concerts</span>
                <strong style={{ color: '#166534', fontSize: '16px' }}>{liveConcerts.length}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ fontSize: '14px', color: '#475569', fontWeight: 500 }}>Pending (Not Published)</span>
                <strong style={{ color: '#ca8a04', fontSize: '16px' }}>{pendingConcerts.length}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ fontSize: '14px', color: '#475569', fontWeight: 500 }}>Confirmed Available</span>
                <strong style={{ color: '#166534', fontSize: '16px' }}>{availableCount}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '14px', color: '#475569', fontWeight: 500 }}>Pending Responses</span>
                <strong style={{ color: '#c2410c', fontSize: '16px' }}>{truePendingResponses}</strong>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 🌟 UNIFIED EMAIL MODAL OVERLAY */}
      {composeOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000 }}>
          <div style={{ background: '#ffffff', width: '460px', maxWidth: '90vw', borderRadius: '12px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8fafc' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>Email the Band</h3>
              <button type="button" onClick={() => setComposeOpen(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={18} /></button>
            </div>

            <form onSubmit={sendBandEmail} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{ margin: 0, color: '#64748b', fontSize: '13px', lineHeight: 1.5 }}>
                Sending to <strong style={{ color: '#0f172a' }}>{playersWithEmail}</strong> active players. Upcoming concerts and an availability matrix link will be included automatically.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Subject</label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder="e.g., Schedule Update"
                  required
                  autoFocus
                  style={{ padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Message <span style={{ color: '#94a3b8', fontWeight: 400 }}>(optional)</span></label>
                <textarea
                  value={emailMessage}
                  onChange={(e) => setEmailMessage(e.target.value)}
                  placeholder="Add a personal note to the band…"
                  rows={6}
                  style={{ padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', resize: 'vertical', fontFamily: 'inherit', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '8px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setComposeOpen(false)} style={{ padding: '8px 16px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}>
                  Cancel
                </button>
                <button type="submit" disabled={!emailSubject.trim() || sending} style={{ padding: '8px 16px', background: '#1e3a5f', color: '#ffffff', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '13px', cursor: (!emailSubject.trim() || sending) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px', opacity: (!emailSubject.trim() || sending) ? 0.7 : 1 }}>
                  <Send size={14} /> Send to {playersWithEmail} players
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