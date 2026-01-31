// Use require so TypeScript accepts moment() as callable (moment-timezone types can be strict)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const moment: any = require('moment-timezone');

const TZ = 'Asia/Colombo';

export function getSriLankaTime() {
  return moment().tz(TZ);
}

export function getSriLankaDate() {
  const t = moment().tz(TZ);
  return {
    year: t.year(),
    month: t.month(),
    date: t.date(),
    day: t.day(),
    hour: t.hour(),
    minute: t.minute(),
    second: t.second(),
  };
}

export function parseDateInSriLanka(dateStr: string) {
  return moment.tz(dateStr, 'YYYY-MM-DD', TZ);
}

export function getMonthRange(sriLankaDate: { year: number; month: number }) {
  const start = moment.tz(TZ).year(sriLankaDate.year).month(sriLankaDate.month).date(1)
    .hour(0).minute(0).second(0).millisecond(0).toDate();
  const end = moment.tz(TZ).year(sriLankaDate.year).month(sriLankaDate.month + 1).date(0)
    .hour(23).minute(59).second(59).millisecond(999).toDate();
  return { start, end };
}

export function getDayRange(sriLankaDate: { year: number; month: number; date: number }) {
  const start = moment.tz(TZ)
    .year(sriLankaDate.year).month(sriLankaDate.month).date(sriLankaDate.date)
    .hour(0).minute(0).second(0).millisecond(0).toDate();
  const end = moment.tz(TZ)
    .year(sriLankaDate.year).month(sriLankaDate.month).date(sriLankaDate.date)
    .hour(23).minute(59).second(59).millisecond(999).toDate();
  return { start, end };
}

/** This week Monday 00:00:00 and Friday 23:59:59 Sri Lanka (work week). */
export function getWeekRange(sriLankaDate: { year: number; month: number; date: number }) {
  const m = moment.tz(TZ).year(sriLankaDate.year).month(sriLankaDate.month).date(sriLankaDate.date);
  const monday = m.clone().startOf('week').add(1, 'day')
    .hour(0).minute(0).second(0).millisecond(0).toDate();
  const friday = m.clone().startOf('week').add(5, 'day')
    .hour(23).minute(59).second(59).millisecond(999).toDate();
  return { start: monday, end: friday };
}

/** Week range for a week offset from today. weeksAgo=0 → this week, 1 → last week, 2 → two weeks ago. */
export function getWeekRangeByWeeksAgo(
  sriLankaDate: { year: number; month: number; date: number },
  weeksAgo: number,
) {
  const m = moment.tz(TZ).year(sriLankaDate.year).month(sriLankaDate.month).date(sriLankaDate.date);
  const then = m.clone().subtract(weeksAgo, 'week');
  return getWeekRange({
    year: then.year(),
    month: then.month(),
    date: then.date(),
  });
}

/** Next week Monday 00:00:00 to Sunday 23:59:59 Sri Lanka (for Work Calendar squad lookup). */
export function getNextWeekRange(sriLankaDate: { year: number; month: number; date: number }) {
  return getWeekRangeByOffset(sriLankaDate, 1);
}

/**
 * Week range by offset from current week.
 * weeksAhead=1 → next week (Mon–Sun), weeksAhead=2 → week after next, etc.
 */
export function getWeekRangeByOffset(
  sriLankaDate: { year: number; month: number; date: number },
  weeksAhead: number,
) {
  if (weeksAhead < 1) weeksAhead = 1;
  const m = moment.tz(TZ).year(sriLankaDate.year).month(sriLankaDate.month).date(sriLankaDate.date);
  const weekMonday = m.clone().startOf('week').add(weeksAhead, 'week').add(1, 'day')
    .hour(0).minute(0).second(0).millisecond(0).toDate();
  const weekSunday = m.clone().startOf('week').add(weeksAhead, 'week').add(7, 'day')
    .hour(23).minute(59).second(59).millisecond(999).toDate();
  return { start: weekMonday, end: weekSunday };
}

export function getPersonNameFromTask(task: any): string {
  if (task?.name?.trim()) return task.name.trim();
  if (task?.creator?.username) return task.creator.username;
  const fields = task?.custom_fields || [];
  for (const f of fields) {
    if (f?.name?.toLowerCase().includes('name') && f?.value) return f.value;
  }
  return 'Unknown';
}

export function getLeavePeriodFromTask(task: any): { leaveType: string; fromDate: Date | null; toDate: Date | null } {
  let leaveType = 'Leave';
  let fromDate: Date | null = null;
  let toDate: Date | null = null;
  const fields = task?.custom_fields || [];
  for (const f of fields) {
    if (f?.type === 'drop_down' && f?.name?.toLowerCase().includes('type')) {
      if (f?.type_config?.options) {
        const opt = f.type_config.options.find((o: any) => o.id === f.value || o.orderindex === f.value);
        leaveType = opt ? opt.name : f.value ?? leaveType;
      } else {
        leaveType = f.value ?? leaveType;
      }
    } else if (f?.name?.toLowerCase().includes('from') && f?.value) {
      const ts = parseInt(f.value, 10);
      if (!isNaN(ts)) fromDate = new Date(ts);
    } else if (f?.name?.toLowerCase().includes('to') && f?.value) {
      const ts = parseInt(f.value, 10);
      if (!isNaN(ts)) toDate = new Date(ts);
    }
  }
  if (!fromDate && task?.start_date) fromDate = new Date(parseInt(task.start_date, 10));
  if (!toDate && task?.due_date) toDate = new Date(parseInt(task.due_date, 10));
  if (!fromDate && toDate) fromDate = toDate;
  if (!toDate && fromDate) toDate = fromDate;
  return { leaveType, fromDate, toDate };
}

export function countDaysInMonth(
  fromDate: Date | null,
  toDate: Date | null,
  monthStart: Date,
  monthEnd: Date,
): number {
  if (!fromDate || !toDate || isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) return 0;
  const from = fromDate < monthStart ? monthStart : fromDate;
  const to = toDate > monthEnd ? monthEnd : toDate;
  if (from > to) return 0;
  return Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)) + 1;
}
