// UI connector: the router, the theme, the sidebar and the settings dialog
// around the signed-in pages, and the app-update banner over every screen.

import { useState, useEffect } from 'react';
import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { INVITE_ROUTE } from '../logic/invites.js';
import { useTheme } from './hooks/useTheme.js';
import { useAppUpdate } from './hooks/useAppUpdate.js';
import { useInstallPrompt } from './hooks/useInstallPrompt.js';
import AppShell from './ui/AppShell.jsx';
import UpdateBanner from './ui/UpdateBanner.jsx';
import Login from './pages/Login';
import Invite from './pages/Invite';
import MfaStep from './pages/MfaStep';
import Enroll from './pages/Enroll';
import Dashboard from './pages/Dashboard';
import Restaurants from './pages/Restaurants';
import Meals from './pages/Meals';
import MapView from './pages/MapView';
import Groups from './pages/Groups';
import Planned from './pages/Planned';
import Dishes from './pages/Dishes';
import SettingsModal from './widgets/SettingsModal';

// Lets the sidebar finish closing before the settings dialog opens.
const SIDEBAR_CLOSE_MS = 150;

const NAV = (
  <>
    <NavLink to="/dashboard">Dashboard</NavLink>
    <NavLink to="/restaurants">Restaurants</NavLink>
    <NavLink to="/meals">Meals</NavLink>
    <NavLink to="/dishes">Dishes</NavLink>
    <NavLink to="/map">Map</NavLink>
    <NavLink to="/groups">Groups</NavLink>
    <NavLink to="/planned">Planned</NavLink>
  </>
);

function App() {
  const appUpdate = useAppUpdate();
  const installPrompt = useInstallPrompt();
  const banner = (
    <UpdateBanner
      needRefresh={appUpdate.needRefresh}
      onReload={appUpdate.update}
      onDismiss={appUpdate.dismiss}
    />
  );
  return <><Screen installPrompt={installPrompt} />{banner}</>;
}

// The screen for the session state: loading, sign-in steps or the signed-in app.
function Screen({ installPrompt }) {
  const { user, loading, logout, mfaPending, needsEnrollment } = useAuth();
  const { dark, toggleDark } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const location = useLocation();

  // Close sidebar on navigation
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Signing out from inside the settings dialog (Security tab) must not reopen it at the next sign-in.
  useEffect(() => {
    if (!user) setShowSettings(false);
  }, [user]);

  if (loading) return <div className="loading">Loading...</div>;
  if (!user) {
    if (mfaPending) return <MfaStep />;
    return (
      <Routes>
        <Route path={INVITE_ROUTE} element={<Invite />} />
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }
  if (needsEnrollment) return <Enroll />;

  return (
    <AppShell
      userName={user.name}
      sidebarOpen={sidebarOpen}
      nav={NAV}
      onOpenSidebar={() => setSidebarOpen(true)}
      onCloseSidebar={() => setSidebarOpen(false)}
      onOpenSettings={() => setShowSettings(true)}
      onSidebarSettings={() => { setSidebarOpen(false); setTimeout(() => setShowSettings(true), SIDEBAR_CLOSE_MS); }}
      onLogout={logout}
      overlay={showSettings && (
        <SettingsModal
          dark={dark}
          onToggleDark={toggleDark}
          canInstall={installPrompt.canInstall}
          onInstall={installPrompt.install}
          onClose={() => setShowSettings(false)}
        />
      )}
    >
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path={INVITE_ROUTE} element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/restaurants" element={<Restaurants />} />
        <Route path="/meals" element={<Meals />} />
        <Route path="/add-meal" element={<Navigate to="/meals" replace />} />
        <Route path="/dishes" element={<Dishes />} />
        <Route path="/map" element={<MapView />} />
        <Route path="/groups" element={<Groups />} />
        <Route path="/planned" element={<Planned />} />
      </Routes>
    </AppShell>
  );
}

export default App;
