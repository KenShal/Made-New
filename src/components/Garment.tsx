import { memo, useId } from 'react';
import type { Artwork, GarmentColour, Product } from '@shared/types';

/**
 * Vector garment mockup. Artwork lettering is rendered as real text from the
 * product record, so it is never distorted or regenerated. When an uploaded
 * artwork image exists it is placed inside the print area at its own aspect ratio.
 */
interface GarmentProps {
  colour: GarmentColour;
  artwork: Artwork;
  category?: Product['category'];
  view?: 'front' | 'back';
  className?: string;
  title: string;
  /** Detail crop zooms into the print for close-up imagery. */
  crop?: 'full' | 'detail';
}

const CRIMSON = '#B5122B';

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function bodyPath(category: Product['category']): { body: string; sleeves: string; cuffs?: string; hem?: string } {
  const boxy = category === 'heavyweight' || category === 'crewneck';
  const sh = boxy ? 112 : 124; // shoulder x
  const w = boxy ? 104 : 116; // body side x at hem
  if (category === 'longsleeve' || category === 'crewneck') {
    return {
      body: `M${sh} 118 C 200 96 236 86 258 82 C 272 108 328 108 342 82 C 364 86 400 96 ${600 - sh} 118 L ${600 - w} 300 L ${600 - w + 4} 640 C 420 652 180 652 ${w - 4} 640 L ${w} 300 Z`,
      sleeves: `M${sh} 118 C 84 140 66 200 52 300 L 30 560 C 46 572 72 576 92 572 L ${w + 6} 330 Z M${600 - sh} 118 C 516 140 534 200 548 300 L 570 560 C 554 572 528 576 508 572 L ${600 - w - 6} 330 Z`,
      cuffs: `M30 560 C 46 572 72 576 92 572 L 90 600 C 70 604 46 600 28 590 Z M570 560 C 554 572 528 576 508 572 L 510 600 C 530 604 554 600 572 590 Z`,
      hem: category === 'crewneck' ? `M${w - 4} 640 C 180 652 420 652 ${600 - w + 4} 640 L ${600 - w + 2} 672 C 420 684 180 684 ${w - 2} 672 Z` : undefined,
    };
  }
  return {
    body: `M${sh} 118 C 200 96 236 86 258 82 C 272 108 328 108 342 82 C 364 86 400 96 ${600 - sh} 118 L ${600 - w} 290 L ${600 - w + 6} 646 C 420 658 180 658 ${w - 6} 646 L ${w} 290 Z`,
    sleeves: `M${sh} 118 C 84 132 52 178 30 238 L 92 288 C 104 270 ${w - 4} 262 ${w + 2} 262 Z M${600 - sh} 118 C 516 132 548 178 570 238 L 508 288 C 496 270 ${600 - w + 4} 262 ${600 - w - 2} 262 Z`,
  };
}

function ArtworkLayer({ artwork, ink, accent, view }: { artwork: Artwork; ink: string; accent: string; view: 'front' | 'back' }) {
  const id = useId().replace(/:/g, '');
  const cx = 300;
  const top = view === 'back' ? 200 : 190;
  if (artwork.imageUrl) {
    return <image href={artwork.imageUrl} x={190} y={top} width={220} height={270} preserveAspectRatio="xMidYMin meet" />;
  }
  const lines = artwork.lines;
  switch (artwork.style) {
    case 'stack': {
      const size = lines.length === 1 ? Math.min(64, 520 / Math.max(lines[0]!.length, 1)) : 86;
      return (
        <g fill={ink} fontFamily="Manrope, Inter, sans-serif" fontWeight={800} textAnchor="middle" style={{ letterSpacing: lines.length === 1 ? '0.2em' : '-0.05em' }}>
          {lines.map((l, i) => (
            <text key={i} x={cx + (lines.length === 1 ? 6 : 0)} y={top + 70 + i * size * 0.84} fontSize={size}>
              {l}
            </text>
          ))}
          {lines.length === 1 && <rect x={cx - 70} y={top + 92} width={140} height={4} fill={accent} />}
          {artwork.accent && (
            <text x={cx} y={top + 70 + lines.length * size * 0.84 + (lines.length === 1 ? 34 : 6)} fontSize={13} fill={accent} fontWeight={700} style={{ letterSpacing: '0.32em' }}>
              {artwork.accent}
            </text>
          )}
        </g>
      );
    }
    case 'verse':
      return (
        <g fill={ink} textAnchor="middle" fontFamily="Manrope, Inter, sans-serif" fontWeight={700}>
          {lines.map((l, i) => (
            <text key={i} x={cx} y={top + 40 + i * 26} fontSize={13} style={{ letterSpacing: '0.08em' }}>
              {l}
            </text>
          ))}
          <rect x={cx - 14} y={top + 34 + lines.length * 26} width={28} height={3} fill={accent} />
          {artwork.accent && (
            <text x={cx} y={top + 62 + lines.length * 26} fontSize={10} fill={ink} style={{ letterSpacing: '0.4em' }}>
              {artwork.accent}
            </text>
          )}
        </g>
      );
    case 'script':
      return (
        <g fill={ink} textAnchor="middle">
          {lines.map((l, i) => (
            <text key={i} x={cx} y={top + 66 + i * 64} fontSize={72} fontFamily="'Instrument Serif', Georgia, serif" fontStyle="italic" style={{ letterSpacing: '-0.02em' }}>
              {l}
            </text>
          ))}
          {artwork.accent && (
            <text x={cx} y={top + 66 + lines.length * 64 + 4} fontSize={11} fontFamily="Inter, sans-serif" fontWeight={600} fill={accent} style={{ letterSpacing: '0.42em' }}>
              {artwork.accent}
            </text>
          )}
        </g>
      );
    case 'mark':
      return (
        <g textAnchor="middle" fontFamily="Manrope, Inter, sans-serif" fontWeight={800}>
          <circle cx={cx} cy={top + 100} r={84} fill="none" stroke={ink} strokeWidth={3} />
          <circle cx={cx} cy={top + 100} r={72} fill="none" stroke={ink} strokeWidth={1} opacity={0.6} />
          <path d={`M${cx} ${top + 52} v86 M${cx - 30} ${top + 70} h60 M${cx - 44} ${top + 118} c 10 30 78 30 88 0`} stroke={accent} strokeWidth={6} fill="none" strokeLinecap="round" />
          <text x={cx} y={top + 222} fontSize={24} fill={ink} style={{ letterSpacing: '0.34em' }}>
            {lines[0]}
          </text>
          {artwork.accent && (
            <text x={cx} y={top + 246} fontSize={11} fill={ink} opacity={0.75} fontWeight={600} style={{ letterSpacing: '0.4em' }}>
              {artwork.accent}
            </text>
          )}
        </g>
      );
    case 'arc':
      return (
        <g textAnchor="middle" fontFamily="Manrope, Inter, sans-serif" fontWeight={800} fill={ink}>
          <defs>
            <path id={`arc-${id}`} d={`M ${cx - 150} ${top + 110} Q ${cx} ${top - 10} ${cx + 150} ${top + 110}`} />
          </defs>
          <text fontSize={64} style={{ letterSpacing: '0.04em' }}>
            <textPath href={`#arc-${id}`} startOffset="50%">
              {lines[0]}
            </textPath>
          </text>
          <text x={cx} y={top + 170} fontSize={64} style={{ letterSpacing: '0.04em' }}>
            {lines.slice(1).join(' ')}
          </text>
          {artwork.accent && (
            <>
              <rect x={cx - 66} y={top + 192} width={132} height={26} fill={accent} />
              <text x={cx} y={top + 210} fontSize={12} fill="#FFF6F2" style={{ letterSpacing: '0.34em' }}>
                {artwork.accent}
              </text>
            </>
          )}
        </g>
      );
    case 'block':
    default: {
      const size = lines.length > 3 ? 54 : 64;
      return (
        <g fontFamily="Manrope, Inter, sans-serif" fontWeight={800} fill={ink}>
          {lines.map((l, i) => (
            <text key={i} x={204} y={top + 52 + i * size * 0.92} fontSize={size} style={{ letterSpacing: '-0.045em' }}>
              {l}
              {i === lines.length - 1 && artwork.accent === '.' && <tspan fill={accent}>.</tspan>}
            </text>
          ))}
          {artwork.accent && artwork.accent !== '.' && (
            <text x={206} y={top + 52 + lines.length * size * 0.92 - 8} fontSize={11} fill={accent} fontWeight={700} style={{ letterSpacing: '0.4em' }}>
              {artwork.accent}
            </text>
          )}
        </g>
      );
    }
  }
}

export const Garment = memo(function Garment({ colour, artwork, category = 'tee', view = 'front', className, title, crop = 'full' }: GarmentProps) {
  const uid = useId().replace(/:/g, '');
  const dark = luminance(colour.hex) < 0.2;
  const accent = colour.id === 'crimson' ? colour.ink : CRIMSON;
  const paths = bodyPath(category);
  const viewBox = crop === 'detail' ? '140 150 320 360' : '0 40 600 660';
  return (
    <svg viewBox={viewBox} className={className} {...(title ? { role: "img", "aria-label": title } : { "aria-hidden": true })} preserveAspectRatio="xMidYMid meet">
      <title>{title}</title>
      <defs>
        <linearGradient id={`shade-${uid}`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity={dark ? 0.35 : 0.14} />
          <stop offset="0.16" stopColor="#000" stopOpacity="0" />
          <stop offset="0.84" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity={dark ? 0.4 : 0.16} />
        </linearGradient>
        <radialGradient id={`light-${uid}`} cx="0.42" cy="0.28" r="0.75">
          <stop offset="0" stopColor="#fff" stopOpacity={dark ? 0.12 : 0.38} />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <filter id={`fabric-${uid}`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" result="n" />
          <feColorMatrix in="n" type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncA type="linear" slope={dark ? 0.12 : 0.08} />
          </feComponentTransfer>
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
        <filter id={`soft-${uid}`}>
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <filter id={`drape-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="22" />
        </filter>
        <filter id={`ink-${uid}`}>
          {/* Slightly lifts the print into the fabric so it reads as screen-printed, not stuck on. */}
          <feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="1" seed="9" result="t" />
          <feDisplacementMap in="SourceGraphic" in2="t" scale="1.2" />
        </filter>
        <clipPath id={`clip-${uid}`}>
          <path d={paths.body} />
        </clipPath>
      </defs>

      {/* ground shadow */}
      <ellipse cx="300" cy="676" rx="210" ry="12" fill="#171717" opacity="0.08" filter={`url(#soft-${uid})`} />

      <g>
        <path d={paths.sleeves} fill={colour.hex} />
        <path d={paths.sleeves} fill={`url(#shade-${uid})`} />
        {!paths.cuffs && (
          <path d="M40 246 L 96 290 M560 246 L 504 290" stroke={dark ? '#fff' : '#000'} strokeOpacity={dark ? 0.12 : 0.12} strokeWidth="1.2" strokeDasharray="4 3" fill="none" />
        )}
        {paths.cuffs && <path d={paths.cuffs} fill={colour.hex} stroke="#000" strokeOpacity={0.08} />}
        <path d={paths.body} fill={colour.hex} />
        {paths.hem && <path d={paths.hem} fill={colour.hex} stroke="#000" strokeOpacity={0.1} />}

        <g clipPath={`url(#clip-${uid})`}>
          <rect x="0" y="0" width="600" height="700" fill={`url(#shade-${uid})`} />
          <rect x="0" y="0" width="600" height="700" fill={`url(#light-${uid})`} />
          {/* drape: broad, soft tonal shifts rather than lines */}
          <g fill="#000" fillOpacity={dark ? 0.22 : 0.05} filter={`url(#drape-${uid})`}>
            <path d="M150 330 C 190 420 170 560 200 660 L 150 660 Z" />
            <path d="M450 360 C 420 460 440 560 420 660 L 470 660 Z" />
            <ellipse cx="300" cy="640" rx="120" ry="18" />
          </g>
          <g fill="#fff" fillOpacity={dark ? 0.05 : 0.28} filter={`url(#drape-${uid})`}>
            <ellipse cx="250" cy="420" rx="34" ry="170" />
            <ellipse cx="368" cy="460" rx="22" ry="140" />
          </g>
          {/* shoulder seams and hem stitching */}
          <g fill="none" stroke="#000" strokeOpacity={dark ? 0.35 : 0.1} strokeWidth="1.2">
            <path d="M118 120 C 160 104 220 90 256 84" />
            <path d="M482 120 C 440 104 380 90 344 84" />
          </g>
          <path d="M100 628 C 200 640 400 640 500 628" fill="none" stroke={dark ? '#fff' : '#000'} strokeOpacity={dark ? 0.1 : 0.12} strokeWidth="1.2" strokeDasharray="4 3" />
          <g filter={`url(#ink-${uid})`} opacity={0.94}>
            <ArtworkLayer artwork={artwork} ink={colour.ink} accent={accent} view={view} />
          </g>
          <rect x="0" y="0" width="600" height="700" filter={`url(#fabric-${uid})`} fill={colour.hex} />
        </g>

        {/* neckline rib and stitching */}
        {view === 'front' ? (
          <>
            <path d="M258 82 C 272 120 328 120 342 82" fill="none" stroke="#000" strokeOpacity={dark ? 0.45 : 0.16} strokeWidth="12" />
            <path d="M262 92 C 276 124 324 124 338 92" fill="none" stroke="#fff" strokeOpacity={dark ? 0.12 : 0.5} strokeWidth="1.4" strokeDasharray="3 3" />
          </>
        ) : (
          <path d="M258 82 C 276 96 324 96 342 82" fill="none" stroke="#000" strokeOpacity={dark ? 0.45 : 0.16} strokeWidth="10" />
        )}
        <path d={paths.body} fill="none" stroke="#000" strokeOpacity={dark ? 0.5 : 0.08} strokeWidth="1.5" />
      </g>
    </svg>
  );
});
