import { Page } from '@/components/Page';
import { ButtonLink, Container, Eyebrow } from '@/components/ui';
import { HowItWorks, Mission } from '@/features/home/Sections';
import { REVENUE_POLICIES } from '@shared/revenue-policy';

export default function HowItWorksPage() {
  const p = REVENUE_POLICIES[REVENUE_POLICIES.length - 1]!;
  return (
    <Page title="How it works">
      <Container className="pt-12 sm:pt-16">
        <Eyebrow>How it works</Eyebrow>
        <h1 className="mt-3 font-display text-giant font-extrabold uppercase">From idea to impact.</h1>
        <p className="mt-5 max-w-xl text-lg text-ink-muted">No stock to buy, no shop to build. You bring the design and the cause. We handle printing, payments and shipping.</p>
      </Container>
      <HowItWorks compact />
      <Mission />
      <Container className="grid gap-10 py-20 md:grid-cols-2">
        <div>
          <h2 className="font-display text-3xl font-extrabold tracking-tight">The small print, made plain.</h2>
        </div>
        <ul className="space-y-5 text-ink-muted">
          <li><strong className="text-ink">Earnings are pending for {p.holdDays} days</strong> after an order, so refunds can be handled fairly before money moves.</li>
          <li><strong className="text-ink">Refunds reverse the related earnings</strong> as an explicit adjustment. Nothing is quietly rewritten.</li>
          <li><strong className="text-ink">Campaign contributions are paid to the named beneficiary</strong> by the creator or organisation running the campaign, and campaigns are reviewed before going live.</li>
          <li><strong className="text-ink">You don&rsquo;t need to belong to a church</strong> to create. You do need to own your artwork and follow our content policy.</li>
        </ul>
      </Container>
      <Container className="pb-24">
        <ButtonLink to="/creator/onboarding">Start creating</ButtonLink>
      </Container>
    </Page>
  );
}
