/**
 * Turns an IE syllabus PDF into a course catalogue entry (prisma/courses/*.json)
 * that `npm run db:seed` loads. Only course metadata and the session programme
 * are kept; staff bios, emails and grading details are dropped.
 *
 *   npx tsx scripts/import-syllabus.ts path/to/syllabus.pdf [--name "Course name"]
 */
import fs from "fs";
import path from "path";
import { pdfToText } from "../src/lib/pdf";
import { parseSyllabus, programmeSection } from "../src/lib/syllabus";

const PARTICLES = new Set(["de", "del", "la", "las", "los", "y", "van", "von", "da", "di"]);
const titleCase = (s: string) =>
  s
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i > 0 && PARTICLES.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ")
    .replace(/^Mª/i, "Mª");

async function main() {
  const [file, ...rest] = process.argv.slice(2);
  if (!file) throw new Error("Usage: tsx scripts/import-syllabus.ts <syllabus.pdf> [--name \"Course name\"]");
  const text = await pdfToText(fs.readFileSync(file));
  if (!text) throw new Error("No text layer in this PDF.");
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // Course name: the ALL-CAPS lines before the degree line.
  const degreeIdx = lines.findIndex((l) => /^Grado en|^Bachelor|^Master/i.test(l));
  const nameLines = lines.slice(0, degreeIdx).filter((l) => /[A-Z]{3}/.test(l) && !/[a-z]/.test(l));
  const nameFlag = rest.indexOf("--name");
  const name = nameFlag >= 0 ? rest[nameFlag + 1] : titleCase(nameLines.join(" ")).replace(/\b(And|In|Of|For|The|To)\b/g, (w) => w.toLowerCase());

  // Code + term from e.g. "BBA SEP-2026 SCIM-NBA.3.M.L" (section suffix dropped: a course spans sections).
  const m = text.match(/\b(JAN|FEB|SEP|OCT)-(\d{4})\s+([A-Za-z]+-[A-Z]+\.\d+)/);
  if (!m) throw new Error("Couldn't find the course code line (e.g. 'SEP-2026 SCIM-NBA.3.M.L').");
  const term = `${m[2]}-${m[1] === "JAN" || m[1] === "FEB" ? "SPRING" : "FALL"}`;
  const code = m[3].toUpperCase();

  const professors = [...text.matchAll(/^Professor:\s*(.+)$/gim)].map((p) => titleCase(p[1].trim()));
  const field = (label: string) => text.match(new RegExp(`^${label}:?\\s+(.+)$`, "im"))?.[1].trim();
  const programme = programmeSection(text)
    .split("\n")
    .filter((l) => !/^\s*(?:\d{1,3}|Edited by .*|\d{1,2}(?:st|nd|rd|th) [A-Za-z]+ \d{4})\s*$/.test(l))
    .join("\n");
  if (/@/.test(programme)) throw new Error("Programme section still contains an email address; not writing it.");

  const description = [
    field("Degree course") && `${field("Degree course")!.toLowerCase()} year`,
    field("Category")?.toLowerCase(),
    field("Number of credits") && `${Number(field("Number of credits"))} ECTS`,
    field("Number of sessions") && `${field("Number of sessions")} sessions`,
    field("Area") && `${field("Area")} area`,
  ]
    .filter(Boolean)
    .join(", ");

  const entry = { code, name, description: description.charAt(0).toUpperCase() + description.slice(1), term, professors, syllabusProgramme: programme };
  const out = path.join("prisma", "courses", `${code.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(entry, null, 2) + "\n");
  const topics = parseSyllabus(programme);
  console.log(`${out}: ${code} "${name}" (${term}, ${professors.join(", ")}): ${topics.length} topics`);
  topics.forEach((t, i) => console.log(`  ${i + 1}. ${t.name}`));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
