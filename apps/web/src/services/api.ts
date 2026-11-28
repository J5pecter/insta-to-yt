import { supabase, isSupabaseConfigured } from '../lib/supabase';

export class ApiError extends Error {
  status: number;
  details?: any;

  constructor(message: string, status: number, details?: any) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL || '/api/v1';

export function getBackendOrigin(): string {
  if (API_BASE.startsWith('http://') || API_BASE.startsWith('https://')) {
    return API_BASE.replace(/\/api\/v1\/?$/, '');
  }
  return '';
}

export function resolveMediaUrl(path?: string | null): string {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${getBackendOrigin()}${path}`;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('socialrelay_token');
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    credentials: 'include',
    headers,
  });

  if (!res.ok) {
    let errDetail = 'Request failed';
    try {
      const data = await res.json();
      errDetail = data.detail || data.message || JSON.stringify(data);
    } catch {
      errDetail = await res.text();
    }
    throw new ApiError(errDetail || `HTTP ${res.status}`, res.status);
  }

  const contentType = res.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return res.json() as Promise<T>;
  }
  return res.text() as Promise<T>;
}

async function invokeFn<T>(fnName: string, body?: any): Promise<T> {
  if (!supabase) throw new ApiError('Supabase is not configured', 500);
  const { data, error } = await supabase.functions.invoke(fnName, { body: body ?? {} });
  if (error) {
    throw new ApiError(error.message || `Edge Function ${fnName} failed`, 400);
  }
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    throw new ApiError(String(data.error), 400);
  }
  return data as T;
}

export const api = {
  isCloudMode: () => isSupabaseConfigured,

  // Auth
  login: async (password: string, email?: string) => {
    if (supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email || '',
        password,
      });
      if (error || !data.user || !data.session) {
        throw new ApiError(error?.message || 'Invalid credentials', 401);
      }
      return {
        status: 'success',
        token: data.session.access_token,
        user: {
          id: data.user.id,
          email: data.user.email,
          role: 'admin',
          timezone: 'Asia/Kolkata',
        },
      };
    }
    return request<{ status: string; token: string; user: any }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password, email }),
    });
  },

  logout: async () => {
    if (supabase) {
      await supabase.auth.signOut();
      return { status: 'success' };
    }
    return request('/auth/logout', { method: 'POST' });
  },

  getMe: async () => {
    if (supabase) {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) throw new ApiError('Not authenticated', 401);
      return {
        id: data.user.id,
        email: data.user.email,
        role: 'admin',
        timezone: 'Asia/Kolkata',
      };
    }
    return request<any>('/auth/me');
  },

  changePassword: async (_current_password: string, new_password: string) => {
    if (supabase) {
      const { error } = await supabase.auth.updateUser({ password: new_password });
      if (error) throw new ApiError(error.message, 400);
      return { status: 'success' };
    }
    return request('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ current_password: _current_password, new_password }),
    });
  },

  // Dashboard & Metrics
  getDashboard: async () => {
    if (supabase) {
      const [{ count: imported }, { count: published }, { count: drafts }, { count: scheduled }, { data: jobs }] =
        await Promise.all([
          supabase.from('source_media').select('*', { count: 'exact', head: true }),
          supabase.from('publication_targets').select('*', { count: 'exact', head: true }).eq('status', 'PUBLISHED'),
          supabase.from('drafts').select('*', { count: 'exact', head: true }).neq('approval_status', 'published'),
          supabase.from('publishing_intents').select('*', { count: 'exact', head: true }).eq('status', 'SCHEDULED'),
          supabase.from('processing_jobs').select('status'),
        ]);
      const activeJobs = (jobs || []).filter((j: any) => ['QUEUED', 'UPLOADING', 'PLATFORM_PROCESSING', 'VERIFYING'].includes(j.status)).length;
      const failedJobs = (jobs || []).filter((j: any) => j.status === 'FAILED').length;
      return {
        total_imported: imported || 0,
        total_published: published || 0,
        pending_drafts: drafts || 0,
        scheduled_count: scheduled || 0,
        active_jobs: activeJobs,
        failed_jobs: failedJobs,
        upcoming: [],
      };
    }
    return request<any>('/dashboard');
  },

  getCalendar: async (startDate?: string, endDate?: string) => {
    if (supabase) {
      const { data } = await supabase
        .from('publishing_intents')
        .select('id, status, scheduled_at, drafts(title)')
        .not('scheduled_at', 'is', null)
        .order('scheduled_at', { ascending: true });
      return {
        events: (data || []).map((i: any) => ({
          id: i.id,
          title: i.drafts?.title || `Intent #${i.id}`,
          status: i.status,
          scheduled_at: i.scheduled_at,
        })),
      };
    }
    const params = new URLSearchParams();
    if (startDate) params.set('start_date', startDate);
    if (endDate) params.set('end_date', endDate);
    return request<any>(`/calendar?${params.toString()}`);
  },

  getAnalytics: async () => {
    if (supabase) {
      const { data: targets } = await supabase.from('publication_targets').select('status, platform_settings');
      const total = (targets || []).length;
      const published = (targets || []).filter((t: any) => t.status === 'PUBLISHED').length;
      return {
        total_publications: total,
        published_count: published,
        success_rate: total > 0 ? Math.round((published / total) * 100) : 100,
        by_platform: {},
      };
    }
    return request<any>('/analytics');
  },

  getNotifications: async () => {
    if (supabase) {
      const { data } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(20);
      return { items: data || [] };
    }
    return request<any>('/notifications');
  },

  markNotificationRead: async (id: number) => {
    if (supabase) {
      await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
      return { status: 'success' };
    }
    return request(`/notifications/${id}/read`, { method: 'POST' });
  },

  getAuditLogs: async (limit = 50) => {
    if (supabase) {
      const { data } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(limit);
      return { items: data || [] };
    }
    return request<any>(`/audit-logs?limit=${limit}`);
  },

  getSystemHealth: async () => {
    if (supabase) return invokeFn<any>('system-health', {});
    return request<any>('/system/health');
  },

  getCostControl: async () => {
    if (supabase) return invokeFn<any>('system-health', {});
    return request<any>('/system/cost-control');
  },

  getStorageStats: async () => {
    if (supabase) {
      const h = await invokeFn<any>('system-health', {});
      return {
        total_used_mb: h.storage?.used_mb || 0,
        free_mb: Math.max(0, 1024 - (h.storage?.used_mb || 0)),
        limit_mb: 1024,
      };
    }
    return request<any>('/system/storage');
  },

  cleanupStorage: async () => {
    if (supabase) return invokeFn<any>('cleanup-storage', {});
    return request('/system/storage/cleanup', { method: 'POST' });
  },

  createBackup: async () => {
    if (supabase) {
      throw new ApiError('Use Supabase Dashboard or pg_dump via CLI for PostgreSQL backups.', 400);
    }
    return request<any>('/system/backup', { method: 'POST' });
  },

  // Imports & Quick Publish
  importUrl: async (url: string, rights_confirmed = true) => {
    if (supabase) return invokeFn<any>('import-instagram', { url, rights_confirmed });
    return request<any>('/imports/url', { method: 'POST', body: JSON.stringify({ url, rights_confirmed }) });
  },

  importFile: async (formData: FormData) => {
    if (supabase) {
      const file = formData.get('file') as File | null;
      if (!file) throw new ApiError('No file selected', 400);
      if (file.size > 50 * 1024 * 1024) {
        throw new ApiError('File exceeds 50 MB Supabase Free Plan limit.', 413);
      }
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new ApiError('Authentication required', 401);

      const objectPath = `${uid}/${crypto.randomUUID()}_${file.name.replace(/[^A-Za-z0-9._-]/g, '_')}`;
      const { error: upErr } = await supabase.storage.from('source-videos').upload(objectPath, file, {
        contentType: file.type || 'video/mp4',
        upsert: false,
      });
      if (upErr) throw new ApiError(upErr.message, 400);

      return invokeFn<any>('import-instagram', {
        storage_path: `source-videos/${objectPath}`,
        size_bytes: file.size,
        mime_type: file.type || 'video/mp4',
        caption: String(formData.get('caption') || ''),
        rights_confirmed: formData.get('rights_confirmed') !== 'false',
      });
    }
    return request<any>('/imports/file', { method: 'POST', body: formData });
  },

  importBulk: (links: string, rights_confirmed = true) =>
    request<any>('/imports/bulk', { method: 'POST', body: JSON.stringify({ links, rights_confirmed }) }),

  // Media
  listMedia: async (page = 1, limit = 20, verticalOnly?: boolean) => {
    if (supabase) {
      const from = (page - 1) * limit;
      const { data } = await supabase
        .from('media_assets')
        .select('*')
        .neq('status', 'deleted')
        .order('created_at', { ascending: false })
        .range(from, from + limit - 1);
      return { items: data || [], total: (data || []).length };
    }
    const params = new URLSearchParams({ page: page.toString(), limit: limit.toString() });
    if (verticalOnly !== undefined) params.set('vertical_only', verticalOnly.toString());
    return request<any>(`/media?${params.toString()}`);
  },

  getMediaDetails: async (id: number) => {
    if (supabase) {
      const { data } = await supabase.from('media_assets').select('*').eq('id', id).single();
      return data;
    }
    return request<any>(`/media/${id}`);
  },

  processMedia: (id: number, data: any) =>
    request<any>(`/media/${id}/process`, { method: 'POST', body: JSON.stringify(data) }),

  extractThumbnail: (id: number, timestamp: number) =>
    request<any>(`/media/${id}/thumbnail`, { method: 'POST', body: JSON.stringify({ timestamp }) }),

  deleteMedia: async (id: number) => {
    if (supabase) {
      await supabase.from('media_assets').update({ status: 'deleted' }).eq('id', id);
      return { status: 'success' };
    }
    return request(`/media/${id}`, { method: 'DELETE' });
  },

  // Drafts
  listDrafts: async (status?: string) => {
    if (supabase) {
      let q = supabase.from('drafts').select('*').order('updated_at', { ascending: false });
      if (status) q = q.eq('approval_status', status);
      const { data } = await q;
      return { items: data || [] };
    }
    const params = status ? `?approval_status=${status}` : '';
    return request<any>(`/drafts${params}`);
  },

  getDraft: async (id: number) => {
    if (supabase) {
      const { data } = await supabase.from('drafts').select('*, media_assets(*)').eq('id', id).single();
      return { ...data, asset: data?.media_assets };
    }
    return request<any>(`/drafts/${id}`);
  },

  updateDraft: async (id: number, body: any) => {
    if (supabase) {
      const { data, error } = await supabase.from('drafts').update(body).eq('id', id).select('*').single();
      if (error) throw new ApiError(error.message, 400);
      return data;
    }
    return request<any>(`/drafts/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
  },

  approveDraft: async (id: number) => {
    if (supabase) {
      await supabase.from('drafts').update({ approval_status: 'approved' }).eq('id', id);
      return { status: 'approved' };
    }
    return request<any>(`/drafts/${id}/approve`, { method: 'POST' });
  },

  convertMetadata: async (caption: string, mode: string, attribution?: string, defaultTags?: string[]) => {
    if (supabase) return invokeFn<any>('prepare-metadata', { caption, mode, attribution, default_tags: defaultTags });
    return request<any>('/drafts/convert-metadata', {
      method: 'POST',
      body: JSON.stringify({ caption, mode, attribution, default_tags: defaultTags }),
    });
  },

  getAiStatus: async () => {
    if (supabase) return { available: false, provider: 'deterministic', selected_model: 'rule-based' };
    return request<any>('/drafts/ai-status');
  },

  // Accounts & Readiness
  listAccounts: async () => {
    if (supabase) {
      const { data } = await supabase.from('social_accounts').select('*').order('created_at', { ascending: false });
      return data || [];
    }
    return request<any[]>('/accounts');
  },

  getReadiness: async () => {
    if (supabase) return invokeFn<any>('account-actions', { action: 'readiness' });
    return request<any>('/accounts/readiness');
  },

  connectPlatform: async (platform: string) => {
    if (supabase) {
      return invokeFn<any>(platform.toLowerCase() === 'youtube' ? 'connect-youtube' : 'connect-instagram', {});
    }
    return request<any>(`/accounts/${platform}/connect`, { method: 'POST' });
  },

  testAccount: async (id: number) => {
    if (supabase) return invokeFn<any>('account-actions', { action: 'test', account_id: id });
    return request<any>(`/accounts/${id}/test`, { method: 'POST' });
  },

  disconnectAccount: async (id: number) => {
    if (supabase) return invokeFn<any>('account-actions', { action: 'disconnect', account_id: id });
    return request(`/accounts/${id}`, { method: 'DELETE' });
  },

  saveGoogleCredentials: async (content: string) => {
    if (supabase) return invokeFn<any>('save-provider-credentials', { platform: 'youtube', content });
    return request<any>('/accounts/youtube/credentials', { method: 'POST', body: JSON.stringify({ content }) });
  },

  uploadGoogleCredentialsFile: async (file: File) => {
    if (supabase) {
      const content = await file.text();
      return invokeFn<any>('save-provider-credentials', { platform: 'youtube', content });
    }
    const fd = new FormData();
    fd.append('file', file);
    return request<any>('/accounts/youtube/credentials/file', { method: 'POST', body: fd });
  },

  saveInstagramCredentials: async (app_id: string, app_secret: string, login_mode = 'instagram_login') => {
    if (supabase) return invokeFn<any>('save-provider-credentials', { platform: 'instagram', app_id, app_secret, login_mode });
    return request<any>('/accounts/instagram/credentials', {
      method: 'POST',
      body: JSON.stringify({ app_id, app_secret, login_mode }),
    });
  },

  // Publishing Presets
  listPresets: async () => {
    if (supabase) {
      const { data } = await supabase.from('publishing_profiles').select('*').order('is_default', { ascending: false });
      return {
        items: (data || []).map((p: any) => ({
          id: p.id,
          name: p.name,
          is_default: p.is_default,
          ...(p.settings || {}),
        })),
      };
    }
    return request<{ items: any[] }>('/presets');
  },

  createPreset: async (body: any) => {
    if (supabase) {
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('publishing_profiles')
        .insert({ user_id: userData.user?.id, name: body.name, settings: body, is_default: Boolean(body.is_default) })
        .select('*')
        .single();
      if (error) throw new ApiError(error.message, 400);
      return data;
    }
    return request<any>('/presets', { method: 'POST', body: JSON.stringify(body) });
  },

  updatePreset: async (id: number, body: any) => {
    if (supabase) {
      const { data, error } = await supabase
        .from('publishing_profiles')
        .update({ name: body.name, settings: body, is_default: Boolean(body.is_default) })
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw new ApiError(error.message, 400);
      return { id: data.id, name: data.name, is_default: data.is_default, ...(data.settings || {}) };
    }
    return request<any>(`/presets/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
  },

  deletePreset: async (id: number) => {
    if (supabase) {
      await supabase.from('publishing_profiles').delete().eq('id', id);
      return { status: 'success' };
    }
    return request<any>(`/presets/${id}`, { method: 'DELETE' });
  },

  // Quick Publish
  quickPrepare: async (url: string, rights_confirmed = true, preset_id?: number) => {
    if (supabase) return invokeFn<any>('import-instagram', { url, rights_confirmed, preset_id });
    return request<any>('/quick-publish/prepare', {
      method: 'POST',
      body: JSON.stringify({ url, rights_confirmed, preset_id }),
    });
  },

  quickPublish: async (data: any) => {
    if (supabase) return invokeFn<any>('create-publishing-intent', data);
    return request<any>('/quick-publish/publish', { method: 'POST', body: JSON.stringify(data) });
  },

  getQuickPublishProgress: async (intentId: number) => {
    if (supabase) {
      const [{ data: intent }, { data: targets }] = await Promise.all([
        supabase.from('publishing_intents').select('*, drafts(title)').eq('id', intentId).single(),
        supabase.from('publication_targets').select('*, social_accounts(account_name, platform)').eq('intent_id', intentId),
      ]);
      const tList = targets || [];
      const allDone = tList.length > 0 && tList.every((t: any) => ['PUBLISHED', 'FAILED'].includes(t.status));
      const anyPub = tList.some((t: any) => t.status === 'PUBLISHED');
      const anyFail = tList.some((t: any) => t.status === 'FAILED');
      const status = intent?.status === 'SCHEDULED'
        ? 'scheduled'
        : allDone && anyPub && !anyFail
        ? 'published'
        : allDone && anyPub && anyFail
        ? 'partial_success'
        : allDone && anyFail
        ? 'failed'
        : 'processing';
      return {
        intent_id: intentId,
        status,
        percent: allDone ? 100 : 60,
        title: intent?.drafts?.title || 'Video',
        steps: [
          { key: 'source', label: 'Validate source & metadata', status: 'complete' },
          { key: 'dispatch', label: 'Cloud queue dispatch', status: allDone ? 'complete' : 'processing' },
          { key: 'verify', label: 'Verify final publication', status: allDone ? (anyPub ? 'complete' : 'failed') : 'pending' },
        ],
        targets: tList.map((t: any) => ({
          id: t.id,
          platform: t.social_accounts?.platform || t.platform_settings?.platform || 'youtube',
          account_name: t.social_accounts?.account_name || 'Account',
          status: t.status.toLowerCase(),
          platform_url: t.published_url,
          error_message: t.error_message,
        })),
      };
    }
    return request<any>(`/quick-publish/progress/${intentId}`);
  },

  // Publishing (legacy studio support)
  previewPublication: (draftId: number) => request<any>(`/publishing/preview?draft_id=${draftId}`, { method: 'POST' }),
  createPublishingIntent: (data: any) => {
    if (supabase) return invokeFn<any>('create-publishing-intent', data);
    return request<any>('/publishing/create', { method: 'POST', body: JSON.stringify(data) });
  },
  executePublishing: (id: number) => request<any>(`/publishing/${id}/execute`, { method: 'POST' }),
  cancelPublishing: (id: number) => request<any>(`/publishing/${id}/cancel`, { method: 'POST' }),
  getPublishingStatus: (id: number) => request<any>(`/publishing/${id}/status`),

  // Jobs
  listJobs: async (statusFilter?: string, limit = 30) => {
    if (supabase) {
      let q = supabase.from('processing_jobs').select('*').order('created_at', { ascending: false }).limit(limit);
      if (statusFilter) q = q.eq('status', statusFilter.toUpperCase());
      const { data } = await q;
      return { items: data || [] };
    }
    const params = new URLSearchParams({ limit: limit.toString() });
    if (statusFilter) params.set('status_filter', statusFilter);
    return request<any>(`/jobs?${params.toString()}`);
  },

  getJob: (id: number) => request<any>(`/jobs/${id}`),
  retryJob: (id: number) => request<any>(`/jobs/${id}/retry`, { method: 'POST' }),
  cancelJob: (id: number) => request<any>(`/jobs/${id}/cancel`, { method: 'POST' }),
  reconcileJob: (id: number) => request<any>(`/jobs/${id}/reconcile`, { method: 'POST' }),

  // Automations
  listAutomations: async () => {
    if (supabase) {
      const { data } = await supabase.from('automations').select('*').order('created_at', { ascending: false });
      return { items: data || [] };
    }
    return request<any>('/automations');
  },

  getAutomationTemplates: async () => {
    if (supabase) {
      return [
        {
          id: 'tpl_ig_yt',
          name: 'Instagram to YouTube + Instagram',
          description: 'Validate authorized media -> Generate deterministic metadata -> Publish to YouTube Shorts & Instagram Reels.',
          workflow_definition: {
            nodes: [
              { id: 'n1', type: 'url_submitted', data: { label: 'Authorized URL Submitted' } },
              { id: 'n2', type: 'generate_title', data: { label: 'Generate Title & Captions' } },
              { id: 'n3', type: 'publish_youtube', data: { label: 'Upload to YouTube Shorts' } },
            ],
            edges: [{ source: 'n1', target: 'n2' }, { source: 'n2', target: 'n3' }],
          },
        },
      ];
    }
    return request<any[]>('/automations/templates');
  },

  getAutomation: (id: number) => request<any>(`/automations/${id}`),

  createAutomation: async (body: any) => {
    if (supabase) {
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('automations')
        .insert({ user_id: userData.user?.id, ...body })
        .select('*')
        .single();
      if (error) throw new ApiError(error.message, 400);
      return data;
    }
    return request<any>('/automations', { method: 'POST', body: JSON.stringify(body) });
  },

  validateWorkflow: (workflow_definition: any) =>
    request<any>('/automations/validate', { method: 'POST', body: JSON.stringify({ workflow_definition }) }),

  dryRunWorkflow: (workflow_definition: any, sample_input?: any) =>
    request<any>('/automations/dry-run', { method: 'POST', body: JSON.stringify({ workflow_definition, sample_input }) }),

  runWorkflow: async (id: number, sample_input?: any) => {
    if (supabase) return invokeFn<any>('execute-automation', { automation_id: id, sample_input });
    return request<any>(`/automations/${id}/run`, { method: 'POST', body: JSON.stringify(sample_input || { rights_confirmed: true }) });
  },

  enableAutomation: async (id: number) => {
    if (supabase) {
      await supabase.from('automations').update({ enabled: true }).eq('id', id);
      return { enabled: true };
    }
    return request<any>(`/automations/${id}/enable`, { method: 'POST' });
  },

  disableAutomation: async (id: number) => {
    if (supabase) {
      await supabase.from('automations').update({ enabled: false }).eq('id', id);
      return { enabled: false };
    }
    return request<any>(`/automations/${id}/disable`, { method: 'POST' });
  },

  deleteAutomation: async (id: number) => {
    if (supabase) {
      await supabase.from('automations').delete().eq('id', id);
      return { status: 'success' };
    }
    return request(`/automations/${id}`, { method: 'DELETE' });
  },
};
