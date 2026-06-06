import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Briefcase, Code, Trophy, FlaskConical, Users, BookOpen, GraduationCap } from 'lucide-react';
import ExpCard from './ExpCard';
import ExperienceModal from './ExperienceModal';
import { useData } from '../../context/DataContext';
import { createExperienceId } from '../../utils/profileData';

const iconMap = {
  internship: Briefcase,
  projects: Code,
  competition: Trophy,
  research: FlaskConical,
  campus: Users,
  learning: BookOpen,
  certificates: GraduationCap
};

const ExperienceSection = ({ type, title, emptyText }) => {
  const { studentData, setStudentData, saveData } = useData();
  const [modalState, setModalState] = useState(null);
  const experiences = type === 'certificates' ? studentData.basicInfo?.certificates || [] : studentData.experiences?.[type] || [];
  
  const Icon = iconMap[type] || Briefcase;

  const handleAdd = () => {
    setModalState({ index: null, item: {} });
  };

  const handleEdit = (item, index) => {
    setModalState({ index, item });
  };

  const handleDelete = (index) => {
    if (!window.confirm('确认删除这条记录吗？')) return;
    const newExps = [...experiences];
    newExps.splice(index, 1);
    
    let newData = { ...studentData };
    if (type === 'certificates') {
      newData.basicInfo = { ...newData.basicInfo, certificates: newExps };
    } else {
      newData.experiences = { ...newData.experiences, [type]: newExps };
    }
    
    setStudentData(newData);
    saveData(newData);
  };

  const handleSave = (payload) => {
    const index = modalState?.index;
    const newExps = [...experiences];
    
    if (type === 'certificates') {
      if (index === null || index === undefined) {
        newExps.push(payload);
      } else {
        newExps[index] = payload;
      }
    } else {
      const previousId = index === null || index === undefined ? null : newExps[index]?.experience_id;
      const nextItem = {
        ...payload,
        experience_id: previousId || createExperienceId(type),
      };
      if (index === null || index === undefined) {
        newExps.push(nextItem);
      } else {
        newExps[index] = nextItem;
      }
    }

    const newData = type === 'certificates'
      ? {
          ...studentData,
          basicInfo: { ...(studentData.basicInfo || {}), certificates: newExps },
        }
      : {
          ...studentData,
          experiences: { ...(studentData.experiences || {}), [type]: newExps },
        };

    setStudentData(newData);
    saveData(newData);
    setModalState(null);
  };

  return (
    <section className="rounded-3xl border border-blue-100 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-800 section-title flex items-center gap-2">
          {title}
        </h2>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleAdd}
          className="flex items-center gap-1.5 px-4 py-2 rounded-2xl text-xs font-black border border-blue-200 bg-blue-50 text-blue-700 transition-all shadow-sm hover:bg-blue-100 no-print"
        >
          <Plus size={14} strokeWidth={3} />
          增加记录
        </motion.button>
      </div>

      {experiences.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {experiences.map((exp, idx) => (
            <ExpCard 
              key={idx} 
              item={exp} 
              type={type} 
              index={idx} 
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      ) : (
        <motion.div 
          onClick={handleAdd}
          whileHover={{ scale: 1.01, borderColor: '#2563eb', backgroundColor: '#f8fbfc' }}
          className="group cursor-pointer py-12 px-6 bg-blue-50/30 rounded-3xl border-2 border-dashed border-blue-100 flex flex-col items-center justify-center transition-all"
        >
          <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-4 group-hover:shadow-lg group-hover:shadow-blue-100 transition-all">
            <Icon size={32} className="text-gray-300 group-hover:text-primary transition-colors" />
          </div>
          <p className="font-bold text-gray-500 group-hover:text-gray-700 transition-colors">{emptyText}</p>
          <p className="text-xs text-gray-400 mt-1">完善相关经历，提升画像完整度与匹配精度</p>
        </motion.div>
      )}

      {modalState && (
        <ExperienceModal
          key={`${type}-${modalState.index ?? 'new'}`}
          type={type}
          item={modalState.item}
          index={modalState.index}
          open={!!modalState}
          onClose={() => setModalState(null)}
          onSave={handleSave}
        />
      )}
    </section>
  );
};

export default ExperienceSection;
