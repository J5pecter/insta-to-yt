import React, { useState, useEffect } from 'react';
import {
  Share2,
  Plus,
  Key,
  Trash2,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Copy,
  UploadCloud,
  Video,
  Camera,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import { api } from '../services/api';
import { useFeedback } from '../components/Feedback';

interface AccountsPageProps {
  onReadinessChanged?: () => void;
}

export const AccountsPage: React.FC<AccountsPageProps> = ({ onReadinessChanged }) => {
  const { notify, confirmAction } = useFeedback();
  const [readiness, setReadiness] = useState<any>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Setup Wizard State: null | 'youtube' | 'instagram'
  const [wizardPlatform, setWizardPlatform] = useState<'youtube' | 'instagram' | null>(null);

  // YouTube JSON file upload
  const [ytFile, setYtFile] = useState<File | null>(null);
  const [savingYt, setSavingYt] = useState(false);

  // Instagram App credentials
  const [igAppId, setIgAppId] = useState('');
  const [igAppSecret, setIgAppSecret] = useState('');
  const [igLoginMode, setIgLoginMode] = useState<'instagram_login' | 'facebook_login'>('instagram_login');
  const [savingIg, setSavingIg] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [rRes, aRes] = await Promise.all([api.getReadiness(), api.listAccounts()]);
      setReadiness(rRes);
      setAccounts(aRes || []);
      onReadinessChanged?.();
    } catch (e: any) {
      notify(e.message || 'Failed to load accounts.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('connected');
    const err = params.get('error');
    if (connected) {
      notify(`Connected ${connected} account successfully!`, 'success');
      window.history.replaceState({}, '', '/');
    } else if (err) {
      notify(`OAuth error: ${err}`, 'error');
      window.history.replaceState({}, '', '/');
    }
  }, []);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    notify(`${label} copied to clipboard`, 'success');
  };

  const handleConnect = async (platform: 'youtube' | 'instagram') => {
    try {
      const res = await api.connectPlatform(platform);
      if (res.auth_url) {
        window.location.href = res.auth_url;
      }
    } catch (err: any) {
      notify(err.message || `Failed to start ${platform} OAuth`, 'error');
      setWizardPlatform(platform);
    }
  };

  const handleUploadYtFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ytFile) return;
    setSavingYt(true);
    try {
      await api.uploadGoogleCredentialsFile(ytFile);
      notify('YouTube client_secret.json validated & encrypted on backend.', 'success');
      setYtFile(null);
      await loadAll();
    } catch (err: any) {
      notify(err.message || 'Invalid Google OAuth JSON file.', 'error');
    } finally {
      setSavingYt(false);
    }
  };

  const handleSaveIgCreds = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingIg(true);
    try {
      await api.saveInstagramCredentials(igAppId.trim(), igAppSecret.trim(), igLoginMode);
      notify('Instagram App credentials encrypted & saved on backend.', 'success');
      setIgAppId('');
      setIgAppSecret('');
      await loadAll();
    } catch (err: any) {
      notify(err.message || 'Failed to save Instagram credentials.', 'error');
    } finally {
      setSavingIg(false);
    }
  };

  const handleTestAccount = async (id: number) => {
    try {
      const res = await api.testAccount(id);
      notify(
        res.healthy ? `${res.account_name} token is active and healthy.` : `${res.account_name} requires reconnection.`,
        res.healthy ? 'success' : 'warning'
      );
      loadAll();
    } catch (err: any) {
      notify(err.message || 'Health check failed.', 'error');
    }
  };

  const handleDisconnect = async (acc: any) => {
    const ok = await confirmAction({
      title: `Disconnect ${acc.account_name}?`,
      message: 'This will remove the stored OAuth token. Scheduled posts targeting this account will pause until reconnected.',
      confirmLabel: 'Disconnect',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.disconnectAccount(acc.id);
      notify('Account disconnected.', 'info');
      loadAll();
    } catch (err: any) {
      notify(err.message || 'Disconnect failed.', 'error');
    }
  };

  const ytCred = readiness?.youtube?.credentials;
  const igCred = readiness?.instagram?.credentials;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Accounts & OAuth Setup</h1>
          <p className="text-xs text-muted mt-0.5">
            One-time guided configuration for YouTube and Instagram. Credentials are encrypted at rest on the backend.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setWizardPlatform('youtube')}
            className="px-3.5 py-2 rounded-lg bg-surface border border-border text-xs font-semibold text-foreground hover:border-primary flex items-center space-x-1.5"
          >
            <Key className="w-3.5 h-3.5 text-primary" />
            <span>YouTube Setup Wizard</span>
          </button>
          <button
            type="button"
            onClick={() => setWizardPlatform('instagram')}
            className="px-3.5 py-2 rounded-lg bg-surface border border-border text-xs font-semibold text-foreground hover:border-primary flex items-center space-x-1.5"
          >
            <Key className="w-3.5 h-3.5 text-primary" />
            <span>Instagram Setup Wizard</span>
          </button>
        </div>
      </div>

      {/* Credential Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* YouTube Card */}
        <div className="p-5 rounded-xl bg-surface border border-border space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <Video className="w-5 h-5 text-red-400" />
              <div>
                <h2 className="text-sm font-bold text-foreground">YouTube Data API v3</h2>
                <p className="text-[11px] text-muted">
                  {ytCred?.configured ? `Client: ${ytCred.client_id_masked}` : 'Credentials not configured yet'}
                </p>
              </div>
            </div>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                ytCred?.configured ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'
              }`}
            >
              {ytCred?.configured ? 'Configured' : 'Setup Needed'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setWizardPlatform('youtube')}
              className="px-3 py-2 rounded-lg bg-elevated border border-border text-xs font-medium text-foreground hover:border-primary"
            >
              {ytCred?.configured ? 'Update Credentials' : 'Configure YouTube'}
            </button>
            <button
              type="button"
              onClick={() => handleConnect('youtube')}
              className="px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-xs font-semibold flex items-center space-x-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Connect YouTube</span>
            </button>
          </div>
        </div>

        {/* Instagram Card */}
        <div className="p-5 rounded-xl bg-surface border border-border space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <Camera className="w-5 h-5 text-pink-400" />
              <div>
                <h2 className="text-sm font-bold text-foreground">Instagram Professional API</h2>
                <p className="text-[11px] text-muted">
                  {igCred?.configured
                    ? `App ID: ${igCred.app_id_masked} (${igCred.login_mode === 'instagram_login' ? 'Instagram Login' : 'Facebook Login'})`
                    : 'App ID & Secret not configured yet'}
                </p>
              </div>
            </div>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                igCred?.configured ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'
              }`}
            >
              {igCred?.configured ? 'Configured' : 'Setup Needed'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setWizardPlatform('instagram')}
              className="px-3 py-2 rounded-lg bg-elevated border border-border text-xs font-medium text-foreground hover:border-primary"
            >
              {igCred?.configured ? 'Update App ID / Secret' : 'Configure Instagram'}
            </button>
            <button
              type="button"
              onClick={() => handleConnect('instagram')}
              className="px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-xs font-semibold flex items-center space-x-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Connect Instagram</span>
            </button>
          </div>
        </div>
      </div>

      {/* Connected Accounts List */}
      <div className="p-5 rounded-xl bg-surface border border-border space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">Authorized Destination Channels</h2>
          <button
            type="button"
            onClick={loadAll}
            className="text-xs text-muted hover:text-foreground flex items-center space-x-1"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>

        {loading ? (
          <div className="h-24 flex items-center justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
          </div>
        ) : accounts.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted border border-dashed border-border rounded-xl space-y-2">
            <Share2 className="w-8 h-8 text-muted mx-auto" />
            <p className="font-semibold text-foreground">No destination accounts connected yet</p>
            <p>Use the Setup Wizards above to configure credentials once, then connect your channels.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {accounts.map((acc) => (
              <div key={acc.id} className="p-4 rounded-xl bg-elevated border border-border space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 ${
                        acc.platform === 'youtube' ? 'bg-red-500/20 text-red-400' : 'bg-pink-500/20 text-pink-400'
                      }`}
                    >
                      {acc.platform === 'youtube' ? 'YT' : 'IG'}
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-foreground block truncate">{acc.account_name}</span>
                      <span className="text-[11px] text-muted capitalize">{acc.platform}</span>
                    </div>
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      acc.connection_status === 'connected' && !acc.is_expired
                        ? 'bg-success/15 text-success'
                        : 'bg-destructive/15 text-destructive'
                    }`}
                  >
                    {acc.is_expired ? 'Reconnect Required' : acc.connection_status}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border text-xs">
                  <button
                    type="button"
                    onClick={() => handleTestAccount(acc.id)}
                    className="text-muted hover:text-foreground flex items-center space-x-1"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-success" />
                    <span>Test</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleConnect(acc.platform)}
                    className="text-primary hover:underline"
                  >
                    Reconnect
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDisconnect(acc)}
                    className="text-muted hover:text-destructive flex items-center space-x-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remove</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* GUIDED SETUP WIZARD MODAL */}
      {wizardPlatform && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center space-x-2">
                {wizardPlatform === 'youtube' ? (
                  <Video className="w-5 h-5 text-red-400" />
                ) : (
                  <Camera className="w-5 h-5 text-pink-400" />
                )}
                <h3 className="text-base font-bold text-foreground">
                  {wizardPlatform === 'youtube' ? 'YouTube OAuth Setup Wizard' : 'Instagram Login Setup Wizard'}
                </h3>
              </div>
              <button type="button" onClick={() => setWizardPlatform(null)} className="text-muted hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            {wizardPlatform === 'youtube' ? (
              <form onSubmit={handleUploadYtFile} className="space-y-4 text-xs">
                <ol className="space-y-2 text-muted list-decimal list-inside">
                  <li>
                    Open{' '}
                    <a
                      href="https://console.cloud.google.com/apis/library/youtube.googleapis.com"
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline inline-flex items-center space-x-1"
                    >
                      <span>Google Cloud Console (YouTube Data API v3)</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>{' '}
                    and enable the API for a project named <strong className="text-foreground">SocialRelay</strong>.
                  </li>
                  <li>Configure Google Auth Platform (Branding, Audience, and add your Gmail as a test user if in Testing mode).</li>
                  <li>Create an <strong className="text-foreground">OAuth Client ID</strong> (Application type: <strong className="text-foreground">Web application</strong>).</li>
                  <li>Register this exact Authorized Redirect URI:</li>
                </ol>

                <div className="flex items-center justify-between p-2.5 rounded-lg bg-background border border-border font-mono text-[11px] text-foreground">
                  <span className="truncate">{ytCred?.expected_callback_url || `${window.location.origin}/api/v1/accounts/youtube/callback`}</span>
                  <button
                    type="button"
                    onClick={() =>
                      handleCopy(ytCred?.expected_callback_url || `${window.location.origin}/api/v1/accounts/youtube/callback`, 'Callback URL')
                    }
                    className="ml-2 px-2 py-1 rounded bg-elevated hover:bg-border text-[11px] flex items-center space-x-1 flex-shrink-0"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Copy</span>
                  </button>
                </div>

                <div className="space-y-2">
                  <label className="font-semibold text-foreground block">5. Upload downloaded client_secret.json</label>
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={(e) => setYtFile(e.target.files?.[0] || null)}
                    className="w-full p-3 rounded-lg bg-elevated border border-dashed border-border text-xs text-muted file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-primary/20 file:text-primary file:font-semibold"
                    required
                  />
                </div>

                <div className="flex items-center justify-end space-x-2 pt-3 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setWizardPlatform(null)}
                    className="px-4 py-2 rounded-lg bg-elevated text-foreground font-medium"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    disabled={!ytFile || savingYt}
                    className="px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover disabled:opacity-50 text-white font-semibold flex items-center space-x-1.5"
                  >
                    <UploadCloud className="w-3.5 h-3.5" />
                    <span>{savingYt ? 'Validating...' : 'Validate & Save Credentials'}</span>
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleSaveIgCreds} className="space-y-4 text-xs">
                <ol className="space-y-2 text-muted list-decimal list-inside">
                  <li>Switch your Instagram account to a <strong className="text-foreground">Professional (Creator or Business)</strong> account.</li>
                  <li>
                    Open{' '}
                    <a
                      href="https://developers.facebook.com/apps/"
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline inline-flex items-center space-x-1"
                    >
                      <span>Meta for Developers</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>{' '}
                    and create an app using <strong className="text-foreground">Instagram API with Instagram Login</strong> (no Facebook Page required).
                  </li>
                  <li>Register this exact OAuth Redirect URI:</li>
                </ol>

                <div className="flex items-center justify-between p-2.5 rounded-lg bg-background border border-border font-mono text-[11px] text-foreground">
                  <span className="truncate">{igCred?.expected_callback_url || `${window.location.origin}/api/v1/accounts/instagram/callback`}</span>
                  <button
                    type="button"
                    onClick={() =>
                      handleCopy(
                        igCred?.expected_callback_url || `${window.location.origin}/api/v1/accounts/instagram/callback`,
                        'Callback URL'
                      )
                    }
                    className="ml-2 px-2 py-1 rounded bg-elevated hover:bg-border text-[11px] flex items-center space-x-1 flex-shrink-0"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Copy</span>
                  </button>
                </div>

                <div>
                  <label className="font-semibold text-foreground block mb-1">Integration Mode</label>
                  <select
                    value={igLoginMode}
                    onChange={(e) => setIgLoginMode(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
                  >
                    <option value="instagram_login">Instagram API with Instagram Login (Recommended — No FB Page)</option>
                    <option value="facebook_login">Facebook Login for Business (Legacy Page-Linked)</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold text-foreground block mb-1">Instagram App ID</label>
                    <input
                      type="text"
                      value={igAppId}
                      onChange={(e) => setIgAppId(e.target.value)}
                      placeholder="Numeric App ID"
                      className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
                      required
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-foreground block mb-1">Instagram App Secret</label>
                    <input
                      type="password"
                      value={igAppSecret}
                      onChange={(e) => setIgAppSecret(e.target.value)}
                      placeholder="App Secret (encrypted on save)"
                      className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
                      required
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end space-x-2 pt-3 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setWizardPlatform(null)}
                    className="px-4 py-2 rounded-lg bg-elevated text-foreground font-medium"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    disabled={savingIg}
                    className="px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover disabled:opacity-50 text-white font-semibold"
                  >
                    {savingIg ? 'Encrypting...' : 'Save App Credentials'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
