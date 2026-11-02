import { env, isMetaConfigured } from '@/lib/env';
import { HttpError, withRetry } from '@/lib/http/retry';
import { buildMetaUserData, type MetaUserInput } from './hash';

export interface CapiEventInput {
  eventName: string;
  eventId: string;
  eventTime?: number;
  eventSourceUrl: string;
  actionSource?: 'website' | 'system_generated' | 'phone_call' | 'chat' | 'email' | 'other';
  user: MetaUserInput;
  customData?: Record<string, unknown>;
}

export interface CapiResult {
  ok: boolean;
  skipped?: boolean;
  attempts: number;
  status?: number;
  response?: unknown;
  error?: string;
}

export function buildCapiPayload(input: CapiEventInput) {
  const event = {
    event_name: input.eventName,
    event_time: input.eventTime ?? Math.floor(Date.now() / 1000),
    event_id: input.eventId,
    action_source: input.actionSource ?? 'website',
    event_source_url: input.eventSourceUrl,
    user_data: buildMetaUserData(input.user),
    custom_data: input.customData ?? {},
  };

  const payload: Record<string, unknown> = { data: [event] };
  if (env.metaTestEventCode) payload.test_event_code = env.metaTestEventCode;
  return payload;
}

/**
 * Sends one event to the Meta Conversions API.
 * The caller passes the same event_id used by the browser Pixel so Meta can
 * deduplicate the pair.
 */
export async function sendCapiEvent(input: CapiEventInput): Promise<CapiResult> {
  if (!isMetaConfigured) {
    return { ok: false, skipped: true, attempts: 0, error: 'meta_not_configured' };
  }

  const url =
    `https://graph.facebook.com/${env.metaApiVersion}/${env.metaPixelId}/events` +
    `?access_token=${encodeURIComponent(env.metaAccessToken)}`;
  const payload = buildCapiPayload(input);

  try {
    const { result, attempts } = await withRetry(
      async () => {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(env.retry.timeoutMs),
        });

        if (!response.ok) {
          const body = await response.text().catch(() => '');
          throw new HttpError(response.status, `Meta CAPI ${response.status}`, body.slice(0, 2000));
        }
        return (await response.json()) as unknown;
      },
      {
        attempts: env.retry.attempts,
        baseDelayMs: env.retry.baseDelayMs,
        maxDelayMs: env.retry.maxDelayMs,
      }
    );

    return { ok: true, attempts, response: result };
  } catch (error) {
    return {
      ok: false,
      attempts: (error as { attempts?: number }).attempts ?? env.retry.attempts,
      error: (error as Error).message,
      status: (error as { cause?: HttpError }).cause?.status,
    };
  }
}
