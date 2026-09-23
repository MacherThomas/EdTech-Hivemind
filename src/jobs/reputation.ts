import { db } from "@/lib/db";
import { computeReputationScore } from "@/lib/reputation";

/** Recomputes a user's per-course reputation signals from source data. */
export async function recomputeReputation({ userId, courseId }: { userId: string; courseId: string }) {
  const inCourse = { thread: { courseId } };
  const [up, down, answersPosted, resolvedAnswers, entriesContributed, sessions, hiddenMsgs, deprecatedEntries, hiddenMaterials] =
    await Promise.all([
      db.messageVote.count({ where: { value: 1, message: { authorId: userId, ...inCourse }, NOT: { userId } } }),
      db.messageVote.count({ where: { value: -1, message: { authorId: userId, ...inCourse }, NOT: { userId } } }),
      db.chatMessage.count({ where: { authorId: userId, ...inCourse } }),
      db.chatThread.count({
        where: { courseId, resolvedMessage: { authorId: userId }, NOT: { authorId: userId } },
      }),
      db.knowledgeEntry.count({
        where: { courseId, contributorId: userId, status: "ACTIVE", verification: "COMMUNITY_VERIFIED" },
      }),
      db.tutoringSession.findMany({
        where: { courseId, status: "COMPLETED", tutor: { userId } },
        select: { rating: true },
      }),
      db.chatMessage.count({ where: { authorId: userId, moderation: "HIDDEN", ...inCourse } }),
      db.knowledgeEntry.count({ where: { courseId, contributorId: userId, status: "DEPRECATED" } }),
      db.material.count({ where: { courseId, uploaderId: userId, moderation: "HIDDEN" } }),
    ]);
  const rated = sessions.filter((s) => s.rating != null);
  const signals = {
    upvotesReceived: up,
    downvotesReceived: down,
    answersPosted,
    resolvedAnswers,
    entriesContributed,
    sessionsCompleted: sessions.length,
    ratingSum: rated.reduce((a, s) => a + (s.rating ?? 0), 0),
    ratingCount: rated.length,
    flagsUpheld: hiddenMsgs + deprecatedEntries + hiddenMaterials,
  };
  const score = computeReputationScore(signals);
  await db.courseReputation.upsert({
    where: { userId_courseId: { userId, courseId } },
    create: { userId, courseId, ...signals, score },
    update: { ...signals, score },
  });
  const total = await db.courseReputation.aggregate({ where: { userId }, _sum: { score: true } });
  await db.user.update({ where: { id: userId }, data: { reputation: total._sum.score ?? 0 } });
  return { score };
}
