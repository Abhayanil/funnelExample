import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { env } from '@/lib/env';
import { applyCrmDisposition } from '@/lib/leads/disposition';
import { hmacSha256 } from '@/lib/meta/hash';
import { DISPOSITIONS } from '@/lib/leads/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const dispositionSchema = z.enum(DISPOSITIONS);

const crmDispositionSchema = z
  .object({
    lead_id: z.string().uuid().optional(),
    leadId: z.string().uuid().optional(),
    submission_id: z.string().uuid().optional(),
    submissionId: z.string().uuid().optional(),
    status: dispositionSchema.optional(),
    disposition: dispositionSchema.optional(),
    contract_value: z.coerce.number().nonnegative().max(10_000_000).optional(),
    contractValue: z.coerce.number().nonnegative().max(10_000_000).optional(),
    note: z.string().max(500).optional(),
  })
  .refine(
    value => Boolean(value.lead_id ?? value.leadId ?? value.submission_id ?? value.submissionId),
    { message: 'lead_id or submission_id is required' }
  )
  .refine(value => Boolean(value.status ?? value.disposition), {
    message: 'status or disposition is required',
  });

function validSignature(raw: string, header: string, secret: string): boolean {
  const provided = header.replace(/^sha256=/, '').trim();
  if (!provided) return false;

  const expected = hmacSha256(raw, secret);
  const providedBytes = Buffer.from(provided, 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');

  return (
    providedBytes.length === expectedBytes.length &&
    timingSafeEqual(providedBytes, expectedBytes)
  );
}

/**
 * Closed-loop CRM feedback endpoint.
 *
 * Airtable / the CRM posts a disposition after a consult or retainer decision.
 * The request must be signed with HMAC-SHA256 over the raw body, using
 * CRM_WEBHOOK_SECRET (N8N_WEBHOOK_SECRET is accepted as a POC fallback).
 *
 * Body:
 *   { lead_id | submission_id, status | disposition, contract_value?, note? }
 *
 * Side effects: update the lead in Supabase and emit a Meta offline conversion
 * (`Schedule` for consult_scheduled, `CompleteRegistration` for retained).
 * `disqualified` records the disposition without a conversion event.
 */
export async function POST(request: Request) {
  if (!env.crmWebhookSecret) {
    return Response.json(
      { ok: false, error: 'webhook_not_configured' },
      { status: 503 }
    );
  }

  const raw = await request.text();
  const signature =
    request.headers.get('x-lexhive-signature') ??
    request.headers.get('x-crm-signature') ??
    '';

  if (!validSignature(raw, signature, env.crmWebhookSecret)) {
    return Response.json({ ok: false, error: 'invalid_signature' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const parsed = crmDispositionSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: 'invalid_payload', issues: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const value = parsed.data;
  const result = await applyCrmDisposition({
    leadId: value.lead_id ?? value.leadId,
    submissionId: value.submission_id ?? value.submissionId,
    disposition: (value.status ?? value.disposition)!,
    contractValue: value.contract_value ?? value.contractValue,
    note: value.note,
  });

  return Response.json(result.body, { status: result.status });
}
