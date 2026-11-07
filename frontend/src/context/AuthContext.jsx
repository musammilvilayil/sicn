import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../services/api';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('bji_nav_token') || null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      if (token) {
        try {
          const profile = await api.getMe(token);
          setUser({ ...profile, token });
        } catch (err) {
          console.warn('Session check expired:', err);
          localStorage.removeItem('bji_nav_token');
          setToken(null);
          setUser(null);
        }
      }
      setLoading(false);
    };
    checkAuth();
  }, [token]);

  const login = async (email, password) => {
    const data = await api.login(email, password);
    localStorage.setItem('bji_nav_token', data.token);
    setToken(data.token);
    setUser(data);
    return data;
  };

  const register = async (userData) => {
    const data = await api.register(userData);
    localStorage.setItem('bji_nav_token', data.token);
    setToken(data.token);
    setUser(data);
    return data;
  };

  const logout = () => {
    localStorage.removeItem('bji_nav_token');
    setToken(null);
    setUser(null);
  };

  // Exact RBAC Role Flags
  const effectiveRole = user?.role || 'Normal_User';
  const canEditMap = effectiveRole === 'Admin';
  const canManageTimetable = effectiveRole === 'Teacher' || effectiveRole === 'Admin';
  const canAccessTimetableRouting = ['Student', 'Teacher', 'Admin'].includes(effectiveRole);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        effectiveRole,
        canEditMap,
        canManageTimetable,
        canAccessTimetableRouting,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
