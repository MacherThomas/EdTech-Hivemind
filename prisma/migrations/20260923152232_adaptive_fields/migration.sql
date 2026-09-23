-- AlterTable
ALTER TABLE "StudySession" ADD COLUMN     "targetDifficulty" INTEGER NOT NULL DEFAULT 2;

-- AlterTable
ALTER TABLE "UserTopicProgress" ADD COLUMN     "masteryAtLastCycle" DOUBLE PRECISION;
