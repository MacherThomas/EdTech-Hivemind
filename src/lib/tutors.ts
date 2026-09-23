import { db } from "./db";
import { config } from "./config";
import { averageRating, isTutorEligible } from "./reputation";

const emptySignals = {
  upvotesReceived: 0, downvotesReceived: 0, resolvedAnswers: 0, entriesContributed: 0,
  sessionsCompleted: 0, ratingSum: 0, ratingCount: 0, flagsUpheld: 0, score: 0, answersPosted: 0,
};

export async function tutorEligibility(userId: string, courseId: string) {
  const rep = (await db.courseReputation.findUnique({ where: { userId_courseId: { userId, courseId } } })) ?? emptySignals;
  const validated = rep.resolvedAnswers + rep.entriesContributed;
  return {
    eligible: isTutorEligible(rep),
    rep,
    needs: {
      score: Math.max(0, config.tutors.minCourseReputation - rep.score),
      validated: Math.max(0, config.tutors.minValidatedContributions - validated),
    },
  };
}

/**
 * Tutors for a course: emergent from reputation, ranked by it. A tutor is
 * bookable only once they've set a rate for this course and finished
 * processor-hosted payout onboarding.
 */
export async function courseTutors(courseId: string) {
  const reps = await db.courseReputation.findMany({
    where: { courseId, score: { gte: config.tutors.minCourseReputation } },
    orderBy: { score: "desc" },
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          tutorProfile: { include: { rates: { where: { courseId } }, availability: true } },
        },
      },
    },
    take: 50,
  });
  return reps
    .filter((r) => isTutorEligible(r))
    .map((r) => {
      const profile = r.user.tutorProfile;
      const rate = profile?.rates[0];
      return {
        userId: r.user.id,
        displayName: r.user.displayName,
        rep: r,
        avgRating: averageRating(r),
        profile,
        rate: rate?.active ? rate : null,
        bookable: !!(profile?.active && rate?.active && profile.payoutStatus === "ACTIVE" && profile.availability.length > 0),
      };
    });
}
