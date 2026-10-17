import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Page } from '@/components/Page';
import { Button, ErrorState, Price, StatusPill, TextArea, TextField, EmptyState } from '@/components/ui';
import { LoadingGrid, Panel, Stat, StatGrid, WorkspaceHeader } from '@/components/Workspace';
import { Garment } from '@/components/Garment';
import { platform } from '@/data/platform';
import { useResource } from '@/hooks/useResource';
import { useToast } from '@/state/toast';
import { useAuth } from '@/state/auth';
import { COLOURS } from '@/data/sample';
import { useCatalogData } from '@/data/useCatalog';
import { formatMoney, money } from '@shared/money';
import { STATUS_LABELS, nextStatusesFor, type DesignStatus } from '@shared/lifecycle';
import { integrations, config } from '@/lib/config';
import { cn } from '@/lib/cn';
import type { AdminUser, IntegrationJob } from '@shared/types';

const gbp = (n: number) => formatMoney(money(n, 'GBP'));
const th = 'p-4 text-left text-[0.7rem] font-bold uppercase tracking-[0.12em] text-ink-muted';

export function AdminOverview() {
  const o = useResource(() => platform.adminOverview(), []);
  return (
    <Page title="Admin">
      <WorkspaceHeader eyebrow="Control centre" title="Overview" />
      {o.status === 'loading' && <LoadingGrid />}
      {o.status === 'error' && <ErrorState error={o.error} onRetry={o.reload} />}
      {o.status === 'ready' && (
        <>
          <StatGrid>
            <Stat label="Total users" value={o.data.totalUsers.toLocaleString('en-GB')} />
            <Stat label="Active creators" value={o.data.activeCreators} />
            <Stat label="Awaiting review" value={o.data.awaitingReview} tone={o.data.awaitingReview ? 'crimson' : undefined} />
            <Stat label="Published products" value={o.data.publishedProducts} />
            <Stat label="Orders" value={o.data.orders.toLocaleString('en-GB')} />
            <Stat label="Gross sales" value={gbp(o.data.gross)} />
            <Stat label="Fundraising contributions" value={gbp(o.data.contributions)} />
            <Stat label="Payout exceptions" value={o.data.payoutExceptions} tone={o.data.payoutExceptions ? 'crimson' : undefined} />
          </StatGrid>
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <Panel title="Fulfilment exceptions" actions={<Link to="/admin/orders" className="text-xs underline">Orders</Link>}>
              <p className="font-display text-3xl font-extrabold">{o.data.fulfilmentExceptions}</p>
              <p className="text-sm text-ink-muted">Orders the print provider could not accept.</p>
            </Panel>
            <Panel title="Integration errors" actions={<Link to="/admin/products" className="text-xs underline">Jobs</Link>}>
              <p className="font-display text-3xl font-extrabold">{o.data.integrationErrors}</p>
              <p className="text-sm text-ink-muted">Failed jobs waiting for a safe retry.</p>
            </Panel>
          </div>
        </>
      )}
    </Page>
  );
}

export function ReviewQueue() {
  const q = useResource(() => platform.reviewQueue(), []);
  const cat = useCatalogData();
  // Creators with no live products yet aren't in the public catalogue; fall back to their id.
  const creatorName = (id: string) => (cat.status === 'ready' ? cat.data.creators.find((c) => c.id === id)?.displayName : undefined) ?? id;
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const open: DesignStatus[] = ['submitted', 'under_review', 'approved'];
  return (
    <Page title="Design reviews">
      <WorkspaceHeader eyebrow="Control centre" title="Design reviews" actions={
        <div className="flex" role="group" aria-label="Filter">
          {(['open', 'all'] as const).map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={cn('h-10 border px-4 text-xs font-bold uppercase tracking-[0.12em]', filter === f ? 'border-ink bg-ink text-white' : 'border-line bg-white')}>{f === 'open' ? 'Needs action' : 'All'}</button>
          ))}
        </div>
      } />
      {q.status === 'loading' && <div className="skeleton h-80" />}
      {q.status === 'error' && <ErrorState error={q.error} onRetry={q.reload} />}
      {q.status === 'ready' && (() => {
        const rows = q.data.filter((d) => filter === 'all' || open.includes(d.status));
        if (!rows.length) return <EmptyState title="The queue is clear." body="Nothing is waiting for a decision." />;
        return (
          <div className="overflow-x-auto bg-white">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="border-b border-line"><tr><th scope="col" className={th}>Design</th><th scope="col" className={th}>Creator</th><th scope="col" className={th}>Status</th><th scope="col" className={th}>Checks</th><th scope="col" className={th}>Updated</th></tr></thead>
              <tbody className="divide-y divide-line">
                {rows.map((d) => (
                  <tr key={d.id} className="hover:bg-soft">
                    <td className="p-4"><Link to={`/admin/design-reviews/${d.id}`} className="font-semibold hover:text-crimson">{d.title}</Link></td>
                    <td className="p-4 text-ink-muted">{creatorName(d.creatorId)}</td>
                    <td className="p-4"><StatusPill status={d.status} /></td>
                    <td className="p-4">{d.validation.every((v) => v.passed) && d.validation.length ? <span className="text-emerald-800">Passed</span> : <span className="font-medium text-crimson">{d.validation.filter((v) => !v.passed).length || 'No'} issue(s)</span>}</td>
                    <td className="p-4 text-ink-muted">{new Date(d.updatedAt).toLocaleDateString('en-GB')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })()}
    </Page>
  );
}

export function ReviewDetail() {
  const { designId = '' } = useParams();
  const { hasRole } = useAuth();
  const r = useResource(() => platform.getSubmission(designId), [designId]);
  const cat = useCatalogData();
  const { notify } = useToast();
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [reasonError, setReasonError] = useState<string | null>(null);

  if (r.status === 'loading') return <div className="skeleton h-96" />;
  if (r.status === 'error') return <ErrorState error={r.error} onRetry={r.reload} />;
  const d = r.data;
  const creator = cat.status === 'ready' ? cat.data.creators.find((c) => c.id === d.creatorId) : undefined;
  const decisions = nextStatusesFor(d.status, 'reviewer');
  const canPublish = d.status === 'approved' && hasRole('admin');
  const checksPassed = d.validation.length > 0 && d.validation.every((v) => v.passed);

  const decide = async (to: DesignStatus) => {
    const needsReason = to === 'rejected' || to === 'changes_requested';
    if (needsReason && reason.trim().length < 10) {
      setReasonError('Give the creator a clear reason (at least 10 characters).');
      return;
    }
    setReasonError(null);
    setBusy(to);
    try {
      await platform.review(d.id, to, needsReason ? reason.trim() : undefined);
      setReason('');
      notify({ title: `Marked as ${STATUS_LABELS[to]}` });
      r.reload();
    } catch (e) {
      notify({ title: 'Decision not saved', body: e instanceof Error ? e.message : undefined, tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const publish = async () => {
    setBusy('publish');
    try {
      const res = await platform.publish(d.id);
      notify({ title: 'Publishing started', body: `Job ${res.job.idempotencyKey} is ${res.job.status}.` });
      r.reload();
    } catch (e) {
      notify({ title: 'Publish failed', body: e instanceof Error ? e.message : undefined, tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const addNote = async () => {
    if (!note.trim()) return;
    setBusy('note');
    try {
      await platform.addNote(d.id, note);
      setNote('');
      r.reload();
    } catch (e) {
      notify({ title: 'Note not saved', body: e instanceof Error ? e.message : undefined, tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Page title={`Review: ${d.title}`}>
      <WorkspaceHeader eyebrow="Design review" title={d.title}>
        <div className="mt-3 flex items-center gap-3"><StatusPill status={d.status} /><span className="text-sm text-ink-muted">by {creator?.displayName}</span></div>
      </WorkspaceHeader>
      <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        <div className="grid gap-6">
          <Panel title="Artwork and mockups">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {d.colourIds.slice(0, 3).map((c) => (
                <div key={c} className="aspect-[4/5] bg-soft"><Garment colour={COLOURS[c] ?? COLOURS.bone!} artwork={d.artwork} category={d.category} title={`Mockup in ${COLOURS[c]?.name}`} className="h-full w-full p-3" /></div>
              ))}
              <div className="aspect-[4/5] bg-soft"><Garment colour={COLOURS[d.colourIds[0] ?? 'bone'] ?? COLOURS.bone!} artwork={d.artwork} crop="detail" category={d.category} title="Print detail" className="h-full w-full" /></div>
            </div>
          </Panel>
          <Panel title="Details">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-ink-muted">Description</dt><dd>{d.description}</dd></div>
              <div><dt className="text-ink-muted">Scripture</dt><dd>{d.scripture || '—'}</dd></div>
              <div><dt className="text-ink-muted">Products</dt><dd className="capitalize">{d.productTypes.join(', ')}</dd></div>
              <div><dt className="text-ink-muted">Suggested price</dt><dd><Price value={d.suggestedPrice} /></dd></div>
              <div><dt className="text-ink-muted">Ownership confirmed</dt><dd>{d.ownershipConfirmed ? 'Yes' : <span className="text-crimson">No</span>}</dd></div>
              <div><dt className="text-ink-muted">Content policy accepted</dt><dd>{d.policyAccepted ? 'Yes' : <span className="text-crimson">No</span>}</dd></div>
            </dl>
            {d.campaign && (
              <div className="mt-5 border-t border-line pt-4 text-sm">
                <p className="font-semibold">Campaign: {d.campaign.name}</p>
                <p className="text-ink-muted">Goal {formatMoney(d.campaign.goal)} · Beneficiary {d.campaign.beneficiary}</p>
                <p className="mt-1">{d.campaign.intendedUse}</p>
              </div>
            )}
          </Panel>
          <Panel title="Automated validation">
            <ul className="space-y-2 text-sm">
              {d.validation.length === 0 && <li className="text-crimson">No validation has run.</li>}
              {d.validation.map((v) => <li key={v.check} className={v.passed ? '' : 'font-medium text-crimson'}>{v.passed ? '✓' : '✕'} {v.check}: <span className="text-ink-muted">{v.detail}</span></li>)}
            </ul>
          </Panel>
          <Panel title="Audit history">
            <ol className="space-y-3 text-sm">
              {d.history.map((h) => (
                <li key={h.id} className="border-l-2 border-line pl-3">
                  <p><strong>{h.from ? STATUS_LABELS[h.from] : 'Created'} → {STATUS_LABELS[h.to]}</strong></p>
                  <p className="text-xs text-ink-muted">{h.actorName} · {new Date(h.at).toLocaleString('en-GB')}</p>
                  {h.reason && <p className="mt-1">{h.reason}</p>}
                </li>
              ))}
            </ol>
          </Panel>
        </div>
        <div className="grid gap-6 xl:sticky xl:top-24 xl:self-start">
          <Panel title="Decision">
            {decisions.length === 0 && !canPublish && <p className="text-sm text-ink-muted">No review action is available in the current status.</p>}
            {decisions.includes('under_review') && <Button className="w-full" busy={busy === 'under_review'} onClick={() => void decide('under_review')}>Start review</Button>}
            {d.status === 'under_review' && (
              <div className="flex flex-col gap-3">
                <TextArea label="Reason for the creator" hint="Required to reject or request changes. The creator will see this." value={reason} onChange={(e) => setReason(e.target.value)} error={reasonError ?? undefined} maxLength={1000} />
                <Button busy={busy === 'approved'} disabled={!checksPassed || !d.ownershipConfirmed || !d.policyAccepted} onClick={() => void decide('approved')}>Approve</Button>
                {!checksPassed && <p className="text-xs text-crimson">Approval is locked until automated checks pass.</p>}
                <Button variant="secondary" busy={busy === 'changes_requested'} onClick={() => void decide('changes_requested')}>Request changes</Button>
                <Button variant="danger" busy={busy === 'rejected'} onClick={() => void decide('rejected')}>Reject</Button>
              </div>
            )}
            {d.status === 'approved' && (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-ink-muted">Publishing creates the Shopify product and print-on-demand product through an idempotent job. Retrying never duplicates it.</p>
                <Button busy={busy === 'publish'} disabled={!canPublish} onClick={() => void publish()}>Publish to store</Button>
                {!hasRole('admin') && <p className="text-xs text-ink-muted">Only administrators can publish.</p>}
              </div>
            )}
          </Panel>
          <Panel title="Internal notes">
            <p className="mb-3 text-xs text-ink-muted">Visible to reviewers and admins only.</p>
            <ul className="mb-4 space-y-3 text-sm">
              {d.internalNotes.map((n, i) => <li key={i} className="bg-soft p-3"><p>{n.body}</p><p className="mt-1 text-xs text-ink-muted">{n.author} · {new Date(n.at).toLocaleString('en-GB')}</p></li>)}
            </ul>
            <TextArea label="Add a note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
            <Button variant="secondary" className="mt-3 h-10 px-4" busy={busy === 'note'} onClick={() => void addNote()}>Save note</Button>
          </Panel>
        </div>
      </div>
    </Page>
  );
}

export function AdminUsers() {
  const [q, setQ] = useState('');
  const users = useResource(() => platform.users(q), [q]);
  const [target, setTarget] = useState<AdminUser | null>(null);
  const [reason, setReason] = useState('');
  const { notify } = useToast();
  const apply = async () => {
    if (!target) return;
    try {
      await platform.setUserStatus(target.id, target.status === 'active' ? 'suspended' : 'active', reason);
      notify({ title: target.status === 'active' ? 'Account suspended' : 'Account restored' });
      setTarget(null);
      setReason('');
      users.reload();
    } catch (e) {
      notify({ title: 'Action failed', body: e instanceof Error ? e.message : undefined, tone: 'error' });
    }
  };
  return (
    <Page title="Users">
      <WorkspaceHeader eyebrow="Control centre" title="Users" />
      <div className="mb-4 max-w-sm"><TextField label="Search by name or email" type="search" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {users.status === 'error' && <ErrorState error={users.error} onRetry={users.reload} />}
      {users.status === 'ready' && (
        <div className="overflow-x-auto bg-white">
          <table className="w-full min-w-[44rem] text-sm">
            <thead className="border-b border-line"><tr><th scope="col" className={th}>Name</th><th scope="col" className={th}>Roles</th><th scope="col" className={th}>Designs</th><th scope="col" className={th}>Reports</th><th scope="col" className={th}>Status</th><th scope="col" className={th}><span className="sr-only">Actions</span></th></tr></thead>
            <tbody className="divide-y divide-line">
              {users.data.map((u) => (
                <tr key={u.id}>
                  <td className="p-4"><p className="font-semibold">{u.name}</p><p className="text-xs text-ink-muted">{u.email}</p></td>
                  <td className="p-4 capitalize">{u.roles.join(', ')}</td>
                  <td className="p-4 tabular-nums">{u.designs}</td>
                  <td className={cn('p-4 tabular-nums', u.reports > 2 && 'font-semibold text-crimson')}>{u.reports}</td>
                  <td className="p-4 capitalize">{u.status}</td>
                  <td className="p-4 text-right"><button type="button" className="text-xs font-semibold underline" onClick={() => setTarget(u)}>{u.status === 'active' ? 'Suspend' : 'Restore'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {target && (
        <Panel title={`${target.status === 'active' ? 'Suspend' : 'Restore'} ${target.name}`} className="mt-6 max-w-xl border border-ink">
          <TextArea label="Reason (recorded in the audit log)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="mt-3 flex gap-3"><Button variant={target.status === 'active' ? 'danger' : 'primary'} onClick={() => void apply()}>Confirm</Button><Button variant="ghost" onClick={() => setTarget(null)}>Cancel</Button></div>
        </Panel>
      )}
    </Page>
  );
}

export function AdminProducts() {
  const jobs = useResource(() => platform.jobs(), []);
  const cat = useCatalogData();
  const { notify } = useToast();
  const retry = async (j: IntegrationJob) => {
    try {
      await platform.retryJob(j.id);
      notify({ title: 'Retry queued', body: `Idempotency key ${j.idempotencyKey} prevents duplicates.` });
      jobs.reload();
    } catch (e) {
      notify({ title: 'Retry failed', body: e instanceof Error ? e.message : undefined, tone: 'error' });
    }
  };
  return (
    <Page title="Products & integrations">
      <WorkspaceHeader eyebrow="Control centre" title="Products & integrations" />
      <Panel title="Catalogue mapping">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="border-b border-line"><tr><th scope="col" className={th}>Product</th><th scope="col" className={th}>Shopify ID</th><th scope="col" className={th}>Variants</th><th scope="col" className={th}>POD</th><th scope="col" className={th}>Sync</th></tr></thead>
            <tbody className="divide-y divide-line">
              {cat.status === 'ready' && cat.data.products.length === 0 && (
                <tr><td colSpan={5} className="p-4 text-ink-muted">No published products yet.</td></tr>
              )}
              {cat.status === 'ready' && cat.data.products.map((p) => (
                <tr key={p.id}>
                  <td className="p-4 font-semibold">{p.name}</td>
                  <td className="p-4 font-mono text-xs text-ink-muted">{p.sample ? 'Sample product' : p.id}</td>
                  <td className="p-4 tabular-nums">{p.variants.length} ({p.variants.filter((v) => !v.available).length} unavailable)</td>
                  <td className="p-4 text-ink-muted">{p.sample ? 'Sample' : 'See integration jobs'}</td>
                  <td className="p-4">{p.sample ? <span className="text-ink-muted">Sample data</span> : <span className="text-emerald-800">Live in Shopify</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="Integration jobs" className="mt-6">
        {jobs.status === 'ready' ? (
          <ul className="divide-y divide-line text-sm">
            {jobs.data.map((j) => (
              <li key={j.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-semibold">{j.kind}</p>
                  <p className="font-mono text-xs text-ink-muted">{j.idempotencyKey} · attempts {j.attempts}</p>
                  {j.lastError && <p className="mt-1 text-xs text-crimson">{j.lastError}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <span className={cn('text-xs font-bold uppercase tracking-[0.12em]', j.status === 'failed' ? 'text-crimson' : j.status === 'succeeded' ? 'text-emerald-800' : 'text-ink-muted')}>{j.status}</span>
                  {j.status === 'failed' && <Button variant="secondary" className="h-9 px-3" onClick={() => void retry(j)}>Retry</Button>}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="skeleton h-40" />
        )}
      </Panel>
    </Page>
  );
}

export function AdminOrders() {
  const o = useResource(() => platform.orders(), []);
  return (
    <Page title="Orders">
      <WorkspaceHeader eyebrow="Control centre" title="Orders">
        <p className="mt-3 text-sm text-ink-muted">Recorded only from signed Shopify webhooks. Customer details are minimised here; full records stay in Shopify.</p>
      </WorkspaceHeader>
      {o.status === 'error' && <ErrorState error={o.error} onRetry={o.reload} />}
      {o.status === 'ready' && (
        <div className="overflow-x-auto bg-white">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="border-b border-line"><tr><th scope="col" className={th}>Order</th><th scope="col" className={th}>Date</th><th scope="col" className={th}>Customer</th><th scope="col" className={th}>Items</th><th scope="col" className={th}>Total</th><th scope="col" className={th}>Status</th></tr></thead>
            <tbody className="divide-y divide-line">
              {o.data.map((x) => (
                <tr key={x.id}>
                  <td className="p-4 font-mono text-xs">{x.shopifyOrderId}</td>
                  <td className="p-4">{new Date(x.createdAt).toLocaleString('en-GB')}</td>
                  <td className="p-4">{x.customerInitials}</td>
                  <td className="p-4 tabular-nums">{x.items}</td>
                  <td className="p-4"><Price value={x.total} /></td>
                  <td className={cn('p-4 capitalize', x.status === 'fulfilment_error' && 'font-semibold text-crimson')}>{x.status.replace('_', ' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Page>
  );
}

export function AdminEarnings() {
  const r = useResource(() => platform.reconciliation(), []);
  return (
    <Page title="Earnings & reconciliation">
      <WorkspaceHeader eyebrow="Finance" title="Earnings & reconciliation">
        <p className="mt-3 max-w-2xl text-sm text-ink-muted">Ledger entries are append-only and computed on the server from verified order and refund webhooks. Corrections are recorded as adjustments by a finance administrator, with a reason. Figures cover the last 30 days.</p>
      </WorkspaceHeader>
      {r.status === 'loading' && <LoadingGrid />}
      {r.status === 'error' && <ErrorState error={r.error} onRetry={r.reload} />}
      {r.status === 'ready' && (
        <>
          <StatGrid>
            <Stat label="Paid orders recorded" value={r.data.orders.toLocaleString('en-GB')} />
            <Stat label="Shopify order totals" value={gbp(r.data.shopifyGross)} note="Including tax and shipping" />
            <Stat label="Creator earnings (net of refunds)" value={gbp(r.data.creatorEarnings)} />
            <Stat label="Campaign contributions (net of refunds)" value={gbp(r.data.campaignContributions)} />
          </StatGrid>
          <Panel title="Reconciliation checks" className="mt-6">
            <ul className="space-y-2 text-sm">
              {r.data.unmatchedOrders.length === 0 ? (
                <li>✓ Every paid order in this period has ledger sale entries</li>
              ) : (
                <li className="font-medium text-crimson">✕ {r.data.unmatchedOrders.length} order(s) have items with no ledger sale entry: {r.data.unmatchedOrders.slice(0, 10).join(', ')}</li>
              )}
              <li>{r.data.refundEntries} refund reversal entries recorded</li>
              <li>Platform share: {gbp(r.data.platformShare)}</li>
            </ul>
          </Panel>
        </>
      )}
    </Page>
  );
}

export function AdminPayouts() {
  const p = useResource(() => platform.payouts(), []);
  const { notify } = useToast();
  const approve = async (id: string) => {
    try {
      await platform.approvePayout(id);
      notify({ title: 'Payout approved', body: 'Approval is logged. Send the payment through your payout provider.' });
      p.reload();
    } catch (e) {
      notify({ title: 'Approval failed', body: e instanceof Error ? e.message : undefined, tone: 'error' });
    }
  };
  return (
    <Page title="Payouts">
      <WorkspaceHeader eyebrow="Finance" title="Payouts">
        <p className="mt-3 max-w-2xl text-sm text-ink-muted">Requires the finance role and recent multi-factor sign-in. Each approval uses an idempotency key so a retried request cannot pay twice.</p>
      </WorkspaceHeader>
      {p.status === 'error' && <ErrorState error={p.error} onRetry={p.reload} />}
      {p.status === 'ready' && (
        <div className="overflow-x-auto bg-white">
          <table className="w-full min-w-[32rem] text-sm">
            <thead className="border-b border-line"><tr><th scope="col" className={th}>Creator</th><th scope="col" className={th}>Amount</th><th scope="col" className={th}>Status</th><th scope="col" className={th}><span className="sr-only">Actions</span></th></tr></thead>
            <tbody className="divide-y divide-line">
              {p.data.map((x) => (
                <tr key={x.id}>
                  <td className="p-4 font-semibold">{x.creator}</td>
                  <td className="p-4 tabular-nums">{gbp(x.amount)}</td>
                  <td className="p-4 capitalize">{x.status.replace('_', ' ')}{x.reason && <span className="block text-xs text-crimson">{x.reason}</span>}</td>
                  <td className="p-4 text-right">{x.status === 'eligible' && <Button className="h-9 px-3" onClick={() => void approve(x.id)}>Approve</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Page>
  );
}

export function AdminSettings() {
  const rows: [string, boolean, string][] = [
    ['Supabase (auth, database, storage)', integrations.supabase, config.supabaseUrl ? new URL(config.supabaseUrl).host : 'Not configured'],
    ['Shopify Storefront', integrations.shopify, config.shopifyDomain || 'Not configured'],
    ['MADE NEW API server', integrations.api, config.apiBaseUrl || 'Not configured'],
  ];
  return (
    <Page title="Settings">
      <WorkspaceHeader eyebrow="Control centre" title="Settings" />
      <Panel title="Integrations">
        <ul className="divide-y divide-line text-sm">
          {rows.map(([k, ok, detail]) => (
            <li key={k} className="flex items-center justify-between gap-4 py-3">
              <span>{k}</span>
              <span className={ok ? 'text-emerald-800' : 'text-crimson'}>{ok ? 'Connected' : 'Not configured'} <span className="text-ink-muted">· {detail}</span></span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-ink-muted">Server-side secrets (Shopify Admin token, webhook secret, print-on-demand keys, payout provider keys) are never shown here. See docs/DEPLOYMENT.md.</p>
      </Panel>
      <Panel title="Security" className="mt-6">
        <ul className="space-y-2 text-sm text-ink-muted">
          <li>Administrator, reviewer and finance accounts must enrol in multi-factor authentication (enforced by the API via the AAL2 claim).</li>
          <li>Payout approvals and role changes require a sign-in within the last 15 minutes.</li>
          <li>Role changes are made by database administrators through the audited <code>grant_role</code> function, never from this browser.</li>
        </ul>
      </Panel>
    </Page>
  );
}
