export function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency }).format(cents / 100);
}

export function formatDate(d: Date, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" }) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", ...opts }).format(d);
}

export function formatDateTime(d: Date) {
  return formatDate(d, { dateStyle: "medium", timeStyle: "short" });
}

export function timeAgo(d: Date, now = new Date()) {
  const s = Math.round((now.getTime() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days} d ago`;
  return formatDate(d);
}

export const originLabel: Record<string, string> = {
  COMMUNITY: "Community",
  AI_DRAFTED: "AI-drafted",
  TUTOR: "Tutor",
};
