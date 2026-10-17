import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Page } from '@/components/Page';
import { Button, ButtonLink, Checkbox, ErrorState, Price, StatusPill, TextArea, TextField, EmptyState, Progress } from '@/components/ui';
import { WorkspaceHeader, Stat, StatGrid, Panel, LoadingGrid } from '@/components/Workspace';
import { BarsChart, SalesChart } from '@/components/Charts';
import { Garment } from '@/components/Garment';
import { platform } from '@/data/platform';
import { useResource } from '@/hooks/useResource';
import { useAuth } from '@/state/auth';
import { useToast } from '@/state/toast';
import { formatMoney, money } from '@shared/money';
import { COLOURS } from '@/data/sample';
import { useCatalogData } from '@/data/useCatalog';
import { fieldErrors, type FieldErrors } from '@/lib/validation';
import { policyFor } from '@shared/revenue-policy';
import { config } from '@/lib/config';

const privacyMailto = (subject: string, email?: string | null) =>
  `mailto:${config.privacyEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`Account email: ${email ?? ''}\n`)}`;

const gbp = (n: number) => formatMoney(money(n, 'GBP'));

/* --------------------------------- Onboarding -------------------------------- */

const onboardingSchema = z.object({
  displayName: z.string().trim().min(2, 'Enter a display name').max(60),
  kind: z.enum(['individual', 'organisation']),
  organisationName: z.string().trim().max(120).optional(),
  location: z.string().trim().min(2, 'Where are you based?').max(80),
  bio: z.string().trim().min(20, 'Tell people a little about you (20 characters or more)').max(600),
  purpose: z.string().trim().min(20, 'Describe what you hope to fund (20 characters or more)').max(600),
  termsAccepted: z.literal(true, { errorMap: () => ({ message: 'Please accept the creator terms' }) }),
});

export function Onboarding() {
  const { user, demoSignInAs, mode } = useAuth();
  const navigate = useNavigate();
  const { notify } = useToast();
  const [f, setF] = useState({ displayName: user?.name ?? '', kind: 'individual' as 'individual' | 'organisation', organisationName: '', location: '', bio: '', purpose: '', termsAccepted: false });
  const [errors, setErrors] = useState<FieldErrors<typeof f>>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = onboardingSchema.safeParse(f);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error) as FieldErrors<typeof f>);
    setErrors({});
    setBusy(true);
    try {
      await platform.onboard(parsed.data);
      if (mode === 'demo') demoSignInAs('creator');
      notify({ title: 'Welcome to the studio', body: 'Your creator profile is ready.' });
      navigate('/creator/designs/new');
    } catch (err) {
      notify({ title: 'Could not save your profile', body: err instanceof Error ? err.message : undefined, tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title="Become a creator">
      <WorkspaceHeader eyebrow="Creator onboarding" title="Tell us who you are.">
        <p className="mt-3 max-w-xl text-ink-muted">You don&rsquo;t need to belong to a church or ministry. Individuals, youth groups and organisations are all welcome.</p>
      </WorkspaceHeader>
      <form onSubmit={submit} noValidate className="grid max-w-3xl gap-6 bg-white p-6 sm:p-10">
        <fieldset>
          <legend className="mb-3 text-sm font-semibold">I&rsquo;m creating as</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {(['individual', 'organisation'] as const).map((k) => (
              <label key={k} className={`flex cursor-pointer flex-col gap-1 border p-4 ${f.kind === k ? 'border-ink' : 'border-line'}`}>
                <span className="flex items-center gap-2 font-semibold">
                  <input type="radio" name="kind" checked={f.kind === k} onChange={() => setF({ ...f, kind: k })} className="accent-crimson" />
                  {k === 'individual' ? 'An individual' : 'An organisation'}
                </span>
                <span className="pl-6 text-xs text-ink-muted">{k === 'individual' ? 'Artists, designers, students.' : 'Youth groups, ministries, charities.'}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-6 sm:grid-cols-2">
          <TextField label="Display name" value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} error={errors.displayName} />
          <TextField label="Location" placeholder="Town or city" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} error={errors.location} />
        </div>
        {f.kind === 'organisation' && <TextField label="Organisation legal name" optional hint="Used for payouts and receipts. Never shown publicly." value={f.organisationName} onChange={(e) => setF({ ...f, organisationName: e.target.value })} />}
        <TextArea label="Short bio" maxLength={600} value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} error={errors.bio} />
        <TextArea label="What do you hope to fund?" hint="A mission trip, a local project, a charity. You can add specific campaigns later." maxLength={600} value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} error={errors.purpose} />
        <Checkbox label={<>I accept the <Link to="/legal/creator-terms" className="underline">creator terms</Link> and <Link to="/legal/content-policy" className="underline">content policy</Link>.</>} checked={f.termsAccepted} onChange={(e) => setF({ ...f, termsAccepted: e.target.checked })} error={errors.termsAccepted} />
        <div>
          <Button type="submit" busy={busy}>Create my creator profile</Button>
        </div>
      </form>
    </Page>
  );
}

/* --------------------------------- Dashboard --------------------------------- */

export function CreatorDashboard() {
  const overview = useResource(() => platform.creatorOverview(), []);
  const sales = useResource(() => platform.sales(), []);
  const designs = useResource(() => platform.mySubmissions(), []);
  return (
    <Page title="Creator dashboard">
      <WorkspaceHeader eyebrow="Creator studio" title="Overview" actions={<ButtonLink to="/creator/designs/new">New design</ButtonLink>} />
      {overview.status === 'loading' && <LoadingGrid />}
      {overview.status === 'error' && <ErrorState error={overview.error} onRetry={overview.reload} />}
      {overview.status === 'ready' && (
        <StatGrid>
          <Stat label="Units sold" value={overview.data.unitsSold.toLocaleString('en-GB')} />
          <Stat label="Gross sales" value={gbp(overview.data.gross)} note="What customers paid, incl. VAT" />
          <Stat label="Estimated earnings" value={gbp(overview.data.estimatedEarnings)} note="Includes pending orders" />
          <Stat label="Confirmed earnings" value={gbp(overview.data.confirmedEarnings)} note="Past the refund window" tone="crimson" />
          <Stat label="Campaign contributions" value={gbp(overview.data.campaignContributions)} note="Owed to your campaigns" />
          <Stat label="Pending payout" value={gbp(overview.data.pendingPayouts)} />
          <Stat label="Published designs" value={overview.data.published} />
          <Stat label="Awaiting approval" value={overview.data.awaitingApproval} />
        </StatGrid>
      )}
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Panel title="Sales, last 60 days">{sales.status === 'ready' ? <SalesChart data={sales.data} dataKey="units" label="Units sold per day over the last 60 days" /> : <div className="skeleton h-64" />}</Panel>
        <Panel title="Your designs" actions={<Link to="/creator/designs" className="text-xs font-semibold underline underline-offset-4">All designs</Link>}>
          {designs.status === 'ready' ? (
            <ul className="divide-y divide-line">
              {designs.data.slice(0, 5).map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 py-3">
                  <Link to={`/creator/designs/${d.id}`} className="truncate text-sm font-semibold hover:text-crimson">{d.title}</Link>
                  <StatusPill status={d.status} />
                </li>
              ))}
            </ul>
          ) : (
            <div className="skeleton h-40" />
          )}
        </Panel>
      </div>
    </Page>
  );
}

/* ----------------------------------- Designs ---------------------------------- */

export function DesignsList() {
  const designs = useResource(() => platform.mySubmissions(), []);
  const cat = useCatalogData();
  const campaignFor = (productId?: string) => {
    if (cat.status !== 'ready' || !productId) return undefined;
    const product = cat.data.products.find((p) => p.id === productId);
    return cat.data.campaigns.find((c) => c.id === product?.campaignId)?.title;
  };
  return (
    <Page title="My designs">
      <WorkspaceHeader eyebrow="Creator studio" title="Designs" actions={<ButtonLink to="/creator/designs/new">New design</ButtonLink>} />
      {designs.status === 'loading' && <div className="skeleton h-80" />}
      {designs.status === 'error' && <ErrorState error={designs.error} onRetry={designs.reload} />}
      {designs.status === 'ready' &&
        (designs.data.length === 0 ? (
          <EmptyState title="No designs yet." body="Start with an idea. You can save a draft and come back any time." action={<ButtonLink to="/creator/designs/new">Create your first design</ButtonLink>} />
        ) : (
          <div className="overflow-x-auto bg-white">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead className="border-b border-line text-[0.7rem] uppercase tracking-[0.12em] text-ink-muted">
                <tr>
                  <th scope="col" className="p-4 font-bold">Design</th>
                  <th scope="col" className="p-4 font-bold">Status</th>
                  <th scope="col" className="p-4 font-bold">Campaign</th>
                  <th scope="col" className="p-4 text-right font-bold">Units</th>
                  <th scope="col" className="p-4 text-right font-bold">Earnings</th>
                  <th scope="col" className="p-4 font-bold">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {designs.data.map((d) => (
                  <tr key={d.id} className="hover:bg-soft">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="h-14 w-12 shrink-0 bg-soft">
                          <Garment colour={COLOURS[d.colourIds[0] ?? 'bone'] ?? COLOURS.bone!} artwork={d.artwork} category={d.category} title="" className="h-full w-full" />
                        </div>
                        <Link to={`/creator/designs/${d.id}`} className="font-semibold hover:text-crimson">{d.title}</Link>
                      </div>
                    </td>
                    <td className="p-4"><StatusPill status={d.status} /></td>
                    <td className="p-4 text-ink-muted">{d.campaign?.name ?? campaignFor(d.productId) ?? '—'}</td>
                    <td className="p-4 text-right tabular-nums">{d.unitsSold}</td>
                    <td className="p-4 text-right tabular-nums"><Price value={d.earnings} /></td>
                    <td className="p-4 text-ink-muted">{new Date(d.updatedAt).toLocaleDateString('en-GB')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </Page>
  );
}

/* ---------------------------------- Campaigns --------------------------------- */

export function CreatorCampaigns() {
  const { user } = useAuth();
  const cat = useCatalogData();
  const mine = cat.status === 'ready' ? cat.data.campaigns.filter((c) => c.creatorId === user?.creatorId) : [];
  const { notify } = useToast();
  return (
    <Page title="My campaigns">
      <WorkspaceHeader eyebrow="Creator studio" title="Campaigns">
        <p className="mt-3 max-w-xl text-sm text-ink-muted">Totals shown here come from the verified ledger only. Campaign edits go back to review before they appear publicly.</p>
      </WorkspaceHeader>
      {cat.status === 'loading' ? (
        <div className="skeleton h-64" />
      ) : mine.length === 0 ? (
        <EmptyState title="No live campaigns yet." body="Add a campaign when you submit a design. It appears here once it has been approved and is live." action={<ButtonLink to="/creator/designs/new">Submit a design</ButtonLink>} />
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {mine.map((c) => (
            <Panel key={c.id} title={c.title}>
              <p className="text-sm text-ink-muted">For {c.beneficiary}</p>
              {c.raisedVerified && (
                <div className="mt-5">
                  <p className="mb-2 font-display text-2xl font-extrabold">{formatMoney(c.raisedVerified)} <span className="text-sm font-normal text-ink-muted">of {formatMoney(c.goal)}</span></p>
                  <Progress value={c.raisedVerified.amount} goal={c.goal.amount} label={`${c.title} progress`} />
                </div>
              )}
              <p className="mt-5 text-sm">{c.description}</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button variant="secondary" className="h-10 px-4" onClick={async () => { await navigator.clipboard?.writeText(`${window.location.origin}/campaigns/${c.slug}`).catch(() => {}); notify({ title: 'Link copied' }); }}>Copy share link</Button>
                <ButtonLink to={`/campaigns/${c.slug}`} variant="ghost">View public page</ButtonLink>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </Page>
  );
}

/* ---------------------------------- Analytics --------------------------------- */

export function CreatorAnalytics() {
  const sales = useResource(() => platform.sales(), []);
  const designs = useResource(() => platform.mySubmissions(), []);
  const { user } = useAuth();
  const cat = useCatalogData();
  const campaigns = cat.status === 'ready' ? cat.data.campaigns.filter((c) => c.creatorId === user?.creatorId) : [];
  return (
    <Page title="Analytics">
      <WorkspaceHeader eyebrow="Creator studio" title="Analytics" />
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Gross sales over time">{sales.status === 'ready' ? <SalesChart data={sales.data} dataKey="gross" money label="Gross sales per day" /> : <div className="skeleton h-64" />}</Panel>
        <Panel title="Your earnings over time">{sales.status === 'ready' ? <SalesChart data={sales.data} dataKey="earnings" money label="Estimated earnings per day" /> : <div className="skeleton h-64" />}</Panel>
        <Panel title="Units sold by design">{designs.status === 'ready' ? <BarsChart data={designs.data.filter((d) => d.unitsSold > 0).map((d) => ({ name: d.title, value: d.unitsSold }))} label="Units sold by design" /> : <div className="skeleton h-64" />}</Panel>
        <Panel title="Revenue by product">{designs.status === 'ready' ? <BarsChart money data={designs.data.filter((d) => d.unitsSold > 0).map((d) => ({ name: d.title, value: d.unitsSold * d.suggestedPrice.amount }))} label="Gross revenue by product" /> : <div className="skeleton h-64" />}</Panel>
        <Panel title="Fundraising progress" className="xl:col-span-2">
          <ul className="grid gap-6 md:grid-cols-2">
            {campaigns.length === 0 && <li className="text-sm text-ink-muted">No live campaigns yet.</li>}
            {campaigns.map((c) => (
              <li key={c.id}>
                <p className="mb-2 flex justify-between text-sm"><span className="font-semibold">{c.title}</span><span className="text-ink-muted">{c.raisedVerified ? `${Math.round((c.raisedVerified.amount / c.goal.amount) * 100)}%` : 'Not verified'}</span></p>
                <Progress value={c.raisedVerified?.amount ?? 0} goal={c.goal.amount} label={c.title} />
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </Page>
  );
}

/* ----------------------------------- Earnings --------------------------------- */

export function CreatorEarnings() {
  const e = useResource(() => platform.earnings(), []);
  if (e.status === 'loading') return <LoadingGrid />;
  if (e.status === 'error') return <ErrorState error={e.error} onRetry={e.reload} />;
  const b = e.data.breakdown;
  const p = policyFor(new Date().toISOString());
  const rows: [string, number, string?][] = [
    ['Gross sales', b.gross, 'What customers paid'],
    ['VAT and taxes', -b.taxes],
    ['Garment and printing', -b.production],
    ['Shipping costs (net of shipping charged)', -b.shipping],
    ['Payment processing', -b.paymentFees],
    ['Refunds', -b.refunds],
    ['Platform share', -b.platformFees, `${p.platformShareBps / 100}% of margin`],
    ['Campaign contributions', -b.campaignContributions, `${p.campaignShareBps / 100}% of margin, paid to your campaigns`],
  ];
  return (
    <Page title="Earnings">
      <WorkspaceHeader eyebrow="Creator studio" title="Earnings">
        <p className="mt-3 max-w-2xl text-sm text-ink-muted">Calculated on our servers from verified Shopify orders and refunds under revenue policy <strong>{b.policyVersion}</strong>. Earnings stay pending for {p.holdDays} days before they can be paid out.</p>
      </WorkspaceHeader>
      <StatGrid>
        <Stat label="Net earnings" value={gbp(b.net)} tone="crimson" />
        <Stat label="Pending" value={gbp(b.pending)} note="Inside the refund window" />
        <Stat label="Paid out" value={gbp(b.paidOut)} />
        <Stat label="Campaign contributions" value={gbp(b.campaignContributions)} />
      </StatGrid>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel title="Breakdown">
          <dl className="divide-y divide-line text-sm">
            {rows.map(([k, v, note]) => (
              <div key={k} className="flex items-start justify-between gap-4 py-3">
                <dt>
                  {k}
                  {note && <span className="block text-xs text-ink-muted">{note}</span>}
                </dt>
                <dd className="tabular-nums">{gbp(v)}</dd>
              </div>
            ))}
            <div className="flex justify-between py-3 font-bold">
              <dt>Your net earnings</dt>
              <dd className="tabular-nums">{gbp(b.net)}</dd>
            </div>
          </dl>
        </Panel>
        <Panel title="Ledger">
          <p className="mb-3 text-xs text-ink-muted">Append-only. Refunds and corrections appear as new entries, never edits.</p>
          <ul className="divide-y divide-line text-sm">
            {e.data.ledger.map((l) => (
              <li key={l.id} className="flex items-start justify-between gap-4 py-3">
                <div>
                  <p className="font-medium">{l.description}</p>
                  <p className="text-xs capitalize text-ink-muted">{l.kind} · {l.status} · {new Date(l.at).toLocaleDateString('en-GB')}</p>
                </div>
                <span className={`tabular-nums ${l.amount < 0 ? 'text-crimson' : ''}`}>{gbp(l.amount)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </Page>
  );
}

/* ----------------------------------- Settings --------------------------------- */

export function CreatorSettings() {
  const { user, signOut } = useAuth();
  return (
    <Page title="Settings">
      <WorkspaceHeader eyebrow="Creator studio" title="Settings" />
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Account">
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between"><dt className="text-ink-muted">Email</dt><dd>{user?.email}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-muted">Email verified</dt><dd>{user?.emailVerified ? 'Yes' : 'No'}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-muted">Two-factor authentication</dt><dd>{user?.mfa ? 'On' : 'Off'}</dd></div>
          </dl>
          <p className="mt-4 text-xs text-ink-muted">Roles are managed by MADE NEW administrators and cannot be changed here.</p>
        </Panel>
        <Panel title="Payouts">
          <p className="text-sm text-ink-muted">Bank details are collected and stored by our payout provider. MADE NEW never stores full account numbers. Changing payout details requires you to sign in again.</p>
          <p className="mt-4 border-l-2 border-crimson pl-3 text-xs text-ink-muted">Payout onboarding is not connected yet. Until a payout provider is set up, the MADE NEW team will contact you before your first payout.</p>
        </Panel>
        <Panel title="Privacy">
          <p className="text-sm text-ink-muted">Ask for a copy of your data or for your account to be deleted. We reply within 30 days. Deletion removes your profile and drafts; financial records we must keep by law are retained and anonymised.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <a className="inline-flex h-10 items-center border border-ink px-4 text-sm font-semibold hover:bg-ink hover:text-white" href={privacyMailto('Data export request', user?.email)}>Request my data</a>
            <a className="inline-flex h-10 items-center border border-crimson px-4 text-sm font-semibold text-crimson hover:bg-crimson hover:text-white" href={privacyMailto('Account deletion request', user?.email)}>Request account deletion</a>
          </div>
          <p className="mt-3 text-xs text-ink-muted">These open an email to {config.privacyEmail}. Requests are verified against your account email before we act on them.</p>
        </Panel>
        <Panel title="Session">
          <Button variant="secondary" className="h-10 px-4" onClick={() => void signOut()}>Sign out</Button>
        </Panel>
      </div>
    </Page>
  );
}
