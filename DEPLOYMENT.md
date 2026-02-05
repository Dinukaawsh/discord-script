# 🚀 Deployment Guide – ClickUp ↔ Discord

Two ways to run the app:

| Option | Best for | What runs |
|--------|----------|-----------|
| **A. Render** | Simple hosting, always-on HTTP server | Web app; you add external cron (e.g. cron-job.org) to hit endpoints on a schedule. |
| **B. AWS Lambda + EventBridge** | No server, pay per run | Lambda runs only when EventBridge triggers it (daily, monthly, Friday squad). |

---

## Option A: Deploy on Render (Web server)

Your app runs 24/7 as a web service. Schedules (daily, monthly, squad) must be triggered by calling the HTTP endpoints (e.g. with an external cron service).

### 1. Push code to GitHub

```bash
cd /path/to/discord-script
git init
git add .
git commit -m "ClickUp Discord Integration"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

### 2. Create a Web Service on Render

1. Go to [render.com](https://render.com) and sign up / log in.
2. **Dashboard** → **New +** → **Web Service**.
3. Connect your GitHub account and select the repo.
4. Use:

   | Field | Value |
   |-------|--------|
   | **Name** | `clickup-discord-integration` (or any name) |
   | **Environment** | Node |
   | **Build Command** | `npm install && npm run build` |
   | **Start Command** | `node run.js` (or `npm start`) |
   | **Instance type** | Free (or paid if you prefer) |

5. Before creating, add **Environment Variables** (see below).

### 3. Environment variables (Render)

In the Render service → **Environment** tab, add:

| Key | Value |
|-----|--------|
| `CLICKUP_API_TOKEN` | Your ClickUp API token (Personal API Key) |
| `DISCORD_WEBHOOK_URL` | Your Discord webhook URL |
| `LEAVE_LIST_ID` | Your ClickUp leave list ID |
| `WORK_CALENDAR_LIST_ID` | Your Work Calendar list ID (for squad-on-next-week) |
| `CLICKUP_WORKSPACE_ID` | Your ClickUp workspace (team) ID |
| `NODE_ENV` | `production` (optional) |

### 4. Deploy

Click **Create Web Service**. Wait for the build to finish. Your app URL will be like:

`https://clickup-discord-integration.onrender.com`

### 5. Trigger schedules (Render has no built-in cron)

Use an external cron service (e.g. [cron-job.org](https://cron-job.org), free) to call your endpoints:

| Schedule | When (Sri Lanka) | Call this URL |
|----------|------------------|----------------|
| Daily leave summary | 10:00 AM daily | `GET https://YOUR_APP.onrender.com/test-daily-summary` |
| Monthly leave summary | 30th, 6:00 PM | `GET https://YOUR_APP.onrender.com/test-monthly-summary` |
| Squad on next week | Friday 6:00 PM | `GET https://YOUR_APP.onrender.com/test-squad-notification` |

Set the cron to run at the right **UTC** time (e.g. 10:00 AM Sri Lanka = 04:30 UTC).

### 6. Test

- Health: `https://YOUR_APP.onrender.com/health`
- Test daily: `https://YOUR_APP.onrender.com/test-daily-summary`

**Note:** On the free tier, Render sleeps after ~15 minutes of inactivity; the first request after sleep may take 10–15 seconds.

---

## Option B: Deploy on AWS Lambda + EventBridge (Serverless)

No 24/7 server. Lambda runs only when EventBridge triggers it. You get **3 scheduled notifications**: daily leave, monthly leave, squad on next week.

### 1. Build and package for Lambda

On your machine (Node.js 18+):

```bash
cd /path/to/discord-script

# Install deps and build
npm install
npm run build

# Package for Lambda (zip = dist + package.json + production node_modules)
cp package.json dist/
cd dist
npm install --production
zip -r ../lambda.zip .
cd ..
```

You should have **lambda.zip** in the project root.

### 2. Create the Lambda function (AWS Console)

1. **AWS Console** → **Lambda** → **Create function**.
2. **Author from scratch**.
3. **Function name:** e.g. `clickup-discord-integration`.
4. **Runtime:** Node.js 18.x or 20.x.
5. **Architecture:** x86_64.
6. Create function (no need to add a trigger yet).

### 3. Upload the code

1. In the function page, **Code** tab → **Upload from** → **.zip file**.
2. Choose **lambda.zip**.
3. **Save**.

### 4. Set handler and runtime

1. **Code** → **Runtime settings** → **Edit**.
2. **Handler:** `lambda.handler` (this is the `handler` export in `lambda.js`).
3. Save.

### 5. Environment variables (Lambda)

**Configuration** → **Environment variables** → **Edit** → **Add**:

| Key | Value |
|-----|--------|
| `CLICKUP_API_TOKEN` | Your ClickUp API token |
| `DISCORD_WEBHOOK_URL` | Your Discord webhook URL |
| `LEAVE_LIST_ID` | Your ClickUp leave list ID |
| `WORK_CALENDAR_LIST_ID` | Your Work Calendar list ID |
| `CLICKUP_WORKSPACE_ID` | Your ClickUp workspace ID (optional for daily/monthly/squad; needed if you ever run find-lists via API) |

Save.

### 6. Timeout and memory

**Configuration** → **General configuration** → **Edit**:

- **Timeout:** 30 seconds (or 1 minute to be safe).
- **Memory:** 128 MB is enough.

Save.

### 7. Create EventBridge rules (schedules)

1. **AWS Console** → **EventBridge** → **Rules** → **Create rule**.

Create **3 rules** (repeat steps below for each).

---

**Rule 1 – Daily leave summary**

- **Name:** `leave-daily`
- **Rule type:** Schedule.
- **Schedule pattern:** Recurring schedule.
- **Schedule expression:** `cron(30 4 * * ? *)`
  (04:30 UTC every day = 10:00 AM Sri Lanka.)
- **Target:** Lambda function → select `clickup-discord-integration`.
- **Payload:** Constant – `{"schedule":"daily"}`.
- Create the rule. When asked, **add permission** for EventBridge to invoke the Lambda.

---

**Rule 2 – Monthly leave summary**

- **Name:** `leave-monthly`
- **Rule type:** Schedule.
- **Schedule expression:** `cron(30 12 30 * ? *)`
  (12:30 UTC on the 30th of every month = 6:00 PM Sri Lanka.)
- **Target:** Same Lambda.
- **Payload:** `{"schedule":"monthly"}`.
- Create the rule.

---

**Rule 3 – Squad on next week**

- **Name:** `squad-weekly`
- **Rule type:** Schedule.
- **Schedule expression:** `cron(30 12 ? * FRI *)`
  (12:30 UTC every Friday = 6:00 PM Sri Lanka.)
- **Target:** Same Lambda.
- **Payload:** `{"schedule":"squad_weekly"}`.
- Create the rule.

---

### 8. Test the Lambda

1. **Lambda** → your function → **Test** tab.
2. **Create new event** → name e.g. `daily`.
3. **Event JSON:** `{"schedule":"daily"}`.
4. **Save** → **Test**.
5. Check **Execution result** and your Discord channel for the daily summary.

Repeat with `{"schedule":"monthly"}` and `{"schedule":"squad_weekly"}` if you want.

### 9. Summary – Lambda + EventBridge

| When (Sri Lanka) | EventBridge cron (UTC) | Payload |
|------------------|------------------------|--------|
| 10:00 AM daily | `cron(30 4 * * ? *)` | `{"schedule":"daily"}` |
| 30th, 6:00 PM | `cron(30 12 30 * ? *)` | `{"schedule":"monthly"}` |
| Friday 6:00 PM | `cron(30 12 ? * FRI *)` | `{"schedule":"squad_weekly"}` |

---

## Checklist before deploy

- [ ] `.env` is **not** committed (it’s in `.gitignore`).
- [ ] You have **ClickUp API token**, **Discord webhook URL**, **LEAVE_LIST_ID**, **WORK_CALENDAR_LIST_ID**, and optionally **CLICKUP_WORKSPACE_ID**.
- [ ] For **Render:** Build command is `npm install && npm run build`, start command is `node run.js` (or `npm start`).
- [ ] For **Lambda:** Handler is `lambda.handler`; zip contains everything under `dist/` plus `package.json` and production `node_modules`.

---

## Quick reference – env vars

| Variable | Required | Used for |
|----------|----------|----------|
| `CLICKUP_API_TOKEN` | Yes | All ClickUp API calls |
| `DISCORD_WEBHOOK_URL` | Yes | All Discord notifications |
| `LEAVE_LIST_ID` | Yes | Leave list (daily/monthly summaries) |
| `WORK_CALENDAR_LIST_ID` | Yes | Squad-on-next-week |
| `CLICKUP_WORKSPACE_ID` | Yes* | find-lists, find-by-name (optional for Lambda if you only use the 3 schedules) |

---

**🎉 Done.** For Render you still need to set up external cron to hit the test endpoints. For Lambda, the 3 EventBridge rules are enough for daily, monthly, and squad notifications.
