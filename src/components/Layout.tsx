import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
// 🌟 Added the "Search" icon to the imports row below:
import { LayoutDashboard, Users, CalendarDays, Mail, Grid3X3, Music, LogOut } from 'lucide-react';
import { supabase } from '../lib/supabase';

const navItems = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/concerts', label: 'Concert Directory', icon: CalendarDays },
  { to: '/roster', label: 'Band Roster', icon: Users },
  { to: '/availability', label: 'Availability Matrix', icon: Grid3X3 },
  // 🌟 Added your new geographic search page here:

];

export default function Layout() {
  const [bandName, setBandName] = useState<string>('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        supabase.from('profiles').select('band_name').eq('id', data.user.id).maybeSingle().then(({ data: profile }) => {
          if (profile) setBandName(profile.band_name);
        });
      }
    });
  }, []);

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <Music className="logo-icon" />
          <h1>BrassBandwidth</h1>
        </div>
        {bandName && (
          <div className="sidebar-band-name">{bandName}</div>
        )}
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              end={item.to === '/'}
            >
              <item.icon className="nav-icon" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="badge">Manager Dashboard</span>
          <a
            href="mailto:mrmatthewhill@gmail.com"
            className="nav-link"
            style={{ marginTop: '4px', fontSize: '13px' }}
          >
            <Mail className="nav-icon" size={16} />
            <span>Contact Us</span>
          </a>
          <button
            className="btn-icon signout-btn"
            onClick={() => supabase.auth.signOut()}
            title="Sign out"
          >
            <LogOut size={16} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}