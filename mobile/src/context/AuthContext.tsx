import React, { createContext, useState, useEffect, useContext } from 'react';
import { apiFetch, setApiToken } from '../utils/api';

interface User {
  id: number;
  name: string;
  email: string;
  role: 'student' | 'lecturer' | 'ta';
  student_id?: string;
  level?: string;
}

interface AuthContextType {
  token: string | null;
  user: User | null;
  loading: boolean;
  login: (loginId: string, secret: string) => Promise<void>;
  registerStudent: (userData: any) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);

  const login = async (loginId: string, secret: string) => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login_id: loginId, password: secret }),
      });
      setToken(res.token);
      setApiToken(res.token);
      setUser(res.user);
    } finally {
      setLoading(false);
    }
  };

  const registerStudent = async (userData: any) => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData),
      });
      setToken(res.token);
      setApiToken(res.token);
      setUser(res.user);
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setToken(null);
    setApiToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ token, user, loading, login, registerStudent, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
