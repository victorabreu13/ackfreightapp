// Local calendar-day string (YYYY-MM-DD) — deliberately NOT
// date.toISOString().slice(0, 10), which reports the UTC calendar day.
// Anyone west of UTC (e.g. America/New_York) rolls over to "tomorrow" in
// UTC hours before local midnight — a trip logged at 9pm Eastern would get
// tagged with the wrong date, and today-filters would stop matching it.
export function toLocalDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
