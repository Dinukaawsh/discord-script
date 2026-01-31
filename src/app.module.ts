import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { ClickUpModule } from './clickup/clickup.module';
import { DiscordModule } from './discord/discord.module';
import { LeaveModule } from './leave/leave.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ClickUpModule,
    DiscordModule,
    LeaveModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
