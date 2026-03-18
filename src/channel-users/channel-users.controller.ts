import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ChannelKey, ChannelUsersService } from './channel-users.service';
import { Public } from '../auth/public.decorator';

@Controller()
export class ChannelUsersController {
  constructor(private readonly channelUsers: ChannelUsersService) {}

  @Public()
  @Get('admin')
  @Header('Content-Type', 'text/html')
  adminPage(): string {
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Leave Notification Admin</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; max-width: 900px; }
    h2 { margin-top: 28px; }
    textarea { width: 100%; min-height: 100px; font-family: monospace; }
    .row { display: flex; gap: 10px; margin: 10px 0; flex-wrap: wrap; }
    button { padding: 8px 12px; cursor: pointer; }
    input[type=text] { width: 100%; padding: 8px; }
    .card { border: 1px solid #ddd; border-radius: 8px; padding: 14px; margin: 12px 0; }
    pre { background: #f7f7f7; padding: 12px; border-radius: 8px; overflow: auto; }
    .muted { color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <h1>Leave Notification Admin</h1>
  <div class="card">
    <label>API Key (for protected endpoints)</label>
    <input id="apiKey" type="text" placeholder="Paste API_KEY here" />
    <div class="row">
      <button onclick="testDbConnection()">Test DB Connection</button>
    </div>
    <div class="muted">This page is public, but admin actions require API key in requests.</div>
  </div>

  <h2>Channel User IDs</h2>
  <div class="card">
    <strong>Tech User IDs</strong>
    <textarea id="techIds" placeholder="One ID per line or comma separated"></textarea>
    <div class="row">
      <button onclick="saveChannel('tech')">Save Tech IDs</button>
    </div>
  </div>
  <div class="card">
    <strong>Marketing User IDs</strong>
    <textarea id="marketingIds" placeholder="One ID per line or comma separated"></textarea>
    <div class="row">
      <button onclick="saveChannel('marketing')">Save Marketing IDs</button>
      <button onclick="seedFromEnv()">Seed Both From Env</button>
      <button onclick="loadUsers()">Refresh</button>
    </div>
  </div>

  <h2>Message Templates (Mongo)</h2>
  <div class="card">
    <strong>Reminder Templates (one per line)</strong>
    <textarea id="msgReminder" placeholder="Each line is one template"></textarea>
    <strong>Missing Templates (one per line)</strong>
    <textarea id="msgMissing" placeholder="Use {mentions} placeholder"></textarea>
    <strong>Shame Templates (one per line)</strong>
    <textarea id="msgShame" placeholder="Use {mentions} placeholder"></textarea>
    <div class="row">
      <button onclick="saveMessages()">Save Templates</button>
    </div>
  </div>

  <h2>Leave Name Mapping (Mongo)</h2>
  <div class="card">
    <strong>ClickUp Name -> Discord User ID JSON</strong>
    <textarea id="leaveMap" placeholder='{"Anushujan":"1117822907696042106"}'></textarea>
    <div class="row">
      <button onclick="saveLeaveMap()">Save Leave Map</button>
    </div>
  </div>

  <h2>Daily State (Mongo)</h2>
  <div class="card">
    <div class="row">
      <button onclick="viewState()">View Current State</button>
      <button onclick="resetState()">Reset State</button>
    </div>
  </div>

  <h2>Manual Triggers</h2>
  <div class="card">
    <div class="row">
      <button onclick="runAllDailyChecks()">Run All Daily Checks</button>
      <button onclick="trigger('/check-now')">Check Now</button>
      <button onclick="trigger('/test-daily-summary')">Daily Leave Summary</button>
      <button onclick="trigger('/test-monthly-summary')">Monthly Leave Summary</button>
      <button onclick="trigger('/test-weekly-summary')">Weekly Leave Summary</button>
      <button onclick="trigger('/test-squad-notification')">Squad Notification</button>
      <button onclick="trigger('/daily-updates/reminder')">Daily Reminder</button>
      <button onclick="trigger('/daily-updates/noon-check')">Daily Noon Check</button>
    </div>
  </div>

  <h2>Response</h2>
  <pre id="out">Ready</pre>

  <script>
    const out = document.getElementById('out');
    const apiKeyInput = document.getElementById('apiKey');
    const techIds = document.getElementById('techIds');
    const marketingIds = document.getElementById('marketingIds');
    const msgReminder = document.getElementById('msgReminder');
    const msgMissing = document.getElementById('msgMissing');
    const msgShame = document.getElementById('msgShame');
    const leaveMap = document.getElementById('leaveMap');

    const API_KEY_STORAGE_KEY = 'leave_notification_admin_api_key';
    let apiLoadTimer = null;

    function apiHeaders() {
      const apiKey = apiKeyInput.value.trim();
      const headers = { 'Content-Type': 'application/json' };
      if (apiKey) headers['x-api-key'] = apiKey;
      return headers;
    }

    function setOut(data) {
      out.textContent = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    }

    async function loadUsers() {
      try {
        if (!apiKeyInput.value.trim()) {
          setOut('Enter API key to load channel users and config data.');
          return;
        }
        const res = await fetch('/admin/channel-users', { headers: apiHeaders() });
        const data = await res.json();
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            return setOut('Unauthorized. Add valid API key, then click Refresh.');
          }
          return setOut(data);
        }
        techIds.value = (data.tech || []).join('\\n');
        marketingIds.value = (data.marketing || []).join('\\n');
        msgReminder.value = (data.messages?.reminder || []).join('\\n');
        msgMissing.value = (data.messages?.missing || []).join('\\n');
        msgShame.value = (data.messages?.shame || []).join('\\n');
        leaveMap.value = JSON.stringify(data.leaveMap || {}, null, 2);
        setOut(data);
      } catch (e) {
        setOut(String(e));
      }
    }

    async function testDbConnection() {
      try {
        const res = await fetch('/admin/db-status', { headers: apiHeaders() });
        const data = await res.json();
        setOut(data);
        if (res.ok && data && data.ok) {
          await loadUsers();
        }
      } catch (e) {
        setOut(String(e));
      }
    }

    async function saveChannel(channelKey) {
      const value = channelKey === 'tech' ? techIds.value : marketingIds.value;
      try {
        const res = await fetch('/admin/channel-users/' + channelKey, {
          method: 'PUT',
          headers: apiHeaders(),
          body: JSON.stringify({ userIds: value }),
        });
        const data = await res.json();
        setOut(data);
        if (res.ok) loadUsers();
      } catch (e) {
        setOut(String(e));
      }
    }

    async function seedFromEnv() {
      try {
        const res = await fetch('/admin/channel-users/seed-from-env', {
          method: 'POST',
          headers: apiHeaders(),
        });
        const data = await res.json();
        setOut(data);
        if (res.ok) loadUsers();
      } catch (e) {
        setOut(String(e));
      }
    }

    async function trigger(path) {
      try {
        const res = await fetch(path, { headers: apiHeaders() });
        const data = await res.json();
        setOut({ endpoint: path, status: res.status, data });
      } catch (e) {
        setOut(String(e));
      }
    }

    async function runAllDailyChecks() {
      try {
        const headers = apiHeaders();
        const reminderRes = await fetch('/daily-updates/reminder', { headers });
        const reminderData = await reminderRes.json();
        const noonRes = await fetch('/daily-updates/noon-check', { headers });
        const noonData = await noonRes.json();
        setOut({
          action: 'run-all-daily-checks',
          reminder: { status: reminderRes.status, data: reminderData },
          noonCheck: { status: noonRes.status, data: noonData },
        });
      } catch (e) {
        setOut(String(e));
      }
    }

    async function saveMessages() {
      try {
        const res = await fetch('/admin/daily-config/messages', {
          method: 'PUT',
          headers: apiHeaders(),
          body: JSON.stringify({
            reminder: msgReminder.value,
            missing: msgMissing.value,
            shame: msgShame.value,
          }),
        });
        const data = await res.json();
        setOut(data);
        if (res.ok) loadUsers();
      } catch (e) {
        setOut(String(e));
      }
    }

    async function saveLeaveMap() {
      try {
        const parsed = JSON.parse(leaveMap.value || '{}');
        const res = await fetch('/admin/daily-config/leave-map', {
          method: 'PUT',
          headers: apiHeaders(),
          body: JSON.stringify({ map: parsed }),
        });
        const data = await res.json();
        setOut(data);
        if (res.ok) loadUsers();
      } catch (e) {
        setOut('Invalid JSON for leave map: ' + String(e));
      }
    }

    async function viewState() {
      try {
        const res = await fetch('/admin/daily-config/state', { headers: apiHeaders() });
        const data = await res.json();
        setOut(data);
      } catch (e) {
        setOut(String(e));
      }
    }

    async function resetState() {
      try {
        const res = await fetch('/admin/daily-config/state/reset', {
          method: 'POST',
          headers: apiHeaders(),
        });
        const data = await res.json();
        setOut(data);
      } catch (e) {
        setOut(String(e));
      }
    }

    apiKeyInput.addEventListener('input', () => {
      try {
        localStorage.setItem(API_KEY_STORAGE_KEY, apiKeyInput.value.trim());
      } catch (_) {}
      if (apiLoadTimer) {
        clearTimeout(apiLoadTimer);
      }
      apiLoadTimer = setTimeout(() => {
        loadUsers();
      }, 300);
    });

    try {
      const savedApiKey = localStorage.getItem(API_KEY_STORAGE_KEY) || '';
      if (savedApiKey) {
        apiKeyInput.value = savedApiKey;
      }
    } catch (_) {}

    loadUsers();
  </script>
</body>
</html>`;
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

  private validateChannelKey(value: string): ChannelKey {
    if (value !== 'tech' && value !== 'marketing') {
      throw new BadRequestException('channelKey must be tech or marketing');
    }
    return value;
  }
}
