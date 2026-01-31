# 🚀 ClickUp Discord Integration - Deployment Guide

## **📋 Prerequisites**
- GitHub account
- Render.com account (free hosting)
- Your `.env` file with secrets

## **🔧 Step 1: Push to GitHub**

1. **Create a new repository on GitHub**
2. **Push your code:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit: ClickUp Discord Integration"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
   git push -u origin main
   ```

## **🌐 Step 2: Deploy on Render**

1. **Go to [render.com](https://render.com) and sign up**
2. **Click "New +" → "Web Service"**
3. **Connect your GitHub repository**
4. **Configure your service:**

   ```
   Name: clickup-discord-integration
   Environment: Node
   Build Command: npm install
   Start Command: npm start
   ```

## **🔐 Step 3: Set Environment Variables**

In Render dashboard, add these environment variables:

```
DISCORD_WEBHOOK_URL=your_discord_webhook_url
LEAVE_LIST_ID=your list id
CLICKUP_API_TOKEN=your_clickup_api_token
CLICKUP_WORKSPACE_ID=your workpace id
NODE_ENV=production
```

## **✅ Step 4: Deploy**

1. **Click "Create Web Service"**
2. **Wait for build to complete**
3. **Your app will be available at: `https://your-app-name.onrender.com`**

## **🔗 Step 5: Update ClickUp Webhook**

1. **Go to ClickUp → Settings → Integrations → Webhooks**
2. **Update webhook URL to:** `https://your-app-name.onrender.com/webhook/clickup`
3. **Test the webhook**

## **🎯 What You'll Get:**

- **Real-time notifications** when forms are submitted
- **Daily summary at 10:00 AM** (yesterday's data)
- **Additional check at 2:00 PM** (yesterday's data)
- **Weekly summary Friday 6:00 PM** (last week's data)

## **📱 Test Your Deployment:**

- **Health check:** `https://your-app-name.onrender.com/health`
- **Test daily summary:** `https://your-app-name.onrender.com/test-daily-summary`
- **Test weekly summary:** `https://your-app-name.onrender.com/test-weekly-summary`

## **🚨 Important Notes:**

- **Never commit your `.env` file** (it's in `.gitignore`)
- **Render will sleep after 15 minutes** of inactivity
- **First request after sleep may take 10-15 seconds**
- **Your app will wake up automatically** when webhooks arrive

## **🆘 Troubleshooting:**

- **Build fails:** Check your `package.json` has all dependencies
- **Environment variables:** Make sure all are set in Render dashboard
- **Webhook not working:** Verify the URL is correct and accessible
- **App sleeping:** This is normal, it will wake up automatically

---

## **☁️ Deploy on AWS Lambda + EventBridge (serverless) – NestJS**

Run the NestJS app on a schedule **without a 24/7 server**: Lambda runs only when EventBridge triggers it (daily 10:00 AM and 30th 6:00 PM **Sri Lanka time**).

### **Prerequisites**
- AWS account
- AWS CLI configured (or use AWS Console)

### **1. Package for Lambda (NestJS)**

```bash
# Build NestJS
npm run build

# Package: dist/ + production node_modules into a zip
cp package.json dist/
cd dist
npm install --production
zip -r ../lambda.zip .
cd ..
# lambda.zip is ready to upload to Lambda
```

### **2. Create the Lambda function**

- **Runtime:** Node.js 18.x or 20.x
- **Handler:** `lambda.handler` (file `lambda.js` in the root of the zip)
- **Timeout:** 30 seconds
- **Memory:** 128 MB is enough

In **Configuration → Environment variables**, add:

| Key | Value |
|-----|--------|
| `CLICKUP_API_TOKEN` | your ClickUp API token |
| `DISCORD_WEBHOOK_URL` | your Discord webhook URL |
| `LEAVE_LIST_ID` | your ClickUp leave list ID |
| `WORK_CALENDAR_LIST_ID` | (optional) Work Calendar list ID for squad-on-next-week; default `901811026628` |

Upload `lambda.zip` as the function code.

### **3. EventBridge rules (UTC)**

Lambda runs in **UTC**. Sri Lanka is **UTC+5:30**, so:

- **10:00 AM Sri Lanka** → **04:30 UTC**
- **30th 6:00 PM Sri Lanka** → **12:30 UTC** on the 30th
- **Friday 6:00 PM Sri Lanka** (squad on next week) → **12:30 UTC** every Friday

Create **three** EventBridge rules that trigger this Lambda:

| Rule name | Schedule type | Cron (UTC) | Target payload |
|-----------|--------------|------------|----------------|
| `leave-daily` | Schedule | `cron(30 4 * * ? *)` | `{"schedule":"daily"}` |
| `leave-monthly` | Schedule | `cron(30 12 30 * ? *)` | `{"schedule":"monthly"}` |
| `squad-weekly` | Schedule | `cron(30 12 ? * FRI *)` | `{"schedule":"squad_weekly"}` |

**In AWS Console:**

1. **EventBridge** → **Rules** → **Create rule**
2. **Name:** `leave-daily`
   - **Schedule:** Recurring schedule
   - **Cron expression:** `30 4 * * ? *` (04:30 UTC daily)
   - **Target:** This Lambda
   - **Payload:** Constant JSON `{"schedule":"daily"}`
3. **Name:** `leave-monthly`
   - **Cron:** `30 12 30 * ? *` (12:30 UTC on 30th of every month)
   - **Payload:** `{"schedule":"monthly"}`
4. **Name:** `squad-weekly`
   - **Cron:** `30 12 ? * FRI *` (12:30 UTC every Friday = 6:00 PM Sri Lanka)
   - **Payload:** `{"schedule":"squad_weekly"}` — sends Discord: which squad is on next week (from Work Calendar list)

### **4. Permissions**

- EventBridge needs permission to invoke the Lambda (add **resource-based policy** when you set the rule target, or add a permission for `events.amazonaws.com`).
- Lambda only needs **outbound internet** (VPC default or no VPC) to call ClickUp and Discord.

### **5. Test**

- **From AWS Console:** Lambda → Test → create test event with body `{"schedule":"daily"}`, `{"schedule":"monthly"}`, or `{"schedule":"squad_weekly"}`.
- **From CLI:**
  ```bash
  aws lambda invoke --function-name YOUR_FUNCTION_NAME --payload '{"schedule":"daily"}' response.json && cat response.json
  ```

### **Summary**

| When | EventBridge (UTC) | Payload |
|------|-------------------|--------|
| Every day 10:00 AM Sri Lanka | `cron(30 4 * * ? *)` | `{"schedule":"daily"}` |
| 30th of month 6:00 PM Sri Lanka | `cron(30 12 30 * ? *)` | `{"schedule":"monthly"}` |
| Every Friday 6:00 PM Sri Lanka (squad on next week) | `cron(30 12 ? * FRI *)` | `{"schedule":"squad_weekly"}` |

The same NestJS app runs locally (HTTP server) or in Lambda (handler only); no code change needed when you switch.

---
**🎉 Congratulations! Your ClickUp Discord integration is now deployed and accessible to everyone!**
