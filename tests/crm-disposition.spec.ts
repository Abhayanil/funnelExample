import { createHmac, randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { buildQualifiedPayload } from './fixtures';
import { UUID_RE } from './helpers';

const SECRET = process.env.CRM_WEBHOOK_SECRET ?? process.env.N8N_WEBHOOK_SECRET ?? '';

function signature(raw: string): string {
  return `sha256=${createHmac('sha256', SECRET).update(raw, 'utf8').digest('hex')}`;
}

async function postDisposition(
  request: import('@playwright/test').APIRequestContext,
  body: Record<string, unknown>,
  signed = true
) {
  const raw = JSON.stringify(body);
  return request.post('/api/webhooks/crm-disposition', {
    data: raw,
    headers: {
      'content-type': 'application/json',
      ...(signed ? { 'x-lexhive-signature': signature(raw) } : {}),
    },
  });
}

test.describe('CRM disposition webhook', () => {
  test.skip(!SECRET, 'CRM_WEBHOOK_SECRET is not configured');

  test.beforeEach(async ({ request }) => {
    await request.post('/api/dev/reset');
  });

  test('rejects unsigned and mis-signed requests', async ({ request }) => {
    const unsigned = await postDisposition(
      request,
      { lead_id: randomUUID(), status: 'retained' },
      false
    );
    expect(unsigned.status()).toBe(401);
    expect((await unsigned.json()).error).toBe('invalid_signature');

    const raw = JSON.stringify({ lead_id: randomUUID(), status: 'retained' });
    const wrong = await request.post('/api/webhooks/crm-disposition', {
      data: raw,
      headers: {
        'content-type': 'application/json',
        'x-lexhive-signature': `sha256=${'0'.repeat(64)}`,
      },
    });
    expect(wrong.status()).toBe(401);
  });

  test('records consult_scheduled and emits an offline Schedule event', async ({ request }) => {
    const leadResponse = await request.post('/api/leads', { data: buildQualifiedPayload() });
    const lead = await leadResponse.json();

    const response = await postDisposition(request, {
      lead_id: lead.leadId,
      status: 'consult_scheduled',
      contract_value: 750,
      note: 'Consult booked for next Tuesday',
    });
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.leadId).toBe(lead.leadId);
    expect(body.disposition).toBe('consult_scheduled');
    expect(body.changed).toBe(true);
    expect(body.contractValue).toBe(750);
    expect(body.offlineCapi).toBe('skipped');
    expect(body.eventName).toBe('Schedule');
    expect(body.offlineEventId).toMatch(UUID_RE);

    const state = await request.get('/api/dev/state').then(res => res.json());
    const stored = state.memory.leads.find(
      (entry: { id: string }) => entry.id === lead.leadId
    );
    expect(stored.row.disposition).toBe('consult_scheduled');
    expect(stored.row.contract_value).toBe(750);
    expect(stored.row.offline_event_id).toBe(body.offlineEventId);

    const capi = state.audit.filter(
      (entry: { type: string; data: { eventId?: string } }) =>
        entry.type === 'capi' && entry.data.eventId === body.offlineEventId
    );
    expect(capi).toHaveLength(1);
    expect(capi[0].data.eventName).toBe('Schedule');
    expect(capi[0].data.offline).toBe(true);
  });

  test('retained emits CompleteRegistration and is idempotent on retry', async ({ request }) => {
    const leadResponse = await request.post('/api/leads', { data: buildQualifiedPayload() });
    const lead = await leadResponse.json();

    const first = await postDisposition(request, {
      lead_id: lead.leadId,
      status: 'retained',
    });
    expect(first.status()).toBe(200);
    const firstBody = await first.json();
    expect(firstBody.eventName).toBe('CompleteRegistration');
    expect(firstBody.contractValue).toBe(1000);
    expect(firstBody.offlineEventId).toMatch(UUID_RE);

    const second = await postDisposition(request, {
      lead_id: lead.leadId,
      status: 'retained',
    });
    expect(second.status()).toBe(200);
    const secondBody = await second.json();
    expect(secondBody.changed).toBe(false);
    expect(secondBody.offlineEventId).toBe(firstBody.offlineEventId);
  });

  test('disqualified records the outcome without a conversion event', async ({ request }) => {
    const leadResponse = await request.post('/api/leads', { data: buildQualifiedPayload() });
    const lead = await leadResponse.json();

    const response = await postDisposition(request, {
      lead_id: lead.leadId,
      status: 'disqualified',
      note: 'Did not meet duration requirement',
    });
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.offlineCapi).toBe('not_applicable');
    expect(body.offlineEventId).toBeNull();

    const state = await request.get('/api/dev/state').then(res => res.json());
    const stored = state.memory.leads.find(
      (entry: { id: string }) => entry.id === lead.leadId
    );
    expect(stored.row.disposition).toBe('disqualified');
    expect(stored.row.offline_event_id).toBeNull();
  });

  test('accepts submission_id and rejects unknown leads and malformed payloads', async ({
    request,
  }) => {
    const payload = buildQualifiedPayload();
    const leadResponse = await request.post('/api/leads', { data: payload });
    expect(leadResponse.status()).toBe(201);

    const bySubmission = await postDisposition(request, {
      submission_id: payload.submissionId,
      disposition: 'consult_scheduled',
    });
    expect(bySubmission.status()).toBe(200);
    expect((await bySubmission.json()).disposition).toBe('consult_scheduled');

    const missing = await postDisposition(request, {
      lead_id: randomUUID(),
      status: 'retained',
    });
    expect(missing.status()).toBe(404);

    const malformed = await postDisposition(request, { lead_id: payload.submissionId });
    expect(malformed.status()).toBe(422);
  });
});
