import { describe, expect, it } from "vitest";
import { buildInitialPlan, orderTopics, type PlanTopic } from "@/lib/study/planner";

const T = (id: string, position: number, prerequisiteIds: string[] = []): PlanTopic => ({ id, name: id.toUpperCase(), position, prerequisiteIds });

describe("orderTopics", () => {
  it("respects prerequisites over syllabus position", () => {
    const order = orderTopics([T("b", 0, ["a"]), T("a", 1), T("c", 2, ["b"])]).map((t) => t.id);
    expect(order).toEqual(["a", "b", "c"]);
  });
  it("survives cycles", () => {
    expect(orderTopics([T("a", 0, ["b"]), T("b", 1, ["a"])])).toHaveLength(2);
  });
});

describe("buildInitialPlan", () => {
  const topics = [T("a", 0), T("b", 1, ["a"]), T("c", 2, ["b"]), T("d", 3, ["c"])];
  const start = new Date("2026-10-01T08:00:00Z");

  it("builds one LEARN session per topic, spaced reviews and a final review", () => {
    const plan = buildInitialPlan({ topics, start, anchorDate: new Date("2026-10-20"), dailyMinutes: 45 });
    const learn = plan.sessions.filter((s) => s.kind === "LEARN");
    expect(learn.map((s) => s.topicIds[0])).toEqual(["a", "b", "c", "d"]);
    expect(plan.sessions.some((s) => s.kind === "RESURFACE")).toBe(true);
    expect(plan.sessions.at(-1)!.kind).toBe("REVIEW");
    expect(plan.paceMode).toBe("normal");
    for (const s of plan.sessions) expect(s.reason.length).toBeGreaterThan(10);
  });

  it("groups topics and compresses when time is short", () => {
    const plan = buildInitialPlan({ topics, start, anchorDate: new Date("2026-10-04"), dailyMinutes: 45 });
    expect(plan.paceMode).toBe("compressed");
    const learn = plan.sessions.filter((s) => s.kind === "LEARN");
    expect(learn.length).toBeLessThan(4);
    expect(learn.flatMap((s) => s.topicIds).sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("schedules sessions before the anchor date", () => {
    const anchor = new Date("2026-10-20");
    const plan = buildInitialPlan({ topics, start, anchorDate: anchor, dailyMinutes: 90 });
    for (const s of plan.sessions) expect(s.scheduledFor.getTime()).toBeLessThan(anchor.getTime());
  });
});
