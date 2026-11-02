import { expect, test } from '@playwright/test';
import { choose, fillContact, walkToContact, walkToEmail } from './helpers';

test.describe('Funnel flow', () => {
  test.beforeEach(async ({ page, request }) => {
    await request.post('/api/dev/reset');
    await page.goto('/');
    await expect(page.getByTestId('funnel')).toBeVisible();
    await expect(page.getByTestId('option-YES')).toBeVisible();
  });

  test('walks the shortest branch and captures a lead', async ({ page, request }) => {
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');

    await walkToContact(page);

    await fillContact(page);
    await page.getByTestId('contact-submit').click();

    await expect(page.getByRole('heading', { level: 1 })).toContainText('you');
    await expect(page.getByTestId('lead-reference')).toBeVisible();

    const state = await request.get('/api/dev/state').then(response => response.json());
    expect(state.memory.leads).toHaveLength(1);

    const [lead] = state.memory.leads;
    expect(lead.row.email).toBe('jordan.rivera@example.com');
    expect(lead.row.phone_e164).toBe('+15551234567');
    expect(lead.row.age_range).toBe('50-54');
    expect(lead.row.marital_status).toBe('Single');
    expect(lead.row.expects_out_of_work).toBe(false);
    expect(lead.consent.version).toBe('tcpa-2026-11');
  });

  test('follows the state-dependent condition-start branch', async ({ page }) => {
    await choose(page, 'YES');
    await choose(page, 'I am not receiving any disability benefits (SSD or SSI)');
    await choose(page, 'Not working');
    await choose(page, 'More than 12 months ago');
    await choose(page, 'More than 6 years');

    // outofwork YES normally goes to `visit`; with "Not working" stored it branches.
    await choose(page, 'YES');

    await expect(page.getByTestId('option-Within the last 6 months')).toBeVisible();
    await expect(page.locator('[data-step-heading]')).toContainText('condition start');

    await choose(page, 'More than 1 year ago');
    await expect(page.getByTestId('option-YES')).toBeVisible();
    await expect(page.locator('[data-step-heading]')).toContainText('seeing a doctor');
  });

  test('validates contact fields before calling the API', async ({ page, request }) => {
    await walkToContact(page);

    await page.getByTestId('contact-submit').click();

    await expect(page.getByText('Enter at least 2 characters').first()).toBeVisible();
    await expect(page.getByText('Enter a 10-digit phone number')).toBeVisible();
    await expect(page.getByText('You must agree to be contacted before continuing')).toBeVisible();
    await expect(page.getByTestId('input-firstName')).toHaveAttribute('aria-invalid', 'true');

    const state = await request.get('/api/dev/state').then(response => response.json());
    expect(state.memory.leads).toHaveLength(0);
  });

  test('recovers the session and progress after a reload', async ({ page }) => {
    await choose(page, 'YES');
    await choose(page, 'Supplemental Security Income (SSI) Benefits');

    await page.reload();

    await expect(page.locator('[data-step-heading]')).toContainText('hours per week');
    await expect(page.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow', '0');
  });

  test('exposes an accessible radio group and progressbar', async ({ page }) => {
    const group = page.getByRole('group', { name: /are you 40 years or older/i });
    await expect(group).toBeVisible();

    const radios = group.getByRole('radio');
    await expect(radios).toHaveCount(2);
    await expect(radios.first()).toHaveAccessibleName(/yes/i);
    await expect(radios.last()).toHaveAccessibleName(/no/i);

    const progressbar = page.getByRole('progressbar', { name: /funnel progress/i });
    await expect(progressbar).toBeVisible();
    await expect(progressbar).toHaveAttribute('aria-valuemin', '0');
    await expect(progressbar).toHaveAttribute('aria-valuemax', '100');
    await expect(progressbar).toHaveAttribute('aria-valuenow', '0');

    // Selecting an option is the interaction: the choice is announced and the
    // funnel advances (radios are an implementation detail of the option card).
    await radios.first().click();
    await expect(page.locator('[data-step-heading]')).toContainText('disability benefits');
    await expect(page.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow', '0');
  });

  test('back navigation restores the previous question', async ({ page }) => {
    await choose(page, 'YES');
    await expect(page.locator('[data-step-heading]')).toContainText('disability benefits');

    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.locator('[data-step-heading]')).toContainText('40 Years or Older');

    // The previous answer is preserved so the user can see what they picked...
    await expect(page.getByTestId('option-YES').getByRole('radio')).toBeChecked();

    // ...and re-selecting the same answer still advances (the radio is already
    // checked, so this exercises the click path rather than `change`).
    await page.getByTestId('option-YES').getByRole('radio').click();
    await expect(page.locator('[data-step-heading]')).toContainText('disability benefits');

    // Changing the branch is possible too.
    await page.getByRole('button', { name: 'Back' }).click();
    await choose(page, 'NO');
    await expect(page.locator('[data-step-heading]')).toContainText('disability benefits');
  });
});

test.describe('Lead API', () => {
  test.beforeEach(async ({ request }) => {
    await request.post('/api/dev/reset');
  });

  test('is idempotent on submission_id', async ({ request }) => {
    const { buildPayload } = await import('./fixtures');
    const payload = buildPayload();

    const first = await request.post('/api/leads', { data: payload });
    expect(first.status()).toBe(201);
    const firstBody = await first.json();
    expect(firstBody.duplicate).toBe(false);

    const second = await request.post('/api/leads', { data: payload });
    expect(second.status()).toBe(200);
    const secondBody = await second.json();
    expect(secondBody.duplicate).toBe(true);
    expect(secondBody.leadId).toBe(firstBody.leadId);

    const state = await request.get('/api/dev/state').then(response => response.json());
    expect(state.memory.leads).toHaveLength(1);
  });

  test('rejects invalid submissions', async ({ request }) => {
    const { buildPayload } = await import('./fixtures');

    const badPhone = buildPayload({ phone: '123' });
    expect((await request.post('/api/leads', { data: badPhone })).status()).toBe(422);

    const noConsent = buildPayload();
    // @ts-expect-error deliberately invalid at runtime
    delete noConsent.consent;
    expect((await request.post('/api/leads', { data: noConsent })).status()).toBe(422);
  });

  test('retries with backoff and succeeds', async ({ request }) => {
    const response = await request.post('/api/dev/retry', { data: { failures: 2 } });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.calls).toBe(3);
  });

  test('writes to the dead-letter queue after exhausting retries', async ({ request }) => {
    const response = await request.post('/api/dev/retry', { data: { failures: 5 } });
    expect(response.status()).toBe(502);

    const state = await request.get('/api/dev/state').then(res => res.json());
    expect(state.memory.deadLetters.length).toBeGreaterThan(0);
    expect(state.audit.some((entry: { type: string }) => entry.type === 'dlq')).toBe(true);
  });
});

test.describe('Email capture step', () => {
  test.beforeEach(async ({ page, request }) => {
    await request.post('/api/dev/reset');
    await page.goto('/');
  });

  test('rejects malformed email then advances', async ({ page }) => {
    await walkToEmail(page);
    await page.getByTestId('input-email').fill('not-an-email');
    await page.getByTestId('email-submit').click();
    await expect(page.getByText('Enter a valid email address')).toBeVisible();

    await page.getByTestId('input-email').fill('person@example.com');
    await page.getByTestId('email-submit').click();
    await expect(page.getByTestId('input-firstName')).toBeVisible();
  });
});
