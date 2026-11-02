#!/usr/bin/env node
/**
 * Replays unresolved dead-letter rows.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   N8N_WEBHOOK_URL=... N8N_WEBHOOK_SECRET=... \
 *   node scripts/dlq-replay.mjs [--limit 25] [--dry-run]
 *
 * Only `n8n_webhook` entries can be replayed safely: the stored payload is the
 * exact automation body. `meta_capi` entries never contain raw PII (the CAPI
 * payload is hashed in flight), so they are reported for manual review rather
 * than replayed — replay those through the Meta Events Manager or by
 * re-sending the originating event from the app.
 */
import { createHmac } from 'node:crypto';

const args = process.argv.slice(2);
const limitArg = args.indexOf('--limit');
const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : 25;
const dryRun = args.includes('--dry-run');

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  N8N_WEBHOOK_URL,
  N8N_WEBHOOK_SECRET = '',
  N8N_WEBHOOK_TIMEOUT_MS = '10000',
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const headers = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  'content-type': 'application/json',
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function supabase(path, init = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers ?? {}) },
  });
  if (!response.ok) {
    throw new Error(`Supabase ${response.status}: ${(await response.text()).slice(0, 500)}`);
  }
  return response.status === 204 ? null : response.json();
}

async function postWithRetry(url, body, extraHeaders = {}) {
  const attempts = 3;
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...extraHeaders },
        body,
        signal: AbortSignal.timeout(Number(N8N_WEBHOOK_TIMEOUT_MS)),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
      }
      return attempt;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(250 * 2 ** (attempt - 1));
    }
  }

  throw lastError;
}

const rows = await supabase(
  `dead_letter_queue?resolved=eq.false&order=created_at.asc&limit=${limit}`
);

console.log(`Found ${rows.length} unresolved dead letter(s).`);

let replayed = 0;
let skipped = 0;
let failed = 0;

for (const row of rows) {
  const label = `${row.source} ${row.dedupe_key}`;

  if (row.source !== 'n8n_webhook') {
    console.log(`- SKIP ${label} (manual replay required)`);
    skipped += 1;
    continue;
  }

  if (!N8N_WEBHOOK_URL) {
    console.log(`- SKIP ${label} (N8N_WEBHOOK_URL is not set)`);
    skipped += 1;
    continue;
  }

  const body = JSON.stringify(row.payload);
  const signature = N8N_WEBHOOK_SECRET
    ? `sha256=${createHmac('sha256', N8N_WEBHOOK_SECRET).update(body, 'utf8').digest('hex')}`
    : '';

  if (dryRun) {
    console.log(`- DRY RUN ${label}`);
    continue;
  }

  try {
    const attempts = await postWithRetry(N8N_WEBHOOK_URL, body, {
      'x-lexhive-signature': signature,
      'x-lexhive-delivery': `replay:${row.id}`,
    });

    await supabase(`dead_letter_queue?id=eq.${row.id}`, {
      method: 'PATCH',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify({ resolved: true, resolved_at: new Date().toISOString() }),
    });

    console.log(`- OK ${label} (attempt ${attempts})`);
    replayed += 1;
  } catch (error) {
    console.log(`- FAIL ${label}: ${error.message}`);
    failed += 1;
  }
}

console.log(`\nReplayed ${replayed}, skipped ${skipped}, failed ${failed}.`);
process.exit(failed > 0 ? 1 : 0);
