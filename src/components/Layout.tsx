import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, CalendarDays, Grid3X3, Music, LogOut, HelpCircle, Menu, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [bandName, setBandName] = useState<string>('Loading...');
  
  // 🌟 State to control the mobile menu and detect screen size natively in React
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    fetchBandName();

    // 🌟 Window resize listener handles the responsive layout dynamically
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
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
    <div style={{ 
      display: 'flex', 
      minHeight: '100vh', 
      backgroundColor: '#f8fafc', 
      fontFamily: "system-ui, -apple-system, sans-serif", 
      flexDirection: 'column' 
    }}>
      
      {/* 📱 Mobile Top Header (Only visible on small screens) */}
      {isMobile && (
        <div style={{ 
          display: 'flex', 
          position: 'fixed', 
          top: 0, left: 0, right: 0, 
          height: '64px', 
          backgroundColor: '#1e3a5f', 
          alignItems: 'center', 
          justifyContent: 'space-between', 
          padding: '0 20px', 
          zIndex: 40, 
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)' 
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Music size={20} color="#eab308" />
            <span style={{ fontSize: '18px', fontWeight: 700, color: '#eab308' }}>Brassbandwidth</span>
          </div>
          <button 
            onClick={() => setIsMobileMenuOpen(true)} 
            style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: '4px' }}
          >
            <Menu size={28} />
          </button>
        </div>
      )}

      {/* 📱 Mobile Dark Overlay (Click to close menu) */}
      {isMobile && isMobileMenuOpen && (
        <div 
          onClick={() => setIsMobileMenuOpen(false)}
          style={{ 
            position: 'fixed', 
            top: 0, left: 0, right: 0, bottom: 0, 
            background: 'rgba(15, 23, 42, 0.6)', 
            zIndex: 45, 
            backdropFilter: 'blur(2px)' 
          }} 
        />
      )}

      {/* 🌟 Main Left Fixed Sidebar Panel */}
      <nav style={{ 
        width: '260px', 
        backgroundColor: '#1e3a5f', 
        display: 'flex', 
        flexDirection: 'column', 
        position: 'fixed', 
        top: 0, bottom: 0, 
        left: isMobile ? (isMobileMenuOpen ? 0 : '-260px') : 0, 
        zIndex: 50, 
        boxShadow: '2px 0 12px rgba(0,0,0,0.1)',
        transition: 'left 0.3s ease'
      }}>
        
        {/* Header Logo Box */}
        <div style={{ padding: '32px 24px 24px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)', position: 'relative' }}>
          {isMobile && (
            <button 
              onClick={() => setIsMobileMenuOpen(false)}
              style={{ position: 'absolute', top: '24px', right: '20px', background: 'none', border: 'none', color: '#93c5fd', cursor: 'pointer', padding: '4px' }}
            >
              <X size={24} />
            </button>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <div style={{ backgroundColor: '#eab308', padding: '8px', borderRadius: '8px', display: 'flex' }}>
              <Music size={22} color="#1e3a5f" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '20px', fontWeight: 800, color: '#eab308', letterSpacing: '-0.025em', lineHeight: '1' }}>Brassbandwidth</span>
              <span style={{ fontSize: '10px', color: '#94a3b8', marginTop: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', lineHeight: '1.2' }}>Free Brass Band<br/>Management Tool</span>
            </div>
          </div>
          <div style={{ fontSize: '13px', fontWeight: 500, color: '#93c5fd', paddingLeft: '4px', marginTop: '16px' }}>
            {bandName}
          </div>
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
                onClick={() => setIsMobileMenuOpen(false)}
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

        {/* Unified Bottom Row Panel */}
        <div style={{ padding: '16px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: '8px', backgroundColor: 'rgba(0,0,0,0.1)' }}>
          <a 
            href="mailto:admin@brassbandwidth.com" 
            style={{ 
              display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', color: '#93c5fd', 
              textDecoration: 'none', fontSize: '14px', fontWeight: 500, borderRadius: '6px', transition: 'background 0.2s' 
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <HelpCircle size={18} color="#93c5fd" />
            Contact Support
          </a>
          
          <button
            onClick={handleLogout}
            style={{ 
              display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', width: '100%', border: 'none', 
              backgroundColor: 'transparent', color: '#93c5fd', fontWeight: 500, fontSize: '14px', cursor: 'pointer', 
              borderRadius: '6px', transition: 'all 0.2s', textAlign: 'left' 
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#93c5fd'; }}
          >
            <LogOut size={18} />
            Sign Out
          </button>
        </div>
      </nav>

      {/* 🌟 Main Content Pane - Dynamically drops the padding on mobile! */}
      <main style={{ 
        flex: 1, 
        height: '100vh', 
        overflowY: 'auto', 
        boxSizing: 'border-box',
        paddingLeft: isMobile ? 0 : '260px',
        paddingTop: isMobile ? '64px' : 0,
        transition: 'padding 0.3s ease'
      }}>
        <Outlet />
      </main>
    </div>
  );
}