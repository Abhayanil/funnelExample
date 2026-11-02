import { expect, test } from '@playwright/test';
import {
  DISQUALIFIED_ANSWERS,
  QUALIFIED_ANSWERS,
  buildDisqualifiedPayload,
  buildPayload,
  buildQualifiedPayload,
} from './fixtures';
import { UUID_RE } from './helpers';

test.describe('Deterministic qualification rubric', () => {
  test('scores a strong claimant as qualified with the synthetic value', async () => {
    const { qualifyLead } = await import('../src/lib/leads/qualifier');

    const result = qualifyLead(QUALIFIED_ANSWERS);
    expect(result.tier).toBe('qualified');
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.value).toBe(250);
    expect(result.reasons).toEqual([]);

    // Pure and deterministic: the same answers always produce the same result.
    expect(qualifyLead(QUALIFIED_ANSWERS)).toEqual(result);
  });

  test('flags the common-plus branch as borderline with explanatory reasons', async () => {
    const { qualifyLead } = await import('../src/lib/leads/qualifier');

    const result = qualifyLead(buildPayload().answers);
    expect(result.tier).toBe('borderline');
    expect(result.value).toBe(100);
    expect(result.reasons).toContain('reduced_hours');
    expect(result.reasons).toContain('not_expecting_12_months');
  });

  test('hard disqualifiers override a high numeric score', async () => {
    const { qualifyLead } = await import('../src/lib/leads/qualifier');

    const overSga = qualifyLead(DISQUALIFIED_ANSWERS);
    expect(overSga.tier).toBe('disqualified');
    expect(overSga.value).toBe(0);
    expect(overSga.reasons).toContain('working_over_20_hours');

    const shortHistory = qualifyLead({
      ...QUALIFIED_ANSWERS,
      fiveyearwork: 'Less than 2 years',
      page_lyensr: 'Less than $2000',
    });
    expect(shortHistory.tier).toBe('disqualified');
    expect(shortHistory.reasons).toContain('insufficient_work_history');

    const represented = qualifyLead({
      ...QUALIFIED_ANSWERS,
      attorney: 'YES',
      attorneyfirm: 'Trajector Disability',
    });
    expect(represented.tier).toBe('disqualified');
    expect(represented.reasons).toContain('already_represented');

    const noEvidence = qualifyLead({
      ...QUALIFIED_ANSWERS,
      conditionstart: undefined as unknown as string,
      visit: 'NO',
      page_zbkz5e: "I haven't had one",
    });
    expect(noEvidence.tier).toBe('disqualified');
    expect(noEvidence.reasons).toContain('no_medical_evidence');
  });

  test('reports asset and duration risk signals without inventing hard stops', async () => {
    const { qualifyLead } = await import('../src/lib/leads/qualifier');

    const overAssets = qualifyLead({
      ...QUALIFIED_ANSWERS,
      page_lyensr: 'More than $2000',
    });
    expect(overAssets.reasons).toContain('assets_over_2000');
    expect(overAssets.tier).toBe('qualified');

    const recentCondition = qualifyLead({
      ...QUALIFIED_ANSWERS,
      conditionstart: '6 to 12 months ago',
    });
    expect(recentCondition.reasons).toContain('condition_under_12_months');
  });

  test('generates stable UUID event ids for server-only conversions', async () => {
    const { deterministicUuid } = await import('../src/lib/leads/qualifier');

    const first = deterministicUuid('qualified-lead:abc');
    expect(first).toBe(deterministicUuid('qualified-lead:abc'));
    expect(first).not.toBe(deterministicUuid('qualified-lead:def'));
    expect(first).toMatch(UUID_RE);
  });
});

test.describe('Qualification telemetry', () => {
  test.beforeEach(async ({ request }) => {
    await request.post('/api/dev/reset');
  });

  test('attaches tier, score and value to the Lead event and fires QualifiedLead', async ({
    request,
  }) => {
    const response = await request.post('/api/leads', { data: buildQualifiedPayload() });
    expect(response.status()).toBe(201);

    const body = await response.json();
    expect(body.qualification.tier).toBe('qualified');
    expect(body.qualification.value).toBe(250);
    expect(body.downstream.qualifiedLead).toBe('skipped');

    const state = await request.get('/api/dev/state').then(res => res.json());
    expect(state.memory.leads[0].row.qualification_tier).toBe('qualified');
    expect(state.memory.leads[0].row.qualification_score).toBeGreaterThanOrEqual(70);
    expect(state.memory.leads[0].row.qualification_reasons).toEqual([]);

    const capi = state.audit.filter(
      (entry: { type: string; data: { leadId?: string } }) =>
        entry.type === 'capi' && entry.data.leadId === body.leadId
    );
    const names = capi.map((entry: { data: { eventName: string } }) => entry.data.eventName);
    expect(names).toContain('Lead');
    expect(names).toContain('QualifiedLead');

    const qualified = capi.find(
      (entry: { data: { eventName: string } }) => entry.data.eventName === 'QualifiedLead'
    );
    expect(qualified.data.value).toBe(250);
    expect(qualified.data.qualificationTier).toBe('qualified');
  });

  test('does not fire QualifiedLead for a disqualified submission', async ({ request }) => {
    const response = await request.post('/api/leads', { data: buildDisqualifiedPayload() });
    expect(response.status()).toBe(201);

    const body = await response.json();
    expect(body.qualification.tier).toBe('disqualified');
    expect(body.qualification.value).toBe(0);
    expect(body.downstream.qualifiedLead).toBe('not_qualified');

    const state = await request.get('/api/dev/state').then(res => res.json());
    expect(state.memory.leads[0].row.qualification_tier).toBe('disqualified');
    expect(state.memory.leads[0].row.qualification_reasons).toContain(
      'working_over_20_hours'
    );

    const capi = state.audit.filter(
      (entry: { type: string; data: { leadId?: string } }) =>
        entry.type === 'capi' && entry.data.leadId === body.leadId
    );
    const names = capi.map((entry: { data: { eventName: string } }) => entry.data.eventName);
    expect(names).toEqual(['Lead']);
  });
});
