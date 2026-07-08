import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Music, Loader } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Concert, AvailabilityStatus } from '../lib/supabase';

type State = 'loading' | 'ready' | 'submitting' | 'done' | 'error' | 'success';
type Mode = 'concert' | 'registry';

interface TokenData {
  player: { id: string; name: string; instrument: string; band_id?: string | null };
  concert: Concert & { band_name?: string };
  action: 'accept' | 'decline' | 'dep-accept' | 'dep-decline' | 'core-accept' | 'core-decline';
  isSpare: boolean;
}

interface RegistryData {
  id: string;
  name: string;
  instrument: string;
  bands?: any;
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
  const [registryData, setRegistryData] = useState<RegistryData | null>(null);
  const [submitted, setSubmitted] = useState<AvailabilityStatus | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [directStatus, setDirectStatus] = useState<string | null>(null);

  useEffect(() => {
    if (quickResponse) return;
    
    // 🌟 THE ANTI-VIRUS BYPASS: Process the click securely here in React!
    if (pid && cid && act) {
      processDirectAction(pid, cid, act);
      return;
    }

    if (!token) {
      setState('error');
      setErrorMsg('No response token provided.');
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
      setState('error');
      setErrorMsg('Failed to process your response. Please contact the manager.');
    }
  }

  async function determineTokenRoute() {
    try {
      const { data: playerMatch } = await supabase.from('players').select('id, name, instrument, bands ( name )').eq('secure_token', token).maybeSingle();

      if (playerMatch) {
        setMode('registry');
        setRegistryData(playerMatch as unknown as RegistryData);
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
    if (quickResponse === 'available' || quickResponse === 'not_available') {
      setState('submitting');
      await respondToConcert(data as TokenData, quickResponse === 'available' ? 'Available' : 'Not Available');
    } else {
      setState('ready');
    }
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

  // 🌟 ABSOLUTE KILL SWITCH
  if (quickResponse) {
    return <div style={{ minHeight: '100vh', background: '#f8fafc' }} />;
  }

  return (
    <div className="respond-page">
      <div className="respond-card">
        <div className="respond-header">
          <div className="login-logo"><Music size={28} /></div>
          <h1>Brassbandwidth</h1>
          <p>{mode === 'registry' ? 'Global Player Registry' : 'Availability Response'}</p>
        </div>

        <div className="respond-body">
          {state === 'loading' || state === 'submitting' ? (
            <div className="respond-loading">
              <Loader size={32} className="spin" />
              <p>{state === 'submitting' ? 'Confirming your response…' : 'Loading…'}</p>
            </div>
          ) : state === 'error' ? (
            <div className="respond-error">
              <XCircle size={40} />
              <p>{errorMsg}</p>
            </div>
          ) : state === 'done' ? (
            <div className="respond-done">
              {/* 🌟 EXACT CUSTOM MESSAGES RENDERED DIRECTLY ON SCREEN */}
              {directStatus === 'contact-manager' ? (
                <>
                  <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
                  <p style={{ fontSize: '18px', fontWeight: 600, color: '#0f172a' }}>
                    Availability already accepted. Please contact the band manager to change your status.
                  </p>
                </>
              ) : directStatus === 'accepted' ? (
                <>
                  <CheckCircle size={48} className="done-icon done-available" />
                  <h2>Gig Confirmed!</h2>
                  <p>Your availability has been updated to Green. Thank you!</p>
                </>
              ) : directStatus === 'declined' ? (
                <>
                  <XCircle size={48} className="done-icon done-not-available" />
                  <h2>Response Recorded</h2>
                  <p>Your response has been logged so the manager can automatically check the next player on the list. Thanks for letting us know quickly!</p>
                </>
              ) : mode === 'registry' ? (
                <>
                  <CheckCircle size={48} className="done-icon done-available" />
                  <h2>You're on the list! 🌐</h2>
                  <p>Thanks! You've successfully joined the global spare registry as a <strong>{registryData?.instrument}</strong>.</p>
                </>
              ) : submitted === 'Available' ? (
                <>
                  <CheckCircle size={48} className="done-icon done-available" />
                  <h2>Great, you're in!</h2>
                  <p>You've been marked as <strong>Available</strong> for {tokenData?.concert.name}.</p>
                </>
              ) : (
                <>
                  <XCircle size={48} className="done-icon done-not-available" />
                  <h2>Thanks for letting us know</h2>
                  <p>You've been marked as <strong>Not Available</strong> for {tokenData?.concert.name}.</p>
                </>
              )}
            </div>
          ) : mode === 'registry' && registryData ? (
            <>
              <p className="respond-greeting">Hi <strong>{registryData.name}</strong>,</p>
              <p className="respond-subtitle">Your manager at <strong>{registryData.bands?.name || 'your band'}</strong> has invited you to join the regional spare registry.</p>
              <div className="respond-concert-card" style={{ textAlign: 'left', padding: '16px' }}>
                <h3 style={{ margin: '0 0 8px 0', fontSize: '16px' }}>What does this mean?</h3>
                <p style={{ margin: 0, fontSize: '13px', color: '#555', lineHeight: '1.4' }}>By clicking the button below, your name and instrument (<strong>{registryData.instrument}</strong>) will become safely discoverable to other local band managers when they are short of players for an upcoming gig. Your contact details remain completely private until you explicitly accept a booking request.</p>
              </div>
              <div className="respond-actions" style={{ marginTop: '24px' }}>
                <button className="btn respond-btn-available" style={{ width: '100%', justifyContent: 'center' }} onClick={handleRegistryOptIn}><CheckCircle size={20} /> Opt Into Global Registry</button>
              </div>
            </>
          ) : mode === 'concert' && tokenData ? (
            <>
              <p className="respond-greeting">Hi <strong>{tokenData.player.name}</strong>,</p>
              <p className="respond-subtitle">Are you available for the following concert?</p>
              <div className="respond-concert-card">
                <h2>{tokenData.concert.name}</h2>
                <div className="respond-concert-detail">📅 {concertDate}</div>
                <div className="respond-concert-detail">🕐 {tokenData.concert.start_time.slice(0, 5)} – {tokenData.concert.end_time.slice(0, 5)}</div>
                <div className="respond-concert-detail">📍 {tokenData.concert.location}</div>
              </div>
              <div className="respond-actions">
                <button className="btn respond-btn-available" onClick={() => respondToConcert(tokenData, 'Available')}><CheckCircle size={20} /> Available</button>
                <button className="btn respond-btn-not-available" onClick={() => respondToConcert(tokenData, 'Not Available')}><XCircle size={20} /> Not Available</button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}