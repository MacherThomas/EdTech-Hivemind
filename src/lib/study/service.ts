import type { Prisma } from "@prisma/client";
import { randomInt } from "crypto";
import { db } from "../db";
import { getAI } from "../ai";
import { config } from "../config";
import { entryGate, entryInclude, groundingEntries } from "../hivemind";
import { assessMaterialGate } from "../integrity";
import { excerpt } from "../text";
import { runJob } from "@/jobs";
import { applyAnswer, type TopicState } from "./adaptive";
import { buildInitialPlan } from "./planner";

export async function createStudyPlan(input: {
  userId: string;
  courseId: string;
  anchorLabel: string;
  anchorDate: Date;
  dailyMinutes: number;
}) {
  let topics = await db.topic.findMany({ where: { courseId: input.courseId }, include: { prerequisites: true } });
  if (topics.length === 0) {
    // Cold start: bootstrap a (clearly inferred) topic structure first.
    await runJob("guide.buildTopics", { courseId: input.courseId });
    topics = await db.topic.findMany({ where: { courseId: input.courseId }, include: { prerequisites: true } });
  }
  const now = new Date();
  const built = buildInitialPlan({
    topics: topics.map((t) => ({ id: t.id, name: t.name, position: t.position, prerequisiteIds: t.prerequisites.map((p) => p.id) })),
    start: now,
    anchorDate: input.anchorDate,
    dailyMinutes: input.dailyMinutes,
  });
  await db.studyPlan.updateMany({
    where: { userId: input.userId, courseId: input.courseId, status: "ACTIVE" },
    data: { status: "ARCHIVED" },
  });
  return db.studyPlan.create({
    data: {
      userId: input.userId,
      courseId: input.courseId,
      anchorLabel: input.anchorLabel,
      anchorDate: input.anchorDate,
      dailyMinutes: input.dailyMinutes,
      paceMode: built.paceMode,
      paceReason: built.paceReason,
      sessions: {
        create: built.sessions.map((s, position) => ({
          position,
          title: s.title,
          kind: s.kind,
          reason: s.reason,
          scheduledFor: s.scheduledFor,
          targetDifficulty: s.targetDifficulty,
          topics: { create: s.topicIds.map((topicId) => ({ topicId })) },
        })),
      },
      progress: { create: topics.map((t) => ({ userId: input.userId, topicId: t.id })) },
    },
  });
}

export function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const EXPECTED_ACCURACY: Record<number, number> = { 1: 0.9, 2: 0.75, 3: 0.6, 4: 0.45, 5: 0.3 };

/** A question is miscalibrated when the observed accuracy (≥ cohort) is far from its intended difficulty. */
export function isMiscalibrated(q: { difficulty: number; aggregate: { attempts: number; correct: number; distinctUsers: number } | null }) {
  const a = q.aggregate;
  if (!a || a.distinctUsers < config.privacy.minCohortSize || a.attempts === 0) return false;
  return Math.abs(a.correct / a.attempts - (EXPECTED_ACCURACY[q.difficulty] ?? 0.6)) > 0.25;
}

/**
 * Attaches practice questions to a session (lazily, on open). Draws from the
 * course's community question bank; sourced-from-material questions only when
 * the material passes the integrity gate. Only tops up with original AI
 * questions when AI is enabled. A session that found nothing is retried the
 * next time it's opened, so newly contributed questions get picked up.
 */
export async function ensureSessionQuestions(sessionId: string, userId: string) {
  const session = await db.studySession.findUniqueOrThrow({
    where: { id: sessionId },
    include: { plan: { include: { course: true } }, topics: { include: { topic: true } }, questions: { include: { question: true } } },
  });
  // Only top up topics that don't have a question in this session yet.
  const covered = new Set(session.questions.map((q) => q.question.topicId));
  const uncovered = session.topics.filter(({ topic }) => !covered.has(topic.id));
  if (uncovered.length === 0) return;
  const course = session.plan.course;
  const perTopic = Math.max(1, Math.ceil(config.study.questionsPerSession / Math.max(1, session.topics.length)));
  const chosen: string[] = session.questions.map((q) => q.questionId);
  const startPos = session.questions.length;

  for (const { topic } of uncovered) {
    const answeredRight = await db.performanceRecord.findMany({
      where: { userId, topicId: topic.id, correct: true },
      select: { questionId: true },
    });
    const skip = new Set(answeredRight.map((r) => r.questionId));
    const bank = await db.practiceQuestion.findMany({
      where: { topicId: topic.id, moderation: "VISIBLE" },
      include: { aggregate: true, sourceMaterial: { include: { offering: { include: { term: true } } } } },
    });
    const usable = bank
      .filter((q) => !skip.has(q.id) && !chosen.includes(q.id))
      .filter((q) => {
        if (q.origin !== "SOURCED_FROM_MATERIAL") return true;
        const m = q.sourceMaterial;
        return !!m && !assessMaterialGate({ kind: m.kind, assessmentStatus: m.assessmentStatus, termEndsOn: m.offering?.term.endsOn }).gated;
      })
      // Prefer questions near the target difficulty and well calibrated; fall back to any.
      .sort(
        (a, b) =>
          Number(Math.abs(a.difficulty - session.targetDifficulty) > 1) - Number(Math.abs(b.difficulty - session.targetDifficulty) > 1) ||
          Number(isMiscalibrated(a)) - Number(isMiscalibrated(b)),
      );
    const picked = usable.slice(0, perTopic).map((q) => q.id);

    const ai = getAI();
    if (ai && picked.length < perTopic) {
      const entries = await groundingEntries(course.id, `${topic.name} ${topic.summary ?? ""}`, { topicId: topic.id, limit: 3, topicOnly: true });
      const retired = await db.material.findMany({
        where: { courseId: course.id, topics: { some: { id: topic.id } }, assessmentStatus: "RETIRED", extractedText: { not: null }, moderation: "VISIBLE" },
        include: { offering: { include: { term: true } } },
        take: 3,
      });
      const drafts = await ai.generateQuestions({
        courseName: `${course.code} ${course.name}`,
        topic: { name: topic.name, summary: topic.summary },
        count: perTopic - picked.length,
        targetDifficulty: session.targetDifficulty,
        entries: entries.map((e) => ({ id: e.id, title: e.title, body: e.body, origin: e.origin, verification: e.verification })),
        retiredExamples: retired
          .filter((m) => !assessMaterialGate({ kind: m.kind, assessmentStatus: m.assessmentStatus, termEndsOn: m.offering?.term.endsOn }).gated)
          .map((m) => excerpt(m.extractedText ?? "", 1200)),
        avoidPrompts: bank.map((q) => q.prompt),
      });
      for (const d of drafts) {
        const q = await db.practiceQuestion.create({
          data: {
            courseId: course.id,
            topicId: topic.id,
            type: d.type,
            difficulty: d.difficulty,
            prompt: d.prompt,
            // Shuffle so the correct option's position carries no signal, whatever the generator did.
            choices: d.choices ? (shuffle(d.choices) as Prisma.InputJsonValue) : undefined,
            answer: d.answer,
            explanation: d.explanation,
            origin: "AI_ORIGINAL",
          },
        });
        picked.push(q.id);
      }
    }
    chosen.push(...picked);
  }
  const added = chosen.slice(startPos);
  if (added.length === 0) return;
  await db.studySessionQuestion.createMany({
    data: added.map((questionId, i) => ({ sessionId, questionId, position: startPos + i })),
    skipDuplicates: true,
  });
  if (session.status === "UPCOMING") await db.studySession.update({ where: { id: sessionId }, data: { status: "IN_PROGRESS" } });
}

export type Reteach = { text: string; source: "community" | "ai"; entryId?: string; entryTitle?: string };

/**
 * Mechanism 2 (re-teaching): after a wrong answer, show a *different*
 * explanation: a community entry on the topic the student hasn't read yet.
 * With AI enabled, falls back to an AI re-explanation; otherwise returns null
 * and the UI points the student to chat.
 */
export async function reteachFor(userId: string, topicId: string, mistake: { prompt: string; response: string; correctAnswer: string }): Promise<Reteach | null> {
  const topic = await db.topic.findUniqueOrThrow({ where: { id: topicId }, include: { course: true } });
  const seen = await db.knowledgeEntryView.findMany({ where: { userId, entry: { topicId } }, select: { entryId: true } });
  const seenIds = new Set(seen.map((s) => s.entryId));
  const candidates = await db.knowledgeEntry.findMany({
    where: { topicId, status: "ACTIVE", supersededBy: null },
    include: entryInclude,
    orderBy: [{ verification: "desc" }, { updatedAt: "desc" }],
  });
  const usable = candidates.filter((e) => !entryGate(e).gated);
  const fresh = usable.find((e) => !seenIds.has(e.id));
  if (fresh) {
    await db.knowledgeEntryView.create({ data: { userId, entryId: fresh.id } });
    return { text: fresh.body, source: fresh.origin === "AI_DRAFTED" ? "ai" : "community", entryId: fresh.id, entryTitle: fresh.title };
  }
  const ai = getAI();
  if (!ai) return null;
  const text = await ai.reteach({
    courseName: `${topic.course.code} ${topic.course.name}`,
    topic: { name: topic.name, summary: topic.summary },
    mistake,
    alreadySeen: usable.filter((e) => seenIds.has(e.id)).map((e) => e.body),
  });
  return { text, source: "ai" };
}

export type AnswerResult =
  | { status: "graded"; correct: boolean; explanation: string; answer: string; reteach: Reteach | null }
  /** Written answers without AI grading: show the model answer and let the student mark themselves. */
  | { status: "self-grade"; response: string; explanation: string; answer: string };

export async function submitAnswer(input: {
  userId: string;
  sessionId: string;
  questionId: string;
  response: string;
  selfGrade?: "correct" | "incorrect";
}): Promise<AnswerResult> {
  const sq = await db.studySessionQuestion.findUniqueOrThrow({
    where: { sessionId_questionId: { sessionId: input.sessionId, questionId: input.questionId } },
    include: { question: true, session: { include: { plan: true } } },
  });
  if (sq.session.plan.userId !== input.userId) throw new Error("Not your study plan.");
  const q = sq.question;
  const already = await db.performanceRecord.findFirst({ where: { userId: input.userId, sessionId: input.sessionId, questionId: q.id } });
  if (already) return { status: "graded", correct: already.correct, explanation: q.explanation, answer: q.answer, reteach: null };

  let correct: boolean;
  if (q.type === "MULTIPLE_CHOICE") correct = input.response.trim() === q.answer.trim();
  else if (q.type === "NUMERIC") correct = Math.abs(Number(input.response) - Number(q.answer)) <= Math.max(1e-6, Math.abs(Number(q.answer)) * 0.01);
  else {
    const ai = getAI();
    if (ai) correct = await ai.gradeShortAnswer({ prompt: q.prompt, expected: q.answer, response: input.response });
    else if (input.selfGrade) correct = input.selfGrade === "correct";
    else return { status: "self-grade", response: input.response, explanation: q.explanation, answer: q.answer };
  }

  const now = new Date();
  await db.performanceRecord.create({
    data: { userId: input.userId, topicId: q.topicId, questionId: q.id, sessionId: input.sessionId, response: input.response, correct },
  });
  const p = await db.userTopicProgress.upsert({
    where: { planId_topicId: { planId: sq.session.planId, topicId: q.topicId } },
    create: { userId: input.userId, planId: sq.session.planId, topicId: q.topicId },
    update: {},
    include: { topic: true },
  });
  const state: TopicState = {
    topicId: p.topicId, name: p.topic.name, mastery: p.mastery, attempts: p.attempts, status: p.status,
    stalledCycles: p.stalledCycles, intervalDays: p.intervalDays, nextReviewAt: p.nextReviewAt,
    masteryAtLastCycle: p.masteryAtLastCycle, lastReason: p.lastReason,
  };
  const next = applyAnswer(state, correct, now);
  await db.userTopicProgress.update({
    where: { id: p.id },
    data: { mastery: next.mastery, attempts: next.attempts, status: next.status, intervalDays: next.intervalDays, nextReviewAt: next.nextReviewAt },
  });

  const reteach = correct ? null : await reteachFor(input.userId, q.topicId, { prompt: q.prompt, response: input.response, correctAnswer: q.answer });
  return { status: "graded", correct, explanation: q.explanation, answer: q.answer, reteach };
}

export async function completeSession(userId: string, sessionId: string) {
  const s = await db.studySession.findUniqueOrThrow({ where: { id: sessionId }, include: { plan: true, questions: true, attempts: true } });
  if (s.plan.userId !== userId) throw new Error("Not your study plan.");
  await db.studySession.update({ where: { id: sessionId }, data: { status: "COMPLETED", completedAt: new Date() } });
  const result = await runJob("guide.adaptPlan", { planId: s.planId });
  await runJob("aggregates.recompute", {
    topicIds: [...new Set(s.attempts.map((a) => a.topicId))],
    questionIds: [...new Set(s.attempts.map((a) => a.questionId))],
  });
  const remaining = await db.studySession.count({ where: { planId: s.planId, status: { in: ["UPCOMING", "IN_PROGRESS"] } } });
  if (remaining === 0) await db.studyPlan.update({ where: { id: s.planId }, data: { status: "COMPLETED" } });
  return result;
}
