const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['second', 60],
  ['minute', 60],
  ['hour', 24],
  ['day', 7],
  ['week', 4.35],
  ['month', 12],
  ['year', Number.POSITIVE_INFINITY],
];

/** "3 minutes ago", "yesterday"… */
export function relativeTime(iso: string, now = Date.now()): string {
  let value = (Date.parse(iso) - now) / 1000;
  for (const [unit, size] of STEPS) {
    if (Math.abs(value) < size) {
      if (unit === 'second' && Math.abs(value) < 45) return 'just now';
      return rtf.format(Math.round(value), unit);
    }
    value /= size;
  }
  return '';
}
