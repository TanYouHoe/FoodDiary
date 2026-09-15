// UI connector: the signed-in user, shared through React context. Also holds
// the pending second-factor step (its mfa token lives in memory only, never in
// browser storage) and whether the API has asked for authenticator setup.

import { createContext, useContext, useState, useEffect } from 'react';
import { api, onEnrollRequired } from './api';
import { getToken, setToken, clearToken } from './token-store.js';
import { needsEnrollment } from './ui/two-factor.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mfaToken, setMfaToken] = useState(null);
  const [enrollRequired, setEnrollRequired] = useState(false);

  useEffect(() => {
    if (getToken()) {
      api.getMe().then(setUser).catch(() => clearToken()).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => onEnrollRequired(() => setEnrollRequired(true)), []);

  // result: { token, user }.
  const signIn = ({ token, user: signedIn }) => {
    setToken(token);
    setUser(signedIn);
    setMfaToken(null);
    setEnrollRequired(false);
  };

  // result: { token, user } or { mfa_required, mfa_token }.
  const afterFirstFactor = (result) => {
    if (result.mfa_required) {
      clearToken();
      setMfaToken(result.mfa_token);
    } else {
      signIn(result);
    }
  };

  const login = async (email, password) => afterFirstFactor(await api.login({ email, password }));
  // inviteCode: the account invite a new account needs.
  const register = async (name, email, password, inviteCode) =>
    afterFirstFactor(await api.register({ name, email, password, invite_code: inviteCode }));
  const googleLogin = async (credential, inviteCode) => afterFirstFactor(await api.googleLogin(credential, inviteCode));

  // factor: { code } or { backup_code }.
  const verifyMfa = async (factor) => signIn(await api.verifyMfa({ mfa_token: mfaToken, ...factor }));
  const cancelMfa = () => setMfaToken(null);

  const logout = () => {
    clearToken();
    setUser(null);
    setMfaToken(null);
    setEnrollRequired(false);
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      mfaPending: Boolean(mfaToken),
      needsEnrollment: needsEnrollment({ user, enrollRequired }),
      login, register, googleLogin, verifyMfa, cancelMfa, signIn, logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
