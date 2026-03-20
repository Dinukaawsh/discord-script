import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import { ChannelKey, ChannelUsersService } from './channel-users.service';
import { DailyUpdatesService } from '../daily-updates/daily-updates.service';
import { Public } from '../auth/public.decorator';
import * as fs from 'fs';
import * as path from 'path';

@Controller()
export class ChannelUsersController {
  constructor(
    private readonly channelUsers: ChannelUsersService,
    private readonly dailyUpdates: DailyUpdatesService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Get('admin')
  @Header('Content-Type', 'text/html')
  adminPage(): string {
    // __dirname is dist/channel-users/ after build; admin.html lives at dist/admin/admin.html
    const htmlPath = path.join(__dirname, '..', 'admin', 'admin.html');
    return fs.readFileSync(htmlPath, 'utf8');
  }

  @Get('admin/channel-users')
  async getChannelUsers() {
    const data = await this.channelUsers.getAll();
    const messages = await this.channelUsers.getDailyMessages();
    const leaveMap = await this.channelUsers.getLeaveMap();
    return {
      success: true,
      mongoEnabled: this.channelUsers.isEnabled(),
      messages,
      leaveMap,
      ...data,
    };
  }

  @Put('admin/all-users')
  async saveAllUsers(@Body('userIds') userIds: string | string[]) {
    const saved = await this.channelUsers.setAllUsers(userIds || '');
    return { success: true, count: saved.length, userIds: saved };
  }

  @Get('admin/db-status')
  async dbStatus() {
    const result = await this.channelUsers.ping();
    return {
      success: result.ok,
      ...result,
    };
  }

  @Put('admin/channel-users/:channelKey')
  async saveChannelUsers(
    @Param('channelKey') channelKey: string,
    @Body('userIds') userIds: string | string[],
  ) {
    const key = this.validateChannelKey(channelKey);
    const saved = await this.channelUsers.set(key, userIds || '');
    return {
      success: true,
      channelKey: key,
      userIds: saved,
      count: saved.length,
    };
  }

  @Post('admin/channel-users/seed-from-env')
  async seedFromEnv() {
    const data = await this.channelUsers.seedFromEnv();
    return {
      success: true,
      ...data,
    };
  }

  @Put('admin/daily-config/messages')
  async saveMessages(
    @Body('reminder') reminder?: string | string[],
    @Body('missing') missing?: string | string[],
    @Body('shame') shame?: string | string[],
  ) {
    const messages = await this.channelUsers.setDailyMessages({
      reminder,
      missing,
      shame,
    });
    return {
      success: true,
      messages,
    };
  }

  @Put('admin/daily-config/leave-map')
  async saveLeaveMap(@Body('map') map: Record<string, string>) {
    const saved = await this.channelUsers.setLeaveMap(map || {});
    return {
      success: true,
      map: saved,
      count: Object.keys(saved).length,
    };
  }

  @Get('admin/daily-config/state')
  async getState() {
    const state = await this.channelUsers.getDailyState();
    return {
      success: true,
      state: state || {},
    };
  }

  @Post('admin/daily-config/state/reset')
  async resetState() {
    await this.channelUsers.resetDailyState();
    return {
      success: true,
      message: 'Daily update state reset successfully',
    };
  }

  @Get('admin/roles')
  async getRoles() {
    const roles = await this.channelUsers.getRoles();
    return { success: true, roles };
  }

  @Put('admin/roles')
  async saveRoles(@Body('roles') roles: Array<{ name: string; id: string }>) {
    const saved = await this.channelUsers.setRoles(roles || []);
    return { success: true, count: saved.length, roles: saved };
  }

  @Post('admin/post-message')
  @UseInterceptors(FileInterceptor('image'))
  async postMessage(
    @Body('channelKey') channelKey: string,
    @Body('content') content: string,
    @Body('imageUrl') imageUrl?: string,
    @UploadedFile() image?: Express.Multer.File,
  ) {
    const channelId = this.resolveComposerChannelId(channelKey);
    if (!content?.trim()) throw new BadRequestException('Message content is required');
    const fileAttachment = image
      ? { data: image.buffer, name: image.originalname, contentType: image.mimetype }
      : undefined;
    await this.dailyUpdates.broadcastMessage(
      channelId,
      content.trim(),
      fileAttachment ? undefined : imageUrl?.trim(),
      fileAttachment,
    );
    return { success: true, channelKey, channelId, attachedFile: image?.originalname };
  }

  private resolveComposerChannelId(channelKey: string): string {
    const envMap: Record<string, string> = {
      tech: 'TECH_UPDATES_CHANNEL_ID',
      marketing: 'MARKETING_UPDATES_CHANNEL_ID',
      general: 'GENERAL_CHANNEL_ID',
      tools: 'TOOLS_CHANNEL_ID',
    };
    const envKey = envMap[channelKey];
    if (!envKey) throw new BadRequestException(`Unknown channelKey: ${channelKey}`);
    const channelId = this.config.get<string>(envKey);
    if (!channelId) throw new BadRequestException(`${envKey} is not configured in environment`);
    return channelId;
  }

  private validateChannelKey(value: string): ChannelKey {
    if (value !== 'tech' && value !== 'marketing') {
      throw new BadRequestException('channelKey must be tech or marketing');
    }
    return value;
  }
}
