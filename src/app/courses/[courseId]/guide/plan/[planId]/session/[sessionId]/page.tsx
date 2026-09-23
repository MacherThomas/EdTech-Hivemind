import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { groundingEntries } from "@/lib/hivemind";
import { ensureSessionQuestions } from "@/lib/study/service";
import { loadCourse } from "../../../../../data";
import { finishSession } from "../../../../../../../actions/guide";
import { Notice, OriginBadge } from "@/components/Badges";
import { SubmitButton } from "@/components/SubmitButton";
import { AnswerForm } from "./AnswerForm";

export default async function SessionPage({ params }: { params: Promise<{ courseId: string; planId: string; sessionId: string }> }) {
  const { courseId, planId, sessionId } = await params;
  const { user } = await loadCourse(courseId);
  const base = await db.studySession.findUnique({ where: { id: sessionId }, include: { plan: true } });
  if (!base || base.planId !== planId || base.plan.userId !== user.id) notFound();

  if (base.status !== "COMPLETED" && base.status !== "SKIPPED") await ensureSessionQuestions(sessionId, user.id);
  const session = await db.studySession.findUniqueOrThrow({
    where: { id: sessionId },
    include: {
      topics: { include: { topic: true } },
      questions: { include: { question: { include: { sourceMaterial: { select: { title: true } } } } }, orderBy: { position: "asc" } },
      attempts: { orderBy: { answeredAt: "desc" } },
    },
  });

  // Explanations: community knowledge first; flagged as AI-only when none exists.
  const explanations = await Promise.all(
    session.topics.map(async ({ topic }) => ({
      topic,
      entries: await groundingEntries(courseId, `${topic.name} ${topic.summary ?? ""}`, { topicId: topic.id, limit: 2, topicOnly: true }),
    })),
  );
  const shownIds = explanations.flatMap((e) => e.entries.map((x) => x.id));
  if (shownIds.length && session.status !== "COMPLETED") {
    await db.knowledgeEntryView.createMany({ data: shownIds.map((entryId) => ({ userId: user.id, entryId })) });
  }
  const answered = new Set(session.attempts.map((a) => a.questionId));
  const allAnswered = session.questions.every((q) => answered.has(q.questionId));

  return (
    <div className="stack" style={{ maxWidth: 860 }}>
      <p className="small"><Link href={`/courses/${courseId}/guide/plan/${planId}`}>← Back to plan</Link></p>
      <h2>{session.title}</h2>
      <p className="muted"><strong>Why this session:</strong> {session.reason}</p>

      <section aria-labelledby="learn-h" className="stack-s">
        <h3 id="learn-h">Explanations</h3>
        {explanations.map(({ topic, entries }) => (
          <div key={topic.id} className="card stack-s">
            <h4 style={{ margin: 0 }}>{topic.name}</h4>
            {topic.summary && <p className="muted" style={{ margin: 0 }}>{topic.summary}</p>}
            {entries.length === 0 ? (
              <p className="small muted" style={{ margin: 0 }}>
                No community explanation yet for this topic. Ask in <Link href={`/courses/${courseId}/chat`}>chat</Link>, and good answers get added here.
              </p>
            ) : (
              entries.map((e) => (
                <details key={e.id}>
                  <summary>
                    {e.title} <OriginBadge origin={e.origin} verification={e.verification} />
                  </summary>
                  <div className="prose" style={{ marginTop: 8 }}>{e.body}</div>
                </details>
              ))
            )}
          </div>
        ))}
      </section>

      <section aria-labelledby="practice-h" className="stack-s">
        <h3 id="practice-h">Practice</h3>
        {session.questions.length === 0 && <Notice kind="warning">No questions could be prepared for this session.</Notice>}
        <ol className="stack">
          {session.questions.map(({ question: q }) => {
            const prev = session.attempts.find((a) => a.questionId === q.id);
            return (
              <li key={q.id} className="card stack-s">
                <div className="cluster small">
                  {q.origin === "AI_ORIGINAL" && <span className="badge badge-ai"><span aria-hidden="true">✦</span> AI-generated, original</span>}
                  {q.origin === "SOURCED_FROM_MATERIAL" && (
                    <span className="badge badge-community">From a retired past assessment{q.sourceMaterial ? `: ${q.sourceMaterial.title}` : ""}</span>
                  )}
                  {q.origin === "COMMUNITY" && <span className="badge badge-community">Written by a student</span>}
                  <span className="badge">Difficulty {q.difficulty}/5</span>
                </div>
                <p className="prose" style={{ margin: 0 }}>{q.prompt}</p>
                <AnswerForm
                  sessionId={session.id}
                  questionId={q.id}
                  type={q.type}
                  choices={Array.isArray(q.choices) ? (q.choices as string[]) : null}
                  previous={prev ? { correct: prev.correct, response: prev.response, answer: q.answer, explanation: q.explanation } : null}
                />
              </li>
            );
          })}
        </ol>
      </section>

      {session.status !== "COMPLETED" && (
        <form action={finishSession.bind(null, courseId, planId, session.id)} className="stack-s">
          {!allAnswered && <p className="small muted">You can finish now; unanswered questions just won&apos;t count.</p>}
          <SubmitButton pendingLabel="Updating your plan…">Finish session &amp; adapt my plan</SubmitButton>
        </form>
      )}
    </div>
  );
}
