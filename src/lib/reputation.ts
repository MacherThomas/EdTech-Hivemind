import { config } from "./config";

export type ReputationSignals = {
  upvotesReceived: number;
  downvotesReceived: number;
  resolvedAnswers: number;
  entriesContributed: number;
  sessionsCompleted: number;
  ratingSum: number;
  ratingCount: number;
  flagsUpheld: number;
};

export function computeReputationScore(s: ReputationSignals) {
  const w = config.reputation.weights;
  const ratingAdj = s.ratingCount > 0 ? (s.ratingSum - 3 * s.ratingCount) * w.ratingDelta : 0;
  const raw =
    s.upvotesReceived * w.upvoteReceived +
    s.downvotesReceived * w.downvoteReceived +
    s.resolvedAnswers * w.resolvedAnswer +
    s.entriesContributed * w.entryContributed +
    s.sessionsCompleted * w.sessionCompleted +
    ratingAdj +
    s.flagsUpheld * w.flagUpheld;
  return Math.max(0, Math.round(raw));
}

/** Tutor visibility is emergent: computed from signals, never applied for. */
export function isTutorEligible(s: ReputationSignals & { score: number }) {
  const validated = s.resolvedAnswers + s.entriesContributed;
  return s.score >= config.tutors.minCourseReputation && validated >= config.tutors.minValidatedContributions;
}

/** Flag weight grows slowly with the flagger's standing in the course. */
export function flagWeight(courseReputation: number) {
  return 1 + Math.log10(1 + Math.max(0, courseReputation) / 10);
}

export function averageRating(s: Pick<ReputationSignals, "ratingSum" | "ratingCount">) {
  return s.ratingCount ? s.ratingSum / s.ratingCount : null;
}
