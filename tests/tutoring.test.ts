import { describe, expect, it } from "vitest";
import { canDispute, canTransition, cancellationTerms, generateSlots } from "@/lib/tutoring";

describe("status transitions", () => {
  it("allows the designed flow only", () => {
    expect(canTransition("REQUESTED", "CONFIRMED")).toBe(true);
    expect(canTransition("CONFIRMED", "COMPLETED")).toBe(true);
    expect(canTransition("COMPLETED", "DISPUTED")).toBe(true);
    expect(canTransition("CANCELLED", "CONFIRMED")).toBe(false);
    expect(canTransition("COMPLETED", "CANCELLED")).toBe(false);
  });
});

describe("cancellationTerms", () => {
  const start = new Date("2026-10-10T17:00:00Z");
  it("refunds students who cancel early", () => {
    expect(cancellationTerms({ status: "CONFIRMED", scheduledStart: start, by: "student", now: new Date("2026-10-08T17:00:00Z") }).refundEligible).toBe(true);
  });
  it("doesn't refund late student cancellations", () => {
    expect(cancellationTerms({ status: "CONFIRMED", scheduledStart: start, by: "student", now: new Date("2026-10-10T10:00:00Z") }).refundEligible).toBe(false);
  });
  it("always refunds tutor cancellations and unconfirmed requests", () => {
    const late = new Date("2026-10-10T16:00:00Z");
    expect(cancellationTerms({ status: "CONFIRMED", scheduledStart: start, by: "tutor", now: late }).refundEligible).toBe(true);
    expect(cancellationTerms({ status: "REQUESTED", scheduledStart: start, by: "student", now: late }).refundEligible).toBe(true);
  });
});

describe("canDispute", () => {
  const s = { status: "COMPLETED" as const, scheduledStart: new Date("2026-10-10T17:00:00Z"), durationMinutes: 60 };
  it("is open within the window and closed after", () => {
    expect(canDispute(s, new Date("2026-10-12T00:00:00Z"))).toBe(true);
    expect(canDispute(s, new Date("2026-10-30T00:00:00Z"))).toBe(false);
    expect(canDispute({ ...s, status: "CONFIRMED" }, new Date("2026-10-09T00:00:00Z"))).toBe(false);
  });
});

describe("generateSlots", () => {
  const from = new Date("2026-10-05T06:00:00Z"); // Monday
  it("creates slots in the tutor's timezone and excludes bookings", () => {
    const slots = generateSlots({
      windows: [{ weekday: 1, startMinute: 17 * 60, endMinute: 19 * 60 }],
      timezone: "Europe/Madrid",
      durationMinutes: 60,
      booked: [{ start: new Date("2026-10-05T16:00:00Z"), end: new Date("2026-10-05T17:00:00Z") }],
      from,
      days: 7,
      leadHours: 1,
    });
    // Madrid is UTC+2 in October: 17:00 local = 15:00Z; 18:00 local (16:00Z) is booked.
    expect(slots.map((s) => s.toISOString())).toEqual(["2026-10-05T15:00:00.000Z", "2026-10-12T15:00:00.000Z", "2026-10-12T16:00:00.000Z"]);
  });
  it("handles the DST change", () => {
    const slots = generateSlots({
      windows: [{ weekday: 1, startMinute: 17 * 60, endMinute: 18 * 60 }],
      timezone: "Europe/Madrid",
      durationMinutes: 60,
      booked: [],
      from: new Date("2026-10-20T00:00:00Z"),
      days: 10,
      leadHours: 0,
    });
    // Oct 26 2026 is after the switch to CET (UTC+1): 17:00 local = 16:00Z.
    expect(slots.map((s) => s.toISOString())).toContain("2026-10-26T16:00:00.000Z");
  });
});
