import Link from "next/link";
import { db } from "@/lib/db";
import { timeAgo } from "@/lib/format";
import { loadCourse } from "../data";
import { createThread } from "../../../actions/chat";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { Notice } from "@/components/Badges";
import { aiEnabled } from "@/lib/features";

export const metadata = { title: "Chat" };

export default async function ChatPage({ params, searchParams }: { params: Promise<{ courseId: string }>; searchParams: Promise<{ topic?: string; status?: string }> }) {
  const { courseId } = await params;
  const { topic, status } = await searchParams;
  const { course, enrolled } = await loadCourse(courseId);
  const ai = aiEnabled();
  const [threads, materials] = await Promise.all([
    db.chatThread.findMany({
      where: {
        courseId,
        moderation: { not: "HIDDEN" },
        ...(topic ? { topicId: topic } : {}),
        ...(status === "open" ? { status: "OPEN" } : status === "resolved" ? { status: "RESOLVED" } : {}),
      },
      include: {
        author: { select: { displayName: true } },
        topic: true,
        _count: { select: { messages: true } },
        messages: { where: { promotedEntry: { isNot: null } }, select: { id: true }, take: 1 },
      },
      orderBy: { lastActivityAt: "desc" },
      take: 100,
    }),
    db.material.findMany({ where: { courseId, moderation: { not: "HIDDEN" } }, select: { id: true, title: true }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);

  return (
    <div className="two-col">
      <section className="stack" aria-labelledby="threads-h">
        <div className="between">
          <h2 id="threads-h">Questions &amp; discussion</h2>
          <form className="cluster" action={`/courses/${courseId}/chat`}>
            <label htmlFor="topic" className="visually-hidden">Filter by topic</label>
            <select id="topic" name="topic" defaultValue={topic ?? ""} style={{ width: "auto" }}>
              <option value="">All topics</option>
              {course.topics.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <label htmlFor="status" className="visually-hidden">Filter by status</label>
            <select id="status" name="status" defaultValue={status ?? ""} style={{ width: "auto" }}>
              <option value="">Any status</option>
              <option value="open">Open</option>
              <option value="resolved">Resolved</option>
            </select>
            <button className="btn btn-secondary btn-small" type="submit">Filter</button>
          </form>
        </div>
        {threads.length === 0 ? (
          <Notice title="No questions yet.">
            This course is new here. Ask the first question, or answer one when it comes in. Well-voted answers become the course&apos;s knowledge base.
          </Notice>
        ) : (
          <ul className="list-plain">
            {threads.map((t) => (
              <li key={t.id} className="card">
                <h3 style={{ fontSize: "var(--type-h4-size)", lineHeight: "var(--type-h4-lh)" }}>
                  <Link href={`/courses/${courseId}/chat/${t.id}`}>{t.title}</Link>
                </h3>
                <div className="cluster small muted">
                  <span>{t.author.displayName}</span>
                  <span>· {timeAgo(t.lastActivityAt)}</span>
                  <span>· {t._count.messages} {t._count.messages === 1 ? "reply" : "replies"}</span>
                  {t.topic && <span className="badge">{t.topic.name}</span>}
                  {t.status === "RESOLVED" && <span className="badge badge-verified"><span aria-hidden="true">✓</span> Resolved</span>}
                  {t.messages.length > 0 && <span className="badge badge-community"><span aria-hidden="true">★</span> In study guide</span>}
                  {t.moderation === "FLAGGED" && <span className="badge badge-gated"><span aria-hidden="true">⚑</span> Flagged</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <aside aria-labelledby="ask-h" className="stack-s">
        <h2 id="ask-h">Ask a question</h2>
        {enrolled ? (
          <div className="card">
            <ActionForm action={createThread.bind(null, courseId)}>
              <div className="field">
                <label htmlFor="title">Question</label>
                <input id="title" name="title" type="text" required minLength={8} maxLength={160} />
              </div>
              <div className="field">
                <label htmlFor="body">Details</label>
                <span className="hint" id="body-hint">What have you tried? Where are you stuck?</span>
                <textarea id="body" name="body" required minLength={10} aria-describedby="body-hint" />
              </div>
              <div className="field">
                <label htmlFor="topicId">Topic (optional)</label>
                <select id="topicId" name="topicId" defaultValue="">
                  <option value="">{ai ? "Let the AI suggest one" : "No specific topic"}</option>
                  {course.topics.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="materialId">About a specific material? (optional)</label>
                <span className="hint" id="mat-hint">Linking it lets the platform check whether it&apos;s still graded.</span>
                <select id="materialId" name="materialId" defaultValue="" aria-describedby="mat-hint">
                  <option value="">No</option>
                  {materials.map((m) => (
                    <option key={m.id} value={m.id}>{m.title}</option>
                  ))}
                </select>
              </div>
              <SubmitButton pendingLabel="Posting…">Post question</SubmitButton>
              {ai && (
                <p className="small muted" style={{ margin: 0 }}>
                  The AI posts a first answer right away. It uses the course&apos;s community answers where they exist, and is labelled AI-drafted.
                </p>
              )}
            </ActionForm>
          </div>
        ) : (
          <p className="muted">Add this course to your courses to ask questions.</p>
        )}
      </aside>
    </div>
  );
}
