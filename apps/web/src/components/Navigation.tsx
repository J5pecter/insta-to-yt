import React, { useState } from 'react';
import {
  LayoutDashboard,
  Zap,
  FolderOpen,
  Calendar,
  Cpu,
  History,
  Share2,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Menu,
  X,
} from 'lucide-react';

export interface ReadinessSummary {
  state: string;
  label: string;
  ready: boolean;
}

interface NavigationProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  onLogout: () => void;
  userEmail: string;
  readiness: ReadinessSummary | null;
}

export const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'quick-publish', label: 'Quick Publish', icon: Zap },
  { id: 'library', label: 'Library', icon: FolderOpen },
  { id: 'schedule', label: 'Schedule', icon: Calendar },
  { id: 'automation', label: 'Automation', icon: Cpu },
  { id: 'history', label: 'History', icon: History },
  { id: 'accounts', label: 'Accounts', icon: Share2 },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export const Sidebar: React.FC<{
  currentTab: string;
  onSelectTab: (tab: string) => void;
  onLogout: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}> = ({ currentTab, onSelectTab, onLogout, collapsed, onToggleCollapse }) => {
  return (
    <aside
      className={`hidden md:flex flex-col flex-shrink-0 border-r border-border bg-surface transition-all duration-200 select-none ${
        collapsed ? 'w-16' : 'w-56'
      }`}
    >
      {/* Brand header aligned with 56px top bar */}
      <div className="flex items-center justify-between h-14 px-3.5 border-b border-border">
        <button
          type="button"
          onClick={() => onSelectTab('quick-publish')}
          className="flex items-center space-x-2.5 overflow-hidden text-left"
        >
          <div className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center text-primary flex-shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          {!collapsed && <span className="font-bold text-sm tracking-tight text-foreground truncate">SocialRelay</span>}
        </button>
        <button
          type="button"
          onClick={onToggleCollapse}
          className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-elevated transition-colors"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* 8 Primary Nav Items */}
      <nav className="flex-1 px-2.5 py-3 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = currentTab === item.id || (currentTab === 'studio' && item.id === 'library');
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-primary/15 text-primary border border-primary/25'
                  : 'text-muted hover:text-foreground hover:bg-elevated border border-transparent'
              } ${collapsed ? 'justify-center px-0' : ''}`}
              title={collapsed ? item.label : undefined}
            >
              <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-primary' : 'text-muted'}`} />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Footer Logout */}
      <div className="p-2.5 border-t border-border">
        <button
          type="button"
          onClick={onLogout}
          className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium text-muted hover:text-destructive hover:bg-destructive/10 transition-colors ${
            collapsed ? 'justify-center px-0' : ''
          }`}
          title="Log Out"
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span>Log Out</span>}
        </button>
      </div>
    </aside>
  );
};

export const TopHeader: React.FC<{
  currentTab: string;
  userEmail: string;
  readiness: ReadinessSummary | null;
  onSelectTab: (tab: string) => void;
  onLogout: () => void;
}> = ({ currentTab, userEmail, readiness, onSelectTab, onLogout }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const activeItem = NAV_ITEMS.find((i) => i.id === currentTab) || {
    label: currentTab === 'studio' ? 'Content Studio' : 'SocialRelay',
  };

  return (
    <>
      <header className="h-14 flex-shrink-0 border-b border-border bg-surface/80 backdrop-blur px-4 md:px-6 flex items-center justify-between gap-4">
        <div className="flex items-center space-x-3 min-w-0">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="md:hidden p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-elevated"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-sm font-semibold text-foreground truncate">{activeItem.label}</span>
        </div>

        <div className="flex items-center space-x-3">
          {/* Global Account Readiness Pill */}
          <button
            type="button"
            onClick={() => onSelectTab('accounts')}
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
              readiness?.ready
                ? 'bg-success/10 border-success/30 text-success hover:bg-success/15'
                : readiness?.state === 'account_authorization_expired' || readiness?.state === 'storage_unavailable'
                ? 'bg-destructive/10 border-destructive/30 text-destructive hover:bg-destructive/15'
                : 'bg-warning/10 border-warning/30 text-warning hover:bg-warning/15'
            }`}
            title="Click to inspect or configure accounts"
          >
            {readiness?.ready ? (
              <CheckCircle2 className="w-3.5 h-3.5" />
            ) : readiness?.state === 'account_authorization_expired' ? (
              <AlertCircle className="w-3.5 h-3.5" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline">{readiness?.label || 'Checking status...'}</span>
          </button>

          <span className="hidden lg:inline text-xs text-muted truncate max-w-[180px]">{userEmail}</span>
        </div>
      </header>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div className="fixed inset-0 bg-black/70" onClick={() => setMobileMenuOpen(false)} />
          <div className="relative w-64 max-w-[80vw] bg-surface border-r border-border flex flex-col h-full z-10">
            <div className="h-14 px-4 border-b border-border flex items-center justify-between">
              <span className="font-bold text-sm text-foreground flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <span>SocialRelay</span>
              </span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 text-muted hover:text-foreground"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = currentTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onSelectTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium ${
                      active ? 'bg-primary/15 text-primary' : 'text-muted hover:text-foreground hover:bg-elevated'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="p-3 border-t border-border">
              <button
                type="button"
                onClick={onLogout}
                className="w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10"
              >
                <LogOut className="w-4 h-4" />
                <span>Log Out</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export const MobileBottomNav: React.FC<{
  currentTab: string;
  onSelectTab: (tab: string) => void;
}> = ({ currentTab, onSelectTab }) => {
  const mobileItems = [
    NAV_ITEMS[0], // Overview
    NAV_ITEMS[1], // Quick Publish
    NAV_ITEMS[2], // Library
    NAV_ITEMS[5], // History
    NAV_ITEMS[6], // Accounts
  ];
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface border-t border-border h-16 px-2 flex items-center justify-around">
      {mobileItems.map((item) => {
        const Icon = item.icon;
        const active = currentTab === item.id || (currentTab === 'studio' && item.id === 'library');
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelectTab(item.id)}
            className={`flex flex-col items-center justify-center space-y-1 px-2 py-1 rounded-lg text-[11px] font-medium ${
              active ? 'text-primary' : 'text-muted'
            }`}
          >
            <Icon className="w-5 h-5" />
            <span className="truncate max-w-[68px]">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
