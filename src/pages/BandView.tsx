import React, { useEffect, useState } from 'react';
import { Grid3X3, Music, Calendar, MapPin, Users, Clock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Player, Concert } from '../lib/supabase';
const STANDARD_INSTRUMENTS = [
  "Conductor", "Soprano Cornet", "Principal Cornet", "Solo Cornet", "Repiano Cornet",
  "2nd Cornet", "3rd Cornet", "Flugelhorn", "Solo Horn", "1st Horn", "2nd Horn",
  "1st Baritone", "2nd Baritone", "Euphonium", "1st Trombone", "2nd Trombone",
  "Bass Trombone", "EEb Bass", "BBb Bass", "Percussion"
];

type MatrixConcert = Concert & { latitude: number | null; longitude: number | null; };

// Unified Color Schema Helper
function statusColor(status: string): string {
  if (status === 'Available') return '#dcfce7'; // Light Green
  if (status === 'Not Available') return '#fef2f2'; // Light Red
  if (status === 'Spare Assigned') return '#dbeafe'; // Light Blue
  if (status === 'Deps Contacted' || status === 'Spares Contacted') return '#fef3c7'; // Light Orange/Yellow
  return '#f8fafc'; // Default off-white
}

// Unified Text Label & Foreground Color Generator
function statusText(avail: any, allPlayers: Player[]) {
  const status = avail?.status;
  if (status === 'Available') return { label: 'Available', color: '#166534' };
  if (status === 'Not Available') return { label: '✕ Not Available', color: '#991b1b' };
  
  if (status === 'Spare Assigned') {
    const spare = allPlayers.find(p => p.id === avail.spare_player_id);
    return { label: spare ? spare.name : 'Dep Assigned', color: '#1e40af' };
  }
  
  if (status === 'Deps Contacted' || status === 'Spares Contacted') {
    const list = avail.approached_spares || [];
    const idx = avail.current_approach_index || 0;
    const activePlayer = list[idx] || list[0];
    return { 
      label: activePlayer ? `Asked: ${activePlayer.name.split(' ')[0]} (${idx + 1}/${list.length})` : 'Asked Dep...', 
      color: '#92400e' 
    };
  }
  
  return { label: 'No Response', color: '#64748b' };
}

export default function BandView() {
  const params = new URLSearchParams(window.location.search);
  const uid = params.get('uid');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [bandName, setBandName] = useState('');
  const [concerts, setConcerts] = useState<MatrixConcert[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [availability, setAvailability] = useState<any[]>([]);

  useEffect(() => {
    if (!uid) { setError('Invalid link — no band ID provided.'); setLoading(false); return; }
    fetchPublicData();
  }, [uid]);

  async function fetchPublicData() {
    try {
      const { data: bandData } = await supabase.from('bands').select('id, name').eq('id', uid).single();
      if (!bandData) throw new Error("Band not found.");
      setBandName(bandData.name);

      const [concertsRes, playersRes, availabilityRes] = await Promise.all([
      supabase.from('concerts').select('*').eq('band_id', bandData.id).eq('status', 'live').gte('concert_date', new Date().toISOString().split('T')[0]).order('concert_date'),
      
      // 🌟 FIX: Changed from picking specific fields to select('*') to give TypeScript the full Player object!
      supabase.from('players').select('*').eq('band_id', bandData.id).order('sort_order'),
      
      supabase.from('availability').select('player_id, concert_id, status, spare_player_id, approached_spares, current_approach_index')
    ]);

      setConcerts((concertsRes.data as MatrixConcert[]) || []);
      setPlayers(playersRes.data || []);
      setAvailability(availabilityRes.data || []);
    } catch (err: any) {
      setError('Failed to load band schedule.');
    } finally {
      setLoading(false);
    }
  }

  function getStatus(playerId: string, concertId: string): any {
    return availability.find((a) => a.player_id === playerId && a.concert_id === concertId)
      ?? { player_id: playerId, concert_id: concertId, status: 'Not Responded', spare_player_id: null };
  }

  const activePlayers = players.filter((p) => p.status === 'Active');
  const existingInstruments = Array.from(new Set(players.map(p => p.instrument)));
  const displayInstruments = Array.from(new Set([...STANDARD_INSTRUMENTS, ...existingInstruments]));

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div style={{ background: '#1e3a5f', padding: '24px 32px', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
        <div style={{ backgroundColor: '#eab308', padding: '8px', borderRadius: '8px', display: 'flex' }}>
          <Music size={24} color="#1e3a5f" />
        </div>
        <div>
          <h1 style={{ color: 'white', margin: 0, fontSize: '20px', fontWeight: 700 }}>{bandName || 'Band Schedule'}</h1>
          <p style={{ color: '#93c5fd', margin: '2px 0 0', fontSize: '13px' }}>Read-only availability matrix</p>
        </div>
      </div>

      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px', color: '#64748b', fontSize: '15px' }}>Loading Schedule...</div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '80px', color: '#991b1b', fontWeight: 600 }}>{error}</div>
        ) : concerts.length === 0 ? (
          <div style={{ background: 'white', borderRadius: '12px', padding: '48px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
            <Calendar size={40} color="#cbd5e1" style={{ margin: '0 auto 16px' }} />
            <p style={{ color: '#64748b', fontSize: '15px' }}>No upcoming concerts scheduled.</p>
          </div>
        ) : (
          <>
            {/* Concert cards banner loop */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '32px' }}>
              {concerts.map((c) => {
                const total = activePlayers.length;
                const available = availability.filter(a => a.concert_id === c.id && a.status === 'Available').length;
                
                return (
                  <div key={c.id} style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
                    <h3 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>{c.name}</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <span style={{ fontSize: '13px', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Calendar size={14} color="#64748b" /> {new Date(c.concert_date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                      <span style={{ fontSize: '13px', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Clock size={14} color="#64748b" /> {c.start_time?.slice(0, 5)} – {c.end_time?.slice(0, 5)}
                      </span>
                      <span style={{ fontSize: '13px', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <MapPin size={14} color="#64748b" /> {c.location}
                      </span>
                    </div>
                    <div style={{ marginTop: '16px', fontSize: '13px', color: '#166534', fontWeight: 600, display: 'flex', alignItems: 'center', backgroundColor: '#dcfce7', padding: '6px 12px', borderRadius: '6px', width: 'fit-content' }}>
                      <Users size={14} style={{ marginRight: '6px' }} />{available}/{total} active filled
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Availability Grid Table Layout */}
            <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                      <th style={{ padding: '16px', fontWeight: 700, color: '#475569', position: 'sticky', left: 0, background: '#f8fafc', minWidth: '180px', borderRight: '1px solid #e2e8f0', zIndex: 10 }}>Core Musician</th>
                      {concerts.map((c) => (
                        <th key={c.id} style={{ padding: '16px', textAlign: 'center', fontWeight: 700, color: '#1e3a5f', borderRight: '1px solid #e2e8f0', minWidth: '160px' }}>
                          <span style={{ display: 'block' }}>{c.name}</span>
                          <span style={{ display: 'block', fontWeight: 500, color: '#64748b', fontSize: '12px', marginTop: '4px' }}>{new Date(c.concert_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {displayInstruments.map((instrument) => {
                      const section = activePlayers.filter((p) => p.instrument === instrument);
                      
                      // Vacant Position Rows
                      if (section.length === 0) {
                        return (
                          <React.Fragment key={`vacant-frag-${instrument}`}>
                            <tr>
                              <td colSpan={concerts.length + 1} style={{ padding: '12px 16px', background: '#f1f5f9', fontSize: '13px', fontWeight: 700, color: '#334155', borderBottom: '1px solid #e2e8f0', borderTop: '1px solid #e2e8f0' }}>
                                {instrument} <span style={{ fontWeight: 500, color: '#64748b', marginLeft: '6px' }}>(0)</span>
                              </td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: 600, color: '#94a3b8', position: 'sticky', left: 0, background: 'white', borderRight: '1px solid #e2e8f0', zIndex: 5, fontStyle: 'italic' }}>
                                Position Vacant
                              </td>
                              {concerts.map((c) => {
                                const vacantAvail = availability.find(a => 
                                  a.concert_id === c.id && 
                                  (a.status === 'Available' || a.status === 'Deps Contacted' || a.status === 'Spares Contacted' || a.status === 'Spare Assigned') &&
                                  !activePlayers.some(p => p.id === a.player_id) && 
                                  a.approached_spares?.some((s: any) => s.instrument === instrument)
                                );

                                let label = '—';
                                let color = '#9ca3af';
                                let bg = '#f3f4f6';

                                if (vacantAvail) {
                                  const statusInfo = statusText(vacantAvail, players);
                                  label = statusInfo.label;
                                  color = statusInfo.color;
                                  bg = statusColor(vacantAvail.status);
                                }

                                return (
                                  <td key={c.id} style={{ padding: '8px', textAlign: 'center', borderRight: '1px solid #f1f5f9' }}>
                                    <span style={{ display: 'inline-block', background: bg, color, fontSize: '12px', fontWeight: 600, padding: '6px 12px', borderRadius: '6px', whiteSpace: 'nowrap' }}>
                                      {label}
                                    </span>
                                  </td>
                                );
                              })}
                            </tr>
                          </React.Fragment>
                        );
                      }

                      // Active Roster Instrument Section Rows
                      return (
                        <React.Fragment key={`section-frag-${instrument}`}>
                          <tr>
                            <td colSpan={concerts.length + 1} style={{ padding: '12px 16px', background: '#f1f5f9', fontSize: '13px', fontWeight: 700, color: '#334155', borderBottom: '1px solid #e2e8f0', borderTop: '1px solid #e2e8f0' }}>
                              {instrument} <span style={{ fontWeight: 500, color: '#64748b', marginLeft: '6px' }}>({section.length})</span>
                            </td>
                          </tr>
                          {section.map((player) => (
                            <tr key={player.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: 600, color: '#0f172a', position: 'sticky', left: 0, background: 'white', borderRight: '1px solid #e2e8f0', zIndex: 5 }}>
                                {player.name}
                              </td>
                              {concerts.map((c) => {
                                const avail = getStatus(player.id, c.id);
                                const { label, color } = statusText(avail, players);
                                
                                return (
                                  <td key={c.id} style={{ padding: '8px', textAlign: 'center', borderRight: '1px solid #f1f5f9' }}>
                                    <span style={{
                                      display: 'inline-block', background: statusColor(avail.status), color,
                                      fontSize: '12px', fontWeight: 600, padding: '6px 12px', borderRadius: '6px', whiteSpace: 'nowrap'
                                    }}>{label}</span>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Explanatory Visual Legend */}
            <div style={{ marginTop: '24px', display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
              {[
                { bg: '#dcfce7', color: '#166534', label: 'Available / Covered' },
                { bg: '#fef2f2', color: '#991b1b', label: 'Not Available' },
                { bg: '#dbeafe', color: '#1e40af', label: 'Dep Assigned (Blue)' },
                { bg: '#fef3c7', color: '#92400e', label: 'Deps Contacted (Orange)' },
                { bg: '#f3f4f6', color: '#9ca3af', label: 'Not Responded / Vacant' },
              ].map(({ bg, color, label }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 500, color: '#475569' }}>
                  <span style={{ display: 'inline-block', width: '14px', height: '14px', borderRadius: '4px', background: bg, border: `1px solid ${color}30` }} />
                  {label}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div style={{ textAlign: 'center', padding: '24px', color: '#94a3b8', fontSize: '13px', fontWeight: 500 }}>
        BrassBandwidth — Live Schedule Sync
      </div>
    </div>
  );
}