import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { config } from "@/lib/config";
import { timeAgo } from "@/lib/format";
import { assessMaterialGate } from "@/lib/integrity";
import { loadCourse } from "../../data";
import { flagContent, markResolved, reply, vote } from "../../../../actions/chat";
import { ActionForm } from "@/components/ActionForm";
import { AutoRefresh } from "@/components/AutoRefresh";
import { GateBadge, Notice, OriginBadge } from "@/components/Badges";
import { SubmitButton } from "@/components/SubmitButton";

export default async function ThreadPage({ params }: { params: Promise<{ courseId: string; threadId: string }> }) {
  const { courseId, threadId } = await params;
  const { user, enrolled } = await loadCourse(courseId);
  const thread = await db.chatThread.findUnique({
    where: { id: threadId },
    include: {
      author: { select: { displayName: true } },
      topic: true,
      material: { include: { offering: { include: { term: true } } } },
      messages: {
        where: { moderation: { not: "HIDDEN" } },
        include: {
          author: { select: { id: true, displayName: true, tutorProfile: { select: { id: true } } } },
          votes: { where: { userId: user.id } },
          promotedEntry: { select: { id: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!thread || thread.courseId !== courseId || thread.moderation === "HIDDEN") notFound();

  const rep = await db.courseReputation.findUnique({ where: { userId_courseId: { userId: user.id, courseId } } });
  const canResolve = enrolled && (thread.authorId === user.id || (rep?.score ?? 0) >= config.promotion.trustedResolverReputation);
  const groundIds = [...new Set(thread.messages.flatMap((m) => m.groundedOnEntryIds))];
  const grounded = groundIds.length ? await db.knowledgeEntry.findMany({ where: { id: { in: groundIds } }, select: { id: true, title: true } }) : [];
  const gate = thread.material
    ? assessMaterialGate({ kind: thread.material.kind, assessmentStatus: thread.material.assessmentStatus, termEndsOn: thread.material.offering?.term.endsOn })
    : null;

  // Resolved answer first, then by score, AI draft kept near the top for context.
  const messages = [...thread.messages].sort((a, b) => {
    if (a.id === thread.resolvedMessageId) return -1;
    if (b.id === thread.resolvedMessageId) return 1;
    return b.score - a.score || a.createdAt.getTime() - b.createdAt.getTime();
  });
  const path = `/courses/${courseId}/chat/${threadId}`;

  return (
    <div className="stack" style={{ maxWidth: 860 }}>
      {thread.aiAnswerPending && <AutoRefresh />}
      <p className="small"><Link href={`/courses/${courseId}/chat`}>← All questions</Link></p>
      <article className="card stack-s" aria-labelledby="q-title">
        <h2 id="q-title">{thread.title}</h2>
        <div className="cluster small muted">
          <span>Asked by {thread.author.displayName} · {timeAgo(thread.createdAt)}</span>
          {thread.topic && <span className="badge">{thread.topic.name}</span>}
          {thread.status === "RESOLVED" && <span className="badge badge-verified"><span aria-hidden="true">✓</span> Resolved</span>}
        </div>
        <div className="prose">{thread.body}</div>
        {thread.material && (
          <p className="small">
            About: <Link href={`/courses/${courseId}/materials#m-${thread.material.id}`}>{thread.material.title}</Link>{" "}
            {gate?.gated && <GateBadge reason={gate.reason} uncertain={gate.certainty === "uncertain"} />}
          </p>
        )}
        {thread.moderation === "FLAGGED" && <Notice kind="warning">Community members flagged this thread. Read with care.</Notice>}
      </article>

      <section aria-labelledby="answers-h" className="stack">
        <h3 id="answers-h">{messages.length} {messages.length === 1 ? "answer" : "answers"}</h3>
        {thread.aiAnswerPending && (
          <Notice title="The AI is drafting a first answer…">It&apos;ll appear here in a moment. Classmates can then confirm or correct it.</Notice>
        )}
        {messages.map((m) => {
          const my = m.votes[0]?.value ?? 0;
          const isAI = m.origin === "AI_DRAFTED";
          const cls = ["message", isAI && "message-ai", m.id === thread.resolvedMessageId && "message-resolved", m.moderation === "FLAGGED" && "message-flagged"].filter(Boolean).join(" ");
          return (
            <article key={m.id} className={cls} aria-label={isAI ? "AI-drafted answer" : `Answer by ${m.author?.displayName}`}>
              <header>
                <strong>{isAI ? "Study assistant" : m.author?.displayName}</strong>
                <OriginBadge origin={m.origin} verification={m.verification} />
                {m.id === thread.resolvedMessageId && <span className="badge badge-verified"><span aria-hidden="true">✓</span> Resolving answer</span>}
                {m.promotedEntry && (
                  <Link href={`/courses/${courseId}/knowledge#e-${m.promotedEntry.id}`} className="badge badge-community">
                    <span aria-hidden="true">★</span> Added to the study guide
                  </Link>
                )}
                <span className="small muted">{timeAgo(m.createdAt)}</span>
              </header>
              {m.integrityNote && <Notice kind="warning">{m.integrityNote}</Notice>}
              {m.moderation === "FLAGGED" && <Notice kind="warning">Flagged by the community as possibly wrong or inappropriate.</Notice>}
              <div className="prose">{m.body}</div>
              {isAI && m.groundedOnEntryIds.length > 0 && (
                <p className="small">
                  Based on community entries:{" "}
                  {grounded.filter((g) => m.groundedOnEntryIds.includes(g.id)).map((g, i) => (
                    <span key={g.id}>
                      {i > 0 && ", "}
                      <Link href={`/courses/${courseId}/knowledge#e-${g.id}`}>{g.title}</Link>
                    </span>
                  ))}
                </p>
              )}
              {isAI && m.groundedOnEntryIds.length === 0 && (
                <p className="small muted">No community entry covered this yet, so the AI wrote it from scratch. Upvote it if it&apos;s correct, or reply with a correction.</p>
              )}
              <div className="cluster" style={{ marginTop: 8 }}>
                <span className="vote">
                  <form action={vote.bind(null, m.id, 1)}>
                    <button className="btn btn-ghost btn-small" type="submit" aria-pressed={my === 1} disabled={!enrolled || m.author?.id === user.id} aria-label={isAI ? "Confirm: this is correct" : "Upvote"}>
                      ▲ {isAI ? "Confirm" : "Helpful"}
                    </button>
                  </form>
                  <span className="score" aria-label={`Score ${m.score}`}>{m.score}</span>
                  <form action={vote.bind(null, m.id, -1)}>
                    <button className="btn btn-ghost btn-small" type="submit" aria-pressed={my === -1} disabled={!enrolled || m.author?.id === user.id} aria-label="Downvote">
                      ▼ {isAI ? "Not right" : "Not helpful"}
                    </button>
                  </form>
                </span>
                {canResolve && m.id !== thread.resolvedMessageId && (
                  <form action={markResolved.bind(null, thread.id, m.id)}>
                    <button type="submit" className="btn btn-ghost btn-small">✓ Mark as resolving answer</button>
                  </form>
                )}
                {enrolled && (
                  <details>
                    <summary className="btn btn-ghost btn-small">⚑ Flag</summary>
                    <ActionForm action={flagContent.bind(null, "MESSAGE", m.id, courseId, path)} className="stack-s">
                      <div className="field">
                        <label htmlFor={`flag-${m.id}`}>What&apos;s wrong?</label>
                        <input id={`flag-${m.id}`} name="reason" type="text" required minLength={3} maxLength={500} />
                      </div>
                      <SubmitButton small variant="secondary">Submit flag</SubmitButton>
                    </ActionForm>
                  </details>
                )}
              </div>
            </article>
          );
        })}
        <p className="small muted">
          Answers with {config.promotion.upvoteThreshold}+ net votes, or marked resolving by a high-reputation member, are added to the course study guide automatically.
        </p>
      </section>

      <section aria-labelledby="reply-h" className="stack-s">
        <h3 id="reply-h">Your answer</h3>
        {enrolled ? (
          <ActionForm action={reply.bind(null, thread.id)}>
            <div className="field">
              <label htmlFor="reply-body">Answer, correction or follow-up</label>
              <textarea id="reply-body" name="body" required />
            </div>
            <SubmitButton pendingLabel="Posting…">Post answer</SubmitButton>
          </ActionForm>
        ) : (
          <p className="muted">Add this course to your courses to answer.</p>
        )}
      </section>
    </div>
  );
}
