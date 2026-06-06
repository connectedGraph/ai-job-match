import React from 'react';
import Sidebar from '../components/Sidebar';
import OnboardingModal from '../components/onboarding/OnboardingModal';
import { useData } from '../context/DataContext';

const MainLayout = ({ children }) => {
  const { showOnboarding, dismissOnboarding } = useData();

  return (
    <div className="flex h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-white to-blue-50/50">
      <Sidebar />
      <div className="flex-grow flex flex-col overflow-hidden">
        <main className="flex-grow overflow-y-auto scroll-smooth">
          {children}
        </main>
      </div>
      {showOnboarding && (
        <OnboardingModal 
          isOpen={showOnboarding} 
          onClose={dismissOnboarding} 
        />
      )}
    </div>
  );
};

export default MainLayout;
