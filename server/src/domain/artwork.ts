import { createHash, randomUUID } from 'node:crypto';
import sharp, { type Metadata } from 'sharp';

export const ARTWORK_LIMITS = {
  maxBytes: 25 * 1024 * 1024,
  minWidth: 3600,
  minHeight: 4800,
  maxDimension: 12_000,
  maxPixels: 12_000 * 12_000,
};

export type SniffedType = 'image/png' | 'image/jpeg' | 'image/webp';

/** Detect type from magic bytes. The client-declared MIME type is never trusted. */
export function sniffImageType(buf: Uint8Array): SniffedType | null {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 && buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a) return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 12 && String.fromCharCode(...buf.slice(0, 4)) === 'RIFF' && String.fromCharCode(...buf.slice(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}

export interface ValidationCheck {
  check: string;
  passed: boolean;
  detail: string;
}

export interface ProcessedArtwork {
  ok: boolean;
  checks: ValidationCheck[];
  /** Re-encoded PNG with metadata stripped. Only the re-encoded bytes are ever stored. */
  output?: Buffer;
  width?: number;
  height?: number;
  sha256?: string;
  storageKey?: string;
}

/**
 * Validate and re-encode an uploaded artwork file. Re-encoding through a decoder
 * neutralises polyglot files and strips EXIF/ICC metadata (which can carry
 * location data). Decompression bombs are bounded by limitInputPixels.
 */
export async function processArtwork(input: Buffer, creatorId: string, opts: { requireMinDimensions?: boolean } = {}): Promise<ProcessedArtwork> {
  const checks: ValidationCheck[] = [];
  const sizeOk = input.length > 0 && input.length <= ARTWORK_LIMITS.maxBytes;
  checks.push({ check: 'File size', passed: sizeOk, detail: sizeOk ? `${(input.length / 1024 / 1024).toFixed(1)} MB` : 'Files must be between 1 byte and 25 MB' });
  if (!sizeOk) return { ok: false, checks };

  const type = sniffImageType(input);
  checks.push({ check: 'File type', passed: Boolean(type), detail: type ? type.replace('image/', '').toUpperCase() : 'Only PNG, JPEG and WebP images are accepted' });
  if (!type) return { ok: false, checks };

  let meta: Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: ARTWORK_LIMITS.maxPixels, failOn: 'error' }).metadata();
  } catch {
    checks.push({ check: 'Decoding', passed: false, detail: 'The image could not be decoded' });
    return { ok: false, checks };
  }
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const withinMax = width > 0 && height > 0 && width <= ARTWORK_LIMITS.maxDimension && height <= ARTWORK_LIMITS.maxDimension;
  const meetsMin = width >= ARTWORK_LIMITS.minWidth && height >= ARTWORK_LIMITS.minHeight;
  const dimOk = withinMax && (opts.requireMinDimensions === false || meetsMin);
  checks.push({ check: 'Dimensions', passed: dimOk, detail: `${width} × ${height} px${meetsMin ? '' : ` (print minimum ${ARTWORK_LIMITS.minWidth} × ${ARTWORK_LIMITS.minHeight})`}` });

  let output: Buffer;
  try {
    output = await sharp(input, { limitInputPixels: ARTWORK_LIMITS.maxPixels }).rotate().png({ compressionLevel: 9 }).toBuffer();
  } catch {
    checks.push({ check: 'Re-encoding', passed: false, detail: 'The image could not be safely re-encoded' });
    return { ok: false, checks };
  }

  const hasAlpha = Boolean(meta.hasAlpha);
  let transparent = false;
  if (hasAlpha) {
    const stats = await sharp(output).stats();
    const alpha = stats.channels[3];
    transparent = Boolean(alpha && alpha.min < 250);
  }
  checks.push({ check: 'Transparency', passed: transparent, detail: transparent ? 'Transparent background detected' : 'No transparent background. Solid backgrounds print as a visible box.' });

  const sha256 = createHash('sha256').update(output).digest('hex');
  // Random, non-guessable key under the creator's folder; original filename is discarded.
  const storageKey = `${creatorId}/${randomUUID()}.png`;
  const ok = checks.every((c) => c.passed || c.check === 'Transparency');
  return { ok, checks, output, width, height, sha256, storageKey };
}
