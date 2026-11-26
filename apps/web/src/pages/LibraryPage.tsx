import React, { useState } from 'react';
import { Film, Layers, FileEdit } from 'lucide-react';
import { MediaLibraryPage } from './MediaLibraryPage';
import { DraftsPage } from './DraftsPage';
import { ContentStudioPage } from './ContentStudioPage';

interface LibraryPageProps {
  initialSubTab?: 'media' | 'drafts' | 'studio';
  initialDraftId?: number;
  onNavigate: (tab: string, meta?: any) => void;
}

export const LibraryPage: React.FC<LibraryPageProps> = ({
  initialSubTab = 'media',
  initialDraftId,
  onNavigate,
}) => {
  const [subTab, setSubTab] = useState<'media' | 'drafts' | 'studio'>(initialSubTab);
  const [draftId, setDraftId] = useState<number | undefined>(initialDraftId);

  const handleInnerNavigate = (tab: string, meta?: any) => {
    if (tab === 'studio') {
      if (meta?.draftId) setDraftId(meta.draftId);
      setSubTab('studio');
      return;
    }
    if (tab === 'drafts') {
      setSubTab('drafts');
      return;
    }
    if (tab === 'media') {
      setSubTab('media');
      return;
    }
    onNavigate(tab, meta);
  };

  return (
    <div className="space-y-5 w-full min-w-0">
      <div className="flex items-center space-x-2 border-b border-border pb-3">
        <button
          type="button"
          onClick={() => setSubTab('media')}
          className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors ${
            subTab === 'media' ? 'bg-primary/15 text-primary border border-primary/30' : 'text-muted hover:text-foreground'
          }`}
        >
          <Film className="w-3.5 h-3.5" />
          <span>Media Library</span>
        </button>
        <button
          type="button"
          onClick={() => setSubTab('drafts')}
          className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors ${
            subTab === 'drafts' ? 'bg-primary/15 text-primary border border-primary/30' : 'text-muted hover:text-foreground'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Drafts</span>
        </button>
        <button
          type="button"
          onClick={() => setSubTab('studio')}
          className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors ${
            subTab === 'studio' ? 'bg-primary/15 text-primary border border-primary/30' : 'text-muted hover:text-foreground'
          }`}
        >
          <FileEdit className="w-3.5 h-3.5" />
          <span>Content Studio</span>
        </button>
      </div>

      {subTab === 'media' && <MediaLibraryPage onNavigate={handleInnerNavigate} />}
      {subTab === 'drafts' && <DraftsPage onNavigate={handleInnerNavigate} />}
      {subTab === 'studio' && <ContentStudioPage initialDraftId={draftId} onNavigate={handleInnerNavigate} />}
    </div>
  );
};
