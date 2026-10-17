/**
 * SAMPLE DATA FOR DEVELOPMENT ONLY.
 *
 * Every record here is fictional and marked `sample: true`. The UI shows a
 * "Sample data" label wherever it is rendered. When VITE_PUBLIC_SHOPIFY_* and
 * VITE_PUBLIC_SUPABASE_* are configured the live data source replaces this.
 * Fundraising totals here are illustrative and are NOT verified transactions.
 */
import type {
  AdminUser,
  Campaign,
  Collection,
  Creator,
  DesignSubmission,
  GarmentColour,
  IntegrationJob,
  LedgerEntry,
  Order,
  Product,
  SalesPoint,
  Size,
  Variant,
} from '@shared/types';
import { money } from '@shared/money';

export const COLOURS: Record<string, GarmentColour> = {
  bone: { id: 'bone', name: 'Bone', hex: '#F1EEE7', ink: '#171717' },
  white: { id: 'white', name: 'White', hex: '#FAFAF9', ink: '#171717' },
  black: { id: 'black', name: 'Washed Black', hex: '#1E1D1C', ink: '#F4F1EA' },
  crimson: { id: 'crimson', name: 'Crimson', hex: '#9E1027', ink: '#FFF6F2' },
  stone: { id: 'stone', name: 'Stone', hex: '#CFC8BC', ink: '#171717' },
  navy: { id: 'navy', name: 'Midnight', hex: '#1C2433', ink: '#F4F1EA' },
};

const SIZES: Size[] = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

function variants(productId: string, colourIds: string[], price: number, soldOut: string[] = []): Variant[] {
  return colourIds.flatMap((c) =>
    SIZES.map((s) => ({
      id: `${productId}-${c}-${s}`,
      size: s,
      colourId: c,
      available: !soldOut.includes(`${c}-${s}`),
      price: money(price + (s === 'XXL' ? 200 : 0), 'GBP'),
    })),
  );
}

export const CREATORS: Creator[] = [
  { id: 'cr-ada', handle: 'ada.makes', displayName: 'Ada Okafor', kind: 'individual', location: 'London', bio: 'Illustrator and youth worker. Draws type by hand, then refines it until it feels quiet and certain.', avatarHue: 352 },
  { id: 'cr-stmarks', handle: 'stmarks-youth', displayName: "St Mark's Youth", kind: 'organisation', location: 'Manchester', bio: 'A youth group of thirty-odd teenagers designing their way to a summer mission trip.', avatarHue: 24 },
  { id: 'cr-jonah', handle: 'jonah.studio', displayName: 'Jonah Reyes', kind: 'individual', location: 'Bristol', bio: 'Graphic designer. Swiss grids, Psalms and too much coffee.', avatarHue: 210 },
  { id: 'cr-harbour', handle: 'harbour-collective', displayName: 'Harbour Collective', kind: 'organisation', location: 'Glasgow', bio: 'A creative ministry supporting young people leaving care.', avatarHue: 160 },
];

export const CAMPAIGNS: Campaign[] = [
  { id: 'cp-water', slug: 'clean-water-kisumu', title: 'Clean Water, Kisumu', beneficiary: 'Kisumu Community Wells (sample)', creatorId: 'cr-ada', description: 'Funding a borehole and hand pump for a primary school serving 400 children.', intendedUse: 'Drilling, pump installation and two years of maintenance training.', goal: money(800_000, 'GBP'), raisedVerified: money(512_400, 'GBP'), endsAt: '2027-03-01', status: 'live', sample: true },
  { id: 'cp-mission', slug: 'summer-mission-2027', title: 'Summer Mission 2027', beneficiary: "St Mark's Youth", creatorId: 'cr-stmarks', description: 'Sending 24 young people to serve alongside a partner church for two weeks.', intendedUse: 'Travel, accommodation and materials for a holiday club.', goal: money(1_200_000, 'GBP'), raisedVerified: money(341_000, 'GBP'), endsAt: '2027-06-15', status: 'live', sample: true },
  { id: 'cp-harbour', slug: 'harbour-house', title: 'Harbour House', beneficiary: 'Harbour Collective', creatorId: 'cr-harbour', description: 'A drop-in studio space for care leavers to make, learn and belong.', intendedUse: 'First-year rent and equipment for a print studio.', goal: money(2_000_000, 'GBP'), raisedVerified: money(1_486_000, 'GBP'), status: 'live', sample: true },
  { id: 'cp-food', slug: 'bristol-food-bank', title: 'Bristol Food Bank Winter Drive', beneficiary: 'Bristol Community Pantry (sample)', creatorId: 'cr-jonah', description: 'Stocking shelves through the coldest months.', intendedUse: 'Bulk food purchase and delivery van fuel.', goal: money(500_000, 'GBP'), raisedVerified: null, endsAt: '2027-02-01', status: 'live', sample: true },
];

export const COLLECTIONS: Collection[] = [
  { slug: 'new-creation', title: 'New Creation', description: 'Pieces built around 2 Corinthians 5:17. The old has gone.' },
  { slug: 'heavyweight', title: 'Heavyweight', description: '280gsm cotton with a boxy cut and dropped shoulders.' },
  { slug: 'mission-made', title: 'Mission Made', description: 'Every piece here is attached to a live campaign.' },
];

const P = (p: Omit<Product, 'sample' | 'shippingNote'>): Product => ({
  ...p,
  sample: true,
  shippingNote: 'Printed to order. Usually dispatched in 3 to 5 working days. UK delivery from £3.95.',
});

export const PRODUCTS: Product[] = [
  P({ id: 'pr-made-new', slug: 'made-new-heavyweight', name: 'Made New Heavyweight', description: 'Boxy 280gsm tee with a stacked wordmark on the chest and the full verse across the back.', category: 'heavyweight', price: money(3800, 'GBP'), colours: [COLOURS.bone!, COLOURS.black!, COLOURS.crimson!], variants: variants('pr-made-new', ['bone', 'black', 'crimson'], 3800, ['crimson-XS']), artwork: { style: 'stack', lines: ['MADE', 'NEW'], accent: '5:17' }, backArtwork: { style: 'verse', lines: ['IF ANYONE IS IN CHRIST,', 'THE NEW CREATION HAS COME:', 'THE OLD HAS GONE,', 'THE NEW IS HERE!'], accent: '2 COR 5:17' }, creatorId: 'cr-ada', campaignId: 'cp-water', collectionSlugs: ['new-creation', 'heavyweight', 'mission-made'], scripture: '2 Corinthians 5:17', story: 'Ada drew the letterforms on the bus home from youth group. The tight stack is meant to feel like a door closing behind you.', createdAt: '2026-10-02', unitsSold: 412 }),
  P({ id: 'pr-old-gone', slug: 'the-old-has-gone', name: 'The Old Has Gone', description: 'Editorial serif statement printed small and low on a soft midweight tee.', category: 'tee', price: money(3200, 'GBP'), colours: [COLOURS.white!, COLOURS.stone!, COLOURS.navy!], variants: variants('pr-old-gone', ['white', 'stone', 'navy'], 3200), artwork: { style: 'script', lines: ['the old', 'has gone.'], accent: 'II COR V' }, creatorId: 'cr-jonah', campaignId: 'cp-food', collectionSlugs: ['new-creation', 'mission-made'], scripture: '2 Corinthians 5:17', story: 'A whisper rather than a shout. Jonah wanted something you could wear to a gallery or a prayer meeting.', createdAt: '2026-09-21', unitsSold: 268 }),
  P({ id: 'pr-sent', slug: 'sent-ones', name: 'Sent Ones', description: 'Arched varsity lettering. The youth group voted on every letter.', category: 'tee', price: money(3000, 'GBP'), colours: [COLOURS.crimson!, COLOURS.bone!, COLOURS.black!], variants: variants('pr-sent', ['crimson', 'bone', 'black'], 3000, ['bone-XXL', 'black-XS']), artwork: { style: 'arc', lines: ['SENT', 'ONES'], accent: 'ISAIAH 6:8' }, creatorId: 'cr-stmarks', campaignId: 'cp-mission', collectionSlugs: ['mission-made'], scripture: 'Isaiah 6:8', story: "Designed over six Friday nights. Every sale moves St Mark's closer to their summer mission.", createdAt: '2026-10-09', unitsSold: 191 }),
  P({ id: 'pr-harbour', slug: 'harbour-crewneck', name: 'Harbour Crewneck', description: 'Heavy loopback crewneck with an anchor mark and coordinates of Harbour House.', category: 'crewneck', price: money(5400, 'GBP'), colours: [COLOURS.stone!, COLOURS.navy!], variants: variants('pr-harbour', ['stone', 'navy'], 5400), artwork: { style: 'mark', lines: ['HARBOUR'], accent: '55.86°N' }, creatorId: 'cr-harbour', campaignId: 'cp-harbour', collectionSlugs: ['heavyweight', 'mission-made'], scripture: 'Hebrews 6:19', story: 'An anchor for the soul. The mark was cut from linocut prints made by young people at the drop-in.', createdAt: '2026-08-30', unitsSold: 334 }),
  P({ id: 'pr-new-here', slug: 'the-new-is-here', name: 'The New Is Here', description: 'Block lettering in a tight grid, crimson stop on the final line.', category: 'heavyweight', price: money(3800, 'GBP'), colours: [COLOURS.black!, COLOURS.white!], variants: variants('pr-new-here', ['black', 'white'], 3800), artwork: { style: 'block', lines: ['THE', 'NEW', 'IS', 'HERE'], accent: '.' }, creatorId: 'cr-jonah', campaignId: 'cp-food', collectionSlugs: ['new-creation', 'heavyweight'], scripture: '2 Corinthians 5:17', story: 'Four words, a grid and one full stop. That is the whole idea.', createdAt: '2026-10-12', unitsSold: 87 }),
  P({ id: 'pr-living-water', slug: 'living-water', name: 'Living Water', description: 'Long sleeve with a flowing serif statement and sleeve print.', category: 'longsleeve', price: money(4200, 'GBP'), colours: [COLOURS.white!, COLOURS.bone!], variants: variants('pr-living-water', ['white', 'bone'], 4200, ['white-M']), artwork: { style: 'script', lines: ['living', 'water'], accent: 'JOHN 4:14' }, creatorId: 'cr-ada', campaignId: 'cp-water', collectionSlugs: ['mission-made'], scripture: 'John 4:14', story: 'For the Kisumu wells. Ada pencilled the curves to feel like water finding its way downhill.', createdAt: '2026-09-05', unitsSold: 156 }),
  P({ id: 'pr-beloved', slug: 'beloved', name: 'Beloved', description: 'A single word, set wide, with a crimson underline.', category: 'tee', price: money(2800, 'GBP'), colours: [COLOURS.bone!, COLOURS.crimson!, COLOURS.navy!], variants: variants('pr-beloved', ['bone', 'crimson', 'navy'], 2800), artwork: { style: 'stack', lines: ['BELOVED'], accent: '1 JOHN 3:1' }, creatorId: 'cr-harbour', campaignId: 'cp-harbour', collectionSlugs: ['new-creation'], scripture: '1 John 3:1', story: 'Written by a young person at Harbour who wanted a word that nobody could take from them.', createdAt: '2026-07-18', unitsSold: 503 }),
  P({ id: 'pr-salt', slug: 'salt-and-light', name: 'Salt & Light', description: 'Split-tone mark printed front, verse on the back neck.', category: 'tee', price: money(3000, 'GBP'), colours: [COLOURS.white!, COLOURS.black!, COLOURS.stone!], variants: variants('pr-salt', ['white', 'black', 'stone'], 3000), artwork: { style: 'block', lines: ['SALT', '&', 'LIGHT'], accent: 'MATT 5' }, creatorId: 'cr-stmarks', campaignId: 'cp-mission', collectionSlugs: ['mission-made'], scripture: 'Matthew 5:13-16', story: 'A second design from the St Mark\'s group, built for the stalls at their church fete.', createdAt: '2026-09-28', unitsSold: 122 }),
];

export const HERO_PRODUCT_SLUGS = ['made-new-heavyweight', 'sent-ones', 'the-old-has-gone', 'harbour-crewneck'];

/* -------- Creator studio and admin sample records (demo mode only) -------- */

export const DEMO_CREATOR_ID = 'cr-ada';

const now = '2026-10-16T10:00:00Z';

export const SUBMISSIONS: DesignSubmission[] = [
  {
    id: 'ds-1001', creatorId: 'cr-ada', title: 'Made New Heavyweight', description: 'Stacked wordmark with verse on the back.', category: 'heavyweight', colourIds: ['bone', 'black', 'crimson'], productTypes: ['heavyweight'], suggestedPrice: money(3800, 'GBP'), scripture: '2 Corinthians 5:17', artwork: { style: 'stack', lines: ['MADE', 'NEW'], accent: '5:17' }, status: 'published', ownershipConfirmed: true, policyAccepted: true,
    validation: [ { check: 'File type', passed: true, detail: 'PNG, re-encoded server-side' }, { check: 'Dimensions', passed: true, detail: '4500 × 5400 px at 300 DPI' }, { check: 'Transparency', passed: true, detail: 'Transparent background detected' }, { check: 'Malware scan', passed: true, detail: 'Clean' } ],
    history: [ { id: 'h1', at: '2026-09-20T09:00:00Z', actorName: 'Ada Okafor', from: 'draft', to: 'submitted' }, { id: 'h2', at: '2026-09-21T11:30:00Z', actorName: 'Reviewer: Sam', from: 'submitted', to: 'under_review' }, { id: 'h3', at: '2026-09-22T14:10:00Z', actorName: 'Reviewer: Sam', from: 'under_review', to: 'approved' }, { id: 'h4', at: '2026-10-02T08:00:00Z', actorName: 'Admin: Priya', from: 'approved', to: 'published' } ],
    internalNotes: [], productId: 'pr-made-new', shopifyProductId: 'gid://shopify/Product/SAMPLE-1001', updatedAt: '2026-10-02T08:00:00Z', unitsSold: 412, earnings: money(198_300, 'GBP'),
  },
  {
    id: 'ds-1002', creatorId: 'cr-ada', title: 'Living Water', description: 'Flowing serif with sleeve print.', category: 'longsleeve', colourIds: ['white', 'bone'], productTypes: ['longsleeve'], suggestedPrice: money(4200, 'GBP'), scripture: 'John 4:14', artwork: { style: 'script', lines: ['living', 'water'], accent: 'JOHN 4:14' }, status: 'published', ownershipConfirmed: true, policyAccepted: true,
    validation: [ { check: 'File type', passed: true, detail: 'PNG' }, { check: 'Dimensions', passed: true, detail: '4500 × 5400 px' }, { check: 'Malware scan', passed: true, detail: 'Clean' } ],
    history: [ { id: 'h5', at: '2026-08-20T09:00:00Z', actorName: 'Ada Okafor', from: 'draft', to: 'submitted' }, { id: 'h6', at: '2026-08-22T14:10:00Z', actorName: 'Reviewer: Sam', from: 'under_review', to: 'approved' }, { id: 'h7', at: '2026-09-05T08:00:00Z', actorName: 'Admin: Priya', from: 'approved', to: 'published' } ],
    internalNotes: [], productId: 'pr-living-water', shopifyProductId: 'gid://shopify/Product/SAMPLE-1002', updatedAt: '2026-09-05T08:00:00Z', unitsSold: 156, earnings: money(81_120, 'GBP'),
  },
  {
    id: 'ds-1003', creatorId: 'cr-ada', title: 'Wells of Joy', description: 'Concentric circles representing the borehole rings.', category: 'tee', colourIds: ['bone', 'stone'], productTypes: ['tee'], suggestedPrice: money(3000, 'GBP'), scripture: 'Isaiah 12:3', artwork: { style: 'mark', lines: ['JOY'], accent: 'ISA 12:3' }, status: 'changes_requested', ownershipConfirmed: true, policyAccepted: true,
    validation: [ { check: 'File type', passed: true, detail: 'PNG' }, { check: 'Dimensions', passed: false, detail: '1800 × 2000 px is below the 3600 × 4800 px print minimum' }, { check: 'Malware scan', passed: true, detail: 'Clean' } ],
    history: [ { id: 'h8', at: '2026-10-10T09:00:00Z', actorName: 'Ada Okafor', from: 'draft', to: 'submitted' }, { id: 'h9', at: '2026-10-11T10:00:00Z', actorName: 'Reviewer: Sam', from: 'submitted', to: 'under_review' }, { id: 'h10', at: '2026-10-11T15:00:00Z', actorName: 'Reviewer: Sam', from: 'under_review', to: 'changes_requested', reason: 'Lovely concept. The artwork resolution is too low for a full-front print; please re-export at 4500 × 5400 px.' } ],
    internalNotes: [], updatedAt: '2026-10-11T15:00:00Z', unitsSold: 0, earnings: money(0, 'GBP'),
  },
  {
    id: 'ds-1004', creatorId: 'cr-ada', title: 'Kept', description: 'Minimal chest print.', category: 'tee', colourIds: ['white'], productTypes: ['tee'], suggestedPrice: money(2800, 'GBP'), artwork: { style: 'stack', lines: ['KEPT'] }, status: 'draft', ownershipConfirmed: false, policyAccepted: false, validation: [], history: [], internalNotes: [], updatedAt: '2026-10-15T19:00:00Z', unitsSold: 0, earnings: money(0, 'GBP'),
  },
  {
    id: 'ds-2001', creatorId: 'cr-jonah', title: 'Grace Upon Grace', description: 'Repeating typographic pattern.', category: 'tee', colourIds: ['black', 'white'], productTypes: ['tee', 'heavyweight'], suggestedPrice: money(3200, 'GBP'), scripture: 'John 1:16', artwork: { style: 'block', lines: ['GRACE', 'UPON', 'GRACE'] }, status: 'submitted', ownershipConfirmed: true, policyAccepted: true,
    validation: [ { check: 'File type', passed: true, detail: 'PNG, re-encoded' }, { check: 'Dimensions', passed: true, detail: '4500 × 5400 px' }, { check: 'Transparency', passed: true, detail: 'Transparent' }, { check: 'Malware scan', passed: true, detail: 'Clean' } ],
    history: [ { id: 'h11', at: '2026-10-15T09:00:00Z', actorName: 'Jonah Reyes', from: 'draft', to: 'submitted' } ], internalNotes: [], updatedAt: '2026-10-15T09:00:00Z', unitsSold: 0, earnings: money(0, 'GBP'),
    campaign: { name: 'Bristol Food Bank Winter Drive', goal: money(500_000, 'GBP'), beneficiary: 'Bristol Community Pantry (sample)', intendedUse: 'Bulk food purchase', description: 'Stocking shelves through winter.' },
  },
  {
    id: 'ds-2002', creatorId: 'cr-stmarks', title: 'Here I Am', description: 'Hand-lettered response to Isaiah 6:8.', category: 'tee', colourIds: ['crimson', 'bone'], productTypes: ['tee'], suggestedPrice: money(3000, 'GBP'), scripture: 'Isaiah 6:8', artwork: { style: 'arc', lines: ['HERE', 'I AM'], accent: 'SEND ME' }, status: 'under_review', ownershipConfirmed: true, policyAccepted: true,
    validation: [ { check: 'File type', passed: true, detail: 'PNG' }, { check: 'Dimensions', passed: true, detail: '4200 × 5000 px' }, { check: 'Transparency', passed: true, detail: 'Transparent' }, { check: 'Malware scan', passed: true, detail: 'Clean' } ],
    history: [ { id: 'h12', at: '2026-10-14T09:00:00Z', actorName: "St Mark's Youth", from: 'draft', to: 'submitted' }, { id: 'h13', at: '2026-10-16T08:00:00Z', actorName: 'Reviewer: Sam', from: 'submitted', to: 'under_review' } ],
    internalNotes: [ { at: '2026-10-16T08:05:00Z', author: 'Sam', body: 'Check that the youth group has permission for the hand-lettering from the original artist.' } ], updatedAt: now, unitsSold: 0, earnings: money(0, 'GBP'),
    campaign: { name: 'Summer Mission 2027', goal: money(1_200_000, 'GBP'), beneficiary: "St Mark's Youth", intendedUse: 'Travel and materials', description: 'Sending 24 young people to serve.' },
  },
  {
    id: 'ds-2003', creatorId: 'cr-harbour', title: 'Anchor Tee', description: 'Linocut anchor with coordinates.', category: 'tee', colourIds: ['navy'], productTypes: ['tee'], suggestedPrice: money(3000, 'GBP'), scripture: 'Hebrews 6:19', artwork: { style: 'mark', lines: ['ANCHOR'], accent: 'HEB 6:19' }, status: 'approved', ownershipConfirmed: true, policyAccepted: true,
    validation: [ { check: 'File type', passed: true, detail: 'PNG' }, { check: 'Dimensions', passed: true, detail: '4500 × 5400 px' }, { check: 'Malware scan', passed: true, detail: 'Clean' } ],
    history: [ { id: 'h14', at: '2026-10-12T09:00:00Z', actorName: 'Harbour Collective', from: 'draft', to: 'submitted' }, { id: 'h15', at: '2026-10-13T14:00:00Z', actorName: 'Reviewer: Sam', from: 'under_review', to: 'approved' } ], internalNotes: [], updatedAt: '2026-10-13T14:00:00Z', unitsSold: 0, earnings: money(0, 'GBP'),
  },
];

export function salesSeries(days = 60): SalesPoint[] {
  // Deterministic pseudo-random sample series so charts are stable between renders.
  let seed = 17;
  const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const out: SalesPoint[] = [];
  const start = Date.UTC(2026, 7, 18);
  for (let i = 0; i < days; i++) {
    const trend = 2 + i / 9;
    const units = Math.max(0, Math.round(trend + rand() * 6 - 2 + (i % 7 === 5 ? 4 : 0)));
    const gross = units * 3600;
    out.push({ date: new Date(start + i * 86_400_000).toISOString().slice(0, 10), units, gross, earnings: Math.floor(gross * 0.13) });
  }
  return out;
}

export const LEDGER: LedgerEntry[] = [
  { id: 'le-1', at: '2026-10-15T12:00:00Z', kind: 'sale', description: 'Order #MN-1048 · Made New Heavyweight × 2', amount: 1046, currency: 'GBP', status: 'pending', policyVersion: '2026-10-v1' },
  { id: 'le-2', at: '2026-10-14T09:20:00Z', kind: 'refund', description: 'Refund on #MN-1032 · Living Water × 1', amount: -538, currency: 'GBP', status: 'pending', policyVersion: '2026-10-v1' },
  { id: 'le-3', at: '2026-10-12T16:40:00Z', kind: 'sale', description: 'Order #MN-1032 · Living Water × 1', amount: 538, currency: 'GBP', status: 'reversed', policyVersion: '2026-10-v1' },
  { id: 'le-4', at: '2026-10-01T08:00:00Z', kind: 'payout', description: 'Payout to account ending 4471', amount: -84_200, currency: 'GBP', status: 'paid', policyVersion: '2026-10-v1' },
  { id: 'le-5', at: '2026-09-29T10:00:00Z', kind: 'adjustment', description: 'Printing reprint credit (misprint on #MN-0990)', amount: 410, currency: 'GBP', status: 'eligible', policyVersion: '2026-10-v1' },
];

export const ORDERS: Order[] = [
  { id: 'or-1048', shopifyOrderId: '#MN-1048', createdAt: '2026-10-15T12:00:00Z', customerInitials: 'R.T.', total: money(7995, 'GBP'), status: 'paid', items: 2 },
  { id: 'or-1047', shopifyOrderId: '#MN-1047', createdAt: '2026-10-15T09:12:00Z', customerInitials: 'L.M.', total: money(3395, 'GBP'), status: 'fulfilled', items: 1 },
  { id: 'or-1046', shopifyOrderId: '#MN-1046', createdAt: '2026-10-14T19:40:00Z', customerInitials: 'K.A.', total: money(5795, 'GBP'), status: 'fulfilment_error', items: 1 },
  { id: 'or-1032', shopifyOrderId: '#MN-1032', createdAt: '2026-10-12T16:40:00Z', customerInitials: 'J.B.', total: money(4595, 'GBP'), status: 'refunded', items: 1 },
];

export const JOBS: IntegrationJob[] = [
  { id: 'jb-1', kind: 'pod.order.submit', status: 'failed', attempts: 3, idempotencyKey: 'pod-order:or-1046', lastError: 'Provider returned 422: variant not available in selected region', updatedAt: '2026-10-14T19:55:00Z' },
  { id: 'jb-2', kind: 'shopify.product.create', status: 'queued', attempts: 0, idempotencyKey: 'shopify-product:ds-2003', updatedAt: '2026-10-16T08:00:00Z' },
  { id: 'jb-3', kind: 'webhook.orders.paid', status: 'succeeded', attempts: 1, idempotencyKey: 'webhook:SAMPLE-91a3', updatedAt: '2026-10-15T12:00:05Z' },
];

export const USERS: AdminUser[] = [
  { id: 'u-1', name: 'Ada Okafor', email: 'ada@example.com', roles: ['creator'], status: 'active', createdAt: '2026-07-01', designs: 4, reports: 0 },
  { id: 'u-2', name: "St Mark's Youth", email: 'youth@stmarks.example.org', roles: ['creator'], status: 'active', createdAt: '2026-08-10', designs: 3, reports: 0 },
  { id: 'u-3', name: 'Jonah Reyes', email: 'jonah@example.com', roles: ['creator'], status: 'active', createdAt: '2026-08-14', designs: 3, reports: 1 },
  { id: 'u-4', name: 'Harbour Collective', email: 'hello@harbour.example.org', roles: ['creator'], status: 'active', createdAt: '2026-06-03', designs: 3, reports: 0 },
  { id: 'u-5', name: 'Spam Account', email: 'deals4u@example.net', roles: ['creator'], status: 'suspended', createdAt: '2026-10-01', designs: 1, reports: 6 },
  { id: 'u-6', name: 'Sam Patel', email: 'sam@madenew.example', roles: ['reviewer'], status: 'active', createdAt: '2026-05-01', designs: 0, reports: 0 },
];
