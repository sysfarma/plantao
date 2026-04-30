import { fromZonedTime } from 'date-fns-tz';
import { addDays, addWeeks, addMonths } from 'date-fns';

const TIMEZONE = 'America/Sao_Paulo';

let serverOffset = 0;

export async function syncWithServer() {
  try {
    const start = Date.now();
    const res = await fetch('/api/status/time');
    const { date } = await res.json();
    const end = Date.now();
    const serverTime = new Date(date).getTime();
    const rtt = (end - start) / 2;
    serverOffset = (serverTime + rtt) - end;
  } catch (e) {
    console.warn('Could not sync with server time', e);
  }
}

export function getSyncedDate(): Date {
  return new Date(Date.now() + serverOffset);
}

export function calculateHighlightEnd(type: 'day' | 'week' | 'month'): Date {
  const now = getSyncedDate();
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
  return absoluteTimeOfShiftEnd < getSyncedDate();
}

export function formatToBRDate(dateString: string): string {
  // dateString is "YYYY-MM-DD"
  const [y, m, d] = dateString.split('-');
  return `${d}/${m}/${y}`;
}
