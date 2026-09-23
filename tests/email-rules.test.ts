import { describe, expect, it } from "vitest";
import { checkEmailShape } from "@/lib/auth/email-rules";

describe("checkEmailShape", () => {
  it("accepts and normalises a personal address", () => {
    const r = checkEmailShape("  Jane.Doe@Student.IE.edu ");
    expect(r).toMatchObject({ ok: true, email: "jane.doe@student.ie.edu", domain: "student.ie.edu" });
  });
  it.each(["info@ie.edu", "admin@ie.edu", "Admissions@ie.edu", "no-reply@ie.edu", "info+x@ie.edu", "admins@ie.edu"])(
    "rejects departmental mailbox %s",
    (e) => expect(checkEmailShape(e).ok).toBe(false),
  );
  it("rejects malformed input", () => {
    expect(checkEmailShape("not-an-email").ok).toBe(false);
    expect(checkEmailShape("a@b").ok).toBe(false);
  });
});
