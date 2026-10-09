-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "rating" INTEGER NOT NULL DEFAULT 1200,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "draws" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "problems" (
    "id" TEXT NOT NULL,
    "shortCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL DEFAULT 'EASY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "topic" TEXT NOT NULL DEFAULT 'General',
    "tests" JSONB,
    "starters" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "problems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matches" (
    "id" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "player1Id" TEXT NOT NULL,
    "player2Id" TEXT NOT NULL,
    "winnerId" TEXT,
    "loserId" TEXT,
    "winnerRatingChange" INTEGER,
    "loserRatingChange" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "deadlineAt" TIMESTAMP(3),
    "drainUntil" TIMESTAMP(3),
    "reason" TEXT,
    "rulesVersion" TEXT NOT NULL DEFAULT 'ranked-v1',
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "player1RatingBefore" INTEGER,
    "player2RatingBefore" INTEGER,
    "player1RatingAfter" INTEGER,
    "player2RatingAfter" INTEGER,
    "player1Change" INTEGER,
    "player2Change" INTEGER,

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_problems" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,

    CONSTRAINT "match_problems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "active_players" (
    "userId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,

    CONSTRAINT "active_players_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "sourceCode" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'QUEUED',
    "verdict" TEXT,
    "passed" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "time" DOUBLE PRECISION,
    "memory" INTEGER,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "cases" JSONB NOT NULL DEFAULT '[]',
    "compileOutput" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseUntil" TIMESTAMP(3),
    "leaseOwner" TEXT,
    "integrity" JSONB,

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_achievements" (
    "userId" TEXT NOT NULL,
    "achievementId" TEXT NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_achievements_pkey" PRIMARY KEY ("userId","achievementId")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "problems_shortCode_key" ON "problems"("shortCode");

-- CreateIndex
CREATE INDEX "matches_status_deadlineAt_idx" ON "matches"("status", "deadlineAt");

-- CreateIndex
CREATE UNIQUE INDEX "match_problems_matchId_slot_key" ON "match_problems"("matchId", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "match_problems_matchId_problemId_key" ON "match_problems"("matchId", "problemId");

-- CreateIndex
CREATE INDEX "active_players_matchId_idx" ON "active_players"("matchId");

-- CreateIndex
CREATE INDEX "submissions_state_leaseUntil_receivedAt_idx" ON "submissions"("state", "leaseUntil", "receivedAt");

-- CreateIndex
CREATE INDEX "submissions_matchId_userId_mode_verdict_idx" ON "submissions"("matchId", "userId", "mode", "verdict");

-- CreateIndex
CREATE UNIQUE INDEX "submissions_userId_matchId_requestId_key" ON "submissions"("userId", "matchId", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "submissions_matchId_sequence_key" ON "submissions"("matchId", "sequence");

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "problems"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_player1Id_fkey" FOREIGN KEY ("player1Id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_player2Id_fkey" FOREIGN KEY ("player2Id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_loserId_fkey" FOREIGN KEY ("loserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_problems" ADD CONSTRAINT "match_problems_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_problems" ADD CONSTRAINT "match_problems_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "problems"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "active_players" ADD CONSTRAINT "active_players_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "active_players" ADD CONSTRAINT "active_players_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "match_problems"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
