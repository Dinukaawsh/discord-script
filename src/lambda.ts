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
 * Payload: { "schedule": "daily" } | { "schedule": "monthly" } | { "schedule": "squad_weekly" }.
 * squad_weekly = Friday 6 PM Sri Lanka: which squad is on next week (Work Calendar).
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
