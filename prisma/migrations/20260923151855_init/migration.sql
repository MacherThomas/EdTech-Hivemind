-- CreateEnum
CREATE TYPE "ContentOrigin" AS ENUM ('COMMUNITY', 'AI_DRAFTED', 'TUTOR');

-- CreateEnum
CREATE TYPE "VerificationState" AS ENUM ('UNVERIFIED', 'COMMUNITY_VERIFIED');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('SELF_REPORTED', 'VERIFIED');

-- CreateEnum
CREATE TYPE "ThreadStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ModerationState" AS ENUM ('VISIBLE', 'FLAGGED', 'HIDDEN');

-- CreateEnum
CREATE TYPE "FlagTarget" AS ENUM ('THREAD', 'MESSAGE', 'MATERIAL', 'KNOWLEDGE_ENTRY');

-- CreateEnum
CREATE TYPE "TopicSource" AS ENUM ('SYLLABUS', 'INFERRED', 'COMMUNITY');

-- CreateEnum
CREATE TYPE "KnowledgeSource" AS ENUM ('CHAT_PROMOTION', 'TUTOR_SESSION', 'AI_GENERATED', 'DIRECT_CONTRIBUTION');

-- CreateEnum
CREATE TYPE "KnowledgeStability" AS ENUM ('TERM_STABLE', 'TERM_SPECIFIC');

-- CreateEnum
CREATE TYPE "KnowledgeStatus" AS ENUM ('ACTIVE', 'FLAGGED', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "MaterialKind" AS ENUM ('PAST_EXAM', 'PROBLEM_SET', 'SOLUTIONS', 'NOTES', 'SLIDES', 'SYLLABUS', 'OTHER');

-- CreateEnum
CREATE TYPE "AssessmentStatus" AS ENUM ('NOT_ASSESSMENT', 'RETIRED', 'POSSIBLY_LIVE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "StudySessionKind" AS ENUM ('LEARN', 'REINFORCE', 'RETEACH', 'RESURFACE', 'DEEPEN', 'REVIEW');

-- CreateEnum
CREATE TYPE "StudySessionStatus" AS ENUM ('UPCOMING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('MULTIPLE_CHOICE', 'SHORT_ANSWER', 'NUMERIC');

-- CreateEnum
CREATE TYPE "QuestionOrigin" AS ENUM ('AI_ORIGINAL', 'SOURCED_FROM_MATERIAL', 'COMMUNITY');

-- CreateEnum
CREATE TYPE "TopicProgressStatus" AS ENUM ('UPCOMING', 'IN_PROGRESS', 'MASTERED', 'STRUGGLING');

-- CreateEnum
CREATE TYPE "TutoringSessionStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'CAPTURED', 'REFUNDED', 'FAILED');

-- CreateEnum
CREATE TYPE "PayoutAccountStatus" AS ENUM ('NOT_STARTED', 'PENDING', 'ACTIVE', 'RESTRICTED');

-- CreateTable
CREATE TABLE "School" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Madrid',
    "enrollmentVerifier" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "School_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolDomain" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerifiedAt" TIMESTAMP(3) NOT NULL,
    "schoolId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "reputation" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailChallenge" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Term" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startsOn" TIMESTAMP(3) NOT NULL,
    "endsOn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Term_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Professor" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Professor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "syllabusText" TEXT,
    "syllabusIngestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseOffering" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,

    CONSTRAINT "CourseOffering_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enrollment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "offeringId" TEXT,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'SELF_REPORTED',
    "verifiedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Topic" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "source" "TopicSource" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "createdById" TEXT,

    CONSTRAINT "Topic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatThread" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "offeringId" TEXT,
    "topicId" TEXT,
    "materialId" TEXT,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "ThreadStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedMessageId" TEXT,
    "moderation" "ModerationState" NOT NULL DEFAULT 'VISIBLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "authorId" TEXT,
    "origin" "ContentOrigin" NOT NULL,
    "verification" "VerificationState" NOT NULL DEFAULT 'UNVERIFIED',
    "body" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "groundedOnEntryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "integrityNote" TEXT,
    "moderation" "ModerationState" NOT NULL DEFAULT 'VISIBLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageVote" (
    "userId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageVote_pkey" PRIMARY KEY ("userId","messageId")
);

-- CreateTable
CREATE TABLE "ContentFlag" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetType" "FlagTarget" NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "kind" "MaterialKind" NOT NULL,
    "offeringId" TEXT,
    "professorId" TEXT,
    "assessmentStatus" "AssessmentStatus" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "extractedText" TEXT,
    "moderation" "ModerationState" NOT NULL DEFAULT 'VISIBLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeEntry" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "topicId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "origin" "ContentOrigin" NOT NULL,
    "verification" "VerificationState" NOT NULL,
    "source" "KnowledgeSource" NOT NULL,
    "stability" "KnowledgeStability" NOT NULL DEFAULT 'TERM_STABLE',
    "offeringId" TEXT,
    "assessmentMaterialId" TEXT,
    "status" "KnowledgeStatus" NOT NULL DEFAULT 'ACTIVE',
    "contributorId" TEXT,
    "promotedFromMessageId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "supersedesId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeEntryView" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeEntryView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudyPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "anchorLabel" TEXT NOT NULL,
    "anchorDate" TIMESTAMP(3) NOT NULL,
    "status" "PlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "dailyMinutes" INTEGER NOT NULL DEFAULT 60,
    "paceMode" TEXT NOT NULL DEFAULT 'normal',
    "paceReason" TEXT,
    "adaptationCycles" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudyPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudySession" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "StudySessionKind" NOT NULL DEFAULT 'LEARN',
    "status" "StudySessionStatus" NOT NULL DEFAULT 'UPCOMING',
    "reason" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "StudySession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudySessionTopic" (
    "sessionId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,

    CONSTRAINT "StudySessionTopic_pkey" PRIMARY KEY ("sessionId","topicId")
);

-- CreateTable
CREATE TABLE "PracticeQuestion" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL,
    "difficulty" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "choices" JSONB,
    "answer" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "origin" "QuestionOrigin" NOT NULL,
    "sourceMaterialId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PracticeQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudySessionQuestion" (
    "sessionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "StudySessionQuestion_pkey" PRIMARY KEY ("sessionId","questionId")
);

-- CreateTable
CREATE TABLE "PerformanceRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "sessionId" TEXT,
    "response" TEXT NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PerformanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserTopicProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "status" "TopicProgressStatus" NOT NULL DEFAULT 'UPCOMING',
    "mastery" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "stalledCycles" INTEGER NOT NULL DEFAULT 0,
    "intervalDays" INTEGER NOT NULL DEFAULT 1,
    "nextReviewAt" TIMESTAMP(3),
    "lastReason" TEXT,

    CONSTRAINT "UserTopicProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TopicAggregate" (
    "topicId" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "correct" INTEGER NOT NULL DEFAULT 0,
    "distinctUsers" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TopicAggregate_pkey" PRIMARY KEY ("topicId")
);

-- CreateTable
CREATE TABLE "QuestionAggregate" (
    "questionId" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "correct" INTEGER NOT NULL DEFAULT 0,
    "distinctUsers" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionAggregate_pkey" PRIMARY KEY ("questionId")
);

-- CreateTable
CREATE TABLE "CourseReputation" (
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "upvotesReceived" INTEGER NOT NULL DEFAULT 0,
    "downvotesReceived" INTEGER NOT NULL DEFAULT 0,
    "answersPosted" INTEGER NOT NULL DEFAULT 0,
    "resolvedAnswers" INTEGER NOT NULL DEFAULT 0,
    "entriesContributed" INTEGER NOT NULL DEFAULT 0,
    "sessionsCompleted" INTEGER NOT NULL DEFAULT 0,
    "ratingSum" INTEGER NOT NULL DEFAULT 0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "flagsUpheld" INTEGER NOT NULL DEFAULT 0,
    "score" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseReputation_pkey" PRIMARY KEY ("userId","courseId")
);

-- CreateTable
CREATE TABLE "TutorProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bio" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Madrid',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "payoutProvider" TEXT,
    "payoutAccountRef" TEXT,
    "payoutStatus" "PayoutAccountStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TutorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TutorCourseRate" (
    "id" TEXT NOT NULL,
    "tutorId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "sessionMinutes" INTEGER NOT NULL DEFAULT 60,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TutorCourseRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TutorAvailability" (
    "id" TEXT NOT NULL,
    "tutorId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,

    CONSTRAINT "TutorAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TutoringSession" (
    "id" TEXT NOT NULL,
    "tutorId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "scheduledStart" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "status" "TutoringSessionStatus" NOT NULL DEFAULT 'REQUESTED',
    "priceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "studentNote" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancellationReason" TEXT,
    "refundEligible" BOOLEAN,
    "disputeOpenedAt" TIMESTAMP(3),
    "disputeOpenedById" TEXT,
    "disputeReason" TEXT,
    "disputeResolvedAt" TIMESTAMP(3),
    "disputeResolution" TEXT,
    "rating" INTEGER,
    "review" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TutoringSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerPaymentRef" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amountCents" INTEGER NOT NULL,
    "platformFeeCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRun" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "durationMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_CourseOfferingToProfessor" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_CourseOfferingToProfessor_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_TopicPrerequisites" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_TopicPrerequisites_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_MaterialToTopic" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_MaterialToTopic_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "School_slug_key" ON "School"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolDomain_domain_key" ON "SchoolDomain"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "EmailChallenge_email_idx" ON "EmailChallenge"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Term_schoolId_code_key" ON "Term"("schoolId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Professor_schoolId_name_key" ON "Professor"("schoolId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Course_schoolId_code_key" ON "Course"("schoolId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "CourseOffering_courseId_termId_key" ON "CourseOffering"("courseId", "termId");

-- CreateIndex
CREATE INDEX "Enrollment_courseId_idx" ON "Enrollment"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_userId_courseId_key" ON "Enrollment"("userId", "courseId");

-- CreateIndex
CREATE UNIQUE INDEX "Topic_courseId_name_key" ON "Topic"("courseId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ChatThread_resolvedMessageId_key" ON "ChatThread"("resolvedMessageId");

-- CreateIndex
CREATE INDEX "ChatThread_courseId_lastActivityAt_idx" ON "ChatThread"("courseId", "lastActivityAt");

-- CreateIndex
CREATE INDEX "ChatMessage_threadId_createdAt_idx" ON "ChatMessage"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "ContentFlag_targetType_targetId_idx" ON "ContentFlag"("targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentFlag_userId_targetType_targetId_key" ON "ContentFlag"("userId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "Material_courseId_createdAt_idx" ON "Material"("courseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeEntry_promotedFromMessageId_key" ON "KnowledgeEntry"("promotedFromMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeEntry_supersedesId_key" ON "KnowledgeEntry"("supersedesId");

-- CreateIndex
CREATE INDEX "KnowledgeEntry_courseId_topicId_status_idx" ON "KnowledgeEntry"("courseId", "topicId", "status");

-- CreateIndex
CREATE INDEX "KnowledgeEntryView_entryId_idx" ON "KnowledgeEntryView"("entryId");

-- CreateIndex
CREATE INDEX "StudyPlan_userId_courseId_idx" ON "StudyPlan"("userId", "courseId");

-- CreateIndex
CREATE INDEX "StudySession_planId_position_idx" ON "StudySession"("planId", "position");

-- CreateIndex
CREATE INDEX "PracticeQuestion_courseId_topicId_idx" ON "PracticeQuestion"("courseId", "topicId");

-- CreateIndex
CREATE INDEX "PerformanceRecord_userId_topicId_idx" ON "PerformanceRecord"("userId", "topicId");

-- CreateIndex
CREATE UNIQUE INDEX "UserTopicProgress_planId_topicId_key" ON "UserTopicProgress"("planId", "topicId");

-- CreateIndex
CREATE INDEX "CourseReputation_courseId_score_idx" ON "CourseReputation"("courseId", "score");

-- CreateIndex
CREATE UNIQUE INDEX "TutorProfile_userId_key" ON "TutorProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TutorCourseRate_tutorId_courseId_key" ON "TutorCourseRate"("tutorId", "courseId");

-- CreateIndex
CREATE INDEX "TutoringSession_tutorId_scheduledStart_idx" ON "TutoringSession"("tutorId", "scheduledStart");

-- CreateIndex
CREATE INDEX "TutoringSession_studentId_scheduledStart_idx" ON "TutoringSession"("studentId", "scheduledStart");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_sessionId_key" ON "Payment"("sessionId");

-- CreateIndex
CREATE INDEX "JobRun_name_createdAt_idx" ON "JobRun"("name", "createdAt");

-- CreateIndex
CREATE INDEX "_CourseOfferingToProfessor_B_index" ON "_CourseOfferingToProfessor"("B");

-- CreateIndex
CREATE INDEX "_TopicPrerequisites_B_index" ON "_TopicPrerequisites"("B");

-- CreateIndex
CREATE INDEX "_MaterialToTopic_B_index" ON "_MaterialToTopic"("B");

-- AddForeignKey
ALTER TABLE "SchoolDomain" ADD CONSTRAINT "SchoolDomain_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Term" ADD CONSTRAINT "Term_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Professor" ADD CONSTRAINT "Professor_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseOffering" ADD CONSTRAINT "CourseOffering_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseOffering" ADD CONSTRAINT "CourseOffering_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "CourseOffering"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Topic" ADD CONSTRAINT "Topic_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Topic" ADD CONSTRAINT "Topic_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "CourseOffering"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_resolvedMessageId_fkey" FOREIGN KEY ("resolvedMessageId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageVote" ADD CONSTRAINT "MessageVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageVote" ADD CONSTRAINT "MessageVote_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentFlag" ADD CONSTRAINT "ContentFlag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "CourseOffering"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_professorId_fkey" FOREIGN KEY ("professorId") REFERENCES "Professor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeEntry" ADD CONSTRAINT "KnowledgeEntry_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeEntry" ADD CONSTRAINT "KnowledgeEntry_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeEntry" ADD CONSTRAINT "KnowledgeEntry_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "CourseOffering"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeEntry" ADD CONSTRAINT "KnowledgeEntry_assessmentMaterialId_fkey" FOREIGN KEY ("assessmentMaterialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeEntry" ADD CONSTRAINT "KnowledgeEntry_contributorId_fkey" FOREIGN KEY ("contributorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeEntry" ADD CONSTRAINT "KnowledgeEntry_promotedFromMessageId_fkey" FOREIGN KEY ("promotedFromMessageId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeEntry" ADD CONSTRAINT "KnowledgeEntry_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "KnowledgeEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeEntryView" ADD CONSTRAINT "KnowledgeEntryView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeEntryView" ADD CONSTRAINT "KnowledgeEntryView_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "KnowledgeEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyPlan" ADD CONSTRAINT "StudyPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyPlan" ADD CONSTRAINT "StudyPlan_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudySession" ADD CONSTRAINT "StudySession_planId_fkey" FOREIGN KEY ("planId") REFERENCES "StudyPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudySessionTopic" ADD CONSTRAINT "StudySessionTopic_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "StudySession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudySessionTopic" ADD CONSTRAINT "StudySessionTopic_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeQuestion" ADD CONSTRAINT "PracticeQuestion_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeQuestion" ADD CONSTRAINT "PracticeQuestion_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeQuestion" ADD CONSTRAINT "PracticeQuestion_sourceMaterialId_fkey" FOREIGN KEY ("sourceMaterialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudySessionQuestion" ADD CONSTRAINT "StudySessionQuestion_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "StudySession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudySessionQuestion" ADD CONSTRAINT "StudySessionQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "PracticeQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceRecord" ADD CONSTRAINT "PerformanceRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceRecord" ADD CONSTRAINT "PerformanceRecord_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceRecord" ADD CONSTRAINT "PerformanceRecord_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "PracticeQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceRecord" ADD CONSTRAINT "PerformanceRecord_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "StudySession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTopicProgress" ADD CONSTRAINT "UserTopicProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTopicProgress" ADD CONSTRAINT "UserTopicProgress_planId_fkey" FOREIGN KEY ("planId") REFERENCES "StudyPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTopicProgress" ADD CONSTRAINT "UserTopicProgress_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicAggregate" ADD CONSTRAINT "TopicAggregate_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionAggregate" ADD CONSTRAINT "QuestionAggregate_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "PracticeQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseReputation" ADD CONSTRAINT "CourseReputation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseReputation" ADD CONSTRAINT "CourseReputation_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorProfile" ADD CONSTRAINT "TutorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorCourseRate" ADD CONSTRAINT "TutorCourseRate_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "TutorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorCourseRate" ADD CONSTRAINT "TutorCourseRate_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorAvailability" ADD CONSTRAINT "TutorAvailability_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "TutorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutoringSession" ADD CONSTRAINT "TutoringSession_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "TutorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutoringSession" ADD CONSTRAINT "TutoringSession_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutoringSession" ADD CONSTRAINT "TutoringSession_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TutoringSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CourseOfferingToProfessor" ADD CONSTRAINT "_CourseOfferingToProfessor_A_fkey" FOREIGN KEY ("A") REFERENCES "CourseOffering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CourseOfferingToProfessor" ADD CONSTRAINT "_CourseOfferingToProfessor_B_fkey" FOREIGN KEY ("B") REFERENCES "Professor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TopicPrerequisites" ADD CONSTRAINT "_TopicPrerequisites_A_fkey" FOREIGN KEY ("A") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TopicPrerequisites" ADD CONSTRAINT "_TopicPrerequisites_B_fkey" FOREIGN KEY ("B") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MaterialToTopic" ADD CONSTRAINT "_MaterialToTopic_A_fkey" FOREIGN KEY ("A") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MaterialToTopic" ADD CONSTRAINT "_MaterialToTopic_B_fkey" FOREIGN KEY ("B") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
