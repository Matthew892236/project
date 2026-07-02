import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, CalendarDays, Grid3X3, Music, LogOut } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [bandName, setBandName] = useState<string>('Loading...');

  useEffect(() => {
    fetchBandName();
  }, []);

  async function fetchBandName() {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return;

      const { data: band } = await supabase
        .from('bands')
        .select('name')
        .eq('manager_id', userData.user.id)
        .maybeSingle();

      if (band) {
        setBandName(band.name);
      } else {
        setBandName('No Band Assigned');
      }
    } catch (err) {
      console.error('Error fetching band name:', err);
      setBandName('My Band');
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate('/login');
  }

  const navItems = [
    { path: '/', icon: LayoutDashboard, label: 'Overview' },
    { path: '/roster', icon: Users, label: 'Band Roster' },
    { path: '/concerts', icon: CalendarDays, label: 'Concerts & Events' },
    { path: '/matrix', icon: Grid3X3, label: 'Availability Matrix' },
  ];

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f8fafc', fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Sidebar */}
      <nav style={{ width: '260px', backgroundColor: '#ffffff', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
        
        {/* 🌟 Header Area with Dynamic Band Name */}
        <div style={{ padding: '24px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <div style={{ backgroundColor: '#1e3a5f', padding: '8px', borderRadius: '8px', display: 'flex' }}>
              <Music size={24} color="#ffffff" />
            </div>
            <span style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>Brassbandwidth</span>
          </div>
          {/* This is the new band name label */}
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#64748b', paddingLeft: '4px' }}>
            {bandName}
          </div>
        </div>

        {/* Navigation Links */}
        <div style={{ padding: '16px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', textDecoration: 'none',
                  borderRadius: '8px', fontWeight: 500, fontSize: '15px', transition: 'all 0.2s',
                  backgroundColor: isActive ? '#f1f5f9' : 'transparent',
                  color: isActive ? '#1e3a5f' : '#64748b'
                }}
              >
                <Icon size={20} style={{ color: isActive ? '#1e3a5f' : '#94a3b8' }} />
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* Logout Button */}
        <div style={{ padding: '16px 12px', borderTop: '1px solid #f1f5f9' }}>
          <button
            onClick={handleLogout}
            style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', width: '100%', border: 'none', backgroundColor: 'transparent', color: '#ef4444', fontWeight: 500, fontSize: '15px', cursor: 'pointer', borderRadius: '8px', transition: 'background-color 0.2s' }}
          >
            <LogOut size={20} />
            Sign Out
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main style={{ flex: 1, height: '100vh', overflowY: 'auto' }}>
        <Outlet />
      </main>
    </div>
  );
}