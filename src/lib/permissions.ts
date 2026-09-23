import { db } from "./db";
import type { User } from "@prisma/client";

/**
 * Viewing: any verified user of the course's school.
 * Contributing (posting, voting, uploading, earning reputation): requires a
 * self-reported (or verified) enrollment in that specific course.
 */
export async function canViewCourse(user: Pick<User, "schoolId">, courseId: string) {
  const course = await db.course.findUnique({ where: { id: courseId }, select: { schoolId: true } });
  return !!course && course.schoolId === user.schoolId;
}

export async function isEnrolled(userId: string, courseId: string) {
  const e = await db.enrollment.findUnique({ where: { userId_courseId: { userId, courseId } }, select: { id: true } });
  return !!e;
}

export class PermissionError extends Error {}

export async function assertCanContribute(user: Pick<User, "id" | "schoolId">, courseId: string) {
  if (!(await canViewCourse(user, courseId))) throw new PermissionError("Course not found.");
  if (!(await isEnrolled(user.id, courseId))) {
    throw new PermissionError("Add this course to your courses to contribute.");
  }
}

/**
 * Validates client-supplied foreign keys against the course they claim to
 * belong to. Form fields and bound action arguments are user-controlled.
 */
export async function assertBelongsToCourse(
  courseId: string,
  refs: { topicIds?: (string | null | undefined)[]; materialId?: string | null; offeringId?: string | null },
) {
  const topicIds = (refs.topicIds ?? []).filter((x): x is string => !!x);
  if (topicIds.length) {
    const n = await db.topic.count({ where: { id: { in: topicIds }, courseId } });
    if (n !== new Set(topicIds).size) throw new PermissionError("Unknown topic for this course.");
  }
  if (refs.materialId && !(await db.material.count({ where: { id: refs.materialId, courseId } }))) {
    throw new PermissionError("Unknown material for this course.");
  }
  if (refs.offeringId && !(await db.courseOffering.count({ where: { id: refs.offeringId, courseId } }))) {
    throw new PermissionError("Unknown term for this course.");
  }
}

export async function assertTermInSchool(termId: string, schoolId: string) {
  if (!(await db.term.count({ where: { id: termId, schoolId } }))) throw new PermissionError("Unknown term.");
}
