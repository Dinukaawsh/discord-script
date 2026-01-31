import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class ClickUpService {
  private readonly baseUrl = 'https://api.clickup.com/api/v2';
  private readonly listId: string | undefined;
  private readonly workCalendarListId: string | undefined;
  private readonly token: string | undefined;

  constructor(private config: ConfigService) {
    this.token = this.config.get<string>('CLICKUP_API_TOKEN');
    this.listId = this.config.get<string>('LEAVE_LIST_ID');
    this.workCalendarListId = this.config.get<string>('WORK_CALENDAR_LIST_ID');
  }

  getListId(): string {
    if (!this.listId) throw new Error('LEAVE_LIST_ID not configured in env');
    return this.listId;
  }

  getWorkCalendarListId(): string {
    if (!this.workCalendarListId) throw new Error('WORK_CALENDAR_LIST_ID not configured in env');
    return this.workCalendarListId;
  }

  isConfigured(): boolean {
    return !!this.token;
  }

  async getTasks(params?: { includeClosed?: boolean }): Promise<any[]> {
    if (!this.token) throw new Error('ClickUp API token not configured');
    const { data } = await axios.get(`${this.baseUrl}/list/${this.getListId()}/task`, {
      headers: { Authorization: this.token, 'Content-Type': 'application/json' },
      params: {
        include_closed: params?.includeClosed ?? true,
        subtasks: false,
      },
    });
    return data?.tasks || [];
  }

  /** Get tasks from any list (e.g. Work Calendar). */
  async getTasksFromList(listId: string, params?: { includeClosed?: boolean }): Promise<any[]> {
    if (!this.token) throw new Error('ClickUp API token not configured');
    const { data } = await axios.get(`${this.baseUrl}/list/${listId}/task`, {
      headers: { Authorization: this.token, 'Content-Type': 'application/json' },
      params: {
        include_closed: params?.includeClosed ?? true,
        subtasks: false,
      },
    });
    return data?.tasks || [];
  }

  /** Get tasks with custom params (e.g. order_by, reverse, limit for check-now). */
  async getTasksWithParams(params: {
    includeClosed?: boolean;
    limit?: number;
    order_by?: string;
    reverse?: boolean;
  }): Promise<any[]> {
    if (!this.token) throw new Error('ClickUp API token not configured');
    const { data } = await axios.get(`${this.baseUrl}/list/${this.getListId()}/task`, {
      headers: { Authorization: this.token, 'Content-Type': 'application/json' },
      params: {
        include_closed: params?.includeClosed ?? true,
        subtasks: false,
        limit: params?.limit ?? 100,
        order_by: params?.order_by,
        reverse: params?.reverse,
      },
    });
    return data?.tasks || [];
  }

  /** List all lists in a workspace (spaces + folders + folderless lists). */
  async findLists(workspaceId: string): Promise<Array<{ id: string; name: string; space: string; spaceId: string; folder?: string; folderId?: string }>> {
    const all = await this.getFullHierarchy(workspaceId);
    return all.lists;
  }

  /** Full hierarchy: spaces, folders, and lists (for search). */
  async getFullHierarchy(workspaceId: string): Promise<{
    spaces: Array<{ id: string; name: string }>;
    folders: Array<{ id: string; name: string; spaceId: string; spaceName: string; path: string }>;
    lists: Array<{ id: string; name: string; space: string; spaceId: string; folder?: string; folderId?: string; path: string }>;
  }> {
    if (!this.token) throw new Error('ClickUp API token not configured');
    const headers = { Authorization: this.token, 'Content-Type': 'application/json' };
    const { data: spacesData } = await axios.get(`${this.baseUrl}/team/${workspaceId}/space`, { headers });
    const spaces = spacesData?.spaces || [];
    const folders: Array<{ id: string; name: string; spaceId: string; spaceName: string; path: string }> = [];
    const lists: Array<{ id: string; name: string; space: string; spaceId: string; folder?: string; folderId?: string; path: string }> = [];

    for (const space of spaces) {
      const spacePath = space.name;
      try {
        // Folderless lists (directly in space)
        const { data: folderlessData } = await axios.get(`${this.baseUrl}/space/${space.id}/list`, { headers });
        const folderlessLists = folderlessData?.lists || [];
        for (const list of folderlessLists) {
          lists.push({
            id: list.id,
            name: list.name,
            space: space.name,
            spaceId: space.id,
            path: `${spacePath} / ${list.name}`,
          });
        }
        // Folders and their lists
        const { data: foldersData } = await axios.get(`${this.baseUrl}/space/${space.id}/folder`, { headers });
        const spaceFolders = foldersData?.folders || [];
        for (const folder of spaceFolders) {
          const folderPath = `${spacePath} / ${folder.name}`;
          folders.push({ id: folder.id, name: folder.name, spaceId: space.id, spaceName: space.name, path: folderPath });
          try {
            const { data: listData } = await axios.get(`${this.baseUrl}/folder/${folder.id}/list`, { headers });
            const folderLists = listData?.lists || [];
            for (const list of folderLists) {
              lists.push({
                id: list.id,
                name: list.name,
                space: space.name,
                spaceId: space.id,
                folder: folder.name,
                folderId: folder.id,
                path: `${folderPath} / ${list.name}`,
              });
            }
          } catch {
            // skip folder
          }
        }
      } catch {
        // skip space
      }
    }

    return { spaces, folders, lists };
  }

  /** Find anything named like "work calendar" (list, folder, or space). Case-insensitive. */
  async findByName(workspaceId: string, searchTerm: string): Promise<{
    lists: Array<{ id: string; name: string; path: string; spaceId: string; folderId?: string }>;
    folders: Array<{ id: string; name: string; path: string; spaceId: string }>;
    spaces: Array<{ id: string; name: string }>;
  }> {
    const term = searchTerm.trim().toLowerCase();
    if (!term) {
      return { lists: [], folders: [], spaces: [] };
    }
    const { spaces, folders, lists } = await this.getFullHierarchy(workspaceId);
    const match = (name: string) => (name || '').toLowerCase().includes(term);
    return {
      spaces: spaces.filter((s) => match(s.name)),
      folders: folders.filter((f) => match(f.name)).map((f) => ({ id: f.id, name: f.name, path: f.path, spaceId: f.spaceId })),
      lists: lists.filter((l) => match(l.name)).map((l) => ({
        id: l.id,
        name: l.name,
        path: l.path,
        spaceId: l.spaceId,
        folderId: l.folderId,
      })),
    };
  }

  /**
   * Filter tasks that have leave overlapping [start, end].
   */
  filterTasksByDateRange(tasks: any[], start: Date, end: Date): any[] {
    return tasks.filter((task) => {
      if (task.due_date) {
        const due = new Date(parseInt(task.due_date, 10));
        if (due >= start && due <= end) return true;
        if (due > end && task.start_date) {
          const from = new Date(parseInt(task.start_date, 10));
          if (from <= end && due >= start) return true;
        }
      }
      const fields = task.custom_fields || [];
      for (const f of fields) {
        if (f.type === 'date' && f.value) {
          const d = new Date(typeof f.value === 'number' ? f.value : parseInt(f.value, 10));
          if (!isNaN(d.getTime()) && d >= start && d <= end) return true;
        }
      }
      return false;
    });
  }

  /**
   * Filter tasks that overlap with the given month (startOfMonth, endOfMonth).
   */
  filterTasksByMonth(tasks: any[], startOfMonth: Date, endOfMonth: Date): any[] {
    return tasks.filter((task) => {
      if (task.due_date) {
        const due = new Date(parseInt(task.due_date, 10));
        if (due >= startOfMonth && due <= endOfMonth) return true;
        if (due > endOfMonth && task.start_date) {
          const from = new Date(parseInt(task.start_date, 10));
          if (from <= endOfMonth && due >= startOfMonth) return true;
        }
      }
      for (const f of task.custom_fields || []) {
        if (f.type === 'date' && f.value) {
          const d = new Date(typeof f.value === 'number' ? f.value : parseInt(f.value, 10));
          if (!isNaN(d.getTime()) && d >= startOfMonth && d <= endOfMonth) return true;
        }
      }
      return false;
    });
  }
}
