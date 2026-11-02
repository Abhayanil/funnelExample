import { env } from '@/lib/env';
import { hmacSha256 } from '@/lib/meta/hash';
import { HttpError, withRetry } from '@/lib/http/retry';
import { recordAudit } from '@/lib/dev/audit';
import { enqueueDeadLetter } from '@/lib/ops/dead-letter';
import { buildAutomationPayload, type LeadRow } from './types';

export interface AutomationResult {
  ok: boolean;
  skipped: boolean;
  attempts: number;
  error?: string;
}

/**
 * Hands the lead to n8n. Retries with exponential backoff; on exhaustion the
 * payload is written to the dead-letter queue and an alert is raised.
 */
export async function pushToAutomation(
  row: LeadRow,
  leadId: string,
  requestId: string
): Promise<AutomationResult> {
  if (!env.n8nWebhookUrl) {
    recordAudit('webhook', { leadId, skipped: true, reason: 'n8n_not_configured' });
    return { ok: true, skipped: true, attempts: 0 };
  }

  const body = JSON.stringify(buildAutomationPayload(row, leadId));
  const signature = env.n8nWebhookSecret ? hmacSha256(body, env.n8nWebhookSecret) : '';

  try {
    const { attempts } = await withRetry(
      async () => {
        const response = await fetch(env.n8nWebhookUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-lexhive-signature': signature ? `sha256=${signature}` : '',
            'x-lexhive-delivery': requestId,
          },
          body,
          signal: AbortSignal.timeout(env.retry.timeoutMs),
        });

        if (!response.ok) {
          const text = await response.text().catch(() => '');
          throw new HttpError(response.status, `n8n webhook ${response.status}`, text.slice(0, 2000));
        }
        return true;
      },
      {
        attempts: env.retry.attempts,
        baseDelayMs: env.retry.baseDelayMs,
        maxDelayMs: env.retry.maxDelayMs,
      }
    );

    recordAudit('webhook', { leadId, ok: true, attempts });
    return { ok: true, skipped: false, attempts };
  } catch (error) {
    const status = (error as { cause?: HttpError }).cause?.status;
    const attempts = (error as { attempts?: number }).attempts ?? env.retry.attempts;

    await enqueueDeadLetter({
      source: 'n8n_webhook',
      dedupeKey: `n8n:${row.submission_id}`,
      payload: buildAutomationPayload(row, leadId),
      error: (error as Error).message,
      attempts,
      status,
    });

    recordAudit('webhook', { leadId, ok: false, attempts, error: (error as Error).message });
    return { ok: false, skipped: false, attempts, error: (error as Error).message };
  }
}
