const MINUS = '−';

/** Fixed decimals, null as a dash */
export function num(value: number | null | undefined, digits = 2): string {
  return value == null ? '–' : value.toFixed(digits).replace('-', MINUS);
}

/** With an explicit sign */
export function signed(value: number | null | undefined, digits = 2): string {
  if (value == null) {
    return '–';
  }
  const rounded = Number(value.toFixed(digits));
  return (rounded > 0 ? '+' : rounded < 0 ? MINUS : '') + Math.abs(rounded).toFixed(digits);
}

export function int(value: number | null | undefined): string {
  return value == null ? '–' : Math.round(value).toLocaleString('hu-HU').replace(/ | /g, ' ');
}

/** CSS class of a change: up, down or flat */
export function tone(value: number | null | undefined): string {
  return value == null || Math.abs(value) < 0.0005 ? 'flat' : value > 0 ? 'up' : 'down';
}

const SHORT = new Intl.DateTimeFormat('hu-HU', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const LONG = new Intl.DateTimeFormat('hu-HU', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
const TIME = new Intl.DateTimeFormat('hu-HU', { hour: '2-digit', minute: '2-digit' });
const CLOCK = new Intl.DateTimeFormat('hu-HU', {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
});

export const shortDate = (date: Date) => SHORT.format(date);
export const longDate = (date: Date) => LONG.format(date);
export const time = (iso: string | null) => (iso ? TIME.format(new Date(iso)) : '');
export const clock = (date: Date) => CLOCK.format(date);

/** Width class of a bid/ask spread in ticks */
export function widthTone(ticks: number | null): string {
  return ticks == null ? 'flat' : ticks <= 1 ? 'tight' : ticks <= 3 ? 'medium' : 'wide';
}
