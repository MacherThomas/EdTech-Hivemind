/**
 * Deterministic syllabus parser (no AI). Recognises:
 *  - one-line topics: "Week 3: Elasticity", "Session 2 - Game theory",
 *    "1. Supply and demand", "- Market failures"
 *  - IE's layout: a header line ("SESSION 4 (LIVE IN-PERSON)",
 *    "SESSIONS 13 - 14 (ASYNCHRONOUS)") followed by a block describing the
 *    session. The title is the block's first line that isn't a sustainability
 *    note, a bullet, a reading or logistics. ALL-CAPS headings are
 *    sentence-cased and wrapped titles are joined.
 * Sessions that aren't topics (exercises, simulations, "Applying …", classes,
 * guest speakers, presentations, reviews, exams) are skipped, "Topic 3:"
 * prefixes are stripped, and "… I" / "… II" parts are merged. Each topic builds
 * on the previous one.
 */
export type ParsedTopic = { name: string; summary: string | null; prerequisites: string[] };

const HEADER_ONLY = /^(?:sessions?|weeks?|units?|modules?|lectures?|class(?:es)?)\s*\d+(?:\s*[-–—]\s*\d+)?\s*(?:\([^)]*\))?\s*$/i;
const ONE_LINE = /^(?:week|session|unit|module|lecture|topic|chapter|class)\s*\d+\s*[:.\-–—)]\s*(.+)$/i;
const LIST_ITEM = /^(?:\d+[.)]|[-*•])\s+(.+)$/;
/** PDF page furniture: page numbers, "Edited by …" footers, dates, page separators. */
const NOISE = /^(?:\d{1,3}|edited by .*|\d{1,2}(?:st|nd|rd|th) [a-z]+ \d{4}|=== page ===|page \d+(?: of \d+)?)$/i;
/** Lines in a session block that are readings, logistics or objectives, never the title. */
const NOT_TITLE =
  /^(?:book chapters?|chapters?\s+\d|article|practical case|case\b|reading|economics primer|paragraph|additional notes|instructions|source|games? & simulations?|multimedia|video|technical note|assignment \d|[*=]{3,})/i;
/** Session titles that are activities or admin rather than course topics. */
const NOT_TOPIC =
  /^(?:exercise|simulation|applying|application|game theory\s*[-–—]\s*applied|guest speaker|case (?:study )?competition|wrap[- ]?up|course wrap|review|final|mid-?term|exam|quiz|introduction(?: to the course)?$|presentations?|group presentations?|no class|holiday|class|computer class|discussion|assignment|main course takeaways|takeaways|lecture \d)\b/i;
const NOT_TOPIC_ANYWHERE = /\bpractical exercises?\b/i;
const ACRONYMS = new Set(["OLS", "HR", "HRM", "HCM", "AI", "ABC", "KPI", "ESG", "CSR", "ROI", "ERP", "CPFR", "GDP", "US", "EU"]);

function isCapsHeading(s: string) {
  return /[A-Z]{2}/.test(s) && !/[a-z]/.test(s) && s.replace(/[^A-Z]/g, "").length >= 4;
}

function sentenceCase(s: string) {
  return s
    .split(/\s+/)
    .map((w, i) => {
      const bare = w.replace(/[^A-Za-z]/g, "");
      if (ACRONYMS.has(bare) || (bare.length > 1 && !/[AEIOUY]/.test(bare))) return w; // keep acronyms like SLRM
      const lower = w.toLowerCase();
      return i === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
    })
    .join(" ");
}

function clean(s: string) {
  let name = s
    .replace(/^(?:topic|unit|lecture|module|part)\s*\d+\s*[:.\-–—]\s*/i, "")
    .replace(/\s*\(.*?\)\s*$/, "")
    .replace(/\s+/g, " ")
    .replace(/[.;:,]+$/, "")
    .trim();
  if (isCapsHeading(name)) name = sentenceCase(name);
  return name;
}

/** "Supply Chain Coordination II" and "… I" are the same topic. */
function baseName(name: string) {
  return name.replace(/\s+(?:I{1,3}|IV|V|part \d+|\d)$/i, "").trim();
}

export function parseSyllabus(text: string, max = 30): ParsedTopic[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !NOISE.test(l));
  const names: string[] = [];
  const add = (raw: string) => {
    const name = baseName(clean(raw));
    if (name.length < 3 || name.length > 90 || NOT_TOPIC.test(name) || NOT_TOPIC_ANYWHERE.test(name)) return;
    if (!names.some((n) => n.toLowerCase() === name.toLowerCase())) names.push(name);
  };

  for (let i = 0; i < lines.length; i++) {
    if (!HEADER_ONLY.test(lines[i])) {
      const m = lines[i].match(ONE_LINE) ?? lines[i].match(LIST_ITEM);
      if (m) add(m[1]);
      continue;
    }
    // Session block: everything up to the next session header.
    let end = i + 1;
    while (end < lines.length && !HEADER_ONLY.test(lines[end])) end++;
    const block = lines.slice(i + 1, end);
    i = end - 1;

    const candidates: number[] = [];
    let inSustainabilityNote = false;
    for (let k = 0; k < block.length; k++) {
      const line = block[k];
      if (/^sustainability topics?\b/i.test(line)) {
        inSustainabilityNote = true;
        continue;
      }
      if (inSustainabilityNote && /^[a-z]/.test(line)) continue; // wrapped note
      inSustainabilityNote = false;
      if (/^learning objectives?\b/i.test(line)) break;
      if (/^[-–•]\s/.test(line) || NOT_TITLE.test(line)) continue;
      candidates.push(k);
    }
    if (candidates.length === 0) continue;
    const k = candidates[0];
    let title = block[k];
    const next = block[k + 1];
    if (!isCapsHeading(title) && next && /^[a-z]/.test(next) && !NOT_TITLE.test(next)) title += ` ${next}`;
    add(title);
  }
  return names.slice(0, max).map((name, i) => ({ name, summary: null, prerequisites: i > 0 ? [names[i - 1]] : [] }));
}

/**
 * Data minimisation for stored syllabi: keep only the programme/schedule
 * section when one is recognisable (drops staff bios, contact details, etc.).
 */
export function programmeSection(text: string) {
  const start = text.search(/^\s*(?:PROGRAM(?:ME)?|SCHEDULE|COURSE (?:SCHEDULE|OUTLINE)|SESSIONS?)\s*$/im);
  if (start === -1) return text;
  const rest = text.slice(start);
  // Headings must fill the whole line, so a wrapped "(See\nBibliography)" doesn't end the section.
  const end = rest.search(/^\s*(?:EVALUATION|ASSESSMENT|GRADING|BIBLIOGRAPHY)(?:\s+[A-Za-z]+)*\s*$/im);
  return (end === -1 ? rest : rest.slice(0, end)).trim();
}
