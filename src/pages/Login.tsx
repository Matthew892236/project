import { useEffect, useState } from 'react';
import { Music, Eye, EyeOff, MailCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';

// 🌟 FIX: Added 'update' mode to handle setting the new password!
type Mode = 'login' | 'signup' | 'forgot' | 'update';

export default function Login() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // 🌟 FIX: Automatically detect if they arrived via a password reset link
  useEffect(() => {
    const hash = window.location.hash;
    const search = window.location.search;
    if (hash.includes('type=recovery') || search.includes('type=recovery')) {
      setMode('update');
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setLoading(true);

    try {
      if (mode === 'update') {
        // 🌟 FIX: Securely submit the new password to Supabase
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) throw updateError;
        
        setSuccessMessage('Password successfully updated! You are now logged in.');
        setMode('login');
        setPassword('');
        // Clean up the URL so they don't get stuck in a recovery loop
        window.history.replaceState({}, document.title, window.location.pathname);
      } else if (mode === 'signup') {
        const { error: signUpError } = await supabase.auth.signUp({ 
          email, 
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`
          }
        });
        if (signUpError) throw signUpError;
        
        setSuccessMessage('Verification link sent! Please check your email inbox to confirm your account.');
        setMode('login'); 
        setPassword(''); 
      } else if (mode === 'forgot') {
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
      setError(err instanceof Error ? err.message : 'An error occurred during authentication.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <div style={{ backgroundColor: '#eab308', padding: '12px', borderRadius: '12px', display: 'inline-flex', marginBottom: '16px' }}>
            <Music size={32} color="#1e3a5f" />
          </div>
          <h1>Brassbandwidth</h1>
          <p>
            {mode === 'login' ? 'Free Brass Band Management Tool' 
             : mode === 'signup' ? 'Create your band account' 
             : mode === 'update' ? 'Securely set your new password'
             : 'Enter your email to receive a recovery link'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {successMessage && (
            <div style={{ color: '#166534', backgroundColor: '#dcfce7', border: '1px solid #bbf7d0', padding: '12px 14px', borderRadius: '6px', fontSize: '14px', marginBottom: '20px', display: 'flex', gap: '8px', alignItems: 'center', lineHeight: 1.4 }}>
              <MailCheck size={18} style={{ flexShrink: 0 }} />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Hide the email box if they are just typing a new password */}
          {mode !== 'update' && (
            <div className="form-group">
              <label>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="band@example.com" required autoFocus />
            </div>
          )}

          {mode !== 'forgot' && (
            <div className="form-group">
              <label>{mode === 'update' ? 'New Password' : 'Password'}</label>
              <div className="input-with-icon">
                <input 
                  type={showPassword ? 'text' : 'password'} 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                  placeholder={mode === 'signup' ? 'Create a secure password' : mode === 'update' ? 'Enter new password' : 'Enter your password'} 
                  required 
                  minLength={6} 
                  autoFocus={mode === 'update'} 
                />
                <button type="button" className="input-icon-btn" onClick={() => setShowPassword(!showPassword)} tabIndex={-1}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              
              {mode === 'login' && (
                <div style={{ textAlign: 'right', marginTop: '6px' }}>
                  <button type="button" className="link-btn" style={{ fontSize: '13px', opacity: 0.8 }} onClick={() => { setMode('forgot'); setError(null); setSuccessMessage(null); }}>Forgot password?</button>
                </div>
              )}
            </div>
          )}

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="btn btn-primary login-submit" disabled={loading} style={{ backgroundColor: '#1e3a5f' }}>
            {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : mode === 'signup' ? 'Register Account' : mode === 'update' ? 'Save New Password' : 'Send Reset Link'}
          </button>
        </form>

        <div className="login-footer">
          {mode === 'update' ? (
            <p>Remembered it? <button className="link-btn" onClick={() => { setMode('login'); setError(null); setSuccessMessage(null); window.history.replaceState({}, document.title, window.location.pathname); }}>Back to Login</button></p>
          ) : mode === 'forgot' ? (
            <p>Remember your password? <button className="link-btn" onClick={() => { setMode('login'); setError(null); setSuccessMessage(null); }}>Sign in</button></p>
          ) : mode === 'login' ? (
            <p>Don't have an account? <button className="link-btn" onClick={() => { setMode('signup'); setError(null); setSuccessMessage(null); }}>Create one</button></p>
          ) : (
            <p>Already have an account? <button className="link-btn" onClick={() => { setMode('login'); setError(null); setSuccessMessage(null); }}>Sign in</button></p>
          )}
          
          <p style={{ marginTop: '12px', fontSize: '13px', color: 'var(--text-light)' }}>
            Need help?{' '}
            <a href="mailto:admin@brassbandwidth.com" style={{ color: '#1e3a5f', textDecoration: 'none', fontWeight: 600 }}>
              Contact us
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}