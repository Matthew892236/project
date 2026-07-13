import React, { useEffect, useState } from 'react';
import { UserPlus, Edit2, Trash2, Mail } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Player } from '../lib/supabase';

const MASTER_BRASS_BAND_ORDER = [
  'Soprano Cornet', 'Principal Cornet', 'Solo Cornet', 'Repiano Cornet', '2nd Cornet', '3rd Cornet', 'Flugelhorn',
  'Solo Horn', '1st Horn', '2nd Horn',
  '1st Baritone', '2nd Baritone',
  'Euphonium',
  '1st Trombone', '2nd Trombone', 'Bass Trombone',
  'Eb Bass', 'Bb Bass',
  'Percussion'
];

export default function BandRoster() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [bandId, setBandId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    instrument: 'Solo Cornet',
    email: '',
    phone: '',
    status: 'Active' as 'Active' | 'Spare'
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: band } = await supabase.from('bands').select('id').eq('manager_id', user.id).maybeSingle();
    if (band) {
      setBandId(band.id);
      const { data: roster } = await supabase.from('players').select('*').eq('band_id', band.id);
      if (roster) setPlayers(roster);
    }
    setLoading(false);
  }

  function openAddModal() {
    setEditingPlayer(null);
    setFormData({ name: '', instrument: 'Solo Cornet', email: '', phone: '', status: 'Active' });
    setIsModalOpen(true);
  }

  function openEditModal(player: Player) {
    setEditingPlayer(player);
    setFormData({
      name: player.name,
      instrument: player.instrument,
      email: player.email || '',
      phone: player.phone || '',
      status: player.status
    });
    setIsModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!bandId) return;

    if (editingPlayer) {
      await supabase.from('players').update(formData).eq('id', editingPlayer.id);
    } else {
      await supabase.from('players').insert({ ...formData, band_id: bandId });
    }
    
    setIsModalOpen(false);
    loadData();
  }

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Are you sure you want to remove ${name} from the band?`)) return;
    await supabase.from('players').delete().eq('id', id);
    loadData();
  }

  if (loading) return <div style={{ padding: '32px', textAlign: 'center', color: '#64748b' }}>Loading roster...</div>;

  const activePlayers = players.filter(p => p.status === 'Active');
  const sparePlayers = players.filter(p => p.status === 'Spare');

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#0f172a' }}>Band Roster</h1>
          <p style={{ color: '#64748b' }}>Manage your regular players and deps</p>
        </div>
        <button className="btn btn-primary" onClick={openAddModal} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <UserPlus size={18} /> Add Player
        </button>
      </div>

      <div className="card" style={{ background: '#fff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <th style={{ padding: '12px 16px', color: '#475569', fontWeight: 600, fontSize: '13px' }}>Name</th>
              <th style={{ padding: '12px 16px', color: '#475569', fontWeight: 600, fontSize: '13px' }}>Instrument</th>
              <th style={{ padding: '12px 16px', color: '#475569', fontWeight: 600, fontSize: '13px' }}>Status</th>
              <th style={{ padding: '12px 16px', color: '#475569', fontWeight: 600, fontSize: '13px' }}>Contact</th>
              <th style={{ padding: '12px 16px', color: '#475569', fontWeight: 600, fontSize: '13px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {activePlayers.length === 0 && sparePlayers.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>
                  No players added yet. Click "Add Player" to build your band.
                </td>
              </tr>
            )}
            {MASTER_BRASS_BAND_ORDER.map(instrument => {
              const playersInSeat = activePlayers.filter(p => p.instrument === instrument);
              if (playersInSeat.length === 0) return null;
              return playersInSeat.map(player => (
                <tr key={player.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 500, color: '#0f172a' }}>{player.name}</td>
                  <td style={{ padding: '12px 16px', color: '#475569', fontSize: '14px' }}>{player.instrument}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ padding: '2px 8px', background: '#dcfce7', color: '#166534', borderRadius: '12px', fontSize: '12px', fontWeight: 600 }}>Active</span>
                  </td>
                  <td style={{ padding: '12px 16px', color: '#64748b', fontSize: '13px' }}>
                    {player.email && <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Mail size={12} /> {player.email}</div>}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <button onClick={() => openEditModal(player)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', marginRight: '12px' }}><Edit2 size={16} /></button>
                    <button onClick={() => handleDelete(player.id, player.name)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}><Trash2 size={16} /></button>
                  </td>
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: '#fff', padding: '24px', borderRadius: '8px', width: '100%', maxWidth: '400px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px' }}>{editingPlayer ? 'Edit Player' : 'Add Player'}</h2>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Name</label>
                <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Instrument</label>
                <select value={formData.instrument} onChange={e => setFormData({...formData, instrument: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }}>
                  {MASTER_BRASS_BAND_ORDER.map(inst => <option key={inst} value={inst}>{inst}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Email</label>
                <input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Status</label>
                <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value as 'Active' | 'Spare'})} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }}>
                  <option value="Active">Active Regular</option>
                  <option value="Spare">Internal Spare/Dep</option>
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
                <button type="button" onClick={() => setIsModalOpen(false)} style={{ padding: '8px 16px', background: '#e2e8f0', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" style={{ padding: '8px 16px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Save Player</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}