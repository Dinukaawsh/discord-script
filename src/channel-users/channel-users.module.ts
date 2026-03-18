import { Global, Module } from '@nestjs/common';
import { ChannelUsersService } from './channel-users.service';
import { ChannelUsersController } from './channel-users.controller';

@Global()
@Module({
  providers: [ChannelUsersService],
  controllers: [ChannelUsersController],
  exports: [ChannelUsersService],
})
export class ChannelUsersModule {}
