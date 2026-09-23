# Checkpoints before launch

These need a decision from IE (or confirmation) and are deliberately **not** defaulted in code.

| # | Checkpoint | Owner | Where it bites in code |
|---|---|---|---|
| 1 | **Infrastructure review.** Hosting, data residency (EU), backups, encryption at rest, network design, and validation before anything beyond local dev. | IE Cloud Services | `src/lib/storage.ts` (local disk only), DB hosting, `.env` |
| 2 | **Payout structure for student tutors.** How money reaches students (connected accounts? who is merchant of record? tax/invoicing implications? platform fee?). Needed before the Payments module is finalised. | IE legal + finance | `src/lib/payments/index.ts` (mock only), `config.tutoring.platformFeeBps` (0) |
| 3 | **Valid email domains.** Decision: students only, so only `student.ie.edu` is active. Confirm with IE IT that this is the complete set of student domains (e.g. exchange or programme-specific domains). | IE IT | `SchoolDomain` table via `prisma/seed.ts` |
| 4 | **Sending student content to an AI provider.** Chat questions, community answers and material text are sent to the Anthropic API when a key is set. Needs a DPIA / DPO sign-off, a data processing agreement, and a decision on retention/region. | IE DPO / legal | `src/lib/ai/anthropic.ts` |
| 5 | **Dispute escalation.** Peer resolution is built in, but unresolved disputes say they go to "platform support". Who is that, and what's the SLA? | IE (student services?) | `src/app/tutoring/page.tsx`, `resolveDispute` |
| 6 | **Email delivery.** Which relay/provider sends sign-in codes. | IE IT / Cloud Services | `src/lib/email.ts` (console only) |
| 7 | **Moderation & retention policy.** How long chat, materials and performance data are kept; the process for takedown requests (e.g. copyrighted materials). | IE legal | flags → `src/jobs/moderation.ts` |
| 8 | **External communications.** Any landing page, marketing, LinkedIn or press copy about the platform needs Communications team review before publishing. (In-app UI copy is exempt.) | IE Communications | — |
| 9 | **Accessibility audit.** Built to WCAG 2.1 AA / EAA; needs a formal audit (screen reader, keyboard, 200% zoom) before launch. | IE digital accessibility | — |
