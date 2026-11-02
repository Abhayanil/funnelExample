import { env } from '@/lib/env';
import { recordAudit } from '@/lib/dev/audit';
import { sendCapiEvent, type CapiResult } from '@/lib/meta/capi';
import { toE164 } from '@/lib/meta/hash';
import { enqueueDeadLetter } from '@/lib/ops/dead-letter';
import { pushToAutomation } from './automation';
import { deterministicUuid, QUALIFICATION_VALUES, type QualificationResult } from './qualifier';
import type { LeadSubmission } from './schema';
import { getLeadStore } from './store';
import { buildLeadRow, type ConsentRow, type LeadRow, type RequestContext } from './types';

export interface SubmitLeadResult {
  status: number;
  body: Record<string, unknown>;
}

function qualificationFromRow(row: LeadRow): QualificationResult {
  const tier = row.qualification_tier ?? 'disqualified';
  return {
    tier,
    score: row.qualification_score ?? 0,
    reasons: row.qualification_reasons ?? [],
    value: QUALIFICATION_VALUES[tier],
  };
}

function qualificationBody(qualification: QualificationResult) {
  return {
    tier: qualification.tier,
    score: qualification.score,
    reasons: qualification.reasons,
    value: qualification.value,
    currency: 'USD',
  };
}

/**
 * Sends a server-side conversion event. The `Lead` event reuses the browser
 * event id so Meta collapses the Pixel/CAPI pair; server-only events (such as
 * `QualifiedLead`) use a deterministic uuid so retries remain idempotent.
 */
async function sendConversionCapi(args: {
  eventName: 'Lead' | 'QualifiedLead';
  eventId: string;
  submission: LeadSubmission;
  phoneE164: string;
  leadId: string;
  context: RequestContext;
  qualification: QualificationResult;
}): Promise<CapiResult> {
  const { eventName, eventId, submission, phoneE164, leadId, context, qualification } = args;
  const eventSourceUrl =
    submission.consent.pageUrl ?? submission.attribution.landingUrl ?? `${env.appUrl}/`;

  const result = await sendCapiEvent({
    eventName,
    eventId,
    eventSourceUrl,
    user: {
      email: submission.contact.email,
      phone: phoneE164,
      firstName: submission.contact.firstName,
      lastName: submission.contact.lastName,
      externalId: submission.sessionId,
      fbp: submission.meta.fbp,
      fbc: submission.meta.fbc,
      clientIp: context.ip,
      userAgent: context.userAgent,
      country: 'us',
    },
    customData: {
      content_name: 'Disability benefits intake',
      content_category: 'ssd_qualification',
      funnel_version: submission.funnelVersion,
      lead_id: leadId,
      qualification_tier: qualification.tier,
      lead_quality: qualification.tier,
      qualification_score: qualification.score,
      qualification_reasons: qualification.reasons,
      value: qualification.value,
      currency: 'USD',
    },
  });

  recordAudit('capi', {
    eventId,
    eventName,
    leadId,
    qualificationTier: qualification.tier,
    value: qualification.value,
    ok: result.ok,
    skipped: Boolean(result.skipped),
    attempts: result.attempts,
  });

  if (!result.ok && !result.skipped) {
    await enqueueDeadLetter({
      source: 'meta_capi',
      dedupeKey: `meta:${eventId}`,
      payload: {
        eventId,
        eventName,
        leadId,
        eventSourceUrl,
      },
      error: result.error ?? 'unknown Meta CAPI error',
      attempts: result.attempts,
      status: result.status,
    });
  }

  return result;
}

export async function submitLead(
  submission: LeadSubmission,
  context: RequestContext
): Promise<SubmitLeadResult> {
  const store = getLeadStore();

  const phoneE164 = toE164(submission.contact.phone);
  if (!phoneE164) {
    return { status: 422, body: { ok: false, error: 'invalid_phone' } };
  }

  const row = buildLeadRow(submission, phoneE164);
  const qualification = qualificationFromRow(row);
  const consent: ConsentRow = {
    accepted: true,
    version: submission.consent.version,
    text: submission.consent.text,
    page_url: submission.consent.pageUrl ?? submission.attribution.landingUrl,
    ip: context.ip,
    user_agent: context.userAgent,
  };

  let saved: { leadId: string; duplicate: boolean };
  try {
    saved = await store.saveLead(row, consent);
  } catch (error) {
    await enqueueDeadLetter({
      source: 'supabase',
      dedupeKey: `lead:${submission.submissionId}`,
      payload: row,
      error: (error as Error).message,
      attempts: 1,
    });
    return {
      status: 503,
      body: { ok: false, error: 'persistence_unavailable', retryable: true },
    };
  }

  recordAudit('lead', {
    submissionId: submission.submissionId,
    sessionId: submission.sessionId,
    leadId: saved.leadId,
    duplicate: saved.duplicate,
    qualificationTier: qualification.tier,
    qualificationScore: qualification.score,
  });
  recordAudit('consent', {
    leadId: saved.leadId,
    version: consent.version,
    ip: context.ip,
    userAgent: context.userAgent,
  });

  if (saved.duplicate) {
    const existing = await store
      .getLead({ submissionId: submission.submissionId })
      .catch(() => null);
    const storedQualification = existing ? qualificationFromRow(existing.row) : qualification;

    return {
      status: 200,
      body: {
        ok: true,
        leadId: saved.leadId,
        duplicate: true,
        qualification: qualificationBody(storedQualification),
        downstream: { capi: 'skipped', qualifiedLead: 'skipped', n8n: 'skipped' },
      },
    };
  }

  // Deduplicate the server event on event_id before calling Meta.
  let alreadyLogged = false;
  try {
    const logged = await store.logEvent({
      eventId: submission.eventId,
      eventName: 'Lead',
      sessionId: submission.sessionId,
      stepId: 'contact',
      source: 'capi',
      payload: { leadId: saved.leadId, qualification },
    });
    alreadyLogged = logged.duplicate;
  } catch (error) {
    console.error('[lexhive] telemetry log failed for Lead event', error);
  }

  const capi = alreadyLogged
    ? ({ ok: false, skipped: true, attempts: 0, error: 'duplicate_event' } as const)
    : await sendConversionCapi({
        eventName: 'Lead',
        eventId: submission.eventId,
        submission,
        phoneE164,
        leadId: saved.leadId,
        context,
        qualification,
      });

  // Qualified leads get a second, server-only conversion event. It has its own
  // deterministic event id, so Meta can optimise for quality without inflating
  // the raw Lead count.
  let qualifiedCapi: CapiResult | null = null;
  if (qualification.tier === 'qualified') {
    qualifiedCapi = await sendConversionCapi({
      eventName: 'QualifiedLead',
      eventId: deterministicUuid(`qualified-lead:${saved.leadId}`),
      submission,
      phoneE164,
      leadId: saved.leadId,
      context,
      qualification,
    });
  }

  const automation = await pushToAutomation(row, saved.leadId, submission.eventId);

  if (!automation.ok) {
    try {
      await store.saveLead({ ...row, status: 'failed' }, consent);
    } catch {
      /* status is best-effort; the DLQ already has the payload */
    }
  }

  const degraded =
    !automation.ok ||
    (!capi.ok && !capi.skipped) ||
    Boolean(qualifiedCapi && !qualifiedCapi.ok && !qualifiedCapi.skipped);

  return {
    status: degraded ? 202 : 201,
    body: {
      ok: true,
      leadId: saved.leadId,
      duplicate: false,
      queued: degraded,
      qualification: qualificationBody(qualification),
      downstream: {
        capi: capi.skipped ? 'skipped' : capi.ok ? 'sent' : 'failed',
        qualifiedLead: qualifiedCapi
          ? qualifiedCapi.skipped
            ? 'skipped'
            : qualifiedCapi.ok
              ? 'sent'
              : 'failed'
          : 'not_qualified',
        n8n: automation.skipped ? 'skipped' : automation.ok ? 'sent' : 'failed',
      },
    },
  };
}
