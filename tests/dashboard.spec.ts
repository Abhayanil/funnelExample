import { randomUUID } from 'node:crypto';
import { expect, request as apiRequest, test } from '@playwright/test';
import { buildPayload } from './fixtures';

/**
 * The dashboard is gated by HTTP Basic auth (src/proxy.ts). These tests verify
 * both sides of that boundary: anonymous callers get a challenge and 401, while
 * an authenticated session sees the aggregated lead/journey data.
 *
 * Credentials come from `.env.local` (loaded in playwright.config.ts) or CI.
 * Without a password the dashboard is intentionally open in local development,
 * so the auth assertions are skipped rather than failing.
 */

const USER = process.env.DASHBOARD_USER ?? 'admin';
const PASSWORD = process.env.DASHBOARD_PASSWORD ?? '';

test.describe('Dashboard auth boundary', () => {
  test.skip(!PASSWORD, 'DASHBOARD_PASSWORD is not configured');

  test('protects /dashboard and leaves the public funnel open', async ({ baseURL }) => {
    const anonymous = await apiRequest.newContext({ baseURL });

    try {
      const dashboard = await anonymous.get('/dashboard');
      expect(dashboard.status()).toBe(401);
      expect(dashboard.headers()['www-authenticate']).toContain('Basic');

      const funnel = await anonymous.get('/');
      expect(funnel.status()).toBe(200);
    } finally {
      await anonymous.dispose();
    }
  });

  test('rejects a wrong password', async ({ baseURL }) => {
    const context = await apiRequest.newContext({
      baseURL,
      httpCredentials: { username: USER, password: `${PASSWORD}-wrong` },
    });

    try {
      const dashboard = await context.get('/dashboard');
      expect(dashboard.status()).toBe(401);
    } finally {
      await context.dispose();
    }
  });
});

test.describe('Analytics dashboard', () => {
  test.skip(!PASSWORD, 'DASHBOARD_PASSWORD is not configured');

  // Browser pages and API requests in this block use the dashboard credentials.
  test.use({ httpCredentials: { username: USER, password: PASSWORD } });

  test.beforeEach(async ({ request }) => {
    await request.post('/api/dev/reset');
  });

  test('shows lead KPIs, journey reach, answers and masked contact details', async ({
    page,
    request,
  }) => {
    const payload = buildPayload();
    const sessionId = payload.sessionId;

    const leadResponse = await request.post('/api/leads', { data: payload });
    expect(leadResponse.status()).toBe(201);

    // One session that starts the funnel and answers the first three questions.
    const beacons = [
      { eventName: 'InitiateCheckout', stepId: 'start', stepIndex: 0 },
      { eventName: 'FunnelStepComplete', stepId: 'start', stepIndex: 0 },
      { eventName: 'FunnelStepComplete', stepId: 'receiving_ben', stepIndex: 1 },
      { eventName: 'FunnelStepComplete', stepId: 'page_sm72h5', stepIndex: 2 },
    ];

    for (const beacon of beacons) {
      const response = await request.post('/api/telemetry', {
        data: {
          ...beacon,
          eventId: randomUUID(),
          sessionId,
          eventSourceUrl: 'http://127.0.0.1:3100/',
          customData: {},
          user: {},
        },
      });
      expect(response.status()).toBe(200);
    }

    await page.goto('/dashboard?range=7');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Lead analytics');

    await expect(page.getByTestId('kpi-leads')).toHaveText('1');
    await expect(page.getByTestId('kpi-sessions')).toHaveText('1');
    await expect(page.getByTestId('kpi-conversion')).toHaveText('100%');
    await expect(page.getByTestId('kpi-events')).toHaveText('5');

    // InitiateCheckout counts as reaching `start`; the lead itself counts `contact`.
    const stepRows = page.locator('[data-testid="steps-panel"] tbody tr');
    await expect(stepRows).toHaveCount(4);
    await expect(page.getByTestId('steps-panel')).toContainText('Are You 40 Years or Older?');
    await expect(page.getByTestId('steps-panel')).toContainText('page_sm72h5');

    // Answer mix and attribution are derived from the captured lead.
    await expect(page.getByTestId('answers-panel').locator('article').first()).toBeVisible();
    await expect(page.getByTestId('sources-panel')).toContainText('playwright');

    const recent = page.getByTestId('recent-panel');
    await expect(recent).toContainText('Jordan Rivera');
    await expect(recent).toContainText('50-54');
    await expect(recent).toContainText('Single');

    // Contact details are masked in the UI; the full values never render.
    await expect(recent).toContainText('j******@example.com');
    await expect(recent).toContainText('••• ••• 4567');
    await expect(recent).not.toContainText('jordan.rivera@example.com');
    await expect(recent).not.toContainText('5551234567');
  });

  test('supports the 30-day range tab', async ({ page }) => {
    await page.goto('/dashboard?range=30');

    await expect(page.getByRole('link', { name: '30d' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    await expect(page.getByTestId('trend-panel')).toBeVisible();
  });
});
