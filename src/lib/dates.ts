// Clé de jour locale (YYYY-MM-DD) à partir d'une ISO UTC, évitant le décalage de fuseau UTC.
export function toLocalDayKey(dateStr: string | Date): string {
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  return d.toLocaleDateString('en-CA');
}

// Jour local courant (YYYY-MM-DD).
export function todayLocalKey(): string {
  return toLocalDayKey(new Date());
}

/**
 * Retourne le lundi de la semaine d'une date donnée (00:00:00).
 */
export function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Dimanche, 1 = Lundi, etc.
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Retourne le dimanche de la semaine d'une date donnée (23:59:59).
 */
export function getSundayOfWeek(date: Date): Date {
  const monday = getMondayOfWeek(date);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return sunday;
}

/**
 * Calcule l'année et le numéro de semaine ISO (1-53).
 */
export function getWeekNumber(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { year: d.getUTCFullYear(), week: weekNo };
}

/**
 * Clé unique de la semaine sous forme 'YYYY-Www' (ex: '2026-W37').
 */
export function getWeekKey(dateStr: string | Date): string {
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  const { year, week } = getWeekNumber(d);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/**
 * Bornes de la semaine (lundi et dimanche).
 */
export function getWeekBounds(dateStr: string | Date): { monday: Date; sunday: Date; mondayStr: string; sundayStr: string } {
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  const monday = getMondayOfWeek(d);
  const sunday = getSundayOfWeek(d);
  return {
    monday,
    sunday,
    mondayStr: toLocalDayKey(monday),
    sundayStr: toLocalDayKey(sunday),
  };
}

/**
 * Libellé en français pour la semaine (ex: "Semaine 37 (08 sept. - 14 sept. 2026)").
 */
export function formatWeekLabel(dateStr: string | Date): string {
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  const { monday, sunday } = getWeekBounds(d);
  const { week } = getWeekNumber(d);
  const opt: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' };
  const mondayFmt = monday.toLocaleDateString('fr-FR', opt);
  const sundayFmt = sunday.toLocaleDateString('fr-FR', { ...opt, year: 'numeric' });
  return `Semaine ${week} (${mondayFmt} au ${sundayFmt})`;
}

/**
 * Indique si la date ou la clé de semaine correspond à la semaine en cours.
 */
export function isCurrentWeek(dateStr: string | Date): boolean {
  return getWeekKey(dateStr) === getWeekKey(new Date());
}