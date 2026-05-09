import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { addDays, addWeeks, addMonths } from 'date-fns';

const TIMEZONE = 'America/Sao_Paulo';

let serverOffset = 0;

export async function syncWithServer() {
  try {
    const start = Date.now();
    const res = await fetch('/api/status/time');
    const { timestamp } = await res.json();
    const end = Date.now();
    const serverTime = new Date(timestamp).getTime();
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

export function isPharmacyOpen(operatingHours: any): { open: boolean, message: string } {
  if (!operatingHours) return { open: true, message: 'Consulte o local' };
  
  const now = getSyncedDate();
  // Use toZonedTime to get a date representing the time in Brasilia
  const brDate = toZonedTime(now, TIMEZONE);
  
  const dayOfWeek = brDate.getDay().toString(); // 0 (Dom) to 6 (Sab)
  const hours = operatingHours[dayOfWeek];
  
  if (!hours || hours.closed) {
    return { open: false, message: 'FECHADO AGORA' };
  }
  
  const [currentH, currentM] = [brDate.getHours(), brDate.getMinutes()];
  const currentTime = currentH * 60 + currentM;
  
  const [openH, openM] = hours.open.split(':').map(Number);
  const [closeH, closeM] = hours.close.split(':').map(Number);
  
  const openTime = openH * 60 + openM;
  const closeTime = closeH * 60 + closeM;
  
  // Handling shifts that go past midnight (e.g., 08:00 to 02:00)
  const isActualCloseTimeAfterOpenTime = closeTime > openTime;
  
  if (isActualCloseTimeAfterOpenTime) {
    if (currentTime >= openTime && currentTime < closeTime) {
      return { open: true, message: `ABERTO ATÉ AS ${hours.close}` };
    }
  } else {
    // Midnight overlap case
    if (currentTime >= openTime || currentTime < closeTime) {
      return { open: true, message: `ABERTO ATÉ AS ${hours.close}` };
    }
  }
  
  return { open: false, message: 'FECHADO AGORA' };
}
