import { env } from '@/lib/env';
import { recordAudit } from '@/lib/dev/audit';
import { sendCapiEvent } from '@/lib/meta/capi';
import { enqueueDeadLetter } from '@/lib/ops/dead-letter';
import type { TelemetryEvent } from '@/lib/leads/schema';
import type { RequestContext } from '@/lib/leads/types';
import { getLeadStore } from '@/lib/leads/store';

export interface TelemetryResult {
  ok: boolean;
  duplicate: boolean;
  capi: 'sent' | 'skipped' | 'failed';
}

/**
 * Mirrors a browser Pixel event through the Conversions API using the SAME
 * event_id. The event_id row in `telemetry_events` is the idempotency key, so
 * retries and duplicate beacons never produce a second CAPI send.
 */
export async function handleTelemetryEvent(
  event: TelemetryEvent,
  context: RequestContext,
  fbp?: string,
  fbc?: string
): Promise<TelemetryResult> {
  const store = getLeadStore();

  let duplicate = false;
  try {
    const logged = await store.logEvent({
      eventId: event.eventId,
      eventName: event.eventName,
      sessionId: event.sessionId,
      stepId: event.stepId,
      source: 'capi',
      payload: event,
    });
    duplicate = logged.duplicate;
  } catch (error) {
    console.error('[lexhive] telemetry log failed', error);
  }

  if (duplicate) {
    recordAudit('telemetry', { eventId: event.eventId, eventName: event.eventName, duplicate: true });
    return { ok: true, duplicate: true, capi: 'skipped' };
  }

  const capi = await sendCapiEvent({
    eventName: event.eventName,
    eventId: event.eventId,
    eventSourceUrl: event.eventSourceUrl ?? `${env.appUrl}/`,
    user: {
      email: event.user.email,
      phone: event.user.phone,
      firstName: event.user.firstName,
      lastName: event.user.lastName,
      externalId: event.sessionId,
      fbp: event.fbp ?? fbp,
      fbc: event.fbc ?? fbc,
      clientIp: context.ip,
      userAgent: context.userAgent,
      country: 'us',
    },
    customData: {
      ...event.customData,
      funnel_step: event.stepId,
      funnel_step_index: event.stepIndex ?? 0,
    },
  });

  recordAudit('capi', {
    eventId: event.eventId,
    eventName: event.eventName,
    stepId: event.stepId,
    ok: capi.ok,
    skipped: Boolean(capi.skipped),
    attempts: capi.attempts,
  });
  recordAudit('telemetry', {
    eventId: event.eventId,
    eventName: event.eventName,
    stepId: event.stepId,
    sessionId: event.sessionId,
  });

  if (!capi.ok && !capi.skipped) {
    await enqueueDeadLetter({
      source: 'meta_capi',
      dedupeKey: `meta:${event.eventId}`,
      payload: event,
      error: capi.error ?? 'unknown Meta CAPI error',
      attempts: capi.attempts,
      status: capi.status,
    });
  }

  return {
    ok: true,
    duplicate: false,
    capi: capi.skipped ? 'skipped' : capi.ok ? 'sent' : 'failed',
  };
}
