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
