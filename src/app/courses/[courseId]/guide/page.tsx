import Link from "next/link";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { publishableMissRate } from "@/lib/privacy";
import { loadCourse } from "../data";
import { addTopic, createPlan, inferTopics, saveSyllabus } from "../../../actions/guide";
import { ActionForm } from "@/components/ActionForm";
import { Notice } from "@/components/Badges";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata = { title: "AI study guide" };

export default async function GuidePage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const { user, course, enrolled } = await loadCourse(courseId);
  const [topics, plans, entryCount] = await Promise.all([
    db.topic.findMany({ where: { courseId }, include: { prerequisites: true, aggregate: true }, orderBy: { position: "asc" } }),
    db.studyPlan.findMany({ where: { userId: user.id, courseId, status: { in: ["ACTIVE", "COMPLETED"] } }, orderBy: { createdAt: "desc" }, take: 5 }),
    db.knowledgeEntry.count({ where: { courseId, status: "ACTIVE", verification: "COMMUNITY_VERIFIED" } }),
  ]);
  const inferred = topics.some((t) => t.source === "INFERRED");
  const active = plans.find((p) => p.status === "ACTIVE");
  const hardest = topics
    .map((t) => ({ t, miss: publishableMissRate(t.aggregate) }))
    .filter((x): x is { t: (typeof topics)[number]; miss: number } => x.miss != null)
    .sort((a, b) => b.miss - a.miss)
    .slice(0, 5);
  const minDate = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);

  return (
    <div className="two-col">
      <div className="stack">
        {entryCount === 0 && (
          <Notice kind="warning" title="AI-only for now.">
            This course has no community-verified knowledge yet, so explanations and questions come from the AI and are labelled
            unverified. They&apos;ll improve as classmates answer in chat and share materials.
          </Notice>
        )}

        <section className="stack-s" aria-labelledby="plan-h">
          <h2 id="plan-h">Your study plan</h2>
          {active ? (
            <div className="card stack-s">
              <h3 style={{ margin: 0 }}>{active.anchorLabel}: {formatDate(active.anchorDate)}</h3>
              <p className="small muted" style={{ margin: 0 }}>{active.paceReason}</p>
              <Link className="btn btn-primary" href={`/courses/${courseId}/guide/plan/${active.id}`}>Open plan</Link>
            </div>
          ) : (
            <p className="muted">Set your exam or deadline and the guide builds sessions in prerequisite order. Each one ends with practice questions and adapts as you go.</p>
          )}
          <details open={!active}>
            <summary className="btn btn-secondary">{active ? "Start a new plan" : "Create a study plan"}</summary>
            <div className="card" style={{ marginTop: 12 }}>
              <ActionForm action={createPlan.bind(null, courseId)}>
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="anchorLabel">What are you preparing for?</label>
                    <input id="anchorLabel" name="anchorLabel" type="text" required placeholder="Midterm" />
                  </div>
                  <div className="field">
                    <label htmlFor="anchorDate">Date</label>
                    <input id="anchorDate" name="anchorDate" type="date" required min={minDate} />
                  </div>
                  <div className="field">
                    <label htmlFor="dailyMinutes">Minutes per day</label>
                    <input id="dailyMinutes" name="dailyMinutes" type="number" min={15} max={480} step={15} defaultValue={60} />
                  </div>
                </div>
                {active && <p className="small muted" style={{ margin: 0 }}>Creating a new plan archives the current one.</p>}
                <SubmitButton pendingLabel="Building your plan…">Build plan</SubmitButton>
              </ActionForm>
            </div>
          </details>
        </section>

        <section className="stack-s" aria-labelledby="topics-h">
          <div className="between">
            <h2 id="topics-h">Course topics</h2>
            {course.syllabusIngestedAt ? (
              <span className="badge badge-verified"><span aria-hidden="true">✓</span> From syllabus</span>
            ) : inferred ? (
              <span className="badge badge-inferred">Inferred by AI: lower confidence</span>
            ) : null}
          </div>
          {topics.length === 0 ? (
            <Notice>
              No topic structure yet. Paste the syllabus for the best results, or let the AI infer a starting structure from the course name
              and any shared materials.
            </Notice>
          ) : (
            <>
              {inferred && !course.syllabusIngestedAt && (
                <Notice kind="warning">
                  These topics were inferred by the AI without a syllabus. They may not match your course. Adding the syllabus replaces them.
                </Notice>
              )}
              <ol className="stack-s">
                {topics.map((t) => (
                  <li key={t.id}>
                    <strong>{t.name}</strong>{" "}
                    {t.source === "INFERRED" && <span className="badge badge-inferred">inferred · {Math.round(t.confidence * 100)}% confidence</span>}
                    {t.source === "COMMUNITY" && <span className="badge badge-community">added by a student</span>}
                    {t.summary && <div className="small muted">{t.summary}</div>}
                    {t.prerequisites.length > 0 && (
                      <div className="small muted">Builds on: {t.prerequisites.map((p) => p.name).join(", ")}</div>
                    )}
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>

        {hardest.length > 0 && (
          <section className="stack-s" aria-labelledby="insights-h">
            <h2 id="insights-h">Where the course struggles</h2>
            <p className="small muted">Aggregated across students, and only shown once enough people have practised a topic. No individual results are shared.</p>
            <ul>
              {hardest.map(({ t, miss }) => (
                <li key={t.id}>
                  {Math.round(miss * 100)}% of answers on <strong>{t.name}</strong> are wrong
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <aside className="stack">
        {enrolled ? (
          <>
            <section className="card stack-s" aria-labelledby="syl-h">
              <h2 id="syl-h" style={{ fontSize: "var(--type-h3-size)", lineHeight: "var(--type-h3-lh)" }}>Syllabus</h2>
              <p className="small">Paste the syllabus (or upload it as a text file under Materials → Syllabus). The topic structure is rebuilt from it.</p>
              <ActionForm action={saveSyllabus.bind(null, courseId)}>
                <div className="field">
                  <label htmlFor="syllabus">Syllabus text</label>
                  <textarea id="syllabus" name="syllabus" defaultValue={course.syllabusText ?? ""} style={{ minHeight: 160 }} />
                </div>
                <SubmitButton pendingLabel="Building topics…" variant="secondary">Save &amp; rebuild topics</SubmitButton>
              </ActionForm>
              {!course.syllabusText && (
                <form action={inferTopics.bind(null, courseId)}>
                  <SubmitButton variant="ghost" pendingLabel="Inferring…">No syllabus? Infer topics with AI</SubmitButton>
                </form>
              )}
            </section>
            <section className="card stack-s" aria-labelledby="add-topic-h">
              <h2 id="add-topic-h" style={{ fontSize: "var(--type-h4-size)", lineHeight: "var(--type-h4-lh)", fontWeight: 700 }}>Missing a topic?</h2>
              <ActionForm action={addTopic.bind(null, courseId)}>
                <div className="field">
                  <label htmlFor="topic-name">Topic name</label>
                  <input id="topic-name" name="name" type="text" required minLength={3} maxLength={80} />
                </div>
                <SubmitButton variant="secondary" small>Add topic</SubmitButton>
              </ActionForm>
            </section>
          </>
        ) : (
          <p className="muted">Enrolled students can add the syllabus and topics.</p>
        )}
      </aside>
    </div>
  );
}
