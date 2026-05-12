import { create } from 'zustand';
import { io, type Socket } from 'socket.io-client';

import type { ClientToServerEvents, ServerToClientEvents } from '../socket/events';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:5000';

interface SocketState {
  socket: Socket<ServerToClientEvents, ClientToServerEvents> | null;
  isConnected: boolean;
  connect: () => void;
  disconnect: () => void;
}

export const useSocketStore = create<SocketState>((set, get) => ({
  socket: null,
  isConnected: false,
  connect: () => {
    // If socket already exists AND is connected (or connecting), skip.
    const existing = get().socket;
    if (existing) {
      console.log(`[SocketStore] connect() called but socket already exists (id: ${existing.id}, connected: ${existing.connected}). Skipping.`);
      return;
    }

    console.log('[SocketStore] Creating new socket connection to', SOCKET_URL);

    const socket = io(SOCKET_URL, {
      autoConnect: true,
      withCredentials: false,
    });

    socket.on('connect', () => {
      console.log(`[SocketStore] ✅ Socket connected! id: ${socket.id}`);
      set({ isConnected: true });
    });

    socket.on('disconnect', (reason) => {
      console.log(`[SocketStore] ❌ Socket disconnected. reason: ${reason}`);
      set({ isConnected: false });
    });

    socket.on('connect_error', (err) => {
      console.error(`[SocketStore] ❌ Connection error:`, err.message);
    });

    set({ socket });
  },
  disconnect: () => {
    const socket = get().socket;
    if (socket) {
      console.log(`[SocketStore] Disconnecting socket ${socket.id}`);
      socket.disconnect();
    }
    set({ socket: null, isConnected: false });
  },
}));
