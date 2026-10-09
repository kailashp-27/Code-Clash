# Code Clash client

The React and TypeScript frontend for coding battles, account screens, and the standalone sandbox. It uses Monaco for editing, Socket.IO for match events, and Zustand for socket state.

## Development

Follow the [project setup guide](../README.md) to start PostgreSQL, the app server, and Judge0. From this directory:

```bash
npm install
npm run dev
```

Open [localhost:5173](http://localhost:5173). The Vite proxy forwards `/api` and Socket.IO to the backend configured by `API_PROXY_TARGET`, defaulting to `localhost:5000`.

For a separate backend origin, configure `VITE_API_URL` for HTTP requests and `VITE_SOCKET_URL` for sockets. See `client/.env.example` and the root setup guide.

## Useful commands

```bash
npm run build
npm run lint
npm run preview
```

`src/pages/` contains the app screens, `src/components/LocalCodeEditor.tsx` serves the shared editor, and `src/stores/useSocketStore.ts` owns the socket connection. The root README links to delivered features and remaining work.
