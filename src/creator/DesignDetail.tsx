import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Page } from '@/components/Page';
import { Button, ButtonLink, ErrorState, Price, StatusPill } from '@/components/ui';
import { Panel, WorkspaceHeader } from '@/components/Workspace';
import { Garment } from '@/components/Garment';
import { platform } from '@/data/platform';
import { useResource } from '@/hooks/useResource';
import { useToast } from '@/state/toast';
import { COLOURS } from '@/data/sample';
import { useCatalogData } from '@/data/useCatalog';
import { EDITABLE_BY_CREATOR, STATUS_LABELS } from '@shared/lifecycle';
import type { DesignSubmission } from '@shared/types';
import { DesignEditor } from './DesignEditor';

export function NewDesign() {
  return (
    <Page title="New design">
      <WorkspaceHeader eyebrow="Creator studio" title="New design">
        <p className="mt-3 max-w-xl text-sm text-ink-muted">Drafts are private. Save at any step and come back later.</p>
      </WorkspaceHeader>
      <DesignEditor />
    </Page>
  );
}

export function DesignDetail() {
  const { designId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const r = useResource(() => platform.getSubmission(designId), [designId]);
  if (r.status === 'loading') return <div className="skeleton h-96" aria-busy="true" />;
  if (r.status === 'error') return <ErrorState error={r.error} onRetry={r.reload} />;
  if (params.get('edit') === '1' && EDITABLE_BY_CREATOR.includes(r.data.status)) {
    return (
      <Page title={`Edit ${r.data.title}`}>
        <WorkspaceHeader eyebrow="Editing" title={r.data.title} actions={<Button variant="ghost" onClick={() => setParams({})}>Cancel</Button>} />
        <DesignEditor existing={r.data} />
      </Page>
    );
  }
  return <DesignSummary design={r.data} reload={r.reload} onEdit={() => setParams({ edit: '1' })} />;
}

function DesignSummary({ design: d, reload, onEdit }: { design: DesignSubmission; reload: () => void; onEdit: () => void }) {
  const { notify } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const feedback = [...d.history].reverse().find((h) => (h.to === 'changes_requested' || h.to === 'rejected') && h.reason);
  const cat = useCatalogData();
  const product = cat.status === 'ready' ? cat.data.products.find((p) => p.id === d.productId) : undefined;
  const editable = EDITABLE_BY_CREATOR.includes(d.status);

  const act = async (kind: 'submit' | 'archive') => {
    setBusy(kind);
    try {
      if (kind === 'submit') await platform.submit(d.id);
      else await platform.archive(d.id);
      notify({ title: kind === 'submit' ? 'Resubmitted for review' : 'Design archived' });
      reload();
    } catch (e) {
      notify({ title: 'That did not work', body: e instanceof Error ? e.message : undefined, tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Page title={d.title}>
      <WorkspaceHeader
        eyebrow="Design"
        title={d.title}
        actions={
          <>
            {editable && <Button variant="secondary" onClick={onEdit}>Edit</Button>}
            {d.status === 'changes_requested' && <Button busy={busy === 'submit'} onClick={() => void act('submit')}>Resubmit</Button>}
            {d.status === 'draft' && <Button busy={busy === 'submit'} onClick={() => void act('submit')}>Submit for review</Button>}
            {(d.status === 'draft' || d.status === 'rejected') && <Button variant="ghost" busy={busy === 'archive'} onClick={() => void act('archive')}>Archive</Button>}
            {d.status === 'published' && product && <ButtonLink to={`/shop/${product.slug}`} variant="secondary">View in shop</ButtonLink>}
          </>
        }
      >
        <div className="mt-3"><StatusPill status={d.status} /></div>
      </WorkspaceHeader>

      {feedback && (
        <div role="status" className="mb-6 border-l-4 border-crimson bg-white p-5">
          <p className="text-[0.7rem] font-bold uppercase tracking-[0.12em] text-crimson">Reviewer feedback</p>
          <p className="mt-2">{feedback.reason}</p>
          <p className="mt-2 text-xs text-ink-muted">{feedback.actorName} · {new Date(feedback.at).toLocaleString('en-GB')}</p>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[22rem_1fr]">
        <Panel>
          <div className="aspect-[4/5] bg-soft">
            <Garment colour={COLOURS[d.colourIds[0] ?? 'bone'] ?? COLOURS.bone!} artwork={d.artwork} category={d.category} title={`${d.title} mockup`} className="h-full w-full p-4" />
          </div>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-ink-muted">Suggested price</dt><dd><Price value={d.suggestedPrice} /></dd></div>
            <div className="flex justify-between"><dt className="text-ink-muted">Units sold</dt><dd>{d.unitsSold}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-muted">Earnings</dt><dd><Price value={d.earnings} /></dd></div>
          </dl>
        </Panel>
        <div className="grid gap-6">
          <Panel title="Automated checks">
            {d.validation.length === 0 ? (
              <p className="text-sm text-ink-muted">Checks run when artwork is uploaded.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {d.validation.map((v) => (
                  <li key={v.check} className={v.passed ? '' : 'font-medium text-crimson'}>
                    {v.passed ? '✓' : '✕'} {v.check}: <span className="text-ink-muted">{v.detail}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="History">
            {d.history.length === 0 ? (
              <p className="text-sm text-ink-muted">Not submitted yet.</p>
            ) : (
              <ol className="relative space-y-5 border-l border-line pl-5">
                {d.history.map((h) => (
                  <li key={h.id} className="relative">
                    <span className="absolute -left-[1.42rem] top-1.5 h-2 w-2 rounded-full bg-crimson" aria-hidden />
                    <p className="text-sm font-semibold">{h.from ? `${STATUS_LABELS[h.from]} → ` : ''}{STATUS_LABELS[h.to]}</p>
                    <p className="text-xs text-ink-muted">{h.actorName} · {new Date(h.at).toLocaleString('en-GB')}</p>
                    {h.reason && <p className="mt-1 text-sm">{h.reason}</p>}
                  </li>
                ))}
              </ol>
            )}
          </Panel>
          {d.campaign && (
            <Panel title="Campaign">
              <p className="font-semibold">{d.campaign.name}</p>
              <p className="text-sm text-ink-muted">For {d.campaign.beneficiary}</p>
              <p className="mt-2 text-sm">{d.campaign.description}</p>
            </Panel>
          )}
          <p className="text-xs text-ink-muted"><Link to="/creator/designs" className="underline">Back to all designs</Link></p>
        </div>
      </div>
    </Page>
  );
}
