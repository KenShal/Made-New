#!/usr/bin/env node
/**
 * Fails the build if anything that looks like a server secret ended up in the
 * browser bundle. Run after `npm run build`. This is a safety net; secrets are
 * kept out by design (only VITE_PUBLIC_* variables are exposed to the client).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST = process.argv[2] ?? 'dist';
const PATTERNS = [
  [/shpat_[a-f0-9]{16,}/i, 'Shopify Admin API access token'],
  [/shpss_[a-f0-9]{16,}/i, 'Shopify shared secret'],
  [/SUPABASE_SERVICE_ROLE_KEY|SHOPIFY_ADMIN_ACCESS_TOKEN|SHOPIFY_WEBHOOK_SECRET|PRINTFUL_API_TOKEN|PRINTIFY_API_TOKEN|SUPABASE_JWT_SECRET|CUSTOMER_REF_SALT/, 'server-only variable name'],
  [/sk_(live|test)_[A-Za-z0-9]{10,}/, 'Stripe secret key'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'],
  [/AKIA[0-9A-Z]{16}/, 'AWS access key'],
];

/** Supabase keys are JWTs; anon keys are public, service_role keys must never ship. */
function serviceRoleJwts(text) {
  const hits = [];
  for (const m of text.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.([A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g)) {
    try {
      const payload = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8'));
      if (payload.role === 'service_role') hits.push('Supabase service_role JWT');
    } catch { /* not a JWT */ }
  }
  if (/sb_secret_[A-Za-z0-9_-]{10,}/.test(text)) hits.push('Supabase secret API key');
  return hits;
}

const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
let files;
try {
  files = walk(DIST).filter((f) => /\.(js|mjs|css|html|map|json|txt)$/.test(f));
} catch {
  console.error(`No ${DIST}/ directory. Run the build first.`);
  process.exit(2);
}

const findings = [];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const [re, label] of PATTERNS) if (re.test(text)) findings.push(`${file}: ${label}`);
  for (const label of serviceRoleJwts(text)) findings.push(`${file}: ${label}`);
}

if (findings.length) {
  console.error('Possible secrets found in the client bundle:\n' + findings.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}
console.log(`Checked ${files.length} files in ${DIST}/: no secrets found.`);
