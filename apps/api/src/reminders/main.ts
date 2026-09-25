import { createDatabaseClient, isDatabaseReady } from '@saydaliyati/database';
import { readConfig } from '../config.js';
import { POLL_INTERVAL_MS } from './delivery.js';
import { ReminderQueue } from './queue.js';
let queue: ReminderQueue | undefined;
let db: ReturnType<typeof createDatabaseClient> | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let stopped = false;
let pendingPoll: Promise<void> | undefined;
async function stop() {
  if (stopped) return;
  stopped = true;
  clearTimeout(timer);
  const deadline = setTimeout(() => process.exit(1), 10000);
  deadline.unref();
  try {
    await pendingPoll;
    await queue?.close();
    await db?.$disconnect();
  } finally {
    clearTimeout(deadline);
  }
}
try {
  const config = readConfig(process.env);
  db = createDatabaseClient(config.DATABASE_URL);
  if (!(await isDatabaseReady(db))) throw new Error('Schema not ready');
  queue = new ReminderQueue(config.REDIS_URL, db);
  await queue.queue.waitUntilReady();
  queue.start();
  const poll = async () => {
    try {
      await queue!.enqueueDue();
    } catch {
      console.error(
        'Reminder scheduler unavailable; retrying on the next poll.',
      );
    }
    if (!stopped)
      timer = setTimeout(() => {
        pendingPoll = poll();
      }, POLL_INTERVAL_MS);
  };
  process.once('SIGINT', () => void stop());
  process.once('SIGTERM', () => void stop());
  console.log('Reminder worker started: private in-app inbox delivery only.');
  pendingPoll = poll();
  await pendingPoll;
} catch {
  console.error(
    'Reminder worker startup failed. Check configuration and local services.',
  );
  await stop();
  process.exitCode = 1;
}
