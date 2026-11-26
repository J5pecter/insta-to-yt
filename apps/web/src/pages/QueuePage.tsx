import React, { useState, useEffect } from 'react';
import {
  ListTodo,
  RefreshCw,
  Play,
  XCircle,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  ShieldAlert,
  Clock
} from 'lucide-react';
import { api } from '../services/api';
import { useFeedback } from '../components/Feedback';

export const QueuePage: React.FC = () => {
  const { notify, confirmAction } = useFeedback();
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const loadJobs = async () => {
    try {
      const res = await api.listJobs(statusFilter === 'all' ? undefined : statusFilter, 50);
      setJobs(res.items || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJobs();
    const interval = setInterval(loadJobs, 4000);
    return () => clearInterval(interval);
  }, [statusFilter]);

  const handleRetry = async (id: number) => {
    setActionLoading(id);
    try {
      await api.retryJob(id);
      loadJobs();
    } catch (err: any) {
      notify(`Retry failed: ${err.message}`, 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async (id: number) => {
    const ok = await confirmAction({
      title: 'Cancel queued job?',
      message: 'This job will be stopped and will not publish.',
      confirmLabel: 'Cancel Job',
      destructive: true,
    });
    if (!ok) return;
    setActionLoading(id);
    try {
      await api.cancelJob(id);
      notify('Job cancelled.', 'info');
      loadJobs();
    } catch (err: any) {
      notify(`Cancel failed: ${err.message}`, 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReconcile = async (id: number) => {
    setActionLoading(id);
    try {
      const res = await api.reconcileJob(id);
      notify(`Reconciliation result: ${res.reconciled_state} (${res.message || 'Updated'})`, 'info');
      loadJobs();
    } catch (err: any) {
      notify(`Reconciliation failed: ${err.message}`, 'error');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Processing Queue & History</h1>
          <p className="text-sm text-muted">
            Inspect active background operations, track publishing attempts, and reconcile interrupted jobs.
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center space-x-1.5 bg-surface p-1 rounded-xl border border-border text-xs font-semibold">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              statusFilter === 'all' ? 'bg-primary text-white' : 'text-muted hover:text-foreground'
            }`}
          >
            All Jobs
          </button>
          <button
            onClick={() => setStatusFilter('QUEUED')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              statusFilter === 'QUEUED' ? 'bg-primary text-white' : 'text-muted hover:text-foreground'
            }`}
          >
            Queued
          </button>
          <button
            onClick={() => setStatusFilter('PUBLISHED')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              statusFilter === 'PUBLISHED' ? 'bg-primary text-white' : 'text-muted hover:text-foreground'
            }`}
          >
            Published
          </button>
          <button
            onClick={() => setStatusFilter('FAILED')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              statusFilter === 'FAILED' ? 'bg-primary text-white' : 'text-muted hover:text-foreground'
            }`}
          >
            Failed
          </button>
        </div>
      </div>

      {/* Jobs Table */}
      <div className="p-6 rounded-2xl bg-surface border border-border overflow-hidden">
        {loading && jobs.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-12 text-xs text-muted space-y-1">
            <ListTodo className="w-8 h-8 text-muted mx-auto mb-2" />
            <p>No jobs found for the selected filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border text-muted uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="pb-3 font-semibold">Job ID</th>
                  <th className="pb-3 font-semibold">Type</th>
                  <th className="pb-3 font-semibold">Status</th>
                  <th className="pb-3 font-semibold">Progress</th>
                  <th className="pb-3 font-semibold">Attempts</th>
                  <th className="pb-3 font-semibold">Updated</th>
                  <th className="pb-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {jobs.map((job) => (
                  <tr key={job.id} className="hover:bg-elevated/40 transition-colors">
                    <td className="py-3 font-mono font-medium text-foreground">#{job.id}</td>
                    <td className="py-3 font-mono text-muted">{job.job_type}</td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        job.status === 'PUBLISHED'
                          ? 'bg-success/20 text-success'
                          : job.status === 'FAILED'
                          ? 'bg-destructive/20 text-destructive'
                          : job.status === 'RECONCILIATION_REQUIRED'
                          ? 'bg-warning/20 text-warning font-bold'
                          : 'bg-primary/20 text-primary'
                      }`}>
                        {job.status}
                      </span>
                      {job.error_message && (
                        <p className="text-[10px] text-destructive mt-0.5 max-w-xs truncate" title={job.error_message}>
                          {job.error_message}
                        </p>
                      )}
                    </td>
                    <td className="py-3">
                      <div className="w-24 bg-elevated rounded-full h-1.5 overflow-hidden border border-border">
                        <div
                          className="bg-primary h-full rounded-full transition-all duration-300"
                          style={{ width: `${job.progress || 0}%` }}
                        />
                      </div>
                    </td>
                    <td className="py-3 font-mono text-muted">
                      {job.attempts}/{job.max_attempts}
                    </td>
                    <td className="py-3 text-muted text-[11px]">
                      {new Date(job.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end space-x-1.5">
                        {job.status === 'RECONCILIATION_REQUIRED' && (
                          <button
                            onClick={() => handleReconcile(job.id)}
                            disabled={actionLoading === job.id}
                            className="px-2 py-1 rounded bg-warning/20 text-warning border border-warning/40 text-[10px] font-bold hover:bg-warning/30"
                          >
                            Reconcile
                          </button>
                        )}
                        {(job.status === 'FAILED' || job.status === 'RETRY_PENDING') && (
                          <button
                            onClick={() => handleRetry(job.id)}
                            disabled={actionLoading === job.id}
                            className="px-2 py-1 rounded bg-elevated hover:bg-border text-foreground text-[10px] font-medium"
                          >
                            Retry
                          </button>
                        )}
                        {['QUEUED', 'PROCESSING', 'UPLOADING'].includes(job.status) && (
                          <button
                            onClick={() => handleCancel(job.id)}
                            disabled={actionLoading === job.id}
                            className="p-1 rounded text-muted hover:text-destructive hover:bg-destructive/10"
                            title="Cancel Job"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
