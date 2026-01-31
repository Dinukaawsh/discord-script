import { Injectable } from '@nestjs/common';
import { ClickUpService } from '../clickup/clickup.service';
import { DiscordService } from '../discord/discord.service';
import {
  getSriLankaDate,
  getSriLankaTime,
  parseDateInSriLanka,
  getMonthRange,
  getDayRange,
  getWeekRange,
  getNextWeekRange,
  getWeekRangeByOffset,
  getPersonNameFromTask,
  getLeavePeriodFromTask,
} from '../common/timezone.util';

const FORM_LIST_KEYWORDS = ['form', 'leave', 'vacation', 'sick', 'time off', 'pto', 'holiday', 'hr', 'human resources', 'request', 'submission'];
const FORM_TASK_KEYWORDS = ['form', 'submission', 'leave', 'vacation', 'sick', 'time off', 'pto', 'holiday', 'request'];

@Injectable()
export class LeaveService {
  private readonly notifiedTaskIds = new Set<string>();

  constructor(
    private readonly clickup: ClickUpService,
    private readonly discord: DiscordService,
  ) {}

  private isLeaveFormTask(task: any): boolean {
    const listId = task?.list?.id;
    const targetListId = this.clickup.getListId();
    if (listId === targetListId) return true;
    const listName = (task?.list?.name || '').toLowerCase();
    if (FORM_LIST_KEYWORDS.some((k) => listName.includes(k))) return true;
    const taskName = (task?.name || '').toLowerCase();
    return FORM_TASK_KEYWORDS.some((k) => taskName.includes(k));
  }

  async checkNewLeaveRequests(): Promise<{ newTasks: number; tasks: Array<{ name: string; creator?: string }> }> {
    if (!this.clickup.isConfigured()) throw new Error('ClickUp API token not configured');
    if (!this.discord.isConfigured()) throw new Error('Discord webhook URL not configured');
    const tasks = await this.clickup.getTasksWithParams({ order_by: 'created', reverse: true, limit: 100 });
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const newTasks = tasks.filter((task) => {
      let taskDate: Date;
      if (task.date_created) {
        const ts = parseInt(task.date_created, 10);
        taskDate = !isNaN(ts) ? new Date(ts) : new Date();
      } else {
        taskDate = new Date();
      }
      const isNew = taskDate > twoHoursAgo;
      const isLeave = this.isLeaveFormTask(task);
      const notNotified = !this.notifiedTaskIds.has(task.id);
      return isNew && isLeave && notNotified;
    });
    for (const task of newTasks) {
      await this.discord.sendNewLeaveNotification(task, { username: task.creator?.username || 'Unknown User' });
      this.notifiedTaskIds.add(task.id);
    }
    return {
      newTasks: newTasks.length,
      tasks: newTasks.map((t) => ({ name: t.name, creator: t.creator?.username })),
    };
  }

  async runWeeklySummary(): Promise<{ count: number }> {
    if (!this.clickup.isConfigured()) throw new Error('ClickUp API token not configured');
    if (!this.discord.isConfigured()) throw new Error('Discord webhook URL not configured');
    const sriLankaDate = getSriLankaDate();
    const { start: weekStart, end: weekEnd } = getWeekRange(sriLankaDate);
    const tasks = await this.clickup.getTasksWithParams({ order_by: 'created', reverse: true, limit: 100 });
    const filtered = this.clickup.filterTasksByDateRange(tasks, weekStart, weekEnd);
    await this.discord.sendWeeklySummary(filtered, weekStart, weekEnd);
    return { count: filtered.length };
  }

  async runDailySummary(targetDate?: string | null): Promise<{ count: number }> {
    if (!this.clickup.isConfigured()) throw new Error('ClickUp API token not configured');
    if (!this.discord.isConfigured()) throw new Error('Discord webhook URL not configured');

    let sriLankaDate: { year: number; month: number; date: number };
    let dateLabel: string;
    if (targetDate) {
      const parsed = parseDateInSriLanka(targetDate);
      if (!parsed.isValid()) throw new Error('Invalid date format. Use YYYY-MM-DD');
      sriLankaDate = { year: parsed.year(), month: parsed.month(), date: parsed.date() };
      dateLabel = `SPECIFIC DATE (${targetDate})`;
    } else {
      sriLankaDate = getSriLankaDate();
      dateLabel = 'today';
    }
    const { start, end } = getDayRange(sriLankaDate);
    const tasks = await this.clickup.getTasks();
    const filtered = this.clickup.filterTasksByDateRange(tasks, start, end);
    await this.discord.sendDailySummary(filtered, targetDate || null, dateLabel);
    return { count: filtered.length };
  }

  async runMonthlySummary(): Promise<{ count: number }> {
    if (!this.clickup.isConfigured()) throw new Error('ClickUp API token not configured');
    if (!this.discord.isConfigured()) throw new Error('Discord webhook URL not configured');

    const sriLankaDate = getSriLankaDate();
    const { start: monthStart, end: monthEnd } = getMonthRange(sriLankaDate);
    const currentMonthName = getSriLankaTime().format('MMMM');
    const tasks = await this.clickup.getTasks();
    const filtered = this.clickup.filterTasksByMonth(tasks, monthStart, monthEnd);
    await this.discord.sendMonthlySummary(filtered, monthStart, monthEnd, currentMonthName);
    return { count: filtered.length };
  }

  /** Friday 6 PM: send Discord with squad on a future week (from Work Calendar list). weeksAhead=1 = next week, 2 = week after next. */
  async runSquadNotification(weeksAhead: number = 1): Promise<{ count: number; squads: string[]; weekLabel: string; weeksAhead: number }> {
    if (!this.clickup.isConfigured()) throw new Error('ClickUp API token not configured');
    if (!this.discord.isConfigured()) throw new Error('Discord webhook URL not configured');
    const workCalendarListId = this.clickup.getWorkCalendarListId();
    const sriLankaDate = getSriLankaDate();
    const { start: weekStart, end: weekEnd } = getWeekRangeByOffset(sriLankaDate, weeksAhead);
    const tasks = await this.clickup.getTasksFromList(workCalendarListId);
    const inRange = this.clickup.filterTasksByDateRange(tasks, weekStart, weekEnd);
    const squads = inRange.map((t) => (t.name || '').trim()).filter(Boolean);
    const weekLabel = `${weekStart.toLocaleDateString()} – ${weekEnd.toLocaleDateString()}`;
    await this.discord.sendSquadOnNextWeekNotification(squads, weekStart, weekEnd);
    return { count: squads.length, squads, weekLabel, weeksAhead };
  }

  async getEmployeesOnLeave(dateStr: string): Promise<{
    date: string;
    count: number;
    employeesOnLeave: Array<{ employee: string; leaveType: string; fromDate: string; toDate: string; reason?: string; taskUrl?: string; taskName?: string }>;
  }> {
    if (!this.clickup.isConfigured()) throw new Error('ClickUp API token not configured');
    const parsed = parseDateInSriLanka(dateStr);
    if (!parsed.isValid()) throw new Error('Invalid date format. Use YYYY-MM-DD');
    const sriLankaDate = { year: parsed.year(), month: parsed.month(), date: parsed.date() };
    const { start, end } = getDayRange(sriLankaDate);
    const tasks = await this.clickup.getTasks();
    const filtered = this.clickup.filterTasksByDateRange(tasks, start, end);
    const employeesOnLeave = filtered.map((task) => {
      const employee = getPersonNameFromTask(task);
      const { leaveType, fromDate, toDate } = getLeavePeriodFromTask(task);
      let reason = '';
      const fields = task.custom_fields || [];
      for (const f of fields) {
        if (f?.name?.toLowerCase().includes('reason')) reason = f.value || '';
      }
      return {
        employee,
        leaveType,
        fromDate: fromDate ? fromDate.toLocaleDateString() : '',
        toDate: toDate ? toDate.toLocaleDateString() : '',
        reason,
        taskUrl: task.url,
        taskName: task.name,
      };
    });
    return {
      date: dateStr,
      count: employeesOnLeave.length,
      employeesOnLeave,
    };
  }
}
