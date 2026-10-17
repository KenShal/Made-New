import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { processArtwork, sniffImageType } from '../src/domain/artwork';
import { setup } from './helpers';

const png = (w: number, h: number, alpha = true) =>
  sharp({ create: { width: w, height: h, channels: alpha ? 4 : 3, background: alpha ? { r: 0, g: 0, b: 0, alpha: 0 } : { r: 255, g: 255, b: 255 } } }).png().toBuffer();

function upload(s: ReturnType<typeof setup>, bytes: Uint8Array, as = s.creatorA, name = 'art.png', type = 'image/png') {
  const fd = new FormData();
  fd.append('file', new File([bytes], name, { type }));
  return s.app.request('/api/creator/artwork', { method: 'POST', body: fd, headers: { Authorization: `Bearer ${s.token(as)}` } });
}

describe('artwork processing', () => {
  it('sniffs real magic bytes and ignores file extensions', async () => {
    expect(sniffImageType(await png(10, 10))).toBe('image/png');
    expect(sniffImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(sniffImageType(Buffer.from('%PDF-1.7'))).toBeNull();
  });

  it('accepts a print-ready transparent PNG and re-encodes it with a random storage key', async () => {
    const r = await processArtwork(await png(3600, 4800), 'cr_A');
    expect(r.ok).toBe(true);
    expect(r.storageKey).toMatch(/^cr_A\/[0-9a-f-]{36}\.png$/);
    expect(r.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects images below print dimensions', async () => {
    const r = await processArtwork(await png(800, 800), 'cr_A');
    expect(r.ok).toBe(false);
    expect(r.checks.find((c) => c.check === 'Dimensions')?.passed).toBe(false);
  });

  it('rejects corrupt files that carry a valid PNG signature', async () => {
    const bad = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('not really a png at all')]);
    const r = await processArtwork(bad, 'cr_A');
    expect(r.ok).toBe(false);
    expect(r.output).toBeUndefined();
  });

  it('strips trailing polyglot payloads by re-encoding', async () => {
    const real = await png(3600, 4800);
    const poly = Buffer.concat([real, Buffer.from('<script>alert(1)</script><?php system($_GET[1]); ?>')]);
    const r = await processArtwork(poly, 'cr_A');
    expect(r.output).toBeDefined();
    expect(r.output!.includes(Buffer.from('<script>'))).toBe(false);
    expect(r.output!.includes(Buffer.from('<?php'))).toBe(false);
  });

  it('rejects empty files', async () => {
    expect((await processArtwork(Buffer.alloc(0), 'cr_A')).ok).toBe(false);
  });
});

describe('artwork upload endpoint', () => {
  it('rejects an HTML file disguised as a PNG', async () => {
    const s = setup();
    const res = await upload(s, Buffer.from('<html><script>alert(1)</script></html>'));
    const body = (await res.json()) as { assetId: string | null; validation: { check: string; passed: boolean }[] };
    expect(body.assetId).toBeNull();
    expect(body.validation.find((c) => c.check === 'File type')?.passed).toBe(false);
  });

  it('stores a valid upload privately and returns a short-lived preview', async () => {
    const s = setup();
    const res = await upload(s, await png(3600, 4800));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { assetId: string; previewUrl: string };
    expect(body.assetId).toBeTruthy();
    expect(body.previewUrl).toBeTruthy();
  });

  it('refuses uploads from shoppers and anonymous users', async () => {
    const s = setup();
    expect((await upload(s, await png(10, 10), s.shopper)).status).toBe(403);
    const fd = new FormData();
    fd.append('file', new File([await png(10, 10)], 'a.png'));
    expect((await s.app.request('/api/creator/artwork', { method: 'POST', body: fd })).status).toBe(401);
  });

  it('rejects files flagged by the malware scanner', async () => {
    const s = setup({ scanner: { scan: async () => 'infected' } });
    const res = await upload(s, await png(3600, 4800));
    expect(res.status).toBe(422);
  });

  it('returns 413 for bodies over the size limit', async () => {
    const s = setup();
    const res = await upload(s, Buffer.alloc(27 * 1024 * 1024, 1));
    expect(res.status).toBe(413);
  });
});
