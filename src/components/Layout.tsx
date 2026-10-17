import React, { useEffect, useState } from 'react';
import { Topbar } from './Topbar';
import { Sidebar } from './Sidebar';
import { Outlet, useLocation } from 'react-router-dom';
export function Layout() {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="app-container">
      <Sidebar mobileOpen={mobileMenuOpen} setMobileOpen={setMobileMenuOpen} />
      {mobileMenuOpen && <div className="sidebar-overlay" onClick={() => setMobileMenuOpen(false)} />}
      <div className="main-content">
        <Topbar onToggleMenu={() => setMobileMenuOpen(p => !p)} />
        <div className="page-wrapper">
          <Outlet />
        </div>
      </div>
    </div>
  );
}