import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { promises as fs } from 'fs';
import path from 'path';
import {
  getPersonNameFromTask,
  getSriLankaTime,
} from '../common/timezone.util';
import { ClickUpService } from '../clickup/clickup.service';
import { ChannelUsersService } from '../channel-users/channel-users.service';

type DailyChannelConfig = {
  key: 'tech' | 'marketing';
  name: string;
  channelId: string;
  expectedUserIds: string[];
};

type DailyChannelState = {
  lastCheckedDate?: string;
  streaks: Record<string, number>;
  pendingNoonDate?: string;
  pendingNoonMissingUserIds?: string[];
};

type DailyState = {
  channelStates: Record<string, DailyChannelState>;
};

type DailyMessageConfig = {
  reminder?: string | string[];
  missing?: string | string[];
  shame?: string | string[];
};

type ChannelCheckResult = {
  channelId: string;
  channelName: string;
  expectedCount: number;
  postedCount: number;
  excludedOnLeaveCount: number;
  excludedOnLeaveUserIds: string[];
  missingUserIds: string[];
  shameUserIds: string[];
  skipped: boolean;
  reason?: string;
};

type ChannelReconcileResult = {
  channelId: string;
  channelName: string;
  noonMissingCount: number;
  adjustedCount: number;
  recoveredUserIds: string[];
  unresolvedUserIds: string[];
  skipped: boolean;
  reason?: string;
};

type ValidUpdateMessage = {
  userId: string;
  messageId: string;
};

type PostMessageOptions = {
  imageUrl?: string;
};

const DEFAULT_REMINDER_MESSAGE =
  'Good morning team! Please add your daily update in this channel before 12:00 PM without fail. Thank you!';
const DEFAULT_MISSING_MESSAGE =
  'Heads up {mentions} - we could not find your daily update before 12:00 PM. Please post your update now.';
const DEFAULT_SHAME_MESSAGE =
  'Fun shame time {mentions} - 3 days in a row without daily updates. Come back stronger tomorrow!';

@Injectable()
export class DailyUpdatesService {
  private readonly discordApiBase = 'https://discord.com/api/v10';
  private readonly botToken: string | undefined;
  private readonly stateFilePath: string;
  private readonly messagesFilePath: string | undefined;
  private readonly leaveMapFilePath: string | undefined;

  constructor(
    private readonly config: ConfigService,
    private readonly clickup: ClickUpService,
    private readonly channelUsers: ChannelUsersService,
  ) {
    this.botToken = this.config.get<string>('DISCORD_BOT_TOKEN');
    this.stateFilePath = this.resolveStateFilePath();
    this.messagesFilePath = this.resolveMessagesFilePath();
    this.leaveMapFilePath = this.resolveLeaveMapFilePath();
  }

  async isConfigured(): Promise<boolean> {
    const channels = await this.getChannelConfigs();
    return (
      !!this.botToken &&
      channels.length > 0 &&
      channels.every((channel) => channel.expectedUserIds.length > 0)
    );
  }

  async sendMorningReminder(): Promise<{ sentTo: string[] }> {
    const channels = await this.getChannelConfigs();
    this.assertConfigured(channels);
    const reminderMessage = await this.getReminderMessage();
    const sentTo: string[] = [];
    for (const channel of channels) {
      await this.postChannelMessage(channel.channelId, reminderMessage);
      sentTo.push(channel.channelId);
    }
    return { sentTo };
  }

  async runNoonCheck(): Promise<{ date: string; results: ChannelCheckResult[] }> {
    const channels = await this.getChannelConfigs();
    this.assertConfigured(channels);
    const now = getSriLankaTime();
    const dateKey = now.format('YYYY-MM-DD');
    const dayStart = now.clone().hour(0).minute(0).second(0).millisecond(0);
    const cutoffHour = this.getRangedIntEnv('DAILY_UPDATES_CUTOFF_HOUR', 12, 0, 23);
    const cutoffMinute = this.getRangedIntEnv('DAILY_UPDATES_CUTOFF_MINUTE', 0, 0, 59);
    const cutoffTime = now
      .clone()
      .hour(cutoffHour)
      .minute(cutoffMinute)
      .second(0)
      .millisecond(0);
    const dayEnd = now
      .clone()
      .hour(23)
      .minute(59)
      .second(59)
      .millisecond(999);
    const onLeaveUserIds = await this.getOnLeaveDiscordUserIds(
      dayStart.toDate(),
      dayEnd.toDate(),
    );
    const state = await this.loadState();
    const results: ChannelCheckResult[] = [];

    for (const channel of channels) {
      const channelState = this.ensureChannelState(state, channel.channelId);
      const excludedOnLeaveUserIds = channel.expectedUserIds.filter((id) =>
        onLeaveUserIds.has(id),
      );
      const effectiveExpectedUserIds = channel.expectedUserIds.filter(
        (id) => !onLeaveUserIds.has(id),
      );
      if (channelState.lastCheckedDate === dateKey) {
        results.push({
          channelId: channel.channelId,
          channelName: channel.name,
          expectedCount: effectiveExpectedUserIds.length,
          postedCount: 0,
          excludedOnLeaveCount: excludedOnLeaveUserIds.length,
          excludedOnLeaveUserIds,
          missingUserIds: [],
          shameUserIds: [],
          skipped: true,
          reason: `Already checked on ${dateKey}`,
        });
        continue;
      }

      const postedUserIds = await this.getPostedUserIds(
        channel.channelId,
        dayStart.toDate(),
        cutoffTime.toDate(),
      );
      const postedSet = new Set(postedUserIds.map((item) => item.userId));
      const missingUserIds = effectiveExpectedUserIds.filter(
        (id) => !postedSet.has(id),
      );

      const shouldReact = String(this.config.get<string>('DAILY_UPDATES_ADD_REACTION') || '')
        .trim()
        .toLowerCase() === 'true';
      if (shouldReact) {
        const reactionEmoji = this.config.get<string>('DAILY_UPDATES_REACTION_EMOJI')?.trim() || '✅';
        for (const posted of postedUserIds) {
          if (!effectiveExpectedUserIds.includes(posted.userId)) continue;
          await this.addReactionToMessage(channel.channelId, posted.messageId, reactionEmoji);
        }
      }

      for (const userId of effectiveExpectedUserIds) {
        const current = channelState.streaks[userId] || 0;
        channelState.streaks[userId] = postedSet.has(userId) ? 0 : current + 1;
      }
      channelState.lastCheckedDate = dateKey;
      channelState.pendingNoonDate = dateKey;
      channelState.pendingNoonMissingUserIds = [...missingUserIds];

      if (missingUserIds.length > 0) {
        const mentions = this.toMentions(missingUserIds);
        const missingTemplate = await this.getMissingMessage();
        await this.postChannelMessage(
          channel.channelId,
          this.renderTemplate(missingTemplate, mentions),
        );
      }

      const shameUserIds = missingUserIds.filter((id) => (channelState.streaks[id] || 0) >= 3);
      if (shameUserIds.length > 0) {
        const mentions = this.toMentions(shameUserIds);
        const shameTemplate = await this.getShameMessage();
        const shameGifUrl = this.config.get<string>('DAILY_UPDATES_SHAME_GIF_URL')?.trim();
        await this.postChannelMessage(
          channel.channelId,
          this.renderTemplate(shameTemplate, mentions),
          { imageUrl: shameGifUrl },
        );
      }

      results.push({
        channelId: channel.channelId,
        channelName: channel.name,
        expectedCount: effectiveExpectedUserIds.length,
        postedCount: effectiveExpectedUserIds.filter((id) => postedSet.has(id)).length,
        excludedOnLeaveCount: excludedOnLeaveUserIds.length,
        excludedOnLeaveUserIds,
        missingUserIds,
        shameUserIds,
        skipped: false,
      });
    }

    await this.saveState(state);
    return { date: dateKey, results };
  }

  async runEveningReconcile(): Promise<{
    date: string;
    windowStart: string;
    windowEnd: string;
    results: ChannelReconcileResult[];
  }> {
    const channels = await this.getChannelConfigs();
    this.assertConfigured(channels);

    const now = getSriLankaTime();
    const dateKey = now.format('YYYY-MM-DD');
    const dayStart = now.clone().hour(0).minute(0).second(0).millisecond(0);
    const noonHour = this.getRangedIntEnv('DAILY_UPDATES_CUTOFF_HOUR', 12, 0, 23);
    const noonMinute = this.getRangedIntEnv('DAILY_UPDATES_CUTOFF_MINUTE', 0, 0, 59);
    const reconcileHour = this.getRangedIntEnv('DAILY_UPDATES_RECONCILE_HOUR', 19, 0, 23);
    const reconcileMinute = this.getRangedIntEnv('DAILY_UPDATES_RECONCILE_MINUTE', 0, 0, 59);
    const windowStart = dayStart
      .clone()
      .hour(noonHour)
      .minute(noonMinute)
      .second(0)
      .millisecond(0);
    const reconcileCutoff = dayStart
      .clone()
      .hour(reconcileHour)
      .minute(reconcileMinute)
      .second(0)
      .millisecond(0);
    const windowEnd = now.isBefore(reconcileCutoff) ? now.clone() : reconcileCutoff;
    const state = await this.loadState();
    const results: ChannelReconcileResult[] = [];

    if (!windowEnd.isAfter(windowStart)) {
      return {
        date: dateKey,
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
        results: channels.map((channel) => ({
          channelId: channel.channelId,
          channelName: channel.name,
          noonMissingCount: 0,
          adjustedCount: 0,
          recoveredUserIds: [],
          unresolvedUserIds: [],
          skipped: true,
          reason: 'Reconcile window has not started yet',
        })),
      };
    }

    for (const channel of channels) {
      const channelState = this.ensureChannelState(state, channel.channelId);
      if (channelState.pendingNoonDate !== dateKey) {
        results.push({
          channelId: channel.channelId,
          channelName: channel.name,
          noonMissingCount: 0,
          adjustedCount: 0,
          recoveredUserIds: [],
          unresolvedUserIds: [],
          skipped: true,
          reason: 'No noon-check data available for today',
        });
        continue;
      }

      const noonMissingUserIds = this.normalizeStoredUserIds(
        channelState.pendingNoonMissingUserIds,
      );
      if (noonMissingUserIds.length === 0) {
        channelState.pendingNoonDate = undefined;
        channelState.pendingNoonMissingUserIds = [];
        results.push({
          channelId: channel.channelId,
          channelName: channel.name,
          noonMissingCount: 0,
          adjustedCount: 0,
          recoveredUserIds: [],
          unresolvedUserIds: [],
          skipped: true,
          reason: 'No pending noon-missing users for today',
        });
        continue;
      }

      const postedUserIds = await this.getPostedUserIds(
        channel.channelId,
        windowStart.toDate(),
        windowEnd.toDate(),
      );
      const postedSet = new Set(postedUserIds.map((item) => item.userId));
      const recoveredUserIds = noonMissingUserIds.filter((id) => postedSet.has(id));
      const unresolvedUserIds = noonMissingUserIds.filter((id) => !postedSet.has(id));

      for (const userId of recoveredUserIds) {
        const current = channelState.streaks[userId] || 0;
        channelState.streaks[userId] = Math.max(0, current - 1);
      }

      channelState.pendingNoonDate = undefined;
      channelState.pendingNoonMissingUserIds = [];

      results.push({
        channelId: channel.channelId,
        channelName: channel.name,
        noonMissingCount: noonMissingUserIds.length,
        adjustedCount: recoveredUserIds.length,
        recoveredUserIds,
        unresolvedUserIds,
        skipped: false,
      });
    }

    await this.saveState(state);
    return {
      date: dateKey,
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      results,
    };
  }

  private resolveStateFilePath(): string {
    const configuredPath = this.config.get<string>('DAILY_UPDATES_STATE_FILE')?.trim();
    if (configuredPath) return configuredPath;
    if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
      return '/tmp/daily-updates-state.json';
    }
    return path.resolve(process.cwd(), '.daily-updates-state.json');
  }

  private resolveMessagesFilePath(): string | undefined {
    const configuredPath = this.config.get<string>('DAILY_UPDATES_MESSAGES_FILE')?.trim();
    if (!configuredPath) return undefined;
    if (path.isAbsolute(configuredPath)) return configuredPath;
    return path.resolve(process.cwd(), configuredPath);
  }

  private resolveLeaveMapFilePath(): string | undefined {
    const configuredPath = this.config
      .get<string>('DAILY_UPDATES_LEAVE_MAP_FILE')
      ?.trim();
    if (!configuredPath) return undefined;
    if (path.isAbsolute(configuredPath)) return configuredPath;
    return path.resolve(process.cwd(), configuredPath);
  }

  private async getReminderMessage(): Promise<string> {
    const fileConfig = await this.loadMessageConfig();
    const selected = this.pickMessage(fileConfig?.reminder);
    if (selected) return selected;
    return this.config.get<string>('DAILY_UPDATES_REMINDER_MESSAGE') || DEFAULT_REMINDER_MESSAGE;
  }

  private async getMissingMessage(): Promise<string> {
    const fileConfig = await this.loadMessageConfig();
    const selected = this.pickMessage(fileConfig?.missing);
    if (selected) return selected;
    return this.config.get<string>('DAILY_UPDATES_MISSING_MESSAGE') || DEFAULT_MISSING_MESSAGE;
  }

  private async getShameMessage(): Promise<string> {
    const fileConfig = await this.loadMessageConfig();
    const selected = this.pickMessage(fileConfig?.shame);
    if (selected) return selected;
    return this.config.get<string>('DAILY_UPDATES_SHAME_MESSAGE') || DEFAULT_SHAME_MESSAGE;
  }

  private async loadMessageConfig(): Promise<DailyMessageConfig | null> {
    const dbMessages = await this.channelUsers.getDailyMessages();
    if (
      dbMessages.reminder.length > 0 ||
      dbMessages.missing.length > 0 ||
      dbMessages.shame.length > 0
    ) {
      return {
        reminder: dbMessages.reminder,
        missing: dbMessages.missing,
        shame: dbMessages.shame,
      };
    }

    if (!this.messagesFilePath) return null;
    try {
      const raw = await fs.readFile(this.messagesFilePath, 'utf8');
      const parsed = JSON.parse(raw) as DailyMessageConfig;
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private normalizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  private async loadLeaveNameMap(): Promise<Record<string, string>> {
    const dbMap = await this.channelUsers.getLeaveMap();
    if (Object.keys(dbMap).length > 0) {
      return this.normalizeLeaveNameMap(dbMap);
    }

    const fromEnv = this.config.get<string>('DAILY_UPDATES_LEAVE_MAP_JSON')?.trim();
    if (fromEnv) {
      try {
        const parsed = JSON.parse(fromEnv) as Record<string, string>;
        return this.normalizeLeaveNameMap(parsed);
      } catch {
        // Ignore invalid JSON and fallback to file.
      }
    }

    if (this.leaveMapFilePath) {
      try {
        const raw = await fs.readFile(this.leaveMapFilePath, 'utf8');
        const parsed = JSON.parse(raw) as Record<string, string>;
        return this.normalizeLeaveNameMap(parsed);
      } catch {
        return {};
      }
    }

    return {};
  }

  private normalizeLeaveNameMap(
    map: Record<string, string> | null | undefined,
  ): Record<string, string> {
    if (!map || typeof map !== 'object') return {};
    const normalized: Record<string, string> = {};
    for (const [name, discordUserId] of Object.entries(map)) {
      const normalizedName = this.normalizeName(String(name || ''));
      const userId = String(discordUserId || '').trim();
      if (!normalizedName || !userId) continue;
      normalized[normalizedName] = userId;
    }
    return normalized;
  }

  private async getOnLeaveDiscordUserIds(
    dayStart: Date,
    dayEnd: Date,
  ): Promise<Set<string>> {
    const excludeOnLeave =
      String(this.config.get<string>('DAILY_UPDATES_EXCLUDE_ON_LEAVE') || 'true')
        .trim()
        .toLowerCase() !== 'false';
    if (!excludeOnLeave) return new Set<string>();
    if (!this.clickup.isConfigured()) return new Set<string>();

    const nameMap = await this.loadLeaveNameMap();
    if (Object.keys(nameMap).length === 0) return new Set<string>();

    try {
      const tasks = await this.clickup.getTasks();
      const onLeaveTasks = this.clickup.filterTasksByDateRange(
        tasks,
        dayStart,
        dayEnd,
      );
      const userIds = new Set<string>();
      for (const task of onLeaveTasks) {
        const personName = this.normalizeName(getPersonNameFromTask(task));
        const mappedUserId = nameMap[personName];
        if (mappedUserId) {
          userIds.add(mappedUserId);
        }
      }
      return userIds;
    } catch {
      // Fail-open: if ClickUp lookup fails, continue without leave exclusions.
      return new Set<string>();
    }
  }

  private pickMessage(value?: string | string[]): string | null {
    if (!value) return null;
    if (Array.isArray(value)) {
      const options = value.map((item) => String(item).trim()).filter(Boolean);
      if (options.length === 0) return null;
      const idx = Math.floor(Math.random() * options.length);
      return options[idx];
    }
    const single = String(value).trim();
    return single || null;
  }

  private async getChannelConfigs(): Promise<DailyChannelConfig[]> {
    const techChannelId = this.config.get<string>('TECH_UPDATES_CHANNEL_ID')?.trim() || '';
    const marketingChannelId = this.config.get<string>('MARKETING_UPDATES_CHANNEL_ID')?.trim() || '';
    const techUsers = await this.channelUsers.getUserIds(
      'tech',
      this.config.get<string>('TECH_UPDATES_USER_IDS'),
    );
    const marketingUsers = await this.channelUsers.getUserIds(
      'marketing',
      this.config.get<string>('MARKETING_UPDATES_USER_IDS'),
    );
    const channels: DailyChannelConfig[] = [];

    if (techChannelId) {
      channels.push({
        key: 'tech',
        name: 'Tech Updates',
        channelId: techChannelId,
        expectedUserIds: techUsers,
      });
    }
    if (marketingChannelId) {
      channels.push({
        key: 'marketing',
        name: 'Marketing Updates',
        channelId: marketingChannelId,
        expectedUserIds: marketingUsers,
      });
    }
    return channels;
  }

  private async postChannelMessage(
    channelId: string,
    content: string,
    options?: PostMessageOptions,
  ): Promise<void> {
    if (!this.botToken) throw new Error('DISCORD_BOT_TOKEN not configured');
    const payload: any = { content };
    const imageUrl = options?.imageUrl?.trim();
    if (imageUrl && /^https?:\/\//i.test(imageUrl)) {
      payload.embeds = [{ image: { url: imageUrl } }];
    }
    await axios.post(
      `${this.discordApiBase}/channels/${channelId}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bot ${this.botToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      },
    );
  }

  private async getPostedUserIds(
    channelId: string,
    start: Date,
    end: Date,
  ): Promise<ValidUpdateMessage[]> {
    if (!this.botToken) throw new Error('DISCORD_BOT_TOKEN not configured');
    const postedByUser = new Map<string, string>();
    let beforeMessageId: string | undefined;

    for (let i = 0; i < 10; i++) {
      const { data } = await axios.get(`${this.discordApiBase}/channels/${channelId}/messages`, {
        headers: {
          Authorization: `Bot ${this.botToken}`,
          'Content-Type': 'application/json',
        },
        params: {
          limit: 100,
          ...(beforeMessageId ? { before: beforeMessageId } : {}),
        },
        timeout: 15000,
      });

      const messages = Array.isArray(data) ? data : [];
      if (messages.length === 0) break;

      let reachedOlderMessages = false;
      for (const message of messages) {
        const timestamp = new Date(message.timestamp);
        if (timestamp < start) {
          reachedOlderMessages = true;
          continue;
        }
        if (
          timestamp >= start &&
          timestamp < end &&
          message?.author?.bot !== true &&
          message?.author?.id &&
          this.isMeaningfulUpdateMessage(message)
        ) {
          const userId = String(message.author.id);
          if (!postedByUser.has(userId) && message?.id) {
            postedByUser.set(userId, String(message.id));
          }
        }
      }

      if (reachedOlderMessages) break;
      beforeMessageId = messages[messages.length - 1]?.id;
      if (!beforeMessageId) break;
    }

    return Array.from(postedByUser.entries()).map(([userId, messageId]) => ({
      userId,
      messageId,
    }));
  }

  private async addReactionToMessage(
    channelId: string,
    messageId: string,
    emoji: string,
  ): Promise<void> {
    if (!this.botToken) return;
    const encodedEmoji = encodeURIComponent(emoji);
    try {
      await axios.put(
        `${this.discordApiBase}/channels/${channelId}/messages/${messageId}/reactions/${encodedEmoji}/@me`,
        null,
        {
          headers: {
            Authorization: `Bot ${this.botToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        },
      );
    } catch {
      // Best-effort reaction: do not fail the whole check.
    }
  }

  private isMeaningfulUpdateMessage(message: any): boolean {
    const rawContent = String(message?.content || '');
    const content = rawContent.replace(/\s+/g, ' ').trim();
    const hasAttachments =
      Array.isArray(message?.attachments) && message.attachments.length > 0;
    const hasEmbeds = Array.isArray(message?.embeds) && message.embeds.length > 0;
    if (!content && !hasAttachments && !hasEmbeds) return false;

    const strictValidationEnabled =
      String(
        this.config.get<string>('DAILY_UPDATES_STRICT_MESSAGE_VALIDATION') ||
          'false',
      )
        .trim()
        .toLowerCase() === 'true';

    // Default mode is lenient because update channels are expected to contain
    // only daily updates; any non-empty text/attachment/embed counts.
    if (!strictValidationEnabled) return true;

    // Strict mode keeps previous filtering for text-heavy updates.
    if (!content) return false;
    const hasAlphaNum = /[A-Za-z0-9]/.test(content);
    if (!hasAlphaNum) return false;

    const minChars = this.getPositiveIntEnv('DAILY_UPDATES_MIN_CHARS', 20);
    const minWords = this.getPositiveIntEnv('DAILY_UPDATES_MIN_WORDS', 4);
    const words = (content.match(/[A-Za-z0-9][A-Za-z0-9'/-]*/g) || []).length;
    if (content.length < minChars || words < minWords) return false;

    return true;
  }

  private normalizeStoredUserIds(input: unknown): string[] {
    if (!Array.isArray(input)) return [];
    const ids = input
      .map((item) => String(item || '').trim())
      .filter((item) => /^\d{15,25}$/.test(item));
    return Array.from(new Set(ids));
  }

  private getPositiveIntEnv(key: string, fallback: number): number {
    const value = Number(this.config.get<string>(key));
    if (!Number.isFinite(value) || value <= 0) return fallback;
    return Math.floor(value);
  }

  private getRangedIntEnv(
    key: string,
    fallback: number,
    min: number,
    max: number,
  ): number {
    const value = Number(this.config.get<string>(key));
    if (!Number.isFinite(value)) return fallback;
    const intValue = Math.floor(value);
    if (intValue < min || intValue > max) return fallback;
    return intValue;
  }

  private ensureChannelState(state: DailyState, channelId: string): DailyChannelState {
    if (!state.channelStates[channelId]) {
      state.channelStates[channelId] = {
        streaks: {},
      };
    }
    return state.channelStates[channelId];
  }

  private async loadState(): Promise<DailyState> {
    const dbState = await this.channelUsers.getDailyState();
    if (dbState && typeof dbState === 'object') {
      return { channelStates: dbState };
    }

    try {
      const raw = await fs.readFile(this.stateFilePath, 'utf8');
      const parsed = JSON.parse(raw) as DailyState;
      if (!parsed || typeof parsed !== 'object' || !parsed.channelStates) {
        return { channelStates: {} };
      }
      return parsed;
    } catch {
      return { channelStates: {} };
    }
  }

  private async saveState(state: DailyState): Promise<void> {
    if (this.channelUsers.isEnabled()) {
      await this.channelUsers.setDailyState(state.channelStates);
      return;
    }
    const dir = path.dirname(this.stateFilePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.stateFilePath, JSON.stringify(state, null, 2), 'utf8');
  }

  private toMentions(userIds: string[]): string {
    return userIds.map((id) => `<@${id}>`).join(' ');
  }

  private renderTemplate(template: string, mentions: string): string {
    return template.includes('{mentions}')
      ? template.replaceAll('{mentions}', mentions)
      : `${template}\n${mentions}`;
  }

  private assertConfigured(channels: DailyChannelConfig[]): void {
    if (!this.botToken) {
      throw new Error('DISCORD_BOT_TOKEN not configured');
    }
    if (channels.length === 0) {
      throw new Error('No daily update channels configured');
    }
    const invalid = channels.find((channel) => channel.expectedUserIds.length === 0);
    if (invalid) {
      throw new Error(`Expected user list is empty for channel: ${invalid.name}`);
    }
  }
}
