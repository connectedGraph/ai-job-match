import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('cp_auth_token');
      if (token) {
        try {
          const data = await api.get('/api/auth/me');
          setUser(data.user);
        } catch {
          localStorage.removeItem('cp_auth_token');
          localStorage.removeItem('cp_auth_user');
        }
      }
      setLoading(false);
    };
    initAuth();
  }, []);

  const login = async (username, password) => {
    const data = await api.post('/api/auth/login', { username, password });
    localStorage.setItem('cp_auth_token', data.token);
    localStorage.setItem('cp_auth_user', JSON.stringify(data.user));
    setUser(data.user);
    return data;
  };

  const register = async (username, password) => {
    const data = await api.post('/api/auth/register', { username, password });
    localStorage.setItem('cp_auth_token', data.token);
    localStorage.setItem('cp_auth_user', JSON.stringify(data.user));
    setUser(data.user);
    return data;
  };

  const logout = () => {
    localStorage.removeItem('cp_auth_token');
    localStorage.removeItem('cp_auth_user');
    // Clear all local drafts to prevent data leakage between accounts
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('cp_draft_')) {
        localStorage.removeItem(key);
      }
    });
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
