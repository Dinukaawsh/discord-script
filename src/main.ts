import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  const preferredPort = Number(process.env.PORT) || 3000;
  const maxPort = Math.min(preferredPort + 10, 65535);

  let port: number | null = null;
  for (let p = preferredPort; p <= maxPort; p++) {
    try {
      await app.listen(p, '0.0.0.0');
      port = p;
      break;
    } catch (err: any) {
      if (err?.code === 'EADDRINUSE' && p < maxPort) {
        continue;
      }
      if (err?.code === 'EADDRINUSE') {
        console.error(`\n❌ Port ${preferredPort} is in use. Free it or set PORT=3001:\n   lsof -i :${preferredPort}   # find process\n   kill <PID>   # or: kill $(lsof -t -i :${preferredPort})\n`);
      }
      throw err;
    }
  }

  if (port != null) {
    if (port !== preferredPort) {
      console.log(`⚠️  Port ${preferredPort} was in use; using ${port} instead.`);
    }
    console.log(`🚀 Server running on http://localhost:${port}`);
    console.log(`💚 Health: http://localhost:${port}/health`);
    console.log(`💚 Ping: http://localhost:${port}/ping`);
    console.log(`🔐 Non-health endpoints require x-api-key header`);
    console.log(`🛠️  Admin UI: http://localhost:${port}/admin`);
    console.log(`🧪 Test daily: http://localhost:${port}/test-daily-summary`);
    console.log(`🧪 Test monthly: http://localhost:${port}/test-monthly-summary`);
    console.log(`🧪 Test weekly: http://localhost:${port}/test-weekly-summary`);
    console.log(`🧪 Check leave on date: http://localhost:${port}/check-leave-on-date/YYYY-MM-DD`);
    console.log(`🧪 Debug ClickUp: http://localhost:${port}/debug-clickup-data`);
    console.log(`🧪 Debug timezone: http://localhost:${port}/debug-timezone`);
    console.log(`🧪 Find lists: http://localhost:${port}/find-lists`);
    console.log(`🔍 Find by name (e.g. work calendar): http://localhost:${port}/find-by-name?q=work%20calendar`);
    console.log(`📅 Squad on next week (preview): http://localhost:${port}/squad-next-week`);
    console.log(`📅 Test squad notification (Friday 6 PM): http://localhost:${port}/test-squad-notification`);
    console.log(`🕙 Daily updates reminder: http://localhost:${port}/daily-updates/reminder`);
    console.log(`🕛 Daily updates noon check: http://localhost:${port}/daily-updates/noon-check`);
    console.log(`🕛 Daily updates evening reconcile: http://localhost:${port}/daily-updates/evening-reconcile`);
  }
}

// Only run HTTP server when not in Lambda
if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
  bootstrap();
}
