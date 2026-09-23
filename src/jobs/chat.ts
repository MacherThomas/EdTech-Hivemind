import { db } from "@/lib/db";
import { getAI } from "@/lib/ai";
import { AIRefusalError } from "@/lib/ai/anthropic";
import { canGroundAI, assessMaterialGate, liveAssignmentHint } from "@/lib/integrity";
import { currentOffering, groundingEntries } from "@/lib/hivemind";
import { excerpt, overlapScore } from "@/lib/text";

/**
 * "AI answers first": a new question gets an immediate AI draft, grounded on
 * community knowledge first, which students can confirm (upvote), correct or
 * expand. The draft is always stored as AI_DRAFTED + UNVERIFIED.
 */
export async function aiAnswerThread({ threadId }: { threadId: string }) {
  const thread = await db.chatThread.findUnique({
    where: { id: threadId },
    include: { course: { include: { topics: { orderBy: { position: "asc" } } } }, material: { include: { offering: { include: { term: true } } } } },
  });
  if (!thread) return;
  try {
    const query = `${thread.title}\n${thread.body}`;
    const offering = thread.offeringId ? { id: thread.offeringId } : await currentOffering(thread.courseId);
    const entries = await groundingEntries(thread.courseId, query, { topicId: thread.topicId, offeringId: offering?.id });

    const materialGate = thread.material
      ? assessMaterialGate({
          kind: thread.material.kind,
          assessmentStatus: thread.material.assessmentStatus,
          termEndsOn: thread.material.offering?.term.endsOn,
        })
      : null;
    const hint = liveAssignmentHint(query);
    const liveRisk = !!materialGate?.gated || !!hint;
    const integrityNote = materialGate?.gated ? `${materialGate.reason} Only methods and concepts are covered.` : hint;

    // Materials may only ground the AI if they pass the integrity gate.
    const candidates = await db.material.findMany({
      where: { courseId: thread.courseId, moderation: "VISIBLE", extractedText: { not: null } },
      include: { offering: { include: { term: true } } },
      take: 100,
      orderBy: { createdAt: "desc" },
    });
    const materialExcerpts = candidates
      .filter((m) => canGroundAI({ kind: m.kind, assessmentStatus: m.assessmentStatus, termEndsOn: m.offering?.term.endsOn }))
      .map((m) => ({ m, s: overlapScore(query, `${m.title} ${m.extractedText}`) }))
      .filter((x) => x.s > 0.3)
      .sort((a, b) => b.s - a.s)
      .slice(0, 2)
      .map((x) => `${x.m.title}: ${excerpt(x.m.extractedText ?? "", 3000)}`);

    const out = await getAI().answerQuestion({
      courseName: `${thread.course.code} ${thread.course.name}`,
      topics: thread.course.topics.map((t) => t.name),
      question: query,
      entries: entries.map((e) => ({ id: e.id, title: e.title, body: e.body, origin: e.origin, verification: e.verification })),
      materialExcerpts,
      liveRisk,
    });
    const topic = !thread.topicId && out.topic ? thread.course.topics.find((t) => t.name === out.topic) : null;

    await db.$transaction([
      db.chatMessage.create({
        data: {
          threadId,
          origin: "AI_DRAFTED",
          verification: "UNVERIFIED",
          body: out.answer,
          groundedOnEntryIds: out.usedEntryIds,
          integrityNote,
        },
      }),
      db.chatThread.update({
        where: { id: threadId },
        data: { aiAnswerPending: false, lastActivityAt: new Date(), ...(topic ? { topicId: topic.id } : {}) },
      }),
    ]);
  } catch (err) {
    await db.chatThread.update({ where: { id: threadId }, data: { aiAnswerPending: false } });
    if (err instanceof AIRefusalError) return;
    throw err;
  }
}
