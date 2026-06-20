import React from 'react';
import { X } from 'lucide-react';

const SkillItem = ({ item, category, index, onDelete, onLevelChange, trendBadge, onTrendClick }) => {
  const level = item.levelRequired || 1;
  
  return (
    <div className="inline-flex items-center bg-white border border-gray-200 shadow-sm rounded-lg px-3 py-2 mr-3 mb-3 hover:border-blue-300 transition-colors group">
      <div className="flex flex-col mr-4 min-w-[60px]">
        <span className="text-sm font-bold text-gray-800 leading-none">{item.name}</span>
          {trendBadge && (
            <span
              onClick={(e) => { e.stopPropagation(); onTrendClick?.(); }}
              className="ml-1 cursor-pointer text-xs leading-none"
              title={trendBadge === '🔥' ? '热门上升' : '冷门标签，谨慎选择'}
            >{trendBadge}</span>
          )}
        {item.domain && <span className="text-[10px] text-gray-400 font-medium mt-1">{item.domain}</span>}
      </div>
      
      <div className="flex items-center gap-1.5 mr-4">
        {[1, 2, 3, 4].map((dot) => (
          <div
            key={dot}
            onClick={() => onLevelChange(category, index, dot)}
            className={`w-3.5 h-3.5 rounded-sm cursor-pointer transition-all ${
              level >= dot ? 'bg-primary shadow-inner scale-110' : 'bg-gray-200 hover:bg-blue-300'
            }`}
            title={`Level ${dot}`}
          />
        ))}
      </div>

      <button 
        onClick={() => onDelete(category, index)}
        className="text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
        title="删除"
      >
        <X size={14} />
      </button>
    </div>
  );
};

export default SkillItem;
