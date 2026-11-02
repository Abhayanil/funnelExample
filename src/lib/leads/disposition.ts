import { env } from '@/lib/env';
import { recordAudit } from '@/lib/dev/audit';
import { sendCapiEvent } from '@/lib/meta/capi';
import { enqueueDeadLetter } from '@/lib/ops/dead-letter';
import { deterministicUuid } from './qualifier';
import { getLeadStore } from './store';
import type { DispositionStatus, LeadRow } from './types';

export interface CrmDispositionInput {
  leadId?: string;
  submissionId?: string;
  disposition: DispositionStatus;
  contractValue?: number | null;
  note?: string | null;
}

interface OfflineEvent {
  eventName: 'Schedule' | 'CompleteRegistration';
  defaultValue: number;
}

/**
 * CRM dispositions map onto Meta's offline conversion events:
 *   consult_scheduled -> Schedule
 *   retained          -> CompleteRegistration
 *   disqualified      -> no conversion event (record only)
 */
const OFFLINE_EVENTS: Partial<Record<DispositionStatus, OfflineEvent>> = {
  consult_scheduled: { eventName: 'Schedule', defaultValue: 250 },
  retained: { eventName: 'CompleteRegistration', defaultValue: 1000 },
};

function metaString(row: LeadRow, key: 'fbp' | 'fbc'): string | undefined {
  const value = row.meta?.[key];
  return typeof value === 'string' ? value : undefined;
}

function eventSourceUrl(row: LeadRow): string {
  const landingUrl = row.attribution?.landingUrl;
  return typeof landingUrl === 'string' ? landingUrl : `${env.appUrl}/`;
}

export interface CrmDispositionResult {
  status: number;
  body: Record<string, unknown>;
}

export async function applyCrmDisposition(
  input: CrmDispositionInput
): Promise<CrmDispositionResult> {
  const store = getLeadStore();
  const identifier = { leadId: input.leadId, submissionId: input.submissionId };

  let existing;
  try {
    existing = await store.getLead(identifier);
  } catch (error) {
    return {
      status: 503,
      body: {
        ok: false,
        error: 'lookup_unavailable',
        retryable: true,
        message: (error as Error).message,
      },
    };
  }

  if (!existing) {
    return { status: 404, body: { ok: false, error: 'lead_not_found' } };
  }

  const offline = OFFLINE_EVENTS[input.disposition];
  const contractValue =
    input.contractValue === undefined || input.contractValue === null
      ? (offline?.defaultValue ?? null)
      : input.contractValue;

  const offlineEventId = offline
    ? deterministicUuid(`crm:${existing.id}:${input.disposition}`)
    : null;

  let saved;
  try {
    saved = await store.saveDisposition({
      leadId: existing.id,
      disposition: input.disposition,
      contractValue,
      offlineEventId,
    });
  } catch (error) {
    return {
      status: 503,
      body: {
        ok: false,
        error: 'persistence_unavailable',
        retryable: true,
        message: (error as Error).message,
      },
    };
  }

  if (!saved) {
    return { status: 404, body: { ok: false, error: 'lead_not_found' } };
  }

  recordAudit('webhook', {
    leadId: saved.lead.id,
    submissionId: saved.lead.row.submission_id,
    disposition: input.disposition,
    previousDisposition: saved.previousDisposition,
    changed: saved.changed,
    note: input.note ?? null,
  });

  if (!offline) {
    return {
      status: 200,
      body: {
        ok: true,
        leadId: saved.lead.id,
        disposition: input.disposition,
        previousDisposition: saved.previousDisposition,
        changed: saved.changed,
        contractValue,
        offlineCapi: 'not_applicable',
        offlineEventId: null,
        eventName: null,
      },
    };
  }

  const row = saved.lead.row;
  const result = await sendCapiEvent({
    eventName: offline.eventName,
    eventId: offlineEventId!,
    eventSourceUrl: eventSourceUrl(row),
    actionSource: 'system_generated',
    user: {
      email: row.email,
      phone: row.phone_e164,
      firstName: row.first_name,
      lastName: row.last_name,
      externalId: row.session_id,
      fbp: metaString(row, 'fbp'),
      fbc: metaString(row, 'fbc'),
      country: 'us',
    },
    customData: {
      content_name: 'CRM disposition',
      content_category: 'ssd_offline_conversion',
      lead_id: saved.lead.id,
      disposition: input.disposition,
      qualification_tier: row.qualification_tier,
      contract_value: contractValue,
      value: contractValue ?? offline.defaultValue,
      currency: 'USD',
      offline_event_id: offlineEventId,
    },
  });

  recordAudit('capi', {
    eventId: offlineEventId,
    eventName: offline.eventName,
    leadId: saved.lead.id,
    disposition: input.disposition,
    value: contractValue,
    offline: true,
    ok: result.ok,
    skipped: Boolean(result.skipped),
    attempts: result.attempts,
  });

  if (!result.ok && !result.skipped) {
    await enqueueDeadLetter({
      source: 'meta_capi',
      dedupeKey: `meta:${offlineEventId}`,
      payload: {
        eventId: offlineEventId,
        eventName: offline.eventName,
        leadId: saved.lead.id,
        disposition: input.disposition,
        eventSourceUrl: eventSourceUrl(row),
      },
      error: result.error ?? 'unknown Meta CAPI error',
      attempts: result.attempts,
      status: result.status,
    });
  }

  return {
    status: 200,
    body: {
      ok: true,
      leadId: saved.lead.id,
      disposition: input.disposition,
      previousDisposition: saved.previousDisposition,
      changed: saved.changed,
      contractValue,
      offlineCapi: result.skipped ? 'skipped' : result.ok ? 'sent' : 'failed',
      offlineEventId,
      eventName: offline.eventName,
    },
  };
}
