import { afterEach, describe, expect, it } from "vitest";
import { aiEnabled } from "@/lib/features";
import { parseSyllabus, programmeSection } from "@/lib/syllabus";

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

describe("parseSyllabus — IE layout", () => {
  const ie = [
    "PROGRAM",
    "SESSION 1 (LIVE IN-PERSON)",
    "Introduction",
    "Chapter 1 from Grant Textbook (See Bibliography)",
    "SESSION 2 (LIVE IN-PERSON)",
    "Value creation and capturing",
    "Book Chapters: Contemporary Strategy Analysis (N/C)",
    "SESSION 3 (ASYNCHRONOUS)",
    "Exercise – Applying value creation and capturing",
    "SESSIONS 13 - 14 (LIVE IN-PERSON)",
    "Simulation – Understanding competitive interactions in action",
    "SESSION 24 (LIVE IN-PERSON)",
    "Tensions and benefits of combining financial, social and environmental",
    "objectives",
    "Practical Case : Because There is No Planet B (STR010114-U-ENG-WOD)",
    "SESSION 30 (LIVE IN-PERSON)",
    "Final exam",
  ].join("\n");
  it("takes titles from the line after each session header, joining wrapped titles and skipping non-topics", () => {
    expect(parseSyllabus(ie).map((t) => t.name)).toEqual([
      "Value creation and capturing",
      "Tensions and benefits of combining financial, social and environmental objectives",
    ]);
  });
});

describe("programmeSection", () => {
  it("keeps only the programme, dropping contact details before and grading after", () => {
    const text = "Professor: X\nE-mail: x@example.edu\nPROGRAM\nSESSION 1\nTopic A\n(See\nBibliography)\nSESSION 2\nTopic B\nEVALUATION CRITERIA\nFinal exam 45%";
    const p = programmeSection(text);
    expect(p).not.toMatch(/@/);
    expect(p).toMatch(/Topic B/);
    expect(p).not.toMatch(/45%/);
  });
});

describe("parseSyllabus — other IE layouts", () => {
  it("uses the ALL-CAPS heading after a sustainability note, sentence-casing it and keeping acronyms", () => {
    const t = parseSyllabus(
      [
        "SESSION 1 (LIVE IN-PERSON)", "Sustainability Topics:", "- Economic Development", "PRESENTATION", "Lecture 1. Presentation of the course.",
        "SESSION 2 (LIVE IN-PERSON)", "Sustainability Topics:", "- Social Challenge", "HYPOTHESIS TESTING IN THE SLRM", "Lecture 10: Individual tests",
        "SESSION 3 (ASYNCHRONOUS)", "Sustainability Topics:", "- Social Challenge", "COMPUTER CLASS 2. OLS estimation.",
        "SESSION 4 (LIVE IN-PERSON)", "Sustainability Topics:", "- Social Challenge", "DUMMY VARIABLES", "Lecture 12: Definitions",
        "SESSION 5 (LIVE IN-PERSON)", "DUMMY VARIABLES", "Lecture 13. Chow Test",
      ].join("\n"),
    );
    expect(t.map((x) => x.name)).toEqual(["Hypothesis testing in the SLRM", "Dummy variables"]);
  });

  it("strips 'Topic N:' prefixes and keeps introductions to a subject", () => {
    const t = parseSyllabus(
      ["SESSION 1 (LIVE IN-PERSON)", "Topic 2: Introduction to Management Control.", "Management Control Concepts.", "SESSION 2 (LIVE IN-PERSON)", "Midterm exam."].join("\n"),
    );
    expect(t.map((x) => x.name)).toEqual(["Introduction to Management Control"]);
  });

  it("skips wrapped sustainability notes, stops at learning objectives and merges I/II parts", () => {
    const t = parseSyllabus(
      [
        "SESSION 3 (ASYNCHRONOUS)", "Sustainability Topics: Understand how companies improve supply chain", "sustainability through coordination.",
        "Supply Chain Coordination I", "Learning Objectives:", "Explain why coordination failures arise.",
        "SESSION 4 (LIVE IN-PERSON)", "Sustainability Topics: Same note.", "Supply Chain Coordination II", "Learning Objectives:",
      ].join("\n"),
    );
    expect(t.map((x) => x.name)).toEqual(["Supply Chain Coordination"]);
  });

  it("ignores page furniture between a session header and its title", () => {
    const t = parseSyllabus(["SESSION 9 (LIVE IN-PERSON)", "7", "Edited by Documentation", "27th May 2026", "Resources and capabilities"].join("\n"));
    expect(t.map((x) => x.name)).toEqual(["Resources and capabilities"]);
  });
});
