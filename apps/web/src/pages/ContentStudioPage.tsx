import React, { useState, useEffect } from 'react';
import {
  FileEdit,
  Sparkles,
  Share2,
  Calendar,
  Send,
  Download,
  CheckCircle2,
  AlertCircle,
  Copy,
  Hash,
  Eye,
  Sliders,
  Film
} from 'lucide-react';
import { api } from '../services/api';
import { useFeedback } from '../components/Feedback';

interface ContentStudioPageProps {
  initialDraftId?: number;
  onNavigate: (tab: string, meta?: any) => void;
}

export const ContentStudioPage: React.FC<ContentStudioPageProps> = ({ initialDraftId, onNavigate }) => {
  const { notify } = useFeedback();
  const [drafts, setDrafts] = useState<any[]>([]);
  const [selectedDraftId, setSelectedDraftId] = useState<number | null>(initialDraftId || null);
  const [draft, setDraft] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Form Fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');

  // Destination & Settings
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<number[]>([]);
  const [privacy, setPrivacy] = useState<'private' | 'unlisted' | 'public'>('private');
  const [madeForKids, setMadeForKids] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('18:00');

  // Preview Mode
  const [previewTab, setPreviewTab] = useState<'youtube' | 'instagram'>('youtube');
  const [saving, setSaving] = useState(false);
  const [publishMessage, setPublishMessage] = useState<string | null>(null);

  // Load all drafts and accounts
  useEffect(() => {
    const init = async () => {
      try {
        const dRes = await api.listDrafts();
        setDrafts(dRes.items || []);
        if (!selectedDraftId && dRes.items?.length > 0) {
          setSelectedDraftId(dRes.items[0].id);
        }
        const accRes = await api.listAccounts();
        setAccounts(accRes || []);
        if (accRes?.length > 0) {
          setSelectedAccountIds([accRes[0].id]);
        }
      } catch (e) {
        console.error(e);
      }
    };
    init();
  }, []);

  // Load selected draft details
  useEffect(() => {
    if (!selectedDraftId) return;
    const fetchDraft = async () => {
      setLoading(true);
      try {
        const res = await api.getDraft(selectedDraftId);
        setDraft(res);
        setTitle(res.title || '');
        setDescription(res.description || '');
        setCaption(res.caption || '');
        setHashtags(res.hashtags || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchDraft();
  }, [selectedDraftId]);

  const handleApplyConversion = async (mode: string) => {
    if (!draft) return;
    try {
      const conv = await api.convertMetadata(caption || draft.source?.original_caption || '', mode, draft.source?.attribution);
      setTitle(conv.youtube_title);
      setDescription(conv.youtube_description);
      setHashtags(conv.instagram_hashtags || []);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveDraft = async () => {
    if (!selectedDraftId) return;
    setSaving(true);
    try {
      await api.updateDraft(selectedDraftId, {
        title,
        description,
        caption,
        hashtags,
      });
      setPublishMessage('Draft updated successfully.');
      setTimeout(() => setPublishMessage(null), 3000);
    } catch (err: any) {
      notify(`Save failed: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async (isScheduled = false) => {
    if (!selectedDraftId || selectedAccountIds.length === 0) {
      notify('Please select at least one destination account.', 'warning');
      return;
    }

    setSaving(true);
    let scheduledAt = undefined;
    if (isScheduled && scheduleDate) {
      scheduledAt = new Date(`${scheduleDate}T${scheduleTime}:00Z`);
    }

    try {
      // First save current content changes
      await api.updateDraft(selectedDraftId, { title, description, caption, hashtags });

      // Then create publishing intent
      const res = await api.createPublishingIntent({
        draft_id: selectedDraftId,
        account_ids: selectedAccountIds,
        scheduled_at: scheduledAt,
        privacy,
        made_for_kids: madeForKids,
      });

      setPublishMessage(isScheduled ? 'Content scheduled successfully!' : 'Publishing jobs queued!');
      setTimeout(() => {
        onNavigate(isScheduled ? 'calendar' : 'queue');
      }, 1500);
    } catch (err: any) {
      notify(`Publishing failed: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAddTag = () => {
    if (!newTag.trim()) return;
    const tag = `#${newTag.trim().replace(/^#/, '')}`;
    if (!hashtags.includes(tag)) {
      setHashtags([...hashtags, tag]);
    }
    setNewTag('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setHashtags(hashtags.filter((t) => t !== tagToRemove));
  };

  return (
    <div className="space-y-6 w-full min-w-0">
      {/* Header and Draft Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Content Studio</h1>
          <p className="text-xs text-muted">Prepare platform-specific titles, captions, thumbnails, and distribution.</p>
        </div>

        {drafts.length > 0 && (
          <div className="flex items-center space-x-2">
            <span className="text-xs text-muted">Active Draft:</span>
            <select
              value={selectedDraftId || ''}
              onChange={(e) => setSelectedDraftId(Number(e.target.value))}
              className="px-3 py-1.5 rounded-lg bg-surface border border-border text-foreground text-xs font-medium focus:outline-none focus:border-primary"
            >
              {drafts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title?.slice(0, 40) || `Draft #${d.id}`}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
        </div>
      ) : !draft ? (
        <div className="p-10 rounded-xl bg-surface border border-dashed border-border text-center space-y-3">
          <Film className="w-10 h-10 text-muted mx-auto" />
          <h2 className="text-sm font-bold text-foreground">No drafts available yet</h2>
          <p className="text-xs text-muted max-w-md mx-auto">
            Paste an Instagram Reel URL or upload an authorized MP4 in Quick Publish to automatically create a prepared draft.
          </p>
          <button
            type="button"
            onClick={() => onNavigate('quick-publish')}
            className="px-4 py-2 rounded-lg bg-primary text-white text-xs font-semibold"
          >
            Go to Quick Publish
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[35%_minmax(0,1fr)] gap-6 items-start">
          {/* Left Column: Media & Rules Engine (35%) */}
          <div className="space-y-6 min-w-0">
            {/* Video Player / Thumbnail Preview */}
            <div className="rounded-2xl bg-surface border border-border overflow-hidden">
              <div className="relative aspect-[9/16] max-h-[460px] mx-auto bg-black flex items-center justify-center">
                {draft.media?.stream_url ? (
                  <video
                    src={draft.media.stream_url}
                    controls
                    poster={draft.media.thumbnail_url}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <img src={draft.media?.thumbnail_url} alt="Thumbnail" className="w-full h-full object-cover" />
                )}
                <span className="absolute top-3 left-3 px-2 py-0.5 rounded text-[10px] font-bold bg-primary text-white uppercase tracking-wider">
                  {draft.media?.is_vertical ? '9:16 Vertical' : 'Horizontal'}
                </span>
                <span className="absolute bottom-3 right-3 px-2 py-0.5 rounded text-[10px] font-medium bg-black/80 text-white">
                  {draft.media?.duration ? `${draft.media.duration}s` : 'Video'}
                </span>
              </div>

              <div className="p-4 border-t border-border flex items-center justify-between text-xs text-muted">
                <span className="truncate">Source: {draft.source?.account ? `@${draft.source.account}` : 'Direct Upload'}</span>
                <a
                  href={`/api/v1/publishing/manual-export/${draft.id}`}
                  download
                  className="flex items-center space-x-1 text-primary hover:underline font-semibold"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Manual Export ZIP</span>
                </a>
              </div>
            </div>

            {/* Quick Metadata Rules Engine */}
            <div className="p-5 rounded-2xl bg-surface border border-border space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Metadata Conversion Engine</span>
                </div>
              </div>

              <p className="text-xs text-muted">
                Quickly transform Instagram captions into platform-compliant YouTube titles and descriptions:
              </p>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => handleApplyConversion('first_sentence')}
                  className="p-2.5 rounded-lg bg-elevated hover:bg-elevated/80 border border-border text-left space-y-0.5"
                >
                  <span className="font-semibold text-foreground block">First Sentence</span>
                  <span className="text-[10px] text-muted block">Extracts first full phrase</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyConversion('clean_title')}
                  className="p-2.5 rounded-lg bg-elevated hover:bg-elevated/80 border border-border text-left space-y-0.5"
                >
                  <span className="font-semibold text-foreground block">Strip Hashtags</span>
                  <span className="text-[10px] text-muted block">Cleans tags and emojis</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyConversion('exact_copy')}
                  className="p-2.5 rounded-lg bg-elevated hover:bg-elevated/80 border border-border text-left space-y-0.5"
                >
                  <span className="font-semibold text-foreground block">Exact Copy</span>
                  <span className="text-[10px] text-muted block">Preserves verbatim</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyConversion('ai_generated')}
                  className="p-2.5 rounded-lg bg-primary/10 hover:bg-primary/20 border border-primary/30 text-left space-y-0.5 text-primary"
                >
                  <span className="font-semibold block flex items-center space-x-1">
                    <Sparkles className="w-3 h-3" />
                    <span>Local AI (Ollama)</span>
                  </span>
                  <span className="text-[10px] text-muted block">Generates viral titles</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Platform Editor & Publisher (65%) */}
          <div className="space-y-6 min-w-0">
            {/* Editor Card */}
            <div className="p-6 rounded-2xl bg-surface border border-border space-y-5">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center space-x-3 text-sm font-semibold">
                  <button
                    onClick={() => setPreviewTab('youtube')}
                    className={`flex items-center space-x-1.5 pb-2 border-b-2 transition-colors ${
                      previewTab === 'youtube' ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-foreground'
                    }`}
                  >
                    <span>YouTube Shorts</span>
                  </button>
                  <button
                    onClick={() => setPreviewTab('instagram')}
                    className={`flex items-center space-x-1.5 pb-2 border-b-2 transition-colors ${
                      previewTab === 'instagram' ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-foreground'
                    }`}
                  >
                    <span>Instagram Reels</span>
                  </button>
                </div>
              </div>

              {/* YouTube Specific Fields */}
              {previewTab === 'youtube' && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-foreground uppercase tracking-wider">YouTube Title</label>
                      <span className={`text-[10px] font-mono ${title.length > 100 ? 'text-destructive font-bold' : 'text-muted'}`}>
                        {title.length}/100 chars
                      </span>
                    </div>
                    <input
                      type="text"
                      maxLength={100}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-foreground text-sm focus:outline-none focus:border-primary"
                      placeholder="Title for YouTube Shorts..."
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-foreground uppercase tracking-wider">YouTube Description</label>
                      <span className="text-[10px] font-mono text-muted">
                        {new TextEncoder().encode(description).length}/5,000 bytes
                      </span>
                    </div>
                    <textarea
                      rows={5}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-foreground text-xs focus:outline-none focus:border-primary resize-y"
                      placeholder="Description including attribution and credits..."
                    />
                  </div>
                </div>
              )}

              {/* Instagram Specific Fields */}
              {previewTab === 'instagram' && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-foreground uppercase tracking-wider">Instagram Caption</label>
                      <span className={`text-[10px] font-mono ${caption.length > 2200 ? 'text-destructive font-bold' : 'text-muted'}`}>
                        {caption.length}/2200 chars
                      </span>
                    </div>
                    <textarea
                      rows={6}
                      value={caption}
                      onChange={(e) => setCaption(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-foreground text-xs focus:outline-none focus:border-primary resize-y"
                      placeholder="Instagram Reel caption..."
                    />
                  </div>
                </div>
              )}

              {/* Hashtag Management */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-foreground uppercase tracking-wider">Hashtags</label>
                  <span className="text-[10px] font-mono text-muted">{hashtags.length}/30 tags</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {hashtags.map((tag) => (
                    <span
                      key={tag}
                      onClick={() => handleRemoveTag(tag)}
                      className="px-2.5 py-1 rounded-md bg-elevated border border-border text-xs text-primary font-medium flex items-center space-x-1 cursor-pointer hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-colors"
                      title="Click to remove"
                    >
                      <span>{tag}</span>
                      <span className="text-[10px] text-muted">×</span>
                    </span>
                  ))}
                </div>
                <div className="flex items-center space-x-2 pt-1">
                  <input
                    type="text"
                    placeholder="Add hashtag (e.g. reels, motivation)..."
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground focus:outline-none focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={handleAddTag}
                    className="px-3 py-1.5 rounded-lg bg-elevated hover:bg-border text-foreground text-xs font-medium"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>

            {/* Destination Channels & Scheduling */}
            <div className="p-6 rounded-2xl bg-surface border border-border space-y-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Select Destination Accounts</span>
                <span className="text-xs text-muted">{selectedAccountIds.length} selected</span>
              </div>

              {accounts.length === 0 ? (
                <div className="p-4 rounded-xl bg-elevated text-center space-y-2">
                  <p className="text-xs text-muted">No accounts connected yet.</p>
                  <button
                    type="button"
                    onClick={() => onNavigate('accounts')}
                    className="text-xs text-primary underline font-medium"
                  >
                    Connect YouTube or Instagram →
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {accounts.map((acc) => {
                    const isSelected = selectedAccountIds.includes(acc.id);
                    return (
                      <div
                        key={acc.id}
                        onClick={() => {
                          if (isSelected) {
                            setSelectedAccountIds(selectedAccountIds.filter((id) => id !== acc.id));
                          } else {
                            setSelectedAccountIds([...selectedAccountIds, acc.id]);
                          }
                        }}
                        className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-primary/10 border-primary text-foreground'
                            : 'bg-elevated border-border text-muted hover:border-border/80'
                        }`}
                      >
                        <div className="flex items-center space-x-2.5 truncate">
                          <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-primary' : 'bg-muted'}`} />
                          <div className="truncate text-left">
                            <span className="text-xs font-semibold text-foreground block truncate">{acc.account_name}</span>
                            <span className="text-[10px] text-muted capitalize block">{acc.platform}</span>
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          readOnly
                          className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Publish Visibility & Audience */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">Privacy Status</label>
                  <select
                    value={privacy}
                    onChange={(e: any) => setPrivacy(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-xs focus:outline-none focus:border-primary"
                  >
                    <option value="private">Private (Recommended for testing)</option>
                    <option value="unlisted">Unlisted</option>
                    <option value="public">Public</option>
                  </select>
                </div>
                <div className="flex items-center space-x-2.5 pt-5">
                  <input
                    type="checkbox"
                    id="madeKids"
                    checked={madeForKids}
                    onChange={(e) => setMadeForKids(e.target.checked)}
                    className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                  />
                  <label htmlFor="madeKids" className="text-xs text-foreground cursor-pointer">
                    Made for Kids audience designation
                  </label>
                </div>
              </div>

              {/* Schedule Timing Options */}
              <div className="pt-2 border-t border-border space-y-3">
                <span className="text-xs font-medium text-foreground block">Publish Schedule</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <input
                      type="date"
                      value={scheduleDate}
                      onChange={(e) => setScheduleDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-xs focus:outline-none focus:border-primary"
                    />
                    <span className="text-[10px] text-muted mt-1 block">Leave empty for immediate publishing</span>
                  </div>
                  <div>
                    <input
                      type="time"
                      value={scheduleTime}
                      onChange={(e) => setScheduleTime(e.target.value)}
                      disabled={!scheduleDate}
                      className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-xs focus:outline-none focus:border-primary disabled:opacity-50"
                    />
                    <span className="text-[10px] text-muted mt-1 block">Configured Timezone: Asia/Kolkata</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-border flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={saving}
                  className="px-4 py-2.5 rounded-xl bg-elevated hover:bg-border text-foreground text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  Save Draft Changes
                </button>

                <div className="flex items-center space-x-2">
                  {scheduleDate ? (
                    <button
                      type="button"
                      onClick={() => handlePublish(true)}
                      disabled={saving || selectedAccountIds.length === 0}
                      className="px-6 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-semibold flex items-center space-x-2 shadow-sm transition-all disabled:opacity-50"
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      <span>Schedule for {scheduleDate}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handlePublish(false)}
                      disabled={saving || selectedAccountIds.length === 0}
                      className="px-6 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-semibold flex items-center space-x-2 shadow-sm transition-all disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Publish Immediately</span>
                    </button>
                  )}
                </div>
              </div>

              {publishMessage && (
                <div className="p-3 rounded-lg bg-success/15 border border-success/30 text-success text-xs flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span>{publishMessage}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
