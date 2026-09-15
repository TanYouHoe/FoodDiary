// UI connector: the router, the theme, the sidebar and the settings dialog
// around the signed-in pages.

import { useState, useEffect } from 'react';
import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { useTheme } from './hooks/useTheme.js';
import AppShell from './ui/AppShell.jsx';
import Login from './pages/Login';
import Invite from './pages/Invite';
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
  const { user, loading, logout } = useAuth();
  const { dark, toggleDark } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const location = useLocation();

  // Close sidebar on navigation
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  if (loading) return <div className="loading">Loading...</div>;
  if (!user) {
    return (
      <Routes>
        <Route path="/invite/:code" element={<Invite />} />
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

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
        <SettingsModal dark={dark} onToggleDark={toggleDark} onClose={() => setShowSettings(false)} />
      )}
    >
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/invite/:code" element={<Navigate to="/dashboard" replace />} />
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
