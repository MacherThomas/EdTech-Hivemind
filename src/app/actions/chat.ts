"use server";

import type { FlagTarget } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { config } from "@/lib/config";
import { requireUser } from "@/lib/auth/session";
import { assertBelongsToCourse, assertCanContribute } from "@/lib/permissions";
import { currentOffering } from "@/lib/hivemind";
import { flagWeight } from "@/lib/reputation";
import { enqueue, runJob } from "@/jobs";
import { aiEnabled } from "@/lib/features";
import { handle, optStr, str, UserError } from "./util";
import type { FormState } from "@/components/ActionForm";

export async function createThread(courseId: string, _: FormState, form: FormData) {
  return handle(async () => {
    const user = await requireUser();
    await assertCanContribute(user, courseId);
    const title = z.string().trim().min(8, "Give your question a descriptive title (8+ characters).").max(160).parse(str(form, "title"));
    const body = z.string().trim().min(10, "Add a bit more detail (10+ characters).").max(8000).parse(str(form, "body"));
    const topicId = optStr(form, "topicId");
    const materialId = optStr(form, "materialId");
    await assertBelongsToCourse(courseId, { topicIds: [topicId], materialId });
    const enrollment = await db.enrollment.findUnique({ where: { userId_courseId: { userId: user.id, courseId } } });
    const offeringId = enrollment?.offeringId ?? (await currentOffering(courseId))?.id ?? null;
    const ai = aiEnabled();
    const thread = await db.chatThread.create({
      data: { courseId, authorId: user.id, title, body, topicId, materialId, offeringId, aiAnswerPending: ai },
    });
    // "AI answers first" (only when AI is enabled) runs in the background; the thread page polls until it lands.
    if (ai) enqueue("chat.aiAnswer", { threadId: thread.id });
    redirect(`/courses/${courseId}/chat/${thread.id}`);
  });
}

export async function reply(threadId: string, _: FormState, form: FormData) {
  return handle(async () => {
    const user = await requireUser();
    const thread = await db.chatThread.findUniqueOrThrow({ where: { id: threadId } });
    await assertCanContribute(user, thread.courseId);
    const body = z.string().trim().min(2, "Write a reply first.").max(8000).parse(str(form, "body"));
    await db.$transaction([
      db.chatMessage.create({ data: { threadId, authorId: user.id, origin: "COMMUNITY", body } }),
      db.chatThread.update({ where: { id: threadId }, data: { lastActivityAt: new Date() } }),
    ]);
    await runJob("reputation.recompute", { userId: user.id, courseId: thread.courseId });
    revalidatePath(`/courses/${thread.courseId}/chat/${threadId}`);
    return { ok: "Reply posted." };
  });
}

export async function vote(messageId: string, rawValue: number) {
  const value = rawValue > 0 ? 1 : -1; // bound args are client-controlled
  const user = await requireUser();
  const msg = await db.chatMessage.findUniqueOrThrow({ where: { id: messageId }, include: { thread: true } });
  await assertCanContribute(user, msg.thread.courseId);
  if (msg.authorId === user.id) return;
  const existing = await db.messageVote.findUnique({ where: { userId_messageId: { userId: user.id, messageId } } });
  if (existing?.value === value) await db.messageVote.delete({ where: { userId_messageId: { userId: user.id, messageId } } });
  else
    await db.messageVote.upsert({
      where: { userId_messageId: { userId: user.id, messageId } },
      create: { userId: user.id, messageId, value },
      update: { value },
    });
  const agg = await db.messageVote.aggregate({ where: { messageId }, _sum: { value: true } });
  await db.chatMessage.update({ where: { id: messageId }, data: { score: agg._sum.value ?? 0 } });
  if (msg.authorId) await runJob("reputation.recompute", { userId: msg.authorId, courseId: msg.thread.courseId });
  await runJob("hivemind.evaluatePromotion", { messageId });
  revalidatePath(`/courses/${msg.thread.courseId}/chat/${msg.threadId}`);
}

/** The asker, or a high-reputation member of the course, can mark the resolving answer. */
export async function markResolved(threadId: string, messageId: string) {
  const user = await requireUser();
  const thread = await db.chatThread.findUniqueOrThrow({ where: { id: threadId } });
  await assertCanContribute(user, thread.courseId);
  if (thread.authorId !== user.id) {
    const rep = await db.courseReputation.findUnique({ where: { userId_courseId: { userId: user.id, courseId: thread.courseId } } });
    if ((rep?.score ?? 0) < config.promotion.trustedResolverReputation) return;
  }
  const msg = await db.chatMessage.findUniqueOrThrow({ where: { id: messageId } });
  if (msg.threadId !== threadId) return;
  await db.chatThread.update({
    where: { id: threadId },
    data: { status: "RESOLVED", resolvedMessageId: messageId, resolvedById: user.id },
  });
  if (msg.authorId) await runJob("reputation.recompute", { userId: msg.authorId, courseId: thread.courseId });
  await runJob("hivemind.evaluatePromotion", { messageId });
  revalidatePath(`/courses/${thread.courseId}/chat/${threadId}`);
}

/** Resolves the course from the target itself — never from a client-supplied id. */
async function courseOfTarget(targetType: FlagTarget, targetId: string) {
  switch (targetType) {
    case "MESSAGE":
      return (await db.chatMessage.findUnique({ where: { id: targetId }, select: { thread: { select: { courseId: true } } } }))?.thread.courseId;
    case "THREAD":
      return (await db.chatThread.findUnique({ where: { id: targetId }, select: { courseId: true } }))?.courseId;
    case "MATERIAL":
      return (await db.material.findUnique({ where: { id: targetId }, select: { courseId: true } }))?.courseId;
    case "KNOWLEDGE_ENTRY":
      return (await db.knowledgeEntry.findUnique({ where: { id: targetId }, select: { courseId: true } }))?.courseId;
    case "QUESTION":
      return (await db.practiceQuestion.findUnique({ where: { id: targetId }, select: { courseId: true } }))?.courseId;
  }
}

const FLAG_TARGETS: FlagTarget[] = ["THREAD", "MESSAGE", "MATERIAL", "KNOWLEDGE_ENTRY", "QUESTION"];

export async function flagContent(targetType: FlagTarget, targetId: string, _: FormState, form: FormData) {
  return handle(async () => {
    const user = await requireUser();
    if (!FLAG_TARGETS.includes(targetType)) throw new UserError("Not found.");
    const courseId = await courseOfTarget(targetType, targetId);
    if (!courseId) throw new UserError("Not found.");
    await assertCanContribute(user, courseId);
    const reason = z.string().trim().min(3, "Say briefly what's wrong.").max(500).parse(str(form, "reason"));
    const rep = await db.courseReputation.findUnique({ where: { userId_courseId: { userId: user.id, courseId } } });
    await db.contentFlag.upsert({
      where: { userId_targetType_targetId: { userId: user.id, targetType, targetId } },
      create: { userId: user.id, targetType, targetId, reason, weight: flagWeight(rep?.score ?? 0) },
      update: { reason },
    });
    await runJob("moderation.reviewFlags", { targetType, targetId });
    revalidatePath(`/courses/${courseId}`, "layout");
    return { ok: "Thanks. Flags are reviewed by the course community." };
  });
}

/** Any enrolled student can tag an untagged thread; promoted answers from it get the same topic. */
export async function setThreadTopic(threadId: string, form: FormData) {
  const user = await requireUser();
  const thread = await db.chatThread.findUniqueOrThrow({ where: { id: threadId } });
  await assertCanContribute(user, thread.courseId);
  if (thread.topicId) return;
  const topicId = optStr(form, "topicId");
  if (!topicId) return;
  await assertBelongsToCourse(thread.courseId, { topicIds: [topicId] });
  await db.$transaction([
    db.chatThread.update({ where: { id: threadId }, data: { topicId } }),
    db.knowledgeEntry.updateMany({ where: { promotedFromMessage: { threadId }, topicId: null }, data: { topicId } }),
  ]);
  revalidatePath(`/courses/${thread.courseId}`, "layout");
}
