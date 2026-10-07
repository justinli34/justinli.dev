const dateFormat = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
  // Frontmatter dates are calendar dates, so avoid shifting them by local offset.
  timeZone: "UTC",
});

export function formatDate(date: string): string {
  return dateFormat.format(new Date(date));
}
