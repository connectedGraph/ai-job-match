import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  UserCircle,
  Briefcase,
  FileText,
  Cpu,
  Settings,
  LogOut,
  CircleDot,
  PanelLeftClose,
  Target,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { cn } from './ui/Button';

const Sidebar = () => {
  const { logout } = useAuth();
  const { syncing } = useData();
  const [isCollapsed, setIsCollapsed] = React.useState(false);

  const navItems = [
    { name: '我的画像', path: '/', icon: UserCircle, category: '核心功能' },
    { name: '人岗匹配', path: '/matching', icon: Briefcase },
    { name: '投递行动', path: '/action-plan', icon: Target },
    { name: '职业报告', path: '/report', icon: FileText },
    { name: 'AI 画像评估', path: '/ai-eval', icon: Cpu, category: 'AI 工具' },
  ];

  return (
    <aside className={cn(
      "z-30 flex h-screen flex-col flex-shrink-0 border-r border-gray-200 bg-white transition-all duration-300 ease-in-out no-print",
      isCollapsed ? "w-20" : "w-64"
    )}>
      <div className="flex-shrink-0 border-b border-gray-100 p-6 relative">
        <div className={cn("flex items-center gap-3 overflow-hidden transition-all duration-300", isCollapsed ? "justify-center" : "")}>
          <div className={cn(
            "flex flex-shrink-0 items-center justify-center overflow-hidden border border-slate-200 bg-white shadow-[0_14px_36px_rgba(15,23,42,0.08)] transition-all duration-300 ease-in-out",
            isCollapsed ? "h-9 w-9 rounded-full" : "h-12 w-12 rounded-2xl"
          )}>
            <img src="/logo.png" alt="职途星" className="h-full w-full object-contain p-1.5" />
          </div>
          {!isCollapsed && (
            <div className="min-w-0 flex-1">
              <h1 className="text-base font-black leading-tight text-gray-900 truncate">职途星</h1>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 truncate">AI 职途规划</p>
            </div>
          )}
        </div>
        
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={cn(
            "absolute -right-3 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 transition-all hover:border-teal-500 hover:text-teal-500 shadow-sm z-50",
            isCollapsed && "rotate-180"
          )}
          title={isCollapsed ? "展开侧边栏" : "收起侧边栏"}
        >
          <PanelLeftClose size={12} />
        </button>
      </div>

      <nav className="flex-grow space-y-1 overflow-y-auto p-4">
        {navItems.map((item) => (
          <React.Fragment key={item.path}>
            {item.category && !isCollapsed && (
              <p className="px-3 pb-2 pt-4 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                {item.category}
              </p>
            )}
            <NavLink
              to={item.path}
              className={({ isActive }) =>
                cn(
                  "flex items-center rounded-xl transition-all duration-200",
                  isCollapsed ? "justify-center h-10 w-10 mx-auto" : "gap-3 px-3 py-2.5 text-sm font-medium",
                  isActive
                    ? "bg-teal-50 text-[var(--teal)] shadow-sm ring-1 ring-teal-100"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon className={cn("h-5 w-5", isActive ? "text-[var(--teal)]" : "text-gray-400")} />
                  {!isCollapsed && <span>{item.name}</span>}
                </>
              )}
            </NavLink>
          </React.Fragment>
        ))}
      </nav>

      <div className="flex-shrink-0 space-y-1 border-t border-gray-100 p-4">
        <div className={cn("flex items-center gap-2 px-3 py-2 text-[11px] text-gray-500", isCollapsed && "justify-center px-0")}>
          <CircleDot className={cn("h-2 w-2 flex-shrink-0", syncing ? 'text-orange-400 animate-pulse' : 'text-green-500')} />
          {!isCollapsed && <span>{syncing ? '正在同步数据...' : '数据已同步'}</span>}
        </div>

        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              "flex items-center rounded-xl transition-all duration-200",
              isCollapsed ? "justify-center h-10 w-10 mx-auto" : "gap-3 px-3 py-2.5 text-sm font-medium",
              isActive
                ? "bg-teal-50 text-[var(--teal)] shadow-sm ring-1 ring-teal-100"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            )
          }
        >
          <Settings className="h-5 w-5 flex-shrink-0" />
          {!isCollapsed && <span>系统设置</span>}
        </NavLink>

        <button
          onClick={logout}
          className={cn(
            "mt-2 flex items-center rounded-xl text-sm font-medium text-red-500 transition-all duration-200 hover:bg-red-50",
            isCollapsed ? "justify-center h-10 w-10 mx-auto" : "w-full gap-3 px-3 py-2.5"
          )}
        >
          <LogOut className="h-5 w-5 flex-shrink-0" />
          {!isCollapsed && <span>退出登录</span>}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
