import React, { useState, useEffect } from 'react';
import {
  Film,
  Sliders,
  Image as ImageIcon,
  Trash2,
  ExternalLink,
  Play,
  RotateCw,
  CheckCircle2,
  X,
  Plus
} from 'lucide-react';
import { api } from '../services/api';
import { useFeedback } from '../components/Feedback';

interface MediaLibraryPageProps {
  onNavigate: (tab: string, meta?: any) => void;
}

export const MediaLibraryPage: React.FC<MediaLibraryPageProps> = ({ onNavigate }) => {
  const { notify, confirmAction } = useFeedback();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [verticalFilter, setVerticalFilter] = useState<boolean | undefined>(undefined);
  const [selectedMedia, setSelectedMedia] = useState<any | null>(null);

  // Video Editor Modal State
  const [editorOpen, setEditorOpen] = useState(false);
  const [editProfile, setEditProfile] = useState<'vertical_9_16' | 'original'>('vertical_9_16');
  const [cropMode, setCropMode] = useState<'fit_blur' | 'center_crop' | 'fit_black'>('fit_blur');
  const [trimStart, setTrimStart] = useState<number | ''>('');
  const [trimEnd, setTrimEnd] = useState<number | ''>('');
  const [muteAudio, setMuteAudio] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Thumbnail Editor State
  const [thumbOpen, setThumbOpen] = useState(false);
  const [thumbTime, setThumbTime] = useState(1.0);
  const [thumbLoading, setThumbLoading] = useState(false);

  const loadMedia = async () => {
    setLoading(true);
    try {
      const res = await api.listMedia(1, 40, verticalFilter);
      setItems(res.items || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMedia();
  }, [verticalFilter]);

  const handleDelete = async (id: number) => {
    const ok = await confirmAction({
      title: 'Delete media file?',
      message: 'This will permanently delete this media file and its generated thumbnails.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.deleteMedia(id);
      setItems(items.filter((item) => item.id !== id));
      if (selectedMedia?.id === id) setSelectedMedia(null);
      notify('Media file deleted.', 'info');
    } catch (err: any) {
      notify(`Delete failed: ${err.message}`, 'error');
    }
  };

  const handleProcessVideo = async () => {
    if (!selectedMedia) return;
    setProcessing(true);
    try {
      await api.processMedia(selectedMedia.id, {
        profile: editProfile,
        crop_mode: cropMode,
        trim_start: trimStart !== '' ? Number(trimStart) : undefined,
        trim_end: trimEnd !== '' ? Number(trimEnd) : undefined,
        mute: muteAudio,
      });
      notify('Video processed and new variant generated!', 'success');
      setEditorOpen(false);
      loadMedia();
    } catch (err: any) {
      notify(`Processing failed: ${err.message}`, 'error');
    } finally {
      setProcessing(false);
    }
  };

  const handleExtractThumbnail = async () => {
    if (!selectedMedia) return;
    setThumbLoading(true);
    try {
      await api.extractThumbnail(selectedMedia.id, thumbTime);
      notify('Thumbnail updated!', 'success');
      setThumbOpen(false);
      loadMedia();
    } catch (err: any) {
      notify(`Thumbnail extraction failed: ${err.message}`, 'error');
    } finally {
      setThumbLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Media Library</h1>
          <p className="text-sm text-muted">Manage imported videos, inspect stream properties, and apply video optimizations.</p>
        </div>

        {/* Filter buttons */}
        <div className="flex items-center space-x-2 bg-surface p-1 rounded-xl border border-border text-xs">
          <button
            onClick={() => setVerticalFilter(undefined)}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              verticalFilter === undefined ? 'bg-primary text-white font-semibold' : 'text-muted hover:text-foreground'
            }`}
          >
            All Videos
          </button>
          <button
            onClick={() => setVerticalFilter(true)}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              verticalFilter === true ? 'bg-primary text-white font-semibold' : 'text-muted hover:text-foreground'
            }`}
          >
            9:16 Vertical
          </button>
          <button
            onClick={() => setVerticalFilter(false)}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              verticalFilter === false ? 'bg-primary text-white font-semibold' : 'text-muted hover:text-foreground'
            }`}
          >
            Horizontal / Other
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
        </div>
      ) : items.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-surface border border-dashed border-border space-y-3">
          <Film className="w-12 h-12 text-muted mx-auto" />
          <p className="text-foreground font-semibold">No media assets found</p>
          <p className="text-xs text-muted max-w-sm mx-auto">
            Import an authorized Instagram Reel or upload a creator video file to start building your library.
          </p>
          <button
            onClick={() => onNavigate('import')}
            className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary-hover"
          >
            Import Content Now
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {items.map((m) => (
            <div
              key={m.id}
              className="rounded-2xl bg-surface border border-border overflow-hidden flex flex-col justify-between group hover:border-primary/50 transition-colors"
            >
              {/* Thumbnail Container */}
              <div className="relative aspect-[9/14] bg-black overflow-hidden flex items-center justify-center">
                {m.has_thumbnail ? (
                  <img src={m.thumbnail_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Film className="w-10 h-10 text-muted" />
                )}
                <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded text-[10px] font-bold bg-primary text-white uppercase tracking-wider">
                  {m.is_vertical ? '9:16' : 'Wide'}
                </span>
                <span className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded text-[10px] font-medium bg-black/80 text-white">
                  {m.duration ? `${m.duration}s` : 'Video'}
                </span>
              </div>

              {/* Media Info */}
              <div className="p-4 space-y-3">
                <div className="space-y-0.5">
                  <span className="text-xs font-semibold text-foreground truncate block">
                    {m.source_account ? `@${m.source_account}` : 'Direct Upload'}
                  </span>
                  <p className="text-[11px] text-muted line-clamp-2">
                    {m.original_caption || 'No original caption provided.'}
                  </p>
                </div>

                <div className="flex items-center justify-between text-[10px] text-muted pt-1 border-t border-border/60">
                  <span>{(m.file_size / (1024 * 1024)).toFixed(1)} MB</span>
                  <span>{new Date(m.created_at).toLocaleDateString()}</span>
                </div>

                {/* Action Buttons */}
                <div className="grid grid-cols-3 gap-1.5 pt-1">
                  <button
                    onClick={() => {
                      setSelectedMedia(m);
                      setEditorOpen(true);
                    }}
                    className="p-1.5 rounded-lg bg-elevated hover:bg-border text-foreground text-xs flex items-center justify-center space-x-1"
                    title="Video Optimizer"
                  >
                    <Sliders className="w-3.5 h-3.5 text-primary" />
                    <span className="text-[10px]">Crop</span>
                  </button>
                  <button
                    onClick={() => {
                      setSelectedMedia(m);
                      setThumbOpen(true);
                    }}
                    className="p-1.5 rounded-lg bg-elevated hover:bg-border text-foreground text-xs flex items-center justify-center space-x-1"
                    title="Frame Picker"
                  >
                    <ImageIcon className="w-3.5 h-3.5 text-primary" />
                    <span className="text-[10px]">Cover</span>
                  </button>
                  <button
                    onClick={() => handleDelete(m.id)}
                    className="p-1.5 rounded-lg bg-elevated hover:bg-destructive/10 text-muted hover:text-destructive text-xs flex items-center justify-center"
                    title="Delete Asset"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Video Optimizer Modal */}
      {editorOpen && selectedMedia && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl max-w-md w-full border border-border p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <span className="text-sm font-bold text-foreground">Video Editor & Optimizer</span>
              <button onClick={() => setEditorOpen(false)} className="text-muted hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-medium text-foreground">Aspect Ratio / Profile</label>
                <select
                  value={editProfile}
                  onChange={(e: any) => setEditProfile(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
                >
                  <option value="vertical_9_16">Vertical 9:16 (1080x1920) for Shorts & Reels</option>
                  <option value="original">Original Aspect Ratio (Container Normalization)</option>
                </select>
              </div>

              {editProfile === 'vertical_9_16' && (
                <div className="space-y-1">
                  <label className="font-medium text-foreground">Crop / Fit Mode (for non-vertical media)</label>
                  <select
                    value={cropMode}
                    onChange={(e: any) => setCropMode(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
                  >
                    <option value="fit_blur">Fit with Blurred Background (Recommended)</option>
                    <option value="center_crop">Center Crop to 9:16</option>
                    <option value="fit_black">Fit with Black Borders</option>
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-medium text-foreground">Trim Start (seconds)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    placeholder="0.0"
                    value={trimStart}
                    onChange={(e) => setTrimStart(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-medium text-foreground">Trim End (seconds)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    placeholder={selectedMedia.duration?.toString() || '60'}
                    value={trimEnd}
                    onChange={(e) => setTrimEnd(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <input
                  type="checkbox"
                  id="mute"
                  checked={muteAudio}
                  onChange={(e) => setMuteAudio(e.target.checked)}
                  className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                />
                <label htmlFor="mute" className="text-foreground cursor-pointer">
                  Mute audio stream (remove sound)
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-border">
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                className="px-4 py-2 rounded-lg text-muted hover:text-foreground text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleProcessVideo}
                disabled={processing}
                className="px-5 py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-xs font-semibold flex items-center space-x-2 disabled:opacity-50"
              >
                {processing ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Processing with FFmpeg...</span>
                  </>
                ) : (
                  <span>Save Optimized Variant</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Thumbnail Frame Picker Modal */}
      {thumbOpen && selectedMedia && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl max-w-sm w-full border border-border p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <span className="text-sm font-bold text-foreground">Extract Cover Thumbnail</span>
              <button onClick={() => setThumbOpen(false)} className="text-muted hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <label className="font-medium text-foreground">Select Frame Timestamp (seconds)</label>
              <input
                type="range"
                min="0.1"
                max={selectedMedia.duration || 10}
                step="0.5"
                value={thumbTime}
                onChange={(e) => setThumbTime(Number(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="flex items-center justify-between font-mono text-muted text-[11px]">
                <span>0.1s</span>
                <span className="text-primary font-bold">{thumbTime.toFixed(1)}s</span>
                <span>{selectedMedia.duration?.toFixed(1) || 10}s</span>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-border">
              <button
                type="button"
                onClick={() => setThumbOpen(false)}
                className="px-4 py-2 rounded-lg text-muted hover:text-foreground text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExtractThumbnail}
                disabled={thumbLoading}
                className="px-5 py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-xs font-semibold disabled:opacity-50"
              >
                {thumbLoading ? 'Extracting...' : 'Extract Frame'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
