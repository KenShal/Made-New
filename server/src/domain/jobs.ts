/**
 * Retryable, idempotent integration jobs.
 * - Every job has a unique idempotency key (e.g. "shopify-product:<submissionId>").
 *   Enqueueing an existing key returns the existing job instead of a duplicate.
 * - Handlers must themselves be idempotent against the provider (look up by our
 *   external reference before creating), so a crash after the remote call but
 *   before we record success cannot create a second product or order.
 */
export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'dead';

export interface Job<P = unknown> {
  id: string;
  kind: string;
  idempotencyKey: string;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  payload: P;
  result?: unknown;
  lastError?: string;
  runAfter: string;
}

export interface JobStore {
  enqueue(job: Pick<Job, 'kind' | 'idempotencyKey' | 'payload'>): Promise<Job>;
  claimReady(now: string, limit: number): Promise<Job[]>;
  complete(id: string, result: unknown): Promise<void>;
  fail(id: string, error: string, retryAt: string | null): Promise<void>;
  get(id: string): Promise<Job | null>;
  requeue(id: string): Promise<Job>;
  list(limit: number): Promise<Job[]>;
}

export type JobHandler = (job: Job) => Promise<unknown>;

export function backoffMs(attempt: number): number {
  return Math.min(60 * 60_000, 2 ** attempt * 15_000);
}

/** Errors marked permanent (validation, 4xx other than 429) are not retried. */
export class PermanentJobError extends Error {}

export async function runJobs(store: JobStore, handlers: Record<string, JobHandler>, now = new Date(), limit = 10): Promise<{ ran: number; failed: number }> {
  const jobs = await store.claimReady(now.toISOString(), limit);
  let failed = 0;
  for (const job of jobs) {
    const handler = handlers[job.kind];
    try {
      if (!handler) throw new PermanentJobError(`No handler for ${job.kind}`);
      const result = await handler(job);
      await store.complete(job.id, result ?? null);
    } catch (e) {
      failed += 1;
      const msg = (e instanceof Error ? e.message : String(e)).slice(0, 500);
      const permanent = e instanceof PermanentJobError || job.attempts + 1 >= job.maxAttempts;
      await store.fail(job.id, msg, permanent ? null : new Date(now.getTime() + backoffMs(job.attempts + 1)).toISOString());
    }
  }
  return { ran: jobs.length, failed };
}

export function memoryJobStore(): JobStore & { all(): Job[] } {
  const jobs = new Map<string, Job>();
  let seq = 0;
  return {
    all: () => [...jobs.values()],
    async enqueue(j) {
      const existing = [...jobs.values()].find((x) => x.idempotencyKey === j.idempotencyKey);
      if (existing) return existing;
      const job: Job = { id: `job_${++seq}`, status: 'queued', attempts: 0, maxAttempts: 5, runAfter: new Date(0).toISOString(), ...j };
      jobs.set(job.id, job);
      return job;
    },
    async claimReady(now, limit) {
      const ready = [...jobs.values()].filter((j) => j.status === 'queued' && j.runAfter <= now).slice(0, limit);
      ready.forEach((j) => {
        j.status = 'running';
      });
      return ready;
    },
    async complete(id, result) {
      const j = jobs.get(id)!;
      j.status = 'succeeded';
      j.attempts += 1;
      j.result = result;
    },
    async fail(id, error, retryAt) {
      const j = jobs.get(id)!;
      j.attempts += 1;
      j.lastError = error;
      if (retryAt) {
        j.status = 'queued';
        j.runAfter = retryAt;
      } else j.status = j.attempts >= j.maxAttempts ? 'dead' : 'failed';
    },
    async get(id) {
      return jobs.get(id) ?? null;
    },
    async list(limit) {
      return [...jobs.values()].reverse().slice(0, limit);
    },
    async requeue(id) {
      const j = jobs.get(id);
      if (!j) throw new Error('not found');
      if (j.status !== 'failed' && j.status !== 'dead') throw new Error('Only failed jobs can be retried');
      j.status = 'queued';
      j.runAfter = new Date(0).toISOString();
      return j;
    },
  };
}
