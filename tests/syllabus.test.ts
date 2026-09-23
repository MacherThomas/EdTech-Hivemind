import { afterEach, describe, expect, it } from "vitest";
import { aiEnabled } from "@/lib/features";
import { parseSyllabus } from "@/lib/syllabus";

describe("parseSyllabus", () => {
  it("picks week/session/numbered/bulleted lines in order, chained as prerequisites", () => {
    const t = parseSyllabus(
      ["Course overview", "Week 1: Supply and demand", "Session 2 - Elasticity (reading ch. 5)", "3. Consumer choice.", "• Market failures", "Assessment: 40% final", "Week 1: supply and demand"].join("\n"),
    );
    expect(t.map((x) => x.name)).toEqual(["Supply and demand", "Elasticity", "Consumer choice", "Market failures"]);
    expect(t[0].prerequisites).toEqual([]);
    expect(t[2].prerequisites).toEqual(["Elasticity"]);
  });
  it("returns nothing for free text", () => {
    expect(parseSyllabus("This course introduces economics.")).toEqual([]);
  });
});

describe("aiEnabled", () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });
  it("is off by default, even with a key", () => {
    delete process.env.AI_ENABLED;
    process.env.ANTHROPIC_API_KEY = "x";
    expect(aiEnabled()).toBe(false);
  });
  it("needs both the flag and credentials", () => {
    process.env.AI_ENABLED = "true";
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_AUTH_TOKEN;
    expect(aiEnabled()).toBe(false);
    process.env.ANTHROPIC_API_KEY = "x";
    expect(aiEnabled()).toBe(true);
  });
});
