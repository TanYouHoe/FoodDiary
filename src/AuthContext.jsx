// UI connector: the signed-in user, shared through React context.

import { createContext, useContext, useState, useEffect } from 'react';
import { api } from './api';
import { getToken, setToken, clearToken } from './token-store.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (getToken()) {
      api.getMe().then(setUser).catch(() => clearToken()).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const signIn = ({ token, user: signedIn }) => {
    setToken(token);
    setUser(signedIn);
  };

  const login = async (email, password) => signIn(await api.login({ email, password }));
  const register = async (name, email, password) => signIn(await api.register({ name, email, password }));
  const googleLogin = async (credential) => signIn(await api.googleLogin(credential));

  const logout = () => {
    clearToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, googleLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
