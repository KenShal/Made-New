import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useMotionValue, useScroll, useSpring, useTransform, type PanInfo } from 'framer-motion';
import type { Creator, Product } from '@shared/types';
import { Garment } from '@/components/Garment';
import { Arrow, ButtonLink, Container, Price, SampleBadge } from '@/components/ui';
import { useCarousel } from '@/hooks/useCarousel';
import { usePageVisible } from '@/hooks/usePageVisible';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { captionVariants, ease, garmentVariants, garmentVariantsFlat, spring } from '@/lib/motion';
import { introDelaySeconds } from './Intro';

const SWIPE_DISTANCE = 60;
const SWIPE_VELOCITY = 400;

export function Hero({ products, creators }: { products: Product[]; creators: Creator[] }) {
  const reduced = usePrefersReducedMotion();
  const visible = usePageVisible();
  const [hover, setHover] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [delay] = useState(() => introDelaySeconds(reduced));
  const c = useCarousel({ count: products.length, suspended: hover || focusWithin || !visible || dragging, autoplayAllowed: !reduced });
  const product = products[c.index]!;
  const colour = product.colours[0]!;
  const creator = creators.find((x) => x.id === product.creatorId);

  // Secondary motion: subtle pointer depth on fine pointers only.
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 60, damping: 18 });
  const sy = useSpring(py, { stiffness: 60, damping: 18 });
  const [finePointer, setFinePointer] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.('(hover: hover) and (pointer: fine)');
    setFinePointer(Boolean(mq?.matches));
  }, []);
  const plateX = useTransform(sx, (v) => v * -0.4);
  const plateY = useTransform(sy, (v) => v * -0.4);
  const onPointerMove = (e: React.PointerEvent) => {
    if (!finePointer || reduced) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    px.set(((e.clientX - r.left) / r.width - 0.5) * 18);
    py.set(((e.clientY - r.top) / r.height - 0.5) * 12);
  };

  // Scroll: the garment settles (slight lift and scale-down) as the collection arrives.
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const settleY = useTransform(scrollYProgress, [0, 1], [0, reduced ? 0 : 80]);
  const settleScale = useTransform(scrollYProgress, [0, 1], [1, reduced ? 1 : 0.92]);
  const lineScale = useTransform(scrollYProgress, [0.2, 0.9], [0, 1]);

  // 3D stage: pointer tilt plus a turn as the hero scrolls away.
  const tiltY = useTransform(sx, (v) => v * 1.5);
  const tiltX = useTransform(sy, (v) => v * -1.6);
  const turnY = useTransform(scrollYProgress, [0, 1], [0, reduced ? 0 : -32]);
  const turnX = useTransform(scrollYProgress, [0, 1], [0, reduced ? 0 : 22]);
  const rotateY = useTransform([tiltY, turnY] as const, ([a, b]: number[]) => a! + b!);
  const rotateX = useTransform([tiltX, turnX] as const, ([a, b]: number[]) => a! + b!);
  const chipY = useTransform(scrollYProgress, [0, 1], [0, reduced ? 0 : -140]);
  const wordX = useTransform(scrollYProgress, [0, 1], ['0%', reduced ? '0%' : '-18%']);
  const shadowScale = useTransform(sy, [-6, 6], [0.92, 1.08]);
  const headlineY = useTransform(scrollYProgress, [0, 1], [0, reduced ? 0 : -60]);
  const headlineRotate = useTransform(scrollYProgress, [0, 1], [0, reduced ? 0 : 12]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    setDragging(false);
    if (info.offset.x < -SWIPE_DISTANCE || info.velocity.x < -SWIPE_VELOCITY) c.next();
    else if (info.offset.x > SWIPE_DISTANCE || info.velocity.x > SWIPE_VELOCITY) c.prev();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      c.next();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      c.prev();
    }
  };

  const enter = (i: number) => ({ initial: { opacity: 0, y: 28 }, animate: { opacity: 1, y: 0, transition: { delay: delay + i * 0.09, duration: 0.8, ease: ease.editorial } } });

  return (
    <section ref={ref} className="relative overflow-hidden bg-white" aria-labelledby="hero-title">
      <Container className="relative grid min-h-[calc(100svh-4.5rem)] grid-cols-1 items-center gap-6 pb-14 pt-8 lg:grid-cols-[1.05fr_1fr] lg:gap-4 lg:pb-20">
        <motion.div className="relative z-10" style={{ y: headlineY, rotateX: headlineRotate, transformPerspective: 1200, originY: 1 }}>
          <motion.p {...enter(0)} className="mb-6 flex items-center gap-3 font-display text-[0.7rem] font-bold uppercase tracking-editorial text-ink-muted">
            <span className="h-[2px] w-8 bg-crimson" aria-hidden />A new kind of Christian streetwear.
          </motion.p>
          <h1 id="hero-title" className="font-display text-mega font-extrabold uppercase">
            <motion.span {...enter(1)} className="block">Wear the</motion.span>
            <motion.span {...enter(2)} className="block">message.</motion.span>
            <motion.span {...enter(3)} className="block text-crimson">Fund the</motion.span>
            <motion.span {...enter(4)} className="block text-crimson">mission.</motion.span>
          </h1>
          <motion.p {...enter(5)} className="mt-8 max-w-md text-[1.05rem] leading-relaxed text-ink-muted">
            Independent designs. Meaningful stories. Merchandise that helps fund what matters.
          </motion.p>
          <motion.div {...enter(6)} className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
            <ButtonLink to="/shop">
              Explore the Collection <Arrow />
            </ButtonLink>
            <ButtonLink to="/creator/designs/new" variant="ghost">
              Create Your Design
            </ButtonLink>
          </motion.div>
        </motion.div>

        {/* Carousel */}
        <motion.div
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0, transition: { delay: delay + 0.2, duration: 0.9, ease: ease.editorial } }}
          className="relative"
          role="region"
          aria-roledescription="carousel"
          aria-label="Featured T-shirts"
          onPointerEnter={() => setHover(true)}
          onPointerLeave={() => {
            setHover(false);
            px.set(0);
            py.set(0);
          }}
          onPointerMove={onPointerMove}
          onFocus={() => setFocusWithin(true)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocusWithin(false);
          }}
          onKeyDown={onKeyDown}
        >
          {/* 3D stage. Layers sit at different depths so pointer tilt and scroll turn read as real space. */}
          <div className="relative mx-auto aspect-[5/6] w-full max-w-[34rem] lg:max-h-[68vh] lg:max-w-none" style={{ perspective: 1400 }}>
            <motion.div style={{ y: settleY, scale: settleScale, rotateX, rotateY, transformStyle: 'preserve-3d' }} className="absolute inset-0 will-change-transform">
              {/* Giant outlined wordmark far behind the garment */}
              <motion.span
                style={{ z: -220, x: wordX }}
                className="pointer-events-none absolute -left-[30%] top-[16%] select-none whitespace-nowrap font-display text-[clamp(6rem,16vw,15rem)] font-extrabold uppercase leading-none text-transparent [-webkit-text-stroke:1.5px_rgba(181,18,43,0.16)]"
                aria-hidden
              >
                Made new
              </motion.span>
              <motion.div style={{ x: plateX, y: plateY, z: -90 }} className="absolute inset-[8%_6%_6%_10%] bg-soft" aria-hidden />
              <motion.span style={{ z: 60 }} className="absolute left-[10%] top-[8%] h-16 w-[3px] bg-crimson" aria-hidden />
              {/* Soft contact shadow on the plate */}
              <motion.span style={{ z: -40, scaleX: shadowScale }} className="absolute bottom-[7%] left-1/2 h-[6%] w-[58%] -translate-x-1/2 rounded-[50%] bg-ink/15 blur-xl" aria-hidden />
              <motion.div style={{ x: sx, y: sy, z: 40, transformStyle: 'preserve-3d' }} className="absolute inset-0">
                <AnimatePresence initial={false} custom={c.direction} mode="popLayout">
                  <motion.div
                    key={product.id}
                    custom={c.direction}
                    variants={reduced ? garmentVariantsFlat : garmentVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    drag={reduced ? false : 'x'}
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={0.18}
                    onDragStart={() => setDragging(true)}
                    onDragEnd={onDragEnd}
                    className="absolute inset-0 cursor-grab touch-pan-y active:cursor-grabbing"
                    role="group"
                    aria-roledescription="slide"
                    aria-label={`${c.index + 1} of ${products.length}: ${product.name}`}
                  >
                    <Garment colour={colour} artwork={product.artwork} category={product.category} title={`${product.name} T-shirt in ${colour.name}`} className="pointer-events-none h-full w-full select-none p-[6%]" />
                  </motion.div>
                </AnimatePresence>
              </motion.div>
              {/* Floating verse chip, closest to the viewer */}
              {product.scripture && (
                <motion.div style={{ z: 150, y: chipY }} className="absolute bottom-[14%] right-[2%] sm:right-[-2%]" aria-hidden>
                  <motion.span
                    animate={reduced ? undefined : { y: [0, -8, 0] }}
                    transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
                    className="block bg-crimson px-3 py-2 font-display text-[0.65rem] font-bold uppercase tracking-[0.18em] text-white shadow-[0_18px_40px_-12px_rgba(120,13,32,0.55)]"
                  >
                    {product.scripture}
                  </motion.span>
                </motion.div>
              )}
            </motion.div>
            {product.sample && <SampleBadge className="absolute right-2 top-2" />}
          </div>

          {/* Product caption + controls. Fixed heights prevent layout shift between slides. */}
          <div className="relative mt-2 flex items-end justify-between gap-4 sm:mt-4">
            <div className="relative h-[4.25rem] min-w-0 flex-1 overflow-hidden" aria-live={c.playing ? 'off' : 'polite'}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={product.id} variants={captionVariants} initial="enter" animate="center" exit="exit">
                  <p className="truncate text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">{creator?.displayName ?? 'Independent creator'}</p>
                  <Link to={`/shop/${product.slug}`} className="group mt-1 flex items-baseline gap-3 font-display text-xl font-extrabold tracking-tight hover:text-crimson sm:text-2xl">
                    <span className="truncate">{product.name}</span>
                    <Price value={product.price} className="font-sans text-sm font-semibold text-ink-muted" />
                  </Link>
                </motion.div>
              </AnimatePresence>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button type="button" onClick={c.togglePause} className="grid h-11 w-11 place-items-center text-ink hover:text-crimson disabled:opacity-30" aria-label={c.userPaused || !c.autoplayAllowed ? 'Play slideshow' : 'Pause slideshow'} aria-pressed={c.userPaused} disabled={!c.autoplayAllowed}>
                {c.userPaused || !c.autoplayAllowed ? (
                  <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden><path d="M2 1l9 5-9 5z" fill="currentColor" /></svg>
                ) : (
                  <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden><path d="M2 1h3v10H2zM7 1h3v10H7z" fill="currentColor" /></svg>
                )}
              </button>
              <button type="button" onClick={c.prev} className="grid h-11 w-11 place-items-center border border-line hover:border-ink" aria-label="Previous shirt">
                <Arrow className="rotate-180 group-hover:translate-x-0" />
              </button>
              <button type="button" onClick={c.next} className="grid h-11 w-11 place-items-center border border-line hover:border-ink" aria-label="Next shirt">
                <Arrow className="group-hover:translate-x-0" />
              </button>
            </div>
          </div>

          <div className="mt-4 flex gap-2" role="group" aria-label="Choose a shirt">
            {products.map((p, i) => (
              <button key={p.id} type="button" onClick={() => c.go(i)} className="relative h-8 flex-1" aria-label={`Show ${p.name}`} aria-current={i === c.index ? 'true' : undefined}>
                <span className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 bg-line" aria-hidden />
                {i === c.index && (
                  <motion.span layoutId="hero-dot" transition={spring.indicator} className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 overflow-hidden bg-ink/25" aria-hidden>
                    <motion.span
                      key={`${c.index}-${c.cycle}-${c.playing}`}
                      className="block h-full origin-left bg-crimson"
                      initial={{ scaleX: c.playing ? 0 : 1 }}
                      animate={{ scaleX: 1 }}
                      transition={{ duration: c.playing ? 6.5 : 0, ease: 'linear' }}
                    />
                  </motion.span>
                )}
              </button>
            ))}
          </div>
        </motion.div>
      </Container>
      {/* A crimson thread that connects the hero to the collection. */}
      <motion.span style={{ scaleY: lineScale }} className="absolute bottom-0 left-1/2 hidden h-24 w-[2px] origin-top -translate-x-1/2 bg-crimson lg:block" aria-hidden />
    </section>
  );
}
