"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { assertBelongsToCourse, assertTermInSchool, canViewCourse } from "@/lib/permissions";
import { handle, optStr, str, UserError } from "./util";
import type { FormState } from "@/components/ActionForm";

const CourseInput = z.object({
  code: z.string().trim().min(2, "Course code is required.").max(20).transform((s) => s.toUpperCase()),
  name: z.string().trim().min(3, "Course name is required.").max(120),
  description: z.string().trim().max(1000).nullable(),
});

/** Any verified student can add a course that's missing — the catalogue is community-built too. */
export async function createCourse(_: FormState, form: FormData) {
  return handle(async () => {
    const user = await requireUser();
    const input = CourseInput.parse({ code: str(form, "code"), name: str(form, "name"), description: optStr(form, "description") });
    const exists = await db.course.findUnique({ where: { schoolId_code: { schoolId: user.schoolId, code: input.code } } });
    if (exists) throw new UserError(`${input.code} already exists. Search for it and add it to your courses.`);

    const termId = optStr(form, "termId");
    if (termId) await assertTermInSchool(termId, user.schoolId);
    const professors = str(form, "professors").split(",").map((p) => p.trim()).filter(Boolean).slice(0, 5);
    const course = await db.course.create({ data: { ...input, schoolId: user.schoolId } });
    let offeringId: string | null = null;
    if (termId) {
      const offering = await db.courseOffering.create({
        data: {
          courseId: course.id,
          termId,
          professors: {
            connectOrCreate: professors.map((name) => ({
              where: { schoolId_name: { schoolId: user.schoolId, name } },
              create: { schoolId: user.schoolId, name },
            })),
          },
        },
      });
      offeringId = offering.id;
    }
    await db.enrollment.create({ data: { userId: user.id, courseId: course.id, offeringId } });
    redirect(`/courses/${course.id}/guide`);
  });
}

export async function enroll(courseId: string, form: FormData) {
  const user = await requireUser();
  if (!(await canViewCourse(user, courseId))) return;
  const offeringId = optStr(form, "offeringId");
  if (offeringId) await assertBelongsToCourse(courseId, { offeringId });
  await db.enrollment.upsert({
    where: { userId_courseId: { userId: user.id, courseId } },
    create: { userId: user.id, courseId, offeringId },
    update: { offeringId },
  });
  revalidatePath(`/courses/${courseId}`, "layout");
}

export async function unenroll(courseId: string) {
  const user = await requireUser();
  await db.enrollment.deleteMany({ where: { userId: user.id, courseId } });
  revalidatePath(`/courses/${courseId}`, "layout");
}

export async function addOffering(courseId: string, _: FormState, form: FormData) {
  return handle(async () => {
    const user = await requireUser();
    if (!(await canViewCourse(user, courseId))) throw new UserError("Course not found.");
    const termId = str(form, "termId");
    if (!termId) throw new UserError("Pick a term.");
    await assertTermInSchool(termId, user.schoolId);
    const professors = str(form, "professors").split(",").map((p) => p.trim()).filter(Boolean).slice(0, 5);
    const existing = await db.courseOffering.findUnique({ where: { courseId_termId: { courseId, termId } } });
    if (existing) throw new UserError("That term is already listed for this course.");
    await db.courseOffering.create({
      data: {
        courseId,
        termId,
        professors: {
          connectOrCreate: professors.map((name) => ({
            where: { schoolId_name: { schoolId: user.schoolId, name } },
            create: { schoolId: user.schoolId, name },
          })),
        },
      },
    });
    revalidatePath(`/courses/${courseId}`, "layout");
    return { ok: "Term added." };
  });
}
