import { db } from "@/lib/db";

/**
 * Rebuilds course-level aggregates from private PerformanceRecords. These
 * aggregates are the only performance data that ever leaves a user's view,
 * and are only displayed past the minimum cohort size (lib/privacy.ts).
 */
export async function recomputeAggregates({ topicIds, questionIds }: { topicIds: string[]; questionIds: string[] }) {
  for (const topicId of new Set(topicIds)) {
    const [counts, correct, users] = await Promise.all([
      db.performanceRecord.count({ where: { topicId } }),
      db.performanceRecord.count({ where: { topicId, correct: true } }),
      db.performanceRecord.groupBy({ by: ["userId"], where: { topicId } }),
    ]);
    await db.topicAggregate.upsert({
      where: { topicId },
      create: { topicId, attempts: counts, correct, distinctUsers: users.length },
      update: { attempts: counts, correct, distinctUsers: users.length },
    });
  }
  for (const questionId of new Set(questionIds)) {
    const [counts, correct, users] = await Promise.all([
      db.performanceRecord.count({ where: { questionId } }),
      db.performanceRecord.count({ where: { questionId, correct: true } }),
      db.performanceRecord.groupBy({ by: ["userId"], where: { questionId } }),
    ]);
    await db.questionAggregate.upsert({
      where: { questionId },
      create: { questionId, attempts: counts, correct, distinctUsers: users.length },
      update: { attempts: counts, correct, distinctUsers: users.length },
    });
  }
}
