CREATE TABLE IF NOT EXISTS "FdaBriefing" (
  "id" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "findings" JSONB NOT NULL,
  "sourcesUsed" JSONB NOT NULL,
  "updatedByUserId" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FdaBriefing_pkey" PRIMARY KEY ("id")
);
