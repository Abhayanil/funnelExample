import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { fillContact, UUID_RE, walkToContact } from './helpers';

const PIXEL_STUB = () => {
  const w = window as unknown as Record<string, unknown>;
  const calls: unknown[][] = [];
  w.__fbqCalls = calls;

  const fbq = (...args: unknown[]) => {
    calls.push(JSON.parse(JSON.stringify(args)) as unknown[]);
  };
  Object.assign(fbq, { queue: [], loaded: true, version: '2.0' });
  w.fbq = fbq;
};

test.describe('Dual-layer Meta telemetry', () => {
  test.beforeEach(async ({ page, request }) => {
    await request.post('/api/dev/reset');
    await page.addInitScript(PIXEL_STUB);
    await page.goto('/');
    await expect(page.getByTestId('option-YES')).toBeVisible();
  });

  test('fires InitiateCheckout, step completions and Lead on both layers with one event_id', async ({
    page,
    request,
  }) => {
    await walkToContact(page);
    await fillContact(page);
    await page.getByTestId('contact-submit').click();
    await expect(page.getByTestId('lead-reference')).toBeVisible();

    // Browser-side Pixel events
    const pixelCalls = await page.evaluate(
      () => (window as unknown as { __fbqCalls: unknown[][] }).__fbqCalls
    );
    const pixelNames = pixelCalls.map(call => call[1]);
    expect(pixelNames).toContain('InitiateCheckout');
    expect(pixelNames).toContain('Lead');
    expect(pixelNames.filter(name => name === 'FunnelStepComplete').length).toBeGreaterThanOrEqual(10);

    const pixelLead = pixelCalls.find(call => call[1] === 'Lead');
    expect(pixelLead).toBeTruthy();
    const pixelOptions = pixelLead?.[3] as { eventID: string };
    expect(pixelOptions.eventID).toMatch(UUID_RE);

    // The same event id must exist on the server (CAPI side).
    const state = await request.get('/api/dev/state').then(response => response.json());

    const capiForLead = state.audit.filter(
      (entry: { type: string; data: { eventId?: string; eventName?: string } }) =>
        entry.type === 'capi' && entry.data.eventId === pixelOptions.eventID
    );
    expect(capiForLead).toHaveLength(1);
    expect(capiForLead[0].data.eventName).toBe('Lead');

    // The lead row carries the same event id used by the Pixel.
    expect(state.memory.leads[0].row.lead_event_id).toBe(pixelOptions.eventID);

    // Every browser event id should also be known to the server.
    const browserEvents = await page.evaluate(
      () =>
        (
          window as unknown as { __LEXHIVE_EVENTS__: Array<{ eventId: string; eventName: string }> }
        ).__LEXHIVE_EVENTS__
    );
    const serverEventIds = new Set(state.memory.events.map((event: { eventId: string }) => event.eventId));

    const stepEvents = browserEvents.filter(event => event.eventName === 'FunnelStepComplete');
    expect(stepEvents.length).toBeGreaterThanOrEqual(10);
    expect(stepEvents.every(event => serverEventIds.has(event.eventId))).toBe(true);
  });

  test('hashes user data with SHA-256 and normalizes to E.164 before CAPI', async ({ request }) => {
    const { buildCapiPayload } = await import('../src/lib/meta/capi');
    const { toE164 } = await import('../src/lib/meta/hash');
    const { createHash } = await import('node:crypto');

    expect(toE164('(555) 123-4567')).toBe('+15551234567');

    const payload = buildCapiPayload({
      eventName: 'Lead',
      eventId: randomUUID(),
      eventSourceUrl: 'https://example.com/',
      user: {
        email: '  Jordan.Rivera@Example.COM ',
        phone: '(555) 123-4567',
        firstName: 'Jordan',
        lastName: "O'Rivera",
        clientIp: '203.0.113.10',
        userAgent: 'Playwright',
      },
      customData: { value: 1, currency: 'USD' },
    });

    const userData = (payload.data as Array<{ user_data: Record<string, unknown> }>)[0].user_data;
    expect(userData.em).toEqual([createHash('sha256').update('jordan.rivera@example.com').digest('hex')]);
    expect(userData.ph).toEqual([createHash('sha256').update('15551234567').digest('hex')]);
    expect(userData.fn).toEqual([createHash('sha256').update('jordan').digest('hex')]);
    expect(userData.ln).toEqual([createHash('sha256').update('orivera').digest('hex')]);
    expect(userData.client_ip_address).toBe('203.0.113.10');
    expect(userData.client_user_agent).toBe('Playwright');

    // Raw PII must never appear in the outbound payload.
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain('jordan.rivera@example.com');
    expect(serialized).not.toContain('+15551234567');
  });

  test('deduplicates identical event ids server-side', async ({ request }) => {
    const eventId = randomUUID();
    const sessionId = randomUUID();

    const body = {
      eventName: 'FunnelStepComplete',
      eventId,
      sessionId,
      stepId: 'page_sm72h5',
      stepIndex: 2,
      eventSourceUrl: 'http://127.0.0.1:3100/',
      customData: { answer: 'Not working' },
      user: {},
    };

    const first = await request.post('/api/telemetry', { data: body });
    expect(first.status()).toBe(200);
    expect((await first.json()).duplicate).toBe(false);

    const second = await request.post('/api/telemetry', { data: body });
    expect(second.status()).toBe(200);
    expect((await second.json()).duplicate).toBe(true);

    const state = await request.get('/api/dev/state').then(response => response.json());
    const capiEntries = state.audit.filter(
      (entry: { type: string; data: { eventId?: string } }) =>
        entry.type === 'capi' && entry.data.eventId === eventId
    );
    expect(capiEntries).toHaveLength(1);
  });

  test('rejects malformed telemetry payloads', async ({ request }) => {
    const response = await request.post('/api/telemetry', {
      data: { eventName: 'NotARealEvent', eventId: 'nope' },
    });
    expect(response.status()).toBe(422);
  });
});
