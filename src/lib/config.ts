/**
 * Tunable product thresholds. Kept in one place so they can be adjusted (or
 * moved to per-school data) without touching the logic that uses them.
 */
export const config = {
  auth: {
    codeTtlMinutes: 15,
    maxCodeAttempts: 5,
    sessionTtlDays: 30,
    /** Local parts that identify role/departmental mailboxes, not a person. */
    blockedLocalParts: [
      "info", "admin", "administrator", "office", "contact", "support", "help",
      "noreply", "no-reply", "donotreply", "webmaster", "postmaster", "hostmaster",
      "abuse", "security", "admissions", "registrar", "marketing", "press",
      "communications", "hr", "it", "helpdesk", "sales", "billing", "finance",
      "secretaria", "secretary", "reception", "team", "hello", "mail", "test",
    ],
  },
  promotion: {
    /** Net upvotes at which a chat answer is auto-promoted into a KnowledgeEntry. */
    upvoteThreshold: 3,
    /** Course reputation at which marking an answer "resolving" promotes it immediately. */
    trustedResolverReputation: 25,
  },
  moderation: {
    /** Sum of flagger weights at which content becomes FLAGGED (excluded from AI grounding). */
    flagThreshold: 3,
    /** Sum at which it becomes HIDDEN / DEPRECATED. */
    hideThreshold: 6,
  },
  reputation: {
    weights: {
      upvoteReceived: 2,
      downvoteReceived: -1,
      resolvedAnswer: 10,
      entryContributed: 8,
      sessionCompleted: 5,
      /** Applied per rating point above/below 3 stars. */
      ratingDelta: 3,
      flagUpheld: -10,
    },
  },
  tutors: {
    /** Minimum per-course reputation to appear in a course's Tutors section. */
    minCourseReputation: 20,
    /** And at least this many community-validated contributions. */
    minValidatedContributions: 2,
  },
  tutoring: {
    /** Cancellations at least this many hours before start are free (full refund). */
    freeCancellationHours: 24,
    /** Disputes can be opened up to this many days after the session's scheduled end. */
    disputeWindowDays: 7,
    minPriceCents: 500,
    maxPriceCents: 20000,
    /** Placeholder — platform fee is a business decision pending IE finance review. */
    platformFeeBps: 0,
    bookingHorizonDays: 28,
  },
  privacy: {
    /** Aggregates about a topic/question are only surfaced once this many distinct users contributed. */
    minCohortSize: 5,
  },
  study: {
    questionsPerSession: 4,
    /** Mastery (EWMA accuracy) at or above which a topic counts as mastered. */
    masteryThreshold: 0.75,
    /** Below this after attempts, a topic is "struggling". */
    strugglingThreshold: 0.5,
    /** Adjustment cycles without improvement before a tutor is suggested. */
    tutorHandoffCycles: 2,
    ewmaAlpha: 0.4,
  },
  uploads: {
    maxBytes: 15 * 1024 * 1024,
    allowedMimeTypes: [
      "application/pdf", "text/plain", "text/markdown", "image/png", "image/jpeg",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ],
  },
} as const;
