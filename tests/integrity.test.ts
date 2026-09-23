import { describe, expect, it } from "vitest";
import { assessMaterialGate, canDownload, canGroundAI, liveAssignmentHint } from "@/lib/integrity";

const now = new Date("2026-10-01");

describe("assessMaterialGate", () => {
  it("gates possibly-live assessments with certainty", () => {
    expect(assessMaterialGate({ kind: "PROBLEM_SET", assessmentStatus: "POSSIBLY_LIVE" }, now)).toMatchObject({ gated: true, certainty: "certain" });
  });
  it("treats unknown as live but flags uncertainty", () => {
    expect(assessMaterialGate({ kind: "PAST_EXAM", assessmentStatus: "UNKNOWN" }, now)).toMatchObject({ gated: true, certainty: "uncertain" });
  });
  it("allows retired assessments from ended terms", () => {
    expect(assessMaterialGate({ kind: "PAST_EXAM", assessmentStatus: "RETIRED", termEndsOn: new Date("2025-12-20") }, now).gated).toBe(false);
  });
  it("is suspicious of 'retired' material from the current term", () => {
    expect(assessMaterialGate({ kind: "PAST_EXAM", assessmentStatus: "RETIRED", termEndsOn: new Date("2026-12-20") }, now)).toMatchObject({ gated: true, certainty: "uncertain" });
  });
  it("gates assessment kinds mis-tagged as not-an-assessment", () => {
    expect(assessMaterialGate({ kind: "SOLUTIONS", assessmentStatus: "NOT_ASSESSMENT" }, now).gated).toBe(true);
  });
  it("never gates notes", () => {
    expect(canGroundAI({ kind: "NOTES", assessmentStatus: "NOT_ASSESSMENT" }, now)).toBe(true);
  });
  it("withholds download only for gated solutions", () => {
    expect(canDownload({ kind: "SOLUTIONS", assessmentStatus: "POSSIBLY_LIVE" }, now)).toBe(false);
    expect(canDownload({ kind: "PROBLEM_SET", assessmentStatus: "POSSIBLY_LIVE" }, now)).toBe(true);
    expect(canDownload({ kind: "SOLUTIONS", assessmentStatus: "RETIRED", termEndsOn: new Date("2025-01-01") }, now)).toBe(true);
  });
});

describe("liveAssignmentHint", () => {
  it("flags questions that look like live homework", () => {
    expect(liveAssignmentHint("How do I solve problem set 3 question 2? It's due Friday")).not.toBeNull();
  });
  it("doesn't flag conceptual questions", () => {
    expect(liveAssignmentHint("Why is long-run demand more elastic?")).toBeNull();
  });
});
