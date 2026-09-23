import { describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import { publishableMissRate } from "@/lib/privacy";
import { computeReputationScore, flagWeight, isTutorEligible } from "@/lib/reputation";

const zero = { upvotesReceived: 0, downvotesReceived: 0, resolvedAnswers: 0, entriesContributed: 0, sessionsCompleted: 0, ratingSum: 0, ratingCount: 0, flagsUpheld: 0 };

describe("privacy", () => {
  it("suppresses aggregates below the minimum cohort", () => {
    expect(publishableMissRate({ attempts: 40, correct: 10, distinctUsers: config.privacy.minCohortSize - 1 })).toBeNull();
    expect(publishableMissRate({ attempts: 40, correct: 10, distinctUsers: config.privacy.minCohortSize })).toBeCloseTo(0.75);
  });
});

describe("reputation", () => {
  it("weights resolved answers and entries above raw upvotes", () => {
    expect(computeReputationScore({ ...zero, resolvedAnswers: 1 })).toBeGreaterThan(computeReputationScore({ ...zero, upvotesReceived: 2 }));
  });
  it("never goes negative", () => {
    expect(computeReputationScore({ ...zero, flagsUpheld: 5 })).toBe(0);
  });
  it("factors in session ratings relative to 3 stars", () => {
    const good = computeReputationScore({ ...zero, sessionsCompleted: 2, ratingSum: 10, ratingCount: 2 });
    const bad = computeReputationScore({ ...zero, sessionsCompleted: 2, ratingSum: 2, ratingCount: 2 });
    expect(good).toBeGreaterThan(bad);
  });
  it("requires both score and validated contributions for tutor status", () => {
    expect(isTutorEligible({ ...zero, upvotesReceived: 50, score: 100 })).toBe(false);
    expect(isTutorEligible({ ...zero, resolvedAnswers: 2, score: 20 })).toBe(true);
  });
  it("gives established members slightly heavier flags", () => {
    expect(flagWeight(0)).toBe(1);
    expect(flagWeight(100)).toBeGreaterThan(1);
    expect(flagWeight(100)).toBeLessThan(2.1);
  });
});
