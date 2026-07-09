import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Music, Loader, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Concert, AvailabilityStatus } from '../lib/supabase';

type State = 'loading' | 'ready' | 'submitting' | 'done' | 'error';
type Mode = 'concert' | 'registry';

interface TokenData {
  player: { id: string; name: string; instrument: string; band_id?: string | null };
  concert: Concert & { band_name?: string };
  action: 'accept' | 'decline' | 'dep_accept' | 'dep_decline';
  target_instrument?: string | null;
}

export default function Respond() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  const pid = params.get('pid');
  const cid = params.get('cid');
  const act = params.get('act');
  const quickResponse = params.get('status');

  const [state, setState] = useState<State>('loading');
  const [mode, setMode] = useState<Mode | null>(null);
  const [tokenData, setTokenData] = useState<TokenData | null>(null);
  const [registryData, setRegistryData] = useState<any | null>(null);
  const [submitted, setSubmitted] = useState<AvailabilityStatus | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [directStatus, setDirectStatus] = useState<string | null>(null);

  useEffect(() => {
    // 1. Check for instant status in URL
    if (quickResponse) {
      setDirectStatus(quickResponse);
      setState('done');
      return;
    }
    
    // 2. Check for action triggers (Email cascade bypass)
    if (pid && cid && act) {
      processDirectAction(pid, cid, act);
      return;
    }

    // 3. Fallback to standard token
    if (!token) {
      setState('error');
      setErrorMsg('No response parameters or token provided in the link.');
      return;
    }
    
    determineTokenRoute();
  }, [token, quickResponse, pid, cid, act]);

  async function processDirectAction(player_id: string, concert_id: string, action: string) {
    setState('submitting');
    try {
      const { data, error } = await supabase.functions.invoke('dep-response', {
        body: { pid: player_id, cid: concert_id, act: action }
      });
      if (error) throw error;
      setDirectStatus(data.status);
      setState('done');
    } catch (err) {
      setDirectStatus('error');
      setState('done');
    }
  }

  async function determineTokenRoute() {
    try {
      const { data: playerMatch } = await supabase.from('players').select('id, name, instrument, bands ( name )').eq('secure_token', token).maybeSingle();

      if (playerMatch) {
        setMode('registry');
        setRegistryData(playerMatch);
        setState('ready');
        return;
      }

      setMode('concert');
      await loadConcertToken();
    } catch (err: any) {
      setState('error');
      setErrorMsg('An unexpected error occurred while verifying your link.');
    }
  }

  async function loadConcertToken() {
    const { data, error } = await supabase.functions.invoke('respond-to-concert', { body: { action: 'load', token } });
    if (error || !data || data.error) {
      setState('error');
      setErrorMsg(data?.error || 'Invalid or expired response link.');
      return;
    }
    setTokenData(data as TokenData);
    setState('ready');
  }

  async function respondToConcert(_data: TokenData, status: AvailabilityStatus) {
    setState('submitting');
    const { error } = await supabase.functions.invoke('respond-to-concert', { body: { action: 'respond', token, status } });
    if (error) {
      setState('error');
      setErrorMsg('Failed to save your response. Please try again.');
      return;
    }
    setSubmitted(status);
    setState('done');
  }

  async function handleRegistryOptIn() {
    setState('submitting');
    const { error } = await supabase.from('players').update({ is_global_spare: true }).eq('secure_token', token);
    if (error) {
      setState('error');
      setErrorMsg('Failed to join the registry. Please try again.');
      return;
    }
    setState('done');
  }

  const concertDate = tokenData
    ? new Date(tokenData.concert.concert_date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  // --- RENDER LOGIC ---
  function renderContent() {
    if (state === 'loading' || state === 'submitting') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '32px 0' }}>
          <Loader size={40} className="spin" color="#0ea5e9" />
          <p style={{ margin: 0, color: '#475569', fontWeight: 600 }}>{state === 'submitting' ? 'Confirming your response…' : 'Loading…'}</p>
        </div>
      );
    }

    if (state === 'error') {
      return (
        <div style={{ padding: '20px 0' }}>
          <XCircle size={56} color="#ef4444" style={{ margin: '0 auto 16px auto' }} />
          <p style={{ margin: 0, color: '#991b1b', fontWeight: 500, lineHeight: '1.5' }}>{errorMsg}</p>
        </div>
      );
    }

    if (state === 'done') {
      const ds = directStatus?.toLowerCase().replace('_', ' ') || '';
      const isSuccess = ['accepted', 'available', 'spare assigned'].includes(ds);
      const isDeclined = ['declined', 'not available'].includes(ds);
      const isFilled = ds === 'contact-manager' || ds === 'filled';
      const isError = ds === 'error' || ds === 'unknown';

      if (directStatus) {
        if (isFilled) return (
          <div style={{ padding: '10px 0' }}>
            <AlertTriangle size={56} color="#eab308" style={{ margin: '0 auto 16px auto' }} />
            <h2 style={{ color: '#0f172a', margin: '0 0 12px 0', fontSize: '22px' }}>Seat Already Filled</h2>
            <p style={{ fontSize: '15px', color: '#475569', margin: 0, lineHeight: '1.5' }}>Another player has already accepted this gig. Please contact the band manager directly if you need to change your status.</p>
          </div>
        );
        if (isSuccess) return (
          <div style={{ padding: '10px 0' }}>
            <CheckCircle size={56} color="#16a34a" style={{ margin: '0 auto 16px auto' }} />
            <h2 style={{ color: '#166534', margin: '0 0 12px 0', fontSize: '22px' }}>Gig Confirmed!</h2>
            <p style={{ fontSize: '15px', color: '#475569', margin: 0, lineHeight: '1.5' }}>Your availability has been updated to Green. The manager has been notified. Thank you!</p>
          </div>
        );
        if (isDeclined) return (
          <div style={{ padding: '10px 0' }}>
            <XCircle size={56} color="#ef4444" style={{ margin: '0 auto 16px auto' }} />
            <h2 style={{ color: '#991b1b', margin: '0 0 12px 0', fontSize: '22px' }}>Response Recorded</h2>
            <p style={{ fontSize: '15px', color: '#475569', margin: 0, lineHeight: '1.5' }}>Your response has been logged. Thanks for letting us know quickly!</p>
          </div>
        );
        if (isError) return (
          <div style={{ padding: '10px 0' }}>
            <XCircle size={56} color="#ef4444" style={{ margin: '0 auto 16px auto' }} />
            <h2 style={{ color: '#991b1b', margin: '0 0 12px 0', fontSize: '22px' }}>Oops! Something went wrong</h2>
            <p style={{ fontSize: '15px', color: '#475569', margin: 0, lineHeight: '1.5' }}>We couldn't securely verify your status link. Please contact the band manager directly to update your status.</p>
          </div>
        );
        
        // Safety Fallback for directStatus
        return (
          <div style={{ padding: '10px 0' }}>
            <CheckCircle size={56} color="#0ea5e9" style={{ margin: '0 auto 16px auto' }} />
            <h2 style={{ color: '#0284c7', margin: '0 0 12px 0', fontSize: '22px' }}>Response Recorded</h2>
            <p style={{ fontSize: '15px', color: '#475569', margin: 0, lineHeight: '1.5' }}>Your status has been updated to: <strong>{directStatus}</strong></p>
          </div>
        );
      }

      if (submitted) {
        if (submitted === 'Available') return (
          <div style={{ padding: '10px 0' }}>
            <CheckCircle size={56} color="#16a34a" style={{ margin: '0 auto 16px auto' }} />
            <h2 style={{ color: '#166534', margin: '0 0 12px 0', fontSize: '22px' }}>Great, you're in!</h2>
            <p style={{ fontSize: '15px', color: '#475569', margin: 0, lineHeight: '1.5' }}>You've been marked as <strong>Available</strong> for {tokenData?.concert.name}.</p>
          </div>
        );
        if (submitted === 'Not Available') return (
          <div style={{ padding: '10px 0' }}>
            <XCircle size={56} color="#ef4444" style={{ margin: '0 auto 16px auto' }} />
            <h2 style={{ color: '#991b1b', margin: '0 0 12px 0', fontSize: '22px' }}>Thanks for letting us know</h2>
            <p style={{ fontSize: '15px', color: '#475569', margin: 0, lineHeight: '1.5' }}>You've been marked as <strong>Not Available</strong> for {tokenData?.concert.name}.</p>
          </div>
        );
      }

      if (mode === 'registry') {
        return (
          <div style={{ padding: '10px 0' }}>
            <CheckCircle size={56} color="#16a34a" style={{ margin: '0 auto 16px auto' }} />
            <h2 style={{ color: '#166534', margin: '0 0 12px 0', fontSize: '22px' }}>You're on the list! 🌐</h2>
            <p style={{ fontSize: '15px', color: '#475569', margin: 0, lineHeight: '1.5' }}>Thanks! You've successfully joined the global spare registry as a <strong>{registryData?.instrument}</strong>.</p>
          </div>
        );
      }

      // Extreme safety fallback
      return <p style={{ color: '#ef4444' }}>Status recorded successfully, but no message format could be determined.</p>;
    }

    if (state === 'ready') {
      if (mode === 'registry' && registryData) {
        return (
          <>
            <p style={{ fontSize: '16px', color: '#334155', margin: '0 0 8px 0' }}>Hi <strong>{registryData.name}</strong>,</p>
            <p style={{ color: '#64748b', fontSize: '14px', lineHeight: '1.5', margin: '0 0 24px 0' }}>Your manager at <strong>{registryData.bands?.name || 'your band'}</strong> has invited you to join the regional spare registry.</p>
            <div style={{ textAlign: 'left', padding: '20px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', color: '#0f172a' }}>What does this mean?</h3>
              <p style={{ margin: 0, fontSize: '13.5px', color: '#475569', lineHeight: '1.6' }}>By clicking the button below, your name and instrument (<strong>{registryData.instrument}</strong>) will become safely discoverable to other local band managers when they are short of players for an upcoming gig. Your contact details remain completely private until you explicitly accept a booking request.</p>
            </div>
            <div style={{ marginTop: '24px' }}>
              <button style={{ width: '100%', padding: '14px', borderRadius: '8px', border: 'none', background: '#16a34a', color: '#fff', fontSize: '15px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer' }} onClick={handleRegistryOptIn}><CheckCircle size={20} /> Opt Into Global Registry</button>
            </div>
          </>
        );
      }

      if (mode === 'concert' && tokenData) {
        return (
          <>
            <p style={{ fontSize: '16px', color: '#334155', margin: '0 0 8px 0' }}>Hi <strong>{tokenData.player.name}</strong>,</p>
            <p style={{ color: '#64748b', fontSize: '14px', lineHeight: '1.5', margin: '0 0 24px 0' }}>Are you available for the following concert?</p>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', textAlign: 'left', marginBottom: '24px' }}>
              <h2 style={{ margin: '0 0 16px 0', color: '#0f172a', fontSize: '18px' }}>{tokenData.concert.name}</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '14px', color: '#475569' }}>
                <div>📅 <strong>Date:</strong> {concertDate}</div>
                <div>🕐 <strong>Time:</strong> {tokenData.concert.start_time.slice(0, 5)} – {tokenData.concert.end_time.slice(0, 5)}</div>
                <div>📍 <strong>Location:</strong> {tokenData.concert.location}</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button style={{ width: '100%', padding: '14px', borderRadius: '8px', border: 'none', background: '#16a34a', color: '#fff', fontSize: '15px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer' }} onClick={() => respondToConcert(tokenData, 'Available')}><CheckCircle size={20} /> Available</button>
              <button style={{ width: '100%', padding: '14px', borderRadius: '8px', border: 'none', background: '#ef4444', color: '#fff', fontSize: '15px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer' }} onClick={() => respondToConcert(tokenData, 'Not Available')}><XCircle size={20} /> Not Available</button>
            </div>
          </>
        );
      }
    }

    // Ultimate fallback if state/data completely mismatches
    return <p style={{ color: '#ef4444' }}>Unable to determine link payload. Please request a new link.</p>;
  }

  return (
    <div className="respond-page" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', padding: '20px', fontFamily: 'system-ui' }}>
      <div className="respond-card" style={{ background: '#fff', padding: '40px', borderRadius: '16px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', maxWidth: '440px', width: '100%', textAlign: 'center' }}>
        <div className="respond-header" style={{ marginBottom: '24px' }}>
          <div className="login-logo" style={{ display: 'inline-flex', background: '#e0f2fe', padding: '16px', borderRadius: '50%', color: '#0ea5e9', marginBottom: '16px' }}><Music size={32} /></div>
          <h1 style={{ margin: '0 0 8px 0', color: '#0f172a', fontSize: '24px', fontWeight: 800 }}>Brassbandwidth</h1>
          <p style={{ margin: 0, color: '#64748b', fontSize: '14px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '1px' }}>
            {mode === 'registry' ? 'Global Player Registry' : 'Availability Response'}
          </p>
        </div>

        <div className="respond-body">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}