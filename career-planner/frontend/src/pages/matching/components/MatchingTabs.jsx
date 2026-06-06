import React from 'react';
import { motion } from 'framer-motion';
import { NavLink } from 'react-router-dom';
import {
  Compass,
  LayoutGrid,
  ShoppingBasket,
  Target,
  UserRound,
  Wheat,
  ChevronUp,
} from 'lucide-react';
import { useData } from '../../../context/DataContext';
import { MATCH_VIEWS } from '../../../services/matchWorkspace';
import { cn } from '../../../components/ui/Button';

const VIEW_ICONS = {
  explore: Compass,
  basket: ShoppingBasket,
  harvest: Wheat,
  action: Target,
  profile: UserRound,
};

const getViewCount = (viewId, matchWorkspace) => {
  if (viewId === 'basket') {
    return matchWorkspace.currentBasket?.jobIds?.length ||
      matchWorkspace.basketHistory?.length ||
      matchWorkspace.harvests?.length ||
      0;
  }
  if (viewId === 'harvest') return matchWorkspace.harvests?.length || 0;
  return 0;
};

const MatchingTabs = ({ activeViewId }) => {
  const { matchWorkspace } = useData();
  const [isCollapsed, setIsCollapsed] = React.useState(false);

  return (
    <div className={cn(
      "sticky top-0 z-50 bg-[var(--surface-0)] border-b border-gray-100 px-8 transition-all duration-300 ease-in-out",
      isCollapsed ? "pt-2 pb-1" : "pt-6 pb-2"
    )}>
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar relative pr-12">
        {MATCH_VIEWS.map((view) => {
          const isActive = activeViewId === view.id;
          const count = getViewCount(view.id, matchWorkspace);
          const Icon = VIEW_ICONS[view.id] || LayoutGrid;

          return (
            <NavLink
              key={view.id}
              to={view.route}
              className={cn(
                'group relative flex items-center gap-2.5 px-6 py-3 rounded-t-sm transition-all duration-300',
                isActive
                  ? 'bg-gray-50 text-[var(--tx-1)] border-x border-t border-gray-200'
                  : 'text-gray-500 hover:text-gray-700',
              )}
            >
              <span
                className={cn(
                  'transition-transform duration-300',
                  isActive ? 'text-[var(--teal)] scale-110' : 'group-hover:scale-110',
                )}
              >
                <Icon size={isCollapsed ? 16 : 18} />
              </span>
              {!isCollapsed && (
                <span className="text-[13px] font-bold tracking-tight whitespace-nowrap">
                  {view.label}
                  {count > 0 && (
                    <span
                      className={cn(
                        'ml-2 text-[10px] px-1 rounded-full',
                        isActive ? 'bg-teal-500 text-white' : 'bg-gray-100 text-gray-400',
                      )}
                    >
                      {count}
                    </span>
                  )}
                </span>
              )}

              {isActive && (
                <motion.div
                  layoutId="matchingActiveTab"
                  className="absolute bottom-[-1px] left-0 right-0 h-1 bg-[var(--teal)] z-10"
                />
              )}
            </NavLink>
          );
        })}

        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={cn(
            "ml-auto flex h-8 w-8 items-center justify-center rounded-md border border-gray-100 bg-white text-gray-400 transition-all hover:border-teal-500 hover:text-teal-500",
            isCollapsed && "rotate-180"
          )}
          title={isCollapsed ? "展开状态栏" : "收起状态栏"}
        >
          <ChevronUp size={16} />
        </button>
      </div>
    </div>
  );
};

export default MatchingTabs;
