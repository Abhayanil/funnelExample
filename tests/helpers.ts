import { expect, type Page } from '@playwright/test';

export const SHORT_PATH: string[] = [
  'YES',
  'I am not receiving any disability benefits (SSD or SSI)',
  '20 hours or less per week',
  'Between 4 and 6 years',
  'NO',
  'YES',
  'NO',
  'Male',
  '50-54',
  'Single',
];

/** Clicks an option and waits for the next question to render. */
export async function choose(page: Page, label: string) {
  const heading = page.locator('[data-step-heading]');
  const before = await heading.innerText();

  await page.getByTestId(`option-${label}`).click();

  await page.waitForFunction(
    previous =>
      (document.querySelector('[data-step-heading]') as HTMLElement | null)?.innerText.trim() !==
      previous,
    before.trim(),
    { timeout: 5000 }
  );

  await expect(heading).toBeVisible();
}

/** Walks the deterministic shortest path from the landing page to the email step. */
export async function walkToEmail(page: Page) {
  for (const answer of SHORT_PATH) {
    await choose(page, answer);
  }
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('input-email')).toBeVisible();
}

export async function walkToContact(page: Page) {
  await walkToEmail(page);
  await page.getByTestId('input-email').fill('jordan.rivera@example.com');
  await page.getByTestId('email-submit').click();
  await expect(page.getByTestId('input-firstName')).toBeVisible();
}

export async function fillContact(
  page: Page,
  values: { firstName?: string; lastName?: string; phone?: string; consent?: boolean } = {}
) {
  await page.getByTestId('input-firstName').fill(values.firstName ?? 'Jordan');
  await page.getByTestId('input-lastName').fill(values.lastName ?? 'Rivera');
  await page.getByTestId('input-phone').fill(values.phone ?? '(555) 123-4567');
  if (values.consent !== false) {
    await page.getByTestId('input-consent').check();
  }
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
