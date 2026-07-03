import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, CalendarDays, Grid3X3, Music, LogOut, HelpCircle } from 'lucide-react';
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
      const { data: band } = await supabase.from('bands').select('name').eq('manager_id', userData.user.id).maybeSingle();
      if (band) setBandName(band.name);
    } catch {
      setBandName('My Ensemble Workspace');
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate('/login');
  }

  const navItems = [
    { path: '/', icon: LayoutDashboard, label: 'Overview Dashboard' },
    { path: '/roster', icon: Users, label: 'Band Roster' },
    { path: '/concerts', icon: CalendarDays, label: 'Concerts & Events' },
    { path: '/matrix', icon: Grid3X3, label: 'Availability Matrix' },
  ];

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f8fafc', fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {/* Main Left Fixed Sidebar Panel */}
      <nav style={{ width: '260px', backgroundColor: '#1e3a5f', display: 'flex', flexDirection: 'column', position: 'fixed', top: 0, bottom: 0, left: 0, zIndex: 50, boxShadow: '2px 0 12px rgba(0,0,0,0.1)' }}>
        
        {/* Header Logo Box */}
        <div style={{ padding: '32px 24px 24px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
            <div style={{ backgroundColor: '#eab308', padding: '8px', borderRadius: '8px', display: 'flex' }}>
              <Music size={22} color="#1e3a5f" />
            </div>
            {/* 🌟 RESTORED LOGO COLOR: Swapped layout branding text elements to custom Yellow */}
            <span style={{ fontSize: '20px', fontWeight: 800, color: '#eab308', letterSpacing: '-0.025em' }}>Brassbandwidth</span>
          </div>
          <div style={{ fontSize: '13px', fontWeight: 500, color: '#93c5fd', paddingLeft: '4px' }}>{bandName}</div>
        </div>

        {/* Dynamic Navigation Links Block */}
        <div style={{ padding: '24px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', textDecoration: 'none',
                  borderRadius: '8px', fontWeight: 600, fontSize: '14px', transition: 'all 0.2s',
                  backgroundColor: isActive ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                  color: isActive ? '#ffffff' : '#93c5fd'
                }}
              >
                <Icon size={18} style={{ color: isActive ? '#eab308' : '#93c5fd' }} />
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* 🌟 UNIFIED BOTTOM ROW PANEL: Repositioned Contact Us Link nicely with non-harsh Logout Button */}
        <div style={{ padding: '16px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: '8px', backgroundColor: 'rgba(0,0,0,0.1)' }}>
          <a 
            href="mailto:admin@brassbandwidth.com" 
            style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', color: '#93c5fd', textDecoration: 'none', fontSize: '14px', fontWeight: 500, borderRadius: '6px', transition: 'background 0.2s' }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <HelpCircle size={18} color="#93c5fd" />
            Contact Support
          </a>
          
          <button
            onClick={handleLogout}
            style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', width: '100%', border: 'none', backgroundColor: 'transparent', color: '#93c5fd', fontWeight: 500, fontSize: '14px', cursor: 'pointer', borderRadius: '6px', transition: 'all 0.2s', textAlign: 'left' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#93c5fd'; }}
          >
            <LogOut size={18} />
            Sign Out
          </button>
        </div>
      </nav>

      {/* Main Content Pane — Pushed cleanly to the right of the fixed navigation bar */}
      <main style={{ flex: 1, paddingLeft: '260px', height: '100vh', overflowY: 'auto', boxSizing: 'border-box' }}>
        <Outlet />
      </main>
    </div>
  );
}