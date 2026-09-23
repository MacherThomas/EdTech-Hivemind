import { db } from "@/lib/db";
import { adapt, type TopicState } from "@/lib/study/adaptive";

/** Runs one adaptation cycle on a plan and persists the result. */
export async function adaptStudyPlan({ planId }: { planId: string }) {
  const plan = await db.studyPlan.findUniqueOrThrow({
    where: { id: planId },
    include: {
      progress: { include: { topic: true } },
      sessions: { where: { status: { in: ["UPCOMING", "IN_PROGRESS"] } }, include: { topics: true }, orderBy: { position: "asc" } },
    },
  });
  const now = new Date();
  const topics: TopicState[] = plan.progress.map((p) => ({
    topicId: p.topicId,
    name: p.topic.name,
    mastery: p.mastery,
    attempts: p.attempts,
    status: p.status,
    stalledCycles: p.stalledCycles,
    intervalDays: p.intervalDays,
    nextReviewAt: p.nextReviewAt,
    masteryAtLastCycle: p.masteryAtLastCycle,
    lastReason: p.lastReason,
  }));
  const out = adapt({
    now,
    anchorDate: plan.anchorDate,
    dailyMinutes: plan.dailyMinutes,
    topics,
    queue: plan.sessions
      .filter((s) => s.status === "UPCOMING")
      .map((s) => ({
        id: s.id,
        title: s.title,
        kind: s.kind,
        topicIds: s.topics.map((t) => t.topicId),
        reason: s.reason,
        targetDifficulty: s.targetDifficulty,
        scheduledFor: s.scheduledFor,
      })),
  });

  const maxPos = await db.studySession.aggregate({ where: { planId }, _max: { position: true } });
  const inProgress = plan.sessions.filter((s) => s.status === "IN_PROGRESS").length;
  let position = (maxPos._max.position ?? 0) + 1;
  await db.$transaction(async (tx) => {
    for (const t of out.topics) {
      await tx.userTopicProgress.update({
        where: { planId_topicId: { planId, topicId: t.topicId } },
        data: {
          stalledCycles: t.stalledCycles,
          masteryAtLastCycle: t.masteryAtLastCycle,
          lastReason: t.lastReason,
        },
      });
    }
    if (out.skippedIds.length) {
      await tx.studySession.updateMany({ where: { id: { in: out.skippedIds } }, data: { status: "SKIPPED" } });
    }
    // Re-sequence: completed sessions keep low positions; the new queue follows.
    position += inProgress;
    for (const q of out.queue) {
      const data = {
        position: position++,
        scheduledFor: q.scheduledFor,
        title: q.title,
        reason: q.reason,
        targetDifficulty: q.targetDifficulty,
      };
      if (q.id) {
        await tx.studySession.update({ where: { id: q.id }, data });
        await tx.studySessionTopic.deleteMany({ where: { sessionId: q.id } });
        await tx.studySessionTopic.createMany({ data: q.topicIds.map((topicId) => ({ sessionId: q.id!, topicId })) });
      } else {
        await tx.studySession.create({
          data: { ...data, planId, kind: q.kind, topics: { create: q.topicIds.map((topicId) => ({ topicId })) } },
        });
      }
    }
    await tx.studyPlan.update({
      where: { id: planId },
      data: { paceMode: out.paceMode, paceReason: out.paceReason, adaptationCycles: { increment: 1 } },
    });
  });
  return { decisions: out.decisions, tutorSuggestedTopicIds: out.tutorSuggestedTopicIds };
}
