// UI: the signed-in layout. Top bar, sliding sidebar and the page area.
// `nav` holds the navigation links, `children` the page, `overlay` a dialog.

import { SettingsIcon } from './icons.jsx';

export default function AppShell({
  userName, sidebarOpen, nav, children, overlay,
  onOpenSidebar, onCloseSidebar, onOpenSettings, onSidebarSettings, onLogout,
}) {
  return (
    <div className="app-layout">
      <header className="topbar">
        <button className="burger-btn" onClick={onOpenSidebar} aria-label="Open menu">
          <span /><span /><span />
        </button>
        <div className="topbar-brand">Food Diary: First Bite</div>
        <button className="settings-icon-btn topbar-settings" onClick={onOpenSettings} title="Settings">
          <SettingsIcon />
        </button>
      </header>

      {sidebarOpen && <div className="sidebar-overlay" onClick={onCloseSidebar} />}

      <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <h1>Food Diary</h1>
            <div className="brand-sub">First Bite</div>
          </div>
          <button className="sidebar-close" onClick={onCloseSidebar}>&times;</button>
        </div>
        <nav className="sidebar-nav">{nav}</nav>
        <div className="sidebar-footer">
          <span>{userName}</span>
          <div className="sidebar-actions">
            <button className="settings-icon-btn" onClick={(e) => { e.stopPropagation(); onSidebarSettings(); }} title="Settings">
              <SettingsIcon />
            </button>
            <button onClick={onLogout}>Logout</button>
          </div>
        </div>
      </aside>

      <main className="main-content">{children}</main>

      {overlay}
    </div>
  );
}
