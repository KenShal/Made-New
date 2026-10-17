/**
 * Structured JSON logger with secret redaction. Never pass raw request bodies,
 * tokens, card data or passwords; redaction is a safety net, not a licence.
 */
const SENSITIVE_KEY = /pass(word)?|secret|token|authorization|cookie|api[-_]?key|card|cvv|iban|account_number|service_role|hmac|signature/i;
const BEARER = /Bearer\s+[A-Za-z0-9._~+/-]+=*/g;
const JWT = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
const SHOPIFY_TOKEN = /shp(at|ss|ca|pa)_[A-Fa-f0-9]{16,}/g;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[depth]';
  if (typeof value === 'string') return value.replace(BEARER, 'Bearer [redacted]').replace(JWT, '[jwt]').replace(SHOPIFY_TOKEN, '[shopify-token]');
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (value && typeof value === 'object') {
    if (value instanceof Error) return { name: value.name, message: redact(value.message) };
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = SENSITIVE_KEY.test(k) ? '[redacted]' : redact(v, depth + 1);
    return out;
  }
  return value;
}

type Level = 'debug' | 'info' | 'warn' | 'error';
export type Logger = Record<Level, (msg: string, fields?: Record<string, unknown>) => void>;

export function createLogger(sink: (line: string) => void = (l) => process.stdout.write(l + '\n')): Logger {
  const log = (level: Level) => (msg: string, fields: Record<string, unknown> = {}) =>
    sink(JSON.stringify({ level, msg: redact(msg), time: new Date().toISOString(), ...(redact(fields) as object) }));
  return { debug: log('debug'), info: log('info'), warn: log('warn'), error: log('error') };
}
