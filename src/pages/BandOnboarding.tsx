import { useState } from 'react';
import { Music, MapPin, ArrowRight, ShieldAlert } from 'lucide-react';
import { supabase } from '../lib/supabase';

type OnboardingProps = {
  onComplete: () => void;
};

export default function BandOnboarding({ onComplete }: OnboardingProps) {
  const [bandName, setBandName] = useState('');
  const [location, setLocation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleOnboardingSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const cleanBandName = bandName.trim();
    const cleanLocation = location.trim();

    if (!cleanBandName || !cleanLocation) {
      setError('Please fill out all fields to register your band.');
      return;
    }

    setLoading(true);

    try {
      // 1. Fetch the authenticated user profile
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        throw new Error('Authentication session expired. Please log in again.');
      }

      // 2. Insert the brand new isolated band profile row
      const { data: newBand, error: bandError } = await supabase
        .from('bands')
        .insert({
          name: cleanBandName,
          location: cleanLocation,
          manager_id: user.id
        })
        .select()
        .single();

      if (bandError || !newBand) {
        throw new Error(bandError?.message || 'Failed to initialize band profile record.');
      }

      // 3. 🚀 TRIGGER: Invoke the Welcome Explainer Email Cloud Function
      try {
        await supabase.functions.invoke('send-welcome-email', {
          body: {
            manager_email: user.email,
            manager_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Manager',
            band_name: cleanBandName
          }
        });
      } catch (emailErr) {
        // Silent catch: Don't block onboarding completion if email microservice experiences network latency
        console.error('Background welcome email initialization skipped:', emailErr);
      }

      // 4. Advance the user directly to their freshly isolated dashboard
      onComplete();

    } catch (err: any) {
      setError(err.message || 'An unexpected database synchronization error occurred.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0f172a',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      fontFamily: "'Inter', sans-serif",
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '16px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        width: '100%',
        maxWidth: '480px',
        padding: '40px',
        boxSizing: 'border-box'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '64px',
            height: '64px',
            backgroundColor: '#f1f5f9',
            borderRadius: '50%',
            marginBottom: '16px'
          }}>
            <Music size={28} color="#1e3a5f" />
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#1e3a5f', margin: '0 0 8px 0' }}>
            Set Up Your Band
          </h1>
          <p style={{ color: '#64748b', fontSize: '14px', margin: 0, lineHeight: 1.5 }}>
            Create an isolated secure profile repository for your organization.
          </p>
        </div>

        {error && (
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fee2e2',
            borderRadius: '8px',
            padding: '12px 16px',
            color: '#991b1b',
            fontSize: '13px',
            marginBottom: '24px',
            lineHeight: 1.4
          }}>
            <ShieldAlert size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleOnboardingSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Band Name</label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                value={bandName}
                onChange={(e) => setBandName(e.target.value)}
                placeholder="e.g., City Brass Band"
                disabled={loading}
                required
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  outline: 'none',
                  transition: 'border-color 0.2s'
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Location / Region</label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g., Greater Manchester, UK"
                disabled={loading}
                required
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  outline: 'none',
                  transition: 'border-color 0.2s'
                }}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: '12px',
              backgroundColor: '#1e3a5f',
              color: '#ffffff',
              fontWeight: '600',
              fontSize: '15px',
              padding: '14px',
              borderRadius: '8px',
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              opacity: loading ? 0.7 : 1,
              transition: 'background-color 0.2s'
            }}
          >
            {loading ? 'Initializing Secure Suite…' : 'Complete Configuration'}
            {!loading && <ArrowRight size={16} />}
          </button>
        </form>
      </div>
    </div>
  );
}