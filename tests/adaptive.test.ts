import { describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import { adapt, applyAnswer, type QueueItem, type TopicState } from "@/lib/study/adaptive";

const now = new Date("2026-10-01T09:00:00Z");
const topic = (id: string, over: Partial<TopicState> = {}): TopicState => ({
  topicId: id, name: id.toUpperCase(), mastery: 0, attempts: 0, status: "UPCOMING", stalledCycles: 0,
  intervalDays: 1, nextReviewAt: null, masteryAtLastCycle: null, lastReason: null, ...over,
});
const learn = (id: string, topicId: string, day: number): QueueItem => ({
  id, title: topicId, kind: "LEARN", topicIds: [topicId], reason: "r", targetDifficulty: 2,
  scheduledFor: new Date(now.getTime() + day * 86_400_000),
});
const review = (day: number): QueueItem => ({ id: "rev", title: "Final", kind: "REVIEW", topicIds: [], reason: "r", targetDifficulty: 3, scheduledFor: new Date(now.getTime() + day * 86_400_000) });

describe("applyAnswer (spaced resurfacing intervals)", () => {
  it("doubles the interval on correct answers and resets on wrong", () => {
    let s = topic("a");
    s = applyAnswer(s, true, now);
    expect(s.intervalDays).toBe(2);
    s = applyAnswer(s, true, now);
    expect(s.intervalDays).toBe(4);
    s = applyAnswer(s, false, now);
    expect(s.intervalDays).toBe(1);
  });
  it("classifies struggling and mastered topics", () => {
    let weak = topic("a");
    for (let i = 0; i < 3; i++) weak = applyAnswer(weak, false, now);
    expect(weak.status).toBe("STRUGGLING");
    let strong = topic("b");
    for (let i = 0; i < 3; i++) strong = applyAnswer(strong, true, now);
    expect(strong.status).toBe("MASTERED");
  });
});

describe("adapt", () => {
  const base = { now, anchorDate: new Date("2026-10-15"), dailyMinutes: 45 };

  it("mechanism 1 — reorders: inserts reinforcement for a weak topic at the front", () => {
    const out = adapt({ ...base, topics: [topic("a", { attempts: 3, mastery: 0.2, status: "STRUGGLING" }), topic("b")], queue: [learn("s2", "b", 1), review(13)] });
    expect(out.queue[0]).toMatchObject({ kind: "REINFORCE", topicIds: ["a"] });
    expect(out.queue[0].reason).toMatch(/A/);
    expect(out.queue.at(-1)!.kind).toBe("REVIEW");
  });

  it("mechanism 2 — switches to a RETEACH session once reinforcement stalls", () => {
    const out = adapt({
      ...base,
      topics: [topic("a", { attempts: 6, mastery: 0.3, status: "STRUGGLING", stalledCycles: 0, masteryAtLastCycle: 0.3 })],
      queue: [learn("s2", "b", 1)],
    });
    expect(out.queue[0].kind).toBe("RETEACH");
    expect(out.topics[0].stalledCycles).toBe(1);
  });

  it("hands off to a tutor after the configured number of stalled cycles", () => {
    const out = adapt({
      ...base,
      topics: [topic("a", { attempts: 8, mastery: 0.3, status: "STRUGGLING", stalledCycles: config.study.tutorHandoffCycles - 1, masteryAtLastCycle: 0.31 })],
      queue: [],
    });
    expect(out.tutorSuggestedTopicIds).toEqual(["a"]);
  });

  it("does not count an improving topic as stalled", () => {
    const out = adapt({ ...base, topics: [topic("a", { attempts: 6, mastery: 0.45, status: "STRUGGLING", stalledCycles: 1, masteryAtLastCycle: 0.2 })], queue: [] });
    expect(out.topics[0].stalledCycles).toBe(0);
    expect(out.tutorSuggestedTopicIds).toEqual([]);
  });

  it("mechanism 3 — resurfaces mastered topics on their spaced interval", () => {
    const out = adapt({
      ...base,
      topics: [topic("a", { attempts: 3, mastery: 0.9, status: "MASTERED", intervalDays: 4, nextReviewAt: new Date(now.getTime() + 4 * 86_400_000) })],
      queue: [learn("s2", "b", 1), learn("s3", "c", 2), review(13)],
    });
    const r = out.queue.find((q) => q.kind === "RESURFACE");
    expect(r?.topicIds).toEqual(["a"]);
    expect(r?.reason).toMatch(/4 day/);
  });

  it("mechanism 4 — compresses when behind: drops mastered reviews then merges", () => {
    const queue: QueueItem[] = [
      { ...learn("r1", "m", 0), kind: "RESURFACE" },
      learn("s1", "b", 0), learn("s2", "c", 0), learn("s3", "d", 0), learn("s4", "e", 0), review(2),
    ];
    const out = adapt({ now, anchorDate: new Date("2026-10-03"), dailyMinutes: 45, topics: [topic("m", { attempts: 3, mastery: 0.95, status: "MASTERED" })], queue });
    expect(out.paceMode).toBe("compressed");
    expect(out.skippedIds).toContain("r1");
    expect(out.queue.filter((q) => q.kind !== "REVIEW").length).toBeLessThanOrEqual(1);
    expect(out.queue.flatMap((q) => q.topicIds)).toEqual(expect.arrayContaining(["b", "c", "d", "e"]));
    expect(out.paceReason).toMatch(/behind/);
  });

  it("mechanism 4 — goes deeper (not just faster) when ahead", () => {
    const out = adapt({
      now, anchorDate: new Date("2026-10-30"), dailyMinutes: 45,
      topics: [topic("a", { attempts: 3, mastery: 0.9, status: "MASTERED", nextReviewAt: new Date("2026-11-30") })],
      queue: [learn("s2", "b", 1), review(28)],
    });
    expect(out.paceMode).toBe("deepening");
    const d = out.queue.find((q) => q.kind === "DEEPEN");
    expect(d?.targetDifficulty).toBeGreaterThan(2);
  });

  it("keeps the final review on the day before the anchor", () => {
    const out = adapt({ ...base, topics: [], queue: [learn("s1", "a", 0), review(13)] });
    const r = out.queue.at(-1)!;
    expect(r.kind).toBe("REVIEW");
    expect(r.scheduledFor.getTime()).toBeLessThan(base.anchorDate.getTime());
  });
});
