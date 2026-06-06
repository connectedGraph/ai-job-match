import React from 'react';
import { useTheme } from '../../context/ThemeContext';
import { Sun, Moon } from 'lucide-react';
import Button from '../ui/Button';

const Topbar = ({ crumbs = [] }) => {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="h-[52px] flex items-center justify-between px-[28px] border-b border-border bg-bg/70 backdrop-blur-md sticky top-0 z-10 shrink-0">
      <div className="flex items-center gap-[6px]">
        <span className="text-[12px] text-tx-3 font-mono">Unified System</span>
        {crumbs.map((crumb, i) => (
          <React.Fragment key={i}>
            <span className="text-tx-4 text-[12px]">/</span>
            <span className={`text-[12px] font-mono ${i === crumbs.length - 1 ? 'text-tx-1 font-semibold' : 'text-tx-3'}`}>
              {crumb}
            </span>
          </React.Fragment>
        ))}
      </div>
      
      <div className="flex items-center gap-2">
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={toggleTheme}
          title="切换日/夜间模式"
          className="h-8 w-max gap-2"
        >
          {theme === 'dark' ? <Moon size={14} /> : <Sun size={14} />}
          Theme
        </Button>
      </div>
    </header>
  );
};

export default Topbar;
