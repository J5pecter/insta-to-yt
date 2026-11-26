import React, { useState, useEffect } from 'react';
import { Sliders, BarChart3, Server, CheckCircle2, Save } from 'lucide-react';
import { api } from '../services/api';
import { useFeedback } from '../components/Feedback';
import { AnalyticsPage } from './AnalyticsPage';
import { SystemPage } from './SystemPage';

export const SettingsPage: React.FC = () => {
  const { notify } = useFeedback();
  const [subTab, setSubTab] = useState<'presets' | 'analytics' | 'system'>('presets');
  const [presets, setPresets] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const loadPresets = async () => {
    try {
      const [pRes, aRes] = await Promise.all([api.listPresets(), api.listAccounts()]);
      setPresets(pRes.items || []);
      setAccounts(aRes || []);
      if (pRes.items?.length > 0 && !selectedPreset) {
        setSelectedPreset(pRes.items[0]);
      }
    } catch (e: any) {
      notify(e.message || 'Failed to load presets.', 'error');
    }
  };

  useEffect(() => {
    loadPresets();
  }, []);

  const handleSavePreset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPreset) return;
    setSaving(true);
    try {
      const updated = await api.updatePreset(selectedPreset.id, selectedPreset);
      setSelectedPreset(updated);
      notify(`Preset "${updated.name}" saved.`, 'success');
      loadPresets();
    } catch (err: any) {
      notify(err.message || 'Failed to save preset.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const ytAccounts = accounts.filter((a) => a.platform === 'youtube');
  const igAccounts = accounts.filter((a) => a.platform === 'instagram');

  return (
    <div className="space-y-5 w-full min-w-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
        <button
          type="button"
          onClick={() => setSubTab('presets')}
          className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center space-x-1.5 ${
            subTab === 'presets' ? 'bg-primary/15 text-primary border border-primary/30' : 'text-muted hover:text-foreground'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Publishing Presets</span>
        </button>
        <button
          type="button"
          onClick={() => setSubTab('analytics')}
          className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center space-x-1.5 ${
            subTab === 'analytics' ? 'bg-primary/15 text-primary border border-primary/30' : 'text-muted hover:text-foreground'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span>Analytics</span>
        </button>
        <button
          type="button"
          onClick={() => setSubTab('system')}
          className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center space-x-1.5 ${
            subTab === 'system' ? 'bg-primary/15 text-primary border border-primary/30' : 'text-muted hover:text-foreground'
          }`}
        >
          <Server className="w-3.5 h-3.5" />
          <span>System, Storage & Backups</span>
        </button>
      </div>

      {subTab === 'presets' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="p-5 rounded-xl bg-surface border border-border space-y-3">
            <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">Saved Profiles</h2>
            <div className="space-y-2">
              {presets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedPreset(p)}
                  className={`w-full p-3 rounded-lg border text-left text-xs flex items-center justify-between ${
                    selectedPreset?.id === p.id
                      ? 'bg-primary/10 border-primary/40 text-foreground'
                      : 'bg-elevated border-border text-muted hover:text-foreground'
                  }`}
                >
                  <span className="font-semibold truncate">{p.name}</span>
                  {p.is_default && <CheckCircle2 className="w-3.5 h-3.5 text-success flex-shrink-0" />}
                </button>
              ))}
            </div>
          </div>

          {selectedPreset && (
            <form onSubmit={handleSavePreset} className="lg:col-span-2 p-6 rounded-xl bg-surface border border-border space-y-4 text-xs">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <h3 className="text-sm font-bold text-foreground">Configure Default Publishing Rules</h3>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-white font-semibold flex items-center space-x-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{saving ? 'Saving...' : 'Save Preset'}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-medium text-foreground block mb-1">Profile Name</label>
                  <input
                    type="text"
                    value={selectedPreset.name}
                    onChange={(e) => setSelectedPreset({ ...selectedPreset, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
                  />
                </div>
                <div>
                  <label className="font-medium text-foreground block mb-1">Default Visibility</label>
                  <select
                    value={selectedPreset.visibility}
                    onChange={(e) => setSelectedPreset({ ...selectedPreset, visibility: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
                  >
                    <option value="private">Private</option>
                    <option value="unlisted">Unlisted</option>
                    <option value="public">Public</option>
                  </select>
                </div>
                <div>
                  <label className="font-medium text-foreground block mb-1">Default YouTube Channel</label>
                  <select
                    value={selectedPreset.youtube_account_id || ''}
                    onChange={(e) =>
                      setSelectedPreset({ ...selectedPreset, youtube_account_id: e.target.value ? Number(e.target.value) : null })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
                  >
                    <option value="">All connected YouTube channels</option>
                    {ytAccounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.account_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-medium text-foreground block mb-1">Default Instagram Account</label>
                  <select
                    value={selectedPreset.instagram_account_id || ''}
                    onChange={(e) =>
                      setSelectedPreset({ ...selectedPreset, instagram_account_id: e.target.value ? Number(e.target.value) : null })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
                  >
                    <option value="">All connected Instagram accounts</option>
                    {igAccounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.account_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-medium text-foreground block mb-1">Title Generation Mode</label>
                  <select
                    value={selectedPreset.title_mode}
                    onChange={(e) => setSelectedPreset({ ...selectedPreset, title_mode: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
                  >
                    <option value="mode_a">First Sentence (Deterministic)</option>
                    <option value="mode_b">Clean Title (Strip Hashtags)</option>
                    <option value="mode_c">Exact Caption Copy</option>
                    <option value="mode_d">Local AI (Ollama if available)</option>
                  </select>
                </div>
                <div>
                  <label className="font-medium text-foreground block mb-1">Video Profile</label>
                  <select
                    value={selectedPreset.video_profile}
                    onChange={(e) => setSelectedPreset({ ...selectedPreset, video_profile: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
                  >
                    <option value="vertical_blur_1080x1920">Vertical 9:16 Blur (1080×1920)</option>
                    <option value="vertical_crop_1080x1920">Vertical 9:16 Center Crop</option>
                    <option value="vertical_fit_1080x1920">Vertical 9:16 Letterbox</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-border">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedPreset.source_attribution}
                    onChange={(e) => setSelectedPreset({ ...selectedPreset, source_attribution: e.target.checked })}
                  />
                  <span className="text-foreground">Preserve source attribution in YouTube description</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedPreset.duplicate_detection}
                    onChange={(e) => setSelectedPreset({ ...selectedPreset, duplicate_detection: e.target.checked })}
                  />
                  <span className="text-foreground">Enable duplicate file hash & idempotency protection</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedPreset.rights_confirmation_required}
                    onChange={(e) => setSelectedPreset({ ...selectedPreset, rights_confirmation_required: e.target.checked })}
                  />
                  <span className="text-foreground">Require rights confirmation before publishing</span>
                </label>
              </div>
            </form>
          )}
        </div>
      )}

      {subTab === 'analytics' && <AnalyticsPage />}
      {subTab === 'system' && <SystemPage />}
    </div>
  );
};
