import React from 'react';
import { motion } from 'framer-motion';
import { Calendar, Pencil, Trash2 } from 'lucide-react';
import { buildExperienceDisplayId, getExperienceDisplay } from '../../utils/profileData';

const ExpCard = ({ item, type, index, onEdit, onDelete }) => {
  const { title, sub, desc, date } = getExperienceDisplay(type, item);
  const displayId = buildExperienceDisplayId(type, index);
  const tags = item.tags || [];

  return (
    <motion.div 
      layout
      whileHover={{ y: -4, shadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)' }}
      className="group bg-white border border-gray-100 rounded-2xl p-6 transition-all duration-300 shadow-sm hover:border-blue-100"
    >
      <div className="flex items-start gap-4">
        <div className="flex-grow min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-black tracking-[0.12em] text-blue-700">
              ID {displayId}
            </span>
            <h4 className="font-black text-gray-900 text-lg leading-tight truncate">{title}</h4>
            {sub && (
              <span className="text-[10px] font-black text-primary bg-blue-50/50 px-2 py-0.5 rounded-lg border border-blue-100/50 uppercase tracking-wider">
                {sub}
              </span>
            )}
          </div>
          
          {date && (
            <p className="text-xs text-gray-400 font-bold flex items-center gap-1.5 mb-3">
              <Calendar size={12} className="opacity-60" />
              {date}
            </p>
          )}
          
          {desc && (
            <p className="text-gray-500 text-sm leading-relaxed line-clamp-2 font-medium mb-4">
              {desc}
            </p>
          )}
          
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-auto">
              {tags.slice(0, 5).map((tag, i) => (
                <span key={i} className="text-[10px] px-2 py-0.5 bg-gray-50 text-gray-500 rounded-md border border-gray-100 font-bold">
                  {tag}
                </span>
              ))}
              {tags.length > 5 && (
                <span className="text-[10px] px-2 py-0.5 bg-gray-50 text-gray-400 rounded-md font-bold">
                  +{tags.length - 5}
                </span>
              )}
            </div>
          )}
        </div>
        
        <div className="flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity no-print">
          <button 
            onClick={() => onEdit(item, index)}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-blue-50 text-primary hover:bg-primary hover:text-white transition-all shadow-sm"
          >
            <Pencil size={14} />
          </button>
          <button 
            onClick={() => onDelete(index)}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-red-50 text-red-500 hover:bg-red-500 hover:text-white transition-all shadow-sm"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </motion.div>
  );
};

export default ExpCard;
