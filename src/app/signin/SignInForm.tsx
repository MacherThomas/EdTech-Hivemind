"use client";

import { useActionState } from "react";
import { signInAction, type SignInState } from "../actions/auth";
import { Notice } from "@/components/Badges";
import { SubmitButton } from "@/components/SubmitButton";

export function SignInForm() {
  const [state, action] = useActionState<SignInState, FormData>(signInAction, { step: "email" });
  return (
    <form action={action} className="stack" noValidate>
      {state.error && <Notice kind="error">{state.error}</Notice>}
      {state.info && <Notice kind="info">{state.info}</Notice>}
      {state.step === "email" ? (
        <>
          <div className="field">
            <label htmlFor="email">University email</label>
            <span className="hint" id="email-hint">Use your personal IE student address (@student.ie.edu). Shared or departmental mailboxes can&apos;t sign up.</span>
            <input id="email" name="email" type="email" autoComplete="email" required aria-describedby="email-hint" defaultValue={state.email} />
          </div>
          <SubmitButton pendingLabel="Sending code…">Send sign-in code</SubmitButton>
        </>
      ) : (
        <>
          <div className="field">
            <label htmlFor="code">6-digit code</label>
            <span className="hint" id="code-hint">Check your inbox for {state.email}. The code expires in 15 minutes.</span>
            <input id="code" name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required aria-describedby="code-hint" />
          </div>
          <div className="cluster">
            <SubmitButton pendingLabel="Checking…">Sign in</SubmitButton>
            <SubmitButton variant="secondary" name="intent" value="resend" pendingLabel="Sending…">Resend code</SubmitButton>
            <SubmitButton variant="ghost" name="intent" value="restart">Use a different email</SubmitButton>
          </div>
        </>
      )}
    </form>
  );
}
