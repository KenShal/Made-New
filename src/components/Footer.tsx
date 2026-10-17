import { Link } from 'react-router-dom';
import { Container } from './ui';
import { Wordmark } from './Wordmark';
import { useMotionPreference } from '@/state/motion';

const COLS: { title: string; links: { to: string; label: string }[] }[] = [
  { title: 'Shop', links: [ { to: '/shop', label: 'All products' }, { to: '/collections/new-creation', label: 'New Creation' }, { to: '/collections/heavyweight', label: 'Heavyweight' }, { to: '/collections/mission-made', label: 'Mission Made' } ] },
  { title: 'Create', links: [ { to: '/creator/onboarding', label: 'Become a creator' }, { to: '/creator/designs/new', label: 'Submit a design' }, { to: '/how-it-works', label: 'How it works' }, { to: '/legal/creator-terms', label: 'Creator terms' } ] },
  { title: 'Mission', links: [ { to: '/campaigns', label: 'Campaigns' }, { to: '/discover', label: 'Creators' }, { to: '/how-it-works#proceeds', label: 'How proceeds work' } ] },
  { title: 'Support', links: [ { to: '/legal/shipping', label: 'Shipping & returns' }, { to: '/legal/privacy', label: 'Privacy' }, { to: '/legal/terms', label: 'Terms' }, { to: '/legal/content-policy', label: 'Content policy' } ] },
];

export function Footer() {
  const { reduced, setReduced } = useMotionPreference();
  return (
    <footer className="mt-auto border-t border-line bg-white">
      <Container className="grid gap-12 py-16 md:grid-cols-[1.3fr_repeat(4,1fr)]">
        <div className="flex flex-col gap-5">
          <Wordmark className="text-3xl" />
          <p className="max-w-xs text-sm text-ink-muted">Wear the message. Fund the mission. Independent Christian streetwear made by young creators.</p>
          <p className="font-serif text-lg italic text-ink">&ldquo;The old has gone, the new is here.&rdquo;</p>
        </div>
        {COLS.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <h2 className="mb-4 font-display text-[0.7rem] font-bold uppercase tracking-editorial text-ink-muted">{c.title}</h2>
            <ul className="flex flex-col gap-2.5">
              {c.links.map((l) => (
                <li key={l.to}>
                  <Link to={l.to} className="text-sm text-ink hover:text-crimson">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </Container>
      <Container className="flex flex-col gap-4 border-t border-line py-6 text-xs text-ink-muted sm:flex-row sm:items-center sm:justify-between">
        <p>© {new Date().getFullYear()} MADE NEW. 2 Corinthians 5:17.</p>
        <div className="flex flex-wrap items-center gap-5">
          <a href="https://instagram.com" rel="noopener noreferrer" target="_blank" className="hover:text-crimson">Instagram</a>
          <a href="https://tiktok.com" rel="noopener noreferrer" target="_blank" className="hover:text-crimson">TikTok</a>
          <a href="https://youtube.com" rel="noopener noreferrer" target="_blank" className="hover:text-crimson">YouTube</a>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" className="accent-crimson" checked={reduced} onChange={(e) => setReduced(e.target.checked)} />
            Reduce motion
          </label>
        </div>
      </Container>
    </footer>
  );
}
