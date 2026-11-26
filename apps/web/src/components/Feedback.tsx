import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertTriangle, Info, X, AlertCircle } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
}

interface FeedbackContextValue {
  notify: (message: string, type?: ToastType) => void;
  confirmAction: (opts: ConfirmOptions) => Promise<boolean>;
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export const useFeedback = (): FeedbackContextValue => {
  const ctx = useContext(FeedbackContext);
  if (!ctx) {
    throw new Error('useFeedback must be used within FeedbackProvider');
  }
  return ctx;
};

export const FeedbackProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<{
    opts: ConfirmOptions;
    resolve: (val: boolean) => void;
  } | null>(null);

  const notify = useCallback((message: string, type: ToastType = 'info') => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const confirmAction = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({ opts, resolve });
    });
  }, []);

  const handleCloseConfirm = (val: boolean) => {
    if (confirmState) {
      confirmState.resolve(val);
      setConfirmState(null);
    }
  };

  return (
    <FeedbackContext.Provider value={{ notify, confirmAction }}>
      {children}

      {/* Accessible Toast Stack */}
      <div
        aria-live="polite"
        className="fixed bottom-20 md:bottom-6 right-4 z-50 flex flex-col space-y-2 max-w-sm w-full pointer-events-none"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex items-start space-x-3 p-3.5 rounded-xl border shadow-xl bg-surface text-sm ${
              t.type === 'success'
                ? 'border-success/40 text-foreground'
                : t.type === 'error'
                ? 'border-destructive/40 text-foreground'
                : t.type === 'warning'
                ? 'border-warning/40 text-foreground'
                : 'border-border text-foreground'
            }`}
          >
            {t.type === 'success' && <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />}
            {t.type === 'error' && <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />}
            {t.type === 'warning' && <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />}
            {t.type === 'info' && <Info className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />}
            <span className="flex-1 text-xs leading-relaxed">{t.message}</span>
            <button
              type="button"
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              className="text-muted hover:text-foreground"
              aria-label="Dismiss notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Accessible Confirmation Dialog */}
      {confirmState && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
        >
          <div className="bg-surface border border-border rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-semibold text-foreground">{confirmState.opts.title}</h3>
            <p className="text-xs text-muted leading-relaxed">{confirmState.opts.message}</p>
            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => handleCloseConfirm(false)}
                className="px-4 py-2 rounded-lg bg-elevated border border-border text-xs font-medium text-foreground hover:bg-border/50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleCloseConfirm(true)}
                className={`px-4 py-2 rounded-lg text-xs font-semibold text-white ${
                  confirmState.opts.destructive
                    ? 'bg-destructive hover:bg-destructive/90'
                    : 'bg-primary hover:bg-primary-hover'
                }`}
              >
                {confirmState.opts.confirmLabel || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </FeedbackContext.Provider>
  );
};
