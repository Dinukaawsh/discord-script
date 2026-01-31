import { Controller, Get, Param, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClickUpService } from './clickup/clickup.service';
import { LeaveService } from './leave/leave.service';
import { getSriLankaDate, getSriLankaTime, getWeekRangeByOffset } from './common/timezone.util';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const moment: any = require('moment-timezone');

@Controller()
export class AppController {
  constructor(
    private readonly leave: LeaveService,
    private readonly clickup: ClickUpService,
    private readonly config: ConfigService,
  ) {}

  @Get('health')
  health() {
    return { status: 'OK', timestamp: new Date().toISOString() };
  }

  @Get('ping')
  ping() {
    return {
      status: 'AWAKE',
      timestamp: new Date().toISOString(),
      message: 'App is active and ready for scheduled tasks',
    };
  }

  @Get('check-now')
  async checkNow() {
    const result = await this.leave.checkNewLeaveRequests();
    return {
      success: true,
      newTasks: result.newTasks,
      message: `Immediate check completed at ${new Date().toLocaleString()}`,
      tasks: result.tasks,
    };
  }

  @Get('test-daily-summary')
  async testDailySummary(@Query('date') date?: string) {
    await this.leave.runDailySummary(date || null);
    if (date) {
      return {
        success: true,
        message: `Daily summary test triggered successfully for ${date}`,
        date,
        timestamp: new Date().toLocaleString(),
      };
    }
    return {
      success: true,
      message: 'Daily summary test triggered successfully for today',
      timestamp: new Date().toLocaleString(),
    };
  }

  @Get('test-monthly-summary')
  async testMonthlySummary() {
    await this.leave.runMonthlySummary();
    return {
      success: true,
      message: 'Monthly summary test triggered successfully',
      timestamp: new Date().toLocaleString(),
    };
  }

  /** Weekly leave summary. Use ?date=YYYY-MM-DD (week containing that date) or ?weeksAgo=0|1|2 (this week, last week, etc.). */
  @Get('test-weekly-summary')
  async testWeeklySummary(
    @Query('date') date?: string,
    @Query('weeksAgo') weeksAgoParam?: string,
  ) {
    const weeksAheadNum = weeksAgoParam !== undefined && weeksAgoParam !== '' ? parseInt(weeksAgoParam, 10) : undefined;
    const options =
      date?.trim()
        ? { date: date.trim(), weeksAgo: undefined }
        : weeksAheadNum !== undefined && !isNaN(weeksAheadNum) && weeksAheadNum >= 0
          ? { date: undefined, weeksAgo: weeksAheadNum }
          : undefined;
    const result = await this.leave.runWeeklySummary(options);
    return {
      success: true,
      message: `Weekly summary sent for ${result.weekLabel} (${result.weekStart.toLocaleDateString()} – ${result.weekEnd.toLocaleDateString()})`,
      weekStart: result.weekStart.toISOString(),
      weekEnd: result.weekEnd.toISOString(),
      weekLabel: result.weekLabel,
      count: result.count,
      timestamp: new Date().toLocaleString(),
    };
  }

  @Get('check-leave-on-date/:date')
  async checkLeaveOnDate(@Param('date') date: string) {
    const result = await this.leave.getEmployeesOnLeave(date);
    return {
      success: true,
      date: result.date,
      count: result.count,
      employeesOnLeave: result.employeesOnLeave,
      message: `Found ${result.count} employee(s) on leave on ${result.date}`,
    };
  }

  @Get('debug-clickup-data')
  async debugClickUpData() {
    if (!this.clickup.isConfigured()) throw new Error('ClickUp API token not configured');
    const listId = this.clickup.getListId();
    const tasks = await this.clickup.getTasks();
    return {
      success: true,
      environment: this.config.get('NODE_ENV') || 'development',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      listId,
      totalTasks: tasks.length,
      serverTime: new Date().toISOString(),
      sampleTasks: tasks.slice(0, 3).map((task: any) => ({
        id: task.id,
        name: task.name,
        due_date: task.due_date,
        custom_fields: (task.custom_fields || []).map((f: any) => ({ name: f.name, type: f.type, value: f.value })),
      })),
      timestamp: new Date().toLocaleString(),
    };
  }

  @Get('debug-timezone')
  debugTimezone() {
    const serverTime = new Date();
    const utcTime = moment().utc();
    const sriLankaTime = getSriLankaTime();
    const sriLankaDate = getSriLankaDate();
    const startOfToday = moment
      .tz('Asia/Colombo')
      .year(sriLankaDate.year)
      .month(sriLankaDate.month)
      .date(sriLankaDate.date)
      .hour(0)
      .minute(0)
      .second(0)
      .millisecond(0);
    const endOfToday = moment
      .tz('Asia/Colombo')
      .year(sriLankaDate.year)
      .month(sriLankaDate.month)
      .date(sriLankaDate.date)
      .hour(23)
      .minute(59)
      .second(59)
      .millisecond(999);
    return {
      success: true,
      serverInfo: {
        environment: this.config.get('NODE_ENV') || 'development',
        serverTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        serverTime: serverTime.toISOString(),
        serverTimeLocal: serverTime.toLocaleString(),
      },
      timezoneInfo: {
        utcTime: utcTime.format('YYYY-MM-DD HH:mm:ss'),
        sriLankaTime: sriLankaTime.format('YYYY-MM-DD HH:mm:ss'),
        sriLankaDateComponents: {
          year: sriLankaDate.year,
          month: sriLankaDate.month + 1,
          date: sriLankaDate.date,
          day: sriLankaDate.day,
        },
        sriLankaDateFormatted: sriLankaTime.format('YYYY-MM-DD'),
      },
      dateCalculations: {
        startOfToday: startOfToday.toISOString(),
        endOfToday: endOfToday.toISOString(),
        startOfTodayLocal: startOfToday.local().format('YYYY-MM-DD HH:mm:ss'),
        endOfTodayLocal: endOfToday.local().format('YYYY-MM-DD HH:mm:ss'),
      },
      timestamp: new Date().toISOString(),
    };
  }

  @Get('find-lists')
  async findLists() {
    const workspaceId = this.config.get<string>('CLICKUP_WORKSPACE_ID');
    if (!workspaceId) throw new Error('CLICKUP_WORKSPACE_ID not configured');
    const lists = await this.clickup.findLists(workspaceId);
    return {
      success: true,
      lists,
      message: `Found ${lists.length} lists in workspace`,
    };
  }

  /** Preview: which squad is on a future week (from Work Calendar). Does not send Discord. Use ?weeksAhead=1 (next week), 2 (week after next), etc. */
  @Get('squad-next-week')
  async squadNextWeek(@Query('weeksAhead') weeksAheadParam?: string) {
    if (!this.clickup.isConfigured()) throw new Error('ClickUp API token not configured');
    const weeksAhead = Math.max(1, parseInt(weeksAheadParam ?? '1', 10) || 1);
    const workCalendarListId = this.clickup.getWorkCalendarListId();
    const sriLankaDate = getSriLankaDate();
    const { start: weekStart, end: weekEnd } = getWeekRangeByOffset(sriLankaDate, weeksAhead);
    const tasks = await this.clickup.getTasksFromList(workCalendarListId);
    const inRange = this.clickup.filterTasksByDateRange(tasks, weekStart, weekEnd);
    const squads = inRange.map((t: any) => (t.name || '').trim()).filter(Boolean);
    const weekLabel = `${weekStart.toLocaleDateString()} – ${weekEnd.toLocaleDateString()}`;
    return {
      success: true,
      weeksAhead,
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
      weekLabel,
      squads,
      count: squads.length,
      message: squads.length > 0 ? `Squad for week ${weeksAhead}: ${squads.join(', ')}` : `No squad assigned for that week in Work Calendar.`,
      note: 'Preview only. To send to Discord, call GET /test-squad-notification?weeksAhead=' + weeksAhead,
    };
  }

  /** Send Discord notification: squad on a future week (same as Friday 6 PM job). Use ?weeksAhead=1 (next week), 2 (week after next), etc. */
  @Get('test-squad-notification')
  async testSquadNotification(@Query('weeksAhead') weeksAheadParam?: string) {
    const weeksAhead = Math.max(1, parseInt(weeksAheadParam ?? '1', 10) || 1);
    const result = await this.leave.runSquadNotification(weeksAhead);
    return {
      success: true,
      message: `Squad-on-week Discord notification sent (weeksAhead=${weeksAhead}).`,
      ...result,
    };
  }

  /** Find list, folder, or space by name (e.g. "work calendar"). Case-insensitive. */
  @Get('find-by-name')
  async findByName(@Query('q') q?: string) {
    const workspaceId = this.config.get<string>('CLICKUP_WORKSPACE_ID');
    if (!workspaceId) throw new Error('CLICKUP_WORKSPACE_ID not configured');
    const searchTerm = (q ?? '').trim() || 'work calendar';
    const result = await this.clickup.findByName(workspaceId, searchTerm);
    const total = result.lists.length + result.folders.length + result.spaces.length;
    return {
      success: true,
      search: searchTerm,
      message: total > 0 ? `Found ${total} match(es) for "${searchTerm}"` : `No list, folder, or space named like "${searchTerm}"`,
      ...result,
    };
  }
}
