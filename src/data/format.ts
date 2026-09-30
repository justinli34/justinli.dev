/** Formats an ISO date (or year-month) the way the plate's instruments do. */
export function stamp(date: string) {
  return date.replaceAll("-", "·");
}
