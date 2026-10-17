import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useMotionValueEvent, useScroll, useSpring, useTransform } from 'framer-motion';
import type { Creator, Product } from '@shared/types';
import { Garment } from '@/components/Garment';
import { Arrow, Container, Eyebrow, Price, SampleBadge } from '@/components/ui';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

const MAX_CARDS = 8;

/**
 * The collection as a 3D carousel ring that turns as you scroll.
 * The ring itself is decorative (aria-hidden); the caption below names and links
 * the garment currently facing the viewer, so nothing is reachable only by scrolling.
 * Under reduced motion it renders as a static grid with no sticky scroll.
 */
export function CollectionRing({ products, creators }: { products: Product[]; creators: Creator[] }) {
  const reduced = usePrefersReducedMotion();
  const items = products.slice(0, MAX_CARDS);
  if (items.length < 3) return null;
  return reduced ? <StaticRow items={items} /> : <Ring items={items} creators={creators} />;
}

function useViewportWidth() {
  const [w, setW] = useState(() => (typeof window === 'undefined' ? 1200 : window.innerWidth));
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return w;
}

function Ring({ items, creators }: { items: Product[]; creators: Creator[] }) {
  const ref = useRef<HTMLElement>(null);
  const n = items.length;
  const step = 360 / n;
  const vw = useViewportWidth();
  const cardW = Math.min(260, vw * 0.42);
  const radius = (cardW / 2 / Math.tan(Math.PI / n)) * 1.15;

  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const progress = useSpring(scrollYProgress, { stiffness: 90, damping: 24, mass: 0.6 });
  const rotateY = useTransform(progress, (p) => p * -(360 - step));
  const rotateX = useTransform(progress, [0, 0.5, 1], [14, 4, 14]);
  const titleY = useTransform(scrollYProgress, [0, 0.2], [60, 0]);
  const titleOpacity = useTransform(scrollYProgress, [0, 0.15], [0, 1]);

  const [front, setFront] = useState(0);
  useMotionValueEvent(rotateY, 'change', (v) => {
    const i = ((Math.round(-v / step) % n) + n) % n;
    setFront((prev) => (prev === i ? prev : i));
  });
  const product = items[front]!;
  const creator = creators.find((c) => c.id === product.creatorId);

  return (
    <section ref={ref} className="relative bg-crimson-deep text-white" style={{ height: `${Math.max(240, n * 45)}vh` }} aria-labelledby="ring-title">
      {/* One snap point per shirt, so the ring locks with a garment facing the viewer. */}
      {items.map((p, i) => (
        <div key={p.id} aria-hidden className="snap-stop pointer-events-none absolute inset-x-0 h-px" style={{ top: `calc(${i / (n - 1)} * (100% - 100vh))` }} />
      ))}
      <div className="sticky top-0 flex h-screen flex-col overflow-hidden">
        <Container className="relative z-10 pt-20 sm:pt-24">
          <motion.div style={{ y: titleY, opacity: titleOpacity }}>
            <Eyebrow className="text-white/90">Scroll the collection</Eyebrow>
            <h2 id="ring-title" className="mt-3 font-display text-giant font-extrabold uppercase">
              Every piece <span className="text-crimson-blush">carries</span> a cause.
            </h2>
          </motion.div>
        </Container>

        <div className="relative flex flex-1 items-center justify-center" style={{ perspective: 1600 }} aria-hidden>
          <motion.div className="relative" style={{ width: cardW, height: cardW * 1.2, transformStyle: 'preserve-3d', rotateX, rotateY }}>
            {items.map((p, i) => {
              const colour = p.colours[0]!;
              return (
                <div
                  key={p.id}
                  className="absolute inset-0 overflow-hidden border border-white/10"
                  style={{ transform: `rotateY(${i * step}deg) translateZ(${radius}px)`, backfaceVisibility: 'hidden', background: colour.hex === '#FFFFFF' || colour.name.toLowerCase().includes('white') ? '#F7F6F4' : '#1f0a0e' }}
                >
                  <Garment colour={colour} artwork={p.artwork} category={p.category} title="" className="h-full w-full p-[8%]" />
                </div>
              );
            })}
          </motion.div>
          <div className="pointer-events-none absolute bottom-[12%] left-1/2 h-10 w-[60%] -translate-x-1/2 rounded-[50%] bg-black/40 blur-3xl" />
        </div>

        <Container className="relative z-10 flex items-end justify-between gap-6 pb-10">
          <div aria-live="polite">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/90">
              {String(front + 1).padStart(2, '0')} / {String(n).padStart(2, '0')}
            </p>
            <Link to={`/shop/${product.slug}`} className="mt-2 inline-flex items-center gap-2 font-display text-2xl font-extrabold uppercase hover:text-crimson-blush focus-visible:outline-white">
              {product.name} <Arrow />
            </Link>
            <p className="mt-1 text-sm text-white/90">
              {creator ? `by ${creator.displayName} · ` : ''}
              <Price value={product.price} />
            </p>
          </div>
          {product.sample && <SampleBadge />}
        </Container>
      </div>
    </section>
  );
}

function StaticRow({ items }: { items: Product[] }) {
  return (
    <section className="bg-crimson-deep py-24 text-white" aria-labelledby="ring-title">
      <Container>
        <Eyebrow className="text-white/90">The collection</Eyebrow>
        <h2 id="ring-title" className="mt-3 font-display text-giant font-extrabold uppercase">
          Every piece <span className="text-crimson-blush">carries</span> a cause.
        </h2>
        <ul className="mt-12 grid grid-cols-2 gap-4 md:grid-cols-4">
          {items.map((p) => (
            <li key={p.id}>
              <Link to={`/shop/${p.slug}`} className="block bg-black/25 focus-visible:outline-white">
                <Garment colour={p.colours[0]!} artwork={p.artwork} category={p.category} title="" className="aspect-[5/6] w-full p-[8%]" />
                <span className="block p-3 text-sm font-bold uppercase">{p.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
