# Code Clash

A multiplayer coding app where two players join a match, solve a set of problems, and follow each other's progress. There is also a standalone code sandbox for running programs without entering a battle.

React, TypeScript, and Monaco handle the browser interface. An Express server manages accounts and Socket.IO matches, PostgreSQL stores users and match records through Prisma, and Judge0 runs submitted code.

## Included

- Account registration and login, with profile and match history screens.
- A matchmaking queue, timed battles, progress updates, and a post-match summary.
- A Monaco editor with language selection, standard input, and execution output.
- A separate sandbox backed by the Judge0 API.

The sandbox sends code to Judge0 for execution. Live battles currently use fixed problem sets and simulated test-case results, with parts of the post-match summary also hardcoded. Matchmaking stores a placeholder problem record; a complete battle judge is still to be added.

## Run locally

Use Node.js 22.12+, PostgreSQL, and a running Judge0 instance. Docker Compose configuration for Judge0 is included in `judge0/judge0-v1.13.1/`.

```bash
git clone https://github.com/kailashp-27/Code-Clash.git
cd Code-Clash
npm install
cd server
npm install
```

The root installation is needed because the current server imports `bcrypt` and `jsonwebtoken` from dependencies declared there.

Create `server/.env`:

```env
DATABASE_URL=postgresql://username:password@localhost:5432/codeclash
JWT_SECRET=replace-with-your-own-random-secret
PORT=5000
JUDGE0_URL=http://localhost:2358
```

Create the `codeclash` database in PostgreSQL, then run from `server/`:

```bash
npx prisma generate
npx prisma db push
npm run dev
```

In a second terminal, from the repository root:

```bash
cd client
npm install
npm run dev
```

Open [localhost:5173](http://localhost:5173). The client proxies `/api` requests to port 5000. Socket.IO also defaults to that port; `VITE_SOCKET_URL` can override the socket address, but some account requests still use `localhost:5000` directly.

### Judge0 setup

Start the bundled Judge0 stack in a separate terminal:

```bash
cd judge0/judge0-v1.13.1
docker compose up -d
```

The Compose stack publishes PostgreSQL on port 5432 as well as Judge0 on port 2358. If your application database already uses 5432, change the Judge0 database's host port mapping before starting the stack.

Check [localhost:5000/health](http://localhost:5000/health) for the app server and [localhost:2358/languages](http://localhost:2358/languages) for Judge0.

## Code guide

| Path | Purpose |
| --- | --- |
| `client/src/pages/` | Login, battles, profiles, and sandbox pages |
| `client/src/components/` | Editor, navigation, and match summary |
| `server/src/index.ts` | API setup and Judge0 execution requests |
| `server/src/socket.ts` | Queue and live match events |
| `server/prisma/schema.prisma` | User, problem, and match records |
| `judge0/` | Local code execution configuration |

From `client/`, use `npm run build` to build the app and `npm run lint` to check the source.
