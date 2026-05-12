import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar';
import { useSocketStore } from '../stores/useSocketStore';

export const Layout = () => {
  const connect = useSocketStore((s) => s.connect);

  useEffect(() => {
    connect();
  }, [connect]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', background: '#06070a', overflow: 'hidden', position: 'relative' }}>
      {/* Ambient Background Effects */}
      <div className="ambient-grid" />
      <div className="ambient-orb ambient-orb-1" />
      <div className="ambient-orb ambient-orb-2" />

      {/* Content */}
      <Navbar />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0, position: 'relative', zIndex: 1 }}>
        <Outlet />
      </main>
    </div>
  );
};
