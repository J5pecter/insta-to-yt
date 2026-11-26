import React, { useState, useEffect } from 'react';
import { BarChart3, Download, CheckCircle2, XCircle, Share2, RefreshCw } from 'lucide-react';
import { api } from '../services/api';

export const AnalyticsPage: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const res = await api.getAnalytics();
      setData(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, []);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Analytics & Reports</h1>
          <p className="text-sm text-muted">
            Track actual publication metrics, platform distribution, and export history.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={loadAnalytics}
            className="p-2 rounded-xl bg-surface border border-border text-muted hover:text-foreground"
            title="Refresh Analytics"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <a
            href="/api/v1/analytics/export-csv"
            download
            className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-semibold flex items-center space-x-1.5 shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </a>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
        </div>
      ) : (
        <>
          {/* Top Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl bg-surface border border-border space-y-2">
              <span className="text-xs font-semibold text-muted uppercase tracking-wider">Publishing Success Rate</span>
              <div className="flex items-baseline space-x-2">
                <span className="text-3xl font-extrabold text-success">{data?.success_rate || 100}%</span>
                <span className="text-xs text-muted">reliability</span>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-surface border border-border space-y-2">
              <span className="text-xs font-semibold text-muted uppercase tracking-wider">Total Publications</span>
              <div className="flex items-baseline space-x-2">
                <span className="text-3xl font-extrabold text-foreground">{data?.total_publications || 0}</span>
                <span className="text-xs text-muted">verified live</span>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-surface border border-border space-y-2">
              <span className="text-xs font-semibold text-muted uppercase tracking-wider">Failed Attempts</span>
              <div className="flex items-baseline space-x-2">
                <span className="text-3xl font-extrabold text-destructive">{data?.failed_publications || 0}</span>
                <span className="text-xs text-muted">errors recorded</span>
              </div>
            </div>
          </div>

          {/* Platform Distribution */}
          <div className="p-6 rounded-2xl bg-surface border border-border space-y-4">
            <h2 className="text-xs font-semibold text-foreground uppercase tracking-wider">Distribution By Platform</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-elevated border border-border flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center font-bold text-xs">
                    YT
                  </div>
                  <div>
                    <span className="text-xs font-bold text-foreground block">YouTube Shorts</span>
                    <span className="text-[10px] text-muted block">Direct API v3 Uploads</span>
                  </div>
                </div>
                <span className="text-xl font-bold text-foreground font-mono">{data?.platforms?.youtube || 0}</span>
              </div>

              <div className="p-4 rounded-xl bg-elevated border border-border flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-full bg-pink-500/20 text-pink-400 flex items-center justify-center font-bold text-xs">
                    IG
                  </div>
                  <div>
                    <span className="text-xs font-bold text-foreground block">Instagram Reels</span>
                    <span className="text-[10px] text-muted block">Meta Graph API & Exports</span>
                  </div>
                </div>
                <span className="text-xl font-bold text-foreground font-mono">{data?.platforms?.instagram || 0}</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
