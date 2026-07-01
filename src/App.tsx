import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { supabase } from './lib/supabase';
import type { Session } from '@supabase/supabase-js';
import { CheckCircle, XCircle, X } from 'lucide-react'; // 🌟 Added notification icons
import Layout from './components/Layout';
import Login from './pages/Login';
import Respond from './pages/Respond';
import BandView from './pages/BandView';
import Overview from './pages/Overview';
import ConcertDirectory from './pages/ConcertDirectory';
import BandRoster from './pages/BandRoster';
import AvailabilityMatrix from './pages/AvailabilityMatrix';
import BandOnboarding from './pages/BandOnboarding';
import SpareSearch from './pages/SpareSearch';

// 🌟 NEW: Global URL Listener and Pop-up Component
function ResponseNotification() {
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    // Look at the web browser's URL bar for "?status="
    const params = new URLSearchParams(window.location.search);
    const currentStatus = params.get('status');
    
    if (currentStatus === 'accepted' || currentStatus === 'declined') {
      setStatus(currentStatus);
      
      // Clean up the URL bar so it looks nice and tidy again without reloading
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
          style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
        >
          <X size={20} />
        </button>

        {status === 'accepted' ? (
          <>
            <CheckCircle size={56} color="#16a34a" style={{ margin: '0 auto 16px' }} />
            <h2 style={{ fontSize: '22px', fontWeight: 'bold', color: '#0f172a', margin: '0 0 8px 0' }}>Gig Confirmed! ✅</h2>
            <p style={{ color: '#475569', fontSize: '15px', lineHeight: '1.5', margin: 0 }}>
              Fantastic! Your availability status has been updated to Green. The Band Manager's matrix has been updated. Thank you for depping!
            </p>
          </>
        ) : (
          <>
            <XCircle size={56} color="#dc2626" style={{ margin: '0 auto 16px' }} />
            <h2 style={{ fontSize: '22px', fontWeight: 'bold', color: '#0f172a', margin: '0 0 8px 0' }}>Response Recorded ✕</h2>
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
            width: '100%'
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

  // Check if the logged-in manager already has a band registered
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

  // 🌟 REFACTORED RETURNS: We capture the view in a variable so we can safely wrap it with the notification modal!
  let mainContent;

  if (window.location.pathname === '/respond') mainContent = <Respond />;
  else if (window.location.pathname === '/band-view') mainContent = <BandView />;
  else if (window.location.pathname === '/matrix') mainContent = <AvailabilityMatrix />;
  else if (session === undefined || (session && hasBand === null)) mainContent = null;
  else if (!session) mainContent = <Login />;
  else if (session && !hasBand) mainContent = <BandOnboarding onComplete={() => setHasBand(true)} />;
  else {
    mainContent = (
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Overview />} />
            <Route path="concerts" element={<ConcertDirectory />} />
            <Route path="roster" element={<BandRoster />} />
            <Route path="availability" element={<AvailabilityMatrix />} />
            <Route path="/search-spares" element={<SpareSearch />} />
          </Route>
        </Routes>
      </BrowserRouter>
    );
  }

  // Final render wraps everything globally
  return (
    <>
      {mainContent}
      <ResponseNotification />
    </>
  );
}

export default App;