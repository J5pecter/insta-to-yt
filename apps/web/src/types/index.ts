export type Role = 'admin' | 'user';

export interface User {
  id: number;
  email: string;
  role: Role;
  timezone: string;
}

export interface SocialAccount {
  id: number;
  platform: 'youtube' | 'instagram';
  account_id: string;
  account_name: string;
  custom_url?: string;
  avatar_url?: string;
  connection_status: 'connected' | 'expired' | 'revoked';
  is_expired: boolean;
  token_expiry?: string;
  permissions?: string[];
  last_published_at?: string;
  created_at: string;
}

export interface MediaAsset {
  id: number;
  source_id?: number;
  provider: string;
  source_url?: string;
  source_account?: string;
  original_caption?: string;
  duration?: number;
  width?: number;
  height?: number;
  fps?: number;
  file_size: number;
  is_vertical: boolean;
  has_thumbnail: boolean;
  thumbnail_url?: string;
  stream_url?: string;
  created_at: string;
}

export interface ContentDraft {
  id: number;
  media_asset_id: number;
  title: string;
  description?: string;
  caption?: string;
  hashtags?: string[];
  category_id?: string;
  language?: string;
  approval_status: 'draft' | 'awaiting_approval' | 'approved';
  duration?: number;
  is_vertical?: boolean;
  thumbnail_url?: string;
  updated_at: string;
}

export interface Job {
  id: number;
  job_type: string;
  target_id?: number;
  status: string;
  attempts: number;
  max_attempts: number;
  progress: number;
  error_code?: string;
  error_message?: string;
  run_at: string;
  updated_at: string;
}

export interface AutomationNode {
  id: string;
  type: string;
  data: {
    label: string;
    config?: Record<string, any>;
  };
}

export interface AutomationEdge {
  source: string;
  target: string;
}

export interface Automation {
  id: number;
  name: string;
  description?: string;
  enabled: boolean;
  workflow_definition: {
    nodes: AutomationNode[];
    edges: AutomationEdge[];
  };
  created_at: string;
  updated_at: string;
}

export interface DashboardMetrics {
  total_imported: number;
  total_published: number;
  pending_drafts: number;
  scheduled_count: number;
  active_jobs: number;
  failed_jobs: number;
  connected_accounts: number;
  storage_free_mb: number;
}
