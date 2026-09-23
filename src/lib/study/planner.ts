import type { StudySessionKind } from "@prisma/client";

/**
 * Static plan construction (study guide v1). Pure — no DB access — so it can
 * be unit-tested and reasoned about. Adaptation lives in ./adaptive.ts.
 */

export type PlanTopic = { id: string; name: string; position: number; prerequisiteIds: string[] };

export type SessionSpec = {
  title: string;
  kind: StudySessionKind;
  topicIds: string[];
  scheduledFor: Date;
  reason: string;
  targetDifficulty: number;
};

export const SESSION_MINUTES = 45;
const DAY = 86_400_000;

export function startOfDay(d: Date) {
  const x = new Date(d);
  x.setUTCHours(9, 0, 0, 0);
  return x;
}

export function daysBetween(a: Date, b: Date) {
  return Math.max(0, Math.floor((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY));
}

export function sessionsPerDay(dailyMinutes: number) {
  return Math.max(1, Math.floor(dailyMinutes / SESSION_MINUTES));
}

/**
 * Prerequisite-respecting order (Kahn's algorithm, ties broken by syllabus
 * position). Cycles — which inferred structures can contain — are broken by
 * falling back to position order for the remaining topics.
 */
export function orderTopics(topics: PlanTopic[]): PlanTopic[] {
  const byId = new Map(topics.map((t) => [t.id, t]));
  const indeg = new Map(topics.map((t) => [t.id, 0]));
  for (const t of topics) for (const p of t.prerequisiteIds) if (byId.has(p)) indeg.set(t.id, indeg.get(t.id)! + 1);
  const out: PlanTopic[] = [];
  const done = new Set<string>();
  const ready = () => topics.filter((t) => !done.has(t.id) && indeg.get(t.id) === 0).sort((a, b) => a.position - b.position);
  while (out.length < topics.length) {
    let next = ready()[0];
    if (!next) next = topics.filter((t) => !done.has(t.id)).sort((a, b) => a.position - b.position)[0];
    done.add(next.id);
    out.push(next);
    for (const t of topics) if (t.prerequisiteIds.includes(next.id)) indeg.set(t.id, indeg.get(t.id)! - 1);
  }
  return out;
}

/** Assigns dates to an ordered list of sessions, filling `perDay` slots per day from `start`. */
export function schedule<T extends { scheduledFor: Date }>(sessions: T[], start: Date, perDay: number): T[] {
  const base = startOfDay(start).getTime();
  return sessions.map((s, i) => ({ ...s, scheduledFor: new Date(base + Math.floor(i / perDay) * DAY + (i % perDay) * 3_600_000) }));
}

export function buildInitialPlan(input: {
  topics: PlanTopic[];
  start: Date;
  anchorDate: Date;
  dailyMinutes: number;
}): { sessions: SessionSpec[]; paceMode: string; paceReason: string } {
  const ordered = orderTopics(input.topics);
  const perDay = sessionsPerDay(input.dailyMinutes);
  // Reserve the final day before the anchor for review.
  const studyDays = Math.max(1, daysBetween(input.start, input.anchorDate) - 1);
  const capacity = studyDays * perDay;
  const names = new Map(ordered.map((t) => [t.id, t.name]));

  let learn: SessionSpec[];
  let paceMode = "normal";
  let paceReason = `One session per topic in prerequisite order, ${perDay} per day.`;

  if (ordered.length <= capacity) {
    learn = ordered.map((t) => ({
      title: t.name,
      kind: "LEARN",
      topicIds: [t.id],
      scheduledFor: input.start,
      reason: t.prerequisiteIds.length
        ? `Comes after ${t.prerequisiteIds.map((p) => names.get(p)).filter(Boolean).join(", ")}, which it builds on.`
        : "A foundation topic — later topics build on it.",
      targetDifficulty: 2,
    }));
  } else {
    // Not enough time: group consecutive topics per session (compression).
    const perSession = Math.ceil(ordered.length / capacity);
    learn = [];
    for (let i = 0; i < ordered.length; i += perSession) {
      const group = ordered.slice(i, i + perSession);
      learn.push({
        title: group.map((t) => t.name).join(" + "),
        kind: "LEARN",
        topicIds: group.map((t) => t.id),
        scheduledFor: input.start,
        reason: `Grouped ${group.length} topics because there are ${ordered.length} topics and only ${capacity} session slots before the deadline.`,
        targetDifficulty: 2,
      });
    }
    paceMode = "compressed";
    paceReason = `Only ${studyDays} study day(s) left, so topics are grouped and depth is reduced.`;
  }

  // Spare capacity → spaced resurfacing of earlier topics, inserted every few sessions.
  const spare = capacity - learn.length;
  const merged: SessionSpec[] = [];
  const every = spare > 0 && learn.length > 1 ? Math.max(2, Math.ceil(learn.length / Math.min(spare, Math.ceil(learn.length / 2)))) : Infinity;
  let added = 0;
  for (let i = 0; i < learn.length; i++) {
    if (i > 0 && i % every === 0 && added < spare) {
      const prior = learn.slice(i - every, i).flatMap((s) => s.topicIds);
      merged.push({
        title: `Review: ${prior.map((id) => names.get(id)).join(", ")}`,
        kind: "RESURFACE",
        topicIds: prior,
        scheduledFor: input.start,
        reason: "Spaced review: revisiting earlier topics helps them stick, even the ones that went well.",
        targetDifficulty: 2,
      });
      added++;
    }
    merged.push(learn[i]);
  }

  const scheduled = schedule(merged, input.start, perDay);
  const review: SessionSpec = {
    title: "Final review",
    kind: "REVIEW",
    topicIds: ordered.map((t) => t.id),
    scheduledFor: new Date(startOfDay(input.anchorDate).getTime() - DAY),
    reason: "Mixed practice across all topics the day before your deadline, weighted toward weak spots.",
    targetDifficulty: 3,
  };
  if (review.scheduledFor < startOfDay(input.start)) review.scheduledFor = startOfDay(input.start);
  return { sessions: [...scheduled, review], paceMode, paceReason };
}
