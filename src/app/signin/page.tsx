import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { SignInForm } from "./SignInForm";

export const metadata = { title: "Sign in" };

export default async function SignInPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.displayName ? "/" : "/welcome");
  return (
    <div style={{ maxWidth: 520 }} className="stack">
      <h1>Sign in</h1>
      <p>
        Study spaces for your courses, run by students. We only keep your verified university email and school. There are no
        passwords, and no ID documents are ever collected.
      </p>
      <div className="card">
        <SignInForm />
      </div>
    </div>
  );
}
