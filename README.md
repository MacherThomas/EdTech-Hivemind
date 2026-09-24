# IE Study Hivemind

A community-led study platform for IE University. Every course is a self-contained space with four sections: **Chat**, **Study guide**, **Materials** and **Tutors**, plus a **Knowledge base** view of the shared "hivemind" underneath them. Students are the primary source of value.

> **AI features are switched off** (`AI_ENABLED=false`, the default). Everything runs on community content: answers, explanations and practice questions are all written by students. The Claude integration is still in the code behind that flag, for when IE provides an API key and the DPO signs off.

> **Status: local development only.** Consult IE Cloud Services on hosting, data residency and review before deploying anywhere beyond local development. Open decisions are tracked in [docs/CHECKPOINTS.md](docs/CHECKPOINTS.md).

## Quick start

**Easiest (Mac/Windows/Linux, only Node.js needed):** `npm install`, then `npm run local`. It starts a private database, loads the courses and demo data, and serves the site at http://localhost:3000. Step-by-step: [docs/RUN-ON-MAC.md](docs/RUN-ON-MAC.md).

**Manual setup:**

Requirements: Node 20+, PostgreSQL 14+.

```bash
cp .env.example .env            # set DATABASE_URL and AUTH_SECRET
npm install
npx prisma migrate deploy
npm run db:seed                  # IE University, email-domain allowlist, terms
SEED_DEMO=1 npm run db:seed      # optional: fictional ECON-101 demo content
npm run dev
```

Sign in at http://localhost:3000/signin with any address on an allowlisted domain (students only: `you@student.ie.edu`). With `EMAIL_TRANSPORT=console`, the 6-digit code is printed in the server log. Demo accounts are `demo.ana@student.ie.edu` … `demo.farah@student.ie.edu`; Ana has earned tutor status in ECON-101.

To turn AI features back on later, set `AI_ENABLED=true` and `ANTHROPIC_API_KEY` (model: `AI_MODEL`, default `claude-opus-5`).

## Adding real courses

Course catalogue entries live in `prisma/courses/*.json` and are loaded by `npm run db:seed` (idempotent). To add one from an IE syllabus PDF:

```bash
npx tsx scripts/import-syllabus.ts path/to/syllabus.pdf      # writes prisma/courses/<code>.json
npm run db:seed
```

Only the course metadata and the session programme are kept (no staff bios, emails or grading details). Topics are read from the programme. Students can also upload a syllabus PDF under **Materials → Syllabus** in any course, and the study guide's topics are built from it.

Current catalogue (BBA year 3, Fall 2026): Strategies for Competing in Industries and Markets, Data Analysis for Economics, Human Capital Management, Management Control, Supply Chain Management.

## Checks

```bash
npm run typecheck && npm run lint && npm test     # unit tests for the pure logic
npm run build
# End-to-end walkthrough (needs a running app on a fresh DB seeded with SEED_DEMO=1,
# with the server log captured so sign-in codes can be read):
SERVER_LOG=./server.log npm run e2e
```

## What's in the MVP

| Area | What works |
|---|---|
| Verification | School-email sign-in with time-limited codes (HMAC-hashed, deleted on use). The domain allowlist is a table. Departmental mailboxes (`info@`, `admin@`…) are rejected. Only the verified email and school are stored: no passwords, no ID documents. |
| Courses | Persistent courses with term-tagged `CourseOffering`s (term + professors). Self-reported enrollment. Any verified user of the school can view; only enrolled users can contribute. |
| Chat | Threads, votes, flags, resolving answers, topic tagging (also after posting). |
| Hivemind | Answers auto-promote into the knowledge base at 3 net upvotes, or when a high-reputation member marks them resolving. Promotion is shown in the thread. Entries are versioned, term-stable or term-specific, and deprecated by reputation-weighted flags. |
| Materials | Upload with tags prompted at upload (topic, term, professor, retired/live). Browsable and filterable by topic, type, term and professor. |
| Integrity | A single gate (`src/lib/integrity.ts`): gated solutions can't be downloaded, knowledge entries that answer a gated assessment are hidden, and practice questions can only be sourced from retired assessments of finished terms. Uncertainty is shown, never silently guessed. |
| Study guide | Topics parsed from a pasted/uploaded syllabus (lines like "Week 3: Elasticity") or added by hand. Plans built from an anchor date in prerequisite order; every session ends in practice questions from the **student-written question bank** (multiple choice and numeric auto-marked, written answers self-marked against a model answer). The four adaptive mechanisms are separate and unit-tested: **reorder**, **re-teach** (a different community explanation after a wrong answer), **spaced resurfacing**, **pace compression / deepening**. Every decision carries a visible "why". A topic that doesn't improve after 2 cycles surfaces the course's tutors. |
| Tutors | Emergent from per-course reputation signals, not an application. A tutor identity spans courses, with per-course self-set rates, weekly availability, booking, and the full status flow (requested → confirmed → completed / cancelled / disputed), free-cancellation window, peer dispute resolution and ratings. Payments sit behind a processor interface with a **mock** provider. |
| Dashboard | Cross-course home: study plans, your own weak topics (private), tutoring sessions, recent activity. |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the data model and design decisions.
