import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
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
import { GripVertical, UserPlus, ChevronDown, Clock, Search, Grid3X3 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Player, Concert, Availability, AvailabilityStatus } from '../lib/supabase';

const STANDARD_INSTRUMENTS = [
  "Principal Cornet", "Solo Cornet", "Soprano Cornet", "Repiano Cornet",
  "2nd Cornet", "3rd Cornet", "Flugelhorn", "Solo Horn", "1st Horn", "2nd Horn",
  "1st Baritone", "2nd Baritone", "Euphonium", "1st Trombone", "2nd Trombone",
  "Bass Trombone", "EEb Bass", "BBb Bass", "Percussion"
];

type MatrixConcert = Concert & { latitude: number | null; longitude: number | null; };
type AvailabilityCell = Availability & { 
  player: Player; concert: MatrixConcert;
  approached_spares?: Array<{ id: string; name: string; distance: number; band_name: string; type?: 'local' | 'global' }>;
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
  if (status === 'Spare Assigned') return { bg: '#e0f2fe', text: '#0369a1', border: '#bae6fd' };
  if ((status as string) === 'Spares Contacted') return { bg: '#fef3c7', text: '#92400e', border: '#fde68a' };
  return { bg: '#f8fafc', text: '#64748b', border: '#e2e8f0' };
}

function getTimeRemaining(initiatedAtStr: string | null | undefined): string {
  if (!initiatedAtStr) return '24h 0m left';
  const initiatedAt = new Date(initiatedAtStr).getTime();
  const diff = (initiatedAt + 24 * 60 * 60 * 1000) - new Date().getTime();
  if (diff <= 0) return 'Advancing...';
  return `${Math.floor(diff / (1000 * 60 * 60))}h ${Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))}m left`;
}

function CellContent({ status, playerName, spareName, approachedList, currentIndex }: { status: AvailabilityStatus; playerName: string; spareName?: string; approachedList?: any[]; currentIndex?: number }) {
  if (status === 'Available') return <span style={{ fontWeight: 600 }}>{playerName}</span>;
  if (status === 'Not Available') return <span style={{ fontWeight: 700, fontSize: '15px' }}>✕</span>;
  if (status === 'Spare Assigned') return <span style={{ fontWeight: 600 }}>{spareName || 'Covered by Dep'}</span>; 
  if ((status as string) === 'Spares Contacted' && approachedList && approachedList.length > 0) {
    const activeIdx = currentIndex || 0;
    const currentActivePlayer = approachedList[activeIdx] || approachedList[0];
    return <span style={{ fontSize: '11px', display: 'block', lineHeight: '1.2', fontWeight: 700 }}>Asked: {currentActivePlayer.name.split(' ')[0]} ({activeIdx + 1}/{approachedList.length})</span>;
  }
  return <span style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '13px' }}>No Response</span>;
}

function PortalDropdown({ anchorRect, onClose, children }: { anchorRect: DOMRect; onClose: () => void; children: React.ReactNode; }) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handleClick(e: MouseEvent) { if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) onClose(); }
    const id = setTimeout(() => document.addEventListener('mousedown', handleClick), 0);
    return () => { clearTimeout(id); document.removeEventListener('mousedown', handleClick); };
  }, [onClose]);

  const left = (window.innerWidth - anchorRect.left) < 280 ? anchorRect.right - 280 : anchorRect.left;
  return createPortal(
    <div ref={dropdownRef} style={{ position: 'fixed', top: anchorRect.bottom + 4, left, width: 280, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', zIndex: 9999, overflow: 'hidden', fontFamily: 'system-ui' }}>
      {children}
    </div>, document.body
  );
}

function SortableRow({ player, concerts, allPlayers, globalSpares, activeDropdown, setActiveDropdown, getAvailability, onSetStatus, onAddPlayer, getAvailableSpares, renderDepRow }: any) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: player.id });
  const rowStyle = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  function handleCellClick(e: React.MouseEvent, cellId: string) {
    if (activeDropdown === cellId) { setActiveDropdown(null); setAnchorRect(null); } 
    else { setAnchorRect((e.currentTarget as HTMLElement).getBoundingClientRect()); setActiveDropdown(cellId); }
  }

  return (
    <tr ref={setNodeRef} style={{ ...rowStyle, borderBottom: '1px solid #f1f5f9' }}>
      <td style={{ padding: '12px 16px', background: '#fff', width: '40px' }}><span {...attributes} {...listeners} style={{ cursor: 'grab', color: '#cbd5e1', display: 'flex' }}><GripVertical size={16} /></span></td>
      <td style={{ padding: '12px 16px', background: '#fff', fontWeight: 600, color: '#0f172a', borderRight: '1px solid #e2e8f0', position: 'sticky', left: 0, zIndex: 10 }}>{player.name}</td>
      {concerts.map((concert: any) => {
        const avail = getAvailability(player.id, concert.id);
        const status: AvailabilityStatus = avail?.status || 'Not Responded';
        const activeQueueIndex = avail?.current_approach_index || 0;
        const cellId = `${player.id}-${concert.id}`;
        const configColors = getCellStyle(status);

        const { localS: localSparesList, globalS: globalSparesList } = getAvailableSpares(player.instrument, concert);
        
        // 🌟 BATCH 4 FIX: Safe fallback lookup using both arrays so name doesn't disappear when assigned!
        const sparePlayer = avail?.spare_player_id ? [...allPlayers, ...globalSpares].find((p: any) => p.id === avail.spare_player_id) : undefined;

        return (
          <td key={concert.id} style={{ padding: '6px 8px', borderRight: '1px solid #f1f5f9', minWidth: '170px' }}>
            <div onClick={(e) => handleCellClick(e, cellId)} style={{ padding: '12px 14px', minHeight: '44px', borderRadius: '6px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '14px', backgroundColor: configColors.bg, color: configColors.text, border: `1px solid ${configColors.border}` }}>
              <CellContent status={status} playerName={player.name} spareName={sparePlayer?.name} approachedList={avail?.approached_spares} currentIndex={activeQueueIndex} />
              <ChevronDown size={14} style={{ opacity: 0.5 }} />
            </div>
            
            {activeDropdown === cellId && anchorRect && (
              <PortalDropdown anchorRect={anchorRect} onClose={() => setActiveDropdown(null)}>
                <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
                  {(status as string) === 'Spares Contacted' && avail?.approached_spares && avail.approached_spares.length > 0 && (
                    <div style={{ padding: '12px', background: '#f0fdf4', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 700, color: '#166534', marginBottom: '8px' }}>
                        <Clock size={14} /> <span>ACTIVE CASCADE SYSTEM</span>
                      </div>
                      {avail.approached_spares.map((spare: any, idx: number) => (
                        <div key={spare.id} style={{ fontSize: '12px', display: 'flex', justifyContent: 'space-between', color: idx < activeQueueIndex ? '#94a3b8' : '#1e293b', marginBottom: '4px' }}>
                          <span style={{ textDecoration: idx < activeQueueIndex ? 'line-through' : 'none' }}>{idx+1}. {spare.name}</span>
                          {idx === activeQueueIndex && <span style={{ fontWeight: 700, color: '#2563eb' }}>{getTimeRemaining(avail.approach_initiated_at)}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  
                  <div style={{ padding: '10px 12px', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Set Status</div>
                  <div style={{ padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#166534' }} onClick={() => { onSetStatus(player.id, concert.id, 'Available'); setActiveDropdown(null); }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#22c55e' }} /> Available</div>
                  <div style={{ padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#991b1b' }} onClick={() => { onSetStatus(player.id, concert.id, 'Not Available'); setActiveDropdown(null); }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444' }} /> Not Available</div>
                  <div style={{ padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#475569' }} onClick={() => { onSetStatus(player.id, concert.id, 'Not Responded'); setActiveDropdown(null); }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#94a3b8' }} /> Not Responded</div>
                  
                  {/* 🌟 DIRECT ASSIGN / ASK LISTS INTEGRATED INTO DROPDOWN */}
                  <div style={{ height: '1px', background: '#e2e8f0', margin: '4px 0' }} />
                  <div style={{ padding: '10px 12px', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Local Deps ({localSparesList.length})</div>
                  {localSparesList.length > 0 ? localSparesList.map((s: any) => renderDepRow(s, concert.id, cellId, player.id)) : <div style={{ padding: '4px 16px', fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>None unbooked</div>}
                  
                  <div style={{ padding: '10px 12px', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', borderTop: '1px solid #e2e8f0', marginTop: '4px' }}>Network Deps ({globalSparesList.length})</div>
                  {globalSparesList.length > 0 ? globalSparesList.map((s: any) => renderDepRow(s, concert.id, cellId, player.id)) : <div style={{ padding: '4px 16px', fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>None in range</div>}
                </div>

                <div style={{ height: '1px', background: '#e2e8f0', margin: '0' }} />
                <div style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#2563eb', fontWeight: 600 }} onClick={() => { setActiveDropdown(null); onAddPlayer(player.instrument); }}>
                  <UserPlus size={16} /> Add new local dep…
                </div>
              </PortalDropdown>
            )}
          </td>
        );
      })}
    </tr>
  );
}

export default function AvailabilityMatrix() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [concerts, setConcerts] = useState<MatrixConcert[]>([]); 
  const [availability, setAvailability] = useState<AvailabilityCell[]>([]);
  const [globalSpares, setGlobalSpares] = useState<any[]>([]); 
  const [myBandId, setMyBandId] = useState<string | null>(null); 
  const [loading, setLoading] = useState(true);
  
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [vacantDropdown, setVacantDropdown] = useState<string | null>(null);
  const [vacantAnchor, setVacantAnchor] = useState<DOMRect | null>(null);
  
  const [toast, setToast] = useState<string | null>(null);

  const [addPlayerOpen, setAddPlayerOpen] = useState(false);
  const [newPlayerForm, setNewPlayerForm] = useState({ name: '', instrument: '', email: '', phone: '', status: 'Spare' as 'Active' | 'Spare' });

  const playersRef = useRef<Player[]>([]);
  const concertsRef = useRef<MatrixConcert[]>([]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  useEffect(() => { 
    fetchData(); 
    const channel = supabase.channel('matrix-realtime-sync').on('postgres_changes', { event: '*', schema: 'public', table: 'availability' }, (payload) => {
      if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
        const newRow = payload.new as any;
        setAvailability((prev) => {
          const pObj = playersRef.current.find((p) => p.id === newRow.player_id);
          const cObj = concertsRef.current.find((c) => c.id === newRow.concert_id);
          if (!pObj || !cObj) return prev; 
          const enrichedCell: AvailabilityCell = { ...newRow, id: `${newRow.player_id}-${newRow.concert_id}`, player: pObj, concert: cObj, approached_spares: newRow.approached_spares || [] };
          const existingIdx = prev.findIndex((a) => a.id === enrichedCell.id);
          return existingIdx !== -1 ? prev.map((item, idx) => idx === existingIdx ? enrichedCell : item) : [...prev, enrichedCell];
        });
      } else if (payload.eventType === 'DELETE') {
        const oldRow = payload.old as any;
        setAvailability((prev) => prev.filter((a) => !(a.player_id === oldRow.player_id && a.concert_id === oldRow.concert_id)));
      }
    }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data: currentBand } = await supabase.from('bands').select('id').eq('manager_id', user.id).maybeSingle();
      if (!currentBand) { setLoading(false); return; }

      setMyBandId(currentBand.id);

      const [playersRes, concertsRes, availabilityRes, globalSparesRes] = await Promise.all([
        supabase.from('players').select('*').eq('band_id', currentBand.id).order('instrument').order('sort_order').order('name'),
        supabase.from('concerts').select('*').eq('band_id', currentBand.id).eq('status', 'live').gte('concert_date', new Date().toISOString().split('T')[0]).order('concert_date'),
        supabase.from('availability').select('*'),
        supabase.from('players').select('id, name, instrument, band_id, bands ( name, latitude, longitude )').eq('status', 'Spare')
      ]);

      const loadedPlayers = (playersRes.data as Player[]) || [];
      const loadedConcerts = (concertsRes.data as MatrixConcert[]) || [];
      const loadedGlobals = globalSparesRes.data || [];

      setPlayers(loadedPlayers); playersRef.current = loadedPlayers; 
      setConcerts(loadedConcerts); concertsRef.current = loadedConcerts; 
      setGlobalSpares(loadedGlobals);

      if (availabilityRes.data) {
        setAvailability((availabilityRes.data as any[]).map((a) => {
          // 🌟 BATCH 4 FIX: Ensure Global Spares map into the matrix array correctly when fetched
          const pObj = loadedPlayers.find((p) => p.id === a.player_id) || loadedGlobals.find((s:any) => s.id === a.player_id);
          const cObj = loadedConcerts.find((c) => c.id === a.concert_id);
          return { ...a, id: `${a.player_id}-${a.concert_id}`, player: pObj, concert: cObj, approached_spares: a.approached_spares || [] };
        }).filter(a => a.player && a.concert));
      }
    } catch (err: any) { console.error("Error populating data matrix:", err.message); } finally { setLoading(false); }
  }

  function getAvailability(playerId: string, concertId: string): AvailabilityCell | undefined {
    return availability.find((a) => a.player_id === playerId && a.concert_id === concertId);
  }

  function getAvailableSpares(instrument: string, concert: MatrixConcert) {
    const targetInst = instrument.toLowerCase().trim();
    const busyIds = new Set<string>();
    
    availability.filter(a => a.concert_id === concert.id).forEach(a => {
      if (a.spare_player_id) busyIds.add(a.spare_player_id);
      if (a.approached_spares) a.approached_spares.forEach((s: any) => busyIds.add(s.id));
    });

    const localS = players
      .filter(p => p.instrument.toLowerCase().trim() === targetInst && p.status === 'Spare' && !busyIds.has(p.id))
      .map(p => ({ id: p.id, name: p.name, distance: 0, band_name: 'Internal Roster', type: 'local' }));

    const globalS = (() => {
      if (concert.latitude === null || concert.longitude === null) return [];
      return globalSpares
        .filter((s: any) => s.instrument.toLowerCase().trim() === targetInst && s.band_id !== myBandId && !busyIds.has(s.id))
        .map((s: any) => {
          const b = s.bands || s.band;
          if (b && b.latitude !== null && b.longitude !== null) {
            const milesAway = calculateDistance(concert.latitude!, concert.longitude!, b.latitude, b.longitude);
            return { id: s.id, name: s.name, distance: Math.round(milesAway * 10) / 10, band_name: b.name, type: 'global' };
          }
          return null;
        })
        .filter((s: any): s is any => s !== null)
        .sort((a: any, b: any) => a.distance - b.distance);
    })();

    return { localS, globalS };
  }

  async function onSetStatus(playerId: string, concertId: string, status: AvailabilityStatus, spareId?: string, shortlist?: any[]) {
    const patch = { player_id: playerId, concert_id: concertId, status, spare_player_id: spareId || null, approached_spares: shortlist || [], current_approach_index: shortlist && shortlist.length > 0 ? 0 : 0, approach_initiated_at: shortlist && shortlist.length > 0 ? new Date().toISOString() : null };
    
    setAvailability((prev) => {
      const existing = prev.find((a) => a.player_id === playerId && a.concert_id === concertId);
      if (existing) return prev.map((a) => a.player_id === playerId && a.concert_id === concertId ? { ...a, ...patch } : a);
      
      // 🌟 BATCH 4 FIX: Ensure assigning Global Spares directly doesn't crash UI Optimistic Update
      const p = players.find((x) => x.id === playerId) || globalSpares.find((x) => x.id === playerId);
      if (!p) return prev; 

      const c = concerts.find((x) => x.id === concertId)!;
      return [...prev, { id: `${playerId}-${concertId}`, ...patch, player: p, concert: c, created_at: '', updated_at: '' } as AvailabilityCell];
    });

    try {
      const { error } = await supabase.from('availability').upsert(patch, { onConflict: 'player_id,concert_id' });
      if (error) throw error;
    } catch { setToast('Error syncing availability.'); await fetchData(); return; }
  }

  async function handleDragEnd(event: DragEndEvent, sectionIdentifier: string) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const section = sectionIdentifier === 'Spare' 
      ? players.filter(p => p.status === 'Spare') 
      : players.filter(p => p.instrument === sectionIdentifier && p.status === 'Active');
      
    const oldIdx = section.findIndex((p) => p.id === active.id);
    const newIdx = section.findIndex((p) => p.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    
    const reordered = arrayMove(section, oldIdx, newIdx);
    setPlayers((prev) => {
      const others = sectionIdentifier === 'Spare' 
        ? prev.filter(p => p.status !== 'Spare') 
        : prev.filter(p => !(p.instrument === sectionIdentifier && p.status === 'Active'));
      return [...others, ...reordered];
    });
    await Promise.all(reordered.map((p, i) => supabase.from('players').update({ sort_order: i + 1 }).eq('id', p.id)));
  }

  async function saveNewPlayer(e: React.FormEvent) {
    e.preventDefault();
    if (!newPlayerForm.instrument) { setToast('Please select an instrument'); return; }
    if (!newPlayerForm.email) { setToast('Please provide an email address'); return; }
    
    const cleanEmail = newPlayerForm.email.toLowerCase().trim();

    if (newPlayerForm.status === 'Spare') {
      const { data: existingSpare } = await supabase.from('players').select('id, name').eq('email', cleanEmail).eq('status', 'Spare').maybeSingle();
      if (existingSpare) { setToast(`${existingSpare.name} is already registered on the network!`); setAddPlayerOpen(false); return; }
    }

    const { data: inserted, error = null } = await supabase.from('players').insert({ 
      name: newPlayerForm.name, instrument: newPlayerForm.instrument, email: cleanEmail, phone: newPlayerForm.phone || null, status: newPlayerForm.status, band_id: myBandId, tags: [] 
    }).select().single();
    
    if (error || !inserted) { setToast('Error adding player'); return; }
    if (concerts.length > 0) await supabase.from('availability').insert(concerts.map((c) => ({ player_id: inserted.id, concert_id: c.id, status: 'Not Responded' as AvailabilityStatus })));
    setToast(`${inserted.name} added to roster as a Spare`); setAddPlayerOpen(false); await fetchData();
  }

  // 🌟 THE UNIFIED ACTION ENGINE FOR DEPS
  const renderDepRow = (s: any, concertId: string, dropdownId: string, targetCorePlayerId?: string) => (
    <div key={s.id} style={{ padding: '8px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>{s.name}</span>
        <span style={{ fontSize: '11px', color: '#64748b' }}>{s.type === 'global' ? `${s.distance} mi away` : 'Local Dep'}</span>
      </div>
      <div style={{ display: 'flex', gap: '4px' }}>
        <button 
          title="Directly assign to gig"
          onClick={() => { 
             if (targetCorePlayerId) onSetStatus(targetCorePlayerId, concertId, 'Spares Contacted' as any, undefined, [s]);
else onSetStatus(s.id, concertId, 'Spares Contacted' as any, undefined, [s]);
             else onSetStatus(s.id, concertId, 'Available');
             
             if (dropdownId === vacantDropdown) setVacantDropdown(null);
             if (dropdownId === activeDropdown) setActiveDropdown(null);
             setToast(`${s.name} assigned.`); 
          }}
          style={{ padding: '4px 8px', fontSize: '11px', fontWeight: 600, backgroundColor: '#dcfce7', color: '#166534', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >
          Assign
        </button>
        <button 
          title="Send email request"
          onClick={async () => {
            if (dropdownId === vacantDropdown) setVacantDropdown(null);
            if (dropdownId === activeDropdown) setActiveDropdown(null);
            setToast(`Sending request to ${s.name}...`);
            
            if (targetCorePlayerId) onSetStatus(targetCorePlayerId, concertId, 'Spares Contacted', undefined, [s]);
            else onSetStatus(s.id, concertId, 'Spares Contacted', undefined, [s]);
            
            const { error } = await supabase.functions.invoke('send-concert-emails', {
              body: { concert_id: concertId, player_ids: [s.id], is_cascade: true, subject: `Gig Dep Request` }
            });
            if(error) setToast(`Error sending request.`);
            else setToast(`Request sent to ${s.name}!`);
          }}
          style={{ padding: '4px 8px', fontSize: '11px', fontWeight: 600, backgroundColor: '#eff6ff', color: '#2563eb', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >
          Ask
        </button>
      </div>
    </div>
  );

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'system-ui', color: '#64748b' }}>Loading Availability Data...</div>;

  const existingInstruments = Array.from(new Set(players.map(p => p.instrument)));
  const displayInstruments = Array.from(new Set([...STANDARD_INSTRUMENTS, ...existingInstruments]));
  const activePlayers = players.filter(p => p.status === 'Active');
  const sparePlayers = players.filter(p => p.status === 'Spare');

  return (
    <div style={{ padding: '32px', fontFamily: 'system-ui', maxWidth: '1400px', margin: '0 auto', boxSizing: 'border-box' }}>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
        <Grid3X3 size={36} color="#1e3a5f" />
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: 800, color: '#1e3a5f', margin: 0 }}>Availability Matrix</h1>
          <p style={{ color: '#64748b', margin: '4px 0 0 0', fontSize: '14px' }}>Track player availability for upcoming concerts. Click a cell to update status.</p>
        </div>
      </div>
      
      {concerts.length === 0 ? (
        <div style={{ padding: '48px', textAlign: 'center', backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <p style={{ color: '#64748b', fontSize: '16px' }}>No live concerts available. Add and publish them in the Concerts tab!</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', maxWidth: '100vw' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ padding: '16px 8px', position: 'sticky', left: 0, backgroundColor: '#f8fafc', zIndex: 20, width: '40px' }} />
                <th style={{ padding: '16px', fontWeight: 700, color: '#475569', position: 'sticky', left: '40px', backgroundColor: '#f8fafc', zIndex: 20, minWidth: '140px', borderRight: '1px solid #e2e8f0', boxShadow: '2px 0 5px -2px rgba(0,0,0,0.1)' }}>Core Musician</th>
                {concerts.map((concert) => (
                  <th key={concert.id} style={{ padding: '16px', fontWeight: 700, color: '#1e3a5f', minWidth: '180px', borderRight: '1px solid #e2e8f0' }}>
                    <span style={{ display: 'block' }}>{concert.name}</span>
                    <span style={{ display: 'block', fontWeight: 500, color: '#64748b', fontSize: '12px', marginTop: '4px' }}>{new Date(concert.concert_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              
              {displayInstruments.map((instrument) => {
                const section = activePlayers.filter(p => p.instrument === instrument);
                
                if (section.length === 0) {
                  return (
                    <tr key={`vacant-${instrument}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px 16px', background: '#f8fafc' }} />
                      <td style={{ padding: '12px 16px', background: '#f8fafc', fontWeight: 600, color: '#94a3b8', borderRight: '1px solid #e2e8f0', position: 'sticky', left: 0, zIndex: 10 }}>
                        {instrument} <span style={{ fontSize: '11px', fontWeight: 'normal', fontStyle: 'italic', display: 'block' }}>Position Vacant</span>
                      </td>
                      {concerts.map(c => {
                        const cellId = `vacant-${instrument}-${c.id}`;
                        const { localS, globalS } = getAvailableSpares(instrument, c);

                        // 🌟 VISUAL UPDATE FIX: Detect if a spare is successfully assigned directly to this vacant chair
                        const busySpareIds = new Set(availability.filter(a => a.concert_id === c.id && a.spare_player_id).map(a => a.spare_player_id));
                        const fillingSpare = availability.find(a => 
   a.concert_id === c.id && 
   (a.status === 'Available' || (a.status as string) === 'Spares Contacted') && 
   a.player?.instrument === instrument && 
   a.player?.status === 'Spare' && 
   !busySpareIds.has(a.player_id)
);

                        if (fillingSpare) {
                           const configColors = getCellStyle(fillingSpare.status);
                           return (
                             <td key={c.id} style={{ padding: '6px 8px', borderRight: '1px solid #f1f5f9' }}>
                               <div 
                                 onClick={(e) => { 
                                   if(vacantDropdown === cellId) { setVacantDropdown(null); setVacantAnchor(null); }
                                   else { setVacantAnchor(e.currentTarget.getBoundingClientRect()); setVacantDropdown(cellId); }
                                 }}
                                 style={{ padding: '10px 12px', borderRadius: '6px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '14px', backgroundColor: configColors.bg, color: configColors.text, border: `1px solid ${configColors.border}` }}
                               >
                                 <CellContent status={fillingSpare.status} playerName={fillingSpare.player.name} approachedList={fillingSpare.approached_spares} currentIndex={fillingSpare.current_approach_index} />
                                 <ChevronDown size={14} style={{ opacity: 0.5 }} />
                               </div>

                               {vacantDropdown === cellId && vacantAnchor && (
                                 <PortalDropdown anchorRect={vacantAnchor} onClose={() => setVacantDropdown(null)}>
                                   <div style={{ padding: '10px 12px', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Set Status</div>
                                   <div style={{ padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#475569' }} onClick={() => { onSetStatus(fillingSpare.player_id, c.id, 'Not Responded'); setVacantDropdown(null); }}>
                                     <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#94a3b8' }} /> Unassign
                                   </div>
                                 </PortalDropdown>
                               )}
                             </td>
                           )
                        }

                        // If Vacant (no filling spare)
                        return (
                          <td key={c.id} style={{ padding: '6px 8px', borderRight: '1px solid #f1f5f9' }}>
                            <div 
                              onClick={(e) => { 
                                if(vacantDropdown === cellId) { setVacantDropdown(null); setVacantAnchor(null); }
                                else { setVacantAnchor(e.currentTarget.getBoundingClientRect()); setVacantDropdown(cellId); }
                              }}
                              style={{ padding: '10px 12px', borderRadius: '6px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '12px', backgroundColor: '#f1f5f9', color: '#64748b', border: '1px dashed #cbd5e1', fontWeight: 600, transition: 'all 0.2s' }}
                              onMouseEnter={e => e.currentTarget.style.backgroundColor = '#e2e8f0'}
                              onMouseLeave={e => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                            >
                              <Search size={14} style={{ marginRight: '6px' }} /> Find Dep
                            </div>

                            {vacantDropdown === cellId && vacantAnchor && (
                              <PortalDropdown anchorRect={vacantAnchor} onClose={() => setVacantDropdown(null)}>
                                <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
                                  <div style={{ padding: '10px 12px', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Local Deps ({localS.length})</div>
                                  {localS.length > 0 ? localS.map((s: any) => renderDepRow(s, c.id, cellId)) : <div style={{ padding: '4px 16px', fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>None unbooked</div>}
                                  
                                  <div style={{ padding: '10px 12px', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', borderTop: '1px solid #e2e8f0', marginTop: '4px' }}>Network Deps ({globalS.length})</div>
                                  {globalS.length > 0 ? globalS.map((s: any) => renderDepRow(s, c.id, cellId)) : <div style={{ padding: '4px 16px', fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>None in range</div>}
                                </div>
                                <div style={{ height: '1px', background: '#e2e8f0', margin: 0 }} />
                                <div 
                                  style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 600, color: '#2563eb' }}
                                  onClick={() => { setVacantDropdown(null); setNewPlayerForm({ name: '', instrument, email: '', phone: '', status: 'Spare' }); setAddPlayerOpen(true); }}
                                >
                                  <UserPlus size={16} /> + Add New Local Dep
                                </div>
                              </PortalDropdown>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                }

                return (
                  <DndContext key={instrument} sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEnd(e, instrument)}>
                    <SortableContext items={section.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                      <>
                        <tr>
                          <td colSpan={concerts.length + 2} style={{ padding: '12px 16px', backgroundColor: '#f1f5f9', fontWeight: 700, color: '#334155', borderBottom: '1px solid #e2e8f0', borderTop: '1px solid #e2e8f0' }}>
                            {instrument} <span style={{ fontWeight: 500, fontSize: '13px', color: '#64748b', marginLeft: '6px' }}>({section.length})</span>
                          </td>
                        </tr>
                        {section.map((player) => (
                          <SortableRow key={player.id} player={player} concerts={concerts} allPlayers={players} globalSpares={globalSpares} myBandId={myBandId} activeDropdown={activeDropdown} setActiveDropdown={setActiveDropdown} getAvailability={getAvailability} allAvailability={availability} onSetStatus={onSetStatus} onAddPlayer={() => { setNewPlayerForm({ name: '', instrument, email: '', phone: '', status: 'Spare' }); setAddPlayerOpen(true); }} getAvailableSpares={getAvailableSpares} renderDepRow={renderDepRow} setToast={setToast} />
                        ))}
                      </>
                    </SortableContext>
                  </DndContext>
                );
              })}

              {sparePlayers.length > 0 && (
                <DndContext key="spares-section" sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEnd(e, 'Spare')}>
                  <SortableContext items={sparePlayers.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                    <>
                      <tr>
                        <td colSpan={concerts.length + 2} style={{ padding: '16px', backgroundColor: '#1e3a5f', fontWeight: 700, color: '#ffffff', borderBottom: '1px solid #e2e8f0', borderTop: '3px solid #e2e8f0', letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: '13px' }}>
                          Local Band Spares / Dep List
                        </td>
                      </tr>
                      {sparePlayers.map((player) => (
                        <SortableRow key={player.id} player={player} concerts={concerts} allPlayers={players} globalSpares={globalSpares} myBandId={myBandId} activeDropdown={activeDropdown} setActiveDropdown={setActiveDropdown} getAvailability={getAvailability} allAvailability={availability} onSetStatus={onSetStatus} onAddPlayer={() => { setNewPlayerForm({ name: '', instrument: player.instrument, email: '', phone: '', status: 'Spare' }); setAddPlayerOpen(true); }} getAvailableSpares={getAvailableSpares} renderDepRow={renderDepRow} setToast={setToast} />
                      ))}
                    </>
                  </SortableContext>
                </DndContext>
              )}

            </tbody>
          </table>
        </div>
      )}

      {/* QUICK ADD MODAL (Locked to Local Dep) */}
      {addPlayerOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,23,42,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000 }}>
          <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', width: '400px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px 0', fontWeight: 700, color: '#0f172a' }}>Add Local {newPlayerForm.instrument} Dep</h3>
            <form onSubmit={saveNewPlayer} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <input type="text" value={newPlayerForm.name} onChange={(e) => setNewPlayerForm({ ...newPlayerForm, name: e.target.value })} placeholder="Full Name" required style={{ padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
              
              <div style={{ padding: '10px 12px', borderRadius: '6px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', fontSize: '13px', color: '#475569', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#8b5cf6' }} /> Registering as Local Band Spare (Dep)
              </div>

              <input type="email" value={newPlayerForm.email} onChange={(e) => setNewPlayerForm({ ...newPlayerForm, email: e.target.value })} placeholder="Email Address (Required for notifications)" required style={{ padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
              <input type="tel" value={newPlayerForm.phone} onChange={(e) => setNewPlayerForm({ ...newPlayerForm, phone: e.target.value })} placeholder="Phone Number (Optional)" style={{ padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }} />

              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button type="button" onClick={() => setAddPlayerOpen(false)} style={{ flex: 1, padding: '10px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                <button type="submit" style={{ flex: 1, padding: '10px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>Save Player</button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {toast && (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', background: '#0f172a', color: '#fff', padding: '12px 24px', borderRadius: '8px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', zIndex: 10000, fontWeight: 500 }}>
          {toast}
        </div>
      )}
    </div>
  );
}