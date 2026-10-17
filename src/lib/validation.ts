import { z } from 'zod';

export const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address').max(254);
export const passwordSchema = z
  .string()
  .min(12, 'Use at least 12 characters')
  .max(128, 'Use 128 characters or fewer')
  .refine((p) => /[a-zA-Z]/.test(p) && /[^a-zA-Z]/.test(p), 'Mix letters with numbers or symbols');

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(80),
  email: emailSchema,
  password: passwordSchema,
  terms: z.literal(true, { errorMap: () => ({ message: 'Please accept the terms to continue' }) }),
  marketingConsent: z.boolean(),
});

export type FieldErrors<T> = Partial<Record<keyof T, string>>;

export function fieldErrors<T>(err: z.ZodError<T>): FieldErrors<T> {
  const out: FieldErrors<T> = {};
  for (const issue of err.issues) {
    const k = issue.path[0] as keyof T;
    if (k && !out[k]) out[k] = issue.message;
  }
  return out;
}

/** Only allow same-origin relative redirects, preventing open-redirect attacks. */
export function safeNext(next: string | null, fallback = '/'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  return next;
}
