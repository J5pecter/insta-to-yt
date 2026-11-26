import React, { useState, useEffect, useCallback } from 'react';
import { api } from './services/api';
import { User } from './types';
import { FeedbackProvider } from './components/Feedback';
import { Sidebar, TopHeader, MobileBottomNav } from './components/Navigation';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { QuickPublishPage } from './pages/QuickPublishPage';
import { LibraryPage } from './pages/LibraryPage';
import { ContentStudioPage } from './pages/ContentStudioPage';
import { CalendarPage } from './pages/CalendarPage';
import { AutomationsPage } from './pages/AutomationsPage';
import { QueuePage } from './pages/QueuePage';
import { AccountsPage } from './pages/AccountsPage';
import { SettingsPage } from './pages/SettingsPage';

export const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [currentTab, setCurrentTab] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('tab') || 'quick-publish';
  });
  const [navMeta, setNavMeta] = useState<any>({});
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [readiness, setReadiness] = useState<any>(null);

  const loadReadiness = useCallback(async () => {
    try {
      const r = await api.getReadiness();
      setReadiness(r);
    } catch {
      // Ignore if unauthenticated
    }
  }, []);

  useEffect(() => {
    const verifyAuth = async () => {
      try {
        const u = await api.getMe();
        setUser(u);
        await loadReadiness();
      } catch {
        setUser(null);
      } finally {
        setCheckingAuth(false);
      }
    };
    verifyAuth();
  }, [loadReadiness]);

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {}
    localStorage.removeItem('socialrelay_token');
    setUser(null);
    setReadiness(null);
  };

  const handleNavigate = (tab: string, meta?: any) => {
    // Map legacy V1 tab IDs cleanly to V2 8-module nav
    const normalized =
      tab === 'dashboard'
        ? 'overview'
        : tab === 'import'
        ? 'quick-publish'
        : tab === 'media' || tab === 'drafts'
        ? 'library'
        : tab === 'calendar'
        ? 'schedule'
        : tab === 'automations'
        ? 'automation'
        : tab === 'queue'
        ? 'history'
        : tab === 'system' || tab === 'analytics'
        ? 'settings'
        : tab;

    setCurrentTab(normalized);
    if (meta) setNavMeta(meta);
    else if (tab === 'media' || tab === 'drafts') setNavMeta({ librarySubTab: tab });
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return (
      <FeedbackProvider>
        <LoginPage
          onLoginSuccess={(u) => {
            setUser(u);
            loadReadiness();
          }}
        />
      </FeedbackProvider>
    );
  }

  return (
    <FeedbackProvider>
      <div className="min-h-screen bg-background text-foreground flex overflow-x-hidden">
        {/* Desktop Persistent Sidebar */}
        <Sidebar
          currentTab={currentTab}
          onSelectTab={(t) => handleNavigate(t)}
          onLogout={handleLogout}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />

        {/* Single Workspace Column (Header + Main Content aligned) */}
        <div className="flex-1 min-w-0 flex flex-col min-h-screen">
          <TopHeader
            currentTab={currentTab}
            userEmail={user.email}
            readiness={readiness}
            onSelectTab={(t) => handleNavigate(t)}
            onLogout={handleLogout}
          />

          <main className="flex-1 min-w-0 p-4 md:p-6 pb-24 md:pb-6 overflow-y-auto">
            {currentTab === 'overview' && (
              <DashboardPage
                onNavigate={handleNavigate}
                onOpenQuickImport={() => handleNavigate('quick-publish')}
              />
            )}
            {currentTab === 'quick-publish' && (
              <QuickPublishPage
                readiness={readiness}
                onNavigate={handleNavigate}
                onRefreshReadiness={loadReadiness}
              />
            )}
            {currentTab === 'library' && (
              <LibraryPage
                initialSubTab={navMeta.librarySubTab || 'media'}
                initialDraftId={navMeta.draftId}
                onNavigate={handleNavigate}
              />
            )}
            {currentTab === 'studio' && (
              <ContentStudioPage initialDraftId={navMeta.draftId} onNavigate={handleNavigate} />
            )}
            {currentTab === 'schedule' && <CalendarPage onNavigate={handleNavigate} />}
            {currentTab === 'automation' && <AutomationsPage />}
            {currentTab === 'history' && <QueuePage />}
            {currentTab === 'accounts' && <AccountsPage onReadinessChanged={loadReadiness} />}
            {currentTab === 'settings' && <SettingsPage />}
          </main>
        </div>

        {/* Mobile Bottom Navigation */}
        <MobileBottomNav currentTab={currentTab} onSelectTab={(t) => handleNavigate(t)} />
      </div>
    </FeedbackProvider>
  );
};

export default App;
