import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Settings as SettingsIcon, ShieldCheck, User, Trash2, LogOut, Compass, Info, TriangleAlert, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';

const Settings = () => {
  const { user, logout } = useAuth();
  const { setShowOnboarding, resetAllData } = useData();
  const navigate = useNavigate();
  const [resetting, setResetting] = useState(false);

  const handleResetData = async () => {
    if (!window.confirm('警告：此操作将永久清空您的所有画像数据、提交记录和匹配果园进展！\n\n确定要继续吗？')) {
      return;
    }

    setResetting(true);
    try {
      await resetAllData();
      alert('所有画像数据已重置。');
      navigate('/'); // 返回主页画像
    } catch {
      alert('重置失败，请重试');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="py-8 px-4 md:px-8">
      <div className="max-w-5xl mx-auto bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
        {/* Header */}
        <div className="bg-primary text-white px-6 py-5">
          <h2 className="text-xl font-black flex items-center gap-2">
            <SettingsIcon size={20} /> 系统设置
          </h2>
          <p className="text-xs text-blue-100 mt-1 font-medium">账号、安全和新人引导入口。</p>
        </div>

        <div className="p-6 space-y-6">
          {/* Info Box */}
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-4 flex gap-3">
            <Info className="text-primary flex-shrink-0" size={18} />
            <div>
              <p className="text-sm font-bold text-gray-800 tracking-tight">模型配置由后端统一管理</p>
              <p className="text-xs text-gray-500 mt-1 font-medium leading-relaxed">
                AI 解析、画像评估和技能推断均通过学生端后端鉴权调用，不再在浏览器保存 API Key。
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Account Info */}
            <section className="rounded-xl border border-gray-200 bg-gray-50 px-5 py-5 text-sm text-gray-600">
              <h3 className="font-bold text-gray-800 text-base mb-4 flex items-center gap-2">
                <User size={16} className="text-primary" /> 当前账号
              </h3>
              <div className="space-y-2 font-medium">
                <p>用户名：<span className="text-gray-900 font-bold">{user?.username || 'Unknown'}</span></p>
                <p>用户 ID：<span className="text-gray-900 font-mono">#{user?.id || '0000'}</span></p>
              </div>
              
              <button 
                onClick={() => setShowOnboarding(true)}
                className="mt-6 w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary/10 hover:bg-primary/20 text-primary rounded-2xl text-sm font-bold transition-all group border border-primary/20"
              >
                <Compass size={16} className="group-hover:rotate-90 transition-transform duration-500" />
                重看新人引导计划
              </button>
            </section>

            {/* Change Username */}
            <section className="rounded-xl border border-gray-200 bg-white px-5 py-5 shadow-sm">
              <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
                <User size={14} className="text-primary" /> 修改用户名
              </h3>
              <form className="space-y-3">
                <input 
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:outline-none focus:border-primary focus:bg-white transition-all font-medium" 
                  placeholder="新用户名" 
                />
                <input 
                  type="password" 
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:outline-none focus:border-primary focus:bg-white transition-all font-medium" 
                  placeholder="当前密码" 
                />
                <button className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 transition-colors shadow-md shadow-blue-100" type="submit">
                  保存用户名
                </button>
              </form>
            </section>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Change Password */}
            <section className="rounded-xl border border-gray-200 bg-white px-5 py-5 shadow-sm">
              <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
                <ShieldCheck size={14} className="text-primary" /> 修改密码
              </h3>
              <form className="space-y-3">
                <input 
                  type="password" 
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:outline-none focus:border-primary focus:bg-white transition-all font-medium" 
                  placeholder="当前密码" 
                />
                <input 
                  type="password" 
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:outline-none focus:border-primary focus:bg-white transition-all font-medium" 
                  placeholder="新密码，至少 6 位" 
                />
                <button className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 transition-colors shadow-md shadow-blue-100" type="submit">
                  保存密码
                </button>
              </form>
            </section>

            {/* Danger Zone */}
            <section className="rounded-xl border border-red-100 bg-red-50/50 px-5 py-5">
              <p className="text-xs font-black text-red-500 mb-4 flex items-center gap-1.5 uppercase tracking-widest">
                <TriangleAlert size={14} /> 危险操作
              </p>
              <div className="space-y-2.5">
                <button 
                  onClick={logout}
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 rounded-xl text-sm font-bold transition-all"
                >
                  <span className="flex items-center gap-2">
                    <LogOut size={14} />
                    退出登录
                  </span>
                  <span className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Logout</span>
                </button>
                <button 
                  onClick={handleResetData}
                  disabled={resetting}
                  className="w-full flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-red-50 border border-red-100 text-red-600 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                >
                  {resetting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  清空所有画像数据
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
