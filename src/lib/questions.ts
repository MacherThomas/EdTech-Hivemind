import { db } from "./db";
import { assessMaterialGate } from "./integrity";

/** Retired, ungated assessments of a course — the only ones questions may be sourced from. */
export async function retiredAssessments(courseId: string) {
  const mats = await db.material.findMany({
    where: { courseId, kind: { in: ["PAST_EXAM", "PROBLEM_SET", "SOLUTIONS"] }, assessmentStatus: "RETIRED", moderation: { not: "HIDDEN" } },
    include: { offering: { include: { term: true } } },
    orderBy: { createdAt: "desc" },
  });
  return mats
    .filter((m) => !assessMaterialGate({ kind: m.kind, assessmentStatus: m.assessmentStatus, termEndsOn: m.offering?.term.endsOn }).gated)
    .map((m) => ({ id: m.id, title: m.title }));
}
