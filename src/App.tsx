import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { supabase } from './lib/supabase';
import type { Session } from '@supabase/supabase-js';
import Layout from './components/Layout';
import Login from './pages/Login';
import Respond from './pages/Respond';
import BandView from './pages/BandView';
import Overview from './pages/Overview';
import ConcertDirectory from './pages/ConcertDirectory';
import BandRoster from './pages/BandRoster';
import AvailabilityMatrix from './pages/AvailabilityMatrix';
import BandOnboarding from './pages/BandOnboarding';


// 🌟 Zero-Dependency Notification Pop-up
function ResponseNotification() {
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const currentStatus = params.get('status');
    
    // 🌟 ADDED: Now catches 'available' (core players) and 'joined-network' (global spares)
    if (currentStatus === 'accepted' || currentStatus === 'declined' || currentStatus === 'available' || currentStatus === 'joined-network') {
      setStatus(currentStatus);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  if (!status) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.6)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 9999
    }}>
      <div style={{
        background: 'white',
        padding: '32px',
        borderRadius: '16px',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
        textAlign: 'center',
        maxWidth: '400px',
        width: '90%',
        position: 'relative',
        border: '1px solid #e2e8f0',
        fontFamily: 'sans-serif'
      }}>
        <button 
          onClick={() => setStatus(null)}
          style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '20px' }}
        >
          ✕
        </button>

        {status === 'joined-network' ? (
          <>
            <div style={{ fontSize: '56px', marginBottom: '16px' }}>🌍</div>
            <h2 style={{ fontSize: '22px', fontWeight: 'bold', color: '#0f172a', margin: '0 0 8px 0' }}>Welcome to the Network!</h2>
            <p style={{ color: '#475569', fontSize: '15px', lineHeight: '1.5', margin: 0 }}>
              You are officially on the Global Spares Network! Band Managers nearby will now be able to find and contact you when they need a dep for your instrument.
            </p>
          </>
        ) : status === 'accepted' || status === 'available' ? (
          <>
            <div style={{ fontSize: '56px', marginBottom: '16px' }}>✅</div>
            <h2 style={{ fontSize: '22px', fontWeight: 'bold', color: '#0f172a', margin: '0 0 8px 0' }}>Gig Confirmed!</h2>
            <p style={{ color: '#475569', fontSize: '15px', lineHeight: '1.5', margin: 0 }}>
              Fantastic! Your availability status has been updated to Green. The Band Manager's matrix has been updated. Thank you!
            </p>
          </>
        ) : (
          <>
            <div style={{ fontSize: '56px', marginBottom: '16px' }}>❌</div>
            <h2 style={{ fontSize: '22px', fontWeight: 'bold', color: '#0f172a', margin: '0 0 8px 0' }}>Response Recorded</h2>
            <p style={{ color: '#475569', fontSize: '15px', lineHeight: '1.5', margin: 0 }}>
              No worries at all! Your response has been logged so the manager can automatically check the next player on the list. Thanks for letting us know quickly!
            </p>
          </>
        )}

        <button 
          onClick={() => setStatus(null)}
          style={{
            marginTop: '24px',
            backgroundColor: '#0f172a',
            color: 'white',
            fontWeight: '600',
            padding: '10px 20px',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            width: '100%',
            fontSize: '15px'
          }}
        >
          Got it, thanks!
        </button>
      </div>
    </div>
  );
}

function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [hasBand, setHasBand] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    async function checkBandProfile() {
      if (session?.user) {
        const { data } = await supabase
          .from('bands')
          .select('id')
          .eq('manager_id', session.user.id)
          .maybeSingle();

        if (data) {
          setHasBand(true);
        } else {
          setHasBand(false);
        }
      } else {
        setHasBand(null);
      }
    }

    checkBandProfile();
  }, [session]);

  // 🌟 Public routes — return wrappers matching your original layout exactly
// 🌟 Public routes — Normalized to strip trailing slashes so email clients don't break them!
  const cleanPath = window.location.pathname.replace(/\/$/, '');

  if (cleanPath === '/respond') return <><Respond /><ResponseNotification /></>;
  if (cleanPath === '/band-view') return <><BandView /><ResponseNotification /></>;
  if (cleanPath === '/matrix') return <><AvailabilityMatrix /><ResponseNotification /></>;

  // Loading states
  if (session === undefined || (session && hasBand === null)) return null;
  
  // Gate 1: If not logged in, go to Login
  if (!session) return <><Login /><ResponseNotification /></>;

  // Gate 2: If logged in but hasn't set up a band location yet, force onboarding
  if (session && !hasBand) {
    return <><BandOnboarding onComplete={() => setHasBand(true)} /><ResponseNotification /></>;
  }

  // Gate 3: Logged in and band exists. Open up the dashboard!
  return (
    <>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Overview />} />
            <Route path="concerts" element={<ConcertDirectory />} />
            <Route path="roster" element={<BandRoster />} />
            <Route path="availability" element={<AvailabilityMatrix />} />

          </Route>
        </Routes>
      </BrowserRouter>
      <ResponseNotification />
    </>
  );
}

export default App;