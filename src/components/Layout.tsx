import React, { useEffect, useState } from 'react';
import { Topbar } from './Topbar';
import { Sidebar } from './Sidebar';
import { Outlet, useLocation } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import WebReceiptPrinter from './pos/WebReceiptPrinter';

export function Layout() {
  const location = useLocation();
  const { posWorkspace, setPosWorkspace } = useAppContext();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const isPosRoute = location.pathname.startsWith('/pos');
    if (posWorkspace.active !== isPosRoute) {
      setPosWorkspace({ active: isPosRoute });
    }
  }, [location.pathname, posWorkspace.active, setPosWorkspace]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="app-container">
      <WebReceiptPrinter />
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