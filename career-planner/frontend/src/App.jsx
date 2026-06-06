import React, { useEffect } from 'react';
import { createBrowserRouter, RouterProvider, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
import MainLayout from './layouts/MainLayout';
import Login from './pages/Login';
import Profile from './pages/Profile';
import Matching from './pages/Matching';
import AiEval from './pages/AiEval';
import Report from './pages/Report';
import ActionPlan from './pages/ActionPlan';
import Settings from './pages/Settings';
import ImmersiveDiscovery from './pages/matching/ImmersiveDiscovery';
import { APP_NAME, APP_TAGLINE } from './constants/brand';

const ProtectedRoute = ({ children, useLayout = true }) => {
  const { user, loading } = useAuth();
  
  if (loading) return (
    <div className="h-screen w-screen flex items-center justify-center bg-gray-50">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
    </div>
  );
  
  if (!user) return <Navigate to="/login" replace />;
  
  const content = children || <Outlet />;
  
  return useLayout ? (
    <MainLayout>
      {content}
    </MainLayout>
  ) : content;
};

const router = createBrowserRouter([
  {
    path: "/login",
    element: <Login />,
  },
  {
    path: "/",
    element: <ProtectedRoute />,
    children: [
      {
        index: true,
        element: <Profile />,
      },
      {
        path: "matching/*",
        element: <Matching />,
      },
      {
        path: "ai-eval",
        element: <AiEval />,
      },
      {
        path: "report",
        element: <Report />,
      },
      {
        path: "action-plan",
        element: <ActionPlan />,
      },
      {
        path: "settings",
        element: <Settings />,
      },
      {
        path: "*",
        element: <Navigate to="/" replace />,
      },
    ],
  },
  {
    path: "/matching/immersive",
    element: (
      <ProtectedRoute useLayout={false}>
        <ImmersiveDiscovery />
      </ProtectedRoute>
    ),
  },
]);

function App() {
  useEffect(() => {
    document.title = `${APP_NAME} · ${APP_TAGLINE}`;
  }, []);

  return (
    <AuthProvider>
      <DataProvider>
        <RouterProvider router={router} />
      </DataProvider>
    </AuthProvider>
  );
}

export default App;
