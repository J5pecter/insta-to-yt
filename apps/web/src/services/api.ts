export class ApiError extends Error {
  status: number;
  details?: any;

  constructor(message: string, status: number, details?: any) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const API_BASE = '/api/v1';

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

export const api = {
  // Auth
  login: (password: string, email?: string) =>
    request<{ status: string; token: string; user: any }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password, email }),
    }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  getMe: () => request<any>('/auth/me'),
  changePassword: (current_password: string, new_password: string) =>
    request('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ current_password, new_password }),
    }),

  // Dashboard & Metrics
  getDashboard: () => request<any>('/dashboard'),
  getCalendar: (startDate?: string, endDate?: string) => {
    const params = new URLSearchParams();
    if (startDate) params.set('start_date', startDate);
    if (endDate) params.set('end_date', endDate);
    return request<any>(`/calendar?${params.toString()}`);
  },
  getAnalytics: () => request<any>('/analytics'),
  getNotifications: () => request<any>('/notifications'),
  markNotificationRead: (id: number) => request(`/notifications/${id}/read`, { method: 'POST' }),
  getAuditLogs: (limit = 50) => request<any>(`/audit-logs?limit=${limit}`),
  getSystemHealth: () => request<any>('/system/health'),
  getStorageStats: () => request<any>('/system/storage'),
  cleanupStorage: () => request('/system/storage/cleanup', { method: 'POST' }),
  createBackup: () => request<any>('/system/backup', { method: 'POST' }),

  // Imports
  importUrl: (url: string, rights_confirmed = true) =>
    request<any>('/imports/url', {
      method: 'POST',
      body: JSON.stringify({ url, rights_confirmed }),
    }),
  importFile: (formData: FormData) =>
    request<any>('/imports/file', {
      method: 'POST',
      body: formData,
    }),
  importBulk: (links: string, rights_confirmed = true) =>
    request<any>('/imports/bulk', {
      method: 'POST',
      body: JSON.stringify({ links, rights_confirmed }),
    }),

  // Media
  listMedia: (page = 1, limit = 20, verticalOnly?: boolean) => {
    const params = new URLSearchParams({ page: page.toString(), limit: limit.toString() });
    if (verticalOnly !== undefined) params.set('vertical_only', verticalOnly.toString());
    return request<any>(`/media?${params.toString()}`);
  },
  getMediaDetails: (id: number) => request<any>(`/media/${id}`),
  processMedia: (id: number, data: any) =>
    request<any>(`/media/${id}/process`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  extractThumbnail: (id: number, timestamp: number) =>
    request<any>(`/media/${id}/thumbnail`, {
      method: 'POST',
      body: JSON.stringify({ timestamp }),
    }),
  deleteMedia: (id: number) => request(`/media/${id}`, { method: 'DELETE' }),

  // Drafts
  listDrafts: (status?: string) => {
    const params = status ? `?approval_status=${status}` : '';
    return request<any>(`/drafts${params}`);
  },
  getDraft: (id: number) => request<any>(`/drafts/${id}`),
  updateDraft: (id: number, data: any) =>
    request<any>(`/drafts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  approveDraft: (id: number) => request<any>(`/drafts/${id}/approve`, { method: 'POST' }),
  convertMetadata: (caption: string, mode: string, attribution?: string, defaultTags?: string[]) =>
    request<any>('/drafts/convert-metadata', {
      method: 'POST',
      body: JSON.stringify({ caption, mode, attribution, default_tags: defaultTags }),
    }),
  getAiStatus: () => request<any>('/drafts/ai-status'),

  // Accounts & Readiness
  listAccounts: () => request<any[]>('/accounts'),
  getReadiness: () => request<any>('/accounts/readiness'),
  connectPlatform: (platform: string) => request<any>(`/accounts/${platform}/connect`, { method: 'POST' }),
  testAccount: (id: number) => request<any>(`/accounts/${id}/test`, { method: 'POST' }),
  disconnectAccount: (id: number) => request(`/accounts/${id}`, { method: 'DELETE' }),
  saveGoogleCredentials: (content: string) =>
    request<any>('/accounts/youtube/credentials', {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
  uploadGoogleCredentialsFile: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return request<any>('/accounts/youtube/credentials/file', {
      method: 'POST',
      body: fd,
    });
  },
  saveInstagramCredentials: (app_id: string, app_secret: string, login_mode = 'instagram_login') =>
    request<any>('/accounts/instagram/credentials', {
      method: 'POST',
      body: JSON.stringify({ app_id, app_secret, login_mode }),
    }),

  // Publishing Presets
  listPresets: () => request<{ items: any[] }>('/presets'),
  createPreset: (data: any) =>
    request<any>('/presets', { method: 'POST', body: JSON.stringify(data) }),
  updatePreset: (id: number, data: any) =>
    request<any>(`/presets/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deletePreset: (id: number) => request<any>(`/presets/${id}`, { method: 'DELETE' }),

  // Quick Publish
  quickPrepare: (url: string, rights_confirmed = true, preset_id?: number) =>
    request<any>('/quick-publish/prepare', {
      method: 'POST',
      body: JSON.stringify({ url, rights_confirmed, preset_id }),
    }),
  quickPublish: (data: any) =>
    request<any>('/quick-publish/publish', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getQuickPublishProgress: (intentId: number) =>
    request<any>(`/quick-publish/progress/${intentId}`),

  // Publishing
  previewPublication: (draftId: number) => request<any>(`/publishing/preview?draft_id=${draftId}`, { method: 'POST' }),
  createPublishingIntent: (data: any) =>
    request<any>('/publishing/create', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  executePublishing: (id: number) => request<any>(`/publishing/${id}/execute`, { method: 'POST' }),
  cancelPublishing: (id: number) => request<any>(`/publishing/${id}/cancel`, { method: 'POST' }),
  getPublishingStatus: (id: number) => request<any>(`/publishing/${id}/status`),

  // Jobs
  listJobs: (statusFilter?: string, limit = 30) => {
    const params = new URLSearchParams({ limit: limit.toString() });
    if (statusFilter) params.set('status_filter', statusFilter);
    return request<any>(`/jobs?${params.toString()}`);
  },
  getJob: (id: number) => request<any>(`/jobs/${id}`),
  retryJob: (id: number) => request<any>(`/jobs/${id}/retry`, { method: 'POST' }),
  cancelJob: (id: number) => request<any>(`/jobs/${id}/cancel`, { method: 'POST' }),
  reconcileJob: (id: number) => request<any>(`/jobs/${id}/reconcile`, { method: 'POST' }),

  // Automations
  listAutomations: () => request<any>('/automations'),
  getAutomationTemplates: () => request<any[]>('/automations/templates'),
  getAutomation: (id: number) => request<any>(`/automations/${id}`),
  createAutomation: (data: any) =>
    request<any>('/automations', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  validateWorkflow: (workflow_definition: any) =>
    request<any>('/automations/validate', {
      method: 'POST',
      body: JSON.stringify({ workflow_definition }),
    }),
  dryRunWorkflow: (workflow_definition: any, sample_input?: any) =>
    request<any>('/automations/dry-run', {
      method: 'POST',
      body: JSON.stringify({ workflow_definition, sample_input }),
    }),
  runWorkflow: (id: number, sample_input?: any) =>
    request<any>(`/automations/${id}/run`, {
      method: 'POST',
      body: JSON.stringify(sample_input || { rights_confirmed: true }),
    }),
  enableAutomation: (id: number) => request<any>(`/automations/${id}/enable`, { method: 'POST' }),
  disableAutomation: (id: number) => request<any>(`/automations/${id}/disable`, { method: 'POST' }),
  deleteAutomation: (id: number) => request(`/automations/${id}`, { method: 'DELETE' }),
};
