import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Lock, ArrowRight, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import BrandMark from '../components/brand/BrandMark';
import { APP_NAME } from '../constants/brand';

const Login = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || '/';
  const currentYear = new Date().getFullYear();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (isLogin) {
        await login(username, password);
      } else {
        await register(username, password);
      }
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message || '操作失败，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] bg-white overflow-hidden">
      <section className="hidden lg:block relative overflow-hidden group">
        <motion.img
          initial={{ scale: 1.1 }}
          animate={{ scale: 1 }}
          transition={{ duration: 20, repeat: Infinity, repeatType: 'reverse' }}
          className="absolute inset-0 h-full w-full object-cover"
          src="https://images.unsplash.com/photo-1523580846011-d3a5bc25702b?auto=format&fit=crop&w=1600&q=80"
          alt="Campus scene"
        />
        <div className="absolute inset-0 bg-blue-900/40 backdrop-blur-[2px]" />

        <div className="relative z-10 flex h-full flex-col justify-between p-12 text-white">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-4"
          >
            <BrandMark inverse logoSize="h-14 w-14" titleClassName="text-xl" subtitleClassName="text-[10px]" />
          </motion.div>

          <div className="max-w-xl">
            <motion.p
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="mb-4 text-sm font-bold tracking-widest text-blue-100/80 uppercase"
            >
              学生画像 · 岗位匹配 · 职业报告
            </motion.p>
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-5xl font-black leading-tight drop-shadow-lg"
            >
              洞察职业未来，<br />
              从此刻开始。
            </motion.h2>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="mt-6 text-lg leading-relaxed text-white/80 font-medium"
            >
              基于先进的 AI 模型，为你量身定制职业发展路径。登录后即可体验完整的画像分析与岗位匹配功能。
            </motion.p>
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            className="text-xs font-medium text-white/60"
          >
            © {currentYear} {APP_NAME}. All Rights Reserved.
          </motion.div>
        </div>
      </section>

      <section className="flex min-h-screen items-center justify-center bg-gray-50/30 px-8 py-12">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-sm"
        >
          <div className="mb-10 flex flex-col items-center text-center lg:hidden">
            <BrandMark stacked logoSize="h-14 w-14" titleClassName="text-2xl" subtitleClassName="text-[10px]" />
            <p className="mt-3 text-sm font-medium text-gray-500">先登录，再继续职场探索。</p>
          </div>

          <div className="mb-8">
            <motion.div
              layout
              className="mb-3 inline-block rounded-full bg-blue-50 px-3 py-1 text-[10px] font-black tracking-widest text-blue-600"
            >
              {isLogin ? 'Welcome Back' : 'Create Account'}
            </motion.div>
            <h2 className="text-4xl font-black tracking-tight text-gray-900">
              {isLogin ? '登录' : '注册'}
            </h2>
            <p className="mt-3 text-gray-500 font-medium">
              {isLogin ? '使用已有账号进入职途星。' : '创建账号后即可生成你的职业画像。'}
            </p>
          </div>

          <div className="mb-8 flex rounded-2xl bg-gray-200/50 p-1.5">
            <button
              onClick={() => setIsLogin(true)}
              className={`flex-grow rounded-xl py-2.5 text-sm font-bold transition-all duration-300 ${
                isLogin ? 'bg-white text-primary shadow-lg shadow-blue-200/50' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              账号登录
            </button>
            <button
              onClick={() => setIsLogin(false)}
              className={`flex-grow rounded-xl py-2.5 text-sm font-bold transition-all duration-300 ${
                !isLogin ? 'bg-white text-primary shadow-lg shadow-blue-200/50' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              新用户注册
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label className="ml-1 text-xs font-black uppercase tracking-widest text-gray-500">用户名</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                  <User className="w-5 h-5 text-gray-400 transition-colors group-focus-within:text-primary" />
                </div>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full rounded-2xl border border-gray-200 bg-white pl-11 pr-4 py-4 text-sm font-medium text-gray-900 outline-none transition-all focus:border-primary focus:ring-4 focus:ring-blue-50"
                  placeholder="请输入账号"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="ml-1 text-xs font-black uppercase tracking-widest text-gray-500">密码</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                  <Lock className="w-5 h-5 text-gray-400 transition-colors group-focus-within:text-primary" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-2xl border border-gray-200 bg-white pl-11 pr-4 py-4 text-sm font-medium text-gray-900 outline-none transition-all focus:border-primary focus:ring-4 focus:ring-blue-50"
                  placeholder="请输入密码"
                  required
                />
              </div>
            </div>

            <AnimatePresence>
              {error && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="pl-1 text-xs font-bold text-red-500"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            <button
              disabled={isLoading}
              className="group relative w-full overflow-hidden rounded-2xl bg-primary py-4 text-sm font-black text-white shadow-xl shadow-blue-200 transition-all hover:bg-blue-700 focus:ring-4 focus:ring-blue-200 active:scale-[0.98] disabled:bg-gray-400 disabled:shadow-none disabled:active:scale-100"
              type="submit"
            >
              <span className="flex items-center justify-center gap-2">
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    {isLogin ? '进入职途星' : '确认注册'}
                    <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
                  </>
                )}
              </span>
            </button>
          </form>

          <p className="mt-8 text-center text-xs font-medium text-gray-400">
            账号及个人隐私受加密保护。<br />
            {isLogin
              ? '忘记密码？请联系系统管理员。'
              : '注册即表示您同意我们的使用协议。'}
          </p>
        </motion.div>
      </section>
    </main>
  );
};

export default Login;
