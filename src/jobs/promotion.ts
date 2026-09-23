import { db } from "@/lib/db";
import { config } from "@/lib/config";
import { validateEntryVersioning } from "@/lib/hivemind";
import { recomputeReputation } from "./reputation";

const ASSESSMENT_KINDS = ["PAST_EXAM", "PROBLEM_SET", "SOLUTIONS"];

/**
 * Promotion policy (auto past threshold):
 *  - net score ≥ promotion.upvoteThreshold, or
 *  - marked as the resolving answer by someone with ≥ trustedResolverReputation in the course.
 * Promotion is visible in the thread ("added to the study guide"). Community
 * flags can deprecate the entry afterwards (see moderation job).
 */
export async function evaluatePromotion({ messageId }: { messageId: string }) {
  const msg = await db.chatMessage.findUnique({
    where: { id: messageId },
    include: { promotedEntry: true, thread: { include: { material: true } } },
  });
  if (!msg || msg.promotedEntry || msg.moderation !== "VISIBLE" || msg.thread.moderation === "HIDDEN") return { promoted: false };

  let eligible = msg.score >= config.promotion.upvoteThreshold;
  if (!eligible && msg.thread.resolvedMessageId === msg.id && msg.thread.resolvedById) {
    const rep = await db.courseReputation.findUnique({
      where: { userId_courseId: { userId: msg.thread.resolvedById, courseId: msg.thread.courseId } },
    });
    eligible = (rep?.score ?? 0) >= config.promotion.trustedResolverReputation;
  }
  if (!eligible) return { promoted: false };

  const t = msg.thread;
  const linked = t.material && ASSESSMENT_KINDS.includes(t.material.kind) ? t.material : null;
  const offeringId = linked?.offeringId ?? t.offeringId ?? null;
  // Answers about a specific assessment are term-specific and inherit its live/retired gate.
  const stability = linked && offeringId ? "TERM_SPECIFIC" : "TERM_STABLE";
  validateEntryVersioning({ stability, offeringId });

  await db.$transaction([
    db.knowledgeEntry.create({
      data: {
        courseId: t.courseId,
        topicId: t.topicId,
        title: t.title,
        body: msg.body,
        origin: msg.origin,
        verification: "COMMUNITY_VERIFIED",
        source: "CHAT_PROMOTION",
        stability,
        offeringId: stability === "TERM_SPECIFIC" ? offeringId : null,
        assessmentMaterialId: linked?.id ?? null,
        contributorId: msg.authorId,
        promotedFromMessageId: msg.id,
      },
    }),
    db.chatMessage.update({ where: { id: msg.id }, data: { verification: "COMMUNITY_VERIFIED" } }),
  ]);
  if (msg.authorId) await recomputeReputation({ userId: msg.authorId, courseId: t.courseId });
  return { promoted: true };
}
