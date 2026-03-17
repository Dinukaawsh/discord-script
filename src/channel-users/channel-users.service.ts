import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Collection, Db, MongoClient } from 'mongodb';

export type ChannelKey = 'tech' | 'marketing';

type ChannelUsersDoc = {
  channelKey: ChannelKey | string;
  userIds: string[];
  updatedAt: Date;
};

type DailyMessagesDoc = {
  _id: 'default';
  reminder?: string[];
  missing?: string[];
  shame?: string[];
  updatedAt: Date;
};

type LeaveMapDoc = {
  _id: 'default';
  map: Record<string, string>;
  updatedAt: Date;
};

type DailyStateDoc = {
  _id: 'default';
  channelStates: Record<string, { lastCheckedDate?: string; streaks: Record<string, number> }>;
  updatedAt: Date;
};

@Injectable()
export class ChannelUsersService {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private usersCollection: Collection<ChannelUsersDoc> | null = null;
  private messagesCollection: Collection<DailyMessagesDoc> | null = null;
  private leaveMapCollection: Collection<LeaveMapDoc> | null = null;
  private stateCollection: Collection<DailyStateDoc> | null = null;
  private connectionPromise: Promise<void> | null = null;

  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    return !!this.config.get<string>('MONGODB_URI')?.trim();
  }

  async getUserIds(
    channelKey: ChannelKey,
    fallbackRaw: string | undefined,
  ): Promise<string[]> {
    const fallback = this.normalizeUserIds(fallbackRaw);
    if (!this.isEnabled()) return fallback;

    try {
      const collection = await this.getUsersCollection();
      let doc = await collection.findOne({ channelKey });
      if (!doc) {
        // Fallback scan to tolerate historical casing/whitespace mismatches.
        const docs = await collection.find({}).toArray();
        doc = docs.find(
          (item) => this.normalizeChannelKey(item?.channelKey) === channelKey,
        ) || null;
      }
      if (!doc || !Array.isArray(doc.userIds)) return fallback;
      const normalized = this.normalizeUserIds(doc.userIds);
      return normalized.length > 0 ? normalized : fallback;
    } catch {
      return fallback;
    }
  }

  async getAll(): Promise<Record<ChannelKey, string[]>> {
    const defaults: Record<ChannelKey, string[]> = { tech: [], marketing: [] };
    if (!this.isEnabled()) return defaults;

    const collection = await this.getUsersCollection();
    const docs = await collection.find({}).toArray();

    for (const doc of docs) {
      const key = this.normalizeChannelKey(doc.channelKey);
      if (key === 'tech' || key === 'marketing') {
        defaults[key] = this.normalizeUserIds(doc.userIds);
      }
    }
    return defaults;
  }

  async set(channelKey: ChannelKey, userIdsInput: string | string[]): Promise<string[]> {
    if (!this.isEnabled()) {
      throw new Error('MONGODB_URI is not configured');
    }

    const userIds = this.normalizeUserIds(userIdsInput);
    const collection = await this.getUsersCollection();
    await collection.updateOne(
      { channelKey },
      {
        $set: {
          channelKey,
          userIds,
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    );
    return userIds;
  }

  async seedFromEnv(): Promise<Record<ChannelKey, string[]>> {
    if (!this.isEnabled()) {
      throw new Error('MONGODB_URI is not configured');
    }
    const tech = await this.set(
      'tech',
      this.config.get<string>('TECH_UPDATES_USER_IDS'),
    );
    const marketing = await this.set(
      'marketing',
      this.config.get<string>('MARKETING_UPDATES_USER_IDS'),
    );
    return { tech, marketing };
  }

  async getDailyMessages(): Promise<{ reminder: string[]; missing: string[]; shame: string[] }> {
    if (!this.isEnabled()) {
      return { reminder: [], missing: [], shame: [] };
    }
    const collection = await this.getMessagesCollection();
    const doc = await collection.findOne({ _id: 'default' });
    return {
      reminder: this.normalizeMessageList(doc?.reminder),
      missing: this.normalizeMessageList(doc?.missing),
      shame: this.normalizeMessageList(doc?.shame),
    };
  }

  async setDailyMessages(input: {
    reminder?: string | string[];
    missing?: string | string[];
    shame?: string | string[];
  }): Promise<{ reminder: string[]; missing: string[]; shame: string[] }> {
    if (!this.isEnabled()) {
      throw new Error('MONGODB_URI is not configured');
    }
    const reminder = this.normalizeMessageList(input.reminder);
    const missing = this.normalizeMessageList(input.missing);
    const shame = this.normalizeMessageList(input.shame);
    const collection = await this.getMessagesCollection();
    await collection.updateOne(
      { _id: 'default' },
      {
        $set: {
          _id: 'default',
          reminder,
          missing,
          shame,
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    );
    return { reminder, missing, shame };
  }

  async getLeaveMap(): Promise<Record<string, string>> {
    if (!this.isEnabled()) return {};
    const collection = await this.getLeaveMapCollection();
    const doc = await collection.findOne({ _id: 'default' });
    return this.normalizeLeaveMap(doc?.map || {});
  }

  async setLeaveMap(input: Record<string, string>): Promise<Record<string, string>> {
    if (!this.isEnabled()) {
      throw new Error('MONGODB_URI is not configured');
    }
    const map = this.normalizeLeaveMap(input);
    const collection = await this.getLeaveMapCollection();
    await collection.updateOne(
      { _id: 'default' },
      {
        $set: {
          _id: 'default',
          map,
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    );
    return map;
  }

  async getDailyState(): Promise<Record<string, { lastCheckedDate?: string; streaks: Record<string, number> }> | null> {
    if (!this.isEnabled()) return null;
    const collection = await this.getStateCollection();
    const doc = await collection.findOne({ _id: 'default' });
    if (!doc || !doc.channelStates || typeof doc.channelStates !== 'object') return null;
    return doc.channelStates;
  }

  async setDailyState(
    state: Record<string, { lastCheckedDate?: string; streaks: Record<string, number> }>,
  ): Promise<void> {
    if (!this.isEnabled()) {
      throw new Error('MONGODB_URI is not configured');
    }
    const collection = await this.getStateCollection();
    await collection.updateOne(
      { _id: 'default' },
      {
        $set: {
          _id: 'default',
          channelStates: state,
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    );
  }

  async resetDailyState(): Promise<void> {
    if (!this.isEnabled()) {
      throw new Error('MONGODB_URI is not configured');
    }
    const collection = await this.getStateCollection();
    await collection.deleteOne({ _id: 'default' });
  }

  async ping(): Promise<{
    mongoEnabled: boolean;
    ok: boolean;
    error?: string;
  }> {
    if (!this.isEnabled()) {
      return {
        mongoEnabled: false,
        ok: false,
        error: 'MONGODB_URI is not configured',
      };
    }
    try {
      if (!this.connectionPromise) {
        this.connectionPromise = this.connect();
      }
      await this.connectionPromise;
      return {
        mongoEnabled: true,
        ok: true,
      };
    } catch (err: any) {
      return {
        mongoEnabled: true,
        ok: false,
        error: err?.message || 'MongoDB connection failed',
      };
    }
  }

  private async getUsersCollection(): Promise<Collection<ChannelUsersDoc>> {
    if (!this.connectionPromise) {
      this.connectionPromise = this.connect();
    }
    await this.connectionPromise;
    if (!this.usersCollection) {
      throw new Error('Mongo collection is not initialized');
    }
    return this.usersCollection;
  }

  private async getMessagesCollection(): Promise<Collection<DailyMessagesDoc>> {
    if (!this.connectionPromise) {
      this.connectionPromise = this.connect();
    }
    await this.connectionPromise;
    if (!this.messagesCollection) {
      throw new Error('Mongo messages collection is not initialized');
    }
    return this.messagesCollection;
  }

  private async getLeaveMapCollection(): Promise<Collection<LeaveMapDoc>> {
    if (!this.connectionPromise) {
      this.connectionPromise = this.connect();
    }
    await this.connectionPromise;
    if (!this.leaveMapCollection) {
      throw new Error('Mongo leave map collection is not initialized');
    }
    return this.leaveMapCollection;
  }

  private async getStateCollection(): Promise<Collection<DailyStateDoc>> {
    if (!this.connectionPromise) {
      this.connectionPromise = this.connect();
    }
    await this.connectionPromise;
    if (!this.stateCollection) {
      throw new Error('Mongo state collection is not initialized');
    }
    return this.stateCollection;
  }

  private async connect(): Promise<void> {
    const uri = this.config.get<string>('MONGODB_URI')?.trim();
    if (!uri) {
      throw new Error('MONGODB_URI is not configured');
    }
    const dbName = this.config.get<string>('MONGODB_DB_NAME')?.trim() || 'leave-notification';
    this.client = new MongoClient(uri);
    await this.client.connect();
    this.db = this.client.db(dbName);
    this.usersCollection = this.db.collection<ChannelUsersDoc>('channel_user_configs');
    this.messagesCollection = this.db.collection<DailyMessagesDoc>('daily_update_messages');
    this.leaveMapCollection = this.db.collection<LeaveMapDoc>('leave_discord_map');
    this.stateCollection = this.db.collection<DailyStateDoc>('daily_update_state');
    await this.usersCollection.createIndex({ channelKey: 1 }, { unique: true });
  }

  private normalizeUserIds(input: string | string[] | undefined): string[] {
    const raw = Array.isArray(input) ? input.join(',') : input || '';
    const ids = raw
      .split(/[\n,\s]+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item) => /^\d{15,25}$/.test(item));
    return Array.from(new Set(ids));
  }

  private normalizeChannelKey(value: unknown): ChannelKey | null {
    const normalized = String(value || '')
      .trim()
      .toLowerCase();
    if (normalized === 'tech' || normalized === 'marketing') {
      return normalized;
    }
    return null;
  }

  private normalizeMessageList(input: string | string[] | undefined): string[] {
    if (Array.isArray(input)) {
      return input.map((item) => String(item || '').trim()).filter(Boolean);
    }
    if (!input) return [];
    return String(input)
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private normalizeLeaveMap(input: Record<string, string> | undefined): Record<string, string> {
    const out: Record<string, string> = {};
    if (!input || typeof input !== 'object') return out;
    for (const [key, value] of Object.entries(input)) {
      const name = String(key || '').trim();
      const userId = String(value || '').trim();
      if (!name || !/^\d{15,25}$/.test(userId)) continue;
      out[name] = userId;
    }
    return out;
  }
}
