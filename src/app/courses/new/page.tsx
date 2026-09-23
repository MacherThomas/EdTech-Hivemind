import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { createCourse } from "../../actions/courses";

export const metadata = { title: "Add a course" };

export default async function NewCoursePage() {
  const user = await requireUser();
  const terms = await db.term.findMany({ where: { schoolId: user.schoolId }, orderBy: { startsOn: "desc" } });
  return (
    <div className="stack" style={{ maxWidth: 640 }}>
      <h1>Add a course</h1>
      <p>Can&apos;t find your course? Add it. You&apos;ll be enrolled automatically. Add the syllabus afterwards to set up the study guide&apos;s topics.</p>
      <div className="card">
        <ActionForm action={createCourse}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="code">Course code</label>
              <input id="code" name="code" type="text" required maxLength={20} />
            </div>
            <div className="field">
              <label htmlFor="name">Course name</label>
              <input id="name" name="name" type="text" required maxLength={120} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="description">Short description (optional)</label>
            <textarea id="description" name="description" maxLength={1000} />
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="termId">Term you&apos;re taking it (optional)</label>
              <select id="termId" name="termId" defaultValue="">
                <option value="">Not sure / skip</option>
                {terms.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="professors">Professor(s) this term (optional)</label>
              <span className="hint" id="prof-hint">Separate names with commas.</span>
              <input id="professors" name="professors" type="text" aria-describedby="prof-hint" />
            </div>
          </div>
          <SubmitButton pendingLabel="Creating…">Create course</SubmitButton>
        </ActionForm>
      </div>
    </div>
  );
}
