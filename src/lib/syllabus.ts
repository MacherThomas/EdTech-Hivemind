/**
 * Deterministic syllabus parser (no AI). Picks topic lines such as
 * "Week 3: Elasticity", "Session 2 - Game theory", "1. Supply and demand" or
 * "- Market failures", in order, each building on the previous one.
 */
export type ParsedTopic = { name: string; summary: string | null; prerequisites: string[] };

export function parseSyllabus(text: string, max = 30): ParsedTopic[] {
  const names: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const m =
      line.match(/^(?:week|session|unit|module|lecture|topic|chapter|class)\s*\d+\s*[:.\-–—)]\s*(.+)$/i) ??
      line.match(/^(?:\d+[.)]|[-*•])\s+(.+)$/);
    if (!m) continue;
    const name = m[1].replace(/\s*\(.*?\)\s*$/, "").replace(/[.;:]$/, "").trim();
    if (name.length >= 3 && name.length <= 80 && !names.some((n) => n.toLowerCase() === name.toLowerCase())) names.push(name);
  }
  return names.slice(0, max).map((name, i) => ({ name, summary: null, prerequisites: i > 0 ? [names[i - 1]] : [] }));
}
