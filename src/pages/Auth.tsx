import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Page } from '@/components/Page';
import { Button, Checkbox, Container, Eyebrow, TextField } from '@/components/ui';
import { useAuth, type DemoPersona } from '@/state/auth';
import { emailSchema, fieldErrors, registerSchema, safeNext, type FieldErrors } from '@/lib/validation';
import { z } from 'zod';

function AuthShell({ title, eyebrow, children }: { title: string; eyebrow: string; children: React.ReactNode }) {
  return (
    <Page title={title}>
      <Container className="grid min-h-[calc(100vh-10rem)] gap-16 py-16 lg:grid-cols-2 lg:items-center">
        <div className="hidden lg:block">
          <p className="font-display text-mega font-extrabold uppercase">
            Made
            <br />
            <span className="text-crimson">new.</span>
          </p>
          <p className="mt-6 max-w-sm font-serif text-2xl leading-snug">&ldquo;The old has gone, the new is here.&rdquo;</p>
        </div>
        <div className="w-full max-w-md">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight">{title}</h1>
          <div className="mt-8">{children}</div>
        </div>
      </Container>
    </Page>
  );
}

function DemoPersonas({ next }: { next: string }) {
  const { demoSignInAs } = useAuth();
  const navigate = useNavigate();
  const personas: { id: DemoPersona; label: string; to: string }[] = [
    { id: 'creator', label: 'Creator (Ada)', to: '/creator/dashboard' },
    { id: 'reviewer', label: 'Design reviewer', to: '/admin/design-reviews' },
    { id: 'admin', label: 'Administrator', to: '/admin' },
    { id: 'finance', label: 'Finance admin', to: '/admin/payouts' },
    { id: 'shopper', label: 'Shopper', to: '/shop' },
  ];
  return (
    <div className="mt-10 border border-dashed border-ink-muted/50 p-5">
      <p className="text-sm font-semibold">Preview mode</p>
      <p className="mt-1 text-xs text-ink-muted">Supabase isn&rsquo;t configured, so real sign-in is off. Explore as a sample persona. This is a local preview only and grants no real access.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {personas.map((p) => (
          <button
            key={p.id}
            type="button"
            className="h-10 border border-line px-3 text-xs font-semibold hover:border-ink"
            onClick={() => {
              demoSignInAs(p.id);
              navigate(next !== '/' ? next : p.to, { replace: true });
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function LoginPage() {
  const { signIn, requestPasswordReset, user, mode } = useAuth();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [mode2, setMode2] = useState<'signin' | 'reset' | 'reset-sent'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user && mode === 'supabase') return <Navigate to={next} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) return setError(parsed.error.issues[0]!.message);
    setBusy(true);
    try {
      if (mode2 === 'reset') {
        await requestPasswordReset(parsed.data);
        setMode2('reset-sent');
      } else {
        await signIn(parsed.data, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title={mode2 === 'signin' ? 'Sign in' : 'Reset your password'} eyebrow="Account">
      {params.get('verified') && <p className="mb-6 border-l-2 border-crimson pl-3 text-sm">Email verified. You can sign in now.</p>}
      {mode2 === 'reset-sent' ? (
        <p className="text-ink-muted">If an account exists for that email, we&rsquo;ve sent a reset link. It expires in one hour.</p>
      ) : (
        <form onSubmit={submit} noValidate className="flex flex-col gap-5">
          <TextField label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          {mode2 === 'signin' && <TextField label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />}
          {error && <p role="alert" className="text-sm font-medium text-crimson">{error}</p>}
          <Button type="submit" busy={busy}>{mode2 === 'signin' ? 'Sign in' : 'Send reset link'}</Button>
          <div className="flex justify-between text-sm">
            <button type="button" className="underline underline-offset-4" onClick={() => { setMode2(mode2 === 'signin' ? 'reset' : 'signin'); setError(null); }}>
              {mode2 === 'signin' ? 'Forgot password?' : 'Back to sign in'}
            </button>
            <Link to="/register" className="font-semibold text-crimson">Create an account</Link>
          </div>
        </form>
      )}
      {mode === 'demo' && <DemoPersonas next={next} />}
    </AuthShell>
  );
}

type RegisterForm = z.infer<typeof registerSchema>;

export function RegisterPage() {
  const { signUp, mode } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '', terms: false, marketingConsent: false });
  const [errors, setErrors] = useState<FieldErrors<RegisterForm>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const navigate = useNavigate();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = registerSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const r = await signUp(parsed.data);
      if (r.needsVerification) setSent(true);
      else navigate('/creator/onboarding');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Create your account" eyebrow="Join MADE NEW">
      {sent ? (
        <p className="text-ink-muted">Check your inbox. We&rsquo;ve sent a link to verify <strong className="text-ink">{form.email}</strong>.</p>
      ) : (
        <form onSubmit={submit} noValidate className="flex flex-col gap-5">
          <TextField label="Name" autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={errors.name} />
          <TextField label="Email" type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} error={errors.email} />
          <TextField label="Password" type="password" autoComplete="new-password" hint="At least 12 characters, mixing letters with numbers or symbols." value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} error={errors.password} />
          <Checkbox label={<>I agree to the <Link to="/legal/terms" className="underline">terms</Link> and <Link to="/legal/privacy" className="underline">privacy notice</Link>.</>} checked={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.checked })} error={errors.terms} />
          <Checkbox label="Send me occasional news about new designs and campaigns. (Optional)" checked={form.marketingConsent} onChange={(e) => setForm({ ...form, marketingConsent: e.target.checked })} />
          {error && <p role="alert" className="text-sm font-medium text-crimson">{error}</p>}
          <Button type="submit" busy={busy}>Create account</Button>
          <p className="text-sm">Already have an account? <Link to="/login" className="font-semibold text-crimson">Sign in</Link></p>
        </form>
      )}
      {mode === 'demo' && <DemoPersonas next="/creator/onboarding" />}
    </AuthShell>
  );
}
