import React, { useState, useEffect } from 'react';
import {
  Film,
  CheckCircle2,
  Clock,
  AlertTriangle,
  HardDrive,
  Share2,
  Layers,
  ArrowUpRight,
  RefreshCw,
  PlusCircle,
  ExternalLink,
  Sparkles,
  ChevronRight
} from 'lucide-react';
import { api } from '../services/api';
import { DashboardMetrics } from '../types';

interface DashboardPageProps {
  onNavigate: (tab: string, meta?: any) => void;
  onOpenQuickImport: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate, onOpenQuickImport }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [quickUrl, setQuickUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [accounts, setAccounts] = useState<any[]>([]);

  const loadData = async () => {
    try {
      const res = await api.getDashboard();
      setData(res);
      const accRes = await api.listAccounts();
      setAccounts(accRes || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleQuickImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickUrl.trim()) return;
    setImporting(true);
    setImportResult(null);
    try {
      const res = await api.importUrl(quickUrl.trim(), true);
      setImportResult({ success: true, data: res });
      setQuickUrl('');
      loadData();
    } catch (err: any) {
      setImportResult({ success: false, error: err.message });
    } finally {
      setImporting(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const m: DashboardMetrics = data?.metrics || {
    total_imported: 0,
    total_published: 0,
    pending_drafts: 0,
    scheduled_count: 0,
    active_jobs: 0,
    failed_jobs: 0,
    connected_accounts: 0,
    storage_free_mb: 0,
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Banner & Quick Import */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-surface to-elevated border border-border flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold text-foreground">Content Operations</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/20 text-primary border border-primary/30">
              Live Hub
            </span>
          </div>
          <p className="text-sm text-muted">
            Manage your cross-publishing pipelines, video optimizations, and distribution across YouTube and Instagram.
          </p>
        </div>

        {/* Inline Quick Import Form */}
        <form onSubmit={handleQuickImport} className="w-full lg:w-auto flex-1 max-w-xl">
          <div className="flex items-center space-x-2 p-1.5 rounded-xl bg-background border border-border focus-within:border-primary transition-colors">
            <input
              type="url"
              placeholder="Paste authorized Instagram Reel URL..."
              value={quickUrl}
              onChange={(e) => setQuickUrl(e.target.value)}
              className="flex-1 bg-transparent px-3 py-1.5 text-sm text-foreground placeholder:text-muted focus:outline-none"
              disabled={importing}
            />
            <button
              type="submit"
              disabled={importing || !quickUrl.trim()}
              className="flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-xs font-medium transition-all disabled:opacity-50"
            >
              {importing ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Importing...</span>
                </>
              ) : (
                <>
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Import</span>
                </>
              )}
            </button>
          </div>
          {importResult && (
            <div className={`mt-2 p-2.5 rounded-lg text-xs flex items-center justify-between ${
              importResult.success ? 'bg-success/10 text-success border border-success/30' : 'bg-destructive/10 text-destructive border border-destructive/30'
            }`}>
              <span>{importResult.success ? `Imported! ${importResult.data.title || 'Ready in drafts'}` : importResult.error}</span>
              {importResult.success && (
                <button
                  type="button"
                  onClick={() => onNavigate('drafts')}
                  className="underline font-semibold hover:opacity-80"
                >
                  View Draft
                </button>
              )}
            </div>
          )}
        </form>
      </div>

      {/* Primary KPI Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-surface border border-border flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Published</span>
            <CheckCircle2 className="w-4 h-4 text-success" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-foreground">{m.total_published}</span>
            <span className="text-xs text-muted">across channels</span>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-surface border border-border flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Scheduled</span>
            <Clock className="w-4 h-4 text-primary" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-foreground">{m.scheduled_count}</span>
            <span className="text-xs text-muted">in calendar</span>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-surface border border-border flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Pending Drafts</span>
            <Layers className="w-4 h-4 text-warning" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-foreground">{m.pending_drafts}</span>
            <span className="text-xs text-muted">ready for review</span>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-surface border border-border flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Active Queue</span>
            <Film className="w-4 h-4 text-primary" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-foreground">{m.active_jobs}</span>
            <span className="text-xs text-muted">processing</span>
          </div>
        </div>
      </div>

      {/* Channels & Upcoming Schedule Split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Connected Channels Widget */}
        <div className="p-5 rounded-2xl bg-surface border border-border space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Share2 className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Connected Channels</h2>
            </div>
            <button
              onClick={() => onNavigate('accounts')}
              className="text-xs text-primary hover:underline font-medium"
            >
              Manage
            </button>
          </div>

          <div className="space-y-2.5">
            {accounts.length === 0 ? (
              <div className="p-4 rounded-xl bg-elevated border border-dashed border-border text-center space-y-2">
                <p className="text-xs text-muted">No social channels connected yet.</p>
                <button
                  onClick={() => onNavigate('accounts')}
                  className="px-3 py-1.5 rounded-lg bg-primary/20 text-primary border border-primary/40 text-xs font-medium hover:bg-primary/30 transition-colors"
                >
                  Connect YouTube & Instagram
                </button>
              </div>
            ) : (
              accounts.map((acc) => (
                <div
                  key={acc.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-elevated border border-border"
                >
                  <div className="flex items-center space-x-3 overflow-hidden">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs uppercase ${
                      acc.platform === 'youtube' ? 'bg-red-500/20 text-red-400' : 'bg-pink-500/20 text-pink-400'
                    }`}>
                      {acc.platform === 'youtube' ? 'YT' : 'IG'}
                    </div>
                    <div className="flex flex-col truncate">
                      <span className="text-xs font-medium text-foreground truncate">{acc.account_name}</span>
                      <span className="text-[10px] text-muted capitalize">{acc.platform} channel</span>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    acc.connection_status === 'connected'
                      ? 'bg-success/15 text-success'
                      : 'bg-warning/15 text-warning'
                  }`}>
                    {acc.connection_status}
                  </span>
                </div>
              ))
            )}
          </div>

          {/* Storage Snapshot */}
          <div className="pt-2 border-t border-border flex items-center justify-between text-xs text-muted">
            <span className="flex items-center space-x-1.5">
              <HardDrive className="w-3.5 h-3.5 text-primary" />
              <span>Free Storage</span>
            </span>
            <span className="font-semibold text-foreground">{m.storage_free_mb} MB</span>
          </div>
        </div>

        {/* Upcoming Schedule Widget */}
        <div className="lg:col-span-2 p-5 rounded-2xl bg-surface border border-border space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Clock className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Upcoming Schedule</h2>
            </div>
            <button
              onClick={() => onNavigate('calendar')}
              className="text-xs text-primary hover:underline font-medium"
            >
              Open Calendar
            </button>
          </div>

          {data?.upcoming_schedule && data.upcoming_schedule.length > 0 ? (
            <div className="divide-y divide-border">
              {data.upcoming_schedule.map((item: any) => (
                <div key={item.intent_id} className="py-2.5 flex items-center justify-between">
                  <div className="flex items-center space-x-3 overflow-hidden">
                    {item.thumbnail_url ? (
                      <img src={item.thumbnail_url} alt="" className="w-10 h-10 rounded-lg object-cover bg-elevated border border-border" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-elevated border border-border flex items-center justify-center">
                        <Film className="w-4 h-4 text-muted" />
                      </div>
                    )}
                    <div className="flex flex-col truncate">
                      <span className="text-xs font-medium text-foreground truncate">{item.title}</span>
                      <span className="text-[10px] text-muted">
                        {new Date(item.scheduled_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => onNavigate('calendar')}
                    className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-elevated"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-muted space-y-1">
              <p>No content scheduled for publication yet.</p>
              <button
                onClick={() => onNavigate('drafts')}
                className="text-primary hover:underline font-medium"
              >
                Schedule an approved draft →
              </button>
            </div>
          )}
        </div>
      </div>

      {/* System Activity Feed */}
      <div className="p-5 rounded-2xl bg-surface border border-border space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Live System Activity</span>
          <button onClick={loadData} className="p-1 rounded text-muted hover:text-foreground">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="space-y-1.5">
          {data?.recent_activity && data.recent_activity.length > 0 ? (
            data.recent_activity.map((act: any) => (
              <div key={act.id} className="flex items-center justify-between text-xs py-1.5 border-b border-border/40 last:border-0">
                <div className="flex items-center space-x-2">
                  <span className="font-mono text-[10px] text-primary">{act.event_type}</span>
                  <span className="text-muted truncate max-w-md">
                    {act.details?.reason || act.details?.from_state ? `${act.details?.from_state} → ${act.details?.to_state}` : 'System operation executed'}
                  </span>
                </div>
                <span className="text-[10px] text-muted">
                  {new Date(act.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))
          ) : (
            <p className="text-xs text-muted py-2">No recent events recorded.</p>
          )}
        </div>
      </div>
    </div>
  );
};
