const STOP = new Set(
  "a an and are as at be by can do does for from how i in is it its of on or that the this to was what when where which who why will with you your me my we our about into than then there these those".split(" "),
);

export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

/** Cheap relevance score in [0,1]: share of query terms present in the doc. */
export function overlapScore(query: string, doc: string) {
  const q = new Set(tokenize(query));
  if (q.size === 0) return 0;
  const d = new Set(tokenize(doc));
  let hit = 0;
  for (const t of q) if (d.has(t) || [...d].some((x) => x.length > 4 && (x.startsWith(t) || t.startsWith(x)))) hit++;
  return hit / q.size;
}

export function excerpt(s: string, max = 280) {
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : clean.slice(0, max - 1).trimEnd() + "…";
}
