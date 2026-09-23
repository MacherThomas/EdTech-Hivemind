-- AlterEnum
ALTER TYPE "FlagTarget" ADD VALUE 'QUESTION';

-- AlterTable
ALTER TABLE "PracticeQuestion" ADD COLUMN     "authorId" TEXT,
ADD COLUMN     "moderation" "ModerationState" NOT NULL DEFAULT 'VISIBLE';

-- AddForeignKey
ALTER TABLE "PracticeQuestion" ADD CONSTRAINT "PracticeQuestion_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
