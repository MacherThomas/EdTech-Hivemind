"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  small,
  name,
  value,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "ghost";
  small?: boolean;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name={name} value={value} className={`btn btn-${variant}${small ? " btn-small" : ""}`} disabled={pending} aria-busy={pending}>
      {pending ? pendingLabel ?? "Working…" : children}
    </button>
  );
}
