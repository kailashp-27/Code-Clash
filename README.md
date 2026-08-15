# Code Clash ⚔️

Code Clash is a real-time multiplayer coding platform where developers can challenge each other, solve programming problems, and execute code in real-time. It provides an interactive and competitive environment designed to test and improve your coding skills.

---

## ✨ Key Features

- 🏎️ **Real-Time Multiplayer Battles:** Connect instantly with other developers via WebSocket and compete head-to-head.
- ⚡ **Live Code Execution:** Safely execute code in various languages with isolated, containerized environments powered by Judge0.
- 💻 **Premium Editor Experience:** Integrated **Monaco Editor** provides advanced syntax highlighting, auto-completion, and an authentic VS Code-like feel.
- 🎨 **Modern & Responsive UI:** Crafted with **Tailwind CSS**, ensuring a beautiful experience across all devices.
- 🔄 **Instant Synchronization:** Real-time state management and immediate visual feedback powered by **Socket.IO** and **Zustand**.

---

## 🛠 Tech Stack

### Frontend
- **Framework**: React 19 + Vite
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **State Management**: Zustand
- **Code Editor**: Monaco Editor (`@monaco-editor/react`)
- **Data Fetching**: React Query
- **Routing**: React Router DOM

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js
- **Language**: TypeScript
- **Real-Time Communication**: Socket.IO
- **Database ORM**: Prisma
- **Database**: PostgreSQL

### Code Execution
- **Engine**: Judge0 (v1.13.1)

---

## 📁 Project Structure

The repository is organized into three main modules:

```text
code-clash/
├── client/              # 🖥️ React frontend application
│   ├── src/             # Source code (components, pages, store, etc.)
│   └── package.json     
├── server/              # ⚙️ Node.js + Express backend API and WebSockets
│   ├── src/             # Controllers, routes, and socket logic
│   ├── prisma/          # Database schema and migrations
│   └── package.json     
└── judge0/              # 🛡️ Code execution engine (Dockerized)
    └── judge0-v1.13.1/  # Configuration and docker-compose files
```

---

## 📋 Prerequisites

Before you begin, ensure you have the following installed on your machine:
- **Node.js** (v18 or higher)
- **npm** (or yarn/pnpm)
- **PostgreSQL** (running locally or a cloud instance)
- **Docker & Docker Compose** (required for running Judge0)

---

## 🚀 How to Run Locally

Follow these instructions to get your local development environment up and running.

<details open>
<summary><b>Step 1: Start the Code Execution Engine (Judge0)</b></summary>
<br>

Judge0 handles securely running user code. It must be running for the platform to evaluate submissions.

```bash
cd judge0/judge0-v1.13.1
docker-compose up -d
```
*Note: This will pull the necessary Docker images and start Judge0 on your machine (usually on port 2358).*
</details>

<details open>
<summary><b>Step 2: Setup the Backend (Server)</b></summary>
<br>

Install dependencies and start the Node.js server.

```bash
cd server
npm install
```

**Environment Variables:** Create a `.env` file in the `server` directory.
```env
# Example .env for Server
DATABASE_URL="postgresql://username:password@localhost:5432/codeclash"
PORT=5000
# Update this if your local Judge0 is running on a different port/IP
JUDGE0_API_URL="http://localhost:2358" 
```

**Database Setup:**
```bash
# Generate Prisma Client
npx prisma generate
# Push the schema to the database
npx prisma db push
```

**Run Server:**
```bash
npm run dev
```
</details>

<details open>
<summary><b>Step 3: Setup the Frontend (Client)</b></summary>
<br>

Install dependencies and start the Vite development server.

```bash
cd client
npm install
```

**Environment Variables:** Create a `.env` file in the `client` directory.
```env
# Example .env for Client
VITE_API_URL="http://localhost:5000"
```

**Run Client:**
```bash
npm run dev
```
The application should now be accessible at `http://localhost:5173`.
</details>

---

## 📝 Important Notes & Troubleshooting

- **Database Connection:** Ensure your PostgreSQL server is actively running before starting the backend, or Prisma will throw a connection error.
- **Judge0 Initialization:** The Judge0 docker containers might take a minute or two to fully initialize the first time you run them. If code execution fails initially, wait a moment and try again.
- **CORS Issues:** If the frontend cannot communicate with the backend or Judge0, ensure that the CORS settings in `server/src/index.ts` (or similar) allow requests from `http://localhost:5173`.

---

<div align="center">
  <i>Let the code battles begin! ⚔️</i>
</div>