import type { KnowledgeStability, Prisma } from "@prisma/client";
import { db } from "./db";
import { assessMaterialGate } from "./integrity";
import { overlapScore } from "./text";

export const entryInclude = {
  assessmentMaterial: { include: { offering: { include: { term: true } } } },
  offering: { include: { term: true } },
  topic: true,
  contributor: { select: { id: true, displayName: true } },
} satisfies Prisma.KnowledgeEntryInclude;

export type EntryWithGate = Prisma.KnowledgeEntryGetPayload<{ include: typeof entryInclude }>;

/** A knowledge entry that reproduces a graded answer inherits that material's gate. */
export function entryGate(e: EntryWithGate, now = new Date()) {
  if (!e.assessmentMaterial) return { gated: false, certainty: "certain" as const, reason: "" };
  const m = e.assessmentMaterial;
  return assessMaterialGate({ kind: m.kind, assessmentStatus: m.assessmentStatus, termEndsOn: m.offering?.term.endsOn }, now);
}

/** The course offering whose term covers `now`, if any. */
export async function currentOffering(courseId: string, now = new Date()) {
  return db.courseOffering.findFirst({
    where: { courseId, term: { startsOn: { lte: now }, endsOn: { gte: now } } },
    include: { term: true, professors: true },
  });
}

/** Stale-specifics guard: term-specific content only applies to its own offering. */
export function appliesToOffering(e: { stability: KnowledgeStability; offeringId: string | null }, offeringId: string | null) {
  return e.stability === "TERM_STABLE" || (!!offeringId && e.offeringId === offeringId);
}

/**
 * Entries the AI may ground on: active, not superseded, not integrity-gated,
 * and not stale term-specifics. Community-verified content ranks first.
 */
export async function groundingEntries(
  courseId: string,
  query: string,
  opts: {
    topicId?: string | null;
    offeringId?: string | null;
    limit?: number;
    /** Only entries tagged with `topicId` (or untagged) — for topic-scoped views like study sessions. */
    topicOnly?: boolean;
  } = {},
) {
  const entries = await db.knowledgeEntry.findMany({
    where: { courseId, status: "ACTIVE", supersededBy: null },
    include: entryInclude,
    take: 300,
    orderBy: { updatedAt: "desc" },
  });
  return entries
    .filter((e) => !entryGate(e).gated && appliesToOffering(e, opts.offeringId ?? null))
    .filter((e) => !opts.topicOnly || !e.topicId || e.topicId === opts.topicId)
    .map((e) => {
      let s = overlapScore(query, `${e.title} ${e.body}`);
      if (opts.topicId && e.topicId === opts.topicId) s += 0.5;
      if (e.verification === "COMMUNITY_VERIFIED") s += 0.2;
      return { e, s };
    })
    .filter((x) => x.s > 0.15)
    .sort((a, b) => b.s - a.s)
    .slice(0, opts.limit ?? 5)
    .map((x) => x.e);
}

export function validateEntryVersioning(input: { stability: KnowledgeStability; offeringId?: string | null }) {
  if (input.stability === "TERM_SPECIFIC" && !input.offeringId) {
    throw new Error("Term-specific entries must be tagged with the term/offering they apply to.");
  }
}
