import type { StudySessionKind, TopicProgressStatus } from "@prisma/client";
import { config } from "../config";
import { daysBetween, schedule, sessionsPerDay, startOfDay } from "./planner";

/**
 * Study guide v2 — the adaptive mechanisms, each implemented separately:
 *
 *  1. Reordering        weak topics get extra sessions before the plan moves on
 *  2. Re-teaching       wrong answers trigger a *different* explanation (see
 *                       jobs/study.ts `reteachFor`); stalled topics get RETEACH
 *                       sessions instead of more of the same
 *  3. Spaced resurfacing correct topics come back on an expanding interval;
 *                       weak topics come back sooner
 *  4. Pace compression  behind → triage (drop depth, merge); ahead → go deeper
 *
 * Plus the tutor handoff: a topic that doesn't improve after
 * `tutorHandoffCycles` adjustment cycles surfaces human tutors.
 *
 * Everything here is pure. Every decision produces a human-readable reason
 * for the progress view.
 */

const DAY = 86_400_000;

export type TopicState = {
  topicId: string;
  name: string;
  mastery: number;
  attempts: number;
  status: TopicProgressStatus;
  stalledCycles: number;
  intervalDays: number;
  nextReviewAt: Date | null;
  masteryAtLastCycle: number | null;
  lastReason: string | null;
};

export type QueueItem = {
  /** Existing session id; absent for sessions created by this cycle. */
  id?: string;
  title: string;
  kind: StudySessionKind;
  topicIds: string[];
  reason: string;
  targetDifficulty: number;
  scheduledFor: Date;
};

// ───────────────────────── per-answer updates ─────────────────────────

export function classify(mastery: number, attempts: number): TopicProgressStatus {
  if (attempts === 0) return "UPCOMING";
  if (attempts >= 2 && mastery >= config.study.masteryThreshold) return "MASTERED";
  if (attempts >= 2 && mastery < config.study.strugglingThreshold) return "STRUGGLING";
  return "IN_PROGRESS";
}

/** EWMA mastery + spaced-resurfacing schedule (mechanism 3) on each answer. */
export function applyAnswer(s: TopicState, correct: boolean, now: Date): TopicState {
  const a = config.study.ewmaAlpha;
  const mastery = s.attempts === 0 ? (correct ? 0.7 : 0.2) : s.mastery * (1 - a) + (correct ? 1 : 0) * a;
  const attempts = s.attempts + 1;
  const status = classify(mastery, attempts);
  // Expanding interval when right (1→2→4→8…, capped), reset to 1 day when wrong.
  const intervalDays = correct ? Math.min(21, Math.max(1, s.intervalDays) * 2) : 1;
  return {
    ...s,
    mastery,
    attempts,
    status,
    intervalDays,
    nextReviewAt: new Date(now.getTime() + intervalDays * DAY),
  };
}

// ───────────────────────────── adapt cycle ────────────────────────────

export type AdaptInput = {
  now: Date;
  anchorDate: Date;
  dailyMinutes: number;
  topics: TopicState[];
  /** Upcoming (not completed/skipped) sessions in plan order. */
  queue: QueueItem[];
};

export type AdaptOutput = {
  topics: TopicState[];
  queue: QueueItem[];
  skippedIds: string[];
  paceMode: "normal" | "compressed" | "deepening";
  paceReason: string;
  decisions: string[];
  tutorSuggestedTopicIds: string[];
};

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function adapt(input: AdaptInput): AdaptOutput {
  const { now } = input;
  const decisions: string[] = [];
  const skippedIds: string[] = [];
  const tutorSuggestedTopicIds: string[] = [];
  let queue = input.queue.map((q) => ({ ...q, topicIds: [...q.topicIds] }));
  const finalReview = queue.find((q) => q.kind === "REVIEW");
  queue = queue.filter((q) => q !== finalReview);
  const covers = (kinds: StudySessionKind[], topicId: string) => queue.some((q) => kinds.includes(q.kind) && q.topicIds.includes(topicId));

  const topics = input.topics.map((t) => ({ ...t }));
  const front: QueueItem[] = [];

  for (const t of topics) {
    if (t.attempts === 0) continue;

    if (t.status === "STRUGGLING") {
      // Stall detection → tutor handoff.
      const improved = t.masteryAtLastCycle != null && t.mastery > t.masteryAtLastCycle + 0.05;
      if (t.masteryAtLastCycle != null && !improved) t.stalledCycles += 1;
      if (improved) t.stalledCycles = Math.max(0, t.stalledCycles - 1);
      t.masteryAtLastCycle = t.mastery;

      // Mechanisms 1 + 2: reorder a weak topic ahead of the rest, and switch to
      // a different explanation once plain reinforcement isn't helping.
      if (!covers(["REINFORCE", "RETEACH"], t.topicId)) {
        const reteach = t.stalledCycles >= 1;
        const reason = reteach
          ? `Still at ${pct(t.mastery)} on ${t.name} after extra practice, so this session explains it a different way instead of repeating the same kind of questions.`
          : `You're at ${pct(t.mastery)} on ${t.name}. The plan adds practice here before moving on, since later topics build on it.`;
        front.push({
          title: `${reteach ? "New angle" : "Strengthen"}: ${t.name}`,
          kind: reteach ? "RETEACH" : "REINFORCE",
          topicIds: [t.topicId],
          reason,
          targetDifficulty: reteach ? 1 : 2,
          scheduledFor: now,
        });
        decisions.push(reason);
        t.lastReason = reason;
      }
      if (t.stalledCycles >= config.study.tutorHandoffCycles) {
        tutorSuggestedTopicIds.push(t.topicId);
        t.lastReason = `${t.name} hasn't improved after ${t.stalledCycles} plan adjustments. A classmate tutor may help.`;
      }
      continue;
    }

    // Recovered or fine: reset the stall counter.
    if (t.status === "MASTERED" || t.status === "IN_PROGRESS") {
      if (t.stalledCycles > 0 && t.status === "MASTERED") t.stalledCycles = 0;
      t.masteryAtLastCycle = t.mastery;
    }

    // Mechanism 3: resurface on schedule (mastered topics less often — the
    // interval has been doubling on each correct answer).
    if (
      t.status === "MASTERED" &&
      t.nextReviewAt &&
      t.nextReviewAt < input.anchorDate &&
      !covers(["RESURFACE", "REINFORCE", "RETEACH"], t.topicId)
    ) {
      const reason = `You got ${t.name} right (${pct(t.mastery)}), so it comes back in ${t.intervalDays} day(s) to keep it fresh, less often than weaker topics.`;
      queue.push({
        title: `Quick review: ${t.name}`,
        kind: "RESURFACE",
        topicIds: [t.topicId],
        reason,
        targetDifficulty: 2,
        scheduledFor: t.nextReviewAt,
      });
      decisions.push(reason);
      t.lastReason = reason;
    }
  }

  queue = [...front, ...queue];
  // Keep spaced reviews roughly at their due position.
  queue = stableSortByDue(queue);

  // Mechanism 4: pace.
  const perDay = sessionsPerDay(input.dailyMinutes);
  const daysLeft = Math.max(1, daysBetween(now, input.anchorDate));
  const capacity = daysLeft * perDay - (finalReview ? 1 : 0);
  const overdue = input.queue.filter((q) => q.id && q.scheduledFor < startOfDay(now) && q.kind !== "REVIEW").length;
  let paceMode: AdaptOutput["paceMode"] = "normal";
  let paceReason = overdue
    ? `${overdue} session(s) slipped past their date and have been rescheduled; there's still time for everything.`
    : "On track.";
  const masteredIds = new Set(topics.filter((t) => t.status === "MASTERED").map((t) => t.topicId));
  const struggling = topics.filter((t) => t.status === "STRUGGLING");

  if (queue.length > capacity) {
    paceMode = "compressed";
    const before = queue.length;
    // Triage 1: drop depth and reviews of topics already mastered.
    for (const kind of ["DEEPEN", "RESURFACE"] as const) {
      for (let i = queue.length - 1; i >= 0 && queue.length > capacity; i--) {
        const q = queue[i];
        if (q.kind === kind && q.topicIds.every((id) => masteredIds.has(id))) {
          if (q.id) skippedIds.push(q.id);
          queue.splice(i, 1);
        }
      }
    }
    // Triage 2: merge adjacent LEARN sessions.
    for (let i = queue.length - 2; i >= 0 && queue.length > capacity; i--) {
      const a = queue[i];
      const b = queue[i + 1];
      if (a.kind === "LEARN" && b.kind === "LEARN") {
        a.topicIds = [...a.topicIds, ...b.topicIds];
        a.title = `${a.title} + ${b.title}`;
        a.reason = "Merged with the next topic to fit the time left before your deadline.";
        if (b.id) skippedIds.push(b.id);
        queue.splice(i + 1, 1);
      }
    }
    paceReason = `You're behind: ${before} sessions but only ${capacity} slots left before ${input.anchorDate.toDateString()}. Reviews of topics you've mastered were dropped and some topics merged, keeping the focus on ${
      struggling.length ? struggling.map((t) => t.name).join(", ") : "what's left"
    }.`;
    if (queue.length > capacity) paceReason += " Even so, the plan runs over — consider more minutes per day.";
    decisions.push(paceReason);
  } else if (capacity - queue.length >= 3 && struggling.length === 0 && masteredIds.size > 0) {
    paceMode = "deepening";
    const room = capacity - queue.length - 1;
    const candidates = topics.filter((t) => t.status === "MASTERED" && !covers(["DEEPEN"], t.topicId)).slice(0, room);
    for (const t of candidates) {
      queue.push({
        title: `Go deeper: ${t.name}`,
        kind: "DEEPEN",
        topicIds: [t.topicId],
        reason: `You're ahead of schedule and solid on ${t.name}, so this session uses harder questions instead of just moving faster.`,
        targetDifficulty: 4,
        scheduledFor: now,
      });
    }
    if (candidates.length) {
      paceReason = `You're ahead of schedule, so ${candidates.length} deeper session(s) with harder questions were added.`;
      decisions.push(paceReason);
    } else paceMode = "normal";
  }

  let scheduled = schedule(queue, now, perDay);
  if (finalReview) {
    const reviewDay = new Date(Math.max(startOfDay(now).getTime(), startOfDay(input.anchorDate).getTime() - DAY));
    scheduled = [...scheduled, { ...finalReview, scheduledFor: reviewDay }];
  }
  return { topics, queue: scheduled, skippedIds, paceMode, paceReason, decisions, tutorSuggestedTopicIds };
}

/** Moves RESURFACE items to roughly where their due date falls, keeping everything else in order. */
function stableSortByDue(queue: QueueItem[]) {
  const fixed = queue.filter((q) => q.kind !== "RESURFACE" || q.id);
  const floating = queue.filter((q) => q.kind === "RESURFACE" && !q.id).sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime());
  for (const f of floating) {
    const idx = fixed.findIndex((q) => q.id && q.scheduledFor > f.scheduledFor);
    if (idx === -1) fixed.push(f);
    else fixed.splice(idx, 0, f);
  }
  return fixed;
}
