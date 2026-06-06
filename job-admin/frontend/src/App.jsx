import React from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Sidebar from './components/layout/Sidebar';
import Topbar from './components/layout/Topbar';
import Dashboard from './pages/Dashboard';
import BasicMatchPage from './pages/BasicMatchPage';
import MatchPage from './pages/MatchPage';
import JobMatrix from './pages/JobMatrix';
import Ingestion from './pages/Ingestion';
import TagsCenter from './pages/TagsCenter';
import RunLogs from './pages/RunLogs';
import Settings from './pages/Settings';
import Normalization from './pages/Normalization';

const App = () => {
  const location = useLocation();
  
  // Simple breadcrumb logic based on path
  const getCrumbs = () => {
    const path = location.pathname;
    if (path === '/') return ['Dashboard'];
    if (path === '/match') return ['AI Match'];
    if (path.startsWith('/match/')) {
      const section = path.split('/')[2] || 'explore';
      const viewMap = {
        explore: 'Explore',
        basket: 'Basket',
        harvest: 'Harvest',
        action: 'Action Plan',
        profile: 'Profile',
      };
      return ['SmartHiring', viewMap[section] || 'Explore'];
    }
    const mapping = {
      '/jobs': 'Job Matrix',
      '/ingest': 'Ingestion',
      '/tags': 'Tags Center',
      '/runs': 'Run Logs',
      '/settings': 'Settings',
      '/normalize': 'Normalization'
    };
    return [mapping[path] || 'Section'];
  };

  const isMatchPage = location.pathname.startsWith('/match');

  if (isMatchPage) {
    return (
      <div className="min-h-screen bg-bg">
        <Routes>
          <Route path="/match" element={<Navigate to="/match/explore" replace />} />
          <Route path="/match_" element={<BasicMatchPage />} />
          <Route path="/matchh" element={<BasicMatchPage />} />
          <Route path="/match/:section" element={<MatchPage />} />
          <Route path="*" element={<Navigate to="/match/explore" replace />} />
        </Routes>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0">
        <Topbar crumbs={getCrumbs()} />
        <div className="flex-1 overflow-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/jobs" element={<JobMatrix />} />
            <Route path="/ingest" element={<Ingestion />} />
            <Route path="/tags" element={<TagsCenter />} />
            <Route path="/runs" element={<RunLogs />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/normalize" element={<Normalization />} />
          </Routes>
        </div>
      </main>
    </div>
  );
};

export default App;
