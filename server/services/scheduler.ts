import { applyPublish, getDueScheduledBlogs, reloadFromDisk } from './blogStorage.ts';

const CHECK_INTERVAL_MS = 30_000;

let timer: NodeJS.Timeout | null = null;

/**
 * Publish every scheduled blog whose time has come. Idempotent: it only touches
 * blogs still in `scheduled` status with a `scheduledAt` at or before now.
 * Any persistence failure is logged so a later tick retries the write.
 */
export function checkDueBlogs(): void {
  const due = getDueScheduledBlogs();
  if (due.length === 0) return;
  for (const blog of due) {
    const at = blog.scheduledAt ?? new Date().toISOString();
    try {
      applyPublish(blog.id, at);
    } catch (error) {
      console.error(`[scheduler] failed to publish blog ${blog.id}:`, error);
    }
  }
}

/**
 * Start the in-process scheduler. Idempotent — calling twice is a no-op.
 */
export function startScheduler(): void {
  if (timer) return;
  // Recover anything that came due while the server was stopped.
  reloadFromDisk();
  checkDueBlogs();
  timer = setInterval(checkDueBlogs, CHECK_INTERVAL_MS);
  // Do not keep the process alive purely for the scheduler's sake; API
  // activity already keeps the server up.
  if (timer.unref) timer.unref();
}

export function stopScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}