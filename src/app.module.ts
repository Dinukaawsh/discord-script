import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { ClickUpModule } from './clickup/clickup.module';
import { DiscordModule } from './discord/discord.module';
import { LeaveModule } from './leave/leave.module';
import { DailyUpdatesModule } from './daily-updates/daily-updates.module';
import { ApiKeyGuard } from './auth/api-key.guard';
import { ChannelUsersModule } from './channel-users/channel-users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ClickUpModule,
    DiscordModule,
    LeaveModule,
    DailyUpdatesModule,
    ChannelUsersModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ApiKeyGuard,
    },
  ],
})
export class AppModule {}
