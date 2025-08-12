const express = require("express");
const axios = require("axios");
const cors = require("cors");
const cron = require("node-cron");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure we're using the correct port for production
console.log(`🌐 Environment: ${process.env.NODE_ENV || "development"}`);
console.log(`🔌 Port: ${PORT}`);

// Track which tasks we've already notified about
const notifiedTasks = new Set();

// Middleware
app.use(cors());
app.use(express.json());

// ClickUp webhook endpoint
app.post("/webhook/clickup", async (req, res) => {
  try {
    console.log("📡 Webhook received from ClickUp");
    console.log("📋 Request body:", JSON.stringify(req.body, null, 2));

    const { event, task, user } = req.body;

    console.log(`🎯 Event: ${event}`);
    console.log(`📝 Task: ${task?.name || "No task data"}`);
    console.log(`👤 User: ${user?.username || "No user data"}`);

    // Check if this is a task creation event (leave form submission)
    if (event === "task_created" || event === "task_updated") {
      console.log("✅ Valid event detected");

      // Check if the task is in the leaves form list
      if (isLeaveFormTask(task)) {
        console.log("✅ Leave form task detected");
        await sendDiscordNotification(task, user);
        console.log(
          `Discord notification sent for leave request: ${task.name}`
        );
      } else {
        console.log("❌ Task is not a leave form task");
      }
    } else {
      console.log(`❌ Event '${event}' not supported`);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("❌ Error processing webhook:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ClickUp API polling endpoint
app.get("/check-leave-requests", async (req, res) => {
  try {
    console.log("🔍 Checking for new leave requests...");
    const newTasks = await checkForNewLeaveRequests();

    if (newTasks.length > 0) {
      console.log(`✅ Found ${newTasks.length} new leave request(s)`);
      for (const task of newTasks) {
        await sendDiscordNotification(task, {
          username: task.creator?.username || "Unknown User",
        });
        console.log(`📱 Discord notification sent for: ${task.name}`);
      }
    } else {
      console.log("📭 No new leave requests found");
    }

    res.json({
      success: true,
      newTasks: newTasks.length,
      message: `Checked for new leave requests at ${new Date().toLocaleString()}`,
    });
  } catch (error) {
    console.error("❌ Error checking leave requests:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Manual trigger endpoints for testing scheduled tasks
app.get("/check-now", async (req, res) => {
  try {
    console.log("🚀 Immediate leave request check triggered...");
    const newTasks = await checkForNewLeaveRequests();

    if (newTasks.length > 0) {
      console.log(`✅ Found ${newTasks.length} new leave request(s)`);
      for (const task of newTasks) {
        await sendDiscordNotification(task, {
          username: task.creator?.username || "Unknown User",
        });
        console.log(`📱 Discord notification sent for: ${task.name}`);
      }
    } else {
      console.log("📭 No new leave requests found");
    }

    res.json({
      success: true,
      newTasks: newTasks.length,
      message: `Immediate check completed at ${new Date().toLocaleString()}`,
      tasks: newTasks.map((t) => ({
        name: t.name,
        creator: t.creator?.username,
      })),
    });
  } catch (error) {
    console.error("❌ Error in immediate check:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Test daily summary endpoint
app.get("/test-daily-summary", async (req, res) => {
  try {
    console.log("🧪 Testing daily summary...");
    await sendDailyLeaveSummary();
    res.json({
      success: true,
      message: "Daily summary test triggered successfully",
      timestamp: new Date().toLocaleString(),
    });
  } catch (error) {
    console.error("❌ Error testing daily summary:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Test weekly summary endpoint
app.get("/test-weekly-summary", async (req, res) => {
  try {
    console.log("🧪 Testing weekly summary...");
    await sendWeeklyLeaveSummary();
    res.json({
      success: true,
      message: "Weekly summary test triggered successfully",
      timestamp: new Date().toLocaleString(),
    });
  } catch (error) {
    console.error("❌ Error testing weekly summary:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Helper function to find list IDs (add this after the existing functions)
app.get("/find-lists", async (req, res) => {
  try {
    const clickupApiToken = process.env.CLICKUP_API_TOKEN;
    const workspaceId = process.env.CLICKUP_WORKSPACE_ID;

    if (!clickupApiToken) {
      throw new Error("ClickUp API token not configured");
    }

    console.log(`🔍 Finding lists in workspace ${workspaceId}...`);

    // Get all spaces in the workspace
    const spacesResponse = await axios.get(
      `https://api.clickup.com/api/v2/workspace/${workspaceId}/space`,
      {
        headers: {
          Authorization: clickupApiToken,
          "Content-Type": "application/json",
        },
      }
    );

    const spaces = spacesResponse.data.spaces || [];
    const allLists = [];

    // Get lists from each space
    for (const space of spaces) {
      try {
        const listsResponse = await axios.get(
          `https://api.clickup.com/api/v2/space/${space.id}/list`,
          {
            headers: {
              Authorization: clickupApiToken,
              "Content-Type": "application/json",
            },
          }
        );

        const lists = listsResponse.data.lists || [];
        lists.forEach((list) => {
          allLists.push({
            id: list.id,
            name: list.name,
            space: space.name,
            spaceId: space.id,
          });
        });
      } catch (error) {
        console.log(`⚠️ Could not fetch lists from space: ${space.name}`);
      }
    }

    console.log(`📋 Found ${allLists.length} lists total`);
    res.json({
      success: true,
      lists: allLists,
      message: `Found ${allLists.length} lists in workspace`,
    });
  } catch (error) {
    console.error("❌ Error finding lists:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Function to check if the task is a leave form submission
function isLeaveFormTask(task) {
  console.log("🔍 Checking if task is a form submission...");
  console.log("📋 Task data:", JSON.stringify(task, null, 2));

  // Check if the task is from the specific form list
  const targetListId = process.env.LEAVE_LIST_ID || "901810375140";
  console.log(`🎯 Target list ID: ${targetListId}`);
  console.log(`📝 Task list ID: ${task.list?.id}`);

  // Primary check: exact list ID match
  if (task.list?.id === targetListId) {
    console.log("✅ List ID match found!");
    return true;
  }

  // Secondary check: list name contains form-related keywords
  if (task.list?.name) {
    const listName = task.list.name.toLowerCase();
    console.log(`📝 List name: ${listName}`);
    const formListKeywords = [
      "form",
      "leave",
      "vacation",
      "sick",
      "time off",
      "pto",
      "holiday",
      "hr",
      "human resources",
      "request",
      "submission",
    ];

    if (formListKeywords.some((keyword) => listName.includes(keyword))) {
      console.log("✅ List name contains form keywords!");
      return true;
    }
  }

  // Tertiary check: task name contains form-related keywords
  const formKeywords = [
    "form",
    "submission",
    "leave",
    "vacation",
    "sick",
    "time off",
    "pto",
    "holiday",
    "request",
  ];
  const taskName = task.name.toLowerCase();
  console.log(`📝 Task name: ${taskName}`);

  const hasFormKeywords = formKeywords.some((keyword) =>
    taskName.includes(keyword)
  );
  console.log(`🔍 Form keywords found: ${hasFormKeywords}`);

  return hasFormKeywords;
}

// Function to check for new leave requests using ClickUp API
async function checkForNewLeaveRequests() {
  try {
    const clickupApiToken = process.env.CLICKUP_API_TOKEN;
    const workspaceId = process.env.CLICKUP_WORKSPACE_ID;
    const listId = process.env.LEAVE_LIST_ID || "901810375140";

    if (!clickupApiToken) {
      throw new Error("ClickUp API token not configured");
    }

    console.log(`🔍 Checking list ${listId} for new tasks...`);

    // Get tasks from the specific list
    const response = await axios.get(
      `https://api.clickup.com/api/v2/list/${listId}/task`,
      {
        headers: {
          Authorization: clickupApiToken,
          "Content-Type": "application/json",
        },
        params: {
          limit: 100, // Get last 100 tasks
          order_by: "created", // Order by creation date
          reverse: true, // Newest first
        },
      }
    );

    if (response.status !== 200) {
      throw new Error(`ClickUp API error: ${response.status}`);
    }

    const tasks = response.data.tasks || [];
    console.log(`📋 Found ${tasks.length} tasks in list`);

    // Debug: Show first few tasks with their date format
    if (tasks.length > 0) {
      console.log(`🔍 Sample task data:`);
      const sampleTask = tasks[0];
      console.log(`   Name: ${sampleTask.name}`);
      console.log(
        `   Date Created: ${
          sampleTask.date_created
        } (type: ${typeof sampleTask.date_created})`
      );
      console.log(`   Raw date data:`, sampleTask.date_created);

      // Show all available fields
      console.log(`📋 All available fields:`);
      console.log(JSON.stringify(sampleTask, null, 2));

      // Show custom fields if they exist
      if (sampleTask.custom_fields) {
        console.log(`🎯 Custom Fields:`);
        sampleTask.custom_fields.forEach((field) => {
          console.log(`   ${field.name}: ${field.value}`);
        });
      }
    }

    // Filter for tasks created in the last 2 hours AND not already notified about
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const newTasks = tasks.filter((task) => {
      // Handle ClickUp's Unix timestamp format (milliseconds)
      let taskDate;
      if (task.date_created) {
        // ClickUp sends Unix timestamp in milliseconds as string
        const timestamp = parseInt(task.date_created);
        if (!isNaN(timestamp)) {
          taskDate = new Date(timestamp);
          console.log(
            `✅ Parsed date: ${taskDate.toLocaleString()} from timestamp: ${
              task.date_created
            }`
          );
        } else {
          console.log(`⚠️ Could not parse timestamp: ${task.date_created}`);
          taskDate = new Date();
        }
      } else {
        taskDate = new Date();
      }

      const isNew = taskDate > twoHoursAgo;
      const isLeave = isLeaveFormTask(task);
      const notNotified = !notifiedTasks.has(task.id);

      console.log(
        `📅 Task: ${
          task.name
        }, Date: ${taskDate.toLocaleString()}, IsNew: ${isNew}, IsLeave: ${isLeave}, NotNotified: ${notNotified}`
      );

      return isNew && isLeave && notNotified;
    });

    console.log(
      `🆕 Found ${newTasks.length} new leave requests in the last 2 hours`
    );
    return newTasks;
  } catch (error) {
    console.error("❌ Error checking ClickUp API:", error.message);
    return [];
  }
}

// Function to send daily leave summary
async function sendDailyLeaveSummary() {
  try {
    console.log("📊 Generating daily leave summary...");
    const clickupApiToken = process.env.CLICKUP_API_TOKEN;
    const listId = process.env.LEAVE_LIST_ID || "901810375140";

    if (!clickupApiToken) {
      throw new Error("ClickUp API token not configured");
    }

    // Get YESTERDAY's date range (not today)
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1); // Go back 1 day

    const startOfYesterday = new Date(
      yesterday.getFullYear(),
      yesterday.getMonth(),
      yesterday.getDate()
    );
    const endOfYesterday = new Date(
      yesterday.getFullYear(),
      yesterday.getMonth(),
      yesterday.getDate(),
      23,
      59,
      59
    );

    console.log(
      `📅 Checking for leave requests from YESTERDAY (${startOfYesterday.toLocaleDateString()}) to (${endOfYesterday.toLocaleDateString()})`
    );

    // Get tasks from the specific list
    const response = await axios.get(
      `https://api.clickup.com/api/v2/list/${listId}/task`,
      {
        headers: {
          Authorization: clickupApiToken,
          "Content-Type": "application/json",
        },
        params: {
          limit: 100,
          order_by: "created",
          reverse: true,
        },
      }
    );

    if (response.status !== 200) {
      throw new Error(`ClickUp API error: ${response.status}`);
    }

    const tasks = response.data.tasks || [];
    console.log(`📋 Found ${tasks.length} total tasks in list`);

    // Filter for tasks created YESTERDAY
    const yesterdaysTasks = tasks.filter((task) => {
      if (task.date_created) {
        const taskDate = new Date(parseInt(task.date_created));
        return taskDate >= startOfYesterday && taskDate <= endOfYesterday;
      }
      return false;
    });

    console.log(
      `📅 Found ${yesterdaysTasks.length} leave requests submitted YESTERDAY`
    );

    if (yesterdaysTasks.length === 0) {
      await sendDiscordNotification(
        {
          name: "Daily Leave Summary - Yesterday",
          custom_fields: [],
          url: "",
          status: { status: "No submissions yesterday" },
          creator: { username: "System" },
        },
        { username: "System" },
        true
      ); // true = is summary
      return;
    }

    // Send summary notification
    await sendDiscordNotification(
      {
        name: "Daily Leave Summary - Yesterday",
        custom_fields: [],
        url: "",
        status: { status: "Summary" },
        creator: { username: "System" },
      },
      { username: "System" },
      true,
      yesterdaysTasks
    ); // true = is summary, yesterdaysTasks = summary data
  } catch (error) {
    console.error("❌ Error generating daily summary:", error);
  }
}

// Function to send weekly leave summary
async function sendWeeklyLeaveSummary() {
  try {
    console.log("📊 Generating weekly leave summary...");
    const clickupApiToken = process.env.CLICKUP_API_TOKEN;
    const listId = process.env.LEAVE_LIST_ID || "901810375140";

    if (!clickupApiToken) {
      throw new Error("ClickUp API token not configured");
    }

    // Get LAST WEEK's date range (Monday to Friday of previous week)
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.

    // Calculate last week's Monday
    const lastWeekMonday = new Date(today);
    lastWeekMonday.setDate(today.getDate() - dayOfWeek - 7); // Go back to last week's Monday
    lastWeekMonday.setHours(0, 0, 0, 0);

    // Calculate last week's Friday
    const lastWeekFriday = new Date(lastWeekMonday);
    lastWeekFriday.setDate(lastWeekMonday.getDate() + 4); // Friday is 4 days after Monday
    lastWeekFriday.setHours(23, 59, 59, 999);

    console.log(
      `📅 Checking for leave requests from LAST WEEK: ${lastWeekMonday.toLocaleDateString()} to ${lastWeekFriday.toLocaleDateString()}`
    );

    // Get tasks from the specific list
    const response = await axios.get(
      `https://api.clickup.com/api/v2/list/${listId}/task`,
      {
        headers: {
          Authorization: clickupApiToken,
          "Content-Type": "application/json",
        },
        params: {
          limit: 100,
          order_by: "created",
          reverse: true,
        },
      }
    );

    if (response.status !== 200) {
      throw new Error(`ClickUp API error: ${response.status}`);
    }

    const tasks = response.data.tasks || [];
    console.log(`📋 Found ${tasks.length} total tasks in list`);

    // Filter for tasks created LAST WEEK
    const lastWeekTasks = tasks.filter((task) => {
      if (task.date_created) {
        const taskDate = new Date(parseInt(task.date_created));
        return taskDate >= lastWeekMonday && taskDate <= lastWeekFriday;
      }
      return false;
    });

    console.log(
      `📅 Found ${lastWeekTasks.length} leave requests submitted LAST WEEK`
    );

    if (lastWeekTasks.length === 0) {
      await sendDiscordNotification(
        {
          name: "Weekly Leave Summary - Last Week",
          custom_fields: [],
          url: "",
          status: { status: "No submissions last week" },
          creator: { username: "System" },
        },
        { username: "System" },
        true
      ); // true = is summary
      return;
    }

    // Send summary notification
    await sendDiscordNotification(
      {
        name: "Weekly Leave Summary - Last Week",
        custom_fields: [],
        url: "",
        status: { status: "Summary" },
        creator: { username: "System" },
      },
      { username: "System" },
      true,
      lastWeekTasks
    ); // true = is summary, lastWeekTasks = summary data
  } catch (error) {
    console.error("❌ Error generating weekly summary:", error);
  }
}

// Function to send Discord notification
async function sendDiscordNotification(
  task,
  user,
  isSummary = false,
  summaryTasks = []
) {
  try {
    const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL;

    if (!discordWebhookUrl) {
      throw new Error("Discord webhook URL not configured");
    }

    // Create a rich embed message with all form fields
    let embedTitle = "📝 New Leave Request Submitted";
    let embedColor = 0x00ff00; // Green color

    if (isSummary) {
      if (task.name.includes("Daily")) {
        embedTitle = "📊 Daily Leave Summary - Yesterday";
        embedColor = 0x0099ff; // Blue color
      } else if (task.name.includes("Weekly")) {
        embedTitle = "📈 Weekly Leave Summary - Last Week";
        embedColor = 0xff6600; // Orange color
      }
    }

    const embed = {
      title: embedTitle,
      color: embedColor,
      description: "", // We'll build this dynamically
      fields: [
        {
          name: "👤 Employee",
          value: user?.username || task.creator?.username || "Unknown User",
          inline: true,
        },
        {
          name: "📅 Submission Date",
          value:
            new Date().toLocaleDateString() +
            " " +
            new Date().toLocaleTimeString(),
          inline: true,
        },
      ],
      timestamp: new Date().toISOString(),
      footer: {
        text: "ClickUp Leave Management System",
      },
    };

    // Build personalized description paragraph
    let descriptionParts = [];
    let employeeName =
      user?.username || task.creator?.username || "Unknown User";
    let timeOffType = "";
    let fromDate = "";
    let toDate = "";
    let reason = "";

    // Add custom fields if they exist
    if (task.custom_fields && task.custom_fields.length > 0) {
      console.log("🎯 Adding custom fields to Discord notification:");
      task.custom_fields.forEach((field) => {
        let fieldValue = "";

        // Handle different field types
        if (
          field.type === "labels" &&
          field.value &&
          Array.isArray(field.value)
        ) {
          // For label fields, find the actual label text
          if (field.type_config && field.type_config.options) {
            const selectedLabels = field.value.map((id) => {
              const option = field.type_config.options.find(
                (opt) => opt.id === id
              );
              return option ? option.label : id;
            });
            fieldValue = selectedLabels.join(", ");
          } else {
            fieldValue = field.value.join(", ");
          }
        } else if (
          field.type === "drop_down" &&
          field.value !== null &&
          field.value !== undefined
        ) {
          // For drop-down fields, find the actual option name
          if (field.type_config && field.type_config.options) {
            const option = field.type_config.options.find(
              (opt) => opt.id === field.value || opt.orderindex === field.value
            );
            fieldValue = option ? option.name : field.value;
          } else {
            fieldValue = field.value;
          }
        } else if (field.type === "date" && field.value) {
          // For date fields, convert timestamp to readable date
          try {
            const timestamp = parseInt(field.value);
            if (!isNaN(timestamp)) {
              fieldValue = new Date(timestamp).toLocaleDateString();
            } else {
              // Try parsing as a date string
              const dateObj = new Date(field.value);
              if (!isNaN(dateObj.getTime())) {
                fieldValue = dateObj.toLocaleDateString();
              } else {
                fieldValue = field.value;
              }
            }
          } catch (error) {
            console.log(
              `⚠️ Could not parse date field ${field.name}: ${field.value}`
            );
            fieldValue = field.value;
          }
        } else if (field.value && field.value !== "" && field.value !== null) {
          fieldValue = field.value.toString();
        }

        if (fieldValue && fieldValue !== "") {
          console.log(`   ${field.name}: ${fieldValue}`);

          // Store values for description
          if (field.name.toLowerCase().includes("name")) {
            employeeName = fieldValue;
          } else if (
            field.name.toLowerCase().includes("time off type") ||
            field.name.toLowerCase().includes("type")
          ) {
            timeOffType = fieldValue;
          } else if (field.name.toLowerCase().includes("from")) {
            fromDate = fieldValue;
          } else if (field.name.toLowerCase().includes("to")) {
            toDate = fieldValue;
          } else if (field.name.toLowerCase().includes("reason")) {
            reason = fieldValue;
          }

          // Skip adding Reason field to Discord (but keep it for description)
          if (!field.name.toLowerCase().includes("reason")) {
            embed.fields.push({
              name: `📋 ${field.name}`,
              value: fieldValue,
              inline: true,
            });
          }
        }
      });
    }

    // Build the personalized description
    if (timeOffType || fromDate || toDate || reason) {
      let description = `Hello! **${employeeName}** has submitted a leave request.`;

      if (timeOffType) {
        description += `\n\n**Type:** ${timeOffType}`;
      }

      if (fromDate && toDate) {
        if (fromDate === toDate) {
          description += `\n**Date:** ${fromDate}`;
        } else {
          description += `\n**Period:** ${fromDate} to ${toDate}`;
        }
      } else if (fromDate) {
        description += `\n**From:** ${fromDate}`;
      } else if (toDate) {
        description += `\n**To:** ${toDate}`;
      }

      if (reason) {
        description += `\n\n**Reason:** ${reason}`;
      }

      embed.description = description;
    }

    // Add other useful fields
    if (task.due_date) {
      console.log(
        `🔍 Processing due_date: ${
          task.due_date
        } (type: ${typeof task.due_date})`
      );
    }

    if (task.description) {
      embed.fields.push({
        name: "📄 Description",
        value:
          task.description.length > 1024
            ? task.description.substring(0, 1021) + "..."
            : task.description,
        inline: false,
      });
    }

    if (task.due_date) {
      try {
        // Handle ClickUp's Unix timestamp format (milliseconds)
        const timestamp = parseInt(task.due_date);
        if (!isNaN(timestamp)) {
          const dueDate = new Date(timestamp);
          embed.fields.push({
            name: "⏰ Due Date",
            value: dueDate.toLocaleDateString(),
            inline: true,
          });
        } else {
          // If it's already a date string, try to parse it directly
          const dueDate = new Date(task.due_date);
          if (!isNaN(dueDate.getTime())) {
            embed.fields.push({
              name: "⏰ Due Date",
              value: dueDate.toLocaleDateString(),
              inline: true,
            });
          }
        }
      } catch (error) {
        console.log(`⚠️ Could not parse due date: ${task.due_date}`);
      }
    }

    if (task.status) {
      embed.fields.push({
        name: "📊 Status",
        value: task.status.status || task.status,
        inline: true,
      });
    }

    // Add ClickUp link at the end (only for individual requests, not summaries)
    if (!isSummary && task.url) {
      embed.fields.push({
        name: "🔗 ClickUp Link",
        value: `[View Full Request](${task.url})`,
        inline: false,
      });
    }

    // Handle summary notifications
    if (isSummary && summaryTasks && summaryTasks.length > 0) {
      // Add summary statistics
      embed.fields.push({
        name: "📊 Summary Statistics",
        value: `Total Requests: **${summaryTasks.length}**`,
        inline: false,
      });

      // Group by employee
      const employeeCounts = {};
      summaryTasks.forEach((summaryTask) => {
        const employee = summaryTask.creator?.username || "Unknown";
        employeeCounts[employee] = (employeeCounts[employee] || 0) + 1;
      });

      const employeeSummary = Object.entries(employeeCounts)
        .map(([employee, count]) => `• **${employee}**: ${count} request(s)`)
        .join("\n");

      if (employeeSummary) {
        embed.fields.push({
          name: "👥 Employee Breakdown",
          value: employeeSummary,
          inline: false,
        });
      }

      // Add recent requests (last 5)
      const recentRequests = summaryTasks.slice(0, 5);
      const recentList = recentRequests
        .map(
          (req) => `• **${req.creator?.username || "Unknown"}** - ${req.name}`
        )
        .join("\n");

      if (recentList) {
        embed.fields.push({
          name: "📋 Recent Requests",
          value: recentList,
          inline: false,
        });
      }
    }

    const payload = {
      embeds: [embed],
      username: "ClickUp Bot",
      avatar_url: "https://clickup.com/favicon.ico",
    };

    await axios.post(discordWebhookUrl, payload, {
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Mark this task as notified to prevent duplicates
    notifiedTasks.add(task.id);
    console.log(`✅ Task ${task.id} marked as notified`);
  } catch (error) {
    console.error("Error sending Discord notification:", error);
    throw error;
  }
}

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(
    `📡 ClickUp webhook endpoint: http://localhost:${PORT}/webhook/clickup`
  );
  console.log(
    `🔍 ClickUp API polling endpoint: http://localhost:${PORT}/check-leave-requests`
  );
  console.log(`💚 Health check: http://localhost:${PORT}/health`);
  console.log(
    `🧪 Test daily summary: http://localhost:${PORT}/test-daily-summary`
  );
  console.log(
    `🧪 Test weekly summary: http://localhost:${PORT}/test-weekly-summary`
  );

  console.log("⏰ Production schedules configured:");
  console.log("⏰ Daily Summary: 10:00 AM daily (Yesterday's data)");
  console.log("⏰ Additional Check: 2:00 PM daily (Yesterday's data)");
  console.log("⏰ Weekly Summary: Friday 6:00 PM (Last week's data)");

  // Schedule daily check at 10:00 AM (shows yesterday's submissions)
  console.log(
    "⏰ Scheduling daily leave request check at 10:00 AM (Yesterday's Summary)..."
  );
  cron.schedule(
    "0 10 * * *", // 10:00 AM daily
    async () => {
      try {
        console.log(
          "🕙 10:00 AM - Yesterday's leave request summary triggered..."
        );
        await sendDailyLeaveSummary();
      } catch (error) {
        console.error("❌ Error in daily scheduled check:", error);
      }
    },
    {
      timezone: "Asia/Colombo", // Sri Lanka timezone
    }
  );

  // Schedule additional check at 2:00 PM (shows yesterday's submissions)
  console.log(
    "⏰ Scheduling additional check at 2:00 PM (Yesterday's Summary)..."
  );
  cron.schedule(
    "0 14 * * *", // 2:00 PM daily
    async () => {
      try {
        console.log(
          "🕑 2:00 PM - Yesterday's leave request summary triggered..."
        );
        await sendDailyLeaveSummary();
      } catch (error) {
        console.error("❌ Error in afternoon scheduled check:", error);
      }
    },
    {
      timezone: "Asia/Colombo", // Sri Lanka timezone
    }
  );

  // Schedule weekly summary (Friday at 6:00 PM - shows last week's submissions)
  console.log(
    "⏰ Scheduling weekly summary on Friday at 6:00 PM (Last Week's Summary)..."
  );
  cron.schedule(
    "0 18 * * 5", // Friday 6:00 PM
    async () => {
      try {
        console.log(
          "🕔 Friday 6:00 PM - Last week's leave summary triggered..."
        );
        await sendWeeklyLeaveSummary();
      } catch (error) {
        console.error("❌ Error in weekly summary:", error);
      }
    },
    {
      timezone: "Asia/Colombo", // Sri Lanka timezone
    }
  );

  // Initial check after 10 seconds
  setTimeout(async () => {
    console.log("🚀 Performing initial leave request check...");
    try {
      const newTasks = await checkForNewLeaveRequests();

      if (newTasks.length > 0) {
        console.log(
          `✅ Found ${newTasks.length} new leave request(s) in initial check`
        );
        for (const task of newTasks) {
          await sendDiscordNotification(task, {
            username: task.creator?.username || "Unknown User",
          });
          console.log(`📱 Discord notification sent for: ${task.name}`);
        }
      } else {
        console.log("📭 No new leave requests found in initial check");
      }
    } catch (error) {
      console.error("❌ Error in initial check:", error);
    }
  }, 10000); // 10 seconds
});

module.exports = app;
