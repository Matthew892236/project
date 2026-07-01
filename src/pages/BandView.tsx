import { useEffect, useState } from 'react';
import { Music, Calendar, MapPin, Clock, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { INSTRUMENTS } from '../lib/supabase';

type Concert = { id: string; name: string; concert_date: string; start_time: string; end_time: string; location: string };
type Player = { id: string; name: string; instrument: string; status: string; sort_order: number | null };
type Availability = { player_id: string; concert_id: string; status: string; spare_player_id: string | null };

function statusColor(status: string) {
  if (status === 'Available') return '#dcfce7';
  if (status === 'Not Available') return '#fee2e2';
  if (status === 'Spare Assigned') return '#fef3c7';
  return '#f3f4f6';
}

function statusText(status: string, players: Player[], spareId: string | null) {
  if (status === 'Available') return { label: 'Available', color: '#166534' };
  if (status === 'Not Available') return { label: 'Not Available', color: '#991b1b' };
  if (status === 'Spare Assigned') {
    const spare = players.find((p) => p.id === spareId);
    return { label: spare ? spare.name : 'Spare', color: '#92400e' };
  }
  return { label: '—', color: '#9ca3af' };
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
    supabase.functions.invoke('get-band-view', { body: { uid } }).then(({ data, error: err }) => {
      if (err || !data) { setError('Failed to load band schedule.'); setLoading(false); return; }
      setBandName(data.bandName);
      setConcerts(data.concerts);
      setPlayers(data.players);
      setAvailability(data.availability);
      setLoading(false);
    });
  }, [uid]);

  function getStatus(playerId: string, concertId: string): Availability {
    return availability.find((a) => a.player_id === playerId && a.concert_id === concertId)
      ?? { player_id: playerId, concert_id: concertId, status: 'Not Responded', spare_player_id: null };
  }

  const activePlayers = players.filter((p) => p.status === 'Active');
  const instrumentOrder = INSTRUMENTS.filter((inst) => activePlayers.some((p) => p.instrument === inst));
  const customInstruments = [...new Set(activePlayers.map((p) => p.instrument))].filter((i) => !INSTRUMENTS.includes(i));

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: "'Inter', Arial, sans-serif" }}>
      <div style={{ background: '#1e3a5f', padding: '24px 32px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Music size={24} color="white" />
        <div>
          <h1 style={{ color: 'white', margin: 0, fontSize: '20px', fontWeight: 700 }}>{bandName || 'Band Schedule'}</h1>
          <p style={{ color: 'rgba(255,255,255,0.65)', margin: '2px 0 0', fontSize: '13px' }}>Read-only availability matrix</p>
        </div>
      </div>

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px 16px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px', color: '#6b7280', fontSize: '15px' }}>Loading…</div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '80px', color: '#991b1b' }}>{error}</div>
        ) : concerts.length === 0 ? (
          <div style={{ background: 'white', borderRadius: '10px', padding: '48px', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <Calendar size={40} color="#d1d5db" style={{ margin: '0 auto 16px' }} />
            <p style={{ color: '#6b7280', fontSize: '15px' }}>No upcoming concerts scheduled.</p>
          </div>
        ) : (
          <>
            {/* Concert cards */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '32px', flexWrap: 'wrap' }}>
              {concerts.map((c) => {
                const available = availability.filter((a) => a.concert_id === c.id && (a.status === 'Available' || a.status === 'Spare Assigned')).length;
                const total = activePlayers.length;
                return (
                  <div key={c.id} style={{ background: 'white', borderRadius: '10px', padding: '16px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', minWidth: '200px', flex: '1 1 200px' }}>
                    <h3 style={{ margin: '0 0 8px', fontSize: '14px', fontWeight: 700, color: '#1e3a5f' }}>{c.name}</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '12px', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Calendar size={11} /> {new Date(c.concert_date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                      <span style={{ fontSize: '12px', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={11} /> {c.start_time.slice(0, 5)} – {c.end_time.slice(0, 5)}
                      </span>
                      <span style={{ fontSize: '12px', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <MapPin size={11} /> {c.location}
                      </span>
                    </div>
                    <div style={{ marginTop: '10px', fontSize: '12px', color: '#166534', fontWeight: 600 }}>
                      <Users size={11} style={{ marginRight: '4px' }} />{available}/{total} available
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Availability grid */}
            <div style={{ background: 'white', borderRadius: '10px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: `${180 + concerts.length * 130}px` }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6b7280', borderBottom: '1px solid #e5e7eb', position: 'sticky', left: 0, background: '#f8fafc', minWidth: '160px' }}>Player</th>
                      {concerts.map((c) => (
                        <th key={c.id} style={{ padding: '12px 10px', textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#1e3a5f', borderBottom: '1px solid #e5e7eb', minWidth: '120px' }}>
                          {c.name}<br />
                          <span style={{ fontWeight: 400, color: '#9ca3af' }}>{new Date(c.concert_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...instrumentOrder, ...customInstruments].map((instrument) => {
                      const section = activePlayers.filter((p) => p.instrument === instrument);
                      if (section.length === 0) return null;
                      return [
                        <tr key={`header-${instrument}`}>
                          <td colSpan={concerts.length + 1} style={{ padding: '8px 16px', background: '#f1f5f9', fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid #e5e7eb' }}>
                            {instrument} <span style={{ fontWeight: 400, color: '#94a3b8' }}>({section.length})</span>
                          </td>
                        </tr>,
                        ...section.map((player) => (
                          <tr key={player.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '10px 16px', fontSize: '13px', fontWeight: 500, color: '#1f2937', position: 'sticky', left: 0, background: 'white' }}>
                              {player.name}
                            </td>
                            {concerts.map((c) => {
                              const avail = getStatus(player.id, c.id);
                              const { label, color } = statusText(avail.status, players, avail.spare_player_id);
                              return (
                                <td key={c.id} style={{ padding: '6px 8px', textAlign: 'center' }}>
                                  <span style={{
                                    display: 'inline-block',
                                    background: statusColor(avail.status),
                                    color,
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    padding: '3px 10px',
                                    borderRadius: '20px',
                                    whiteSpace: 'nowrap',
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
            <div style={{ marginTop: '16px', display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
              {[
                { bg: '#dcfce7', color: '#166534', label: 'Available' },
                { bg: '#fee2e2', color: '#991b1b', label: 'Not Available' },
                { bg: '#fef3c7', color: '#92400e', label: 'Spare Assigned' },
                { bg: '#f3f4f6', color: '#9ca3af', label: 'Not Responded' },
              ].map(({ bg, color, label }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#6b7280' }}>
                  <span style={{ display: 'inline-block', width: '12px', height: '12px', borderRadius: '50%', background: bg, border: `1px solid ${color}30` }} />
                  {label}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div style={{ textAlign: 'center', padding: '24px', color: '#d1d5db', fontSize: '12px' }}>
        Brassbandwidth — read-only view
      </div>
    </div>
  );
}
