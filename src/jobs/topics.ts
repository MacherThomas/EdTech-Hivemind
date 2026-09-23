import { db } from "@/lib/db";
import { getAI } from "@/lib/ai";
import { canGroundAI } from "@/lib/integrity";
import { excerpt } from "@/lib/text";

/**
 * Builds the course topic structure. With a syllabus, topics are SYLLABUS
 * (high confidence); otherwise they're INFERRED from the course name and
 * gate-passing materials and clearly shown as lower confidence.
 */
export async function buildTopicStructure({ courseId }: { courseId: string }) {
  const course = await db.course.findUniqueOrThrow({ where: { id: courseId }, include: { topics: true } });
  const mats = await db.material.findMany({
    where: { courseId, moderation: "VISIBLE", extractedText: { not: null } },
    include: { offering: { include: { term: true } } },
    take: 20,
  });
  const snippets = mats
    .filter((m) => canGroundAI({ kind: m.kind, assessmentStatus: m.assessmentStatus, termEndsOn: m.offering?.term.endsOn }))
    .slice(0, 5)
    .map((m) => `${m.title}: ${excerpt(m.extractedText ?? "", 1500)}`);

  const fromSyllabus = !!course.syllabusText;
  const drafts = await getAI().extractTopics({
    courseName: `${course.code} ${course.name}`,
    courseDescription: course.description,
    syllabusText: course.syllabusText,
    materialSnippets: snippets,
  });

  const source = fromSyllabus ? "SYLLABUS" : "INFERRED";
  const confidence = fromSyllabus ? 0.9 : 0.5;
  const byName = new Map(course.topics.map((t) => [t.name.toLowerCase(), t]));
  const ids = new Map<string, string>();
  for (const [position, d] of drafts.entries()) {
    const existing = byName.get(d.name.toLowerCase());
    const t = existing
      ? await db.topic.update({
          where: { id: existing.id },
          // Never downgrade community-added topics; do upgrade inferred → syllabus.
          data: {
            position,
            summary: existing.summary ?? d.summary,
            ...(existing.source === "INFERRED" ? { source, confidence } : {}),
          },
        })
      : await db.topic.create({ data: { courseId, name: d.name, summary: d.summary, position, source, confidence } });
    ids.set(d.name.toLowerCase(), t.id);
  }
  for (const d of drafts) {
    const id = ids.get(d.name.toLowerCase())!;
    const prereqs = d.prerequisites.map((p) => ids.get(p.toLowerCase())).filter((x): x is string => !!x && x !== id);
    await db.topic.update({ where: { id }, data: { prerequisites: { set: prereqs.map((p) => ({ id: p })) } } });
  }
  if (fromSyllabus) await db.course.update({ where: { id: courseId }, data: { syllabusIngestedAt: new Date() } });
  return { count: drafts.length, source };
}
