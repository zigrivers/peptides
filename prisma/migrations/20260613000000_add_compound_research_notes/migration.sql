-- CreateTable
CREATE TABLE "CompoundResearchNote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answerSummary" TEXT,
    "claim" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompoundResearchNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompoundResearchNoteCitation" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,

    CONSTRAINT "CompoundResearchNoteCitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompoundResearchNote_userId_catalogItemId_idx" ON "CompoundResearchNote"("userId", "catalogItemId");

-- AddForeignKey
ALTER TABLE "CompoundResearchNote" ADD CONSTRAINT "CompoundResearchNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompoundResearchNote" ADD CONSTRAINT "CompoundResearchNote_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "Compound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompoundResearchNoteCitation" ADD CONSTRAINT "CompoundResearchNoteCitation_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "CompoundResearchNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
