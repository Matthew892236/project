import { useEffect, useState } from 'react';
import { Music, CheckCircle, XCircle, Loader } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { AvailabilityStatus } from '../lib/supabase';

type State = 'loading' | 'ready' | 'submitting' | 'done' | 'error';
type Mode = 'concert' | 'registry'; // ◄ Added to track what type of token we have

type TokenData = {
  player_id: string;
  concert_id: string;
  used_at: string | null;
  player: { name: string; instrument: string };
  concert: { name: string; concert_date: string; start_time: string; end_time: string; location: string };
};

// ◄ Added type for the player registry setup
type RegistryData = {
  id: string;
  name: string;
  instrument: string;
  bands: { name: string } | null;
};

export default function Respond() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  const quickResponse = params.get('status');

  const [state, setState] = useState<State>('loading');
  const [mode, setMode] = useState<Mode | null>(null); // ◄ Tracks if this is a concert or a registry opt-in
  const [tokenData, setTokenData] = useState<TokenData | null>(null);
  const [registryData, setRegistryData] = useState<RegistryData | null>(null); // ◄ Registry profile state
  const [submitted, setSubmitted] = useState<AvailabilityStatus | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    // 🌟 THE FIX: If the URL has a status, quietly stop right here. 
    // This prevents the "No response token provided" error from ever triggering!
    if (quickResponse) return;

    if (!token) { setState('error'); setErrorMsg('No response token provided.'); return; }
    determineTokenRoute();
  }, [token, quickResponse]);

  // 🌟 THE FIX: If a status popup is active, render absolutely nothing in the background.
  if (quickResponse) return null;

  // 🕵️‍♂️ Step 1: Detect what type of invitation link was clicked
  async function determineTokenRoute() {
    try {
      // First, check if the token belongs to a player opting into the global registry
      const { data: playerMatch } = await supabase
        .from('players')
        .select('id, name, instrument, bands ( name )')
        .eq('secure_token', token)
        .maybeSingle();

      if (playerMatch) {
        setMode('registry');
        setRegistryData(playerMatch as unknown as RegistryData);
        setState('ready');
        return;
      }

      // Fallback: If no player registry token matches, run your original concert logic
      setMode('concert');
      await loadConcertToken();
    } catch (err: any) {
      setState('error');
      setErrorMsg('An unexpected error occurred while verifying your link.');
    }
  }

  // Your original Concert Token Loader
  async function loadConcertToken() {
    const { data, error } = await supabase.functions.invoke('respond-to-concert', {
      body: { action: 'load', token },
    });

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

  // Your original Concert Response Action
  async function respondToConcert(_data: TokenData, status: AvailabilityStatus) {
    setState('submitting');
    const { error } = await supabase.functions.invoke('respond-to-concert', {
      body: { action: 'respond', token, status },
    });

    if (error) {
      setState('error');
      setErrorMsg('Failed to save your response. Please try again.');
      return;
    }

    setSubmitted(status);
    setState('done');
  }

  // 🌐 New Action: Handle the one-click Global Spare Registry opt-in
  async function handleRegistryOptIn() {
    setState('submitting');
    
    const { error } = await supabase
      .from('players')
      .update({ is_global_spare: true })
      .eq('secure_token', token);

    if (error) {
      setState('error');
      setErrorMsg('Failed to join the registry. Please try again.');
      return;
    }

    setState('done');
  }

  const concertDate = tokenData
    ? new Date(tokenData.concert.concert_date).toLocaleDateString('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })
    : '';

  return (
    <div className="respond-page">
      <div className="respond-card">
        <div className="respond-header">
          <div className="login-logo"><Music size={28} /></div>
          <h1>Brassbandwidth</h1>
          <p>{mode === 'registry' ? 'Global Player Registry' : 'Availability Response'}</p>
        </div>

        <div className="respond-body">
          {/* GLOBAL STATE: Loading or Saving */}
          {state === 'loading' || state === 'submitting' ? (
            <div className="respond-loading">
              <Loader size={32} className="spin" />
              <p>{state === 'submitting' ? 'Saving your response…' : 'Loading…'}</p>
            </div>
          ) : state === 'error' ? (
            <div className="respond-error">
              <XCircle size={40} />
              <p>{errorMsg}</p>
            </div>
          ) : state === 'done' ? (
            <div className="respond-done">
              {/* DONE LAYOUT: Handles either Concert success or Registry success */}
              {mode === 'registry' ? (
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
            /* MODE A: Render Global Spare Opt-In Layout */
            <>
              <p className="respond-greeting">Hi <strong>{registryData.name}</strong>,</p>
              <p className="respond-subtitle">
                Your manager at <strong>{registryData.bands?.name || 'your band'}</strong> has invited you to join the regional spare registry.
              </p>
              
              <div className="respond-concert-card" style={{ textAlign: 'left', padding: '16px' }}>
                <h3 style={{ margin: '0 0 8px 0', fontSize: '16px' }}>What does this mean?</h3>
                <p style={{ margin: 0, fontSize: '13px', color: '#555', lineHeight: '1.4' }}>
                  By clicking the button below, your name and instrument (<strong>{registryData.instrument}</strong>) will become safely discoverable to other local band managers when they are short of players for an upcoming gig. Your contact details remain completely private until you explicitly accept a booking request.
                </p>
              </div>

              <div className="respond-actions" style={{ marginTop: '24px' }}>
                <button className="btn respond-btn-available" style={{ width: '100%', justifyContent: 'center' }} onClick={handleRegistryOptIn}>
                  <CheckCircle size={20} /> Opt Into Global Registry
                </button>
              </div>
            </>
          ) : mode === 'concert' && tokenData ? (
            /* MODE B: Original Concert Response Layout */
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
                <button className="btn respond-btn-available" onClick={() => respondToConcert(tokenData, 'Available')}>
                  <CheckCircle size={20} /> Available
                </button>
                <button className="btn respond-btn-not-available" onClick={() => respondToConcert(tokenData, 'Not Available')}>
                  <XCircle size={20} /> Not Available
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}