import { create } from 'zustand';
import { io, type Socket } from 'socket.io-client';

import type { ClientToServerEvents, ServerToClientEvents, MatchFoundPayload } from '../socket/events';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin;

interface SocketState {
  socket: Socket<ServerToClientEvents, ClientToServerEvents> | null;
  isConnected: boolean;
  activeMatch: MatchFoundPayload | null;
  connectionError: string;
  connect: () => void;
  disconnect: () => void;
}

export const useSocketStore = create<SocketState>((set, get) => ({
  socket: null,
  isConnected: false,
  activeMatch: null,
  connectionError: '',
  connect: () => {
    if (!localStorage.getItem('token')) return;
    // If socket already exists AND is connected (or connecting), skip.
    const existing = get().socket;
    if (existing) {
      console.log(`[SocketStore] connect() called but socket already exists (id: ${existing.id}, connected: ${existing.connected}). Skipping.`);
      return;
    }

    console.log('[SocketStore] Creating new socket connection to', SOCKET_URL);

    const socket = io(SOCKET_URL, {
      autoConnect: false,
      withCredentials: false,
      auth: callback => callback({ token: localStorage.getItem('token') }),
    });

    socket.on('connect', () => {
      console.log(`[SocketStore] ✅ Socket connected! id: ${socket.id}`);
      set({ isConnected: true, connectionError: '' });
    });

    socket.on('disconnect', (reason) => {
      console.log(`[SocketStore] ❌ Socket disconnected. reason: ${reason}`);
      set({ isConnected: false });
    });

    socket.on('connect_error', (err) => {
      console.error(`[SocketStore] ❌ Connection error:`, err.message);
      set({ connectionError: err.message });
    });
    socket.on('match_found', activeMatch => set({ activeMatch }));
    socket.on('battle_sync', payload => set(state => ({ activeMatch: state.activeMatch ? { ...state.activeMatch, ...payload } : null })));
    socket.on('match_over', () => set({ activeMatch: null }));
    socket.on('match_cancelled', () => set({ activeMatch: null }));

    set({ socket });
    socket.connect();
  },
  disconnect: () => {
    const socket = get().socket;
    if (socket) {
      console.log(`[SocketStore] Disconnecting socket ${socket.id}`);
      socket.disconnect();
    }
    set({ socket: null, isConnected: false, activeMatch: null, connectionError: '' });
  },
}));
