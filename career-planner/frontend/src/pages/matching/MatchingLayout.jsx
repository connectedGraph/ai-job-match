import React, { useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ShoppingBasket } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { MATCH_VIEWS } from '../../services/matchWorkspace';
import MatchingTabs from './components/MatchingTabs';

const MATCHING_BASE_PATH = '/matching';
const MATCH_VIEW_IDS = new Set(MATCH_VIEWS.map((view) => view.id));

const getActiveViewId = (pathname) => {
  const parts = String(pathname || '').split('/').filter(Boolean);
  const viewId = parts[parts.length - 1];
  return MATCH_VIEW_IDS.has(viewId) ? viewId : 'explore';
};

const getMatchingPath = (viewId) => `${MATCHING_BASE_PATH}/${viewId}`;

const MatchingLayout = () => {
  const { matchWorkspace, loading } = useData();
  const location = useLocation();
  const navigate = useNavigate();
  const activeViewId = useMemo(() => getActiveViewId(location.pathname), [location.pathname]);

  if (loading && !matchWorkspace.generatedAt) {
    return (
      <div className="h-[80vh] flex flex-col items-center justify-center">
        <div className="w-16 h-16 border-4 border-teal-500/20 border-t-teal-500 rounded-full animate-spin mb-4" />
        <p className="text-gray-500 font-medium">加载个人化果园中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-full flex flex-col bg-[var(--surface-0)]">
      <MatchingTabs activeViewId={activeViewId} />

      <main className="flex-1 overflow-y-auto px-8 pt-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeViewId}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      {activeViewId === 'explore' && matchWorkspace.currentBasket?.jobIds?.length > 0 && (
        <motion.div
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[60]"
        >
          <button
            type="button"
            onClick={() => navigate(getMatchingPath('basket'))}
            className="bg-amber-600 hover:bg-amber-500 text-white px-6 py-3 rounded-full shadow-2xl shadow-amber-600/30 flex items-center gap-2 font-bold transition-all hover:scale-105 active:scale-95"
          >
            <ShoppingBasket size={20} />
            查看篮子 ({matchWorkspace.currentBasket.jobIds.length})
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping ml-1" />
          </button>
        </motion.div>
      )}
    </div>
  );
};

export default MatchingLayout;
