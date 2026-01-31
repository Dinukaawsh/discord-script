import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  getPersonNameFromTask,
  getLeavePeriodFromTask,
  countDaysInMonth,
} from '../common/timezone.util';

const DISCORD_FIELD_VALUE_LIMIT = 1024;
const MAX_CHUNK_LEN = DISCORD_FIELD_VALUE_LIMIT - 4;

@Injectable()
export class DiscordService {
  private readonly webhookUrl: string | undefined;

  constructor(private config: ConfigService) {
    this.webhookUrl = this.config.get<string>('DISCORD_WEBHOOK_URL');
  }

  isConfigured(): boolean {
    return !!this.webhookUrl;
  }

  async sendDailySummary(
    tasks: any[],
    targetDate: string | null,
    dateLabel: string,
  ): Promise<void> {
    if (!this.webhookUrl) throw new Error('Discord webhook URL not configured');
    const twisterLeaveDetails = tasks.map((task) => {
      const name = getPersonNameFromTask(task);
      const { leaveType, fromDate, toDate } = getLeavePeriodFromTask(task);
      const fromStr = fromDate ? fromDate.toLocaleDateString() : '';
      const toStr = toDate ? toDate.toLocaleDateString() : '';
      let line = `• **${name}** - ${leaveType}`;
      if (fromStr && toStr) {
        line += fromStr === toStr ? ` (${fromStr})` : ` (${fromStr} to ${toStr})`;
      } else if (fromStr) line += ` (${fromStr})`;
      else if (toStr) line += ` (${toStr})`;
      return line;
    });
    const summaryType = targetDate
      ? `👥 Twisters Taking Time Off on ${targetDate}`
      : '👥 Twisters Taking Time Off Today';
    const statusText = `**${tasks.length}** Twister${tasks.length === 1 ? '' : 's'} on leave ${dateLabel.toLowerCase()}`;
    const embed: any = {
      title: targetDate ? `📅 Daily Leave Report - ${targetDate}` : '📅 Daily Leave Report - Today',
      color: 0x4a90e2,
      description: targetDate
        ? `Here's who's taking time off on ${targetDate} at Twist Digital`
        : "Here's who's taking time off today at Twist Digital",
      fields: [
        { name: '📊 Team Status', value: statusText, inline: false },
        ...(targetDate ? [{ name: '📅 Date', value: `**${targetDate}**`, inline: true }] : []),
      ],
      timestamp: new Date().toISOString(),
      footer: { text: 'Twist Digital • Leave Management System' },
    };
    const fullValue = twisterLeaveDetails.join('\n');
    this.addChunkedField(embed, summaryType, fullValue);
    if (twisterLeaveDetails.length === 0) {
      embed.fields.push({
        name: '✅ Status',
        value: `All Twisters are working ${dateLabel.toLowerCase()}! 🚀`,
        inline: false,
      });
    }
    await axios.post(this.webhookUrl, {
      embeds: [embed],
      username: 'Twist Digital Bot',
    });
  }

  async sendMonthlySummary(
    tasks: any[],
    monthStart: Date,
    monthEnd: Date,
    currentMonthName: string,
  ): Promise<void> {
    if (!this.webhookUrl) throw new Error('Discord webhook URL not configured');
    const byPerson = new Map<string, any[]>();
    for (const task of tasks) {
      const name = getPersonNameFromTask(task);
      if (!byPerson.has(name)) byPerson.set(name, []);
      byPerson.get(name)!.push(task);
    }
    const twisterLeaveDetails: string[] = [];
    for (const [personName, personTasks] of byPerson) {
      let totalDays = 0;
      const periodLines: string[] = [];
      for (const task of personTasks) {
        const { leaveType, fromDate, toDate } = getLeavePeriodFromTask(task);
        const daysInMonth = countDaysInMonth(fromDate, toDate, monthStart, monthEnd);
        totalDays += daysInMonth;
        const fromStr = fromDate
          ? fromDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
          : '';
        const toStr = toDate
          ? toDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
          : '';
        let periodStr = `  • ${leaveType}: `;
        if (fromStr && toStr) {
          periodStr += fromStr === toStr ? fromStr : `${fromStr} → ${toStr}`;
          if (daysInMonth > 0) periodStr += ` (${daysInMonth} day${daysInMonth === 1 ? '' : 's'})`;
        } else if (fromStr) periodStr += fromStr;
        else if (toStr) periodStr += toStr;
        else periodStr += '—';
        periodLines.push(periodStr);
      }
      const block =
        `**${personName}**\n` +
        periodLines.join('\n') +
        `\n  **Total: ${totalDays} day${totalDays === 1 ? '' : 's'} this month**`;
      twisterLeaveDetails.push(block);
    }
    const uniqueCount = byPerson.size;
    const embed: any = {
      title: '📊 Monthly Leave Overview - Twist Digital',
      color: 0xff6b35,
      description: 'Monthly summary of all leave requests at Twist Digital',
      fields: [
        {
          name: '📊 Team Status',
          value: `**${uniqueCount}** Twister${uniqueCount === 1 ? '' : 's'} on leave in ${currentMonthName}`,
          inline: false,
        },
      ],
      timestamp: new Date().toISOString(),
      footer: { text: 'Twist Digital • Leave Management System' },
    };
    const summaryType = '👥 Twisters Taking Time Off This Month';
    const fullValue = twisterLeaveDetails.join('\n\n');
    this.addChunkedField(embed, summaryType, fullValue);
    if (twisterLeaveDetails.length === 0) {
      embed.fields.push({
        name: '✅ Status',
        value: `All Twisters are working this month! 🚀`,
        inline: false,
      });
    }
    await axios.post(this.webhookUrl, {
      embeds: [embed],
      username: 'Twist Digital Bot',
    });
  }

  async sendNewLeaveNotification(task: any, user: { username?: string }): Promise<void> {
    if (!this.webhookUrl) throw new Error('Discord webhook URL not configured');
    const embed: any = {
      title: '🎯 New Leave Request - Twist Digital',
      color: 0x00d4aa,
      description: 'A new leave request has been submitted by one of our Twisters!',
      fields: [
        { name: '👤 Twister', value: `**${user?.username || task?.creator?.username || 'Unknown User'}**`, inline: true },
        { name: '📅 Submitted', value: `**${new Date().toLocaleDateString()}** at ${new Date().toLocaleTimeString()}`, inline: true },
      ],
      timestamp: new Date().toISOString(),
      footer: { text: 'Twist Digital • Leave Management System' },
    };
    const fields = task?.custom_fields || [];
    for (const field of fields) {
      if (field?.name?.toLowerCase().includes('reason')) continue;
      let fieldValue = '';
      if (field.type === 'labels' && field.value && Array.isArray(field.value)) {
        fieldValue = (field.type_config?.options ? field.value.map((id: string) => {
          const opt = field.type_config.options.find((o: any) => o.id === id);
          return opt ? opt.label : id;
        }) : field.value).join(', ');
      } else if (field.type === 'drop_down' && field.value != null) {
        const opt = field.type_config?.options?.find((o: any) => o.id === field.value || o.orderindex === field.value);
        fieldValue = opt ? opt.name : String(field.value);
      } else if (field.type === 'date' && field.value) {
        const ts = parseInt(field.value, 10);
        fieldValue = !isNaN(ts) ? new Date(ts).toLocaleDateString() : String(field.value);
      } else if (field.value != null && field.value !== '') {
        fieldValue = String(field.value);
      }
      if (fieldValue) embed.fields.push({ name: `📋 ${field.name}`, value: fieldValue, inline: true });
    }
    if (task?.url) embed.fields.push({ name: '🔗 ClickUp Link', value: `[View Full Request](${task.url})`, inline: false });
    await axios.post(this.webhookUrl, { embeds: [embed], username: 'Twist Digital Bot' });
  }

  /** Friday 6 PM: which squad is on next week (from Work Calendar). */
  async sendSquadOnNextWeekNotification(
    squadNames: string[],
    weekStart: Date,
    weekEnd: Date,
  ): Promise<void> {
    if (!this.webhookUrl) throw new Error('Discord webhook URL not configured');
    const weekLabel = `${weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} – ${weekEnd.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
    const squadList =
      squadNames.length > 0
        ? squadNames.map((name) => `• **${name}**`).join('\n')
        : '_No squad assigned for next week in Work Calendar._';
    const embed: any = {
      title: '📅 Squad On Next Week - Twist Digital',
      color: 0x9b59b6,
      description: `Here’s who’s on for **next week** (${weekLabel}).`,
      fields: [
        { name: '📆 Week', value: weekLabel, inline: true },
        { name: '👥 Squad on next week', value: squadList, inline: false },
      ],
      timestamp: new Date().toISOString(),
      footer: { text: 'Twist Digital • Work Calendar' },
    };
    await axios.post(this.webhookUrl, {
      embeds: [embed],
      username: 'Twist Digital Bot',
    });
  }

  async sendWeeklySummary(tasks: any[], weekStart: Date, weekEnd: Date): Promise<void> {
    if (!this.webhookUrl) throw new Error('Discord webhook URL not configured');
    const twisterLeaveDetails = tasks.map((task) => {
      const name = getPersonNameFromTask(task);
      const { leaveType, fromDate, toDate } = getLeavePeriodFromTask(task);
      const fromStr = fromDate ? fromDate.toLocaleDateString() : '';
      const toStr = toDate ? toDate.toLocaleDateString() : '';
      let line = `• **${name}** - ${leaveType}`;
      if (fromStr && toStr) line += fromStr === toStr ? ` (${fromStr})` : ` (${fromStr} to ${toStr})`;
      else if (fromStr) line += ` (${fromStr})`;
      else if (toStr) line += ` (${toStr})`;
      return line;
    });
    const statusText = tasks.length === 0
      ? '**0** leave requests this week'
      : `**${tasks.length}** Twister${tasks.length === 1 ? '' : 's'} on leave this week`;
    const embed: any = {
      title: '📅 Weekly Leave Summary - This Week',
      color: 0x4a90e2,
      description: `Leave requests from ${weekStart.toLocaleDateString()} to ${weekEnd.toLocaleDateString()} at Twist Digital`,
      fields: [
        { name: '📊 Team Status', value: statusText, inline: false },
      ],
      timestamp: new Date().toISOString(),
      footer: { text: 'Twist Digital • Leave Management System' },
    };
    const summaryType = '👥 Twisters Taking Time Off This Week';
    const fullValue = twisterLeaveDetails.length > 0
      ? twisterLeaveDetails.join('\n\n')
      : 'All Twisters are working this week! 🚀';
    this.addChunkedField(embed, summaryType, fullValue);
    await axios.post(this.webhookUrl, { embeds: [embed], username: 'Twist Digital Bot' });
  }

  private addChunkedField(embed: any, fieldName: string, fullValue: string): void {
    if (fullValue.length <= MAX_CHUNK_LEN) {
      embed.fields.push({ name: fieldName, value: fullValue, inline: false });
      return;
    }
    const chunks: string[] = [];
    const blocks = fullValue.split('\n\n');
    let current = '';
    for (const block of blocks) {
      const withBlock = current ? current + '\n\n' + block : block;
      if (withBlock.length <= MAX_CHUNK_LEN) {
        current = withBlock;
      } else {
        if (current) chunks.push(current);
        current = block.length <= MAX_CHUNK_LEN ? block : block.slice(0, MAX_CHUNK_LEN - 3) + '...';
      }
    }
    if (current) chunks.push(current);
    chunks.forEach((chunk, idx) => {
      embed.fields.push({
        name: chunks.length > 1 ? `${fieldName} (${idx + 1}/${chunks.length})` : fieldName,
        value: chunk,
        inline: false,
      });
    });
  }
}
