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
**🎉 Congratulations! Your ClickUp Discord integration is now deployed and accessible to everyone!**
