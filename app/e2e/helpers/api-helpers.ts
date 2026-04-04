import { type Page, type APIRequestContext } from '@playwright/test';
import {
  generateRandomTask,
  type RandomTaskData,
} from './test-data';

// ── Auth token extraction ─────────────────────────────────────────────────────

/**
 * Reads the Supabase JWT access token from the browser's localStorage.
 * Supabase PKCE stores the session under a key matching `sb-*-auth-token`.
 */
async function getAuthToken(page: Page): Promise<string> {
  const token = await page.evaluate((): string | null => {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.includes('sb-') && key?.includes('auth-token')) {
        const raw = localStorage.getItem(key);
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            return parsed?.access_token ?? null;
          } catch {
            return null;
          }
        }
      }
    }
    return null;
  });

  if (!token) {
    throw new Error(
      'api-helpers: no Supabase access_token found in localStorage. ' +
        'Make sure the test uses storageState from the auth setup project.',
    );
  }

  return token;
}

// ── Task helpers ──────────────────────────────────────────────────────────────

export interface CreatedTask {
  id: string;
  name: string;
  link: string;
}

/**
 * Creates a task directly via the API (bypasses the UI).
 * Used in test `arrange` steps so that tests that verify UPDATE or DELETE
 * do not depend on the CREATE flow.
 *
 * @returns Minimal task record: { id, name, link }
 */
export async function createTaskViaAPI(
  page: Page,
  request: APIRequestContext,
  overrides?: Partial<RandomTaskData>,
): Promise<CreatedTask> {
  const token = await getAuthToken(page);
  const task = generateRandomTask(overrides);

  const squadPayloads = task.squads.map((squad, idx) => ({
    squad,
    low_returns: idx === 0 ? task.returns.low : 0,
    medium_returns: idx === 0 ? task.returns.medium : 0,
    high_returns: idx === 0 ? task.returns.high : 0,
    additional_notes: idx === 0 ? task.notes : '',
  }));

  const response = await request.post('/api/tasks', {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    data: {
      name: task.name,
      task_link: task.link,
      product_type: task.productType,
      squads: squadPayloads,
      assigned_qa: task.qaMembers,
      status: task.status,
      month: new Date().getMonth() + 1,
      year: new Date().getFullYear(),
      effort_score_date: task.effortScoreDate,
      tshirt_size: task.tshirtSize,
      category: task.category,
    },
  });

  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`createTaskViaAPI failed (${response.status()}): ${body}`);
  }

  const json = await response.json();
  const taskId: string = json?.task?.id ?? json?.id;
  if (!taskId) {
    throw new Error(
      `createTaskViaAPI: unexpected response shape — no id found. Body: ${JSON.stringify(json)}`,
    );
  }

  return { id: taskId, name: task.name, link: task.link };
}

/**
 * Deletes a task directly via the API (bypasses the UI confirm dialog).
 * Used in `afterEach` teardown blocks and in DELETE test arrange cleanup.
 *
 * Swallows errors — if the task was already deleted (e.g. by the test),
 * the teardown silently continues.
 */
export async function deleteTaskViaAPI(
  page: Page,
  request: APIRequestContext,
  taskId: string,
): Promise<void> {
  try {
    const token = await getAuthToken(page);
    const response = await request.delete(`/api/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok() && response.status() !== 404) {
      console.warn(
        `deleteTaskViaAPI: unexpected status ${response.status()} for task ${taskId}`,
      );
    }
  } catch (err) {
    console.warn(`deleteTaskViaAPI: swallowed error for task ${taskId}:`, err);
  }
}
