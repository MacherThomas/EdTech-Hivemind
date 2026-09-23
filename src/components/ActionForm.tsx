"use client";

import { useActionState } from "react";
import { Notice } from "./Badges";

export type FormState = { error?: string; ok?: string } | null;

/** Progressive-enhancement form wrapper that shows a server action's error/success text. */
export function ActionForm({
  action,
  children,
  className,
}: {
  action: (prev: FormState, data: FormData) => Promise<FormState>;
  children: React.ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className={className ?? "stack"}>
      {state?.error && <Notice kind="error">{state.error}</Notice>}
      {state?.ok && <Notice kind="success">{state.ok}</Notice>}
      {children}
    </form>
  );
}
