import React, { useState, useEffect } from 'react';
import { Sparkles, ArrowRight, AlertCircle, ShieldCheck, CheckCircle2, WifiOff } from 'lucide-react';
import { api } from '../services/api';

interface LoginPageProps {
  onLoginSuccess: (user: any) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'unavailable'>('checking');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/v1/system/health', { method: 'GET' })
      .then((res) => {
        if (!active) return;
        setServerStatus(res.ok || res.status === 401 ? 'online' : 'unavailable');
      })
      .catch(() => {
        if (!active) return;
        setServerStatus('unavailable');
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await api.login(password, email);
      if (res.token) {
        localStorage.setItem('socialrelay_token', res.token);
      }
      onLoginSuccess(res.user);
    } catch (err: any) {
      setError(
        err.message === 'Failed to fetch'
          ? 'Server unavailable. Please verify the SocialRelay backend service is running.'
          : err.message || 'Authentication failed. Please check your email and password.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-2">
        <div className="w-12 h-12 rounded-2xl bg-primary/20 border border-primary/40 flex items-center justify-center text-primary mx-auto shadow-lg shadow-primary/20">
          <Sparkles className="w-6 h-6 text-primary" />
        </div>
        <h1 className="text-2xl font-extrabold text-foreground tracking-tight">SocialRelay</h1>
        <p className="text-xs text-muted">Self-Hosted Social Media Cross-Publishing & Automation</p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-surface py-8 px-6 sm:px-10 rounded-2xl border border-border shadow-xl space-y-5">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <h2 className="text-sm font-semibold text-foreground">Administrator Sign In</h2>
              <p className="text-xs text-muted">Enter your configured administrator credentials.</p>
            </div>
            {serverStatus === 'online' ? (
              <span className="text-[11px] text-success flex items-center space-x-1 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Server online</span>
              </span>
            ) : serverStatus === 'unavailable' ? (
              <span className="text-[11px] text-warning flex items-center space-x-1 font-medium">
                <WifiOff className="w-3.5 h-3.5" />
                <span>Server unavailable</span>
              </span>
            ) : null}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@yourdomain.com"
                autoComplete="email"
                className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-foreground text-sm focus:outline-none focus:border-primary"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                autoComplete="current-password"
                className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-foreground text-sm focus:outline-none focus:border-primary"
                required
              />
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-destructive/15 border border-destructive/30 text-destructive text-xs flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full py-2.5 px-4 rounded-xl bg-primary hover:bg-primary-hover text-white text-sm font-semibold flex items-center justify-center space-x-2 shadow-md transition-all disabled:opacity-50"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="pt-2 border-t border-border/60 flex items-center justify-center space-x-2 text-[11px] text-muted">
            <ShieldCheck className="w-3.5 h-3.5 text-primary" />
            <span>Argon2id Encrypted Sessions</span>
          </div>
        </div>
      </div>
    </div>
  );
};
