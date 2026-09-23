import { CourseTabs } from "./CourseTabs";
import { loadCourse } from "./data";
import { enroll, unenroll } from "../../actions/courses";
import { SubmitButton } from "@/components/SubmitButton";

export default async function CourseLayout({ children, params }: { children: React.ReactNode; params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const { course, enrollment } = await loadCourse(courseId);
  const current = course.offerings.find((o) => o.term.startsOn <= new Date() && o.term.endsOn >= new Date());
  return (
    <div>
      <div className="between">
        <div>
          <p className="small muted" style={{ margin: 0 }}>{course.code}</p>
          <h1 style={{ marginBottom: 4 }}>{course.name}</h1>
          {current && (
            <p className="small muted" style={{ margin: 0 }}>
              {current.term.name}
              {current.professors.length ? ` · ${current.professors.map((p) => p.name).join(", ")}` : ""}
            </p>
          )}
        </div>
        {enrollment ? (
          <form action={unenroll.bind(null, course.id)}>
            <span className="badge badge-verified" style={{ marginRight: 8 }}><span aria-hidden="true">✓</span> Enrolled (self-reported)</span>
            <SubmitButton variant="ghost" small>Leave</SubmitButton>
          </form>
        ) : (
          <form action={enroll.bind(null, course.id)} className="cluster">
            {course.offerings.length > 0 && (
              <>
                <label htmlFor="offeringId" className="small">Term</label>
                <select id="offeringId" name="offeringId" defaultValue={current?.id ?? ""} style={{ width: "auto" }}>
                  <option value="">Not sure</option>
                  {course.offerings.map((o) => (
                    <option key={o.id} value={o.id}>{o.term.name}</option>
                  ))}
                </select>
              </>
            )}
            <SubmitButton>I&apos;m taking this course</SubmitButton>
          </form>
        )}
      </div>
      {!enrollment && (
        <p className="small muted" style={{ marginTop: 8 }}>
          You can browse everything. To post, vote, upload or tutor, add the course to your courses.
        </p>
      )}
      <CourseTabs courseId={course.id} />
      {children}
    </div>
  );
}
