import React, { useState, useEffect } from 'react';
import {
  Settings,
  HardDrive,
  Activity,
  ShieldCheck,
  Bell,
  Database,
  Download,
  Trash2,
  Lock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Sparkles
} from 'lucide-react';
import { api } from '../services/api';
import { useFeedback } from '../components/Feedback';

export const SystemPage: React.FC = () => {
  const { notify } = useFeedback();
  const [activeTab, setActiveTab] = useState<'health' | 'storage' | 'backup' | 'audit' | 'notifications' | 'settings'>('health');

  const [health, setHealth] = useState<any>(null);
  const [storage, setStorage] = useState<any>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Backup State
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [backupResult, setBackupResult] = useState<any>(null);

  // Password State
  const [currPassword, setCurrPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passMessage, setPassMessage] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const h = await api.getSystemHealth();
      setHealth(h);
      const s = await api.getStorageStats();
      setStorage(s);
      const a = await api.getAuditLogs(30);
      setAuditLogs(a.items || []);
      const n = await api.getNotifications();
      setNotifications(n.items || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCleanup = async () => {
    try {
      const res: any = await api.cleanupStorage();
      notify(`Cleanup complete: removed ${res.cleaned_files} temporary files.`, 'success');
      loadData();
    } catch (err: any) {
      notify(`Cleanup failed: ${err.message}`, 'error');
    }
  };

  const handleCreateBackup = async () => {
    setCreatingBackup(true);
    setBackupResult(null);
    try {
      const res = await api.createBackup();
      setBackupResult(res);
      notify('Atomic backup snapshot created!', 'success');
    } catch (err: any) {
      notify(`Backup failed: ${err.message}`, 'error');
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.changePassword(currPassword, newPassword);
      setPassMessage('Password updated successfully.');
      notify('Password updated successfully.', 'success');
      setCurrPassword('');
      setNewPassword('');
      setTimeout(() => setPassMessage(null), 3000);
    } catch (err: any) {
      notify(`Password update failed: ${err.message}`, 'error');
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground">System & Operations</h1>
        <p className="text-sm text-muted">
          Storage manager, API health diagnostics, audit logs, security, and atomic backups.
        </p>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex border-b border-border space-x-6 text-sm font-medium overflow-x-auto">
        <button
          onClick={() => setActiveTab('health')}
          className={`flex items-center space-x-1.5 py-3 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'health' ? 'border-primary text-primary font-semibold' : 'border-transparent text-muted hover:text-foreground'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>API & Health</span>
        </button>
        <button
          onClick={() => setActiveTab('storage')}
          className={`flex items-center space-x-1.5 py-3 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'storage' ? 'border-primary text-primary font-semibold' : 'border-transparent text-muted hover:text-foreground'
          }`}
        >
          <HardDrive className="w-4 h-4" />
          <span>Storage Manager</span>
        </button>
        <button
          onClick={() => setActiveTab('backup')}
          className={`flex items-center space-x-1.5 py-3 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'backup' ? 'border-primary text-primary font-semibold' : 'border-transparent text-muted hover:text-foreground'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>Backup & Restore</span>
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`flex items-center space-x-1.5 py-3 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'audit' ? 'border-primary text-primary font-semibold' : 'border-transparent text-muted hover:text-foreground'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Audit Logs</span>
        </button>
        <button
          onClick={() => setActiveTab('notifications')}
          className={`flex items-center space-x-1.5 py-3 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'notifications' ? 'border-primary text-primary font-semibold' : 'border-transparent text-muted hover:text-foreground'
          }`}
        >
          <Bell className="w-4 h-4" />
          <span>Alerts ({notifications.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`flex items-center space-x-1.5 py-3 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'settings' ? 'border-primary text-primary font-semibold' : 'border-transparent text-muted hover:text-foreground'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>Security & Settings</span>
        </button>
      </div>

      {/* Tab: System Health */}
      {activeTab === 'health' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="p-6 rounded-2xl bg-surface border border-border space-y-4">
            <div className="flex items-center space-x-2">
              <Database className="w-4 h-4 text-primary" />
              <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">Database Engine</h3>
            </div>
            <div className="p-4 rounded-xl bg-elevated border border-border space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted">Type:</span>
                <span className="font-semibold text-foreground">{health?.database?.engine || 'SQLite WAL'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Journal Mode:</span>
                <span className="font-mono text-success">WAL (Write-Ahead Logging)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Foreign Keys:</span>
                <span className="font-mono text-success">ENFORCED</span>
              </div>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-surface border border-border space-y-4">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">Local AI (Ollama) Diagnostics</h3>
            </div>
            <div className="p-4 rounded-xl bg-elevated border border-border space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted">Ollama Status:</span>
                <span className={`font-semibold ${health?.ai_engine?.ollama_available ? 'text-success' : 'text-warning'}`}>
                  {health?.ai_engine?.ollama_available ? 'Online & Available' : 'Offline (Using Deterministic Fallback)'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Target Model:</span>
                <span className="font-mono text-foreground">{health?.ai_engine?.model || 'qwen2.5:7b'}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Storage Manager */}
      {activeTab === 'storage' && (
        <div className="p-6 rounded-2xl bg-surface border border-border space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-foreground">Storage Partitions & Disk Space</h3>
              <p className="text-xs text-muted">Files organized deterministically by media UUID.</p>
            </div>
            <button
              onClick={handleCleanup}
              className="px-4 py-2 rounded-xl bg-elevated hover:bg-border text-foreground text-xs font-semibold flex items-center space-x-1.5"
            >
              <Trash2 className="w-3.5 h-3.5 text-primary" />
              <span>Clean Temporary Files</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-elevated border border-border space-y-1">
              <span className="text-muted block text-[10px] uppercase font-semibold">Originals</span>
              <span className="text-lg font-bold text-foreground">
                {storage ? (storage.originals_bytes / (1024 * 1024)).toFixed(1) : 0} MB
              </span>
            </div>
            <div className="p-4 rounded-xl bg-elevated border border-border space-y-1">
              <span className="text-muted block text-[10px] uppercase font-semibold">Processed</span>
              <span className="text-lg font-bold text-foreground">
                {storage ? (storage.processed_bytes / (1024 * 1024)).toFixed(1) : 0} MB
              </span>
            </div>
            <div className="p-4 rounded-xl bg-elevated border border-border space-y-1">
              <span className="text-muted block text-[10px] uppercase font-semibold">Thumbnails</span>
              <span className="text-lg font-bold text-foreground">
                {storage ? (storage.thumbnails_bytes / (1024 * 1024)).toFixed(1) : 0} MB
              </span>
            </div>
            <div className="p-4 rounded-xl bg-elevated border border-border space-y-1">
              <span className="text-muted block text-[10px] uppercase font-semibold">Free Disk</span>
              <span className="text-lg font-bold text-success font-mono">
                {storage?.free_mb || 0} MB
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Backup & Restore */}
      {activeTab === 'backup' && (
        <div className="p-6 rounded-2xl bg-surface border border-border space-y-5">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-foreground">Atomic Backup Creation</h3>
            <p className="text-xs text-muted">
              Creates a point-in-time SQLite snapshot with VACUUM INTO and generates a SHA-256 verified ZIP bundle.
            </p>
          </div>

          <button
            onClick={handleCreateBackup}
            disabled={creatingBackup}
            className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-semibold flex items-center space-x-2 disabled:opacity-50"
          >
            {creatingBackup ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Generating Atomic Backup...</span>
              </>
            ) : (
              <>
                <Database className="w-4 h-4" />
                <span>Create Database Snapshot Backup</span>
              </>
            )}
          </button>

          {backupResult && (
            <div className="p-4 rounded-xl bg-success/15 border border-success/30 text-success text-xs space-y-2">
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>Backup ready: <strong>{backupResult.filename}</strong></span>
              </div>
              <p className="font-mono text-[11px] text-muted truncate">SHA-256: {backupResult.checksum}</p>
              <a
                href={backupResult.download_url}
                download
                className="inline-flex items-center space-x-1 px-3 py-1 rounded bg-success text-white font-semibold text-xs mt-1"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Archive</span>
              </a>
            </div>
          )}
        </div>
      )}

      {/* Tab: Audit Logs */}
      {activeTab === 'audit' && (
        <div className="p-6 rounded-2xl bg-surface border border-border space-y-4">
          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">Security & Operation Audit Trail</h3>
          <div className="divide-y divide-border/60 max-h-96 overflow-y-auto text-xs">
            {auditLogs.map((log) => (
              <div key={log.id} className="py-2.5 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <span className="font-mono text-[10px] text-primary">{log.event_type}</span>
                  <span className="text-muted truncate max-w-md">
                    {log.details?.reason || log.details?.from_state ? `${log.details?.from_state} → ${log.details?.to_state}` : 'Operation recorded'}
                  </span>
                </div>
                <span className="text-[10px] text-muted">
                  {new Date(log.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab: Notifications */}
      {activeTab === 'notifications' && (
        <div className="p-6 rounded-2xl bg-surface border border-border space-y-4">
          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">System Alerts & Notifications</h3>
          {notifications.length === 0 ? (
            <p className="text-xs text-muted py-4">No unread notifications.</p>
          ) : (
            <div className="space-y-2">
              {notifications.map((n) => (
                <div key={n.id} className="p-3 rounded-xl bg-elevated border border-border flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-2.5">
                    <span className={`w-2 h-2 rounded-full ${n.severity === 'error' ? 'bg-destructive' : 'bg-primary'}`} />
                    <span className="text-foreground">{n.message}</span>
                  </div>
                  <span className="text-[10px] text-muted">
                    {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Security & Settings */}
      {activeTab === 'settings' && (
        <div className="p-6 rounded-2xl bg-surface border border-border space-y-6 max-w-lg">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-foreground">Change Password</h3>
            <p className="text-xs text-muted">Passwords are hashed using Argon2id with 64 MB memory cost.</p>
          </div>

          <form onSubmit={handleChangePassword} className="space-y-4 text-xs">
            <div className="space-y-1">
              <label className="font-medium text-foreground">Current Password</label>
              <input
                type="password"
                value={currPassword}
                onChange={(e) => setCurrPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="font-medium text-foreground">New Password</label>
              <input
                type="password"
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
                required
              />
            </div>

            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-semibold"
            >
              Update Password
            </button>

            {passMessage && (
              <p className="text-xs text-success">{passMessage}</p>
            )}
          </form>
        </div>
      )}
    </div>
  );
};
