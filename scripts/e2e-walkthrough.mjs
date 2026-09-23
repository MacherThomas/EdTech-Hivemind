/**
 * End-to-end walkthrough of the core loop against a running app seeded with
 * SEED_DEMO=1 on a fresh database. Reads sign-in codes from the server log
 * (EMAIL_TRANSPORT=console).
 *
 *   OUT=./e2e-out SERVER_LOG=./server.log node scripts/e2e-walkthrough.mjs
 */
import { chromium } from "playwright";
import fs from "fs";

const SP = process.env.OUT ?? "./e2e-out";
const SERVER_LOG = process.env.SERVER_LOG ?? "./server.log";
fs.mkdirSync(SP, { recursive: true });
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a) => console.log("•", ...a);
const shot = async (page, name) => page.screenshot({ path: `${SP}/shot-${name}.png`, fullPage: true });

function latestCode(email) {
  const txt = fs.readFileSync(SERVER_LOG, "utf8");
  const re = new RegExp(`to=${email.replace(/[.+]/g, "\\$&")}[\\s\\S]*?sign-in code is (\\d{6})`, "g");
  let m, last = null;
  while ((m = re.exec(txt))) last = m[1];
  return last;
}

async function login(browser, email, name) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/signin`);
  await page.fill("#email", email);
  await page.click("button:has-text('Send sign-in code')");
  await page.waitForSelector("#code");
  await page.waitForTimeout(300);
  await page.fill("#code", latestCode(email));
  await page.click("button:has-text('Sign in')");
  await page.waitForURL((u) => !u.pathname.startsWith("/signin"));
  if (page.url().includes("/welcome")) {
    await page.fill("#displayName", name);
    await page.click("button:has-text('Continue')");
    await page.waitForURL(/\/courses/);
  }
  return { ctx, page };
}

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  // 1. Signup rules
  const p0 = await (await browser.newContext()).newPage();
  await p0.goto(`${BASE}/signin`);
  for (const bad of ["info@ie.edu", "someone@gmail.com"]) {
    await p0.fill("#email", bad);
    await p0.click("button:has-text('Send sign-in code')");
    await p0.waitForTimeout(1200);
    log(`signup ${bad}:`, (await p0.textContent(".notice-error")).trim());
  }
  await shot(p0, "01-signin-rejected");

  // 2. New student signs up
  const { page } = await login(browser, "new.student@student.ie.edu", "Nora");
  log("signed up; landed on", new URL(page.url()).pathname);
  await page.fill("#q", "ECON");
  await page.click("button:has-text('Search')");
  await page.click("text=Principles of Microeconomics");
  await page.waitForURL(/chat/);
  await page.click("button:has-text(\"I'm taking this course\")");
  await page.waitForSelector("text=Enrolled (self-reported)");
  log("enrolled in ECON-101");

  // 3. AI answers first, grounded on community knowledge
  await page.fill("#title", "Why is demand more elastic in the long run than short run?");
  await page.fill("#body", "I understand elasticity but not why time matters for demand.");
  await page.click("button:has-text('Post question')");
  await page.waitForURL(/chat\/c/);
  await page.waitForSelector("text=Study assistant", { timeout: 20000 });
  const grounded = await page.locator("text=Based on community entries").count();
  log("AI answer posted; grounded on community entries:", grounded > 0);
  await shot(page, "02-thread-ai-answer");
  const threadUrl = page.url();

  // Nora adds her own answer; three classmates upvote it → auto-promotion
  await page.fill("#reply-body", "Short run: habits and few substitutes. Long run: people switch to substitutes (e.g. public transport when fuel is expensive), so the quantity response grows.");
  await page.click("button:has-text('Post answer')");
  await page.waitForSelector("text=Reply posted");
  for (const [email, name] of [["demo.ben@student.ie.edu"], ["demo.chloe@student.ie.edu"], ["demo.diego@student.ie.edu"]]) {
    const s = await login(browser, email, name);
    await s.page.goto(threadUrl);
    await s.page.locator("article", { hasText: "public transport" }).getByRole("button", { name: "Helpful", exact: true }).click();
    await s.page.waitForTimeout(700);
    await s.ctx.close();
  }
  await page.reload();
  const promoted = await page.locator("article", { hasText: "public transport" }).locator("text=Added to the study guide").count();
  log("Nora's answer promoted to knowledge base after 3 upvotes:", promoted > 0);
  await shot(page, "03-thread-promoted");

  // 4. Integrity: question about a possibly-live problem set
  await page.goto(threadUrl.replace(/\/chat\/.*/, "/chat"));
  await page.fill("#title", "How do I do problem set 3 question 1?");
  await page.fill("#body", "It's due Friday, what is the answer for the monopolist output?");
  await page.selectOption("#materialId", { label: "Problem set 3" });
  await page.click("button:has-text('Post question')");
  await page.waitForSelector("text=Study assistant", { timeout: 20000 });
  const note = await page.locator(".message-ai .notice-warning").first().textContent();
  log("integrity note on live-assignment question:", note?.trim().slice(0, 110));
  await shot(page, "04-integrity-note");

  // 5. Materials
  const courseBase = threadUrl.replace(/\/chat\/.*/, "");
  await page.goto(`${courseBase}/materials`);
  log("materials gated badges:", await page.locator(".badge-gated").count(), "| retired badges:", await page.locator("text=Retired: OK for practice").count());
  fs.writeFileSync(`${SP}/notes.md`, "# Elasticity notes\nPrice elasticity of demand measures responsiveness of quantity demanded to price. Midpoint formula.");
  await page.setInputFiles("#file", `${SP}/notes.md`);
  await page.fill("#m-title", "My elasticity notes");
  await page.click("button:has-text('Upload')");
  await page.waitForSelector(".notice-success");
  log("upload:", (await page.textContent(".notice-success")).trim());
  await shot(page, "05-materials");

  // 6. Study guide: plan → session → answer → adapt
  await page.goto(`${courseBase}/guide`);
  await page.fill("#anchorLabel", "Midterm");
  const d = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
  await page.fill("#anchorDate", d);
  await page.click("button:has-text('Build plan')");
  await page.waitForURL(/guide\/plan\//);
  log("plan sessions:", await page.locator(".timeline li").count());
  await shot(page, "06-plan");
  await page.click("a.btn-primary:has-text('Start')");
  await page.waitForURL(/session\//);
  const qs = page.locator("ol.stack > li.card");
  const n = await qs.count();
  for (let i = 0; i < n; i++) {
    const q = qs.nth(i);
    if (await q.locator("input[type=radio]").count()) {
      await q.locator("input[type=radio]").last().check(); // pick a (likely) wrong option
    } else {
      await q.locator("textarea, input[type=text]").first().fill("no idea");
    }
    await q.locator("button:has-text('Check answer')").click();
    await q.locator(".notice").first().waitFor();
  }
  const reteach = await page.locator("text=Here's another way to think about it").count();
  log(`answered ${n} questions; re-teach explanations shown:`, reteach);
  await shot(page, "07-session");
  await page.click("button:has-text('Finish session')");
  await page.waitForURL(/adapted=1/);
  log("after adaptation, session kinds:", (await page.locator(".timeline .badge").allTextContents()).join(", "));
  await shot(page, "08-plan-adapted");

  // 7. Tutors + booking
  await page.goto(`${courseBase}/tutors`);
  log("tutors listed:", await page.locator("ol.list-plain > li").count());
  await page.click("text=See times & book");
  await page.locator("input[name=slot]").first().check();
  await page.fill("#note", "Elasticity practice");
  await page.click("button:has-text('Request session')");
  await page.waitForURL(/tutoring\?booked=/);
  log("booking status:", (await page.locator(".card .badge").first().textContent()).trim());
  await shot(page, "09-tutoring-student");

  // Tutor confirms
  const ana = await login(browser, "demo.ana@student.ie.edu");
  await ana.page.goto(`${BASE}/tutoring`);
  await ana.page.click("button:has-text('Confirm')");
  await ana.page.waitForTimeout(800);
  await ana.page.reload();
  log("after tutor confirms:", (await ana.page.locator(".card .badge").first().textContent()).trim());
  await ana.page.goto(`${BASE}/`);
  await shot(ana.page, "10-dashboard-ana");

  // Student cancels (>24h → refund)
  await page.goto(`${BASE}/tutoring`);
  await page.click("summary:has-text('Cancel')");
  await page.click("button:has-text('Confirm cancellation')");
  await page.waitForSelector("text=Refunded in full");
  log("cancel:", (await page.locator("li.card p", { hasText: "Cancelled" }).first().textContent()).trim());
  await shot(page, "09b-cancelled");

  // Knowledge base
  await page.goto(`${courseBase}/knowledge`);
  log("knowledge entries:", await page.locator("li.card").count());
  await shot(page, "11-knowledge");
  await page.goto(`${BASE}/`);
  await shot(page, "12-dashboard");
} finally {
  await browser.close();
}
