# ClickUp ↔ Discord Leave Integration

Sends **leave request summaries** from [ClickUp](https://clickup.com) to a [Discord](https://discord.com) channel. Uses **Sri Lanka timezone (Asia/Colombo)** for all schedules.

## Features

- **Daily summary** — Who is on leave today (runs at 10:00 AM Sri Lanka time).
- **Monthly summary** — Who was on leave this month, grouped by person with dates and total days (runs on the 30th at 6:00 PM Sri Lanka time).
- **New leave check** — Optional check for new leave requests (triggered manually or on a schedule).
- **Test endpoints** — Trigger daily/monthly summaries or check a specific date via HTTP.

## Prerequisites

- **Node.js** 18+ (or 20+)
- **ClickUp** workspace with a leave list and API token
- **Discord** webhook URL for the channel where you want notifications

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
LEAVE_LIST_ID=901810375140
CLICKUP_WORKSPACE_ID=9018099264
```

Run the server:

```bash
npm start
```

By default it listens on **http://localhost:3000**.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CLICKUP_API_TOKEN` | Yes | ClickUp API token (Personal API Key). |
| `DISCORD_WEBHOOK_URL` | Yes | Discord webhook URL for the target channel. |
| `LEAVE_LIST_ID` | Yes | ClickUp list ID that contains leave tasks. |
| `CLICKUP_WORKSPACE_ID` | No | Workspace ID (e.g. for `/find-lists`). |
| `PORT` | No | Server port (default `3000`). |

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check. |
| `GET /ping` | Simple ping. |
| `GET /check-now` | Run “new leave requests” check and send Discord notifications. |
| `GET /test-daily-summary` | Send today’s leave summary to Discord. |
| `GET /test-daily-summary?date=YYYY-MM-DD` | Send leave summary for a specific date. |
| `GET /test-monthly-summary` | Send this month’s leave summary to Discord. |
| `GET /test-weekly-summary` | Send this week’s leave summary. |
| `GET /check-leave-on-date/:date` | Get employees on leave for a date (e.g. `/check-leave-on-date/2026-01-15`). |
| `GET /debug-clickup-data` | Inspect raw ClickUp list/task data. |
| `GET /debug-timezone` | Inspect server and Sri Lanka time. |
| `GET /find-lists` | List ClickUp lists in the workspace (needs `CLICKUP_WORKSPACE_ID`). |

## Schedules (when running as a server)

All times are **Asia/Colombo (Sri Lanka)**:

- **10:00 AM daily** — Daily leave summary (who’s off today).
- **30th of every month, 6:00 PM** — Monthly leave summary (grouped by person, with dates and total days).

If you run this on **AWS Lambda**, use EventBridge (see [Deployment](#deployment)) instead of these in-server schedules.

## Deployment

- **Render (web server)** — See [DEPLOYMENT.md](./DEPLOYMENT.md) for GitHub + Render setup and env vars.
- **AWS Lambda + EventBridge (serverless)** — Same file runs as a Lambda; EventBridge triggers it daily at 10:00 AM and on the 30th at 6:00 PM Sri Lanka time. Full steps (packaging, env vars, cron expressions) are in [DEPLOYMENT.md](./DEPLOYMENT.md#-deploy-on-aws-lambda--eventbridge-serverless).

## Scripts

```bash
npm start      # Run server
npm run dev    # Run with nodemon
npm test       # Run test-discord.js
npm run test-api  # Run test-api.js
```

## License

MIT
