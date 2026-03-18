import { Global, Module } from '@nestjs/common';
import { DailyUpdatesService } from './daily-updates.service';

@Global()
@Module({
  providers: [DailyUpdatesService],
  exports: [DailyUpdatesService],
})
export class DailyUpdatesModule {}
