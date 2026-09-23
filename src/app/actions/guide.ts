"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { assertCanContribute, canViewCourse } from "@/lib/permissions";
import { completeSession, createStudyPlan, submitAnswer } from "@/lib/study/service";
import { runJob } from "@/jobs";
import { handle, str, UserError } from "./util";
import type { FormState } from "@/components/ActionForm";

export async function saveSyllabus(courseId: string, _: FormState, form: FormData) {
  return handle(async () => {
    const user = await requireUser();
    await assertCanContribute(user, courseId);
    const text = z.string().trim().min(40, "Paste the syllabus text (at least a few lines).").max(100_000).parse(str(form, "syllabus"));
    await db.course.update({ where: { id: courseId }, data: { syllabusText: text } });
    const res = (await runJob("guide.buildTopics", { courseId })) as { count: number };
    revalidatePath(`/courses/${courseId}/guide`);
    return { ok: `Topic structure rebuilt from the syllabus (${res.count} topics).` };
  });
}

export async function inferTopics(courseId: string) {
  const user = await requireUser();
  await assertCanContribute(user, courseId);
  await runJob("guide.buildTopics", { courseId });
  revalidatePath(`/courses/${courseId}/guide`);
}

export async function addTopic(courseId: string, _: FormState, form: FormData) {
  return handle(async () => {
    const user = await requireUser();
    await assertCanContribute(user, courseId);
    const name = z.string().trim().min(3, "Topic names need 3+ characters.").max(80).parse(str(form, "name"));
    const max = await db.topic.aggregate({ where: { courseId }, _max: { position: true } });
    const dup = await db.topic.findUnique({ where: { courseId_name: { courseId, name } } });
    if (dup) throw new UserError("That topic already exists.");
    await db.topic.create({
      data: { courseId, name, position: (max._max.position ?? -1) + 1, source: "COMMUNITY", confidence: 0.7, createdById: user.id },
    });
    revalidatePath(`/courses/${courseId}/guide`);
    return { ok: "Topic added." };
  });
}

export async function createPlan(courseId: string, _: FormState, form: FormData) {
  return handle(async () => {
    const user = await requireUser();
    if (!(await canViewCourse(user, courseId))) throw new UserError("Course not found.");
    const anchorLabel = z.string().trim().min(2, "Name the deadline (e.g. Midterm).").max(60).parse(str(form, "anchorLabel"));
    const anchorDate = new Date(str(form, "anchorDate"));
    if (Number.isNaN(anchorDate.getTime())) throw new UserError("Pick the exam or deadline date.");
    if (anchorDate.getTime() < Date.now() + 86_400_000) throw new UserError("The deadline must be at least a day from now.");
    if (anchorDate.getTime() > Date.now() + 200 * 86_400_000) throw new UserError("Pick a date within the next 200 days.");
    const dailyMinutes = z.coerce.number().int().min(15).max(480).parse(str(form, "dailyMinutes") || "60");
    const plan = await createStudyPlan({ userId: user.id, courseId, anchorLabel, anchorDate, dailyMinutes });
    redirect(`/courses/${courseId}/guide/plan/${plan.id}`);
  });
}

export type AnswerState = Awaited<ReturnType<typeof submitAnswer>> | { error: string } | null;

export async function answerQuestion(sessionId: string, questionId: string, _: AnswerState, form: FormData): Promise<AnswerState> {
  const user = await requireUser();
  const response = str(form, "response");
  if (!response) return { error: "Answer the question first." };
  return submitAnswer({ userId: user.id, sessionId, questionId, response });
}

export async function finishSession(courseId: string, planId: string, sessionId: string) {
  const user = await requireUser();
  await completeSession(user.id, sessionId);
  redirect(`/courses/${courseId}/guide/plan/${planId}?adapted=1`);
}

export async function archivePlan(courseId: string, planId: string) {
  const user = await requireUser();
  await db.studyPlan.updateMany({ where: { id: planId, userId: user.id }, data: { status: "ARCHIVED" } });
  redirect(`/courses/${courseId}/guide`);
}
