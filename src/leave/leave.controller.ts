import { Controller, Get, Param, Query } from '@nestjs/common';
import { LeaveService } from './leave.service';

@Controller('leave')
export class LeaveController {
  constructor(private readonly leaveService: LeaveService) {}

  @Get('test-daily-summary')
  async testDailySummary(@Query('date') date?: string) {
    const result = await this.leaveService.runDailySummary(date || null);
    return {
      success: true,
      message: date
        ? `Daily summary test triggered for ${date}`
        : 'Daily summary test triggered for today',
      date: date || null,
      count: result.count,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('test-monthly-summary')
  async testMonthlySummary() {
    const result = await this.leaveService.runMonthlySummary();
    return {
      success: true,
      message: 'Monthly summary test triggered successfully',
      count: result.count,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('check-leave-on-date/:date')
  async checkLeaveOnDate(@Param('date') date: string) {
    const result = await this.leaveService.getEmployeesOnLeave(date);
    return {
      success: true,
      date: result.date,
      count: result.count,
      employeesOnLeave: result.employeesOnLeave,
      message: `Found ${result.count} employee(s) on leave on ${result.date}`,
    };
  }
}
