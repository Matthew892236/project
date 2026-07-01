import { useState } from 'react';
import { Music, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Mode = 'login' | 'signup' | 'forgot'; // Expanded modes to include 'forgot'

export default function Login() {
  const [mode, setMode] = useState<Mode>('login');
  const [bandName, setBandName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null); // State for email verification feedback

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setLoading(true);

    try {
      if (mode === 'signup') {
        const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) throw signUpError;
        if (data.user) {
          const { error: profileError } = await supabase.from('profiles').insert({
            id: data.user.id,
            band_name: bandName,
          });
          if (profileError) throw profileError;
        }
      } else if (mode === 'forgot') {
        // Trigger Supabase's built-in password reset magic
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/`,
        });
        if (resetError) throw resetError;
        setSuccessMessage('Password reset link sent! Please check your inbox.');
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">
            <Music size={32} />
          </div>
          <h1>Brassbandwidth</h1>
          <p>
            {mode === 'login' 
              ? 'Sign in to manage your band' 
              : mode === 'signup' 
              ? 'Create your band account' 
              : 'Enter your email to receive a recovery link'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {mode === 'signup' && (
            <div className="form-group">
              <label>Band Name</label>
              <input
                type="text"
                value={bandName}
                onChange={(e) => setBandName(e.target.value)}
                placeholder="e.g., Thornton Brass Band"
                required
                autoFocus
              />
            </div>
          )}

          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="band@example.com"
              required
              autoFocus={mode !== 'signup'}
            />
          </div>

          {/* Hide the password field entirely if they are resetting their password */}
          {mode !== 'forgot' && (
            <div className="form-group">
              <label>Password</label>
              <div className="input-with-icon">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'Create a password' : 'Enter your password'}
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  className="input-icon-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              
              {/* Added: Clickable inline link for forgot password */}
              {mode === 'login' && (
                <div style={{ textAlign: 'right', marginTop: '6px' }}>
                  <button
                    type="button"
                    className="link-btn"
                    style={{ fontSize: '13px', opacity: 0.8 }}
                    onClick={() => { setMode('forgot'); setError(null); setSuccessMessage(null); }}
                  >
                    Forgot password?
                  </button>
                </div>
              )}
            </div>
          )}

          {error && <div className="login-error">{error}</div>}
          
          {/* Added: Green styling box for a successful reset transmission */}
          {successMessage && (
            <div style={{ 
              color: '#155724', 
              backgroundColor: '#d4edda', 
              border: '1px solid #c3e6cb', 
              padding: '10px 14px', 
              borderRadius: 'var(--radius, 6px)', 
              fontSize: '14px', 
              marginBottom: '16px' 
            }}>
              {successMessage}
            </div>
          )}

          <button type="submit" className="btn btn-primary login-submit" disabled={loading}>
            {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Send Reset Link'}
          </button>
        </form>

        <div className="login-footer">
          {mode === 'forgot' ? (
            <p>
              Remember your password?{' '}
              <button className="link-btn" onClick={() => { setMode('login'); setError(null); setSuccessMessage(null); }}>
                Sign in
              </button>
            </p>
          ) : mode === 'login' ? (
            <p>
              Don't have an account?{' '}
              <button className="link-btn" onClick={() => { setMode('signup'); setError(null); setSuccessMessage(null); }}>
                Create one
              </button>
            </p>
          ) : (
            <p>
              Already have an account?{' '}
              <button className="link-btn" onClick={() => { setMode('login'); setError(null); setSuccessMessage(null); }}>
                Sign in
              </button>
            </p>
          )}
          <p style={{ marginTop: '12px', fontSize: '13px', color: 'var(--text-light)' }}>
            Need help?{' '}
            <a href="mailto:mrmatthewhill@gmail.com" style={{ color: 'var(--primary)', textDecoration: 'none' }}>
              Contact us
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}