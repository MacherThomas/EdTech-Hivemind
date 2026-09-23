import Link from "next/link";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { appliesToOffering, currentOffering, entryGate, entryInclude } from "@/lib/hivemind";
import { loadCourse } from "../data";
import { flagContent } from "../../../actions/chat";
import { contributeEntry } from "../../../actions/knowledge";
import { ActionForm } from "@/components/ActionForm";
import { GateBadge, Notice, OriginBadge } from "@/components/Badges";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata = { title: "Knowledge base" };

const SOURCE: Record<string, string> = {
  CHAT_PROMOTION: "Promoted from chat",
  TUTOR_SESSION: "From a tutoring session",
  AI_GENERATED: "AI-generated",
  DIRECT_CONTRIBUTION: "Written directly",
};

export default async function KnowledgePage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const { course, enrolled } = await loadCourse(courseId);
  const [entries, current] = await Promise.all([
    db.knowledgeEntry.findMany({
      where: { courseId },
      include: { ...entryInclude, supersedes: { select: { id: true, version: true } }, supersededBy: { select: { id: true } } },
      orderBy: [{ topic: { position: "asc" } }, { updatedAt: "desc" }],
    }),
    currentOffering(courseId),
  ]);
  const latest = entries.filter((e) => !e.supersededBy && e.status !== "DEPRECATED");
  const deprecated = entries.filter((e) => e.status === "DEPRECATED");
  const history = entries.filter((e) => e.supersededBy);
  const byTopic = new Map<string, typeof latest>();
  for (const e of latest) {
    const k = e.topic?.name ?? "General";
    byTopic.set(k, [...(byTopic.get(k) ?? []), e]);
  }

  return (
    <div className="two-col">
      <section className="stack" aria-labelledby="kb-h">
        <h2 id="kb-h">Knowledge base</h2>
        <p className="muted">
          The course hivemind: answers promoted from chat, explanations written by classmates, and clearly labelled AI drafts.
          The AI study guide uses these first.
        </p>
        {latest.length === 0 && (
          <Notice title="Nothing here yet.">
            Entries appear when chat answers get enough upvotes or are marked resolving by a trusted member. You can also write one directly.
          </Notice>
        )}
        {[...byTopic.entries()].map(([topic, list]) => (
          <section key={topic} className="stack-s" aria-label={topic}>
            <h3>{topic}</h3>
            <ul className="list-plain">
              {list.map((e) => {
                const gate = entryGate(e);
                const stale = e.stability === "TERM_SPECIFIC" && !appliesToOffering(e, current?.id ?? null);
                return (
                  <li key={e.id} id={`e-${e.id}`} className="card stack-s">
                    <div className="between">
                      <h4 style={{ margin: 0 }}>{e.title}</h4>
                      <OriginBadge origin={e.origin} verification={e.verification} />
                    </div>
                    <div className="cluster small">
                      <span className="badge">{SOURCE[e.source]}</span>
                      <span className="badge">{e.stability === "TERM_STABLE" ? "Stable concept" : `Specific to ${e.offering?.term.name ?? "a term"}`}</span>
                      {e.version > 1 && <span className="badge">v{e.version}</span>}
                      {gate.gated && <GateBadge reason={gate.reason} uncertain={gate.certainty === "uncertain"} />}
                      {e.status === "FLAGGED" && <span className="badge badge-gated"><span aria-hidden="true">⚑</span> Under community review</span>}
                    </div>
                    {stale && (
                      <Notice kind="warning">
                        This is specific to {e.offering?.term.name ?? "another term"}. Formats and assignments may differ this term.
                      </Notice>
                    )}
                    {gate.gated ? (
                      <Notice kind="warning" title="Hidden for academic integrity.">
                        This entry answers an assessment that may still be graded ({gate.reason}). It becomes visible once the assessment is retired.
                      </Notice>
                    ) : (
                      <div className="prose">{e.body}</div>
                    )}
                    <p className="small muted" style={{ margin: 0 }}>
                      {e.contributor ? `By ${e.contributor.displayName}` : "AI-drafted"} · updated {formatDate(e.updatedAt)}
                      {e.promotedFromMessageId && " · "}
                      {e.promotedFromMessageId && <PromotedLink courseId={courseId} messageId={e.promotedFromMessageId} />}
                    </p>
                    {enrolled && (
                      <div className="cluster">
                        <details>
                          <summary className="btn btn-ghost btn-small">Write a new version</summary>
                          <EntryForm courseId={courseId} topics={course.topics} offerings={course.offerings} supersedes={e} />
                        </details>
                        <details>
                          <summary className="btn btn-ghost btn-small">⚑ Flag as wrong or outdated</summary>
                          <ActionForm action={flagContent.bind(null, "KNOWLEDGE_ENTRY", e.id)} className="stack-s">
                            <div className="field">
                              <label htmlFor={`flag-${e.id}`}>What&apos;s wrong?</label>
                              <input id={`flag-${e.id}`} name="reason" type="text" required minLength={3} />
                            </div>
                            <SubmitButton small variant="secondary">Submit flag</SubmitButton>
                          </ActionForm>
                        </details>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        {(history.length > 0 || deprecated.length > 0) && (
          <details>
            <summary>Older versions and deprecated entries ({history.length + deprecated.length})</summary>
            <ul>
              {[...history, ...deprecated].map((e) => (
                <li key={e.id}>
                  {e.title} (v{e.version}) · {e.status === "DEPRECATED" ? "deprecated by community flags" : "superseded"}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
      <aside className="stack-s" aria-labelledby="contrib-h">
        <h2 id="contrib-h">Write an explanation</h2>
        {enrolled ? (
          <div className="card">
            <EntryForm courseId={courseId} topics={course.topics} offerings={course.offerings} />
          </div>
        ) : (
          <p className="muted">Add this course to your courses to contribute.</p>
        )}
      </aside>
    </div>
  );
}

async function PromotedLink({ courseId, messageId }: { courseId: string; messageId: string }) {
  const m = await db.chatMessage.findUnique({ where: { id: messageId }, select: { threadId: true } });
  return m ? <Link href={`/courses/${courseId}/chat/${m.threadId}`}>see original thread</Link> : null;
}

function EntryForm({
  courseId,
  topics,
  offerings,
  supersedes,
}: {
  courseId: string;
  topics: { id: string; name: string }[];
  offerings: { id: string; term: { name: string } }[];
  supersedes?: { id: string; title: string; body: string; topicId: string | null; stability: string; offeringId: string | null };
}) {
  const p = supersedes?.id ?? "new";
  return (
    <ActionForm action={contributeEntry.bind(null, courseId)}>
      {supersedes && <input type="hidden" name="supersedesId" value={supersedes.id} />}
      <div className="field">
        <label htmlFor={`t-${p}`}>Title</label>
        <input id={`t-${p}`} name="title" type="text" required defaultValue={supersedes?.title} />
      </div>
      <div className="field">
        <label htmlFor={`b-${p}`}>Explanation</label>
        <textarea id={`b-${p}`} name="body" required defaultValue={supersedes?.body} />
      </div>
      <div className="field">
        <label htmlFor={`tp-${p}`}>Topic</label>
        <select id={`tp-${p}`} name="topicId" defaultValue={supersedes?.topicId ?? ""}>
          <option value="">General</option>
          {topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      <fieldset className="field">
        <legend>Does this depend on the term or professor?</legend>
        <label className="radio-row" style={{ fontWeight: 400 }}>
          <input type="radio" name="stability" value="TERM_STABLE" defaultChecked={supersedes?.stability !== "TERM_SPECIFIC"} /> No, it&apos;s a stable concept
        </label>
        <label className="radio-row" style={{ fontWeight: 400 }}>
          <input type="radio" name="stability" value="TERM_SPECIFIC" defaultChecked={supersedes?.stability === "TERM_SPECIFIC"} /> Yes (exam format, a specific assignment…)
        </label>
      </fieldset>
      <div className="field">
        <label htmlFor={`o-${p}`}>Term (required if term-specific)</label>
        <select id={`o-${p}`} name="offeringId" defaultValue={supersedes?.offeringId ?? ""}>
          <option value="">—</option>
          {offerings.map((o) => <option key={o.id} value={o.id}>{o.term.name}</option>)}
        </select>
      </div>
      <SubmitButton small={!!supersedes}>{supersedes ? "Publish new version" : "Add to knowledge base"}</SubmitButton>
    </ActionForm>
  );
}
