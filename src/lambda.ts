import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { LeaveService } from './leave/leave.service';

let app: INestApplicationContext;

async function getApp(): Promise<INestApplicationContext> {
  if (!app) {
    app = await NestFactory.createApplicationContext(AppModule);
  }
  return app;
}

/**
 * AWS Lambda handler for EventBridge.
 * Main schedules (3 rules): daily, monthly, squad_weekly.
 * Weekly leave summary: code supported but no EventBridge rule; use GET /test-weekly-summary if needed.
 */
export async function handler(event: any) {
  const schedule = event?.schedule ?? event?.detail?.schedule ?? event?.scheduleType;
  const nestApp = await getApp();
  const leaveService = nestApp.get(LeaveService);

  if (schedule === 'squad_weekly') {
    console.log('📅 Lambda: Running squad-on-next-week notification...');
    const result = await leaveService.runSquadNotification();
    return { statusCode: 200, body: JSON.stringify({ ok: true, schedule: 'squad_weekly', ...result }) };
  }

  if (schedule === 'weekly') {
    const weeksAgo = event?.weeksAgo ?? event?.detail?.weeksAgo;
    const options = weeksAgo !== undefined && Number.isInteger(Number(weeksAgo)) && Number(weeksAgo) >= 0
      ? { weeksAgo: Number(weeksAgo) }
      : undefined;
    console.log('📅 Lambda: Running weekly leave summary...', options ? `(weeksAgo=${weeksAgo})` : '(this week)');
    const result = await leaveService.runWeeklySummary(options);
    return { statusCode: 200, body: JSON.stringify({ ok: true, schedule: 'weekly', ...result }) };
  }

  if (schedule === 'monthly') {
    console.log('📊 Lambda: Running monthly leave summary...');
    await leaveService.runMonthlySummary();
    return { statusCode: 200, body: JSON.stringify({ ok: true, schedule: 'monthly' }) };
  }

  if (schedule === 'daily' || schedule === undefined) {
    console.log('📅 Lambda: Running daily leave summary...');
    await leaveService.runDailySummary();
    return { statusCode: 200, body: JSON.stringify({ ok: true, schedule: 'daily' }) };
  }

  return {
    statusCode: 400,
    body: JSON.stringify({ error: 'Unknown schedule', received: schedule }),
  };
}
