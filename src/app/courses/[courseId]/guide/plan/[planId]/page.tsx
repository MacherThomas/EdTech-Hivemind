import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { config } from "@/lib/config";
import { formatDate } from "@/lib/format";
import { loadCourse } from "../../../data";
import { archivePlan } from "../../../../../actions/guide";
import { Notice } from "@/components/Badges";
import { SubmitButton } from "@/components/SubmitButton";

const KIND_LABEL: Record<string, string> = {
  LEARN: "Learn", REINFORCE: "Strengthen", RETEACH: "New angle", RESURFACE: "Spaced review", DEEPEN: "Go deeper", REVIEW: "Final review",
};
const STATUS_LABEL: Record<string, string> = { UPCOMING: "Upcoming", IN_PROGRESS: "In progress", MASTERED: "Mastered", STRUGGLING: "Needs work" };

export default async function PlanPage({ params, searchParams }: { params: Promise<{ courseId: string; planId: string }>; searchParams: Promise<{ adapted?: string }> }) {
  const { courseId, planId } = await params;
  const { adapted } = await searchParams;
  const { user } = await loadCourse(courseId);
  const plan = await db.studyPlan.findUnique({
    where: { id: planId },
    include: {
      sessions: { include: { topics: { include: { topic: true } } }, orderBy: { position: "asc" } },
      progress: { include: { topic: true }, orderBy: { topic: { position: "asc" } } },
    },
  });
  // Plans and progress are private to their owner.
  if (!plan || plan.userId !== user.id || plan.courseId !== courseId) notFound();

  const groups = { MASTERED: [], IN_PROGRESS: [], STRUGGLING: [], UPCOMING: [] } as Record<string, typeof plan.progress>;
  for (const p of plan.progress) groups[p.status].push(p);
  const handoff = plan.progress.filter((p) => p.stalledCycles >= config.study.tutorHandoffCycles && p.status === "STRUGGLING");
  const next = plan.sessions.find((s) => s.status === "IN_PROGRESS" || s.status === "UPCOMING");
  const done = plan.sessions.filter((s) => s.status === "COMPLETED").length;
  const total = plan.sessions.filter((s) => s.status !== "SKIPPED").length;

  return (
    <div className="stack">
      <p className="small"><Link href={`/courses/${courseId}/guide`}>← Study guide</Link></p>
      <div className="between">
        <h2 style={{ margin: 0 }}>{plan.anchorLabel}: {formatDate(plan.anchorDate)}</h2>
        {plan.status === "ACTIVE" && (
          <form action={archivePlan.bind(null, courseId, plan.id)}>
            <SubmitButton variant="ghost" small>Archive plan</SubmitButton>
          </form>
        )}
      </div>
      {adapted && <Notice kind="success">Session complete. The plan was adjusted based on your answers. See each session&apos;s reason below.</Notice>}
      {plan.status === "COMPLETED" && <Notice kind="success">You&apos;ve finished every session in this plan.</Notice>}

      <div className="card stack-s">
        <div className="between">
          <strong>{done} of {total} sessions done</strong>
          <span className="badge">
            Pace: {plan.paceMode === "compressed" ? "compressed (behind)" : plan.paceMode === "deepening" ? "going deeper (ahead)" : "on track"}
          </span>
        </div>
        <div className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Plan progress">
          <span style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
        </div>
        {plan.paceReason && <p className="small" style={{ margin: 0 }}><strong>Why:</strong> {plan.paceReason}</p>}
        {next && plan.status === "ACTIVE" && (
          <Link className="btn btn-primary" href={`/courses/${courseId}/guide/plan/${plan.id}/session/${next.id}`}>
            {next.status === "IN_PROGRESS" ? "Continue" : "Start"}: {next.title}
          </Link>
        )}
      </div>

      {handoff.length > 0 && (
        <Notice kind="info" title="A classmate could help.">
          {handoff.map((h) => h.topic.name).join(", ")} {handoff.length === 1 ? "hasn't" : "haven't"} improved after {config.study.tutorHandoffCycles} plan
          adjustments. Students who&apos;ve given top answers in this course offer tutoring.{" "}
          <Link href={`/courses/${courseId}/tutors`}>See tutors for this course</Link>
        </Notice>
      )}

      <div className="two-col">
        <section aria-labelledby="sessions-h" className="stack-s">
          <h3 id="sessions-h">Sessions</h3>
          <ol className="timeline">
            {plan.sessions.map((s) => (
              <li key={s.id} data-status={s.status}>
                <div className="between">
                  <span>
                    <span className="badge">{KIND_LABEL[s.kind]}</span>{" "}
                    {s.status === "COMPLETED" || s.status === "SKIPPED" || plan.status !== "ACTIVE" ? (
                      <strong>{s.title}</strong>
                    ) : (
                      <Link href={`/courses/${courseId}/guide/plan/${plan.id}/session/${s.id}`}><strong>{s.title}</strong></Link>
                    )}
                  </span>
                  <span className="small muted">
                    {formatDate(s.scheduledFor)} · {s.status === "COMPLETED" ? "✓ done" : s.status === "SKIPPED" ? "skipped" : s.status === "IN_PROGRESS" ? "in progress" : "upcoming"}
                  </span>
                </div>
                <p className="small muted" style={{ margin: "4px 0 0" }}>Why: {s.reason}</p>
              </li>
            ))}
          </ol>
        </section>
        <section aria-labelledby="progress-h" className="stack-s">
          <h3 id="progress-h">Topic progress</h3>
          <p className="small muted">Private to you.</p>
          {(["STRUGGLING", "IN_PROGRESS", "MASTERED", "UPCOMING"] as const).map((k) =>
            groups[k].length ? (
              <div key={k} className="stack-s">
                <h4>{STATUS_LABEL[k]} ({groups[k].length})</h4>
                <ul className="list-plain">
                  {groups[k].map((p) => (
                    <li key={p.id}>
                      <div className="between small">
                        <span>{p.topic.name}</span>
                        <span>{p.attempts ? `${Math.round(p.mastery * 100)}%` : "not started"}</span>
                      </div>
                      {p.attempts > 0 && (
                        <div className="meter" aria-hidden="true"><span style={{ width: `${Math.round(p.mastery * 100)}%` }} /></div>
                      )}
                      {p.lastReason && <p className="small muted" style={{ margin: "4px 0 0" }}>{p.lastReason}</p>}
                      {p.nextReviewAt && p.status === "MASTERED" && (
                        <p className="small muted" style={{ margin: 0 }}>Next review around {formatDate(p.nextReviewAt)}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null,
          )}
        </section>
      </div>
    </div>
  );
}
