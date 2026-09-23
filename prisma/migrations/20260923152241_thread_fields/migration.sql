-- AlterTable
ALTER TABLE "ChatThread" ADD COLUMN     "aiAnswerPending" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "resolvedById" TEXT;
