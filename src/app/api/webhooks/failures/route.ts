import { timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';
import { hmacSha256 } from '@/lib/meta/hash';
import { enqueueDeadLetter } from '@/lib/ops/dead-letter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface FailurePayload {
  source?: string;
  dedupe_key?: string;
  submission_id?: string;
  lead_id?: string;
  error?: string;
  attempts?: number;
  payload?: unknown;
}

/**
 * Callback used by n8n's error workflow (and available to other workers) to
 * persist a failed delivery in the dead-letter queue.
 */
export async function POST(request: Request) {
  const raw = await request.text();

  if (env.n8nWebhookSecret) {
    const header = request.headers.get('x-lexhive-signature') ?? '';
    const provided = header.replace(/^sha256=/, '');
    const expected = hmacSha256(raw, env.n8nWebhookSecret);
    const providedBytes = Buffer.from(provided, 'utf8');
    const expectedBytes = Buffer.from(expected, 'utf8');

    const valid =
      providedBytes.length === expectedBytes.length && timingSafeEqual(providedBytes, expectedBytes);

    if (!valid) {
      return Response.json({ ok: false, error: 'invalid_signature' }, { status: 401 });
    }
  }

  let body: FailurePayload;
  try {
    body = JSON.parse(raw) as FailurePayload;
  } catch {
    return Response.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  await enqueueDeadLetter({
    source: body.source === 'meta_capi' ? 'meta_capi' : 'n8n_webhook',
    dedupeKey:
      body.dedupe_key ??
      `${body.source ?? 'n8n'}:${body.submission_id ?? body.lead_id ?? 'unknown'}`,
    payload: body.payload ?? body,
    error: body.error ?? 'reported by n8n error workflow',
    attempts: body.attempts ?? 1,
  });

  return Response.json({ ok: true, queued: true }, { status: 202 });
}
