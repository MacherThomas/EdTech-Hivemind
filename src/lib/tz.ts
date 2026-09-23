/** Minimal timezone helpers (no dependency) for turning weekly availability into instants. */

function partsIn(date: Date, tz: string) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short",
  });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return {
    year: +p.year, month: +p.month - 1, day: +p.day, hour: +p.hour, minute: +p.minute, second: +p.second,
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday),
  };
}

function offsetMinutes(date: Date, tz: string) {
  const p = partsIn(date, tz);
  return (Date.UTC(p.year, p.month, p.day, p.hour, p.minute, p.second) - date.getTime()) / 60_000;
}

/** The instant at which the wall clock in `tz` reads y-m-d + minutes. */
export function zonedTime(year: number, month: number, day: number, minutes: number, tz: string) {
  const guess = Date.UTC(year, month, day, 0, minutes);
  let t = guess - offsetMinutes(new Date(guess), tz) * 60_000;
  t = guess - offsetMinutes(new Date(t), tz) * 60_000; // second pass handles DST edges
  return new Date(t);
}

export function localDate(date: Date, tz: string) {
  const p = partsIn(date, tz);
  return { year: p.year, month: p.month, day: p.day, weekday: p.weekday };
}
