import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { saveDisplayName } from "../actions/auth";

export const metadata = { title: "Welcome" };

export default async function WelcomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");
  return (
    <div style={{ maxWidth: 520 }} className="stack">
      <h1>Welcome</h1>
      <p>Your email is verified for {user.school.name}. Pick the name classmates will see next to your posts.</p>
      <div className="card">
        <ActionForm action={saveDisplayName}>
          <input type="hidden" name="next" value="/courses" />
          <div className="field">
            <label htmlFor="displayName">Display name</label>
            <span className="hint" id="dn-hint">2–40 characters. It doesn&apos;t have to be your full name.</span>
            <input id="displayName" name="displayName" type="text" required minLength={2} maxLength={40} defaultValue={user.displayName} aria-describedby="dn-hint" />
          </div>
          <SubmitButton>Continue</SubmitButton>
        </ActionForm>
      </div>
    </div>
  );
}
