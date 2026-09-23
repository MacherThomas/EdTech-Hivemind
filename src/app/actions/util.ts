import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { PermissionError } from "@/lib/permissions";
import type { FormState } from "@/components/ActionForm";

export class UserError extends Error {}

/** Converts expected failures into form-level messages; lets redirects through. */
export async function handle(fn: () => Promise<FormState | void>): Promise<FormState> {
  try {
    return (await fn()) ?? null;
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof PermissionError || err instanceof UserError) return { error: err.message };
    if (err instanceof ZodError) return { error: err.issues.map((i) => i.message).join(" ") };
    console.error(err);
    return { error: "Something went wrong. Please try again." };
  }
}

export const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
export const optStr = (f: FormData, k: string) => str(f, k) || null;
