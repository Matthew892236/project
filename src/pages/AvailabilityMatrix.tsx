import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
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
import { GripVertical, UserPlus, ChevronDown, Send, Clock, Users, Globe, Search, AlertCircle } from 'lucide-react';
import { supabase, fetchAllInstruments } from '../lib/supabase';
import type { Player, Concert, Availability, AvailabilityStatus } from '../lib/supabase';

type MatrixConcert = Concert & { 
  latitude: number | null; 
  longitude: number | null; 
};

type AvailabilityCell = Availability & { 
  player: Player; 
  concert: MatrixConcert;
  approached_spares?: Array<{ id: string; name: string; distance: number; band_name: string; type?: 'local' | 'global' }>;
  current_approach_index?: number;
  approach_initiated_at?: string | null;
};

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8; // Radius of Earth in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
      
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getCellBg(status: AvailabilityStatus) {
  if (status === 'Available') return 'cell-bg-available';
  if (status === 'Not Available') return 'cell-bg-not-available';
  if (status === 'Spare Assigned') return 'cell-bg-spare';
  if (status === 'Spares Contacted' as any) return 'cell-bg-contacted';
  return 'cell-bg-not-responded';
}

function getTimeRemaining(initiatedAtStr: string | null | undefined): string {
  if (!initiatedAtStr) return '24h 0m left';
  const initiatedAt = new Date(initiatedAtStr).getTime();
  const deadline = initiatedAt + 24 * 60 * 60 * 1000;
  const now = new Date().getTime();
  const diff = deadline - now;
  if (diff <= 0) return 'Advancing...';
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m left`;
}

function CellContent({ status, playerName, spareName, approachedList, currentIndex }: { status: AvailabilityStatus; playerName: string; spareName?: string; approachedList?: any[]; currentIndex?: number }) {
  if (status === 'Available') return <span className="cell-label cell-available">{playerName}</span>;
  if (status === 'Not Available') return <span className="cell-label cell-not-available">✕</span>;
  
  if (status === 'Spare Assigned') return <span className="cell-label cell-spare">{spareName || 'Covered by Dep'}</span>; 
  
  if ((status as string) === 'Spares Contacted' && approachedList && approachedList.length > 0) {
    const activeIdx = currentIndex || 0;
    const currentActivePlayer = approachedList[activeIdx] || approachedList[0];
    return (
      <span className="cell-label cell-contacted" style={{ fontSize: '11px', display: 'block', lineHeight: '1.2', fontWeight: 600 }}>
        Asked: {currentActivePlayer.name.split(' ')[0]} ({activeIdx + 1}/{approachedList.length})
      </span>
    );
  }
  return <span className="cell-label cell-not-responded">Not Responded</span>;
}

type PortalDropdownProps = {
  anchorRect: DOMRect;
  onClose: () => void;
  children: React.ReactNode;
};

function PortalDropdown({ anchorRect, onClose, children }: PortalDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const DROPDOWN_WIDTH = 240;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    const id = setTimeout(() => document.addEventListener('mousedown', handleClick), 0);
    return () => { clearTimeout(id); document.removeEventListener('mousedown', handleClick); };
  }, [onClose]);

  const spaceRight = window.innerWidth - anchorRect.left;
  const left = spaceRight < DROPDOWN_WIDTH + 8 ? anchorRect.right - DROPDOWN_WIDTH : anchorRect.left;
  const top = anchorRect.bottom + 4;

  return createPortal(
    <div
      ref={dropdownRef}
      style={{
        position: 'fixed',
        top,
        left,
        width: DROPDOWN_WIDTH,
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
        zIndex: 9999,
        overflow: 'hidden',
        fontFamily: 'system-ui'
      }}
    >
      {children}
    </div>,
    document.body
  );
}

type SortableRowProps = {
  player: Player;
  concerts: MatrixConcert[];
  allPlayers: Player[];
  globalSpares: any[]; 
  myBandId: string | null; 
  activeDropdown: string | null;
  setActiveDropdown: (id: string | null) => void;
  getAvailability: (playerId: string, concertId: string) => AvailabilityCell | undefined;
  allAvailability: AvailabilityCell[];
  onSetStatus: (playerId: string, concertId: string, status: AvailabilityStatus, spareId?: string, shortlist?: any[]) => void;
  onAddPlayer: (instrument: string) => void;
};

function SortableRow({ player, concerts, allPlayers, globalSpares, myBandId, activeDropdown, setActiveDropdown, getAvailability, allAvailability, onSetStatus, onAddPlayer }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: player.id });
  const rowStyle = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [sparesModalOpen, setSparesModalOpen] = useState(false);
  const [shortlistSelection, setShortlistSelection] = useState<any[]>([]);

  function handleCellClick(e: React.MouseEvent, cellId: string, currentAvail?: AvailabilityCell) {
    if (activeDropdown === cellId) {
      setActiveDropdown(null);
      setAnchorRect(null);
    } else {
      setShortlistSelection(currentAvail?.approached_spares || []);
      setAnchorRect((e.currentTarget as HTMLElement).getBoundingClientRect());
      setActiveDropdown(cellId);
    }
  }

  return (
    <tr ref={setNodeRef} style={{ ...rowStyle, borderBottom: '1px solid #f1f5f9' }}>
      <td style={{ padding: '12px 16px', background: '#fff' }}>
        <span {...attributes} {...listeners} style={{ cursor: 'grab', color: '#cbd5e1' }}>
          <GripVertical size={16} />
        </span>
      </td>
      <td style={{ padding: '12px 16px', background: '#fff', fontWeight: 500, color: '#0f172a', borderRight: '1px solid #e2e8f0', position: 'sticky', left: 0, zIndex: 10 }}>
        {player.name}
      </td>
      {concerts.map((concert) => {
        const avail = getAvailability(player.id, concert.id);
        const status: AvailabilityStatus = avail?.status || 'Not Responded';
        const activeQueueIndex = avail?.current_approach_index || 0;
        
        const sparePlayer = avail?.spare_player_id 
          ? allPlayers.find((p) => p.id === avail.spare_player_id) || globalSpares.find((p) => p.id === avail.spare_player_id)
          : undefined;
          
        const cellId = `${player.id}-${concert.id}`;
        const isActive = activeDropdown === cellId;
        const targetInstrument = player.instrument.toLowerCase().trim();

        const busySpareIdsForConcert = (() => {
          const otherSeatsForThisConcert = allAvailability.filter((a) => a.concert_id === concert.id && a.player_id !== player.id);
          const busyIds = new Set<string>();
          otherSeatsForThisConcert.forEach((a) => {
            if (a.spare_player_id) busyIds.add(a.spare_player_id);
            if (a.approached_spares && Array.isArray(a.approached_spares)) {
              a.approached_spares.forEach((s) => { if (s.id) busyIds.add(s.id); });
            }
          });
          return busyIds;
        })();

        // 🌟 SECURE ISOLATION: Local Spares come from YOUR band only
        const localSparesList = allPlayers
          .filter((p) => p.instrument.toLowerCase().trim() === targetInstrument && p.status === 'Spare' && !busySpareIdsForConcert.has(p.id))
          .map((p) => ({ id: p.id, name: p.name, distance: 0, band_name: 'Internal Roster', type: 'local' }));

        // 🌟 SECURE ISOLATION: Global Spares come from OTHER bands only
        const globalSparesList = (() => {
          if (concert.latitude === null || concert.longitude === null) return [];
          return globalSpares
            .filter((s) => s.instrument.toLowerCase().trim() === targetInstrument && s.band_id !== myBandId && !busySpareIdsForConcert.has(s.id))
            .map((s) => {
              const b = s.bands || s.band;
              if (b && b.latitude !== null && b.longitude !== null) {
                const milesAway = calculateDistance(concert.latitude!, concert.longitude!, b.latitude, b.longitude);
                return { id: s.id, name: s.name, distance: Math.round(milesAway * 10) / 10, band_name: b.name, type: 'global' };
              }
              return null;
            })
            .filter((s): s is any => s !== null)
            .sort((a, b) => a.distance - b.distance);
        })();

        const handleRankedSelection = (spare: any) => {
          setShortlistSelection((prev) => {
            const existingIdx = prev.findIndex(item => item.id === spare.id);
            if (existingIdx !== -1) return prev.filter(item => item.id !== spare.id);
            if (prev.length >= 3) return prev;
            return [...prev, spare];
          });
        };

        return (
          <td key={concert.id} style={{ padding: '6px 8px', borderRight: '1px solid #f1f5f9', minWidth: '160px' }}>
            <div
              className={`matrix-cell-rich ${getCellBg(status)}`}
              onClick={(e) => handleCellClick(e, cellId, avail)}
              style={{
                padding: '10px 12px',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                border: '1px solid transparent',
                transition: 'all 0.2s'
              }}
            >
              <CellContent status={status} playerName={player.name} spareName={sparePlayer?.name} approachedList={avail?.approached_spares} currentIndex={avail?.current_approach_index} />
              <ChevronDown size={14} style={{ opacity: 0.5 }} />
            </div>

            {isActive && anchorRect && (
              <PortalDropdown anchorRect={anchorRect} onClose={() => setActiveDropdown(null)}>
                {(status as string) === 'Spares Contacted' && avail?.approached_spares && avail.approached_spares.length > 0 && (
                  <div style={{ padding: '12px', background: '#f0fdf4', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 700, color: '#166534', marginBottom: '8px' }}>
                      <Clock size={14} /> <span>ACTIVE CASCADE SYSTEM</span>
                    </div>
                    {avail.approached_spares.map((spare, idx) => (
                      <div key={spare.id} style={{ fontSize: '12px', display: 'flex', justifyContent: 'space-between', color: idx < activeQueueIndex ? '#94a3b8' : '#1e293b', marginBottom: '4px' }}>
                        <span style={{ textDecoration: idx < activeQueueIndex ? 'line-through' : 'none' }}>{idx+1}. {spare.name}</span>
                        {idx === activeQueueIndex && <span style={{ fontWeight: 700, color: '#2563eb' }}>{getTimeRemaining(avail.approach_initiated_at)}</span>}
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ padding: '10px 12px', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Set Status</div>
                <div style={{ padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#166534' }} onClick={() => { onSetStatus(player.id, concert.id, 'Available'); setActiveDropdown(null); }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#22c55e' }} /> Available
                </div>
                <div style={{ padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#991b1b' }} onClick={() => { onSetStatus(player.id, concert.id, 'Not Available'); setActiveDropdown(null); }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444' }} /> Not Available
                </div>
                <div style={{ padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#475569' }} onClick={() => { onSetStatus(player.id, concert.id, 'Not Responded'); setActiveDropdown(null); }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#94a3b8' }} /> Not Responded
                </div>
                
                <div style={{ height: '1px', background: '#e2e8f0', margin: '4px 0' }} />
                <div style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 600, color: '#2563eb' }} onClick={() => { setSparesModalOpen(true); setActiveDropdown(null); }}>
                  <Search size={16} /> Find Spares & Contact
                </div>
                
                <div style={{ height: '1px', background: '#e2e8f0', margin: '4px 0' }} />
                <div style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#475569' }} onClick={() => { setActiveDropdown(null); onAddPlayer(player.instrument); }}>
                  <UserPlus size={16} /> Add new player…
                </div>
              </PortalDropdown>
            )}

            {sparesModalOpen && (
              <div className="modal-overlay" style={{ zIndex: 10000, position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center' }} onClick={() => setSparesModalOpen(false)}>
                <div className="modal" style={{ width: '480px', maxWidth: '95vw', background: '#fff', borderRadius: '12px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
                  <div style={{ padding: '20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>Find {player.instrument} Spares</h3>
                    <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>Configure backup tracking pipeline for <strong>{concert.name}</strong></p>
                  </div>

                  <div style={{ padding: '20px', maxHeight: '400px', overflowY: 'auto', background: '#f8fafc' }}>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '12px', letterSpacing: '0.05em' }}>
                      <Users size={14} /> <span>YOUR LOCAL SPARES</span>
                    </div>
                    {localSparesList.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
                        {localSparesList.map((spare) => {
                          const rIdx = shortlistSelection.findIndex(item => item.id === spare.id);
                          const isRanked = rIdx !== -1;
                          return (
                            <div key={spare.id} onClick={() => handleRankedSelection(spare)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'white', border: isRanked ? '2px solid #2563eb' : '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer' }}>
                              <div><span style={{ fontWeight: 600, fontSize: '14px', color: '#0f172a' }}>{spare.name}</span><span style={{ fontSize: '12px', color: '#64748b', display: 'block' }}>Roster Backup</span></div>
                              <div style={{ width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold', background: isRanked ? '#2563eb' : '#f1f5f9', color: isRanked ? 'white' : 'transparent' }}>{isRanked ? (rIdx + 1) : ''}</div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p style={{ fontSize: '13px', color: '#94a3b8', margin: '0 0 24px 0', fontStyle: 'italic' }}>No unbooked local backup players available.</p>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '12px', letterSpacing: '0.05em' }}>
                      <Globe size={14} /> <span>GLOBAL NETWORK SPARES</span>
                    </div>
                    {globalSparesList.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {globalSparesList.map((spare) => {
                          const rIdx = shortlistSelection.findIndex(item => item.id === spare.id);
                          const isRanked = rIdx !== -1;
                          return (
                            <div key={spare.id} onClick={() => handleRankedSelection(spare)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'white', border: isRanked ? '2px solid #2563eb' : '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer' }}>
                              <div style={{ width: '85%' }}><span style={{ fontWeight: 600, fontSize: '14px', color: '#0f172a' }}>{spare.name}</span><span style={{ fontSize: '12px', color: '#475569', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{spare.band_name} • {spare.distance} mi away</span></div>
                              <div style={{ width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold', background: isRanked ? '#2563eb' : '#f1f5f9', color: isRanked ? 'white' : 'transparent' }}>{isRanked ? (rIdx + 1) : ''}</div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ padding: '12px', background: '#f1f5f9', borderRadius: '8px', fontSize: '12px', color: '#475569' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, marginBottom: '4px', color: '#0f172a' }}><AlertCircle size={14}/> Network Radar Context:</div>
                        No unbooked marketplace duplicates found in proximity.
                      </div>
                    )}
                  </div>

                  <div style={{ padding: '16px 20px', background: '#fff', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button type="button" onClick={() => setSparesModalOpen(false)} style={{ padding: '8px 16px', border: '1px solid #cbd5e1', background: 'white', borderRadius: '6px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
                    <button 
                      type="button" 
                      disabled={shortlistSelection.length === 0} 
                      onClick={() => {
                        onSetStatus(player.id, concert.id, 'Spares Contacted' as any, undefined, shortlistSelection);
                        setSparesModalOpen(false);
                      }}
                      style={{ padding: '8px 16px', background: shortlistSelection.length === 0 ? '#cbd5e1' : '#2563eb', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: 'bold', cursor: shortlistSelection.length === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                      <Send size={16} /> Send Email Cascade ({shortlistSelection.length}/3)
                    </button>
                  </div>
                </div>
              </div>
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
  const [allInstruments, setAllInstruments] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [addPlayerOpen, setAddPlayerOpen] = useState(false);
  const [newPlayerForm, setNewPlayerForm] = useState({ name: '', instrument: '', email: '', phone: '', status: 'Active' as 'Active' | 'Spare' });

  const playersRef = useRef<Player[]>([]);
  const concertsRef = useRef<MatrixConcert[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => { 
    fetchData(); 

    const channel = supabase
      .channel('matrix-realtime-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'availability' },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const newRow = payload.new as any;
            setAvailability((prev) => {
              const pObj = playersRef.current.find((p) => p.id === newRow.player_id);
              const cObj = concertsRef.current.find((c) => c.id === newRow.concert_id);
              if (!pObj || !cObj) return prev; 
              
              const enrichedCell: AvailabilityCell = {
                ...newRow,
                id: `${newRow.player_id}-${newRow.concert_id}`,
                player: pObj,
                concert: cObj,
                approached_spares: newRow.approached_spares || []
              };
              
              const existingIdx = prev.findIndex((a) => a.id === enrichedCell.id);
              if (existingIdx !== -1) {
                return prev.map((item, idx) => idx === existingIdx ? enrichedCell : item);
              } else {
                return [...prev, enrichedCell];
              }
            });
          } else if (payload.eventType === 'DELETE') {
            const oldRow = payload.old as any;
            setAvailability((prev) => prev.filter((a) => !(a.player_id === oldRow.player_id && a.concert_id === oldRow.concert_id)));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function fetchData() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: currentBand } = await supabase.from('bands').select('id').eq('manager_id', user.id).maybeSingle();

      if (currentBand) {
        setMyBandId(currentBand.id);

        const [playersRes, concertsRes, availabilityRes, globalSparesRes, instruments] = await Promise.all([
          // 🌟 BUG FIX 1: Lock down player list to YOUR band only!
          supabase.from('players').select('*').eq('band_id', currentBand.id).order('instrument').order('sort_order').order('name'),
          supabase.from('concerts').select('*').eq('band_id', currentBand.id).eq('status', 'live').gte('concert_date', new Date().toISOString().split('T')[0]).order('concert_date'),
          supabase.from('availability').select('*'),
          // 🌟 BUG FIX 2: Find actual 'Spare' status players from the rest of the database!
          supabase.from('players').select('id, name, instrument, band_id, bands ( name, latitude, longitude )').eq('status', 'Spare'),
          fetchAllInstruments(),
        ]);

        const loadedPlayers = (playersRes.data as Player[]) || [];
        const loadedConcerts = (concertsRes.data as MatrixConcert[]) || [];

        setPlayers(loadedPlayers);
        playersRef.current = loadedPlayers; 
        
        setConcerts(loadedConcerts);
        concertsRef.current = loadedConcerts; 
        
        setAllInstruments(instruments);
        setGlobalSpares(globalSparesRes.data || []);

        if (availabilityRes.data) {
          setAvailability(
            (availabilityRes.data as any[]).map((a) => ({
              ...a,
              id: `${a.player_id}-${a.concert_id}`,
              player: loadedPlayers.find((p) => p.id === a.player_id)!,
              concert: loadedConcerts.find((c) => c.id === a.concert_id)!,
              approached_spares: a.approached_spares || []
            })).filter(a => a.player && a.concert) // Clean up any orphaned rows safely
          );
        }
      }
    } catch (err: any) {
      console.error("Error populating data matrix:", err.message);
    } finally {
      setLoading(false);
    }
  }

  function getAvailability(playerId: string, concertId: string): AvailabilityCell | undefined {
    return availability.find((a) => a.player_id === playerId && a.concert_id === concertId);
  }

  async function onSetStatus(playerId: string, concertId: string, status: AvailabilityStatus, spareId?: string, shortlist?: any[]) {
    const patch = { 
      player_id: playerId, 
      concert_id: concertId, 
      status, 
      spare_player_id: spareId || null,
      approached_spares: shortlist || [],
      current_approach_index: shortlist && shortlist.length > 0 ? 0 : 0,
      approach_initiated_at: shortlist && shortlist.length > 0 ? new Date().toISOString() : null
    };

    setAvailability((prev) => {
      const existing = prev.find((a) => a.player_id === playerId && a.concert_id === concertId);
      if (existing) {
        return prev.map((a) => a.player_id === playerId && a.concert_id === concertId ? { ...a, ...patch } : a);
      } else {
        const p = players.find((x) => x.id === playerId)!;
        const c = concerts.find((x) => x.id === concertId)!;
        const optimisticCell: AvailabilityCell = { id: `${playerId}-${concertId}`, ...patch, player: p, concert: c, created_at: '', updated_at: '' };
        return [...prev, optimisticCell];
      }
    });

    try {
      const { error } = await supabase.from('availability').upsert(patch, { onConflict: 'player_id,concert_id' });
      if (error) throw error;
    } catch (err: unknown) {
      showToast('Error syncing availability with database.');
      await fetchData(); 
      return;
    }

    const c = concerts.find((x) => x.id === concertId);
    if (shortlist && shortlist.length > 0) {
      showToast(`Ranked shortlist committed for ${c?.name}`);
    } else {
      showToast(`Availability updated for ${c?.name}`);
    }
  }

  async function handleDragEnd(event: DragEndEvent, instrument: string) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const section = getActivePlayers(instrument);
    const oldIdx = section.findIndex((p) => p.id === active.id);
    const newIdx = section.findIndex((p) => p.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(section, oldIdx, newIdx);
    setPlayers((prev) => {
      const others = prev.filter((p) => p.instrument !== instrument);
      return [...others, ...reordered].sort((a, b) => allInstruments.indexOf(a.instrument) - allInstruments.indexOf(b.instrument));
    });
    await Promise.all(reordered.map((p, i) => supabase.from('players').update({ sort_order: i + 1 }).eq('id', p.id)));
  }

  function openAddPlayer(instrument: string) {
    setNewPlayerForm({ name: '', instrument, email: '', phone: '', status: 'Active' });
    setAddPlayerOpen(true);
  }

  async function saveNewPlayer(e: React.FormEvent) {
    e.preventDefault();
    if (!newPlayerForm.instrument) { showToast('Please select an instrument'); return; }
    
    // 🌟 INJECT BAND ID INTO NEW PLAYER
    const { data: inserted, error = null } = await supabase.from('players').insert({
      name: newPlayerForm.name, 
      instrument: newPlayerForm.instrument,
      email: newPlayerForm.email || null, 
      phone: newPlayerForm.phone || null,
      status: newPlayerForm.status, 
      band_id: myBandId,
      tags: []
    }).select().single();
    
    if (error || !inserted) { showToast('Error adding player'); return; }
    if (concerts.length > 0) {
      await supabase.from('availability').insert(concerts.map((c) => ({ player_id: inserted.id, concert_id: c.id, status: 'Not Responded' as AvailabilityStatus })));
    }
    showToast(`${inserted.name} added to roster`);
    setAddPlayerOpen(false);
    await fetchData();
  }

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 3500);
  }

  function getActivePlayers(instrument: string) {
    return players.filter((p) => p.instrument === instrument && p.status === 'Active');
  }

  const sortedInstruments = allInstruments.filter((inst) => getActivePlayers(inst).length > 0);

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'system-ui', color: '#64748b' }}>Loading Availability Data...</div>;
  if (concerts.length === 0) return <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'system-ui', color: '#64748b' }}><h2>Availability Matrix</h2><p>No live concerts available. Add some in the Concerts tab!</p></div>;

  return (
    <div style={{ padding: '32px', fontFamily: 'system-ui', maxWidth: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: 800, color: '#1e3a5f', margin: '0 0 8px 0' }}>Availability Matrix</h1>
        <p style={{ color: '#64748b', margin: 0 }}>Track player availability for upcoming concerts. Click a cell to update status.</p>
      </div>
      
      {/* 🌟 STRUCTURAL CSS FIX: Wraps the table perfectly so it doesn't squash */}
      <div style={{ overflowX: 'auto', backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px', whiteSpace: 'nowrap' }}>
          <thead>
            <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
              <th style={{ padding: '16px 8px', position: 'sticky', left: 0, backgroundColor: '#f8fafc', zIndex: 20, width: '40px' }} />
              <th style={{ padding: '16px', fontWeight: 700, color: '#475569', position: 'sticky', left: '40px', backgroundColor: '#f8fafc', zIndex: 20, minWidth: '180px', borderRight: '1px solid #e2e8f0' }}>
                Core Musician
              </th>
              {concerts.map((concert) => (
                <th key={concert.id} style={{ padding: '16px', fontWeight: 700, color: '#1e3a5f', minWidth: '180px', borderRight: '1px solid #e2e8f0' }}>
                  <span style={{ display: 'block' }}>{concert.name}</span>
                  <span style={{ display: 'block', fontWeight: 500, color: '#64748b', fontSize: '12px', marginTop: '4px' }}>
                    {new Date(concert.concert_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedInstruments.map((instrument) => {
              const section = getActivePlayers(instrument);
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
                        <SortableRow key={player.id} player={player} concerts={concerts} allPlayers={players} globalSpares={globalSpares} myBandId={myBandId} activeDropdown={activeDropdown} setActiveDropdown={setActiveDropdown} getAvailability={getAvailability} allAvailability={availability} onSetStatus={onSetStatus} onAddPlayer={openAddPlayer} />
                      ))}
                    </>
                  </SortableContext>
                </DndContext>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Simplified generic modals / toasts remain below */}
      {addPlayerOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000 }}>
          <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', width: '400px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px 0' }}>Add new {newPlayerForm.instrument}</h3>
            <form onSubmit={saveNewPlayer} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <input type="text" value={newPlayerForm.name} onChange={(e) => setNewPlayerForm({ ...newPlayerForm, name: e.target.value })} placeholder="Full Name" required style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
              <select value={newPlayerForm.status} onChange={(e) => setNewPlayerForm({ ...newPlayerForm, status: e.target.value as any })} style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                <option value="Active">Active Core Player</option>
                <option value="Spare">Local Band Spare</option>
              </select>
              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button type="button" onClick={() => setAddPlayerOpen(false)} style={{ flex: 1, padding: '10px', background: '#f1f5f9', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" style={{ flex: 1, padding: '10px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Save Player</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {toast && (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', background: '#1e293b', color: '#fff', padding: '12px 24px', borderRadius: '8px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', zIndex: 10000, fontWeight: 500 }}>
          {toast}
        </div>
      )}
    </div>
  );
}