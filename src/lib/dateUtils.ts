import { fromZonedTime } from 'date-fns-tz';
import { addDays, addWeeks, addMonths } from 'date-fns';

const TIMEZONE = 'America/Sao_Paulo';

export function calculateHighlightEnd(type: 'day' | 'week' | 'month'): Date {
  const now = new Date();
  if (type === 'day') return addDays(now, 1);
  if (type === 'week') return addWeeks(now, 1);
  if (type === 'month') return addMonths(now, 1);
  return now;
}

export function isShiftPast(dateString: string): boolean {
  // dateString is "YYYY-MM-DD"
  // We want to know if 23:59:59 of this date in BR time is in the past.
  const dateInBR = `${dateString}T23:59:59`;
  const absoluteTimeOfShiftEnd = fromZonedTime(dateInBR, TIMEZONE);
  return absoluteTimeOfShiftEnd < new Date();
}

export function formatToBRDate(dateString: string): string {
  // dateString is "YYYY-MM-DD"
  const [y, m, d] = dateString.split('-');
  return `${d}/${m}/${y}`;
}
