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

// Debug endpoint to inspect raw ClickUp data
app.get("/debug-clickup-data", async (req, res) => {
  try {
    console.log("🔍 Debug: Fetching raw ClickUp data...");
    const clickupApiToken = process.env.CLICKUP_API_TOKEN;
    const listId = process.env.LEAVE_LIST_ID || "901810375140";

    if (!clickupApiToken) {
      throw new Error("ClickUp API token not configured");
    }

    console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
    console.log(`📍 List ID: ${listId}`);
    console.log(
      `🕐 Server timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`
    );

    const response = await axios.get(
      `https://api.clickup.com/api/v2/list/${listId}/task`,
      {
        headers: {
          Authorization: clickupApiToken,
          "Content-Type": "application/json",
        },
        params: {
          include_closed: true,
          subtasks: false,
        },
      }
    );

    const tasks = response.data.tasks || [];

    // Return debug data
    res.json({
      success: true,
      environment: process.env.NODE_ENV || "development",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      listId: listId,
      totalTasks: tasks.length,
      serverTime: new Date().toISOString(),
      sampleTasks: tasks.slice(0, 3).map((task) => ({
        id: task.id,
        name: task.name,
        due_date: task.due_date,
        custom_fields:
          task.custom_fields?.map((field) => ({
            name: field.name,
            type: field.type,
            value: field.value,
          })) || [],
      })),
      timestamp: new Date().toLocaleString(),
    });
  } catch (error) {
    console.error("❌ Error in debug endpoint:", error);
    res
      .status(500)
      .json({ error: "Internal server error", details: error.message });
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

// Test monthly summary endpoint
app.get("/test-monthly-summary", async (req, res) => {
  try {
    console.log("🧪 Testing monthly summary...");
    await sendMonthlyLeaveSummary();
    res.json({
      success: true,
      message: "Monthly summary test triggered successfully",
      timestamp: new Date().toLocaleString(),
    });
  } catch (error) {
    console.error("❌ Error testing monthly summary:", error);
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

// New endpoint to check for employees on leave on a specific date
app.get("/check-leave-on-date/:date", async (req, res) => {
  try {
    const { date } = req.params;
    const clickupApiToken = process.env.CLICKUP_API_TOKEN;
    const listId = process.env.LEAVE_LIST_ID || "901810375140";

    if (!clickupApiToken) {
      throw new Error("ClickUp API token not configured");
    }

    // Parse the date parameter (expecting YYYY-MM-DD format)
    const targetDate = new Date(date);
    if (isNaN(targetDate.getTime())) {
      return res
        .status(400)
        .json({ error: "Invalid date format. Use YYYY-MM-DD" });
    }

    const startOfDate = new Date(
      targetDate.getFullYear(),
      targetDate.getMonth(),
      targetDate.getDate()
    );
    const endOfDate = new Date(
      targetDate.getFullYear(),
      targetDate.getMonth(),
      targetDate.getDate(),
      23,
      59,
      59
    );

    console.log(`🔍 Checking for employees on leave on ${date}...`);

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

    // Filter for tasks where the leave date matches the target date
    const leaveTasks = tasks.filter((task) => {
      if (task.custom_fields && task.custom_fields.length > 0) {
        for (const field of task.custom_fields) {
          if (field.type === "date" && field.value) {
            try {
              const timestamp = parseInt(field.value);
              if (!isNaN(timestamp)) {
                const leaveDate = new Date(timestamp);
                return leaveDate >= startOfDate && leaveDate <= endOfDate;
              }
            } catch (error) {
              console.log(
                `⚠️ Could not parse date field ${field.name}: ${field.value}`
              );
            }
          }
        }
      }
      return false;
    });

    // Format the response
    const employeesOnLeave = leaveTasks.map((task) => {
      let employeeName = task.creator?.username || "Unknown";
      let leaveType = "Leave";
      let fromDate = "";
      let toDate = "";
      let reason = "";

      if (task.custom_fields && task.custom_fields.length > 0) {
        for (const field of task.custom_fields) {
          if (field.name.toLowerCase().includes("name")) {
            employeeName = field.value;
          } else if (field.name.toLowerCase().includes("type")) {
            if (
              field.type === "drop_down" &&
              field.type_config &&
              field.type_config.options
            ) {
              const option = field.type_config.options.find(
                (opt) =>
                  opt.id === field.value || opt.orderindex === field.value
              );
              leaveType = option ? option.name : field.value;
            } else {
              leaveType = field.value;
            }
          } else if (field.name.toLowerCase().includes("from")) {
            try {
              const timestamp = parseInt(field.value);
              if (!isNaN(timestamp)) {
                fromDate = new Date(timestamp).toLocaleDateString();
              }
            } catch (error) {
              fromDate = field.value;
            }
          } else if (field.name.toLowerCase().includes("to")) {
            try {
              const timestamp = parseInt(field.value);
              if (!isNaN(timestamp)) {
                toDate = new Date(timestamp).toLocaleDateString();
              }
            } catch (error) {
              toDate = field.value;
            }
          } else if (field.name.toLowerCase().includes("reason")) {
            reason = field.value;
          }
        }
      }

      return {
        employee: employeeName,
        leaveType: leaveType,
        fromDate: fromDate,
        toDate: toDate,
        reason: reason,
        taskUrl: task.url,
        taskName: task.name,
      };
    });

    console.log(
      `📅 Found ${employeesOnLeave.length} employees on leave on ${date}`
    );

    res.json({
      success: true,
      date: date,
      employeesOnLeave: employeesOnLeave,
      count: employeesOnLeave.length,
      message: `Found ${employeesOnLeave.length} employees on leave on ${date}`,
    });
  } catch (error) {
    console.error("❌ Error checking leave on date:", error.message);
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
    console.log("📊 Generating daily leave summary for TODAY...");
    const clickupApiToken = process.env.CLICKUP_API_TOKEN;
    const listId = process.env.LEAVE_LIST_ID || "901810375140";

    if (!clickupApiToken) {
      throw new Error("ClickUp API token not configured");
    }

    // Debug environment info
    console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
    console.log(
      `🕐 Server timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`
    );
    console.log(`📍 List ID being used: ${listId}`);

    // Get TODAY's date range - use Sri Lanka timezone for consistency
    const today = new Date();
    console.log(`🕐 Current server time: ${today.toISOString()}`);
    console.log(`🕐 Current local time: ${today.toLocaleString()}`);
    console.log(
      `🕐 Current Sri Lanka time: ${today.toLocaleString("en-US", {
        timeZone: "Asia/Colombo",
      })}`
    );

    const startOfToday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );
    const endOfToday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
      23,
      59,
      59
    );

    console.log(`📅 Date range - Start: ${startOfToday.toISOString()}`);
    console.log(`📅 Date range - End: ${endOfToday.toISOString()}`);
    console.log(
      `📅 Checking for employees on leave TODAY (${today.toLocaleDateString()})`
    );

    // Get all tasks from the list
    const response = await axios.get(
      `https://api.clickup.com/api/v2/list/${listId}/task`,
      {
        headers: {
          Authorization: clickupApiToken,
          "Content-Type": "application/json",
        },
        params: {
          include_closed: true,
          subtasks: false,
        },
      }
    );

    const tasks = response.data.tasks || [];
    console.log(`📋 Found ${tasks.length} total tasks in list`);

    // Debug: Show sample task structure
    if (tasks.length > 0) {
      console.log(
        `🔍 Sample task structure:`,
        JSON.stringify(tasks[0], null, 2)
      );
    }

    // Filter tasks for employees on leave TODAY
    const todayLeaveTasks = [];

    for (const task of tasks) {
      let isOnLeaveToday = false;
      console.log(`\n🔍 Checking task ${task.id}: "${task.name}"`);

      // Check 1: Main task date field (ClickUp's built-in date)
      if (task.due_date) {
        const dueDate = new Date(parseInt(task.due_date));
        console.log(
          `   📅 Due date: ${dueDate.toISOString()} (${dueDate.toLocaleDateString()})`
        );
        if (dueDate >= startOfToday && dueDate <= endOfToday) {
          isOnLeaveToday = true;
          console.log(
            `   ✅ Due date matches today: ${dueDate.toLocaleDateString()}`
          );
        } else {
          console.log(`   ❌ Due date does not match today`);
        }
      } else {
        console.log(`   📅 No due_date field found`);
      }

      // Check 2: Custom date fields (From/To dates)
      if (task.custom_fields && task.custom_fields.length > 0) {
        console.log(`   🎯 Found ${task.custom_fields.length} custom fields:`);
        for (const field of task.custom_fields) {
          console.log(
            `      Field: "${field.name}" (type: ${field.type}) = ${field.value}`
          );
          if (field.type === "date" && field.value) {
            try {
              let fieldDate;
              if (typeof field.value === "string") {
                fieldDate = new Date(field.value);
              } else if (typeof field.value === "number") {
                fieldDate = new Date(parseInt(field.value));
              }

              if (fieldDate && !isNaN(fieldDate.getTime())) {
                console.log(
                  `      📅 Parsed date: ${fieldDate.toISOString()} (${fieldDate.toLocaleDateString()})`
                );
                if (fieldDate >= startOfToday && fieldDate <= endOfToday) {
                  isOnLeaveToday = true;
                  console.log(
                    `      ✅ Custom date field "${field.name}" matches today!`
                  );
                } else {
                  console.log(
                    `      ❌ Custom date field "${field.name}" does not match today`
                  );
                }
              } else {
                console.log(`      ⚠️ Could not parse date: ${field.value}`);
              }
            } catch (dateError) {
              console.log(
                `      ❌ Error parsing date from field "${field.name}": ${field.value} - ${dateError.message}`
              );
            }
          }
        }
      } else {
        console.log(`   📋 No custom fields found for this task`);
      }

      console.log(`   📊 Task ${task.id} on leave today: ${isOnLeaveToday}`);
      if (isOnLeaveToday) {
        todayLeaveTasks.push(task);
      }
    }

    console.log(`👥 Found ${todayLeaveTasks.length} employees on leave TODAY`);

    if (todayLeaveTasks.length > 0) {
      // Send Discord notification
      await sendDiscordNotification(
        { name: "Daily Leave Summary - Today" }, // Special identifier for daily summary
        { username: "System" }, // System user for summaries
        true, // isSummary = true
        todayLeaveTasks // Pass all tasks as summary data
      );
      console.log("📱 Daily leave summary sent to Discord");
    } else {
      console.log("ℹ️ No employees on leave today");
    }
  } catch (error) {
    console.error("❌ Error in daily leave summary:", error);
  }
}

// Function to send weekly leave summary
async function sendWeeklyLeaveSummary() {
  try {
    console.log("📊 Generating weekly leave summary for THIS WEEK...");
    const clickupApiToken = process.env.CLICKUP_API_TOKEN;
    const listId = process.env.LEAVE_LIST_ID || "901810375140";

    if (!clickupApiToken) {
      throw new Error("ClickUp API token not configured");
    }

    // Get THIS WEEK's date range (Monday to Friday of current week)
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.

    // Calculate this week's Monday
    const thisWeekMonday = new Date(today);
    thisWeekMonday.setDate(today.getDate() - dayOfWeek + 1); // Go to this week's Monday
    thisWeekMonday.setHours(0, 0, 0, 0);

    // Calculate this week's Friday
    const thisWeekFriday = new Date(thisWeekMonday);
    thisWeekFriday.setDate(thisWeekMonday.getDate() + 4); // Friday is 4 days after Monday
    thisWeekFriday.setHours(23, 59, 59, 999);

    console.log(
      `📅 Checking for leave requests from THIS WEEK: ${thisWeekMonday.toLocaleDateString()} to ${thisWeekFriday.toLocaleDateString()}`
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

    // Filter for tasks where the leave date is THIS WEEK
    const thisWeekTasks = tasks.filter((task) => {
      if (task.custom_fields && task.custom_fields.length > 0) {
        for (const field of task.custom_fields) {
          if (field.type === "date" && field.value) {
            try {
              const timestamp = parseInt(field.value);
              if (!isNaN(timestamp)) {
                const leaveDate = new Date(timestamp);
                return (
                  leaveDate >= thisWeekMonday && leaveDate <= thisWeekFriday
                );
              }
            } catch (error) {
              console.log(
                `⚠️ Could not parse date field ${field.name}: ${field.value}`
              );
            }
          }
        }
      }
      return false;
    });

    console.log(
      `📅 Found ${thisWeekTasks.length} leave requests for THIS WEEK`
    );

    if (thisWeekTasks.length === 0) {
      await sendDiscordNotification(
        {
          name: "Weekly Leave Summary - This Week",
          custom_fields: [],
          url: "",
          status: { status: "No leave requests this week" },
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
        name: "Weekly Leave Summary - This Week",
        custom_fields: [],
        url: "",
        status: { status: "Summary" },
        creator: { username: "System" },
      },
      { username: "System" },
      true,
      thisWeekTasks
    ); // true = is summary, thisWeekTasks = summary data
  } catch (error) {
    console.error("❌ Error generating weekly summary:", error);
  }
}

// Function to send monthly leave summary
async function sendMonthlyLeaveSummary() {
  try {
    console.log("📊 Generating monthly leave summary for THIS MONTH...");
    const clickupApiToken = process.env.CLICKUP_API_TOKEN;
    const listId = process.env.LEAVE_LIST_ID || "901810375140";

    if (!clickupApiToken) {
      throw new Error("ClickUp API token not configured");
    }

    // Get THIS MONTH's date range (1st to last day of current month)
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(
      today.getFullYear(),
      today.getMonth() + 1,
      0,
      23,
      59,
      59
    );

    console.log(
      `📅 Checking for leave requests from THIS MONTH: ${startOfMonth.toLocaleDateString()} to ${endOfMonth.toLocaleDateString()}`
    );

    // Get all tasks from the list
    const response = await axios.get(
      `https://api.clickup.com/api/v2/list/${listId}/task`,
      {
        headers: {
          Authorization: clickupApiToken,
          "Content-Type": "application/json",
        },
        params: {
          include_closed: true,
          subtasks: false,
        },
      }
    );

    const tasks = response.data.tasks || [];
    console.log(`📋 Found ${tasks.length} total tasks in list`);

    // Filter tasks for employees on leave THIS MONTH
    const thisMonthLeaveTasks = [];

    for (const task of tasks) {
      let isOnLeaveThisMonth = false;

      // Check 1: Main task date field (ClickUp's built-in date)
      if (task.due_date) {
        const dueDate = new Date(parseInt(task.due_date));
        if (dueDate >= startOfMonth && dueDate <= endOfMonth) {
          isOnLeaveThisMonth = true;
          console.log(
            `✅ Task ${
              task.id
            } - Main date matches this month: ${dueDate.toLocaleDateString()}`
          );
        }
      }

      // Check 2: Custom date fields (From/To dates)
      if (task.custom_fields && task.custom_fields.length > 0) {
        for (const field of task.custom_fields) {
          if (field.type === "date" && field.value) {
            try {
              let fieldDate;
              if (typeof field.value === "string") {
                fieldDate = new Date(field.value);
              } else if (typeof field.value === "number") {
                fieldDate = new Date(parseInt(field.value));
              }

              if (fieldDate && !isNaN(fieldDate.getTime())) {
                if (fieldDate >= startOfMonth && fieldDate <= endOfMonth) {
                  isOnLeaveThisMonth = true;
                  console.log(
                    `✅ Task ${task.id} - Custom date field "${
                      field.name
                    }" matches this month: ${fieldDate.toLocaleDateString()}`
                  );
                }
              }
            } catch (dateError) {
              console.log(
                `⚠️ Could not parse date from field "${field.name}": ${field.value}`
              );
            }
          }
        }
      }

      if (isOnLeaveThisMonth) {
        thisMonthLeaveTasks.push(task);
      }
    }

    console.log(
      `👥 Found ${thisMonthLeaveTasks.length} employees on leave THIS MONTH`
    );

    if (thisMonthLeaveTasks.length > 0) {
      // Send Discord notification
      await sendDiscordNotification(
        { name: "Monthly Leave Summary - This Month" }, // Special identifier for monthly summary
        { username: "System" }, // System user for summaries
        true, // isSummary = true
        thisMonthLeaveTasks // Pass all tasks as summary data
      );
      console.log("📱 Monthly leave summary sent to Discord");
    } else {
      console.log("ℹ️ No employees on leave this month");
    }
  } catch (error) {
    console.error("❌ Error in monthly leave summary:", error);
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
        embedTitle = "📊 Daily Leave Summary - Today";
        embedColor = 0x0099ff; // Blue color
      } else if (task.name.includes("Monthly")) {
        embedTitle = "📈 Monthly Leave Summary - This Month";
        embedColor = 0xff6600; // Orange color
      }
    }

    const embed = {
      title: embedTitle,
      color: embedColor,
      description: "", // We'll build this dynamically
      fields: [],
      timestamp: new Date().toISOString(),
      footer: {
        text: "ClickUp Leave Management System",
      },
    };

    // Handle summary notifications
    if (isSummary && summaryTasks && summaryTasks.length > 0) {
      // Add summary statistics
      embed.fields.push({
        name: "📊 Summary Statistics",
        value: `Total Employees on Leave: **${summaryTasks.length}**`,
        inline: false,
      });

      // Group by employee and show their leave details
      const employeeLeaveDetails = [];
      summaryTasks.forEach((summaryTask) => {
        // Try to get employee name from multiple sources
        let employeeName = "Unknown";

        // Source 1: Custom field with "name" in it
        if (summaryTask.custom_fields && summaryTask.custom_fields.length > 0) {
          for (const field of summaryTask.custom_fields) {
            if (field.name.toLowerCase().includes("name") && field.value) {
              employeeName = field.value;
              break;
            }
          }
        }

        // Source 2: Creator username (fallback)
        if (employeeName === "Unknown" && summaryTask.creator?.username) {
          employeeName = summaryTask.creator.username;
        }

        // Source 3: Task name (if it contains employee info)
        if (employeeName === "Unknown" && summaryTask.name) {
          employeeName = summaryTask.name;
        }

        let leaveType = "Leave";
        let fromDate = "";
        let toDate = "";

        // Extract leave type and dates from custom fields
        if (summaryTask.custom_fields && summaryTask.custom_fields.length > 0) {
          for (const field of summaryTask.custom_fields) {
            if (
              field.type === "drop_down" &&
              field.name.toLowerCase().includes("type")
            ) {
              if (field.type_config && field.type_config.options) {
                const option = field.type_config.options.find(
                  (opt) =>
                    opt.id === field.value || opt.orderindex === field.value
                );
                leaveType = option ? option.name : field.value;
              } else {
                leaveType = field.value;
              }
            } else if (field.name.toLowerCase().includes("from")) {
              try {
                const timestamp = parseInt(field.value);
                if (!isNaN(timestamp)) {
                  fromDate = new Date(timestamp).toLocaleDateString();
                }
              } catch (error) {
                fromDate = field.value;
              }
            } else if (field.name.toLowerCase().includes("to")) {
              try {
                const timestamp = parseInt(field.value);
                if (!isNaN(timestamp)) {
                  toDate = new Date(timestamp).toLocaleDateString();
                }
              } catch (error) {
                toDate = field.value;
              }
            }
          }
        }

        // Build the leave detail string
        let leaveDetail = `• **${employeeName}** - ${leaveType}`;
        if (fromDate && toDate) {
          if (fromDate === toDate) {
            leaveDetail += ` (${fromDate})`;
          } else {
            leaveDetail += ` (${fromDate} to ${toDate})`;
          }
        } else if (fromDate) {
          leaveDetail += ` (${fromDate})`;
        } else if (toDate) {
          leaveDetail += ` (${toDate})`;
        }

        employeeLeaveDetails.push(leaveDetail);
      });

      if (employeeLeaveDetails.length > 0) {
        const summaryType = task.name.includes("Daily")
          ? "Employees on Leave Today"
          : "Employees on Leave This Month";
        embed.fields.push({
          name: `👥 ${summaryType}`,
          value: employeeLeaveDetails.join("\n"),
          inline: false,
        });
      }

      // Add task details for monthly summary
      if (task.name.includes("Monthly")) {
        const taskDetails = summaryTasks
          .slice(0, 10)
          .map((req) => {
            let employeeName = "Unknown";

            // Try to get employee name from custom fields first
            if (req.custom_fields && req.custom_fields.length > 0) {
              for (const field of req.custom_fields) {
                if (field.name.toLowerCase().includes("name") && field.value) {
                  employeeName = field.value;
                  break;
                }
              }
            }

            // Fallback to creator username
            if (employeeName === "Unknown" && req.creator?.username) {
              employeeName = req.creator.username;
            }

            return `• **${employeeName}** - ${req.name}`;
          })
          .join("\n");

        if (taskDetails) {
          embed.fields.push({
            name: "📋 Leave Request Details",
            value: taskDetails,
            inline: false,
          });
        }
      }
    } else {
      // Handle individual task notifications (not summaries)
      embed.fields.push({
        name: "👤 Employee",
        value: user?.username || task.creator?.username || "Unknown User",
        inline: true,
      });

      embed.fields.push({
        name: "📅 Submission Date",
        value:
          new Date().toLocaleDateString() +
          " " +
          new Date().toLocaleTimeString(),
        inline: true,
      });

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
            if (field.type_config && field.type_config.options) {
              const option = field.type_config.options.find(
                (opt) =>
                  opt.id === field.value || opt.orderindex === field.value
              );
              fieldValue = option ? option.name : field.value;
            } else {
              fieldValue = field.value;
            }
          } else if (field.type === "date" && field.value) {
            try {
              const timestamp = parseInt(field.value);
              if (!isNaN(timestamp)) {
                fieldValue = new Date(timestamp).toLocaleDateString();
              } else {
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
          } else if (
            field.value &&
            field.value !== "" &&
            field.value !== null
          ) {
            fieldValue = field.value.toString();
          }

          if (fieldValue && fieldValue !== "") {
            console.log(`   ${field.name}: ${fieldValue}`);

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

      // Add ClickUp link
      if (task.url) {
        embed.fields.push({
          name: "🔗 ClickUp Link",
          value: `[View Full Request](${task.url})`,
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
    if (task.id) {
      notifiedTasks.add(task.id);
      console.log(`✅ Task ${task.id} marked as notified`);
    }
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
  console.log(`💚 Health check: http://localhost:${PORT}/health`);
  console.log(
    `🧪 Test daily summary: http://localhost:${PORT}/test-daily-summary`
  );
  console.log(
    `🧪 Test monthly summary: http://localhost:${PORT}/test-monthly-summary`
  );
  console.log(
    `🔍 Debug ClickUp data: http://localhost:${PORT}/debug-clickup-data`
  );
  console.log(
    `📅 Check leave on specific date: http://localhost:${PORT}/check-leave-on-date/YYYY-MM-DD`
  );
  console.log(`🔍 Find ClickUp lists: http://localhost:${PORT}/find-lists`);

  console.log("⏰ Production schedules configured:");
  console.log("⏰ Daily Summary: 10:00 AM daily (Today's Leave)");
  console.log(
    "⏰ Monthly Summary: 30th of every month at 6:00 PM (This month's leave)"
  );

  // Schedule daily check at 10:00 AM (shows today's leave)
  console.log(
    "⏰ Scheduling daily leave check at 10:00 AM (Today's Leave Summary)..."
  );
  cron.schedule(
    "0 10 * * *", // 10:00 AM daily
    async () => {
      try {
        console.log("🕙 10:00 AM - Today's leave summary triggered...");
        await sendDailyLeaveSummary();
      } catch (error) {
        console.error("❌ Error in daily scheduled check:", error);
      }
    },
    {
      timezone: "Asia/Colombo", // Sri Lanka timezone
    }
  );

  // Schedule monthly summary (30th of every month at 6:00 PM - shows this month's leave)
  console.log(
    "⏰ Scheduling monthly summary on the 30th of every month at 6:00 PM (This Month's Summary)..."
  );
  cron.schedule(
    "0 18 30 * *", // 30th of every month at 6:00 PM
    async () => {
      try {
        console.log(
          "🕔 30th of every month at 6:00 PM - This month's leave summary triggered..."
        );
        await sendMonthlyLeaveSummary();
      } catch (error) {
        console.error("❌ Error in monthly summary:", error);
      }
    },
    {
      timezone: "Asia/Colombo", // Sri Lanka timezone
    }
  );

  // Initial check removed - no real-time notifications needed
  console.log("✅ Server ready! Scheduled summaries will run automatically.");
});

module.exports = app;
