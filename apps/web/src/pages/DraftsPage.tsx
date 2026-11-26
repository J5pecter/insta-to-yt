import React, { useState, useEffect } from 'react';
import { Layers, CheckCircle2, FileEdit, Clock, Film, Trash2, ArrowUpRight } from 'lucide-react';
import { api } from '../services/api';
import { useFeedback } from '../components/Feedback';

interface DraftsPageProps {
  onNavigate: (tab: string, meta?: any) => void;
}

export const DraftsPage: React.FC<DraftsPageProps> = ({ onNavigate }) => {
  const { notify } = useFeedback();
  const [drafts, setDrafts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  const loadDrafts = async () => {
    setLoading(true);
    try {
      const res = await api.listDrafts(filter === 'all' ? undefined : filter);
      setDrafts(res.items || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDrafts();
  }, [filter]);

  const handleApprove = async (id: number) => {
    try {
      await api.approveDraft(id);
      loadDrafts();
    } catch (err: any) {
      notify(`Approval failed: ${err.message}`, 'error');
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Drafts Manager</h1>
          <p className="text-sm text-muted">Review, approve, and stage prepared video drafts before publication.</p>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center space-x-1.5 bg-surface p-1 rounded-xl border border-border text-xs font-semibold">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              filter === 'all' ? 'bg-primary text-white' : 'text-muted hover:text-foreground'
            }`}
          >
            All Drafts
          </button>
          <button
            onClick={() => setFilter('draft')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              filter === 'draft' ? 'bg-primary text-white' : 'text-muted hover:text-foreground'
            }`}
          >
            In Review
          </button>
          <button
            onClick={() => setFilter('approved')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              filter === 'approved' ? 'bg-primary text-white' : 'text-muted hover:text-foreground'
            }`}
          >
            Approved
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
        </div>
      ) : drafts.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-surface border border-dashed border-border space-y-3">
          <Layers className="w-12 h-12 text-muted mx-auto" />
          <p className="text-foreground font-semibold">No drafts in this view</p>
          <p className="text-xs text-muted max-w-sm mx-auto">
            Import an authorized video to automatically create a content draft with platform-tailored metadata.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {drafts.map((d) => (
            <div
              key={d.id}
              className="p-5 rounded-2xl bg-surface border border-border flex flex-col justify-between space-y-4 hover:border-primary/50 transition-colors"
            >
              <div className="flex items-start space-x-3.5">
                <div className="w-16 h-24 rounded-xl bg-black overflow-hidden flex-shrink-0 border border-border relative">
                  {d.thumbnail_url ? (
                    <img src={d.thumbnail_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Film className="w-6 h-6 text-muted" />
                    </div>
                  )}
                  {d.duration && (
                    <span className="absolute bottom-1 right-1 px-1 rounded text-[9px] bg-black/80 text-white font-mono">
                      {d.duration}s
                    </span>
                  )}
                </div>

                <div className="flex-1 overflow-hidden space-y-1">
                  <span className="text-xs font-bold text-foreground line-clamp-2 block">{d.title}</span>
                  <p className="text-[11px] text-muted line-clamp-2">{d.caption || 'No caption'}</p>
                  <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                    d.approval_status === 'approved' ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'
                  }`}>
                    {d.approval_status}
                  </span>
                </div>
              </div>

              <div className="pt-3 border-t border-border flex items-center justify-between">
                <span className="text-[10px] text-muted">
                  Updated {new Date(d.updated_at).toLocaleDateString()}
                </span>
                <div className="flex items-center space-x-2">
                  {d.approval_status !== 'approved' && (
                    <button
                      onClick={() => handleApprove(d.id)}
                      className="px-2.5 py-1 rounded-lg bg-success/20 text-success border border-success/30 text-xs font-semibold hover:bg-success/30"
                    >
                      Approve
                    </button>
                  )}
                  <button
                    onClick={() => onNavigate('studio', { draftId: d.id })}
                    className="px-3 py-1 rounded-lg bg-primary text-white text-xs font-semibold flex items-center space-x-1 hover:bg-primary-hover"
                  >
                    <span>Edit</span>
                    <ArrowUpRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
