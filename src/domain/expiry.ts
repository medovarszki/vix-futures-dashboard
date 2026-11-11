/**
 * VX futures expire on the Wednesday 30 days before the third Friday of the following month.
 * (Exchange holidays can move the date by a day; the real dates come from the futures chain.)
 */
export function vxExpiry(year: number, month: number): Date {
  const next = new Date(Date.UTC(year, month + 1, 1));
  const firstFriday = 1 + ((5 - next.getUTCDay() + 7) % 7);
  const thirdFriday = Date.UTC(next.getUTCFullYear(), next.getUTCMonth(), firstFriday + 14);
  return new Date(thirdFriday - 30 * 86_400_000);
}

const MONTH_CODES = 'FGHJKMNQUVXZ';

/** eg. VXX6 for November 2026 */
export function vxLocalSymbol(year: number, month: number): string {
  return `VX${MONTH_CODES[month]}${year % 10}`;
}

/** The next count monthly expirations which are not over on the given day */
export function upcomingVxExpiries(today: Date, count: number): { year: number; month: number; expiry: Date }[] {
  const result = [];
  const day = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  let year = today.getUTCFullYear();
  let month = today.getUTCMonth();
  while (result.length < count) {
    const expiry = vxExpiry(year, month);
    if (expiry.getTime() >= day) {
      result.push({ year, month, expiry });
    }
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  return result;
}

/** yyyyMMdd (the format of the facade) */
export function toCompactDate(date: Date): string {
  return date.toISOString().slice(0, 10).replaceAll('-', '');
}

export function parseCompactDate(value: string): Date {
  return new Date(Date.UTC(+value.slice(0, 4), +value.slice(4, 6) - 1, +value.slice(6, 8)));
}

/** Calendar days from today to the date */
export function daysUntil(date: Date, today: Date): number {
  const from = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((date.getTime() - from) / 86_400_000);
}
