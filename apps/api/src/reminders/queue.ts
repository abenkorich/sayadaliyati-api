import { Queue, Worker } from 'bullmq';
import type { PrismaClient } from '@saydaliyati/database';
import { z } from 'zod';
import { medicineIdSchema } from '@saydaliyati/validation';
import { ReminderDelivery } from './delivery.js';
export const REMINDER_QUEUE = 'saydaliyati-dose-reminders-v1';
const payload = z.object({ occurrenceId: medicineIdSchema }).strict();
export class ReminderQueue {
  readonly queue: Queue;
  private worker: Worker | undefined;
  private readonly delivery: ReminderDelivery;
  constructor(
    private readonly redisUrl: string,
    db: PrismaClient,
    private readonly queueName = REMINDER_QUEUE,
  ) {
    this.delivery = new ReminderDelivery(db);
    this.queue = new Queue(queueName, {
      connection: { url: redisUrl, maxRetriesPerRequest: 1 },
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 10000 },
        removeOnComplete: { age: 86400, count: 10000 },
        removeOnFail: { age: 604800, count: 10000 },
      },
    });
    this.queue.on('error', () => {
      /* Worker entry point reports safe scheduler failures. */
    });
  }
  async enqueueDue() {
    const candidates = await this.delivery.candidates();
    for (const row of candidates)
      await this.queue.add(
        'dose-due',
        { occurrenceId: row.id },
        { jobId: `dose-${row.id}` },
      );
    return candidates.length;
  }
  start() {
    if (this.worker) return;
    this.worker = new Worker(
      this.queueName,
      async (job) => {
        const parsed = payload.safeParse(job.data);
        if (job.name !== 'dose-due' || !parsed.success) return 'SUPPRESSED';
        try {
          return await this.delivery.deliver(parsed.data.occurrenceId);
        } catch {
          // BullMQ persists failures; never retain SQL or health data.
          throw new Error('Reminder processing failed.');
        }
      },
      {
        connection: { url: this.redisUrl, maxRetriesPerRequest: null },
        concurrency: 2,
        maxStalledCount: 1,
      },
    );
    this.worker.on('error', () =>
      console.error('Reminder worker connection error.'),
    );
    this.worker.on('failed', () =>
      console.error('Reminder job failed; bounded queue retry policy applies.'),
    );
  }
  async close() {
    await this.worker?.close();
    await this.queue.close();
  }
}
