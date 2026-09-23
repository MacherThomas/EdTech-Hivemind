import { cache } from "react";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";

/** Loads the course for the current user, enforcing school-scoped viewing. */
export const loadCourse = cache(async (courseId: string) => {
  const user = await requireUser();
  const course = await db.course.findUnique({
    where: { id: courseId },
    include: {
      offerings: { include: { term: true, professors: true }, orderBy: { term: { startsOn: "desc" } } },
      topics: { orderBy: { position: "asc" } },
    },
  });
  if (!course || course.schoolId !== user.schoolId) notFound();
  const enrollment = await db.enrollment.findUnique({ where: { userId_courseId: { userId: user.id, courseId } } });
  return { user, course, enrollment, enrolled: !!enrollment };
});
