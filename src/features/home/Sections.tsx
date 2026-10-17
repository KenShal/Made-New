import { useRef } from 'react';
import { motion, useScroll, useTransform, type MotionValue } from 'framer-motion';
import { Link } from 'react-router-dom';
import type { Campaign, Creator, Product } from '@shared/types';
import { formatMoney, money } from '@shared/money';
import { policyFor, splitMargin } from '@shared/revenue-policy';
import { ProductCard } from '@/components/ProductCard';
import { Garment } from '@/components/Garment';
import { Arrow, ButtonLink, Container, Eyebrow, Progress, SampleBadge } from '@/components/ui';
import { ease, imageReveal, revealChild, revealParent } from '@/lib/motion';
import { COLOURS } from '@/data/sample';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

const inView = { initial: 'hidden', whileInView: 'shown', viewport: { once: true, margin: '0px 0px -12% 0px' } } as const;

export function FeaturedCollection({ products, creators, campaigns }: { products: Product[]; creators: Creator[]; campaigns: Campaign[] }) {
  return (
    <section className="relative bg-white py-24 sm:py-32" aria-labelledby="featured-title">
      <Container>
        <motion.div {...inView} variants={revealParent} className="mb-14 flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <motion.div variants={revealChild}>
            <Eyebrow>The collection</Eyebrow>
            <h2 id="featured-title" className="mt-4 font-display text-giant font-extrabold uppercase">
              Good design.
              <br />
              <span className="text-crimson">Greater purpose.</span>
            </h2>
          </motion.div>
          <motion.div variants={revealChild}>
            <ButtonLink to="/shop" variant="ghost">
              View all <Arrow />
            </ButtonLink>
          </motion.div>
        </motion.div>
        <motion.div {...inView} variants={revealParent} className="grid grid-cols-2 gap-x-4 gap-y-12 sm:gap-x-6 lg:grid-cols-4">
          {products.slice(0, 8).map((p, i) => (
            <ProductCard key={p.id} product={p} creator={creators.find((c) => c.id === p.creatorId)} campaign={campaigns.find((c) => c.id === p.campaignId)} priority={i < 4} />
          ))}
        </motion.div>
      </Container>
    </section>
  );
}

export function Mission() {
  const p = policyFor(new Date().toISOString());
  const example = splitMargin(p, { netRevenue: 3167, shippingCharged: 0, productionCost: 1290, shippingCostAllocated: 0, currency: 'GBP' });
  const fmt = (n: number) => formatMoney(money(n, 'GBP'));
  return (
    <section className="bg-soft py-24 sm:py-36" aria-labelledby="mission-title">
      <Container className="grid items-center gap-14 lg:grid-cols-2 lg:gap-24">
        <motion.div {...inView} variants={imageReveal} className="relative aspect-[4/5] overflow-hidden bg-white">
          <Garment colour={COLOURS.black!} artwork={{ style: 'verse', lines: ['IF ANYONE IS IN CHRIST,', 'THE NEW CREATION HAS COME:', 'THE OLD HAS GONE,', 'THE NEW IS HERE!'], accent: '2 COR 5:17' }} category="heavyweight" view="back" crop="detail" title="Close-up of a verse printed across the back of a washed black heavyweight tee" className="absolute inset-0 h-full w-full" />
          <p className="absolute bottom-4 left-4 bg-white px-3 py-1.5 text-[0.65rem] font-bold uppercase tracking-[0.16em]">Back print · 2 Corinthians 5:17</p>
        </motion.div>
        <motion.div {...inView} variants={revealParent}>
          <motion.div variants={revealChild}>
            <Eyebrow>The mission</Eyebrow>
          </motion.div>
          <motion.h2 variants={revealChild} id="mission-title" className="mt-4 font-display text-giant font-extrabold uppercase">
            More than
            <br />
            what you wear.
          </motion.h2>
          <motion.p variants={revealChild} className="mt-8 max-w-lg text-lg leading-relaxed text-ink-muted">
            Every creator can attach their design to a clearly named campaign: a mission trip, a well, a food bank, a youth space. You can see who it funds before you buy.
          </motion.p>
          <motion.div variants={revealChild} id="proceeds" className="mt-10 border-t border-ink pt-6">
            <h3 className="font-display text-sm font-bold uppercase tracking-[0.14em]">How proceeds work</h3>
            <p className="mt-3 max-w-lg text-sm leading-relaxed text-ink-muted">
              Not the whole price is donated. First we pay for the garment, printing, payment fees and tax. What remains is the margin, which is split{' '}
              <strong className="text-ink">{p.creatorShareBps / 100}% to the creator</strong>, <strong className="text-ink">{p.campaignShareBps / 100}% to their campaign</strong> and {p.platformShareBps / 100}% to keep MADE NEW running.
            </p>
            <dl className="mt-6 grid max-w-lg grid-cols-3 gap-px bg-line text-center">
              {[
                ['Creator', example.creator],
                ['Campaign', example.campaign],
                ['Platform', example.platform],
              ].map(([k, v]) => (
                <div key={k as string} className="bg-white px-3 py-4">
                  <dt className="text-[0.65rem] font-bold uppercase tracking-[0.14em] text-ink-muted">{k}</dt>
                  <dd className="mt-1 font-display text-xl font-extrabold tabular-nums">{fmt(v as number)}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-ink-muted">Worked example for a £38 tee (ex. VAT {fmt(3167)}, garment and print {fmt(1290)}, payment fees {fmt(example.paymentFee)}). Policy {p.version}.</p>
          </motion.div>
        </motion.div>
      </Container>
    </section>
  );
}

export function CampaignCard({ campaign, creator, products }: { campaign: Campaign; creator?: Creator; products: Product[] }) {
  const raised = campaign.raisedVerified;
  return (
    <motion.article variants={revealChild} className="relative flex flex-col border border-line bg-white p-6 sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">{creator?.displayName ?? campaign.beneficiary}</p>
        {campaign.sample && <SampleBadge />}
      </div>
      <h3 className="mt-4 font-display text-2xl font-extrabold leading-tight tracking-tight">
        <Link to={`/campaigns/${campaign.slug}`} className="after:absolute after:inset-0 hover:text-crimson">
          {campaign.title}
        </Link>
      </h3>
      <p className="mt-1 text-sm text-ink-muted">For {campaign.beneficiary}</p>
      <p className="mt-4 flex-1 text-[0.95rem] leading-relaxed">{campaign.description}</p>
      <div className="mt-8">
        {raised ? (
          <>
            <div className="mb-3 flex items-baseline justify-between">
              <span className="font-display text-2xl font-extrabold tabular-nums">{formatMoney(raised)}</span>
              <span className="text-sm text-ink-muted">of {formatMoney(campaign.goal)}</span>
            </div>
            <Progress value={raised.amount} goal={campaign.goal.amount} label={`${campaign.title} progress`} />
            <p className="mt-2 text-xs text-ink-muted">{campaign.sample ? 'Illustrative total' : 'Verified from completed orders, net of refunds'}</p>
          </>
        ) : (
          <>
            <p className="text-sm text-ink-muted">Goal {formatMoney(campaign.goal)}</p>
            <p className="mt-2 text-xs text-ink-muted">Totals appear once orders are verified.</p>
          </>
        )}
      </div>
      {products.length > 0 && <p className="mt-6 border-t border-line pt-4 text-xs text-ink-muted">Eligible: {products.map((p) => p.name).join(', ')}</p>}
      <span className="relative z-10 mt-6 inline-flex items-center gap-2 font-display text-[0.78rem] font-bold uppercase tracking-[0.14em] text-crimson">
        Support this mission <Arrow />
      </span>
    </motion.article>
  );
}

export function FeaturedCampaigns({ campaigns, creators, products }: { campaigns: Campaign[]; creators: Creator[]; products: Product[] }) {
  return (
    <section className="bg-white py-24 sm:py-32" aria-labelledby="campaigns-title">
      <Container>
        <motion.div {...inView} variants={revealParent} className="mb-14 flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <motion.div variants={revealChild}>
            <Eyebrow>Live campaigns</Eyebrow>
            <h2 id="campaigns-title" className="mt-4 font-display text-giant font-extrabold uppercase">
              See what
              <br />
              you&rsquo;re funding.
            </h2>
          </motion.div>
          <motion.div variants={revealChild}>
            <ButtonLink to="/campaigns" variant="ghost">
              All campaigns <Arrow />
            </ButtonLink>
          </motion.div>
        </motion.div>
        <motion.div {...inView} variants={revealParent} className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {campaigns.slice(0, 3).map((c) => (
            <CampaignCard key={c.id} campaign={c} creator={creators.find((x) => x.id === c.creatorId)} products={products.filter((p) => p.campaignId === c.id)} />
          ))}
        </motion.div>
      </Container>
    </section>
  );
}

export function CreatorInvite() {
  return (
    <section className="relative overflow-hidden bg-crimson text-white" aria-labelledby="invite-title">
      {/* The chapter break: a white rule wipes across before the type arrives. */}
      <motion.span initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }} transition={{ duration: 1.1, ease: ease.editorial }} className="absolute left-0 top-0 h-[3px] w-full origin-left bg-white/80" aria-hidden />
      <Container className="grid gap-12 py-24 sm:py-36 lg:grid-cols-[1.4fr_1fr] lg:items-end">
        <motion.div {...inView} variants={revealParent}>
          <motion.p variants={revealChild} className="font-display text-[0.7rem] font-bold uppercase tracking-editorial text-white/90">
            For creators, youth groups and ministries
          </motion.p>
          <motion.h2 variants={revealChild} id="invite-title" className="mt-6 font-display text-giant font-extrabold uppercase">
            Your idea could fund something bigger.
          </motion.h2>
        </motion.div>
        <motion.div {...inView} variants={revealParent} className="flex flex-col items-start gap-8">
          <motion.p variants={revealChild} className="text-lg leading-relaxed text-white/85">
            Create a design. Tell your story. Build a community around it. MADE NEW helps turn your creativity into a fundraising opportunity.
          </motion.p>
          <motion.div variants={revealChild}>
            <ButtonLink to="/creator/onboarding" variant="inverse">
              Start creating <Arrow />
            </ButtonLink>
          </motion.div>
        </motion.div>
      </Container>
    </section>
  );
}

/* Steps flip in like cards being turned over. */
const flipCard = {
  hidden: { opacity: 0, rotateY: -80, z: -120 },
  shown: { opacity: 1, rotateY: 0, z: 0, transition: { duration: 0.9, ease: ease.editorial } },
};

const STEPS = [
  { n: '01', title: 'Create your design.', body: 'Upload print-ready artwork or set type in the studio. Preview it on real garments.', path: 'M10 50 L30 14 L50 50 M18 36 h24' },
  { n: '02', title: 'Get it approved.', body: 'Our team checks print quality, rights and content policy, and tells you exactly what to change.', path: 'M10 32 L24 46 L52 16' },
  { n: '03', title: 'Share it with the world.', body: 'We print to order and ship. You share your link and watch your campaign grow.', path: 'M12 46 L50 14 M30 14 h20 v20' },
];

export function HowItWorks({ compact = false }: { compact?: boolean }) {
  return (
    <section className={compact ? 'py-16' : 'bg-white py-24 sm:py-32'} aria-labelledby="how-title">
      <Container>
        {!compact && (
          <>
            <Eyebrow>How it works</Eyebrow>
            <h2 id="how-title" className="mt-4 font-display text-giant font-extrabold uppercase">
              Three steps.
            </h2>
          </>
        )}
        <motion.ol {...inView} variants={revealParent} className="mt-14 grid gap-px bg-line md:grid-cols-3" style={{ perspective: 1200 }}>
          {STEPS.map((s) => (
            <motion.li key={s.n} variants={flipCard} whileHover={{ rotateY: -6, rotateX: 4, z: 30 }} className="flex flex-col gap-6 bg-white p-8 sm:p-10">
              <svg viewBox="0 0 60 60" className="h-12 w-12" aria-hidden>
                <motion.path d={s.path} fill="none" stroke="#B5122B" strokeWidth="2.5" strokeLinecap="square" initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1, ease: ease.editorial, delay: 0.2 }} />
              </svg>
              <p className="font-display text-sm font-bold tabular-nums text-ink-muted">{s.n}</p>
              <h3 className="font-display text-2xl font-extrabold uppercase leading-tight tracking-tight">{s.title}</h3>
              <p className="text-ink-muted">{s.body}</p>
            </motion.li>
          ))}
        </motion.ol>
      </Container>
    </section>
  );
}

export function Manifesto() {
  const lines = ['We believe identity is given, not earned.', 'That creativity is an act of worship.', 'That community is built by people who show up.', 'That what we make can carry what we believe.'];
  const reduced = usePrefersReducedMotion();
  return (
    <section className="bg-soft py-24 sm:py-36" aria-labelledby="manifesto-title">
      <Container className="grid gap-12 lg:grid-cols-[1fr_2fr]">
        <div>
          <Eyebrow>Manifesto</Eyebrow>
          <h2 id="manifesto-title" className="sr-only">
            The MADE NEW manifesto
          </h2>
        </div>
        <div style={{ perspective: 1000 }}>
          {lines.map((l) => (reduced ? <p key={l} className={MANIFESTO_LINE}>{l}</p> : <ScrollLine key={l} text={l} />))}
          <motion.blockquote {...inView} variants={revealChild} className="mt-14 border-l-2 border-crimson pl-6">
            <p className="max-w-xl text-lg leading-relaxed">&ldquo;Therefore, if anyone is in Christ, the new creation has come: the old has gone, the new is here!&rdquo;</p>
            <footer className="mt-3 text-xs font-bold uppercase tracking-[0.16em] text-ink-muted">2 Corinthians 5:17 (NIV)</footer>
          </motion.blockquote>
        </div>
      </Container>
    </section>
  );
}

const MANIFESTO_LINE = 'font-serif text-[clamp(1.75rem,3.6vw,3.25rem)] leading-[1.1] tracking-tight';

/* Each line stands up out of the page as it scrolls into place. */
function ScrollLine({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 90%', 'start 50%'] });
  const opacity = useTransform(scrollYProgress, [0, 1], [0.15, 1]);
  const rotateX = useTransform(scrollYProgress, [0, 1], [55, 0]);
  const y = useTransform(scrollYProgress, [0, 1], [40, 0]);
  return (
    <motion.p ref={ref} style={{ opacity, rotateX, y, transformOrigin: '50% 100%' }} className={MANIFESTO_LINE}>
      {text}
    </motion.p>
  );
}

export function FinalCta() {
  const reduced = usePrefersReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'center center'] });
  const scale = useTransform(scrollYProgress, [0, 1], [0.82, 1]);
  const rotateX = useTransform(scrollYProgress, [0, 1], [35, 0]);
  const opacity = useTransform(scrollYProgress, [0, 0.6], [0.2, 1]);
  return (
    <section ref={ref} className="bg-white py-28 sm:py-40" aria-labelledby="final-title" style={{ perspective: 1200 }}>
      <Container className="flex flex-col items-start gap-10">
        <motion.h2 style={reduced ? undefined : { scale, rotateX, opacity, transformOrigin: '0% 100%' }} id="final-title" className="font-display text-mega font-extrabold uppercase">
          Make something
          <br />
          that <span className="text-crimson">matters.</span>
        </motion.h2>
        <div className="flex flex-col gap-3 sm:flex-row">
          <ButtonLink to="/shop">
            Shop MADE NEW <Arrow />
          </ButtonLink>
          <ButtonLink to="/creator/onboarding" variant="secondary">
            Launch a fundraiser
          </ButtonLink>
        </div>
      </Container>
    </section>
  );
}

/* Thin crimson bar along the top of the page showing scroll position. Decorative. */
export function ScrollProgress() {
  const reduced = usePrefersReducedMotion();
  const { scrollYProgress } = useScroll();
  if (reduced) return null;
  return <ProgressBar progress={scrollYProgress} />;
}

function ProgressBar({ progress }: { progress: MotionValue<number> }) {
  return <motion.div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px] origin-left bg-crimson" style={{ scaleX: progress }} />;
}
