const UK_DATE_TIME = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/London",
});

export function formatUkDateTime(value: number | string | Date): string {
  return UK_DATE_TIME.format(new Date(value));
}
