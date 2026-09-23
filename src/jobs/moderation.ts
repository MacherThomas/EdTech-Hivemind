import type { FlagTarget } from "@prisma/client";
import { db } from "@/lib/db";
import { config } from "@/lib/config";
import { recomputeReputation } from "./reputation";

/**
 * Community-driven review: flags are weighted by the flagger's course
 * reputation. Crossing flagThreshold marks content FLAGGED (warning shown,
 * excluded from AI grounding); crossing hideThreshold hides/deprecates it.
 */
export async function reviewFlags({ targetType, targetId }: { targetType: FlagTarget; targetId: string }) {
  const agg = await db.contentFlag.aggregate({ where: { targetType, targetId }, _sum: { weight: true } });
  const weight = agg._sum.weight ?? 0;
  const level = weight >= config.moderation.hideThreshold ? 2 : weight >= config.moderation.flagThreshold ? 1 : 0;
  const moderation = (["VISIBLE", "FLAGGED", "HIDDEN"] as const)[level];

  let author: { userId: string | null; courseId: string } | null = null;
  switch (targetType) {
    case "MESSAGE": {
      const m = await db.chatMessage.update({ where: { id: targetId }, data: { moderation }, include: { thread: true } });
      author = { userId: m.authorId, courseId: m.thread.courseId };
      if (level >= 1) {
        // A flagged answer's promoted entry is pulled from AI grounding as well.
        await db.knowledgeEntry.updateMany({
          where: { promotedFromMessageId: targetId, status: "ACTIVE" },
          data: { status: level === 2 ? "DEPRECATED" : "FLAGGED" },
        });
      }
      break;
    }
    case "THREAD": {
      const t = await db.chatThread.update({ where: { id: targetId }, data: { moderation } });
      author = { userId: t.authorId, courseId: t.courseId };
      break;
    }
    case "MATERIAL": {
      const m = await db.material.update({ where: { id: targetId }, data: { moderation } });
      author = { userId: m.uploaderId, courseId: m.courseId };
      break;
    }
    case "KNOWLEDGE_ENTRY": {
      const status = (["ACTIVE", "FLAGGED", "DEPRECATED"] as const)[level];
      const e = await db.knowledgeEntry.update({ where: { id: targetId }, data: { status } });
      author = { userId: e.contributorId, courseId: e.courseId };
      break;
    }
  }
  if (author?.userId) await recomputeReputation({ userId: author.userId, courseId: author.courseId });
  return { weight, moderation };
}
