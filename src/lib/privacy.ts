import { config } from "./config";

/**
 * Aggregate-only exposure. Individual PerformanceRecord rows never leave the
 * owner's view; aggregates are only surfaced when enough distinct users
 * contributed that no individual can be singled out.
 */
export function aggregateIsPublishable(distinctUsers: number) {
  return distinctUsers >= config.privacy.minCohortSize;
}

export function publishableMissRate(agg: { attempts: number; correct: number; distinctUsers: number } | null | undefined) {
  if (!agg || agg.attempts === 0 || !aggregateIsPublishable(agg.distinctUsers)) return null;
  return 1 - agg.correct / agg.attempts;
}
