import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { setup } from './helpers';

/** Every endpoint the browser client calls must exist on the server. */
describe('client/server API contract', () => {
  const src = readFileSync(new URL('../../src/data/platform.ts', import.meta.url), 'utf8');
  const block = src.slice(src.indexOf('export const httpPlatform'), src.indexOf('/* ----------------------------- Demo implementation'));
  const calls = [...block.matchAll(/(\w+): (?:async )?\([^)]*\)[\s\S]{0,200}?call(?:<[^>]+>)?\(\s*`?'?(\/api\/[^`'?$]+(?:\$\{[^}]+\}[^`'?$]*)*)/g)].map((m) => ({ name: m[1], path: m[2]! }));

  it('found the client calls', () => {
    expect(calls.length).toBeGreaterThanOrEqual(22);
  });

  for (const { name, path } of calls) {
    it(`${name} → ${path}`, async () => {
      const s = setup();
      const url = path.replace(/\$\{q \?.*$/, '').replace(/\$\{[^}]+\}/g, '00000000-0000-4000-8000-000000000000');
      const line = block.split('\n').find((l) => l.trimStart().startsWith(`${name}:`)) ?? '';
      const multiLine = !/call[<(]/.test(line);
      const method = /'PATCH'/.test(line) ? 'PATCH' : multiLine || /json\(|method: 'POST'/.test(line) ? 'POST' : 'GET';
      const res = await s.req(method, url, { as: s.admin, headers: { 'Idempotency-Key': 'contract-test-key-1' } });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      expect(body.error, `${method} ${url} has no server route`).not.toBe('no_route');
    });
  }
});
