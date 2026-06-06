import React, { createContext, useContext, useState, useCallback } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '../components/ui/Button';

const ToastContext = createContext(null);

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((msg, type = 'info', duration = 3000) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, msg, type }]);
    
    if (duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration);
    }
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div 
            key={t.id} 
            className={cn(
              "pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg shadow-2xl border bg-bg animate-in slide-in-from-right duration-300",
              t.type === 'success' ? "border-teal/30 text-teal" : 
              t.type === 'error' ? "border-red/30 text-red" : 
              "border-border text-tx-1"
            )}
            onClick={() => removeToast(t.id)}
          >
            {t.type === 'success' ? <CheckCircle2 size={16} /> : 
             t.type === 'error' ? <AlertCircle size={16} /> : 
             <Info size={16} />}
            <span className="text-[12px] font-semibold">{t.msg}</span>
            <button className="ml-2 hover:bg-surface-2 p-1 rounded-full transition-colors">
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
};
