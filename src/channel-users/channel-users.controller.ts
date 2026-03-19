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
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Leave Notification Admin</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; margin: 0; padding: 24px; max-width: 960px; background: #f4f6f9; color: #1a1a2e; }
    h1 { font-size: 22px; margin: 0 0 20px; color: #1a1a2e; }
    h2 { font-size: 15px; font-weight: 600; margin: 28px 0 8px; text-transform: uppercase; letter-spacing: 0.5px; color: #555; }
    .card { background: #fff; border: 1px solid #e0e4ea; border-radius: 10px; padding: 16px; margin-bottom: 12px; }
    label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; color: #333; }
    textarea { width: 100%; min-height: 90px; font-family: monospace; font-size: 13px; padding: 8px; border: 1px solid #dde1e8; border-radius: 6px; resize: vertical; background: #fafbfc; }
    textarea:focus, input[type=text]:focus, input[type=password]:focus, select:focus { outline: none; border-color: #5865f2; box-shadow: 0 0 0 3px rgba(88,101,242,0.12); }
    input[type=text], input[type=password] { width: 100%; padding: 8px 10px; border: 1px solid #dde1e8; border-radius: 6px; font-size: 14px; background: #fafbfc; }
    select { padding: 8px 10px; border: 1px solid #dde1e8; border-radius: 6px; font-size: 14px; background: #fafbfc; cursor: pointer; }
    .row { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; align-items: center; }
    button { padding: 7px 14px; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500; background: #5865f2; color: #fff; transition: background 0.15s; }
    button:hover { background: #4752c4; }
    button.secondary { background: #e8eaf0; color: #333; }
    button.secondary:hover { background: #d5d8e3; }
    button.danger { background: #ed4245; }
    button.danger:hover { background: #c03537; }
    button.success { background: #3ba55c; }
    button.success:hover { background: #2d8049; }
    button.small { padding: 5px 10px; font-size: 12px; }
    pre { background: #1e1e2e; color: #cdd6f4; padding: 14px; border-radius: 8px; overflow: auto; font-size: 12px; max-height: 400px; margin: 0; }
    .muted { color: #888; font-size: 12px; margin-top: 6px; }
    .mention-grid { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; min-height: 32px; }
    .mention-grid button { background: #5865f2; font-size: 12px; padding: 4px 10px; border-radius: 20px; }
    .mention-grid button:hover { background: #4752c4; }
    .role-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 8px; }
    .composer-textarea { min-height: 110px; border-top-left-radius: 0; border-top-right-radius: 0; }
    .fmt-toolbar { display: flex; gap: 4px; flex-wrap: wrap; background: #f0f2f5; border: 1px solid #dde1e8; border-bottom: none; border-radius: 6px 6px 0 0; padding: 6px 8px; }
    .fmt-toolbar button { background: #fff; color: #333; border: 1px solid #dde1e8; border-radius: 4px; padding: 3px 9px; font-size: 13px; font-weight: 600; min-width: 32px; }
    .fmt-toolbar button:hover { background: #5865f2; color: #fff; border-color: #5865f2; }
    .api-key-hint { font-size: 12px; color: #e67e22; margin-top: 4px; display: none; }
    .section-divider { border: none; border-top: 1px solid #e0e4ea; margin: 20px 0; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 11px; font-weight: 600; background: #5865f2; color: #fff; margin-left: 8px; vertical-align: middle; }
  </style>
</head>
<body>
  <h1>Leave Notification Admin</h1>

  <div class="card">
    <label>API Key</label>
    <input id="apiKey" type="password" placeholder="Paste API_KEY here (not saved — re-enter each session)" autocomplete="off" />
    <div id="apiKeyHint" class="api-key-hint">Enter your API key above to load data.</div>
    <div class="row">
      <button onclick="testDbConnection()">Test DB Connection</button>
      <button class="secondary" onclick="loadUsers()">Refresh Data</button>
    </div>
    <div class="muted">API key is session-only and never saved to browser storage.</div>
  </div>

  <h2>Channel User IDs</h2>
  <div class="card">
    <label>Tech Channel — User IDs</label>
    <textarea id="techIds" placeholder="One ID per line or comma separated"></textarea>
    <div class="row">
      <button onclick="saveChannel('tech')">Save Tech IDs</button>
    </div>
  </div>
  <div class="card">
    <label>Marketing Channel — User IDs</label>
    <textarea id="marketingIds" placeholder="One ID per line or comma separated"></textarea>
    <div class="row">
      <button onclick="saveChannel('marketing')">Save Marketing IDs</button>
      <button class="secondary" onclick="seedFromEnv()">Seed Both From Env</button>
    </div>
  </div>
  <div class="card">
    <label>All Users — Composer Mentions <span class="badge">Composer</span></label>
    <p class="muted" style="margin:4px 0 8px">These IDs appear as mention buttons in the Discord Message Composer. Add everyone here regardless of which daily-update channel they belong to.</p>
    <textarea id="allUserIds" placeholder="One ID per line or comma separated"></textarea>
    <div class="row">
      <button onclick="saveAllUsers()">Save All Users</button>
    </div>
  </div>

  <h2>Message Templates</h2>
  <div class="card">
    <label>Reminder Templates (one per line)</label>
    <textarea id="msgReminder" placeholder="Each line is one template — picked in rotation"></textarea>
    <label style="margin-top:12px">Missing Update Templates (one per line)</label>
    <textarea id="msgMissing" placeholder="Use {mentions} placeholder"></textarea>
    <label style="margin-top:12px">Shame Templates — 3-day streak (one per line)</label>
    <textarea id="msgShame" placeholder="Use {mentions} placeholder"></textarea>
    <div class="row">
      <button onclick="saveMessages()">Save Templates</button>
    </div>
  </div>

  <h2>Leave Name Mapping</h2>
  <div class="card">
    <label>ClickUp Name → Discord User ID (JSON)</label>
    <textarea id="leaveMap" placeholder='{"Anushujan":"1117822907696042106"}'></textarea>
    <div class="row">
      <button onclick="saveLeaveMap()">Save Leave Map</button>
    </div>
  </div>

  <h2>Daily State</h2>
  <div class="card">
    <div class="row">
      <button class="secondary" onclick="viewState()">View Current State</button>
      <button class="danger" onclick="resetState()">Reset State</button>
    </div>
  </div>

  <h2>Discord Message Composer <span class="badge">New</span></h2>
  <div class="card">
    <div class="row" style="margin-top:0">
      <div>
        <label style="margin-bottom:4px">Channel</label>
        <select id="composerChannel" onchange="renderMentionUsers()">
          <option value="tech">Tech</option>
          <option value="marketing">Marketing</option>
          <option value="general">General</option>
          <option value="tools">Tools</option>
        </select>
      </div>
    </div>

    <label style="margin-top:14px">Message</label>
    <div class="fmt-toolbar">
      <button type="button" onclick="fmt('bold')" title="Bold"><b>B</b></button>
      <button type="button" onclick="fmt('italic')" title="Italic"><i>I</i></button>
      <button type="button" onclick="fmt('underline')" title="Underline"><u>U</u></button>
      <button type="button" onclick="fmt('strike')" title="Strikethrough"><s>S</s></button>
      <button type="button" onclick="fmt('code')" title="Inline code">&#96;c&#96;</button>
      <button type="button" onclick="fmt('codeblock')" title="Code block">&#96;&#96;&#96;</button>
      <button type="button" onclick="fmt('quote')" title="Block quote">&gt; q</button>
      <button type="button" onclick="fmt('spoiler')" title="Spoiler">||s||</button>
    </div>
    <textarea id="composerMessage" class="composer-textarea" placeholder="Type your message... use toolbar or Discord markdown: **bold**, *italic*, > quote"></textarea>

    <label style="margin-top:12px">Mention Users <span class="muted" style="font-weight:400">(click to insert at cursor)</span></label>
    <div id="mentionUsers" class="mention-grid"><span class="muted">Load data first to see users.</span></div>

    <label style="margin-top:12px">Mention Roles</label>
    <div class="role-row">
      <button class="small" onclick="insertText('@everyone')">@everyone</button>
      <button class="small" onclick="insertText('@here')">@here</button>
      <input id="customRoleId" type="text" placeholder="Role ID" style="width:160px" />
      <button class="small secondary" onclick="insertCustomRole()">Insert Role</button>
    </div>

    <label style="margin-top:12px">Attach Image from Device <span class="muted" style="font-weight:400">(optional — overrides GIF URL if both set)</span></label>
    <input id="composerFile" type="file" accept="image/*" onchange="onFileSelect()" style="font-size:13px" />
    <div id="filePreview" style="margin-top:6px;display:none">
      <img id="filePreviewImg" style="max-height:80px;border-radius:6px;border:1px solid #dde1e8" />
      <button type="button" class="small secondary" style="margin-left:8px;vertical-align:top" onclick="clearFile()">Remove</button>
    </div>
    <label style="margin-top:10px">GIF URL <span class="muted" style="font-weight:400">(optional — paste a Giphy link)</span></label>
    <input id="composerImage" type="text" placeholder="https://media.giphy.com/media/.../giphy.gif" />

    <div class="row" style="margin-top:14px">
      <button class="success" onclick="postComposerMessage()">Post to Discord</button>
      <button class="secondary small" onclick="clearComposer()">Clear</button>
    </div>
  </div>

  <h2>Manual Triggers</h2>
  <div class="card">
    <div class="row">
      <button onclick="runAllDailyChecks()">Run All Daily Checks</button>
      <button class="secondary" onclick="trigger('/check-now')">Check Now</button>
      <button class="secondary" onclick="trigger('/test-daily-summary')">Daily Leave Summary</button>
      <button class="secondary" onclick="trigger('/test-monthly-summary')">Monthly Summary</button>
      <button class="secondary" onclick="trigger('/test-weekly-summary')">Weekly Summary</button>
      <button class="secondary" onclick="trigger('/test-squad-notification')">Squad Notification</button>
      <button class="secondary" onclick="trigger('/daily-updates/reminder')">Daily Reminder</button>
      <button class="secondary" onclick="trigger('/daily-updates/noon-check')">Noon Check</button>
      <button class="secondary" onclick="trigger('/daily-updates/evening-reconcile')">Evening Reconcile</button>
    </div>
  </div>

  <h2>Response</h2>
  <pre id="out">Ready — enter API key and click Refresh Data.</pre>

  <script>
    const out = document.getElementById('out');
    const apiKeyInput = document.getElementById('apiKey');
    const techIds = document.getElementById('techIds');
    const marketingIds = document.getElementById('marketingIds');
    const allUserIds = document.getElementById('allUserIds');
    const msgReminder = document.getElementById('msgReminder');
    const msgMissing = document.getElementById('msgMissing');
    const msgShame = document.getElementById('msgShame');
    const leaveMap = document.getElementById('leaveMap');

    // API key lives in memory only — never saved to localStorage or sessionStorage
    let apiLoadTimer = null;
    let channelUserMap = { tech: [], marketing: [] };
    let allUsersForComposer = [];
    let discordIdToName = {};

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
      if (!apiKeyInput.value.trim()) {
        document.getElementById('apiKeyHint').style.display = 'block';
        setOut('Enter API key above, then click Refresh Data.');
        return;
      }
      document.getElementById('apiKeyHint').style.display = 'none';
      try {
        const res = await fetch('/admin/channel-users', { headers: apiHeaders() });
        const data = await res.json();
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            return setOut('Unauthorized — check your API key and try again.');
          }
          return setOut(data);
        }
        techIds.value = (data.tech || []).join('\\n');
        marketingIds.value = (data.marketing || []).join('\\n');
        allUserIds.value = (data.allUsers || []).join('\\n');
        msgReminder.value = (data.messages?.reminder || []).join('\\n');
        msgMissing.value = (data.messages?.missing || []).join('\\n');
        msgShame.value = (data.messages?.shame || []).join('\\n');
        leaveMap.value = JSON.stringify(data.leaveMap || {}, null, 2);

        // Build user maps and reverse name lookup for composer
        channelUserMap = { tech: data.tech || [], marketing: data.marketing || [] };
        allUsersForComposer = data.allUsers || [];
        discordIdToName = {};
        for (const [name, id] of Object.entries(data.leaveMap || {})) {
          if (!discordIdToName[id]) discordIdToName[id] = name;
        }
        renderMentionUsers();
        setOut(data);
      } catch (e) {
        setOut(String(e));
      }
    }

    // --- Composer ---

    function renderMentionUsers() {
      const channel = document.getElementById('composerChannel').value;
      // Prefer the global all-users list; fall back to channel-specific list
      const ids = allUsersForComposer.length > 0
        ? allUsersForComposer
        : (channelUserMap[channel] || []);
      const container = document.getElementById('mentionUsers');
      if (ids.length === 0) {
        container.innerHTML = '<span class="muted">Add user IDs in the "All Users" section above to populate mention buttons.</span>';
        return;
      }
      container.innerHTML = ids.map(id => {
        const name = discordIdToName[id] || id;
        const shortName = name.split(' ')[0];
        return '<button type="button" onclick="insertText(\\' <@' + id + '>\\' )" title="' + id + '">' + shortName + '</button>';
      }).join('');
    }

    function fmt(type) {
      const ta = document.getElementById('composerMessage');
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const sel = ta.value.substring(start, end);
      const placeholder = { bold:'text', italic:'text', underline:'text', strike:'text', code:'code', codeblock:'code', quote:'quote', spoiler:'text' }[type] || 'text';
      const word = sel || placeholder;
      let wrapped;
      if (type === 'bold')      wrapped = '**' + word + '**';
      else if (type === 'italic')    wrapped = '*' + word + '*';
      else if (type === 'underline') wrapped = '__' + word + '__';
      else if (type === 'strike')    wrapped = '~~' + word + '~~';
      else if (type === 'code')      wrapped = '\`' + word + '\`';
      else if (type === 'codeblock') wrapped = '\`\`\`\\n' + word + '\\n\`\`\`';
      else if (type === 'quote')     wrapped = '> ' + word;
      else if (type === 'spoiler')   wrapped = '||' + word + '||';
      else wrapped = word;
      ta.value = ta.value.substring(0, start) + wrapped + ta.value.substring(end);
      ta.selectionStart = start;
      ta.selectionEnd = start + wrapped.length;
      ta.focus();
    }

    function insertText(text) {
      const ta = document.getElementById('composerMessage');
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const before = ta.value.substring(0, start);
      const after = ta.value.substring(end);
      const spaceBefore = (before.length > 0 && !before.endsWith(' ')) ? ' ' : '';
      const spaceAfter = (after.length > 0 && !after.startsWith(' ')) ? ' ' : '';
      ta.value = before + spaceBefore + text + spaceAfter + after;
      const cursor = start + spaceBefore.length + text.length + spaceAfter.length;
      ta.selectionStart = ta.selectionEnd = cursor;
      ta.focus();
    }

    function insertCustomRole() {
      const roleId = document.getElementById('customRoleId').value.trim();
      if (!roleId) return;
      insertText('<@&' + roleId + '>');
    }

    function onFileSelect() {
      const input = document.getElementById('composerFile');
      const preview = document.getElementById('filePreview');
      const img = document.getElementById('filePreviewImg');
      if (input.files && input.files[0]) {
        img.src = URL.createObjectURL(input.files[0]);
        preview.style.display = 'block';
      } else {
        preview.style.display = 'none';
      }
    }

    function clearFile() {
      const input = document.getElementById('composerFile');
      input.value = '';
      document.getElementById('filePreview').style.display = 'none';
      document.getElementById('filePreviewImg').src = '';
    }

    function clearComposer() {
      document.getElementById('composerMessage').value = '';
      document.getElementById('composerImage').value = '';
      document.getElementById('customRoleId').value = '';
      clearFile();
    }

    async function postComposerMessage() {
      const channelKey = document.getElementById('composerChannel').value;
      const content = document.getElementById('composerMessage').value.trim();
      const imageUrl = document.getElementById('composerImage').value.trim();
      const fileInput = document.getElementById('composerFile');
      const file = fileInput.files && fileInput.files[0];
      if (!content) { setOut('Message content cannot be empty.'); return; }
      try {
        let res;
        if (file) {
          // Use FormData for file upload
          const form = new FormData();
          form.append('channelKey', channelKey);
          form.append('content', content);
          form.append('image', file, file.name);
          const headers = {};
          const apiKey = apiKeyInput.value.trim();
          if (apiKey) headers['x-api-key'] = apiKey;
          res = await fetch('/admin/post-message', { method: 'POST', headers, body: form });
        } else {
          res = await fetch('/admin/post-message', {
            method: 'POST',
            headers: apiHeaders(),
            body: JSON.stringify({ channelKey, content, imageUrl: imageUrl || undefined }),
          });
        }
        const data = await res.json();
        setOut({ action: 'post-message', channel: channelKey, status: res.status, data });
        if (res.ok) clearComposer();
      } catch (e) {
        setOut(String(e));
      }
    }

    // --- Existing actions ---

    async function testDbConnection() {
      try {
        const res = await fetch('/admin/db-status', { headers: apiHeaders() });
        const data = await res.json();
        setOut(data);
        if (res.ok && data && data.ok) await loadUsers();
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

    async function saveAllUsers() {
      try {
        const res = await fetch('/admin/all-users', {
          method: 'PUT',
          headers: apiHeaders(),
          body: JSON.stringify({ userIds: allUserIds.value }),
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
        const res = await fetch('/admin/channel-users/seed-from-env', { method: 'POST', headers: apiHeaders() });
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
        setOut({ action: 'run-all-daily-checks', reminder: { status: reminderRes.status, data: reminderData }, noonCheck: { status: noonRes.status, data: noonData } });
      } catch (e) {
        setOut(String(e));
      }
    }

    async function saveMessages() {
      try {
        const res = await fetch('/admin/daily-config/messages', {
          method: 'PUT',
          headers: apiHeaders(),
          body: JSON.stringify({ reminder: msgReminder.value, missing: msgMissing.value, shame: msgShame.value }),
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
        setOut(await res.json());
      } catch (e) {
        setOut(String(e));
      }
    }

    async function resetState() {
      try {
        const res = await fetch('/admin/daily-config/state/reset', { method: 'POST', headers: apiHeaders() });
        setOut(await res.json());
      } catch (e) {
        setOut(String(e));
      }
    }

    // Debounced load on API key input — key is NOT saved to any storage
    apiKeyInput.addEventListener('input', () => {
      if (apiLoadTimer) clearTimeout(apiLoadTimer);
      apiLoadTimer = setTimeout(() => loadUsers(), 400);
    });
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
