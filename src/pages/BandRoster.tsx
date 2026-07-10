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
  
  // 🌟 Mobile Fix: Ensure transform is explicitly undefined when not dragging so sticky isn't broken by matrix translations
  const rowStyle = { 
    transform: transform ? CSS.Transform.toString(transform) : undefined, 
    transition, 
    opacity: isDragging ? 0.4 : 1 
  };
  
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [shortlistSelection, setShortlistSelection] = useState<any[]>([]);

  function handleCellClick(e: React.MouseEvent, cellId: string) {
    if (activeDropdown === cellId) { setActiveDropdown(null); setAnchorRect(null); } 
    else { setShortlistSelection([]); setAnchorRect((e.currentTarget as HTMLElement).getBoundingClientRect()); setActiveDropdown(cellId); }
  }

  return (
    <tr ref={setNodeRef} style={{ ...rowStyle, borderBottom: '1px solid #f1f5f9' }}>
      {/* 🌟 Mobile Fix: Solid background and solid z-index */}
      <td style={{ padding: '2px 6px', background: '#fff', width: '32px', position: 'sticky', left: 0, zIndex: 10 }}>
        <span {...attributes} {...listeners} style={{ cursor: 'grab', color: '#cbd5e1', display: 'flex' }}><GripVertical size={16} /></span>
      </td>
      {/* 🌟 Mobile Fix: Solid background, z-index, and solid 2px border */}
      <td style={{ padding: '2px 6px', background: '#fff', fontWeight: 600, color: '#0f172a', position: 'sticky', left: '32px', zIndex: 10, minWidth: '140px', borderRight: '2px solid #cbd5e1' }}>{player.name}</td>
      
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
                  
                  {/* Reconstructed Dropdown Actions */}
                  <div 
                    onClick={() => { onSetStatus(player.id, concert.id, 'Available'); setActiveDropdown(null); }}
                    style={{ padding: '10px 16px', cursor: 'pointer', fontSize: '13px', color: '#166534' }}
                  >
                    Mark as Available
                  </div>
                  <div 
                    onClick={() => { onSetStatus(player.id, concert.id, 'Not Available'); setActiveDropdown(null); }}
                    style={{ padding: '10px 16px', cursor: 'pointer', fontSize: '13px', color: '#991b1b' }}
                  >
                    Mark as Not Available
                  </div>
                  <div 
                    onClick={() => { onSetStatus(player.id, concert.id, 'Not Responded'); setActiveDropdown(null); }}
                    style={{ padding: '10px 16px', cursor: 'pointer', fontSize: '13px', color: '#64748b' }}
                  >
                    Reset Status
                  </div>

                </div>
              </PortalDropdown>
            )}
          </td>
        );
      })}
    </tr>
  );
}

// Ensure the main default export wrapper for the table is correctly built and closed!
export default function AvailabilityMatrix({ players, concerts, allPlayers, globalSpares, getAvailability, onSetStatus, onAddPlayer, getAvailableSpares, renderDepRow, openCascadeCompose }: any) {
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  return (
    <DndContext sensors={useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))} collisionDetection={closestCenter}>
      {/* 🌟 Mobile Fix: The wrapper allowing sideways scroll */}
      <div style={{ width: '100%', overflowX: 'auto', position: 'relative' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '800px' }}>
          <thead>
            <tr>
              <th style={{ position: 'sticky', left: 0, zIndex: 20, backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0', padding: '12px 6px' }}></th>
              <th style={{ position: 'sticky', left: '32px', zIndex: 20, backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0', borderRight: '2px solid #cbd5e1', padding: '12px 6px', color: '#475569', fontSize: '13px' }}>Player</th>
              {concerts.map((c: any) => (
                <th key={c.id} style={{ padding: '12px 8px', borderBottom: '2px solid #e2e8f0', color: '#475569', fontSize: '13px', minWidth: '170px' }}>{c.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <SortableContext items={players.map((p: any) => p.id)} strategy={verticalListSortingStrategy}>
              {players.map((player: any) => (
                <SortableRow 
                  key={player.id} 
                  player={player} 
                  concerts={concerts} 
                  allPlayers={allPlayers} 
                  globalSpares={globalSpares} 
                  activeDropdown={activeDropdown} 
                  setActiveDropdown={setActiveDropdown} 
                  getAvailability={getAvailability} 
                  onSetStatus={onSetStatus} 
                  onAddPlayer={onAddPlayer} 
                  getAvailableSpares={getAvailableSpares} 
                  renderDepRow={renderDepRow} 
                  openCascadeCompose={openCascadeCompose} 
                />
              ))}
            </SortableContext>
          </tbody>
        </table>
      </div>
    </DndContext>
  );
}