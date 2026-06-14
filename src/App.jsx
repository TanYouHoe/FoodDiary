import { useState, useEffect } from 'react';
import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Restaurants from './pages/Restaurants';
import AddMeal from './pages/AddMeal';
import MapView from './pages/MapView';
import Groups from './pages/Groups';
import Planned from './pages/Planned';
import Dishes from './pages/Dishes';
import SettingsModal from './components/SettingsModal';

function App() {
  const { user, loading, logout } = useAuth();
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const location = useLocation();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);

  // Close sidebar on navigation
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  if (loading) return <div className="loading">Loading...</div>;
  if (!user) return <Login />;

  return (
    <div className="app-layout">
      <header className="topbar">
        <button className="burger-btn" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
          <span /><span /><span />
        </button>
        <div className="topbar-brand">Food Diary: First Bite</div>
        <button className="settings-icon-btn topbar-settings" onClick={() => setShowSettings(true)} title="Settings">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </button>
      </header>

      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

      <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <h1>Food Diary</h1>
            <div className="brand-sub">First Bite</div>
          </div>
          <button className="sidebar-close" onClick={() => setSidebarOpen(false)}>&times;</button>
        </div>
        <nav className="sidebar-nav">
          <NavLink to="/dashboard">Dashboard</NavLink>
          <NavLink to="/restaurants">Restaurants</NavLink>
          <NavLink to="/meals">Meals</NavLink>
          <NavLink to="/dishes">Dishes</NavLink>
          <NavLink to="/map">Map</NavLink>
          <NavLink to="/groups">Groups</NavLink>
          <NavLink to="/planned">Planned</NavLink>
        </nav>
        <div className="sidebar-footer">
          <span>{user.name}</span>
          <div className="sidebar-actions">
            <button className="settings-icon-btn" onClick={(e) => { e.stopPropagation(); setSidebarOpen(false); setTimeout(() => setShowSettings(true), 150); }} title="Settings">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </button>
            <button onClick={logout}>Logout</button>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/restaurants" element={<Restaurants />} />
          <Route path="/meals" element={<AddMeal />} />
          <Route path="/add-meal" element={<Navigate to="/meals" replace />} />
          <Route path="/dishes" element={<Dishes />} />
          <Route path="/map" element={<MapView />} />
          <Route path="/groups" element={<Groups />} />
          <Route path="/planned" element={<Planned />} />
        </Routes>
      </main>

      {showSettings && (
        <SettingsModal
          dark={dark}
          onToggleDark={() => setDark(!dark)}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

export default App;
