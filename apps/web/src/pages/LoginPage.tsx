import React, { useState, useEffect } from 'react';
import { Sparkles, ArrowRight, AlertCircle, ShieldCheck, Server, CheckCircle2, WifiOff } from 'lucide-react';
import { api, getBackendOrigin, setBackendOrigin, isRemoteStaticHost } from '../services/api';

interface LoginPageProps {
  onLoginSuccess: (user: any) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('admin@socialrelay.local');
  const [password, setPassword] = useState('admin1234');
  const [backendUrl, setBackendUrl] = useState(() => getBackendOrigin() || 'http://localhost:8000');
  const [showBackendConfig, setShowBackendConfig] = useState(() => isRemoteStaticHost());
  const [backendStatus, setBackendStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkBackend = async (targetUrl?: string) => {
    setBackendStatus('checking');
    const urlToTest = (targetUrl ?? backendUrl).trim().replace(/\/+$/, '');
    try {
      const res = await fetch(`${urlToTest}/api/v1/system/health`, { method: 'GET' });
      setBackendStatus(res.ok || res.status === 401 ? 'online' : 'offline');
    } catch {
      setBackendStatus('offline');
    }
  };

  useEffect(() => {
    if (isRemoteStaticHost() || showBackendConfig) {
      checkBackend();
    } else {
      setBackendStatus('online');
    }
  }, []);

  const handleBackendUrlChange = (val: string) => {
    setBackendUrl(val);
    setBackendOrigin(val);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    if (showBackendConfig) {
      setBackendOrigin(backendUrl);
    }

    try {
      const res = await api.login(password, email);
      if (res.token) {
        localStorage.setItem('socialrelay_token', res.token);
      }
      onLoginSuccess(res.user);
    } catch (err: any) {
      setError(
        err.message === 'Failed to fetch'
          ? `Cannot reach SocialRelay backend at ${backendUrl}. Start your local backend (start-windows.ps1 or start.bat) and try again.`
          : err.message || 'Login failed. Please verify your administrator password.'
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
        <p className="text-xs text-muted">Self-Hosted Social Media Cross-Publishing & Automation Platform</p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-surface py-8 px-6 sm:px-10 rounded-2xl border border-border shadow-xl space-y-5">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-foreground">Sign In to Dashboard</h2>
              <p className="text-xs text-muted">Default password: <code className="text-primary font-mono">admin1234</code></p>
            </div>
            <button
              type="button"
              onClick={() => setShowBackendConfig(!showBackendConfig)}
              className="text-[11px] text-muted hover:text-foreground flex items-center space-x-1"
              title="Configure private backend server URL"
            >
              <Server className="w-3.5 h-3.5" />
              <span>Server</span>
            </button>
          </div>

          {showBackendConfig && (
            <div className="p-3.5 rounded-xl bg-elevated border border-border space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground">Private Execution Backend</span>
                {backendStatus === 'online' ? (
                  <span className="text-success flex items-center space-x-1 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Online</span>
                  </span>
                ) : backendStatus === 'offline' ? (
                  <span className="text-warning flex items-center space-x-1 font-medium">
                    <WifiOff className="w-3.5 h-3.5" />
                    <span>Offline</span>
                  </span>
                ) : (
                  <span className="text-muted">Checking...</span>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={backendUrl}
                  onChange={(e) => handleBackendUrlChange(e.target.value)}
                  placeholder="http://localhost:8000"
                  className="flex-1 px-2.5 py-1.5 rounded-lg bg-background border border-border text-foreground text-xs focus:outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() => checkBackend()}
                  className="px-2.5 py-1.5 rounded-lg bg-surface border border-border text-foreground hover:border-primary"
                >
                  Test
                </button>
              </div>
              <p className="text-[11px] text-muted leading-relaxed">
                Keep your database, FFmpeg, and OAuth tokens private on your PC (<code className="text-foreground">http://localhost:8000</code>) or your private Tailscale/Cloudflare tunnel.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-foreground text-sm focus:outline-none focus:border-primary"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Administrator Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
              disabled={loading || !password}
              className="w-full py-2.5 px-4 rounded-xl bg-primary hover:bg-primary-hover text-white text-sm font-semibold flex items-center justify-center space-x-2 shadow-md transition-all disabled:opacity-50"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <>
                  <span>Open Console</span>
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
