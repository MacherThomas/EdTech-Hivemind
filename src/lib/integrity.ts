import type { AssessmentStatus, MaterialKind } from "@prisma/client";

/**
 * Academic-integrity gate. Single source of truth for "may the AI (or any
 * search feature) surface worked solutions derived from this?".
 *
 * Detection of "live" is best-effort. When unsure we gate AND say why, rather
 * than guessing silently.
 */

const ASSESSMENT_KINDS: MaterialKind[] = ["PAST_EXAM", "PROBLEM_SET", "SOLUTIONS"];

export type GateInput = {
  kind: MaterialKind;
  assessmentStatus: AssessmentStatus;
  /** End date of the term the material is tagged with, if any. */
  termEndsOn?: Date | null;
};

export type GateResult = {
  gated: boolean;
  /** "certain" when the uploader's tag decides it; "uncertain" when we inferred. */
  certainty: "certain" | "uncertain";
  reason: string;
};

export function assessMaterialGate(m: GateInput, now = new Date()): GateResult {
  const isAssessment = ASSESSMENT_KINDS.includes(m.kind);
  if (m.assessmentStatus === "POSSIBLY_LIVE") {
    return { gated: true, certainty: "certain", reason: "Tagged as possibly live (may still be graded)." };
  }
  if (m.assessmentStatus === "UNKNOWN") {
    return {
      gated: true,
      certainty: "uncertain",
      reason: "The uploader wasn't sure whether this is still graded, so it's treated as possibly live.",
    };
  }
  if (m.assessmentStatus === "RETIRED") {
    if (m.termEndsOn && m.termEndsOn > now) {
      return {
        gated: true,
        certainty: "uncertain",
        reason: "Tagged retired, but it belongs to a term that hasn't ended yet, so it may still be graded.",
      };
    }
    return { gated: false, certainty: "certain", reason: "Retired assessment — available for practice." };
  }
  // NOT_ASSESSMENT
  if (isAssessment) {
    return {
      gated: true,
      certainty: "uncertain",
      reason: "Looks like an assessment but has no retired/live tag, so it's treated as possibly live.",
    };
  }
  return { gated: false, certainty: "certain", reason: "Not an assessment." };
}

/** Whether the raw file may be downloaded. Solutions to gated assessments are withheld. */
export function canDownload(m: GateInput, now = new Date()) {
  return !(m.kind === "SOLUTIONS" && assessMaterialGate(m, now).gated);
}

/** Whether extracted text may be sent to the AI as grounding. */
export function canGroundAI(m: GateInput, now = new Date()) {
  return !assessMaterialGate(m, now).gated;
}

const LIVE_HINTS = [
  /\b(due|deadline)\b/i,
  /\b(this|current|next) (week'?s? )?(homework|assignment|problem set|pset|quiz|exam|midterm|final)\b/i,
  /\b(homework|assignment|problem set|pset)\s*#?\d+\b/i,
  /\bgraded\b/i,
  /\btake-?home\b/i,
];

/**
 * Heuristic: does a free-text question look like it asks about a live,
 * ungraded assignment? Returns a note to show the student, or null.
 */
export function liveAssignmentHint(text: string): string | null {
  if (LIVE_HINTS.some((re) => re.test(text))) {
    return "This may relate to a currently graded assignment. Only methods and concepts are covered here, not worked solutions. If it's a retired assignment, link the material so it can be verified.";
  }
  return null;
}
