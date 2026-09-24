"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { assertBelongsToCourse, assertCanContribute, canViewCourse } from "@/lib/permissions";
import { assessMaterialGate } from "@/lib/integrity";
import { completeSession, createStudyPlan, shuffle, submitAnswer } from "@/lib/study/service";
import { runJob } from "@/jobs";
import { aiEnabled } from "@/lib/features";
import { programmeSection } from "@/lib/syllabus";
import { handle, optStr, str, UserError } from "./util";
import type { FormState } from "@/components/ActionForm";

export async function saveSyllabus(courseId: string, _: FormState, form: FormData) {
  return handle(async () => {
    const user = await requireUser();
    await assertCanContribute(user, courseId);
    const text = z.string().trim().min(40, "Paste the syllabus text (at least a few lines).").max(100_000).parse(str(form, "syllabus"));
    await db.course.update({ where: { id: courseId }, data: { syllabusText: programmeSection(text) } });
    const res = (await runJob("guide.buildTopics", { courseId })) as { count: number };
    revalidatePath(`/courses/${courseId}/guide`);
    if (res.count === 0) {
      return { error: 'Syllabus saved, but no topic lines were recognised. Use lines like "Week 1: Supply and demand" or a numbered list, or add topics by hand.' };
    }
    return { ok: `Topic structure rebuilt from the syllabus (${res.count} topics).` };
  });
}

/** AI-only: infer a topic structure without a syllabus. */
export async function inferTopics(courseId: string) {
  if (!aiEnabled()) return;
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
  const sg = str(form, "selfGrade");
  const selfGrade = sg === "correct" || sg === "incorrect" ? sg : undefined;
  return submitAnswer({ userId: user.id, sessionId, questionId, response, selfGrade });
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

const QuestionInput = z.object({
  topicId: z.string().min(1, "Pick a topic."),
  type: z.enum(["MULTIPLE_CHOICE", "SHORT_ANSWER", "NUMERIC"]),
  prompt: z.string().trim().min(10, "Write the question (10+ characters).").max(4000),
  explanation: z.string().trim().max(4000),
  difficulty: z.coerce.number().int().min(1).max(5),
});

/**
 * Students write the practice questions. A question taken from a real past
 * assessment must link that material, and is only accepted if the material
 * passes the integrity gate (retired, from a finished term).
 */
export async function contributeQuestion(courseId: string, _: FormState, form: FormData) {
  return handle(async () => {
    const user = await requireUser();
    await assertCanContribute(user, courseId);
    const input = QuestionInput.parse({
      topicId: str(form, "topicId"),
      type: str(form, "type"),
      prompt: str(form, "prompt"),
      explanation: str(form, "explanation"),
      difficulty: str(form, "difficulty") || "2",
    });
    await assertBelongsToCourse(courseId, { topicIds: [input.topicId] });

    let answer: string;
    let choices: string[] | null = null;
    if (input.type === "MULTIPLE_CHOICE") {
      const opts = [0, 1, 2, 3].map((i) => str(form, `choice-${i}`));
      const filled = opts.filter(Boolean);
      if (filled.length < 2) throw new UserError("Give at least two options.");
      if (new Set(filled).size !== filled.length) throw new UserError("Options must be different from each other.");
      const correctIdx = Number(str(form, "correct"));
      if (!Number.isInteger(correctIdx) || !opts[correctIdx]) throw new UserError("Mark which option is correct.");
      answer = opts[correctIdx];
      choices = shuffle(filled);
    } else {
      answer = z.string().trim().min(1, "Give the correct answer.").max(2000).parse(str(form, "answer"));
      if (input.type === "NUMERIC" && Number.isNaN(Number(answer))) throw new UserError("A numeric answer must be a number.");
    }

    const sourceMaterialId = optStr(form, "sourceMaterialId");
    if (sourceMaterialId) {
      const m = await db.material.findUnique({ where: { id: sourceMaterialId }, include: { offering: { include: { term: true } } } });
      if (!m || m.courseId !== courseId) throw new UserError("Unknown material.");
      const gate = assessMaterialGate({ kind: m.kind, assessmentStatus: m.assessmentStatus, termEndsOn: m.offering?.term.endsOn });
      if (gate.gated) throw new UserError(`Questions from "${m.title}" can't be added yet: ${gate.reason}`);
    }

    await db.practiceQuestion.create({
      data: {
        courseId,
        topicId: input.topicId,
        type: input.type,
        difficulty: input.difficulty,
        prompt: input.prompt,
        choices: choices ?? undefined,
        answer,
        explanation: input.explanation,
        origin: sourceMaterialId ? "SOURCED_FROM_MATERIAL" : "COMMUNITY",
        sourceMaterialId,
        authorId: user.id,
      },
    });
    revalidatePath(`/courses/${courseId}`, "layout");
    return { ok: "Question added to the course question bank." };
  });
}
