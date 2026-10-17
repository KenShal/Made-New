import { useParams } from 'react-router-dom';
import { Page } from '@/components/Page';
import { Container, Eyebrow } from '@/components/ui';

const DOCS: Record<string, { title: string; body: string[] }> = {
  privacy: {
    title: 'Privacy',
    body: [
      'We collect only what we need to run the store and the creator platform: your name, email and account details; for creators, payout details held by our payout provider; and order details processed by Shopify.',
      'We never sell personal data. Creators never see customer names, emails or addresses. Card details are handled by Shopify and never reach MADE NEW.',
      'Marketing emails are opt-in only and you can unsubscribe at any time. We do not ask about your faith or church membership.',
      'You can request a copy of your data or ask us to delete your account from your settings page, or by contacting privacy@madenew.example.',
    ],
  },
  terms: { title: 'Terms of use', body: ['These are placeholder terms for development. Replace them with terms reviewed by a qualified solicitor before launch.'] },
  'creator-terms': {
    title: 'Creator terms',
    body: [
      'You confirm you own or have licensed every element of your artwork, including lettering, illustration and photography.',
      'Designs are reviewed before publication. We may request changes or decline designs that breach the content policy or cannot be printed well.',
      'Earnings follow the published, versioned revenue policy and are calculated from verified orders. Refunds reverse the related earnings.',
      'Placeholder text for development. Have these terms reviewed before launch.',
    ],
  },
  'content-policy': {
    title: 'Content policy',
    body: ['No hateful, harassing, sexual or violent content. No trademarks or copyrighted work you do not own. Scripture quotations must credit the translation where its licence requires it.', 'Placeholder text for development.'],
  },
  shipping: { title: 'Shipping & returns', body: ['Every item is printed to order and usually dispatched in 3 to 5 working days.', 'Returns are accepted within 30 days for misprints, damage or sizing issues. Placeholder text for development.'] },
};

export default function Legal() {
  const { doc = '' } = useParams();
  const d = DOCS[doc] ?? { title: 'Not found', body: ['This page does not exist.'] };
  return (
    <Page title={d.title}>
      <Container className="max-w-3xl py-20">
        <Eyebrow>MADE NEW</Eyebrow>
        <h1 className="mt-3 font-display text-5xl font-extrabold tracking-tight">{d.title}</h1>
        <div className="mt-8 space-y-5 text-lg leading-relaxed text-ink-muted">{d.body.map((p) => <p key={p}>{p}</p>)}</div>
      </Container>
    </Page>
  );
}
