import { Global, Module } from '@nestjs/common';
import { ClickUpService } from './clickup.service';

@Global()
@Module({
  providers: [ClickUpService],
  exports: [ClickUpService],
})
export class ClickUpModule {}
