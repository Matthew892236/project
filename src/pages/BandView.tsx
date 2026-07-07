import React, { useEffect, useState } from 'react';
import { Grid3X3, Info, ShieldAlert } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Player, Concert, Availability, AvailabilityStatus } from '../lib/supabase';

type MatrixConcert = Concert & { latitude: number | null; longitude: number | null; };
type AvailabilityCell = Availability & { 
  player: Player; concert: MatrixConcert;
  approached_spares?: Array<{ id: string; name: string; instrument: string; distance: number; band_name: string; type?: 'local' | 'global' }>;
  current_approach_index?: number; approach_initiated_at?: string | null;
};

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8; 
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function getCellStyle(status: AvailabilityStatus) {
  if (status === 'Available') return { bg: '#dcfce7', text: '#166534', border: '#bbf7d0' };
  if (status === 'Not Available') return { bg: '#fef2f2', text: '#991b1b', border: '#fee2e2' };
  if (status === 'Spare Assigned') return { bg: '#dbeafe', text: '#1e40af', border: '#bfdbfe' };
  
  return { bg: '#fef3c7', text: '#92400e', border: '#fde68a' };
}

function CellContent({ status, playerName, spareName, approachedList, currentIndex }: { status: AvailabilityStatus; playerName: string; spareName?: string; approachedList?: any[]; currentIndex?: number }) {
  if (status === 'Available') return <span style={{ fontWeight: 600 }}>{playerName}</span>;
  if (status === 'Not Available') return <span style={{ fontWeight: 700, fontSize: '15px' }}>✕</span>;
  if (status === 'Spare Assigned') return <span style={{ fontWeight: 600 }}>{spareName || playerName || 'Covered by Dep'}</span>; 
  if (((status as string) === 'Deps Contacted' || (status as string) === 'Spares Contacted') && approachedList && approachedList.length > 0) {
    const activeIdx = currentIndex || 0;
    const currentActivePlayer = approachedList[activeIdx] || approachedList[0];
    return <span style={{ fontSize: '11px', display: 'block', lineHeight: '1.2', fontWeight: 700 }}>Asked: {currentActivePlayer.name.split(' ')[0]} ({activeIdx + 1}/{approachedList.length})</span>;
  }
  return <span style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '13px' }}>No Response</span>;
}
export default function BandView() {
  const params = new URLSearchParams(window.location.search);
  const uid = params.get('uid');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [bandName, setBandName] = useState('');
  const [concerts, setConcerts] = useState<Concert[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [availability, setAvailability] = useState<Availability[]>([]);

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
        supabase.from('players').select('id, name, instrument, status, sort_order').eq('band_id', bandData.id).order('sort_order'),
        supabase.from('availability').select('player_id, concert_id, status, spare_player_id, approached_spares, current_approach_index')
      ]);

      setConcerts(concertsRes.data || []);
      setPlayers(playersRes.data || []);
      setAvailability(availabilityRes.data || []);
    } catch (err: any) {
      setError('Failed to load band schedule.');
    } finally {
      setLoading(false);
    }
  }

  function getStatus(playerId: string, concertId: string): Availability {
    return availability.find((a) => a.player_id === playerId && a.concert_id === concertId)
      ?? { player_id: playerId, concert_id: concertId, status: 'Not Responded', spare_player_id: null };
  }

  const activePlayers = players.filter((p) => p.status === 'Active');
  
  // 🌟 FIXED: Removed the filter so it shows ALL standard instruments, even if vacant
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
            {/* Concert cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '32px' }}>
              {concerts.map((c) => {
const fillingSpare = availability.find(a => a.concert_id === c.id && (a.status === 'Available' || (a.status as string) === 'Spares Contacted' || (a.status as string) === 'Deps Contacted' || a.status === 'Spare Assigned') && a.player?.instrument === instrument && a.player?.status === 'Spare' && !busySpareIds.has(a.player_id));                const total = activePlayers.length;
                return (
                  <div key={c.id} style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
                    <h3 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>{c.name}</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <span style={{ fontSize: '13px', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Calendar size={14} color="#64748b" /> {new Date(c.concert_date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                      <span style={{ fontSize: '13px', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Clock size={14} color="#64748b" /> {c.start_time.slice(0, 5)} – {c.end_time.slice(0, 5)}
                      </span>
                      <span style={{ fontSize: '13px', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <MapPin size={14} color="#64748b" /> {c.location}
                      </span>
                    </div>
                    <div style={{ marginTop: '16px', fontSize: '13px', color: '#166534', fontWeight: 600, display: 'flex', alignItems: 'center', backgroundColor: '#dcfce7', padding: '6px 12px', borderRadius: '6px', width: 'fit-content' }}>
                      <Users size={14} style={{ marginRight: '6px' }} />{available}/{total} available
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Availability grid */}
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
                      
                      // 🌟 FIXED: If the section is empty, render the Position Vacant row
                      if (section.length === 0) {
                        return [
                          <tr key={`header-${instrument}`}>
                            <td colSpan={concerts.length + 1} style={{ padding: '12px 16px', background: '#f1f5f9', fontSize: '13px', fontWeight: 700, color: '#334155', borderBottom: '1px solid #e2e8f0', borderTop: '1px solid #e2e8f0' }}>
                              {instrument} <span style={{ fontWeight: 500, color: '#64748b', marginLeft: '6px' }}>(0)</span>
                            </td>
                          </tr>,
                          <tr key={`vacant-${instrument}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: 600, color: '#94a3b8', position: 'sticky', left: 0, background: 'white', borderRight: '1px solid #e2e8f0', zIndex: 5, fontStyle: 'italic' }}>
                              Position Vacant
                            </td>
                            {concerts.map((c) => {
                              // Scan the database to see if a cascade email was sent for this vacant seat
                              const vacantAvail = availability.find(a => 
                                a.concert_id === c.id && 
                                !activePlayers.some(p => p.id === a.player_id) && 
                                a.approached_spares?.[0]?.instrument === instrument
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
                        ];
                      }

                      return [
                        <tr key={`header-${instrument}`}>
                          <td colSpan={concerts.length + 1} style={{ padding: '12px 16px', background: '#f1f5f9', fontSize: '13px', fontWeight: 700, color: '#334155', borderBottom: '1px solid #e2e8f0', borderTop: '1px solid #e2e8f0' }}>
                            {instrument} <span style={{ fontWeight: 500, color: '#64748b', marginLeft: '6px' }}>({section.length})</span>
                          </td>
                        </tr>,
                        ...section.map((player) => (
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
                        )),
                      ];
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Legend */}
            <div style={{ marginTop: '24px', display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
              {[
                { bg: '#dcfce7', color: '#166534', label: 'Available / Covered' },
                { bg: '#fee2e2', color: '#991b1b', label: 'Not Available' },
                { bg: '#dbeafe', color: '#1e40af', label: 'Dep Assigned' },
                { bg: '#ffedd5', color: '#9a3412', label: 'Deps Contacted' },
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