# Code Clash client

The React and TypeScript frontend for coding battles, account screens, and the standalone sandbox. It uses Monaco for editing, Socket.IO for match events, and Zustand for socket state.

## Development

Follow the [project setup guide](../README.md) to start PostgreSQL, the app server, and Judge0. From this directory:

```bash
npm install
npm run dev
```

Open [localhost:5173](http://localhost:5173). The Vite proxy forwards `/api` to `localhost:5000`. Socket connections use the same address by default; `VITE_SOCKET_URL` overrides the socket URL.

Some account requests use `localhost:5000` directly, so changing the socket URL alone does not move the whole client to another backend.

## Useful commands

```bash
npm run build
npm run lint
npm run preview
```

`src/pages/` contains the app screens, `src/components/Sandbox.tsx` contains the editor, and `src/stores/useSocketStore.ts` owns the socket connection. The root README covers the current prototype limitations.
