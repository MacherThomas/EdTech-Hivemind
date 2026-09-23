import type { MaterialKind, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { assessMaterialGate, canDownload } from "@/lib/integrity";
import { loadCourse } from "../data";
import { flagContent } from "../../../actions/chat";
import { updateMaterialStatus, uploadMaterial } from "../../../actions/materials";
import { ActionForm } from "@/components/ActionForm";
import { GateBadge, Notice } from "@/components/Badges";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata = { title: "Materials" };

const KIND_LABEL: Record<MaterialKind, string> = {
  PAST_EXAM: "Past exam",
  PROBLEM_SET: "Problem set",
  SOLUTIONS: "Solutions",
  NOTES: "Notes",
  SLIDES: "Slides",
  SYLLABUS: "Syllabus",
  OTHER: "Other",
};

export default async function MaterialsPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ topic?: string; kind?: string; offering?: string; professor?: string }>;
}) {
  const { courseId } = await params;
  const f = await searchParams;
  const { user, course, enrolled } = await loadCourse(courseId);
  const where: Prisma.MaterialWhereInput = {
    courseId,
    moderation: { not: "HIDDEN" },
    ...(f.topic ? { topics: { some: { id: f.topic } } } : {}),
    ...(f.kind ? { kind: f.kind as MaterialKind } : {}),
    ...(f.offering ? { offeringId: f.offering } : {}),
    ...(f.professor ? { professorId: f.professor } : {}),
  };
  const materials = await db.material.findMany({
    where,
    include: { topics: true, offering: { include: { term: true } }, professor: true, uploader: { select: { id: true, displayName: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const professors = await db.professor.findMany({ where: { materials: { some: { courseId } } }, orderBy: { name: "asc" } });

  // Browse by topic, not just a flat chronological list.
  const groups = new Map<string, { name: string; items: typeof materials }>();
  for (const m of materials) {
    const keys = m.topics.length ? m.topics.map((t) => [t.id, t.name] as const) : ([["_none", "Not tagged with a topic"]] as const);
    for (const [id, name] of keys) {
      if (f.topic && id !== f.topic) continue;
      if (!groups.has(id)) groups.set(id, { name, items: [] });
      groups.get(id)!.items.push(m);
    }
  }
  const order = [...course.topics.map((t) => t.id), "_none"];
  const sorted = [...groups.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
  const path = `/courses/${courseId}/materials`;

  return (
    <div className="two-col">
      <section className="stack" aria-labelledby="mat-h">
        <h2 id="mat-h">Materials</h2>
        <form className="form-grid" action={path} aria-label="Filter materials">
          <div className="field">
            <label htmlFor="f-topic">Topic</label>
            <select id="f-topic" name="topic" defaultValue={f.topic ?? ""}>
              <option value="">All</option>
              {course.topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-kind">Type</label>
            <select id="f-kind" name="kind" defaultValue={f.kind ?? ""}>
              <option value="">All</option>
              {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-off">Term</label>
            <select id="f-off" name="offering" defaultValue={f.offering ?? ""}>
              <option value="">All</option>
              {course.offerings.map((o) => <option key={o.id} value={o.id}>{o.term.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-prof">Professor</label>
            <select id="f-prof" name="professor" defaultValue={f.professor ?? ""}>
              <option value="">All</option>
              {professors.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div style={{ alignSelf: "end" }}>
            <button className="btn btn-secondary" type="submit">Apply filters</button>
          </div>
        </form>

        {materials.length === 0 && (
          <Notice title="No materials yet.">Share notes, slides or retired past exams. They help everyone, and they help the AI study guide too.</Notice>
        )}

        {sorted.map(([id, g]) => (
          <section key={id} aria-labelledby={`g-${id}`} className="stack-s">
            <h3 id={`g-${id}`}>{g.name}</h3>
            <ul className="list-plain">
              {g.items.map((m) => {
                const gateInput = { kind: m.kind, assessmentStatus: m.assessmentStatus, termEndsOn: m.offering?.term.endsOn };
                const gate = assessMaterialGate(gateInput);
                const downloadable = canDownload(gateInput);
                return (
                  <li key={`${id}-${m.id}`} id={`m-${m.id}`} className="card stack-s">
                    <div className="between">
                      <h4 style={{ margin: 0 }}>{m.title}</h4>
                      <div className="cluster">
                        <span className="badge">{KIND_LABEL[m.kind]}</span>
                        {m.assessmentStatus === "RETIRED" && !gate.gated && <span className="badge badge-verified"><span aria-hidden="true">✓</span> Retired: OK for practice</span>}
                        {gate.gated && <GateBadge reason={gate.reason} uncertain={gate.certainty === "uncertain"} />}
                        {m.moderation === "FLAGGED" && <span className="badge badge-gated"><span aria-hidden="true">⚑</span> Flagged</span>}
                      </div>
                    </div>
                    <p className="small muted" style={{ margin: 0 }}>
                      {[m.offering?.term.name, m.professor?.name, `shared by ${m.uploader.displayName}`, formatDate(m.createdAt)].filter(Boolean).join(" · ")}
                    </p>
                    {m.description && <p style={{ margin: 0 }}>{m.description}</p>}
                    {gate.gated && <p className="small" style={{ margin: 0 }}>{gate.reason} The AI won&apos;t use it for worked solutions.</p>}
                    <div className="cluster">
                      {downloadable ? (
                        <a className="btn btn-secondary btn-small" href={`/api/materials/${m.id}`}>Download <span className="visually-hidden">{m.title}</span></a>
                      ) : (
                        <span className="small">Download withheld until this assessment is retired.</span>
                      )}
                      {enrolled && gate.gated === false && m.kind !== "NOTES" && m.kind !== "SLIDES" && m.kind !== "SYLLABUS" && m.kind !== "OTHER" && (
                        <form action={updateMaterialStatus.bind(null, m.id, "POSSIBLY_LIVE")}>
                          <button className="btn btn-ghost btn-small" type="submit">Report as still graded</button>
                        </form>
                      )}
                      {enrolled && m.uploader.id === user.id && gate.gated && (
                        <form action={updateMaterialStatus.bind(null, m.id, "RETIRED")}>
                          <button className="btn btn-ghost btn-small" type="submit">Mark retired (no longer graded)</button>
                        </form>
                      )}
                      {enrolled && (
                        <details>
                          <summary className="btn btn-ghost btn-small">⚑ Flag</summary>
                          <ActionForm action={flagContent.bind(null, "MATERIAL", m.id)} className="stack-s">
                            <div className="field">
                              <label htmlFor={`flag-${m.id}`}>What&apos;s wrong?</label>
                              <input id={`flag-${m.id}`} name="reason" type="text" required minLength={3} />
                            </div>
                            <SubmitButton small variant="secondary">Submit flag</SubmitButton>
                          </ActionForm>
                        </details>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </section>

      <aside aria-labelledby="up-h" className="stack-s">
        <h2 id="up-h">Share a material</h2>
        {enrolled ? (
          <div className="card">
            <ActionForm action={uploadMaterial.bind(null, courseId)}>
              <div className="field">
                <label htmlFor="file">File</label>
                <span className="hint" id="file-hint">PDF, Word, PowerPoint, text, Markdown or image, up to 15 MB. Text and Markdown files can also be used by the AI.</span>
                <input id="file" name="file" type="file" required aria-describedby="file-hint" />
              </div>
              <div className="field">
                <label htmlFor="m-title">Title</label>
                <input id="m-title" name="title" type="text" required maxLength={160} />
              </div>
              <div className="field">
                <label htmlFor="m-kind">Type</label>
                <select id="m-kind" name="kind" required defaultValue="NOTES">
                  {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <fieldset className="field">
                <legend>If this is an exam, problem set or solutions: is it still graded?</legend>
                <span className="hint">This decides what the AI is allowed to do with it. If you&apos;re not sure, say so.</span>
                {[
                  ["RETIRED", "No, it's retired (e.g. a past year's exam)"],
                  ["POSSIBLY_LIVE", "It may still be graded"],
                  ["UNKNOWN", "Not sure"],
                  ["NOT_ASSESSMENT", "Not an assessment"],
                ].map(([v, l]) => (
                  <label key={v} className="radio-row" style={{ fontWeight: 400 }}>
                    <input type="radio" name="assessmentStatus" value={v} defaultChecked={v === "NOT_ASSESSMENT"} required /> {l}
                  </label>
                ))}
              </fieldset>
              <fieldset className="field">
                <legend>Topics</legend>
                <span className="hint">Tag what it covers. If you skip this for a text file, the AI will suggest topics.</span>
                {course.topics.length === 0 && <span className="small muted">No topics yet. Add them in the AI study guide tab.</span>}
                {course.topics.map((t) => (
                  <label key={t.id} className="radio-row" style={{ fontWeight: 400 }}>
                    <input type="checkbox" name="topicIds" value={t.id} /> {t.name}
                  </label>
                ))}
              </fieldset>
              <div className="field">
                <label htmlFor="m-off">Term</label>
                <select id="m-off" name="offeringId" defaultValue="">
                  <option value="">Not term-specific / unsure</option>
                  {course.offerings.map((o) => <option key={o.id} value={o.id}>{o.term.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="m-prof">Professor (optional)</label>
                <input id="m-prof" name="professor" type="text" maxLength={80} />
              </div>
              <div className="field">
                <label htmlFor="m-desc">Description (optional)</label>
                <textarea id="m-desc" name="description" maxLength={1000} style={{ minHeight: 80 }} />
              </div>
              <SubmitButton pendingLabel="Uploading…">Upload</SubmitButton>
            </ActionForm>
          </div>
        ) : (
          <p className="muted">Add this course to your courses to share materials.</p>
        )}
      </aside>
    </div>
  );
}
