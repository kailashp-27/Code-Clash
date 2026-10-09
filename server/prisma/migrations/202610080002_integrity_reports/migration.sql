ALTER TABLE "users" ADD COLUMN "bannedAt" TIMESTAMP(3), ADD COLUMN "banReason" TEXT;
CREATE TABLE "integrity_reports" (
  "id" TEXT NOT NULL, "submissionId" TEXT NOT NULL, "matchId" TEXT NOT NULL,
  "problemId" TEXT NOT NULL, "reporterId" TEXT NOT NULL, "subjectId" TEXT NOT NULL,
  "category" TEXT NOT NULL, "details" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "reviewerId" TEXT,
  "reviewedAt" TIMESTAMP(3), "reviewReason" TEXT, "appeal" TEXT, "appealedAt" TIMESTAMP(3),
  CONSTRAINT "integrity_reports_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "integrity_reports_reporterId_submissionId_key" ON "integrity_reports"("reporterId", "submissionId");
CREATE INDEX "integrity_reports_subjectId_status_idx" ON "integrity_reports"("subjectId", "status");
CREATE INDEX "integrity_reports_status_createdAt_idx" ON "integrity_reports"("status", "createdAt");
ALTER TABLE "integrity_reports" ADD CONSTRAINT "integrity_reports_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "integrity_reports" ADD CONSTRAINT "integrity_reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "integrity_reports" ADD CONSTRAINT "integrity_reports_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "integrity_reports" ADD CONSTRAINT "integrity_reports_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
