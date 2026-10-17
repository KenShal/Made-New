import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { z } from 'zod';
import type { Artwork, ArtworkStyle, DesignSubmission, Product, ValidationResult } from '@shared/types';
import { Garment } from '@/components/Garment';
import { Button, Checkbox, SelectField, TextArea, TextField } from '@/components/ui';
import { platform, ARTWORK_RULES, type DraftInput } from '@/data/platform';
import { COLOURS } from '@/data/sample';
import { useToast } from '@/state/toast';
import { formatMoney, money } from '@shared/money';
import { duration, ease } from '@/lib/motion';
import { cn } from '@/lib/cn';

const STEPS = ['Artwork', 'Product details', 'Campaign', 'Review'] as const;
const STYLES: { id: ArtworkStyle; label: string }[] = [
  { id: 'stack', label: 'Stacked' },
  { id: 'block', label: 'Block grid' },
  { id: 'script', label: 'Editorial serif' },
  { id: 'arc', label: 'Varsity arc' },
  { id: 'verse', label: 'Verse' },
  { id: 'mark', label: 'Emblem' },
];
const CATS: Product['category'][] = ['tee', 'heavyweight', 'longsleeve', 'crewneck'];
const PRICE_MIN = 2400;
const PRICE_MAX = 6500;

const detailsSchema = z.object({
  title: z.string().trim().min(2, 'Give your design a title').max(60),
  description: z.string().trim().min(10, 'Describe your design in a sentence or two').max(600),
  colourIds: z.array(z.string()).min(1, 'Choose at least one colour'),
  productTypes: z.array(z.string()).min(1, 'Choose at least one product'),
  suggestedPrice: z.number().int().min(PRICE_MIN, `Minimum price is ${formatMoney(money(PRICE_MIN, 'GBP'))}`).max(PRICE_MAX, `Maximum price is ${formatMoney(money(PRICE_MAX, 'GBP'))}`),
  scripture: z.string().trim().max(60).optional(),
});

const campaignSchema = z.object({
  name: z.string().trim().min(3, 'Name your campaign').max(80),
  goal: z.number().int().min(10_000, 'Goals start at £100').max(10_000_000, 'Goals above £100,000 need a conversation with us first'),
  beneficiary: z.string().trim().min(2, 'Who receives the funds?').max(120),
  intendedUse: z.string().trim().min(10, 'How will the money be used?').max(600),
  description: z.string().trim().min(10, 'Describe the campaign').max(1000),
  endsAt: z.string().optional(),
});

function emptyDraft(): DraftInput {
  return { title: '', description: '', category: 'tee', colourIds: ['bone'], productTypes: ['tee'], suggestedPrice: money(3000, 'GBP'), scripture: '', artwork: { style: 'stack', lines: ['MADE', 'NEW'], accent: '5:17' }, campaign: undefined, ownershipConfirmed: false, policyAccepted: false };
}

export function DesignEditor({ existing }: { existing?: DesignSubmission }) {
  const navigate = useNavigate();
  const { notify } = useToast();
  const [id, setId] = useState<string | null>(existing?.id ?? null);
  const [d, setD] = useState<DraftInput>(() => (existing ? { ...existing } : emptyDraft()));
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [validation, setValidation] = useState<ValidationResult[]>(existing?.validation ?? []);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState<'draft' | 'submit' | null>(null);
  const [withCampaign, setWithCampaign] = useState(Boolean(existing?.campaign));
  const [view, setView] = useState<'front' | 'back'>('front');
  const fileRef = useRef<HTMLInputElement>(null);
  const colour = COLOURS[d.colourIds[0] ?? 'bone'] ?? COLOURS.bone!;
  const art = view === 'back' ? d.backArtwork : d.artwork;

  const setArt = (patch: Partial<Artwork>) => {
    if (view === 'back') setD({ ...d, backArtwork: { ...(d.backArtwork ?? { style: 'verse', lines: [''] }), ...patch } });
    else setD({ ...d, artwork: { ...d.artwork, ...patch } });
  };

  const validateStep = (s: number): boolean => {
    const errs: Record<string, string> = {};
    if (s === 0) {
      if (!d.artwork.imageUrl && d.artwork.lines.every((l) => !l.trim())) errs.artwork = 'Add some lettering or upload artwork';
      if (d.artwork.imageUrl && validation.some((v) => !v.passed)) errs.artwork = 'Your artwork has failed checks. Upload a new file to continue.';
    }
    if (s === 1) {
      const r = detailsSchema.safeParse({ ...d, suggestedPrice: d.suggestedPrice.amount, scripture: d.scripture || undefined });
      if (!r.success) r.error.issues.forEach((i) => (errs[String(i.path[0])] ??= i.message));
    }
    if (s === 2 && withCampaign) {
      const c = d.campaign;
      const r = campaignSchema.safeParse({ ...c, goal: c?.goal.amount ?? 0, endsAt: c?.endsAt || undefined });
      if (!r.success) r.error.issues.forEach((i) => (errs[`c.${String(i.path[0])}`] ??= i.message));
      if (c?.endsAt && new Date(c.endsAt) <= new Date()) errs['c.endsAt'] = 'End date must be in the future';
    }
    if (s === 3) {
      if (!d.ownershipConfirmed) errs.ownership = 'Please confirm you own or have licensed this artwork';
      if (!d.policyAccepted) errs.policy = 'Please accept the content policy';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const goTo = (s: number) => {
    if (s > step && !validateStep(step)) return;
    setDir(s > step ? 1 : -1);
    setStep(s);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const r = await platform.uploadArtwork(file);
      setValidation(r.validation);
      setArt({ imageUrl: r.previewUrl });
    } catch (e) {
      notify({ title: 'Upload failed', body: e instanceof Error ? e.message : undefined, tone: 'error' });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // Send only the editable fields; status, ownership of the record and history are server-controlled.
  const payload = (): DraftInput => ({
    title: d.title,
    description: d.description,
    category: d.category,
    colourIds: d.colourIds,
    productTypes: d.productTypes,
    suggestedPrice: d.suggestedPrice,
    scripture: d.scripture?.trim() || undefined,
    artwork: d.artwork,
    backArtwork: d.backArtwork,
    campaign: withCampaign ? d.campaign : undefined,
    ownershipConfirmed: d.ownershipConfirmed,
    policyAccepted: d.policyAccepted,
  });

  const save = async (submit: boolean) => {
    if (submit && ![0, 1, 2, 3].every((s) => validateStep(s))) {
      notify({ title: 'A few things need attention', tone: 'error' });
      return;
    }
    setSaving(submit ? 'submit' : 'draft');
    try {
      const saved = await platform.saveDraft(id, payload());
      setId(saved.id);
      if (submit) {
        await platform.submit(saved.id);
        notify({ title: 'Submitted for review', body: 'The reviewer’s decision and any feedback will appear on this design.' });
        navigate(`/creator/designs/${saved.id}`);
      } else {
        notify({ title: 'Draft saved', body: 'Only you can see drafts.' });
      }
    } catch (e) {
      notify({ title: submit ? 'Could not submit' : 'Could not save', body: e instanceof Error ? e.message : undefined, tone: 'error' });
    } finally {
      setSaving(null);
    }
  };

  const toggleIn = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
      <div className="bg-white">
        <ol className="grid grid-cols-4 border-b border-line" aria-label="Submission steps">
          {STEPS.map((s, i) => (
            <li key={s}>
              <button type="button" onClick={() => goTo(i)} aria-current={i === step ? 'step' : undefined} className={cn('relative flex h-14 w-full flex-col items-start justify-center px-3 text-left text-xs font-semibold sm:px-5 sm:text-sm', i === step ? 'text-ink' : 'text-ink-muted hover:text-ink')}>
                <span className="text-[0.65rem] tabular-nums text-ink-muted">0{i + 1}</span>
                <span className="hidden sm:inline">{s}</span>
                {i === step && <motion.span layoutId="step-indicator" className="absolute inset-x-0 bottom-0 h-[2px] bg-crimson" />}
              </button>
            </li>
          ))}
        </ol>

        <div className="relative overflow-hidden p-6 sm:p-10">
          <AnimatePresence mode="wait" custom={dir} initial={false}>
            <motion.div key={step} custom={dir} initial={{ opacity: 0, x: dir * 24 }} animate={{ opacity: 1, x: 0, transition: { duration: duration.base, ease: ease.editorial } }} exit={{ opacity: 0, x: dir * -16, transition: { duration: duration.quick } }} className="flex flex-col gap-6">
              {step === 0 && (
                <>
                  <h2 className="font-display text-2xl font-extrabold">Artwork</h2>
                  <div className="flex gap-2" role="group" aria-label="Print side">
                    {(['front', 'back'] as const).map((v) => (
                      <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={cn('h-10 border px-4 text-xs font-bold uppercase tracking-[0.12em]', view === v ? 'border-ink bg-ink text-white' : 'border-line')}>
                        {v} print
                      </button>
                    ))}
                    {view === 'back' && d.backArtwork && (
                      <button type="button" className="ml-auto text-xs underline" onClick={() => setD({ ...d, backArtwork: undefined })}>Remove back print</button>
                    )}
                  </div>
                  <div className="border border-dashed border-line p-6">
                    <p className="font-semibold">Upload print-ready artwork</p>
                    <p className="mt-1 text-sm text-ink-muted">PNG with a transparent background works best. At least {ARTWORK_RULES.minWidth} × {ARTWORK_RULES.minHeight} px (12 × 16 in at 300 DPI), up to 25 MB. Files are private until approved.</p>
                    <input ref={fileRef} type="file" accept={ARTWORK_RULES.types.join(',')} className="sr-only" id="art-file" onChange={(e) => void onFile(e.target.files?.[0])} />
                    <label htmlFor="art-file" className="mt-4 inline-flex h-11 cursor-pointer items-center border border-ink px-5 text-xs font-bold uppercase tracking-[0.12em] hover:bg-ink hover:text-white">
                      {uploading ? 'Checking…' : art?.imageUrl ? 'Replace file' : 'Choose file'}
                    </label>
                    {art?.imageUrl && (
                      <button type="button" className="ml-4 text-xs underline" onClick={() => { setArt({ imageUrl: undefined }); setValidation([]); }}>
                        Use lettering instead
                      </button>
                    )}
                    {validation.length > 0 && (
                      <ul className="mt-4 space-y-1 text-sm" aria-label="Artwork checks">
                        {validation.map((v) => (
                          <li key={v.check} className={v.passed ? 'text-ink' : 'font-medium text-crimson'}>
                            {v.passed ? '✓' : '✕'} {v.check}: <span className="text-ink-muted">{v.detail}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {!art?.imageUrl && (
                    <>
                      <p className="text-sm font-semibold">Or set type in the studio</p>
                      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Lettering style">
                        {STYLES.map((s) => (
                          <button key={s.id} type="button" role="radio" aria-checked={(art?.style ?? 'stack') === s.id} onClick={() => setArt({ style: s.id })} className={cn('h-10 border px-3 text-xs font-semibold', (art?.style ?? '') === s.id ? 'border-ink bg-ink text-white' : 'border-line hover:border-ink')}>
                            {s.label}
                          </button>
                        ))}
                      </div>
                      <TextArea label="Lettering (one line per row)" maxLength={160} value={(art?.lines ?? []).join('\n')} onChange={(e) => setArt({ lines: e.target.value.split('\n').slice(0, 6).map((l) => l.slice(0, 28)) })} error={errors.artwork} />
                      <TextField label="Accent text" optional maxLength={20} placeholder="e.g. 2 COR 5:17" value={art?.accent ?? ''} onChange={(e) => setArt({ accent: e.target.value })} />
                    </>
                  )}
                  {art?.imageUrl && errors.artwork && <p role="alert" className="text-sm text-crimson">{errors.artwork}</p>}
                </>
              )}

              {step === 1 && (
                <>
                  <h2 className="font-display text-2xl font-extrabold">Product details</h2>
                  <TextField label="Design title" maxLength={60} value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} error={errors.title} />
                  <TextArea label="Description" maxLength={600} value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} error={errors.description} />
                  <SelectField label="Category" value={d.category} onChange={(e) => setD({ ...d, category: e.target.value as Product['category'] })}>
                    {CATS.map((c) => <option key={c} value={c}>{c[0]!.toUpperCase() + c.slice(1)}</option>)}
                  </SelectField>
                  <fieldset>
                    <legend className="mb-2 text-sm font-semibold">Garment colours</legend>
                    <div className="flex flex-wrap gap-2">
                      {Object.values(COLOURS).map((c) => (
                        <button key={c.id} type="button" aria-pressed={d.colourIds.includes(c.id)} onClick={() => setD({ ...d, colourIds: toggleIn(d.colourIds, c.id) })} className={cn('flex h-10 items-center gap-2 border px-3 text-xs font-semibold', d.colourIds.includes(c.id) ? 'border-ink' : 'border-line')}>
                          <span className="h-4 w-4 rounded-full border border-black/15" style={{ backgroundColor: c.hex }} aria-hidden />
                          {c.name}
                        </button>
                      ))}
                    </div>
                    {errors.colourIds && <p role="alert" className="mt-1 text-xs text-crimson">{errors.colourIds}</p>}
                  </fieldset>
                  <fieldset>
                    <legend className="mb-2 text-sm font-semibold">Products to offer</legend>
                    <div className="flex flex-wrap gap-2">
                      {CATS.map((c) => (
                        <button key={c} type="button" aria-pressed={d.productTypes.includes(c)} onClick={() => setD({ ...d, productTypes: toggleIn(d.productTypes, c) as Product['category'][] })} className={cn('h-10 border px-3 text-xs font-semibold capitalize', d.productTypes.includes(c) ? 'border-ink bg-ink text-white' : 'border-line')}>
                          {c}
                        </button>
                      ))}
                    </div>
                    {errors.productTypes && <p role="alert" className="mt-1 text-xs text-crimson">{errors.productTypes}</p>}
                  </fieldset>
                  <TextField label="Suggested price (GBP)" type="number" inputMode="decimal" min={PRICE_MIN / 100} max={PRICE_MAX / 100} step="0.5" hint={`Between ${formatMoney(money(PRICE_MIN, 'GBP'))} and ${formatMoney(money(PRICE_MAX, 'GBP'))}. Final price is confirmed at approval.`} value={(d.suggestedPrice.amount / 100).toString()} onChange={(e) => setD({ ...d, suggestedPrice: money(Math.round(Number(e.target.value || 0) * 100), 'GBP') })} error={errors.suggestedPrice} />
                  <TextField label="Scripture reference" optional maxLength={60} placeholder="e.g. 2 Corinthians 5:17" value={d.scripture ?? ''} onChange={(e) => setD({ ...d, scripture: e.target.value })} />
                </>
              )}

              {step === 2 && (
                <>
                  <h2 className="font-display text-2xl font-extrabold">Campaign</h2>
                  <Checkbox label="Link this design to a fundraising campaign" checked={withCampaign} onChange={(e) => { setWithCampaign(e.target.checked); if (e.target.checked && !d.campaign) setD({ ...d, campaign: { name: '', goal: money(100_000, 'GBP'), beneficiary: '', intendedUse: '', description: '' } }); }} />
                  {withCampaign && d.campaign && (
                    <>
                      <TextField label="Campaign name" value={d.campaign.name} onChange={(e) => setD({ ...d, campaign: { ...d.campaign!, name: e.target.value } })} error={errors['c.name']} />
                      <TextField label="Fundraising goal (GBP)" type="number" inputMode="numeric" min={100} value={(d.campaign.goal.amount / 100).toString()} onChange={(e) => setD({ ...d, campaign: { ...d.campaign!, goal: money(Math.round(Number(e.target.value || 0) * 100), 'GBP') } })} error={errors['c.goal']} />
                      <TextField label="Beneficiary" hint="The person, project or organisation receiving the funds" value={d.campaign.beneficiary} onChange={(e) => setD({ ...d, campaign: { ...d.campaign!, beneficiary: e.target.value } })} error={errors['c.beneficiary']} />
                      <TextArea label="Intended use of funds" value={d.campaign.intendedUse} onChange={(e) => setD({ ...d, campaign: { ...d.campaign!, intendedUse: e.target.value } })} error={errors['c.intendedUse']} />
                      <TextArea label="Campaign description" value={d.campaign.description} onChange={(e) => setD({ ...d, campaign: { ...d.campaign!, description: e.target.value } })} error={errors['c.description']} />
                      <TextField label="End date" optional type="date" value={d.campaign.endsAt ?? ''} onChange={(e) => setD({ ...d, campaign: { ...d.campaign!, endsAt: e.target.value } })} error={errors['c.endsAt']} />
                    </>
                  )}
                  {!withCampaign && <p className="text-sm text-ink-muted">You can sell without a campaign. Your share of the margin still goes to you.</p>}
                </>
              )}

              {step === 3 && (
                <>
                  <h2 className="font-display text-2xl font-extrabold">Review</h2>
                  <dl className="divide-y divide-line border-y border-line text-sm">
                    {[
                      ['Title', d.title || '—'],
                      ['Description', d.description || '—'],
                      ['Category', d.category],
                      ['Colours', d.colourIds.map((c) => COLOURS[c]?.name).join(', ')],
                      ['Products', d.productTypes.join(', ')],
                      ['Suggested price', formatMoney(d.suggestedPrice)],
                      ['Scripture', d.scripture || '—'],
                      ['Back print', d.backArtwork ? 'Yes' : 'No'],
                      ['Campaign', withCampaign && d.campaign ? `${d.campaign.name} · goal ${formatMoney(d.campaign.goal)} · for ${d.campaign.beneficiary}` : 'None'],
                    ].map(([k, v]) => (
                      <div key={k} className="grid grid-cols-[9rem_1fr] gap-3 py-3"><dt className="font-semibold">{k}</dt><dd className="text-ink-muted">{v}</dd></div>
                    ))}
                  </dl>
                  <Checkbox label="I confirm I created this artwork, or have a licence to use every part of it, including lettering and images." checked={d.ownershipConfirmed} onChange={(e) => setD({ ...d, ownershipConfirmed: e.target.checked })} error={errors.ownership} />
                  <Checkbox label="This design follows the MADE NEW content policy." checked={d.policyAccepted} onChange={(e) => setD({ ...d, policyAccepted: e.target.checked })} error={errors.policy} />
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line p-4 sm:px-10">
          <Button variant="ghost" onClick={() => goTo(step - 1)} disabled={step === 0}>Back</Button>
          <div className="flex gap-3">
            <Button variant="secondary" busy={saving === 'draft'} onClick={() => void save(false)}>Save draft</Button>
            {step < 3 ? <Button onClick={() => goTo(step + 1)}>Continue</Button> : <Button busy={saving === 'submit'} onClick={() => void save(true)}>Submit for review</Button>}
          </div>
        </div>
      </div>

      <aside className="xl:sticky xl:top-24 xl:self-start">
        <div className="bg-white p-4">
          <p className="mb-2 text-[0.7rem] font-bold uppercase tracking-[0.12em] text-ink-muted">Live mockup preview</p>
          <div className="relative aspect-[4/5] bg-soft">
            <Garment colour={colour} artwork={art ?? { style: 'verse', lines: [] }} view={view} category={d.category} title={`Preview of ${d.title || 'your design'}`} className="h-full w-full p-4" />
            {/* Print-area guide */}
            <span className="pointer-events-none absolute left-[32%] top-[24%] h-[42%] w-[36%] border border-dashed border-crimson/50" aria-hidden />
          </div>
          <p className="mt-2 text-xs text-ink-muted">Dashed box marks the 12 × 16 in print area. Mockups are approximate.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {d.colourIds.map((c) => (
              <span key={c} className="h-5 w-5 rounded-full border border-black/15" style={{ backgroundColor: COLOURS[c]?.hex }} title={COLOURS[c]?.name} />
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
