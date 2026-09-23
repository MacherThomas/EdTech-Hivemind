/**
 * Outbound email. "console" transport logs messages for local development.
 * A real transport (IE's mail relay or an approved provider) is a deployment
 * decision for the IE Cloud Services review.
 */
export async function sendEmail(to: string, subject: string, text: string) {
  const transport = process.env.EMAIL_TRANSPORT ?? "console";
  if (transport === "console") {
    console.info(`\n[email:console] to=${to}\nsubject: ${subject}\n${text}\n`);
    return;
  }
  throw new Error(`Email transport "${transport}" is not configured.`);
}
