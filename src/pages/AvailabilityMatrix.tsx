import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core'; 
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, UserPlus, ChevronDown, Clock, Search, Grid3X3, Info, ShieldAlert } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Player, Concert, Availability, AvailabilityStatus } from '../lib/supabase';

const CORNET_FLUGEL = ["principal cornet", "solo cornet", "soprano cornet", "repiano cornet", "2nd cornet", "3rd cornet", "flugelhorn", "cornet", "cornets", "flugel", "soprano"];
const HORNS = ["solo horn", "1st horn", "2nd horn", "horn", "horns", "tenor horn", "tenor horns"];
const BARI_EUPH = ["1st baritone", "2nd baritone", "euphonium", "baritone", "baritones", "euph", "euphs", "euphoniums"];
const TROMBONES = ["1st trombone", "2nd trombone", "bass trombone", "trombone", "trombones"];
const BASSES = ["eeb bass", "bbb bass", "bass", "basses", "tuba", "tubas", "eb bass", "bb bass", "ee flat bass", "bb flat bass"];
const PERCUSSION = ["percussion", "kit", "tuned", "timpani", "timps", "percussionist"];

const MASTER_BRASS_BAND_ORDER = [
  'Soprano Cornet', 'Principal Cornet', 'Solo Cornet', 'Repiano Cornet', '2nd Cornet', '3rd Cornet', 'Flugelhorn',
  'Solo Horn', '1st Horn', '2nd Horn',
  '1st Baritone', '2nd Baritone',
  'Euphonium',
  '1st Trombone', '2nd Trombone', 'Bass Trombone',
  'Eb Bass', 'Bb Bass',
  'Percussion'
];

export function isInstrumentMatch(playerInst: string | undefined, targInst: string) {
  if (!playerInst || !targInst) return false;
  const p = playerInst.toLowerCase().trim();
  const t = targInst.toLowerCase().trim();
  if (p === t) return true;
  if (CORNET_FLUGEL.includes(p) && CORNET_FLUGEL.includes(t)) return true;
  if (HORNS.includes(p) && HORNS.includes(t)) return true;
  if (BARI_EUPH.includes(p) && BARI_EUPH.includes(t)) return true;
  if (TROMBONES.includes(p) && TROMBONES.includes(t)) return true;
  if (BASSES.includes(p) && BASSES.includes(t)) return true;
  if (PERCUSSION.includes(p) && PERCUSSION.includes(t)) return true;
  return false;
}

type MatrixConcert = Concert & { latitude: number | null; longitude: number | null; };

type AvailabilityCell = Availability & { 
  player: Player; concert: MatrixConcert;
  approached_spares?: Array<{ id: string; name: string; instrument: string; distance: number; band_name: string; type?: 'local' | 'global' }>;
  current_approach_index?: number; approach_initiated_at?: string | null;
  target_instrument?: string | null;
  custom_message?: string | null;
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
  
  if ((status as string) === 'Spares Contacted' || (status as string) === 'Deps Contacted') {
    return { bg: '#fef3c7', text: '#92400e', border: '#fde68a' }; 
  }
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
  if (status === 'Spare Assigned') return <span style={{ fontWeight: 600 }}>{spareName || playerName || 'Covered by Dep'}</span>; 
  if (((status as string) === 'Spares Contacted' || (status as string) === 'Deps Contacted') && approachedList && approachedList.length > 0) {
    const activeIdx = currentIndex || 0;
    const currentActivePlayer = approachedList[activeIdx] || approachedList[0];
    return <span style={{ fontSize: '11px', display: 'block', lineHeight: '1.2', fontWeight: 700 }}>Asked: {currentActivePlayer.name} ({activeIdx + 1}/{approachedList.length})</span>;
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
  
  const spaceBelow = window.innerHeight - anchorRect.bottom;
  const showAbove = spaceBelow < 380; 
  const topPos = showAbove ? anchorRect.top + window.scrollY - 4 : anchorRect.bottom + window.scrollY + 4;
  const transform = showAbove ? 'translateY(-100%)' : 'none';
  const left = (window.innerWidth - anchorRect.left) < 360 ? anchorRect.right - 360 : anchorRect.left;
  
  return createPortal(
    <div ref={dropdownRef} style={{ position: 'absolute', top: topPos, left, transform, width: 360, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', zIndex: 9999, overflow: 'hidden', fontFamily: 'system-ui', display: 'flex', flexDirection: 'column' }}>
      {children}
    </div>, document.body
  );
}

function SortableRow({ player, concerts, allPlayers, globalSpares, activeDropdown, setActiveDropdown, getAvailability, onSetStatus, onAddPlayer, getAvailableSpares, renderDepRow, openCascadeCompose }: any) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: player.id });
  const rowStyle = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [shortlistSelection, setShortlistSelection] = useState<any[]>([]);

  function handleCellClick(e: React.MouseEvent, cellId: string) {
    if (activeDropdown === cellId) { setActiveDropdown(null); setAnchorRect(null); } 
    else { setShortlistSelection([]); setAnchorRect((e.currentTarget as HTMLElement).getBoundingClientRect()); setActiveDropdown(cellId); }
  }

  return (
    <tr ref={setNodeRef} style={{ ...rowStyle, borderBottom: '1px solid #f1f5f9' }}>
      <td style={{ padding: '2px 6px', background: '#fff', width: '32px', position: 'sticky', left: 0, zIndex: 10 }}>
        <span {...attributes} {...listeners} style={{ cursor: 'grab', color: '#cbd5e1', display: 'flex' }}><GripVertical size={16} /></span>
      </td>
      <td style={{ padding: '2px 6px', background: '#fff', fontWeight: 600, color: '#0f172a', borderRight: '1px solid #e2e8f0', position: 'sticky', left: '32px', zIndex: 10, minWidth: '140px', boxShadow: '2px 0 5px -2px rgba(0,0,0,0.1)' }}>{player.name}</td>
      {concerts.map((concert: any) => {
        const avail = getAvailability(player.id, concert.id);
        const status: AvailabilityStatus = avail?.status || 'Not Responded';
        const activeQueueIndex = avail?.current_approach_index || 0;
        const cellId = `${player.id}-${concert.id}`;
        const configColors = getCellStyle(status) || { bg: '#f8fafc', text: '#64748b', border: '#e2e8f0' };        
        const { localS: localSparesList, globalS: globalSparesList } = getAvailableSpares(player.instrument, concert);
        const sparePlayer = avail?.spare_player_id ? [...allPlayers, ...globalSpares, ...(avail?.approached_spares || [])].find((p: any) => p.id === avail.spare_player_id) : undefined;
        const totalSparesCount = localSparesList.length + globalSparesList.length;

        return (
          <td key={concert.id} style={{ padding: '6px 8px', borderRight: '1px solid #f1f5f9', minWidth: '170px' }}>
            <div onClick={(e) => handleCellClick(e, cellId)} style={{ padding: '2px 6px', minHeight: '44px', borderRadius: '6px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12.5px', backgroundColor: configColors.bg, color: configColors.text, border: `1px solid ${configColors.border}` }}>
              <CellContent status={status} playerName={player.name} spareName={sparePlayer?.name} approachedList={avail?.approached_spares} currentIndex={activeQueueIndex} />
              <ChevronDown size={14} style={{ opacity: 0.5 }} />
            </div>
            
            {activeDropdown === cellId && anchorRect && (
              <PortalDropdown anchorRect={anchorRect} onClose={() => setActiveDropdown(null)}>
                <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
                  {((status as string) === 'Spares Contacted' || (status as string) === 'Deps Contacted') && avail?.approached_spares && avail.approached_spares.length > 0 && (
                    <div style={{ padding: '12px', background: '#f0fdf4', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 700, color: '#166534', marginBottom: '8px' }}><Clock size={14} /> <span>ACTIVE EMAIL CASCADE</span></div>
                      {avail.approached_spares.map((spare: any, idx: number) => (
                        <div key={spare.id} style={{ fontSize: '12px', display: 'flex', justifyContent: 'space-between', color: idx < activeQueueIndex ? '#94a3b8' : '#1e293b', marginBottom: '4px' }}>
                          <span style={{ textDecoration: idx < activeQueueIndex ? 'line-through' : 'none' }}>{idx+1}. {spare.name}</span>
                          {idx === activeQueueIndex && <span style={{ fontWeight: 700, color: '#2563eb' }}>{getTimeRemaining(avail.approach_initiated_at)}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  
                  <div style={{ padding: '10px 12px', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Set Status</div>
                  <div style={{ padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12.5px', color: '#166534' }} onClick={() => { onSetStatus(player.id, concert.id, 'Available'); setActiveDropdown(null); }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#22c55e' }} /> Available</div>
                  <div style={{ padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12.5px', color: '#991b1b' }} onClick={() => { onSetStatus(player.id, concert.id, 'Not Available'); setActiveDropdown(null); }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444' }} /> Not Available</div>
                  <div style={{ padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12.5px', color: '#475569' }} onClick={() => { onSetStatus(player.id, concert.id, 'Not Responded'); setActiveDropdown(null); }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#94a3b8' }} /> Not Responded</div>
                  
                  <div style={{ height: '1px', background: '#e2e8f0', margin: '4px 0' }} />
                  
                  {totalSparesCount > 0 && (
                    <div style={{ padding: '8px 12px', backgroundColor: '#f8fafc', fontSize: '12px', color: '#475569', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '4px', alignItems: 'flex-start' }}>
                      <Info size={16} color="#3b82f6" style={{ flexShrink: 0, marginTop: '2px' }} />
                      <span style={{ lineHeight: '1.4' }}><strong>How to assign:</strong> Click the checkboxes to build an automated email cascade (up to 3), or click the buttons to action instantly.</span>
                    </div>
                  )}

                  <div style={{ padding: '10px 12px', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Local Deps ({localSparesList.length})</div>
                  {localSparesList.length > 0 ? localSparesList.map((s: any) => renderDepRow(s, concert.id, cellId, player.id, shortlistSelection, setShortlistSelection)) : <div style={{ padding: '4px 16px', fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>None unbooked</div>}
                  
                  <div style={{ padding: '10px 12px', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', borderTop: '1px solid #e2e8f0', marginTop: '4px' }}>Online Network Spares ({globalSparesList.length})</div>
                  
                  {concert.latitude === null || concert.longitude === null ? (
                    <div style={{ padding: '8px 12px', margin: '0 12px 8px 12px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '11px', color: '#991b1b', display: 'flex', gap: '6px' }}>
                      <ShieldAlert size={14} style={{ flexShrink: 0 }} />
                      <span>Postcode missing or invalid. Update the concert location to activate the Dep Radar.</span>
                    </div>
                  ) : globalSparesList.length > 0 ? (
                    globalSparesList.map((s: any) => renderDepRow(s, concert.id, cellId, player.id, shortlistSelection, setShortlistSelection))
                  ) : (
                    <div style={{ padding: '4px 16px', fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>None in range</div>
                  )}
                  
                  <div style={{ height: '1px', background: '#e2e8f0', margin: '4px 0' }} />
                  <div style={{ padding: '2px 6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12.5px', color: '#2563eb', fontWeight: 600 }} onClick={() => { setActiveDropdown(null); onAddPlayer(player.instrument); }}><UserPlus size={16} /> Add new local dep…</div>
                </div>

                {totalSparesCount > 0 && (
                  <div style={{ padding: '2px 6px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: shortlistSelection.length > 0 ? '#0f172a' : '#94a3b8' }}>{shortlistSelection.length}/3 Selected for Email Cascade</span>
                    <button 
                      disabled={shortlistSelection.length === 0}
                      onClick={() => openCascadeCompose(concert.id, player.id, [...shortlistSelection], cellId)}
                      style={{ padding: '6px 12px', backgroundColor: shortlistSelection.length > 0 ? '#2563eb' : '#e2e8f0', color: shortlistSelection.length > 0 ? '#fff' : '#94a3b8', fontSize: '12px', fontWeight: 600, borderRadius: '4px', border: 'none', cursor: shortlistSelection.length > 0 ? 'pointer' : 'not-allowed', transition: 'all 0.2s' }}
                    >Start Email Cascade</button>
                  </div>
                )}
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
  const [myBandName, setMyBandName] = useState<string>(''); 
  const [loading, setLoading] = useState(true);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [vacantDropdown, setVacantDropdown] = useState<string | null>(null);
  const [vacantAnchor, setVacantAnchor] = useState<DOMRect | null>(null);
  const [vacantShortlist, setVacantShortlist] = useState<any[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [addPlayerOpen, setAddPlayerOpen] = useState(false);
  const [newPlayerForm, setNewPlayerForm] = useState({ name: '', instrument: '', email: '', phone: '', status: 'Spare' as 'Active' | 'Spare' });

  const [cascadeMessage, setCascadeMessage] = useState('');
  const [cascadeCompose, setCascadeCompose] = useState<{
    concertId: string;
    concertName: string;
    playerIds: string[];
    selectedSpares: any[];
    anchorId: string;
    dropdownIdToClose: string | null;
    targetInstrument: string | null;
  } | null>(null);

  const playersRef = useRef<Player[]>([]);
  const concertsRef = useRef<MatrixConcert[]>([]);
  const globalSparesRef = useRef<any[]>([]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  useEffect(() => { 
    fetchData(); 
    const params = new URLSearchParams(window.location.search);
    if (params.get('status') === 'contact-manager') {
      setToast("⚠️ This seat is already filled! To back out, you must contact the Band Manager directly.");
    }
    if (params.get('status') === 'welcome') {
      setToast("🎺 Thank you for adding your name to help the band community!");
    }
    const channel = supabase.channel('matrix-realtime-sync').on('postgres_changes', { event: '*', schema: 'public', table: 'availability' }, (payload) => {
      if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
        const newRow = payload.new as any;
        setAvailability((prev) => {
          const pObj = playersRef.current.find((p) => p.id === newRow.player_id) || globalSparesRef.current.find((s) => s.id === newRow.player_id);
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
      if (!user) return setLoading(false);
      const { data: currentBand } = await supabase.from('bands').select('id, name').eq('manager_id', user.id).maybeSingle();
      if (!currentBand) return setLoading(false);
      setMyBandId(currentBand.id); setMyBandName(currentBand.name || 'Local Band');

      const [playersRes, concertsRes, availabilityRes, globalSparesRes] = await Promise.all([
        supabase.from('players').select('*').eq('band_id', currentBand.id).order('instrument').order('sort_order').order('name'),
        supabase.from('concerts').select('*').eq('band_id', currentBand.id).eq('status', 'live').gte('concert_date', new Date().toISOString().split('T')[0]).order('concert_date'),
        supabase.from('availability').select('*'),
        supabase.from('players').select('id, name, instrument, status, tags, band_id, latitude, longitude, bands ( name, latitude, longitude )').or('status.eq.Spare,is_global_spare.eq.true')
      ]);

      const loadedPlayers = (playersRes.data as Player[]) || [];
      const loadedConcerts = (concertsRes.data as MatrixConcert[]) || [];
      const loadedGlobals = globalSparesRes.data || [];

      setPlayers(loadedPlayers); playersRef.current = loadedPlayers; 
      setConcerts(loadedConcerts); concertsRef.current = loadedConcerts; 
      setGlobalSpares(loadedGlobals); globalSparesRef.current = loadedGlobals;

      if (availabilityRes.data) {
        setAvailability((availabilityRes.data as any[]).map((a) => {
          const pObj = loadedPlayers.find((p) => p.id === a.player_id) || loadedGlobals.find((s:any) => s.id === a.player_id);
          const cObj = loadedConcerts.find((c) => c.id === a.concert_id);
          return { ...a, id: `${a.player_id}-${a.concert_id}`, player: pObj, concert: cObj, approached_spares: a.approached_spares || [] };
        }).filter(a => a.player && a.concert));
      }
    } catch (err: any) { console.error("Matrix error:", err.message); } finally { setLoading(false); }
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
      if (a.status === 'Available' || a.status === 'Spare Assigned' || (a.status as string) === 'Spares Contacted' || (a.status as string) === 'Deps Contacted') {
        busyIds.add(a.player_id);
      }
    });

    function playerMatches(p: any, targInst: string) {
      if (isInstrumentMatch(p.instrument, targInst)) return true;
      if (p.tags && Array.isArray(p.tags)) return p.tags.some((tag: string) => isInstrumentMatch(tag, targInst));
      return false;
    }

    const localS = players
      .filter(p => playerMatches(p, targetInst) && p.status === 'Spare' && !busyIds.has(p.id))
      .map(p => ({ id: p.id, name: p.name, instrument: p.instrument, distance: 0, band_name: 'Internal Roster', type: 'local' }));

    const globalS = (() => {
      if (concert.latitude === null || concert.longitude === null) return [];
      return globalSpares
        .filter((s: any) => playerMatches(s, targetInst) && s.band_id !== myBandId && !busyIds.has(s.id))
        .map((s: any) => {
          const lat = s.latitude || s.bands?.latitude || s.band?.latitude;
          const lng = s.longitude || s.bands?.longitude || s.band?.longitude;
          const bandNameLabel = s.band_id ? (s.bands?.name || s.band?.name || 'Network Dep') : 'Independent Dep';
          if (lat !== null && lng !== null && lat !== undefined && lng !== undefined) {
            const milesAway = calculateDistance(concert.latitude!, concert.longitude!, lat, lng);
            return { id: s.id, name: s.name, instrument: s.instrument, distance: Math.round(milesAway * 10) / 10, band_name: bandNameLabel, type: 'global' };
          }
          return null;
        })
        .filter((s: any): s is any => s !== null)
        .sort((a: any, b: any) => a.distance - b.distance);
    })();
    return { localS, globalS };
  }

  async function onSetStatus(playerId: string, concertId: string, status: AvailabilityStatus, spareId?: string, shortlist?: any[], customMessage?: string, targetInstrument?: string) {
    const patch = { 
      player_id: playerId, 
      concert_id: concertId, 
      status, 
      spare_player_id: spareId || null, 
      approached_spares: shortlist || [], 
      current_approach_index: shortlist && shortlist.length > 0 ? 0 : 0, 
      approach_initiated_at: shortlist && shortlist.length > 0 ? new Date().toISOString() : null, 
      custom_message: customMessage || null, 
      target_instrument: targetInstrument || null 
    };
    
    const patches = [patch];

    if (status === 'Spare Assigned' && spareId && spareId !== playerId) {
      patches.push({ 
        player_id: spareId, 
        concert_id: concertId, 
        status: 'Available', 
        spare_player_id: null, 
        approached_spares: [], 
        current_approach_index: 0, 
        approach_initiated_at: null, 
        custom_message: null, 
        target_instrument: targetInstrument || null 
      });
    }

    if (status === 'Available') {
      const waitingCore = availability.find((a) =>
        a.player_id !== playerId && a.concert_id === concertId &&
        ((a.status as string) === 'Spares Contacted' || (a.status as string) === 'Deps Contacted') &&
        a.approached_spares?.some((s: any) => s.id === playerId)
      );
      if (waitingCore) {
        patches.push({ 
          player_id: waitingCore.player_id, 
          concert_id: concertId, 
          status: 'Spare Assigned', 
          spare_player_id: playerId, 
          approached_spares: waitingCore.approached_spares || [], 
          current_approach_index: waitingCore.current_approach_index ?? 0, 
          approach_initiated_at: waitingCore.approach_initiated_at ?? null, 
          custom_message: null, 
          target_instrument: waitingCore.target_instrument ?? null 
        });
      }
    }

    setAvailability((prev) => {
      let newState = [...prev];
      for (const p of patches) {
        const existingIdx = newState.findIndex((a) => a.player_id === p.player_id && a.concert_id === p.concert_id);
        const playerObj = players.find((x) => x.id === p.player_id) || globalSpares.find((x) => x.id === p.player_id);
        const concertObj = concerts.find((x) => x.id === p.concert_id);

        if (playerObj && concertObj) {
          const enrichedCell = {
            id: `${p.player_id}-${p.concert_id}`,
            ...p,
            player: playerObj,
            concert: concertObj,
            approached_spares: p.approached_spares || []
          } as unknown as AvailabilityCell;

          if (existingIdx !== -1) {
            newState[existingIdx] = enrichedCell;
          } else {
            newState.push(enrichedCell);
          }
        }
      }
      return newState;
    });

    try {
      await Promise.all(patches.map(p => supabase.from('availability').upsert(p, { onConflict: 'player_id,concert_id' })));
      if (!shortlist) setToast('Status synced successfully.');
    } catch (err) {
      console.error("Error upserting availability status:", err);
      setToast('Error syncing availability.');
      await fetchData();
    }
  }

  function openCascadeCompose(concertId: string, anchorId: string, selectedSpares: any[], dropdownIdToClose: string | null, targetInstrument: string | null = null) {
    const concert = concerts.find(c => c.id === concertId);
    setCascadeMessage('');
    setCascadeCompose({ concertId, concertName: concert?.name || 'Concert', playerIds: selectedSpares.map(s => s.id), selectedSpares, anchorId, dropdownIdToClose, targetInstrument });
  }

  async function handleDragEnd(event: DragEndEvent, sectionIdentifier: string) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const section = players.filter(p => p.instrument === sectionIdentifier && p.status === 'Active');
    const oldIdx = section.findIndex((p) => p.id === active.id);
    const newIdx = section.findIndex((p) => p.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(section, oldIdx, newIdx);
    setPlayers((prev) => {
      const others = prev.filter(p => !(p.instrument === sectionIdentifier && p.status === 'Active'));
      return [...others, ...reordered];
    });
    await Promise.all(reordered.map((p, i) => supabase.from('players').update({ sort_order: i + 1 }).eq('id', p.id)));
  }

  async function saveNewPlayer(e: React.FormEvent) {
    e.preventDefault();
    if (!newPlayerForm.instrument) return setToast('Please select an instrument');
    if (!newPlayerForm.email) return setToast('Please provide an email address');
    const cleanEmail = newPlayerForm.email.toLowerCase().trim();
    if (newPlayerForm.status === 'Spare') {
      const { data: existingSpare } = await supabase.from('players').select('id, name').eq('email', cleanEmail).eq('status', 'Spare').maybeSingle();
      if (existingSpare) { setToast(`${existingSpare.name} is already registered on the network!`); setAddPlayerOpen(false); return; }
    }
    const { data: inserted, error = null } = await supabase.from('players').insert({ name: newPlayerForm.name, instrument: newPlayerForm.instrument, email: cleanEmail, phone: newPlayerForm.phone || null, status: newPlayerForm.status, band_id: myBandId, tags: [] }).select().single();
    if (error || !inserted) return setToast('Error adding player');

    if (concerts.length > 0 && newPlayerForm.status === 'Active') {
      await supabase.from('availability').insert(concerts.map((c) => ({ player_id: inserted.id, concert_id: c.id, status: 'Not Responded' as AvailabilityStatus })));
    }    
    setToast(`${inserted.name} added to roster as a Spare`); setAddPlayerOpen(false); await fetchData();
  }

  const renderDepRow = (s: any, concertId: string, dropdownId: string, targetCorePlayerId: string | undefined, currentShortlist: any[], setShortlist: any, targetInstrument?: string) => {
    const rIdx = currentShortlist.findIndex((item: any) => item.id === s.id);
    const isRanked = rIdx !== -1;

    return (
      <div key={s.id} style={{ padding: '8px 12px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: isRanked ? '#eff6ff' : 'transparent', transition: 'background 0.2s' }}>
        <div onClick={() => { setShortlist((prev: any[]) => { if (isRanked) return prev.filter((item: any) => item.id !== s.id); if (prev.length >= 3) return prev; return [...prev, s]; }); }} style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, marginRight: '8px', cursor: 'pointer' }}>
          <div style={{ width: '18px', height: '18px', borderRadius: '4px', border: `2px solid ${isRanked ? '#2563eb' : '#cbd5e1'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: isRanked ? '#2563eb' : '#fff', color: '#fff', fontSize: '11px', fontWeight: 'bold', flexShrink: 0, transition: 'all 0.1s' }}>
            {isRanked ? (rIdx + 1) : ''}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', pointerEvents: 'none' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>{s.name}</span>
            <span style={{ fontSize: '11px', color: '#64748b', lineHeight: '1.3' }}>
              {s.instrument} {s.type === 'global' ? `(${s.band_name}) • ${s.distance} mi` : '• Local Spare'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '6px' }}>
          <button type="button" title="Email this player immediately" onClick={(e) => { 
            e.stopPropagation(); 
            const anchorId = targetCorePlayerId || s.id; 
            openCascadeCompose(concertId, anchorId, [s], dropdownId, targetCorePlayerId ? undefined : targetInstrument); 
          }} style={{ padding: '2px 6px', fontSize: '11px', fontWeight: 600, backgroundColor: '#eff6ff', color: '#2563eb', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Email</button>
          
          <button type="button" title="Directly assign to gig" onClick={(e) => { 
            e.stopPropagation(); 
            if (targetCorePlayerId) onSetStatus(targetCorePlayerId, concertId, 'Spare Assigned', s.id); 
            else onSetStatus(s.id, concertId, 'Spare Assigned', s.id, undefined, undefined, targetInstrument); 
            if (dropdownId === vacantDropdown) setVacantDropdown(null); 
            if (dropdownId === activeDropdown) setActiveDropdown(null); 
          }} style={{ padding: '2px 6px', fontSize: '11px', fontWeight: 600, backgroundColor: '#dcfce7', color: '#166534', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Assign</button>
        </div>
      </div>
    );
  };

  if (loading) return <div style={{ padding: '22px', textAlign: 'center', fontFamily: 'system-ui', color: '#64748b' }}>Loading Availability Data...</div>;

  const activePlayers = players.filter(p => p.status === 'Active');

  return (
    <div style={{ padding: '32px', fontFamily: 'system-ui', maxWidth: '1400px', margin: '0 auto', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px 12px', marginBottom: '32px' }}>
        <Grid3X3 size={36} color="#1e3a5f" />
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: 800, color: '#1e3a5f', margin: 0 }}>Availability Matrix</h1>
          <p style={{ color: '#64748b', margin: '4px 0 0 0', fontSize: '12.5px' }}>Track player availability for upcoming concerts. Click a cell to update status.</p>
        </div>
      </div>
      
      {concerts.length === 0 ? (
        <div style={{ padding: '48px', textAlign: 'center', backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <p style={{ color: '#64748b', fontSize: '8px 12px' }}>No live concerts available. Add and publish them in the Concerts tab!</p>
        </div>
      ) : (
        <div className="w-full overflow-x-auto pb-4" style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', maxWidth: '100vw' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12.5px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ padding: '16px 8px', position: 'sticky', left: 0, backgroundColor: '#f8fafc', zIndex: 20, width: '32px' }} />
                <th style={{ padding: '8px 12px', fontWeight: 700, color: '#475569', position: 'sticky', left: '32px', backgroundColor: '#f8fafc', zIndex: 20, minWidth: '140px', borderRight: '1px solid #e2e8f0', boxShadow: '2px 0 5px -2px rgba(0,0,0,0.1)' }}>Core Musician</th>
                {concerts.map((concert) => (
                  <th key={concert.id} style={{ padding: '8px 12px', fontWeight: 700, color: '#1e3a5f', minWidth: '180px', borderRight: '1px solid #e2e8f0' }}>
                    <span style={{ display: 'block' }}>{concert.name}</span>
                    <span style={{ display: 'block', fontWeight: 500, color: '#64748b', fontSize: '12px', marginTop: '4px' }}>{new Date(concert.concert_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MASTER_BRASS_BAND_ORDER.map((instrument) => {
                const section = activePlayers.filter(p => p.instrument === instrument);
                
                if (section.length === 0) {
                  return (
                    <tr key={`vacant-${instrument}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '2px 6px', background: '#f8fafc', position: 'sticky', left: 0, zIndex: 10, width: '32px' }} />
                      <td style={{ padding: '2px 6px', background: '#f8fafc', fontWeight: 600, color: '#94a3b8', borderRight: '1px solid #e2e8f0', position: 'sticky', left: '32px', zIndex: 10, minWidth: '140px', boxShadow: '2px 0 5px -2px rgba(0,0,0,0.1)' }}>
                        {instrument} <span style={{ fontSize: '11px', fontWeight: 'normal', fontStyle: 'italic', display: 'block' }}>Position Vacant</span>
                      </td>
                      {concerts.map(c => {
                        const cellId = `vacant-${instrument}-${c.id}`;
                        const { localS, globalS } = getAvailableSpares(instrument, c);
                        
                        const fillingSpare = availability.find(a => 
                          a.concert_id === c.id && 
                          (a.status === 'Available' || (a.status as string) === 'Spares Contacted' || (a.status as string) === 'Deps Contacted' || a.status === 'Spare Assigned') && 
                          !activePlayers.some(p => p.id === a.player_id) && 
                          (a.target_instrument === instrument || (!a.target_instrument && isInstrumentMatch(a.player?.instrument, instrument)))
                        );
                        
                        const totalSparesCount = localS.length + globalS.length;

                        if (fillingSpare) {
                           const configColors = getCellStyle(fillingSpare.status) || { bg: '#f8fafc', text: '#64748b', border: '#e2e8f0' };
                           const sparePlayer = fillingSpare.spare_player_id ? [...players, ...globalSpares, ...(fillingSpare.approached_spares || [])].find((p: any) => p.id === fillingSpare.spare_player_id) : undefined;
                           return (
                             <td key={c.id} style={{ padding: '6px 8px', borderRight: '1px solid #f1f5f9' }}>
                               <div onClick={(e) => { if(vacantDropdown === cellId) { setVacantDropdown(null); setVacantAnchor(null); } else { setVacantShortlist([]); setVacantAnchor(e.currentTarget.getBoundingClientRect()); setVacantDropdown(cellId); } }} style={{ padding: '2px 6px', minHeight: '44px', borderRadius: '6px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12.5px', backgroundColor: configColors.bg, color: configColors.text, border: `1px solid ${configColors.border}` }}>
                                 <CellContent status={fillingSpare.status} playerName={fillingSpare.player.name} spareName={sparePlayer?.name} approachedList={fillingSpare.approached_spares} currentIndex={fillingSpare.current_approach_index} /><ChevronDown size={14} style={{ opacity: 0.5 }} />
                               </div>
                               {vacantDropdown === cellId && vacantAnchor && (
                                 <PortalDropdown anchorRect={vacantAnchor} onClose={() => setVacantDropdown(null)}>
                                   <div style={{ padding: '10px 12px', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Set Status</div>
                                   <div style={{ padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12.5px', color: '#475569' }} onClick={() => { onSetStatus(fillingSpare.player_id, c.id, 'Not Responded'); setVacantDropdown(null); }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#94a3b8' }} /> Unassign</div>
                                 </PortalDropdown>
                               )}
                             </td>
                           )
                        }
                        return (
                          <td key={c.id} style={{ padding: '6px 8px', borderRight: '1px solid #f1f5f9' }}>
                            <div onClick={(e) => { if(vacantDropdown === cellId) { setVacantDropdown(null); setVacantAnchor(null); } else { setVacantShortlist([]); setVacantAnchor(e.currentTarget.getBoundingClientRect()); setVacantDropdown(cellId); } }} style={{ padding: '2px 6px', minHeight: '44px', borderRadius: '6px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '12px', backgroundColor: '#f1f5f9', color: '#64748b', border: '1px dashed #cbd5e1', fontWeight: 600 }}>
                              <Search size={14} style={{ marginRight: '6px' }} /> Find Dep
                            </div>
                            {vacantDropdown === cellId && vacantAnchor && (
                              <PortalDropdown anchorRect={vacantAnchor} onClose={() => setVacantDropdown(null)}>
                                <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
                                  {totalSparesCount > 0 && (
                                    <div style={{ padding: '8px 12px', backgroundColor: '#f8fafc', fontSize: '12px', color: '#475569', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '4px', alignItems: 'flex-start' }}>
                                      <Info size={16} color="#3b82f6" style={{ flexShrink: 0, marginTop: '2px' }} />
                                      <span style={{ lineHeight: '1.4' }}><strong>How to assign:</strong> Click the checkboxes to build an automated email cascade (up to 3), or click the buttons to action instantly.</span>
                                    </div>
                                  )}

                                  <div style={{ padding: '10px 12px', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Local Deps ({localS.length})</div>
                                  {localS.length > 0 ? localS.map((s: any) => renderDepRow(s, c.id, cellId, undefined, vacantShortlist, setVacantShortlist, instrument)) : <div style={{ padding: '4px 16px', fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>None unbooked</div>}
                                  
                                  <div style={{ padding: '10px 12px', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', borderTop: '1px solid #e2e8f0', marginTop: '4px' }}>Online Network Spares ({globalS.length})</div>
                                  
                                  {c.latitude === null || c.longitude === null ? (
                                    <div style={{ padding: '8px 12px', margin: '0 12px 8px 12px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '11px', color: '#991b1b', display: 'flex', gap: '6px' }}>
                                      <ShieldAlert size={14} style={{ flexShrink: 0 }} />
                                      <span>Postcode missing or invalid. Update the concert location to activate the Dep Radar.</span>
                                    </div>
                                  ) : globalS.length > 0 ? (
                                    globalS.map((s: any) => renderDepRow(s, c.id, cellId, undefined, vacantShortlist, setVacantShortlist, instrument))
                                  ) : (
                                    <div style={{ padding: '4px 16px', fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>None in range</div>
                                  )}
                                  
                                  <div style={{ height: '1px', background: '#e2e8f0', margin: 0 }} />
                                  <div style={{ padding: '2px 6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12.5px', fontWeight: 600, color: '#2563eb' }} onClick={() => { setVacantDropdown(null); setNewPlayerForm({ name: '', instrument, email: '', phone: '', status: 'Spare' }); setAddPlayerOpen(true); }}><UserPlus size={16} /> + Add New Local Dep</div>
                                </div>

                                {totalSparesCount > 0 && (
                                  <div style={{ padding: '2px 6px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '12px', fontWeight: 600, color: vacantShortlist.length > 0 ? '#0f172a' : '#94a3b8' }}>{vacantShortlist.length}/3 Selected for Email Cascade</span>
                                    <button type="button" 
                                      disabled={vacantShortlist.length === 0}
                                      onClick={() => {
                                        const payloadSelection = [...vacantShortlist];
                                        const anchorId = payloadSelection[0].id; 
                                        openCascadeCompose(c.id, anchorId, payloadSelection, cellId, instrument);
                                      }}
                                      style={{ padding: '6px 12px', backgroundColor: vacantShortlist.length > 0 ? '#2563eb' : '#e2e8f0', color: vacantShortlist.length > 0 ? '#fff' : '#94a3b8', fontSize: '12px', fontWeight: 600, borderRadius: '4px', border: 'none', cursor: vacantShortlist.length > 0 ? 'pointer' : 'not-allowed', transition: 'all 0.2s' }}
                                    >Start Email Cascade</button>
                                  </div>
                                )}
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
                          <td colSpan={2} style={{ padding: '4px 8px', backgroundColor: '#f1f5f9', fontWeight: 700, color: '#334155', borderBottom: '1px solid #e2e8f0', borderTop: '1px solid #e2e8f0', position: 'sticky', left: 0, zIndex: 10, borderRight: '1px solid #e2e8f0', boxShadow: '2px 0 5px -2px rgba(0,0,0,0.1)' }}>
                            {instrument} <span style={{ fontWeight: 500, fontSize: '13px', color: '#64748b', marginLeft: '6px' }}>({section.length})</span>
                          </td>
                          {concerts.length > 0 && <td colSpan={concerts.length} style={{ padding: '2px 6px', backgroundColor: '#f1f5f9', borderBottom: '1px solid #e2e8f0', borderTop: '1px solid #e2e8f0' }} />}
                        </tr>
                        {section.map((player) => (
                          <SortableRow key={player.id} player={player} concerts={concerts} allPlayers={players} globalSpares={globalSpares} myBandName={myBandName} activeDropdown={activeDropdown} setActiveDropdown={setActiveDropdown} getAvailability={getAvailability} onSetStatus={onSetStatus} onAddPlayer={() => { setNewPlayerForm({ name: '', instrument, email: '', phone: '', status: 'Spare' }); setAddPlayerOpen(true); }} getAvailableSpares={getAvailableSpares} renderDepRow={renderDepRow} openCascadeCompose={openCascadeCompose} />
                        ))}
                      </>
                    </SortableContext>
                  </DndContext>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {cascadeCompose && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,23,42,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000 }}>
          <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', width: '460px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)' }}>
            <h3 style={{ margin: '0 0 16px 0', fontWeight: 800, color: '#0f172a', fontSize: '18px' }}>Email Request to Spares</h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '12.5px', color: '#475569', lineHeight: '1.4' }}>
              Sending gig details for <strong>{cascadeCompose.concertName}</strong> to: <br/>
              <span style={{ color: '#2563eb', fontWeight: 600 }}>{cascadeCompose.selectedSpares.map(s => s.name).join(', ')}</span>
            </p>

            <form onSubmit={async (e) => {
              e.preventDefault();
              if (cascadeCompose.dropdownIdToClose === vacantDropdown) setVacantDropdown(null);
              if (cascadeCompose.dropdownIdToClose === activeDropdown) setActiveDropdown(null);
              setCascadeCompose(null);
              setToast('Starting automated email cascade...');
              
              await onSetStatus(
                cascadeCompose.anchorId, 
                cascadeCompose.concertId, 
                'Spares Contacted' as any, 
                undefined, 
                cascadeCompose.selectedSpares,
                cascadeMessage,
                cascadeCompose.targetInstrument || undefined 
              );

              try {
                await supabase.functions.invoke('send-concert-emails', {
                  body: {
                    concert_id: cascadeCompose.concertId,
                    player_ids: [cascadeCompose.selectedSpares[0].id],
                    message: cascadeMessage
                  }
                });
                setToast('Cascade initiated & email sent to first dep!');
              } catch (err) {
                setToast('Database updated, but email dispatch failed.');
              }
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Custom Email Note (Optional)</label>
                <textarea rows={3} value={cascadeMessage} onChange={e => setCascadeMessage(e.target.value)} placeholder="e.g. Bring a white shirt and music stand..." style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12.5px', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px 12px' }}>
                <button type="button" onClick={() => setCascadeCompose(null)} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" style={{ padding: '8px 16px', borderRadius: '6px', background: '#2563eb', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}>Start Cascade</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {addPlayerOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,23,42,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000 }}>
          <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', width: '400px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: '0 0 16px 0', fontWeight: 700, color: '#0f172a' }}>Add Local {newPlayerForm.instrument} Dep</h3>
            <form onSubmit={saveNewPlayer} style={{ display: 'flex', flexDirection: 'column', gap: '8px 12px' }}>
              <input type="text" value={newPlayerForm.name} onChange={(e) => setNewPlayerForm({ ...newPlayerForm, name: e.target.value })} placeholder="Full Name" required style={{ padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12.5px' }} />
              <input type="email" value={newPlayerForm.email} onChange={(e) => setNewPlayerForm({ ...newPlayerForm, email: e.target.value })} placeholder="Email Address" required style={{ padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12.5px' }} />
              <input type="tel" value={newPlayerForm.phone} onChange={(e) => setNewPlayerForm({ ...newPlayerForm, phone: e.target.value })} placeholder="Phone Number (Optional)" style={{ padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12.5px' }} />
              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button type="button" onClick={() => setAddPlayerOpen(false)} style={{ flex: 1, padding: '10px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                <button type="submit" style={{ flex: 1, padding: '10px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>Save Player</button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {toast && <div style={{ position: 'fixed', bottom: '24px', right: '24px', background: '#0f172a', color: '#fff', padding: '12px 24px', borderRadius: '8px', zIndex: 10000, fontWeight: 500 }}>{toast}</div>}
    </div>
  );
}