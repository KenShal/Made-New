import { serve } from '@hono/node-server';
import { loadEnv } from './env';
import { createLogger } from './logger';
import { createApp } from './app';
import { supabaseVerifier } from './auth';
import { memoryRepo } from './repo/memory';
import { supabaseRepo } from './repo/supabase';
import { clamav, noScanner } from './integrations/scanner';
import { runJobs } from './domain/jobs';
import { createHandlers } from './handlers';

const env = loadEnv();
const log = createLogger();

const repo = env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY ? supabaseRepo(env) : (log.warn('Supabase not configured: using in-memory repository (development only)'), memoryRepo().repo);
const verify = env.SUPABASE_URL ? supabaseVerifier({ supabaseUrl: env.SUPABASE_URL, jwtSecret: env.SUPABASE_JWT_SECRET }) : async () => {
  throw new Error('Authentication is not configured');
};
const scanner = env.CLAMAV_HOST ? clamav(env.CLAMAV_HOST, env.CLAMAV_PORT) : noScanner;

const app = createApp({ env, repo, verify, scanner, log });
serve({ fetch: app.fetch, port: env.PORT }, (info) => log.info('MADE NEW API listening', { port: info.port, env: env.NODE_ENV }));

// Background job loop. In production prefer a dedicated worker process or scheduled function.
const handlers = createHandlers(env, repo, log);
setInterval(() => {
  runJobs(repo.jobs, handlers).catch((err) => log.error('job loop failed', { err }));
}, 15_000).unref();
