<p align="center">
  <a href="https://nestjs.com" target="_blank"><img src="https://img.shields.io/badge/NestJS-E0234E?style=for-the-badge&logo=nestjs&logoColor=white" alt="NestJS" /></a>
  <span>&nbsp;+&nbsp;</span>
  <a href="https://clickup.com" target="_blank"><img src="https://img.shields.io/badge/ClickUp-7B68EE?style=for-the-badge&logo=clickup&logoColor=white" alt="ClickUp" /></a>
  <span>&nbsp;+&nbsp;</span>
  <a href="https://discord.com" target="_blank"><img src="https://img.shields.io/badge/Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Discord" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/AWS_Lambda-FF9900?style=flat-square&logo=awslambda&logoColor=white" alt="Lambda" />
</p>

<h1 align="center">ClickUp ↔ Discord Integration</h1>

<p align="center">
  Leave summaries, squad-on-next-week notifications, and real-time alerts from <strong>ClickUp</strong> to <strong>Discord</strong>. Built with <strong>NestJS</strong>, runs as HTTP server or <strong>AWS Lambda</strong> (EventBridge). All schedules use <strong>Sri Lanka timezone (Asia/Colombo)</strong>.
</p>

---

## Features

| Feature | Description | When (Sri Lanka) |
|--------|-------------|-------------------|
| **Daily leave summary** | Who is on leave today | 10:00 AM daily |
| **Monthly leave summary** | Who was on leave this month, grouped by person with dates and total days | 30th at 6:00 PM |
| **Squad on next week** | Which squad is on next week (from Work Calendar list) | Friday 6:00 PM |
| **New leave requests** | Instant Discord notification when a new leave task is created | On-demand / cron |

---

## Prerequisites

- **Node.js** 18+ (or 20+)
- **ClickUp** workspace with a leave list, Work Calendar list (for squads), and API token
- **Discord** webhook URL for the channel where you want notifications

---

## Quick Start

```bash
git clone <your-repo-url>
cd discord-script
npm install
```

Create a `.env` file in the project root:

```env
CLICKUP_API_TOKEN=pk_xxxxx
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
LEAVE_LIST_ID=your id
CLICKUP_WORKSPACE_ID=your_workspace_id
WORK_CALENDAR_LIST_ID=your id
```

Run the server:

```bash
npm run build
npm start
```

By default the server listens on **http://localhost:3000** (or the next free port if 3000 is in use).

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CLICKUP_API_TOKEN` | Yes | ClickUp Personal API token. |
| `DISCORD_WEBHOOK_URL` | Yes | Discord webhook URL for the target channel. |
| `LEAVE_LIST_ID` | Yes | ClickUp list ID that contains leave request tasks. |
| `CLICKUP_WORKSPACE_ID` | Yes* | ClickUp workspace (team) ID; needed for `find-lists` and `find-by-name`. |
| `WORK_CALENDAR_LIST_ID` | Yes* | ClickUp list ID for “Work Calendar” (squad-on-next-week). Required for `/squad-next-week` and `/test-squad-notification`. |
| `PORT` | No | Server port (default `3000`). |

---

## API Endpoints

### Health & status

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check. Returns `{ status: "OK", timestamp }`. |
| `GET` | `/ping` | Liveness ping. Returns `{ status: "AWAKE", message, timestamp }`. |

### Notifications (send to Discord)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/test-daily-summary` | Send **today’s** leave summary to Discord. |
| `GET` | `/test-daily-summary?date=YYYY-MM-DD` | Send leave summary for a **specific date**. |
| `GET` | `/test-monthly-summary` | Send **this month’s** leave summary to Discord. |
| `GET` | `/test-squad-notification` | Send **squad on next week** to Discord (same as Friday 6 PM job). |
| `GET` | `/test-squad-notification?weeksAhead=2` | Send squad for **week after next** (e.g. `weeksAhead=2`). |
| `GET` | `/check-now` | Check for **new leave requests** (last 2 hours) and send Discord notifications for each. |

### Optional (no EventBridge)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/test-weekly-summary` | Send **weekly** leave summary to Discord (manual/test only; not scheduled). Use `?date=YYYY-MM-DD` or `?weeksAgo=1` for a specific week. |

### Leave & squad (read-only / preview)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/check-leave-on-date/:date` | List employees on leave for a date (e.g. `/check-leave-on-date/2026-01-15`). |
| `GET` | `/squad-next-week` | **Preview** which squad is on next week (no Discord). |
| `GET` | `/squad-next-week?weeksAhead=2` | Preview squad for **week after next** (no Discord). |

### ClickUp helpers

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/find-lists` | List all ClickUp lists in the workspace (spaces + folders). |
| `GET` | `/find-by-name?q=work%20calendar` | Find list/folder/space by name (e.g. Work Calendar). Default `q=work calendar`. |
| `GET` | `/debug-clickup-data` | Raw ClickUp list/task sample (for debugging). |
| `GET` | `/debug-timezone` | Sri Lanka / server timezone info (for debugging). |

---

## Schedules (EventBridge + Lambda)

When deployed as **AWS Lambda**, use **EventBridge** to trigger the handler with one of these payloads:

| When (Sri Lanka) | Cron (UTC) | Payload |
|------------------|------------|---------|
| 10:00 AM daily (leave summary) | `cron(30 4 * * ? *)` | `{"schedule":"daily"}` |
| 30th at 6:00 PM (monthly summary) | `cron(30 12 30 * ? *)` | `{"schedule":"monthly"}` |
| Friday 6:00 PM (squad on next week) | `cron(30 12 ? * FRI *)` | `{"schedule":"squad_weekly"}` |

Create **3 EventBridge rules** pointing to the same Lambda; the `schedule` field in the payload tells the handler which job to run.

---

## Deployment

### Run locally (NestJS HTTP server)

```bash
npm run build
npm start
# or with watch
npm run start:dev
```

### Deploy as AWS Lambda

1. **Build and package** (see [DEPLOYMENT.md](./DEPLOYMENT.md)):
   ```bash
   npm run build
   # Then zip dist/ + production node_modules (details in DEPLOYMENT.md)
   ```

2. **Lambda configuration**
   - **Handler:** `lambda.handler`
   - **Runtime:** Node.js 18.x or 20.x
   - **Timeout:** 30 seconds
   - **Environment variables:** `CLICKUP_API_TOKEN`, `DISCORD_WEBHOOK_URL`, `LEAVE_LIST_ID`, `CLICKUP_WORKSPACE_ID`, optionally `WORK_CALENDAR_LIST_ID`

3. **EventBridge:** Create the 3 rules (daily, monthly, squad_weekly) with the cron expressions and payloads above.

Full steps (zip layout, IAM, EventBridge) are in [DEPLOYMENT.md](./DEPLOYMENT.md).

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript to `dist/`. |
| `npm start` | Build and run HTTP server (`node run.js` → `dist/main.js`). |
| `npm run start:dev` | Build once, then watch and restart on changes. |
| `npm run serve` | Run `node dist/main.js` (no build). |
| `npm run lambda:build` | Build and package for Lambda (see DEPLOYMENT.md). |
| `npm run lambda:invoke` | Invoke Lambda handler locally with `{"schedule":"daily"}`. |

---

## Project structure

```
discord-script/
├── src/
│   ├── main.ts                 # HTTP server bootstrap (skipped in Lambda)
│   ├── app.module.ts           # Root module
│   ├── app.controller.ts       # All HTTP routes (health, leave, squad, find-*, debug)
│   ├── lambda.ts               # Lambda handler (EventBridge → daily / monthly / squad_weekly)
│   ├── common/
│   │   └── timezone.util.ts    # Sri Lanka time, getWeekRangeByOffset, leave/squad helpers
│   ├── clickup/
│   │   ├── clickup.module.ts
│   │   └── clickup.service.ts  # ClickUp API: tasks, lists, folders, Work Calendar, findByName
│   ├── discord/
│   │   ├── discord.module.ts
│   │   └── discord.service.ts  # Discord webhooks: daily/monthly/weekly/squad notifications
│   └── leave/
│       ├── leave.module.ts
│       ├── leave.controller.ts # /leave/* (optional duplicate routes)
│       └── leave.service.ts    # runDailySummary, runMonthlySummary, runSquadNotification, etc.
├── run.js                      # Entry script: runs dist/main.js (or dist/src/main.js)
├── package.json
├── tsconfig.json
├── nest-cli.json
├── README.md
└── DEPLOYMENT.md               # Render, AWS Lambda + EventBridge
```

---

## License

MIT
