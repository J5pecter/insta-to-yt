import React, { useState, useEffect, useRef } from 'react';
import {
  Zap,
  Link2,
  Clipboard,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Loader2,
  Send,
  ExternalLink,
  Copy,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  ArrowRight,
  Video,
  Camera,
  ShieldCheck,
} from 'lucide-react';
import { api, resolveMediaUrl } from '../services/api';
import { useFeedback } from '../components/Feedback';

interface QuickPublishPageProps {
  readiness: any;
  onNavigate: (tab: string, meta?: any) => void;
  onRefreshReadiness: () => void;
}

export const QuickPublishPage: React.FC<QuickPublishPageProps> = ({
  readiness,
  onNavigate,
  onRefreshReadiness,
}) => {
  const { notify } = useFeedback();

  // Mode: 'input' | 'prepared' | 'progress' | 'result'
  const [stage, setStage] = useState<'input' | 'prepared' | 'progress' | 'result'>('input');

  // Input state
  const [url, setUrl] = useState('');
  const [rightsConfirmed, setRightsConfirmed] = useState(true);
  const [preparing, setPreparing] = useState(false);
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const [showFileFallback, setShowFileFallback] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const lastPreparedUrlRef = useRef<string>('');

  // Prepared draft state
  const [prepared, setPrepared] = useState<any>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [privacy, setPrivacy] = useState<'private' | 'unlisted' | 'public'>('private');
  const [madeForKids, setMadeForKids] = useState(false);
  const [syntheticContent, setSyntheticContent] = useState(false);
  const [selectedAccountIds, setSelectedAccountIds] = useState<number[]>([]);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Progress / Result state
  const [intentId, setIntentId] = useState<number | null>(null);
  const [progress, setProgress] = useState<any>(null);
  const [logsOpen, setLogsOpen] = useState(false);

  // Today's activity
  const [stats, setStats] = useState({ published: 0, queued: 0, failed: 0 });

  useEffect(() => {
    api.getDashboard().then((d) => {
      setStats({
        published: d.total_published || 0,
        queued: (d.scheduled_count || 0) + (d.active_jobs || 0),
        failed: d.failed_jobs || 0,
      });
    }).catch(() => {});
  }, [stage]);

  // Connected accounts from readiness
  const allAccounts = [
    ...(readiness?.youtube?.accounts || []),
    ...(readiness?.instagram?.accounts || []),
  ];

  useEffect(() => {
    if (allAccounts.length > 0 && selectedAccountIds.length === 0) {
      setSelectedAccountIds(allAccounts.map((a: any) => a.id));
    }
  }, [readiness]);

  // Debounced auto-prepare when a valid Instagram URL is pasted
  useEffect(() => {
    const trimmed = url.trim();
    const isIgUrl = /^https?:\/\/(www\.)?instagram\.com\/(reel|reels|p|tv)\/[A-Za-z0-9_-]+/i.test(trimmed);
    if (!isIgUrl || trimmed === lastPreparedUrlRef.current || stage !== 'input' || preparing) {
      return;
    }
    const timer = setTimeout(() => {
      handlePrepareUrl(trimmed);
    }, 650);
    return () => clearTimeout(timer);
  }, [url, stage]);

  // Poll progress when in progress stage
  useEffect(() => {
    if (stage !== 'progress' || !intentId) return;
    let active = true;
    const poll = async () => {
      try {
        const res = await api.getQuickPublishProgress(intentId);
        if (!active) return;
        setProgress(res);
        if (['published', 'partial_success', 'failed', 'scheduled'].includes(res.status)) {
          setStage('result');
        }
      } catch (e) {
        console.error(e);
      }
    };
    poll();
    const interval = setInterval(poll, 2000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [stage, intentId]);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text.trim());
        notify('Pasted URL from clipboard', 'info');
      }
    } catch {
      notify('Clipboard access blocked by browser — paste manually with Ctrl+V.', 'warning');
    }
  };

  const handlePrepareUrl = async (targetUrl?: string) => {
    const u = (targetUrl ?? url).trim();
    if (!u) return;
    lastPreparedUrlRef.current = u;
    setPreparing(true);
    setPrepareError(null);
    try {
      const res = await api.quickPrepare(u, rightsConfirmed);
      setPrepared(res);
      setTitle(res.title || '');
      setDescription(res.description || res.original_caption || '');
      if (res.preset_applied) {
        setPrivacy(res.preset_applied.visibility || 'private');
        setMadeForKids(Boolean(res.preset_applied.made_for_kids));
        setSyntheticContent(Boolean(res.preset_applied.synthetic_content));
      }
      setStage('prepared');
      notify('Video imported and metadata prepared automatically.', 'success');
    } catch (err: any) {
      setPrepareError(err.message || 'Automatic URL import failed.');
      setShowFileFallback(true);
    } finally {
      setPreparing(false);
    }
  };

  const handleFileUploadPrepare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;
    setPreparing(true);
    setPrepareError(null);
    try {
      const fd = new FormData();
      fd.append('file', selectedFile);
      fd.append('rights_confirmed', String(rightsConfirmed));
      const res = await api.importFile(fd);
      const draft = await api.getDraft(res.draft_id);
      setPrepared({
        draft_id: draft.id,
        media_asset_id: draft.media_asset_id,
        title: draft.title,
        description: draft.description,
        thumbnail_url: `/api/v1/media/${draft.media_asset_id}/thumbnail`,
        duration: draft.asset?.duration || 0,
        width: draft.asset?.width || 1080,
        height: draft.asset?.height || 1920,
      });
      setTitle(draft.title || '');
      setDescription(draft.description || '');
      setStage('prepared');
      notify('Authorized video file imported and prepared.', 'success');
    } catch (err: any) {
      setPrepareError(err.message || 'File upload failed.');
    } finally {
      setPreparing(false);
    }
  };

  const handlePublish = async () => {
    if (!prepared?.draft_id) return;
    if (selectedAccountIds.length === 0) {
      notify('Connect or select at least one destination account before publishing.', 'warning');
      return;
    }
    setPublishing(true);
    try {
      const res = await api.quickPublish({
        draft_id: prepared.draft_id,
        account_ids: selectedAccountIds,
        title: title.trim() || 'Untitled Video',
        description,
        caption: description,
        hashtags: prepared.hashtags || [],
        privacy,
        made_for_kids: madeForKids,
        synthetic_content: syntheticContent,
        rights_confirmed: rightsConfirmed,
      });
      setIntentId(res.intent_id);
      setStage('progress');
      onRefreshReadiness();
    } catch (err: any) {
      notify(err.message || 'Publishing dispatch failed.', 'error');
    } finally {
      setPublishing(false);
    }
  };

  const handleReset = () => {
    setStage('input');
    setUrl('');
    lastPreparedUrlRef.current = '';
    setPrepared(null);
    setProgress(null);
    setIntentId(null);
    setPrepareError(null);
    setSelectedFile(null);
  };

  const toggleAccount = (id: number) => {
    setSelectedAccountIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-6">
      {/* Global Readiness Banner if setup needed */}
      {readiness && !readiness.ready && (
        <div className="p-4 rounded-xl bg-warning/10 border border-warning/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-foreground">{readiness.label}</p>
              <p className="text-xs text-muted">
                {readiness.guidance?.[0]?.action || 'Complete one-time OAuth account setup to enable automatic publishing.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('accounts')}
            className="px-3.5 py-2 rounded-lg bg-warning text-black font-semibold text-xs flex items-center space-x-1.5 self-start sm:self-center flex-shrink-0"
          >
            <span>Open Setup Wizard</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* STAGE 1: URL INPUT */}
      {stage === 'input' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 p-6 rounded-xl bg-surface border border-border space-y-5">
            <div>
              <h1 className="text-xl font-bold text-foreground">Quick Publish</h1>
              <p className="text-xs text-muted mt-1">
                One video. Multiple platforms. Paste an authorized Instagram Reel URL to auto-prepare and publish.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground block">Instagram video link</label>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Link2 className="w-4 h-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://www.instagram.com/reel/..."
                    className="w-full pl-10 pr-3 py-2.5 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:border-primary"
                  />
                </div>
                <button
                  type="button"
                  onClick={handlePaste}
                  className="px-3.5 py-2.5 rounded-lg bg-elevated border border-border text-xs font-medium text-foreground hover:border-primary flex items-center justify-center space-x-1.5"
                >
                  <Clipboard className="w-3.5 h-3.5" />
                  <span>Paste</span>
                </button>
              </div>
            </div>

            {/* Destination Pills */}
            <div className="space-y-2">
              <span className="text-xs font-medium text-muted block">Publishing destinations</span>
              {allAccounts.length === 0 ? (
                <div className="p-3 rounded-lg bg-elevated border border-dashed border-border text-xs text-muted flex items-center justify-between">
                  <span>No destination accounts connected yet.</span>
                  <button
                    type="button"
                    onClick={() => onNavigate('accounts')}
                    className="text-primary font-semibold hover:underline"
                  >
                    Connect Accounts
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {allAccounts.map((acc: any) => {
                    const selected = selectedAccountIds.includes(acc.id);
                    return (
                      <button
                        key={acc.id}
                        type="button"
                        onClick={() => toggleAccount(acc.id)}
                        className={`p-3 rounded-lg border text-left flex items-center justify-between transition-colors ${
                          selected
                            ? 'bg-elevated border-primary/50 text-foreground'
                            : 'bg-background border-border text-muted'
                        }`}
                      >
                        <div className="flex items-center space-x-2.5 min-w-0">
                          {acc.platform === 'youtube' ? (
                            <Video className="w-4 h-4 text-red-400 flex-shrink-0" />
                          ) : (
                            <Camera className="w-4 h-4 text-pink-400 flex-shrink-0" />
                          )}
                          <div className="min-w-0">
                            <span className="text-xs font-semibold block truncate">{acc.account_name}</span>
                            <span className="text-[10px] text-muted capitalize">{acc.platform}</span>
                          </div>
                        </div>
                        <CheckCircle2 className={`w-4 h-4 flex-shrink-0 ${selected ? 'text-success' : 'text-border'}`} />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <label className="flex items-center space-x-2 text-xs text-muted cursor-pointer">
              <input
                type="checkbox"
                checked={rightsConfirmed}
                onChange={(e) => setRightsConfirmed(e.target.checked)}
                className="rounded border-border bg-background text-primary focus:ring-primary"
              />
              <span>I own or have creator authorization to publish this video.</span>
            </label>

            {prepareError && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-xs text-destructive flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{prepareError}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                disabled={preparing || !url.trim()}
                onClick={() => handlePrepareUrl()}
                className="flex-1 sm:flex-none px-6 py-2.5 rounded-lg bg-primary hover:bg-primary-hover disabled:opacity-50 text-white text-sm font-semibold flex items-center justify-center space-x-2"
              >
                {preparing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                <span>{preparing ? 'Preparing video & metadata...' : 'Prepare & Review'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowFileFallback(!showFileFallback)}
                className="px-3.5 py-2.5 rounded-lg bg-elevated border border-border text-xs font-medium text-muted hover:text-foreground"
              >
                {showFileFallback ? 'Hide file upload' : 'Upload local MP4 instead'}
              </button>
            </div>

            {showFileFallback && (
              <form onSubmit={handleFileUploadPrepare} className="p-4 rounded-lg bg-elevated border border-border space-y-3">
                <span className="text-xs font-semibold text-foreground block">Authorized Local Video Fallback</span>
                <input
                  type="file"
                  accept="video/mp4,video/quicktime"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="text-xs text-muted file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-primary/20 file:text-primary file:font-semibold"
                />
                <button
                  type="submit"
                  disabled={!selectedFile || preparing}
                  className="px-4 py-2 rounded-lg bg-primary text-white text-xs font-semibold disabled:opacity-50 flex items-center space-x-1.5"
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>Upload & Prepare</span>
                </button>
              </form>
            )}
          </div>

          {/* Right column: Today's Activity */}
          <div className="space-y-4">
            <div className="p-5 rounded-xl bg-surface border border-border space-y-4">
              <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">Today's Activity</h2>
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-elevated border border-border">
                  <span className="text-[11px] text-muted block">Published</span>
                  <span className="text-xl font-bold text-success">{stats.published}</span>
                </div>
                <div className="p-3 rounded-lg bg-elevated border border-border">
                  <span className="text-[11px] text-muted block">Queued</span>
                  <span className="text-xl font-bold text-primary">{stats.queued}</span>
                </div>
                <div className="p-3 rounded-lg bg-elevated border border-border">
                  <span className="text-[11px] text-muted block">Failed</span>
                  <span className="text-xl font-bold text-foreground">{stats.failed}</span>
                </div>
              </div>
              <p className="text-xs text-muted leading-relaxed">
                Automatic processing converts videos to 1080×1920 vertical MP4, extracts captions, and applies your default publishing preset.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* STAGE 2: PREPARED REVIEW & ONE-CLICK PUBLISH */}
      {stage === 'prepared' && prepared && (
        <div className="p-6 rounded-xl bg-surface border border-border space-y-6">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div>
              <h2 className="text-lg font-bold text-foreground">Review & Publish</h2>
              <p className="text-xs text-muted">Prepared automatically using your default preset.</p>
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="text-xs text-muted hover:text-foreground"
            >
              Start over
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[35%_minmax(0,1fr)] gap-6 items-start">
            {/* Video Preview */}
            <div className="space-y-3">
              <div className="aspect-[9/16] max-h-[420px] mx-auto rounded-xl overflow-hidden bg-background border border-border flex items-center justify-center relative">
                {prepared.video_url ? (
                  <video
                    src={resolveMediaUrl(prepared.video_url)}
                    poster={resolveMediaUrl(prepared.thumbnail_url)}
                    controls
                    className="w-full h-full object-contain"
                  />
                ) : prepared.thumbnail_url ? (
                  <img src={resolveMediaUrl(prepared.thumbnail_url)} alt="Video preview" className="w-full h-full object-cover" />
                ) : null}
              </div>
              <div className="text-center text-xs text-muted">
                {prepared.width || 1080} × {prepared.height || 1920} · {Math.round(prepared.duration || 0)}s
              </div>
            </div>

            {/* Metadata & Publish Controls */}
            <div className="space-y-4 min-w-0">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <label className="font-medium text-foreground">Title (YouTube Shorts)</label>
                  <span className={title.length > 100 ? 'text-destructive' : 'text-muted'}>{title.length}/100</span>
                </div>
                <input
                  type="text"
                  maxLength={100}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-foreground block mb-1">Caption & Description</label>
                <textarea
                  rows={5}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-foreground block mb-1">Visibility</label>
                  <select
                    value={privacy}
                    onChange={(e) => setPrivacy(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground"
                  >
                    <option value="private">Private (Recommended for first test)</option>
                    <option value="unlisted">Unlisted</option>
                    <option value="public">Public</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-foreground block mb-1">Destinations</label>
                  <div className="flex flex-wrap gap-2">
                    {allAccounts.map((acc: any) => {
                      const active = selectedAccountIds.includes(acc.id);
                      return (
                        <button
                          key={acc.id}
                          type="button"
                          onClick={() => toggleAccount(acc.id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
                            active
                              ? 'bg-primary/15 border-primary/40 text-primary'
                              : 'bg-background border-border text-muted'
                          }`}
                        >
                          {acc.account_name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Expandable Advanced Options */}
              <button
                type="button"
                onClick={() => setAdvancedOpen(!advancedOpen)}
                className="flex items-center space-x-1.5 text-xs text-muted hover:text-foreground"
              >
                {advancedOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                <span>Advanced compliance & disclosures</span>
              </button>

              {advancedOpen && (
                <div className="p-4 rounded-lg bg-elevated border border-border space-y-2.5 text-xs">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={madeForKids}
                      onChange={(e) => setMadeForKids(e.target.checked)}
                    />
                    <span className="text-foreground">Made for Kids (COPPA declaration)</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={syntheticContent}
                      onChange={(e) => setSyntheticContent(e.target.checked)}
                    />
                    <span className="text-foreground">Contains altered or synthetic AI content</span>
                  </label>
                </div>
              )}

              <div className="pt-4 border-t border-border flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => onNavigate('studio', { draftId: prepared.draft_id })}
                  className="px-4 py-2 rounded-lg bg-elevated border border-border text-xs font-medium text-foreground hover:border-primary"
                >
                  Open in Full Studio
                </button>

                <button
                  type="button"
                  disabled={publishing || selectedAccountIds.length === 0}
                  onClick={handlePublish}
                  className="px-6 py-2.5 rounded-lg bg-primary hover:bg-primary-hover disabled:opacity-50 text-white text-sm font-semibold flex items-center space-x-2"
                >
                  {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  <span>Publish to {selectedAccountIds.length} account{selectedAccountIds.length === 1 ? '' : 's'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STAGE 3: STEP-BY-STEP PUBLISHING PROGRESS */}
      {stage === 'progress' && (
        <div className="p-6 rounded-xl bg-surface border border-border space-y-5 max-w-3xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-foreground">Publishing your video</h2>
              <p className="text-xs text-muted mt-0.5">
                You can close the browser. The private background worker continues as long as the host is running.
              </p>
            </div>
            <span className="text-sm font-bold text-primary">{progress?.percent ?? 55}%</span>
          </div>

          <div className="w-full h-2 rounded-full bg-elevated overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${progress?.percent ?? 55}%` }}
            />
          </div>

          <div className="space-y-2">
            {(progress?.steps || []).map((s: any) => (
              <div
                key={s.key}
                className="flex items-center justify-between p-3 rounded-lg bg-elevated border border-border text-xs"
              >
                <span className="font-medium text-foreground">{s.label}</span>
                {s.status === 'complete' && <span className="text-success font-semibold">Complete</span>}
                {s.status === 'processing' && (
                  <span className="text-primary font-semibold flex items-center space-x-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Processing</span>
                  </span>
                )}
                {s.status === 'failed' && <span className="text-destructive font-semibold">Failed</span>}
                {s.status === 'pending' && <span className="text-muted">Pending</span>}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setLogsOpen(!logsOpen)}
            className="text-xs text-muted hover:text-foreground flex items-center space-x-1"
          >
            {logsOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            <span>Technical details</span>
          </button>

          {logsOpen && (
            <pre className="p-3 rounded-lg bg-background border border-border text-[11px] text-muted overflow-x-auto">
              {JSON.stringify(progress, null, 2)}
            </pre>
          )}
        </div>
      )}

      {/* STAGE 4: PUBLISHING RESULT SCREEN */}
      {stage === 'result' && progress && (
        <div className="p-6 rounded-xl bg-surface border border-border space-y-5 max-w-3xl">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div className="flex items-center space-x-3">
              {progress.status === 'published' ? (
                <CheckCircle2 className="w-6 h-6 text-success" />
              ) : progress.status === 'partial_success' ? (
                <AlertTriangle className="w-6 h-6 text-warning" />
              ) : (
                <AlertCircle className="w-6 h-6 text-destructive" />
              )}
              <div>
                <h2 className="text-lg font-bold text-foreground">
                  {progress.status === 'published'
                    ? 'Published successfully'
                    : progress.status === 'partial_success'
                    ? 'Partially published'
                    : 'Publishing requires attention'}
                </h2>
                <p className="text-xs text-muted">{progress.title}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleReset}
              className="px-4 py-2 rounded-lg bg-primary text-white text-xs font-semibold flex items-center space-x-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Publish another video</span>
            </button>
          </div>

          <div className="space-y-3">
            {(progress.targets || []).map((t: any) => (
              <div
                key={t.id}
                className="p-4 rounded-xl bg-elevated border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold text-foreground capitalize">{t.platform}</span>
                    <span className="text-xs text-muted">({t.account_name})</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        t.status === 'published'
                          ? 'bg-success/15 text-success'
                          : 'bg-destructive/15 text-destructive'
                      }`}
                    >
                      {t.status}
                    </span>
                  </div>
                  {t.error_message && <p className="text-xs text-destructive">{t.error_message}</p>}
                  {t.platform_url && <p className="text-xs text-primary truncate">{t.platform_url}</p>}
                </div>

                {t.platform_url && (
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(t.platform_url);
                        notify('Link copied to clipboard', 'success');
                      }}
                      className="px-3 py-1.5 rounded-lg bg-surface border border-border text-xs text-foreground flex items-center space-x-1"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </button>
                    <a
                      href={t.platform_url}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 rounded-lg bg-primary/15 border border-primary/30 text-xs text-primary font-semibold flex items-center space-x-1"
                    >
                      <span>Open</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
