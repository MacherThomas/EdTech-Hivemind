# IE Study Hivemind

A community-led study platform for IE University. Every course is a self-contained space with four sections: **Chat**, **AI study guide**, **Materials** and **Tutors**, plus a **Knowledge base** view of the shared "hivemind" underneath them. Students are the primary source of value. The AI organises and amplifies what they produce, and always labels its own output.

> **Status: local development only.** Consult IE Cloud Services on hosting, data residency and review before deploying anywhere beyond local development. Open decisions are tracked in [docs/CHECKPOINTS.md](docs/CHECKPOINTS.md).

## Quick start

Requirements: Node 20+, PostgreSQL 14+.

```bash
cp .env.example .env            # set DATABASE_URL and AUTH_SECRET
npm install
npx prisma migrate deploy
npm run db:seed                  # IE University, email-domain allowlist, terms
SEED_DEMO=1 npm run db:seed      # optional: fictional ECON-101 demo content
npm run dev
```

Sign in at http://localhost:3000/signin with any address on an allowlisted domain (e.g. `you@student.ie.edu`). With `EMAIL_TRANSPORT=console`, the 6-digit code is printed in the server log. Demo accounts are `demo.ana@student.ie.edu` … `demo.farah@student.ie.edu`; Ana has earned tutor status in ECON-101.

Without `ANTHROPIC_API_KEY` the app uses a deterministic offline AI stub, so every flow works locally. Set the key to use Claude (`AI_MODEL`, default `claude-opus-5`).

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
| Chat | Threads, votes, flags, resolving answers. **AI answers first**: every new question gets an immediate draft grounded on community knowledge, labelled AI-drafted and unverified, which classmates confirm or correct. |
| Hivemind | Answers auto-promote into the knowledge base at 3 net upvotes, or when a high-reputation member marks them resolving. Promotion is shown in the thread. Entries are versioned, term-stable or term-specific, and deprecated by reputation-weighted flags. |
| Materials | Upload with tags prompted at upload (topic, term, professor, retired/live). AI suggests topics if none are given. Browsable by topic. |
| Integrity | A single gate (`src/lib/integrity.ts`) decides what the AI may use: possibly-live and unknown assessments never ground the AI, gated solutions can't be downloaded, and knowledge entries that answer a gated assessment are hidden. Uncertainty is shown, never silently guessed. |
| AI study guide | Topic structure from a syllabus (high confidence) or inferred (labelled lower confidence). Plans built from an anchor date in prerequisite order; every session ends in practice questions. The four adaptive mechanisms are separate and unit-tested: **reorder**, **re-teach**, **spaced resurfacing**, **pace compression / deepening**. Every decision carries a visible "why". A topic that doesn't improve after 2 cycles surfaces the course's tutors. |
| Tutors | Emergent from per-course reputation signals, not an application. A tutor identity spans courses, with per-course self-set rates, weekly availability, booking, and the full status flow (requested → confirmed → completed / cancelled / disputed), free-cancellation window, peer dispute resolution and ratings. Payments sit behind a processor interface with a **mock** provider. |
| Dashboard | Cross-course home: study plans, your own weak topics (private), tutoring sessions, recent activity. |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the data model and design decisions.
