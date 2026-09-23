import { excerpt, overlapScore, tokenize } from "../text";
import type { AIProvider, AnswerInput, GradeInput, QuestionDraft, QuestionInput, ReteachInput, TopicDraft, TopicInput } from "./types";

/**
 * Deterministic stand-in used when no API key is configured (local dev,
 * tests, CI). It keeps every flow working end to end; its output is
 * obviously templated, and is still stored as AI_DRAFTED.
 */
export class OfflineProvider implements AIProvider {
  readonly name = "offline";

  async answerQuestion(i: AnswerInput) {
    const ranked = i.entries
      .map((e) => ({ e, s: overlapScore(i.question, `${e.title} ${e.body}`) }))
      .filter((x) => x.s >= 0.3)
      .sort((a, b) => b.s - a.s);
    const topic = i.topics.map((t) => ({ t, s: overlapScore(t, i.question) })).sort((a, b) => b.s - a.s)[0];
    const live = i.liveRisk
      ? "Heads up: this might be part of a graded assignment, so here's the method rather than a worked solution.\n\n"
      : "";
    if (ranked.length > 0) {
      const top = ranked[0].e;
      return {
        answer: `${live}The community already covered this in "${top.title}":\n\n${excerpt(top.body, 600)}\n\nIf that doesn't fully answer it, reply with what's still unclear.`,
        usedEntryIds: [top.id],
        topic: topic && topic.s > 0 ? topic.t : null,
      };
    }
    return {
      answer: `${live}There's no community explanation for this yet, so here's a starting point (AI draft, unverified):\n\n1. Pin down the key terms in the question and write their definitions from the course notes.\n2. Find the general principle or formula they connect to, and work through a simpler example with your own numbers.\n3. Apply the same steps to your case and check that each step follows from the one before.\n\nClassmates: please confirm, correct or expand this so it can be added to the study guide.`,
      usedEntryIds: [],
      topic: topic && topic.s > 0 ? topic.t : null,
    };
  }

  async extractTopics(i: TopicInput): Promise<TopicDraft[]> {
    const names: string[] = [];
    if (i.syllabusText) {
      for (const raw of i.syllabusText.split(/\r?\n/)) {
        const line = raw.trim();
        const m =
          line.match(/^(?:week|session|unit|module|lecture|topic|chapter)\s*\d+\s*[:.\-–—)]\s*(.+)$/i) ??
          line.match(/^(?:\d+[.)]|[-*•])\s+(.+)$/);
        if (m) {
          const name = m[1].replace(/\s*\(.*?\)\s*$/, "").replace(/[.;:]$/, "").trim();
          if (name.length >= 3 && name.length <= 80 && !names.some((n) => n.toLowerCase() === name.toLowerCase())) names.push(name);
        }
      }
    }
    if (names.length === 0) {
      const base = i.courseName;
      names.push(`Foundations of ${base}`, "Core concepts and definitions", "Key models and methods", "Applications and case studies", "Synthesis and exam review");
    }
    return names.slice(0, 15).map((name, idx) => ({
      name,
      summary: `Covers ${name.toLowerCase()} in ${i.courseName}.`,
      prerequisites: idx > 0 ? [names[idx - 1]] : [],
    }));
  }

  async generateQuestions(i: QuestionInput): Promise<QuestionDraft[]> {
    const t = i.topic.name;
    const templates: QuestionDraft[] = [
      {
        type: "MULTIPLE_CHOICE",
        prompt: `Which statement best describes the focus of "${t}"?`,
        choices: [i.topic.summary ?? `The central ideas of ${t}`, "An unrelated administrative procedure", "A purely historical footnote", "None of the course material"],
        answer: i.topic.summary ?? `The central ideas of ${t}`,
        explanation: `"${t}" is about: ${i.topic.summary ?? "its central ideas"}.`,
        difficulty: 1,
      },
      {
        type: "SHORT_ANSWER",
        prompt: `In one or two sentences, explain the main idea of ${t}.`,
        choices: null,
        answer: i.topic.summary ?? t,
        explanation: `A good answer mentions: ${i.topic.summary ?? t}.`,
        difficulty: 2,
      },
      {
        type: "MULTIPLE_CHOICE",
        prompt: `You're reviewing ${t}. What's the most effective first step?`,
        choices: ["Restate the core definitions in your own words", "Memorise a past exam answer", "Skip to the hardest problem", "Re-read the slides without taking notes"],
        answer: "Restate the core definitions in your own words",
        explanation: "Active recall of definitions builds the base the rest of the topic depends on.",
        difficulty: 2,
      },
      {
        type: "SHORT_ANSWER",
        prompt: `Give one concrete example that illustrates ${t}.`,
        choices: null,
        answer: t,
        explanation: `Any example that clearly applies ${t} counts.`,
        difficulty: 3,
      },
      ...i.entries.slice(0, 2).map<QuestionDraft>((e) => ({
        type: "SHORT_ANSWER",
        prompt: `According to the community explanation "${e.title}", what is the key point?`,
        choices: null,
        answer: excerpt(e.body, 160),
        explanation: excerpt(e.body, 400),
        difficulty: 2,
      })),
    ];
    const avoid = new Set(i.avoidPrompts);
    return templates.filter((q) => !avoid.has(q.prompt)).slice(0, i.count);
  }

  async reteach(i: ReteachInput) {
    const approach = ["a concrete example", "an analogy", "a step-by-step breakdown"][i.alreadySeen.length % 3];
    const miss = i.mistake
      ? `You answered "${excerpt(i.mistake.response, 80)}" but the expected answer was "${excerpt(i.mistake.correctAnswer, 120)}". `
      : "";
    return `${miss}Let's try ${approach} for ${i.topic.name}. Start from the definition (${i.topic.summary ?? i.topic.name}), then ask yourself what changes if you vary one input at a time. Write the chain of reasoning out in full; the step where you hesitate is usually the misconception. (AI draft, offline mode.)`;
  }

  async gradeShortAnswer(i: GradeInput) {
    const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
    if (norm(i.response) === norm(i.expected)) return true;
    const exp = new Set(tokenize(i.expected));
    if (exp.size === 0) return false;
    const got = new Set(tokenize(i.response));
    let hit = 0;
    for (const t of exp) if (got.has(t)) hit++;
    return hit / exp.size >= 0.5;
  }

  async suggestTopicTags(i: { title: string; text: string; topics: string[] }) {
    const doc = `${i.title} ${i.text}`;
    return i.topics.filter((t) => overlapScore(t, doc) >= 0.5);
  }
}
