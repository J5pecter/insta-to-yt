import React, { useState } from 'react';
import { UploadCloud, Link as LinkIcon, FileVideo, Layers, CheckCircle2, AlertCircle, Sparkles, FileText } from 'lucide-react';
import { api } from '../services/api';

interface ImportPageProps {
  onNavigate: (tab: string, meta?: any) => void;
}

export const ImportPage: React.FC<ImportPageProps> = ({ onNavigate }) => {
  const [activeTab, setActiveTab] = useState<'url' | 'file' | 'bulk'>('url');

  // URL Import State
  const [url, setUrl] = useState('');
  const [rightsConfirmed, setRightsConfirmed] = useState(true);
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlResult, setUrlResult] = useState<any>(null);

  // File Upload State
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState('');
  const [uploader, setUploader] = useState('');
  const [fileLoading, setFileLoading] = useState(false);
  const [fileResult, setFileResult] = useState<any>(null);

  // Bulk Import State
  const [bulkText, setBulkText] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState<any>(null);

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setUrlLoading(true);
    setUrlResult(null);
    try {
      const res = await api.importUrl(url.trim(), rightsConfirmed);
      setUrlResult({ success: true, data: res });
      setUrl('');
    } catch (err: any) {
      setUrlResult({ success: false, error: err.message });
    } finally {
      setUrlLoading(false);
    }
  };

  const handleFileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setFileLoading(true);
    setFileResult(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('caption', caption);
    formData.append('uploader', uploader);
    formData.append('rights_confirmed', rightsConfirmed ? 'true' : 'false');

    try {
      const res = await api.importFile(formData);
      setFileResult({ success: true, data: res });
      setFile(null);
      setCaption('');
      setUploader('');
    } catch (err: any) {
      setFileResult({ success: false, error: err.message });
    } finally {
      setFileLoading(false);
    }
  };

  const handleBulkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkText.trim()) return;
    setBulkLoading(true);
    setBulkResult(null);
    try {
      const res = await api.importBulk(bulkText.trim(), rightsConfirmed);
      setBulkResult({ success: true, data: res });
      setBulkText('');
    } catch (err: any) {
      setBulkResult({ success: false, error: err.message });
    } finally {
      setBulkLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground">Import Content</h1>
        <p className="text-sm text-muted">
          Import creator-authorized Instagram Reels, upload local video files, or process links in bulk.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border space-x-6 text-sm font-medium">
        <button
          onClick={() => setActiveTab('url')}
          className={`flex items-center space-x-2 py-3 border-b-2 transition-colors ${
            activeTab === 'url' ? 'border-primary text-primary font-semibold' : 'border-transparent text-muted hover:text-foreground'
          }`}
        >
          <LinkIcon className="w-4 h-4" />
          <span>Instagram URL</span>
        </button>
        <button
          onClick={() => setActiveTab('file')}
          className={`flex items-center space-x-2 py-3 border-b-2 transition-colors ${
            activeTab === 'file' ? 'border-primary text-primary font-semibold' : 'border-transparent text-muted hover:text-foreground'
          }`}
        >
          <FileVideo className="w-4 h-4" />
          <span>Local Video Upload</span>
        </button>
        <button
          onClick={() => setActiveTab('bulk')}
          className={`flex items-center space-x-2 py-3 border-b-2 transition-colors ${
            activeTab === 'bulk' ? 'border-primary text-primary font-semibold' : 'border-transparent text-muted hover:text-foreground'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Bulk CSV / Links</span>
        </button>
      </div>

      {/* Mode A: URL Import */}
      {activeTab === 'url' && (
        <form onSubmit={handleUrlSubmit} className="p-6 rounded-2xl bg-surface border border-border space-y-5">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground uppercase tracking-wider">
              Instagram Reel / Video Post URL
            </label>
            <input
              type="url"
              placeholder="https://www.instagram.com/reel/C8XYZ12345/ or https://www.instagram.com/p/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-foreground text-sm focus:outline-none focus:border-primary"
              required
            />
            <p className="text-xs text-muted">
              Tracking query parameters like <code className="text-primary font-mono text-[11px]">?igsh=...</code> will be automatically normalized.
            </p>
          </div>

          <div className="flex items-start space-x-3 p-3.5 rounded-xl bg-elevated border border-border">
            <input
              type="checkbox"
              id="rightsUrl"
              checked={rightsConfirmed}
              onChange={(e) => setRightsConfirmed(e.target.checked)}
              className="mt-0.5 rounded border-border text-primary focus:ring-primary h-4 w-4"
              required
            />
            <label htmlFor="rightsUrl" className="text-xs text-foreground cursor-pointer">
              <span className="font-semibold">Rights Declaration:</span> I confirm that I own this media, have the creator's explicit authorization, or hold appropriate distribution rights for republication.
            </label>
          </div>

          <button
            type="submit"
            disabled={urlLoading || !url.trim() || !rightsConfirmed}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-sm font-semibold flex items-center justify-center space-x-2 disabled:opacity-50 transition-all"
          >
            {urlLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Validating & Importing...</span>
              </>
            ) : (
              <>
                <UploadCloud className="w-4 h-4" />
                <span>Import Video & Extract Caption</span>
              </>
            )}
          </button>

          {urlResult && (
            <div className={`p-4 rounded-xl text-xs space-y-2 ${
              urlResult.success ? 'bg-success/10 text-success border border-success/30' : 'bg-destructive/10 text-destructive border border-destructive/30'
            }`}>
              {urlResult.success ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Successfully imported: <strong>{urlResult.data.title}</strong></span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate('studio', { draftId: urlResult.data.draft_id })}
                    className="px-3 py-1 rounded bg-success text-white font-semibold text-xs"
                  >
                    Open in Studio
                  </button>
                </div>
              ) : (
                <div className="flex items-start space-x-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{urlResult.error}</span>
                </div>
              )}
            </div>
          )}
        </form>
      )}

      {/* Mode B: File Upload */}
      {activeTab === 'file' && (
        <form onSubmit={handleFileSubmit} className="p-6 rounded-2xl bg-surface border border-border space-y-5">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground uppercase tracking-wider">
              Video File (MP4 or MOV)
            </label>
            <div className="border-2 border-dashed border-border rounded-xl p-6 text-center hover:border-primary transition-colors cursor-pointer relative bg-background/50">
              <input
                type="file"
                accept="video/mp4,video/quicktime,.mp4,.mov"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="absolute inset-0 opacity-0 cursor-pointer"
                required
              />
              <UploadCloud className="w-8 h-8 text-muted mx-auto mb-2" />
              {file ? (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">{file.name}</p>
                  <p className="text-xs text-muted">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">Click to select video or drag and drop</p>
                  <p className="text-xs text-muted">Supports MP4 and MOV containers up to 500 MB</p>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Creator / Attribution Name</label>
              <input
                type="text"
                placeholder="e.g. Authorized Creator Name"
                value={uploader}
                onChange={(e) => setUploader(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Caption & Hashtags</label>
              <textarea
                placeholder="Paste original caption and hashtags here..."
                rows={3}
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-sm focus:outline-none focus:border-primary resize-none"
              />
            </div>
          </div>

          <div className="flex items-start space-x-3 p-3.5 rounded-xl bg-elevated border border-border">
            <input
              type="checkbox"
              id="rightsFile"
              checked={rightsConfirmed}
              onChange={(e) => setRightsConfirmed(e.target.checked)}
              className="mt-0.5 rounded border-border text-primary focus:ring-primary h-4 w-4"
              required
            />
            <label htmlFor="rightsFile" className="text-xs text-foreground cursor-pointer">
              <span className="font-semibold">Rights Declaration:</span> I own or have permission to distribute this video.
            </label>
          </div>

          <button
            type="submit"
            disabled={fileLoading || !file || !rightsConfirmed}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-sm font-semibold flex items-center justify-center space-x-2 disabled:opacity-50"
          >
            {fileLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Uploading & Probing...</span>
              </>
            ) : (
              <>
                <UploadCloud className="w-4 h-4" />
                <span>Upload Authorized Media</span>
              </>
            )}
          </button>

          {fileResult && (
            <div className={`p-4 rounded-xl text-xs space-y-2 ${
              fileResult.success ? 'bg-success/10 text-success border border-success/30' : 'bg-destructive/10 text-destructive border border-destructive/30'
            }`}>
              {fileResult.success ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Uploaded: <strong>{fileResult.data.title}</strong></span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate('studio', { draftId: fileResult.data.draft_id })}
                    className="px-3 py-1 rounded bg-success text-white font-semibold text-xs"
                  >
                    Open in Studio
                  </button>
                </div>
              ) : (
                <span>{fileResult.error}</span>
              )}
            </div>
          )}
        </form>
      )}

      {/* Mode C: Bulk CSV / Multiline */}
      {activeTab === 'bulk' && (
        <form onSubmit={handleBulkSubmit} className="p-6 rounded-2xl bg-surface border border-border space-y-5">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground uppercase tracking-wider">
              Batch Links or CSV Text (One link per line)
            </label>
            <textarea
              rows={6}
              placeholder="https://www.instagram.com/reel/C8XYZ1/&#10;https://www.instagram.com/reel/C8XYZ2/&#10;https://www.instagram.com/reel/C8XYZ3/"
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground font-mono text-xs focus:outline-none focus:border-primary resize-y"
              required
            />
          </div>

          <div className="flex items-start space-x-3 p-3.5 rounded-xl bg-elevated border border-border">
            <input
              type="checkbox"
              id="rightsBulk"
              checked={rightsConfirmed}
              onChange={(e) => setRightsConfirmed(e.target.checked)}
              className="mt-0.5 rounded border-border text-primary focus:ring-primary h-4 w-4"
              required
            />
            <label htmlFor="rightsBulk" className="text-xs text-foreground cursor-pointer">
              <span className="font-semibold">Rights Declaration:</span> I confirm permissions for all supplied links.
            </label>
          </div>

          <button
            type="submit"
            disabled={bulkLoading || !bulkText.trim() || !rightsConfirmed}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-sm font-semibold flex items-center justify-center space-x-2 disabled:opacity-50"
          >
            {bulkLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Processing Batch...</span>
              </>
            ) : (
              <>
                <Layers className="w-4 h-4" />
                <span>Process Batch Links</span>
              </>
            )}
          </button>

          {bulkResult && (
            <div className="p-4 rounded-xl bg-elevated border border-border space-y-3">
              <span className="text-xs font-semibold text-foreground">Batch Processing Summary</span>
              <div className="divide-y divide-border/60 max-h-48 overflow-y-auto text-xs">
                {bulkResult.data?.results?.map((r: any, idx: number) => (
                  <div key={idx} className="py-1.5 flex items-center justify-between">
                    <span className="font-mono text-muted truncate max-w-sm">{r.url}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      r.status === 'success' ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'
                    }`}>
                      {r.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </form>
      )}
    </div>
  );
};
