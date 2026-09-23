# Architecture

**Stack:** Next.js 15 (App Router, server actions) · TypeScript · PostgreSQL · Prisma 6 · Anthropic SDK · Vitest.

## Layout

```
prisma/schema.prisma      data model (heavily commented, the source of truth)
src/lib/                  domain logic — no React
  auth/                   email rules, challenges, sessions
  ai/                     provider interface; Claude (anthropic.ts) + offline stub
  study/planner.ts        static plan construction (pure)
  study/adaptive.ts       the four adaptive mechanisms (pure)
  study/service.ts        DB side of the study guide
  integrity.ts            the live/retired gate
  hivemind.ts             knowledge retrieval with integrity + versioning filters
  privacy.ts              k-anonymity for aggregates
  reputation.ts           score + tutor eligibility from signals
  tutoring.ts             booking/cancellation/dispute policy (pure)
  payments/               processor boundary (mock only; see CHECKPOINTS)
  enrollment/verifiers.ts pluggable SSO/LMS enrollment verification (none yet)
  config.ts               every tunable threshold in one place
src/jobs/                 background job boundary (runJob / enqueue)
src/app/                  routes, pages, server actions
tests/                    unit tests for the pure logic
scripts/e2e-walkthrough.mjs  browser walkthrough of the core loop
```

## Key decisions

- **Persistent courses, term-tagged content.** `Course` persists across terms, and `CourseOffering` = course × term × professors. Threads, materials and knowledge entries reference an offering where they're term-specific, so knowledge compounds across years without serving stale specifics.
- **Provenance is data, not inference.** `origin` (COMMUNITY / AI_DRAFTED / TUTOR) and `verification` (UNVERIFIED / COMMUNITY_VERIFIED) are columns on messages and knowledge entries, and are always rendered as text badges.
- **Promotion: auto past threshold.** Net score ≥ `promotion.upvoteThreshold`, or resolved by someone with ≥ `trustedResolverReputation`. Promoted entries become `COMMUNITY_VERIFIED`. Flags can later push them to FLAGGED (excluded from AI grounding) or DEPRECATED.
- **One integrity gate.** `assessMaterialGate()` is the only place that decides live vs retired. It is conservative: `UNKNOWN`, untagged assessments and "retired" items from a term that hasn't ended are all gated, with a stated reason. Callers: AI grounding (chat + topics + questions), sourced practice questions, downloads of solutions, and knowledge entries linked to an assessment.
- **Privacy.** `PerformanceRecord` and `UserTopicProgress` are only read for their owner. Aggregates (`TopicAggregate`, `QuestionAggregate`) are rebuilt by a job and only displayed when `distinctUsers ≥ privacy.minCohortSize`. No grades, no official records.
- **Emergent tutors.** `CourseReputation` stores the raw signals (upvotes, resolved answers, entries, sessions, ratings, upheld flags), and the score and eligibility are computed from them against `config.tutors`, so thresholds can be retuned without data changes. `TutorProfile` is per user (spans courses); `TutorCourseRate` is per tutor × course.
- **Jobs.** Promotion, reputation, moderation, aggregates, topic building, plan adaptation and AI answers all live in `src/jobs/` and are invoked via `runJob` (await) or `enqueue` (background). Today they run in-process; swapping in a queue (pg-boss, SQS…) only touches `src/jobs/index.ts`.
- **AI.** `getAI()` returns the Claude provider when credentials exist, else the offline stub. The Claude provider uses structured outputs (Zod-validated), adaptive thinking, prompt caching of the stable system prompt, and server-side refusal fallbacks (`fallbacks: "default"`). Student-written text is wrapped in tags and treated as data, not instructions.
- **Security posture.** Server-action bound arguments and form fields are treated as untrusted: every foreign key is checked against the course/school (`assertBelongsToCourse`), and the flag action derives the course from the target itself. Session tokens and sign-in codes are HMAC-hashed at rest. Downloads are `attachment` + `nosniff`.
- **Accessibility / brand.** IE design tokens (`src/app/tokens.css`) with a semantic layer. Contrast-validated pairs (e.g. input borders use Middle Grey for 3:1). Status is always text + icon + colour. Labelled forms, visible focus, skip link, 44px targets, reflow at 320px.

## Known gaps / next steps

- Real payment processor adapter (blocked on the payout decision; see CHECKPOINTS).
- Text extraction from PDF/DOCX uploads. Only text/Markdown feed the AI today.
- Endorsements for directly contributed knowledge entries (today only trusted members' contributions start verified).
- TutoringSession → KnowledgeEntry (`TUTOR_SESSION` source) capture flow.
- Knowledge-entry efficacy (views are logged privately; correlation job not written).
- Rate limiting beyond sign-in-code throttling; audit logging; email transport.
- Production storage adapter (object storage + encryption at rest).
