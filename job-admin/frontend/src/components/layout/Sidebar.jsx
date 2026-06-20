import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Activity,
  BriefcaseBusiness,
  Compass,
  Goal,
  History,
  LayoutDashboard,
  Settings,
  ShoppingBasket,
  Sparkles,
  Sprout,
  Tag,
  TrendingUp,
  Upload,
  UserRound,
  Wheat,
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { MATCH_VIEWS } from '../../pages/matchWorkspace';

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

const WORKSPACE_ICONS = {
  explore: Compass,
  basket: ShoppingBasket,
  harvest: Wheat,
  action: Goal,
  profile: UserRound,
};

const ADMIN_ITEMS = [
  { to: '/', icon: LayoutDashboard, title: 'Dashboard', sub: '系统总览', end: true },
  { to: '/jobs', icon: BriefcaseBusiness, title: 'Job Matrix', sub: '岗位画像库' },
  { to: '/ingest', icon: Upload, title: 'Ingestion', sub: '上传与构建' },
  { to: '/tags', icon: Tag, title: 'Tags Center', sub: '标签归一与统计' },
  { to: '/runs', icon: History, title: 'Run Logs', sub: '批次与记录' },
  { to: '/settings', icon: Settings, title: 'Settings', sub: '模型与并发配置' },
  { to: '/normalize', icon: Activity, title: 'Normalize', sub: '标签复查' },
  { to: '/tag-trends', icon: TrendingUp, title: 'Tag Trends', sub: '热榜与趋势分析' },
];

const SidebarItem = ({ to, icon, title, sub, badge, end = false }) => {
  const IconComponent = icon;
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-3 rounded-2xl border border-transparent px-3 py-2.5 transition-all duration-200',
          'hover:border-border hover:bg-surface-3/50 hover:text-tx-1',
          isActive && 'border-teal-border bg-gradient-to-br from-teal-dim to-transparent text-tx-1 shadow-sm shadow-teal-glow/5'
        )
      }
    >
      {({ isActive }) => (
        <>
          <div className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-3/30 text-tx-3 transition-all duration-200 group-hover:scale-110',
            isActive && 'border-teal-border bg-teal-dim text-teal'
          )}>
            <IconComponent size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <div className={cn('truncate text-[13px] font-bold text-tx-2 transition-colors', isActive && 'text-tx-1')}>
              {title}
            </div>
            <div className={cn('truncate text-[10.5px] font-medium text-tx-3 transition-colors', isActive && 'text-teal/70')}>
              {sub}
            </div>
          </div>
          {badge ? (
            <span className="rounded-md border border-border bg-surface-3/50 px-1.5 py-0.5 font-mono text-[9px] font-bold text-tx-3 group-hover:text-tx-2">
              {badge}
            </span>
          ) : null}
        </>
      )}
    </NavLink>
  );
};

const Sidebar = () => {
  const location = useLocation();
  const inWorkspace = location.pathname === '/match' || location.pathname.startsWith('/match/');

  return (
    <aside className="sticky top-0 z-20 flex h-screen w-[296px] shrink-0 flex-col overflow-y-auto border-r border-border bg-bg px-4 pb-4 pt-4 transition-colors duration-300">
      {/* Balanced & Compact Header */}
      <div className="relative overflow-hidden rounded-xl border border-border bg-surface-2 p-4 shadow-sm shrink-0">
        <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-teal/5 blur-[40px]" />
        
        <div className="flex items-center gap-3 relative z-10">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-teal-border bg-teal-dim text-teal shadow-sm">
            <Sprout size={20} />
          </div>
          <div className="min-w-0">
            <h1 className="text-[18px] font-display font-black tracking-tight text-tx-1 leading-none">
              Job <span className="text-teal">system</span>
            </h1>
            <div className="mt-1 flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-teal animate-pulse" />
              <span className="text-[9px] font-bold uppercase tracking-widest text-tx-3">Admin Console</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 flex-1">
        <div className="px-3 text-[10px] font-bold uppercase tracking-[0.25em] text-tx-4 mb-4">Core Processing</div>
        <nav className="space-y-1.5">
          {ADMIN_ITEMS.map((item) => (
            <SidebarItem key={item.to} {...item} />
          ))}
        </nav>
      </div>

      <div className="mt-6 rounded-3xl border border-border-2 bg-surface-2 p-5 shadow-sm transition-all duration-300">
        <div className="flex items-center justify-between text-[11px] font-semibold mb-3">
          <span className="text-tx-2">Workspace Status</span>
          <span className="text-teal">ONLINE</span>
        </div>
        <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-bg/50">
          <div 
            className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-teal to-amber shadow-[0_0_10px_var(--teal-dim)]" 
            style={{ width: '78%' }} 
          />
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-border-2 pt-3 text-[10px] font-mono font-medium text-tx-3">
          <div className="flex items-center gap-1.5">
            <div className="h-1 w-1 rounded-full bg-tx-4" />
            orchard-v2
          </div>
          <span>UTF-8</span>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
