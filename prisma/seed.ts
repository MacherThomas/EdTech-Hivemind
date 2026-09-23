/**
 * Seeds institution data (always) and optional demo content (SEED_DEMO=1).
 *
 * The domain allowlist below is a starting point. The exact set of valid IE
 * email domains must be confirmed with IE (docs/CHECKPOINTS.md #3). It lives in
 * the SchoolDomain table, so changing it needs no code change.
 */
import { PrismaClient } from "@prisma/client";
import { recomputeReputation } from "../src/jobs/reputation";
import { buildTopicStructure } from "../src/jobs/topics";

const db = new PrismaClient();

async function main() {
  const ie = await db.school.upsert({
    where: { slug: "ie-university" },
    update: {},
    create: { slug: "ie-university", name: "IE University", timezone: "Europe/Madrid" },
  });
  for (const domain of ["ie.edu", "student.ie.edu", "alumni.ie.edu"]) {
    await db.schoolDomain.upsert({ where: { domain }, update: {}, create: { domain, schoolId: ie.id } });
  }
  const terms = [
    { code: "2025-FALL", name: "Fall 2025", startsOn: "2025-09-01", endsOn: "2025-12-22" },
    { code: "2026-SPRING", name: "Spring 2026", startsOn: "2026-01-12", endsOn: "2026-05-31" },
    { code: "2026-FALL", name: "Fall 2026", startsOn: "2026-09-01", endsOn: "2026-12-22" },
    { code: "2027-SPRING", name: "Spring 2027", startsOn: "2027-01-11", endsOn: "2027-05-31" },
  ];
  for (const t of terms) {
    await db.term.upsert({
      where: { schoolId_code: { schoolId: ie.id, code: t.code } },
      update: {},
      create: { schoolId: ie.id, code: t.code, name: t.name, startsOn: new Date(t.startsOn), endsOn: new Date(t.endsOn) },
    });
  }
  console.log("Seeded IE University, domains and terms.");
  if (process.env.SEED_DEMO === "1") await demo(ie.id);
}

/** Fictional demo content so every section has something to show locally. */
async function demo(schoolId: string) {
  const fall26 = await db.term.findUniqueOrThrow({ where: { schoolId_code: { schoolId, code: "2026-FALL" } } });
  const fall25 = await db.term.findUniqueOrThrow({ where: { schoolId_code: { schoolId, code: "2025-FALL" } } });
  const prof = await db.professor.upsert({
    where: { schoolId_name: { schoolId, name: "Prof. Demo Garcia" } },
    update: {},
    create: { schoolId, name: "Prof. Demo Garcia" },
  });

  const micro = await db.course.upsert({
    where: { schoolId_code: { schoolId, code: "ECON-101" } },
    update: {},
    create: {
      schoolId,
      code: "ECON-101",
      name: "Principles of Microeconomics",
      description: "Supply and demand, elasticity, consumer and producer theory, market structures.",
      syllabusText: [
        "Week 1: Supply and demand",
        "Week 2: Elasticity",
        "Week 3: Consumer choice and utility",
        "Week 4: Production and costs",
        "Week 5: Perfect competition",
        "Week 6: Monopoly",
        "Week 7: Oligopoly and game theory",
        "Week 8: Market failures and externalities",
      ].join("\n"),
    },
  });
  await db.course.upsert({
    where: { schoolId_code: { schoolId, code: "CS-210" } },
    update: {},
    create: { schoolId, code: "CS-210", name: "Data Structures and Algorithms" },
  });

  const cur = await db.courseOffering.upsert({
    where: { courseId_termId: { courseId: micro.id, termId: fall26.id } },
    update: {},
    create: { courseId: micro.id, termId: fall26.id, professors: { connect: [{ id: prof.id }] } },
  });
  const old = await db.courseOffering.upsert({
    where: { courseId_termId: { courseId: micro.id, termId: fall25.id } },
    update: {},
    create: { courseId: micro.id, termId: fall25.id, professors: { connect: [{ id: prof.id }] } },
  });
  await buildTopicStructure({ courseId: micro.id });
  const topics = await db.topic.findMany({ where: { courseId: micro.id }, orderBy: { position: "asc" } });
  const elasticity = topics.find((t) => t.name === "Elasticity")!;

  const names = ["Ana", "Ben", "Chloé", "Diego", "Elif", "Farah"];
  const users = [];
  for (const n of names) {
    const email = `demo.${n.toLowerCase().normalize("NFKD").replace(/[^a-z]/g, "")}@student.ie.edu`;
    const u = await db.user.upsert({
      where: { email },
      update: {},
      create: { email, emailVerifiedAt: new Date(), schoolId, displayName: `${n} (demo)` },
    });
    await db.enrollment.upsert({
      where: { userId_courseId: { userId: u.id, courseId: micro.id } },
      update: {},
      create: { userId: u.id, courseId: micro.id, offeringId: cur.id },
    });
    users.push(u);
  }
  const [ana, ben, chloe, diego, elif] = users;

  if ((await db.chatThread.count({ where: { courseId: micro.id } })) === 0) {
    const questions = [
      { title: "Why is demand more elastic in the long run?", body: "Lecture said long-run demand is more elastic but I don't get the intuition.", asker: ben },
      { title: "How do I tell if a good is elastic from the midpoint formula?", body: "I computed -1.4. Is that elastic or inelastic?", asker: chloe },
      { title: "What makes cross-price elasticity negative?", body: "Is negative always complements?", asker: diego },
    ];
    const answers = [
      "Over time consumers find substitutes and adjust habits (e.g. buying a more efficient car when fuel prices rise), so the quantity response to a price change grows. More substitutes + more time = more elastic.",
      "Take the absolute value: |−1.4| > 1, so demand is elastic. A 1% price rise cuts quantity demanded by about 1.4%, so total revenue falls when price rises.",
      "A negative cross-price elasticity means that when the price of good B rises, demand for good A falls, which is the definition of complements (e.g. printers and ink).",
    ];
    for (const [i, q] of questions.entries()) {
      const t = await db.chatThread.create({
        data: { courseId: micro.id, offeringId: cur.id, topicId: elasticity.id, authorId: q.asker.id, title: q.title, body: q.body },
      });
      const m = await db.chatMessage.create({ data: { threadId: t.id, authorId: ana.id, origin: "COMMUNITY", body: answers[i], score: 4 } });
      for (const voter of [ben, chloe, diego, elif].filter((v) => v.id !== q.asker.id)) {
        await db.messageVote.create({ data: { userId: voter.id, messageId: m.id, value: 1 } });
      }
      await db.chatMessage.update({ where: { id: m.id }, data: { score: 3 } });
      await db.chatThread.update({ where: { id: t.id }, data: { status: "RESOLVED", resolvedMessageId: m.id, resolvedById: q.asker.id } });
      await db.knowledgeEntry.create({
        data: {
          courseId: micro.id, topicId: elasticity.id, title: q.title, body: answers[i], origin: "COMMUNITY",
          verification: "COMMUNITY_VERIFIED", source: "CHAT_PROMOTION", contributorId: ana.id, promotedFromMessageId: m.id,
        },
      });
      await db.chatMessage.update({ where: { id: m.id }, data: { verification: "COMMUNITY_VERIFIED" } });
    }
    await db.material.create({
      data: {
        courseId: micro.id, uploaderId: ana.id, title: "Fall 2025 midterm (retired)", kind: "PAST_EXAM", assessmentStatus: "RETIRED",
        offeringId: old.id, professorId: prof.id, storageKey: "demo/none.txt", fileName: "midterm-2025.txt", mimeType: "text/plain", sizeBytes: 0,
        extractedText: "Q1. The price of coffee rises 10% and quantity demanded falls 5%. Compute the price elasticity of demand.",
        topics: { connect: [{ id: elasticity.id }] },
      },
    });
    await db.material.create({
      data: {
        courseId: micro.id, uploaderId: ben.id, title: "Problem set 3", kind: "PROBLEM_SET", assessmentStatus: "POSSIBLY_LIVE",
        offeringId: cur.id, professorId: prof.id, storageKey: "demo/none.txt", fileName: "pset3.txt", mimeType: "text/plain", sizeBytes: 0,
        extractedText: "Problem set 3 (due Friday): 1. Derive the monopolist's profit-maximising output...",
        topics: { connect: [{ id: topics.find((t) => t.name === "Monopoly")!.id }] },
      },
    });
  }
  for (const u of users) await recomputeReputation({ userId: u.id, courseId: micro.id });

  // Ana has earned tutor status; give her a listing so booking can be demoed.
  const profile = await db.tutorProfile.upsert({
    where: { userId: ana.id },
    update: {},
    create: { userId: ana.id, bio: "Economics & Philosophy, 3rd year. Happy to walk through problem-solving methods.", payoutProvider: "mock", payoutAccountRef: "mock_acct_demo", payoutStatus: "ACTIVE" },
  });
  await db.tutorCourseRate.upsert({
    where: { tutorId_courseId: { tutorId: profile.id, courseId: micro.id } },
    update: {},
    create: { tutorId: profile.id, courseId: micro.id, priceCents: 2000, sessionMinutes: 60 },
  });
  if ((await db.tutorAvailability.count({ where: { tutorId: profile.id } })) === 0) {
    await db.tutorAvailability.createMany({
      data: [1, 3, 5].map((weekday) => ({ tutorId: profile.id, weekday, startMinute: 17 * 60, endMinute: 20 * 60 })),
    });
  }
  console.log("Seeded demo content (ECON-101). Demo accounts: demo.ana@student.ie.edu … demo.farah@student.ie.edu");
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
