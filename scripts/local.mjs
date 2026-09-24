/**
 * One-command local run: `npm run local`.
 * Starts a private PostgreSQL (stored in ./.local-db, nothing to install),
 * applies migrations, loads the courses + demo data, and starts the site at
 * http://localhost:3000. Stop with Ctrl+C. For local development only.
 */
import EmbeddedPostgres from "embedded-postgres";
import { spawn, spawnSync } from "child_process";
import fs from "fs";

const PORT = 5433;
const DATABASE_URL = `postgresql://hivemind:hivemind@localhost:${PORT}/hivemind`;
const env = { ...process.env, DATABASE_URL, EMAIL_TRANSPORT: "console", AI_ENABLED: "false", SEED_DEMO: "1" };

const pg = new EmbeddedPostgres({ databaseDir: "./.local-db", user: "hivemind", password: "hivemind", port: PORT, persistent: true });

const step = (msg) => console.log(`\n▶ ${msg}`);
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: "inherit", env, shell: process.platform === "win32" });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed`);
};

async function main() {
  if (!fs.existsSync("./.local-db/PG_VERSION")) {
    step("Setting up the local database (first run only)…");
    await pg.initialise();
  }
  step("Starting the database…");
  await pg.start();
  try {
    await pg.createDatabase("hivemind");
  } catch {
    /* already exists */
  }
  step("Updating the database structure…");
  run("npx", ["prisma", "migrate", "deploy"]);
  step("Loading courses and demo content…");
  run("npx", ["tsx", "prisma/seed.ts"]);

  // Sanity check: sign-up only works if the email-domain allowlist is loaded.
  const client = pg.getPgClient("hivemind");
  await client.connect();
  const { rows } = await client.query('SELECT domain FROM "SchoolDomain" WHERE active');
  await client.end();
  if (rows.length === 0) throw new Error("No sign-up email domains were loaded. Please copy this window's text and share it.");
  console.log(`  Sign-up allowed for: ${rows.map((r) => "@" + r.domain).join(", ")}`);

  console.log(`
────────────────────────────────────────────────────────────
  Open http://localhost:3000 in your browser.

  Sign in with any @student.ie.edu address, e.g. demo.ana@student.ie.edu
  (a demo tutor). No real email is sent: the 6-digit sign-in code
  appears right here in this window, after "sign-in code is".

  Stop the site with Ctrl+C.
────────────────────────────────────────────────────────────
`);
  const next = spawn("npx", ["next", "dev", "-p", "3000"], { stdio: "inherit", env, shell: process.platform === "win32" });
  const stop = async () => {
    next.kill("SIGINT");
    await pg.stop().catch(() => undefined);
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  next.on("exit", async () => {
    await pg.stop().catch(() => undefined);
    process.exit(0);
  });
}

main().catch(async (e) => {
  console.error(`\n✖ ${e.message}`);
  await pg.stop().catch(() => undefined);
  process.exit(1);
});
