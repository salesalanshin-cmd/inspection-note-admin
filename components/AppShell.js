'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useState } from 'react';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import MobileHeader from './MobileHeader';

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
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-bg print:block print:h-auto print:overflow-visible">
        <MobileHeader onMenuOpen={openSidebar} />
        <TopBar />
        <div className="min-h-0 flex-1 overflow-y-auto print:overflow-visible">{children}</div>
      </main>
    </div>
  );
}
