import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shield, Zap, ChevronRight, Users, Timer, TrendingUp } from 'lucide-react';

import { useSocketStore } from '../stores/useSocketStore';
import type { MatchFoundPayload } from '../socket/events';
import { readSessionUser } from '../utils/session';
import { apiUrl } from '../utils/api';

export const BattlePage = () => {
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  const navigate = useNavigate();
  const socket = useSocketStore((s) => s.socket);
  const isConnected = useSocketStore((s) => s.isConnected);
  const connectionError = useSocketStore((s) => s.connectionError);
  const activeMatch = useSocketStore((s) => s.activeMatch);
  const [queueError, setQueueError] = useState('');
  const signedIn = !!readSessionUser();

  const [isQueuing, setIsQueuing] = useState(false);
  const [queueSeconds, setQueueSeconds] = useState(0);

  useEffect(() => {
    if (!signedIn) return;
    const controller = new AbortController();
    fetch(apiUrl('/api/matches/active'), { headers: { Authorization: `Bearer ${localStorage.getItem('token') ?? ''}` }, signal: controller.signal })
      .then(async response => { if (!response.ok) return; const match = await response.json() as MatchFoundPayload | null; if (!controller.signal.aborted) useSocketStore.setState({ activeMatch: match }); })
      .catch(() => { /* Socket recovery remains available if this request fails. */ });
    return () => controller.abort();
  }, [signedIn]);

  const queueTimeLabel = useMemo(() => {
    const minutes = Math.floor(queueSeconds / 60);
    const seconds = queueSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, [queueSeconds]);

  useEffect(() => {
    if (!isQueuing || !isConnected) return;
    const intervalId = window.setInterval(() => {
      setQueueSeconds((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [isQueuing, isConnected]);

  useEffect(() => {
    if (!socket) {
      console.log('[BattlePage] match_found listener: no socket yet, skipping.');
      return;
    }

    console.log(`[BattlePage] Setting up match_found listener on socket ${socket.id}`);

    const onMatchFound = ({ roomId }: MatchFoundPayload) => {
      console.log(`[BattlePage] ✅ match_found event received! roomId: ${roomId}`);
      console.log(`[BattlePage] Navigating to /battle/${roomId}`);
      setIsQueuing(false);
      setQueueSeconds(0);
      navigate(`/battle/${roomId}`);
    };

    socket.on('match_found', onMatchFound);
    const onStatus = ({ status }: { status: 'queued' | 'idle' }) => {
      setIsQueuing(status === 'queued');
      if (status === 'queued') setQueueError('');
      if (status === 'idle') setQueueSeconds(0);
    };
    const onError = ({ message }: { message: string }) => {
      setQueueError(message);
      setIsQueuing(false);
      setQueueSeconds(0);
    };
    socket.on('queue_status', onStatus);
    socket.on('server_error', onError);
    return () => {
      console.log(`[BattlePage] Cleaning up match_found listener on socket ${socket.id}`);
      socket.off('match_found', onMatchFound);
      socket.off('queue_status', onStatus);
      socket.off('server_error', onError);
    };
  }, [socket, navigate]);

  useEffect(() => {
    if (!socket) return;
    const onDisconnect = () => {
      setIsQueuing(false);
      setQueueSeconds(0);
    };
    socket.on('disconnect', onDisconnect);
    return () => { socket.off('disconnect', onDisconnect); };
  }, [socket]);

  const handleJoinRankedQueue = () => {
    if (!localStorage.getItem('token')) {
      navigate('/login');
      return;
    }
    setQueueError('');
    if (activeMatch) { navigate(`/battle/${activeMatch.roomId}`); return; }
    if (isQueuing) {
      socket?.emit('leave_queue');
      return;
    }
    if (!socket?.connected) {
      useSocketStore.getState().connect();
      socket?.connect();
      return;
    }
    setQueueSeconds(0);
    socket.emit('join_queue', { mode: 'ranked' });
  };

  return (
    <div style={{
      flex: 1,
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 24px 80px',
      position: 'relative',
      minHeight: '100%',
    }}>
      {/* ── Header ── */}
      <div style={{ textAlign: 'center', marginBottom: '48px', animation: 'slide-up 0.5s ease forwards' }}>
        <h1 className="font-extrabold tracking-tight uppercase" style={{
          fontSize: '48px',
          color: '#ffffff',
          marginBottom: '16px',
          fontFamily: "'Space Grotesk', sans-serif"
        }}>
          SELECT YOUR ARENA
        </h1>
        <p style={{
          color: '#7a7e9a',
          fontSize: '18px',
          fontWeight: 400,
          maxWidth: '540px',
          margin: '0 auto',
          lineHeight: 1.6,
        }}>
          Engage in real-time competitive programming battles.
        </p>
        <Link to="/leaderboard" style={{ display: 'inline-block', color: '#00e5ff', marginTop: 16, fontSize: 13 }}>View ranked leaderboard →</Link>
      </div>

      {/* ── Cards Grid ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: '20px',
        width: '100%',
        maxWidth: '640px',
        animation: 'scale-in 0.6s ease forwards',
      }}>

        {/* ── Casual Card ── */}
        <div
          className="animated-border"
          onMouseEnter={() => setHoveredCard('casual')}
          onMouseLeave={() => setHoveredCard(null)}
          style={{
            borderRadius: '16px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            cursor: 'pointer',
            position: 'relative',
            overflow: 'hidden',
            background: hoveredCard === 'casual'
              ? 'linear-gradient(135deg, rgba(22, 26, 40, 0.98) 0%, rgba(14, 16, 28, 0.98) 100%)'
              : 'linear-gradient(135deg, rgba(18, 20, 30, 0.9) 0%, rgba(12, 13, 20, 0.95) 100%)',
            border: hoveredCard === 'casual'
              ? '1px solid rgba(59, 130, 246, 0.2)'
              : '1px solid rgba(255, 255, 255, 0.04)',
            backdropFilter: 'blur(20px)',
            transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
            transform: hoveredCard === 'casual' ? 'translateY(-6px)' : 'translateY(0)',
            boxShadow: hoveredCard === 'casual'
              ? '0 25px 60px -12px rgba(0, 0, 0, 0.5), 0 0 40px rgba(59, 130, 246, 0.06)'
              : '0 4px 20px -4px rgba(0, 0, 0, 0.3)',
          }}
        >
          {/* Ambient Glow on Hover */}
          <div style={{
            position: 'absolute',
            top: '-60px',
            right: '-60px',
            width: '200px',
            height: '200px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, transparent 65%)',
            opacity: hoveredCard === 'casual' ? 1 : 0,
            transition: 'opacity 0.5s ease',
            pointerEvents: 'none',
          }} />

          {/* Scanline Effect on Hover */}
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(59, 130, 246, 0.015) 2px, rgba(59, 130, 246, 0.015) 4px)',
            opacity: hoveredCard === 'casual' ? 1 : 0,
            transition: 'opacity 0.4s ease',
            pointerEvents: 'none',
            borderRadius: '16px',
          }} />

          {/* Icon */}
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '12px',
            background: hoveredCard === 'casual'
              ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(59, 130, 246, 0.08) 100%)'
              : 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(59, 130, 246, 0.03) 100%)',
            border: `1px solid rgba(59, 130, 246, ${hoveredCard === 'casual' ? '0.25' : '0.12'})`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '20px',
            transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
            transform: hoveredCard === 'casual' ? 'scale(1.1) rotate(-3deg)' : 'scale(1) rotate(0)',
            boxShadow: hoveredCard === 'casual' ? '0 0 24px rgba(59, 130, 246, 0.2)' : 'none',
            position: 'relative',
            zIndex: 1,
          }}>
            <Zap size={20} color="#3b82f6" strokeWidth={2} style={{
              filter: hoveredCard === 'casual' ? 'drop-shadow(0 0 6px rgba(59, 130, 246, 0.5))' : 'none',
              transition: 'filter 0.3s ease',
            }} />
          </div>

          {/* Content */}
          <h2 style={{
            fontSize: '18px',
            fontWeight: 700,
            letterSpacing: '-0.01em',
            marginBottom: '8px',
            color: '#fff',
            position: 'relative',
            zIndex: 1,
            transition: 'color 0.3s ease',
          }}>Casual Mode</h2>
          
          <p style={{
            color: '#7a7e9a',
            fontSize: '14px',
            lineHeight: 1.5,
            marginBottom: '20px',
            position: 'relative',
            zIndex: 1,
          }}>
            Low stakes, high fun. Practice algorithms and experiment freely with no rating changes.
          </p>

          {/* Stats Row */}
          <div style={{
            display: 'flex',
            gap: '16px',
            marginBottom: '24px',
            paddingTop: '16px',
            borderTop: '1px solid rgba(255, 255, 255, 0.04)',
            position: 'relative',
            zIndex: 1,
          }}>
            {[
              { icon: Users, text: '1v1' },
              { icon: Timer, text: '30 min' },
            ].map(({ icon: StatIcon, text }, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <StatIcon size={12} color={hoveredCard === 'casual' ? '#6b6e90' : '#3d405a'} style={{ transition: 'color 0.3s ease' }} />
                <span style={{
                  fontSize: '11px',
                  color: hoveredCard === 'casual' ? '#6b6e90' : '#3d405a',
                  fontWeight: 500,
                  transition: 'color 0.3s ease',
                }}>{text}</span>
              </div>
            ))}
          </div>

          {/* CTA Button */}
          <Link
            to="/ide"
            className="btn-glow"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              width: '100%',
              padding: '10px 0',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 600,
              textDecoration: 'none',
              letterSpacing: '0.02em',
              transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
              position: 'relative',
              zIndex: 1,
              ...(hoveredCard === 'casual' ? {
                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                color: '#fff',
                border: '1px solid rgba(59, 130, 246, 0.4)',
                boxShadow: '0 0 30px rgba(59, 130, 246, 0.2), 0 8px 24px -8px rgba(59, 130, 246, 0.3), inset 0 1px 0 rgba(255,255,255,0.12)',
              } : {
                background: 'rgba(59, 130, 246, 0.06)',
                color: '#3b82f6',
                border: '1px solid rgba(59, 130, 246, 0.12)',
              }),
            }}
          >
            Enter Casual
            <ChevronRight size={14} style={{
              transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
              transform: hoveredCard === 'casual' ? 'translateX(4px)' : 'translateX(0)',
            }} />
          </Link>
        </div>

        {/* ── Ranked Card ── */}
        <div
          className="animated-border"
          onMouseEnter={() => setHoveredCard('ranked')}
          onMouseLeave={() => setHoveredCard(null)}
          style={{
            borderRadius: '16px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            cursor: 'pointer',
            position: 'relative',
            overflow: 'hidden',
            background: hoveredCard === 'ranked'
              ? 'linear-gradient(135deg, rgba(24, 22, 16, 0.98) 0%, rgba(16, 14, 12, 0.98) 100%)'
              : 'linear-gradient(135deg, rgba(18, 20, 30, 0.9) 0%, rgba(12, 13, 20, 0.95) 100%)',
            border: hoveredCard === 'ranked'
              ? '1px solid rgba(249, 115, 22, 0.2)'
              : '1px solid rgba(255, 255, 255, 0.04)',
            backdropFilter: 'blur(20px)',
            transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
            transform: hoveredCard === 'ranked' ? 'translateY(-6px)' : 'translateY(0)',
            boxShadow: hoveredCard === 'ranked'
              ? '0 25px 60px -12px rgba(0, 0, 0, 0.5), 0 0 40px rgba(249, 115, 22, 0.06)'
              : '0 4px 20px -4px rgba(0, 0, 0, 0.3)',
          }}
        >
          {/* Ambient Glow on Hover */}
          <div style={{
            position: 'absolute',
            top: '-60px',
            right: '-60px',
            width: '200px',
            height: '200px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(249, 115, 22, 0.15) 0%, transparent 65%)',
            opacity: hoveredCard === 'ranked' ? 1 : 0,
            transition: 'opacity 0.5s ease',
            pointerEvents: 'none',
          }} />

          {/* Scanline Effect on Hover */}
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(249, 115, 22, 0.015) 2px, rgba(249, 115, 22, 0.015) 4px)',
            opacity: hoveredCard === 'ranked' ? 1 : 0,
            transition: 'opacity 0.4s ease',
            pointerEvents: 'none',
            borderRadius: '16px',
          }} />

          {/* Competitive Badge */}
          <div style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            padding: '4px 12px',
            borderRadius: '99px',
            background: hoveredCard === 'ranked'
              ? 'rgba(249, 115, 22, 0.15)'
              : 'rgba(249, 115, 22, 0.08)',
            border: `1px solid rgba(249, 115, 22, ${hoveredCard === 'ranked' ? '0.3' : '0.15'})`,
            fontSize: '9px',
            fontWeight: 700,
            letterSpacing: '0.1em',
            color: '#f97316',
            textTransform: 'uppercase' as const,
            transition: 'all 0.3s ease',
            zIndex: 1,
            boxShadow: hoveredCard === 'ranked' ? '0 0 12px rgba(249, 115, 22, 0.15)' : 'none',
          }}>
            ⚡ Competitive
          </div>

          {/* Icon */}
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '12px',
            background: hoveredCard === 'ranked'
              ? 'linear-gradient(135deg, rgba(249, 115, 22, 0.2) 0%, rgba(249, 115, 22, 0.08) 100%)'
              : 'linear-gradient(135deg, rgba(249, 115, 22, 0.1) 0%, rgba(249, 115, 22, 0.03) 100%)',
            border: `1px solid rgba(249, 115, 22, ${hoveredCard === 'ranked' ? '0.25' : '0.12'})`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '20px',
            transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
            transform: hoveredCard === 'ranked' ? 'scale(1.1) rotate(3deg)' : 'scale(1) rotate(0)',
            boxShadow: hoveredCard === 'ranked' ? '0 0 24px rgba(249, 115, 22, 0.2)' : 'none',
            position: 'relative',
            zIndex: 1,
          }}>
            <Shield size={20} color="#f97316" strokeWidth={2} style={{
              filter: hoveredCard === 'ranked' ? 'drop-shadow(0 0 6px rgba(249, 115, 22, 0.5))' : 'none',
              transition: 'filter 0.3s ease',
            }} />
          </div>

          {/* Content */}
          <h2 style={{
            fontSize: '18px',
            fontWeight: 700,
            letterSpacing: '-0.01em',
            marginBottom: '8px',
            color: '#fff',
            position: 'relative',
            zIndex: 1,
          }}>Ranked Mode</h2>
          
          <p style={{
            color: '#7a7e9a',
            fontSize: '14px',
            lineHeight: 1.5,
            marginBottom: '20px',
            position: 'relative',
            zIndex: 1,
          }}>
            Two shared problems. Private tests. Real Elo. Find an opponent near your rating and race to solve both.
          </p>

          {/* Stats Row */}
          <div style={{
            display: 'flex',
            gap: '16px',
            marginBottom: '24px',
            paddingTop: '16px',
            borderTop: '1px solid rgba(255, 255, 255, 0.04)',
            position: 'relative',
            zIndex: 1,
          }}>
            {[
              { icon: Users, text: '1v1' },
              { icon: Timer, text: '30 min' },
              { icon: TrendingUp, text: 'Rating pairing' },
            ].map(({ icon: StatIcon, text }, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <StatIcon size={12} color={hoveredCard === 'ranked' ? '#6b6e90' : '#3d405a'} style={{ transition: 'color 0.3s ease' }} />
                <span style={{
                  fontSize: '11px',
                  color: hoveredCard === 'ranked' ? '#6b6e90' : '#3d405a',
                  fontWeight: 500,
                  transition: 'color 0.3s ease',
                }}>{text}</span>
              </div>
            ))}
          </div>

          {/* CTA Button */}
          <button
            type="button"
            className="btn-glow"
            onClick={handleJoinRankedQueue}
            disabled={signedIn && !activeMatch && !isConnected && !connectionError}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              width: '100%',
              padding: '10px 0',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 600,
              letterSpacing: '0.02em',
              transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
              position: 'relative',
              zIndex: 1,
              cursor: 'pointer',
              opacity: signedIn && !isConnected ? 0.75 : 1,
              ...(hoveredCard === 'ranked' ? {
                background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                color: '#fff',
                border: '1px solid rgba(249, 115, 22, 0.4)',
                boxShadow: '0 0 30px rgba(249, 115, 22, 0.2), 0 8px 24px -8px rgba(249, 115, 22, 0.3), inset 0 1px 0 rgba(255,255,255,0.12)',
              } : {
                background: 'rgba(249, 115, 22, 0.06)',
                color: '#f97316',
                border: '1px solid rgba(249, 115, 22, 0.12)',
              }),
            }}
          >
            {isQueuing ? `Cancel search (${queueTimeLabel})` : !signedIn ? 'Sign in to play Ranked' : activeMatch ? 'Resume battle' : !isConnected ? 'Reconnect' : 'Queue for Ranked'}
            <ChevronRight size={14} style={{
              transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
              transform: hoveredCard === 'ranked' ? 'translateX(4px)' : 'translateX(0)',
            }} />
          </button>
          {isQueuing && <p style={{ color: '#7a7e9a', marginTop: '10px', fontSize: '12px' }}>Searching for a player near your rating…</p>}
          {(queueError || connectionError) && <p role="alert" style={{ color: '#f87171', marginTop: '10px', fontSize: '12px' }}>{queueError || connectionError}</p>}
        </div>
      </div>
    </div>
  );
};
