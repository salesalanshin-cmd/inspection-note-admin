'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useState } from 'react';
import Sidebar from './Sidebar';
import TopBar from './TopBar';

export default function AppShell({ children }) {
  const pathname = usePathname();
  const isLogin = pathname === '/login';
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const openSidebar = useCallback(() => setSidebarOpen(true), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  if (isLogin) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-bg print:block print:h-auto print:overflow-visible">
      <Sidebar mobileOpen={sidebarOpen} onMobileClose={closeSidebar} />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-bg print:block print:h-auto print:overflow-visible">
        <TopBar onMenuOpen={openSidebar} menuOpen={sidebarOpen} />
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto print:overflow-visible">{children}</div>
      </main>
    </div>
  );
}
