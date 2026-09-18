// UI connector: the signed-in person, as Food Diary knows them.
//
// Sign-in itself belongs to the shared auth module: its AuthGate shows the
// Google button, the authenticator step and the enrollment screen, and only
// renders this app once somebody is through. What is left here is the app's own
// user row — the name, the avatar and the stored time zone that meals and groups
// hang off — which the server returns from GET /api/me.

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const AuthContext = createContext(null);

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}

// `session` is what the module's AuthGate hands its child.
export function AuthProvider({ session, children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => api.getMe()
    .then((row) => { setUser(row); return row; })
    .catch(() => setUser(null))
    .finally(() => setLoading(false)), []);

  useEffect(() => { refresh(); }, [refresh]);

  const logout = useCallback(() => {
    setUser(null);
    return session.signOut();
  }, [session]);

  return (
    <AuthContext.Provider value={{ user, loading, refresh, logout, session, account: session.user }}>
      {children}
    </AuthContext.Provider>
  );
}

export default AuthProvider;
