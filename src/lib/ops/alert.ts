import { env } from '@/lib/env';
import { withRetry } from '@/lib/http/retry';

export interface AlertInput {
  severity: 'info' | 'warning' | 'error';
  title: string;
  details: Record<string, unknown>;
}

/**
 * Sends a Slack-compatible alert. Never throws: an alerting outage must not
 * break lead ingestion.
 */
export async function sendAlert(input: AlertInput): Promise<void> {
  const text = `[${input.severity.toUpperCase()}] ${input.title}\n\`\`\`${JSON.stringify(
    input.details,
    null,
    2
  ).slice(0, 2500)}\`\`\``;

  if (!env.alertWebhookUrl) {
    console.error(`[lexhive][alert] ${input.title}`, input.details);
    return;
  }

  try {
    await withRetry(
      async () => {
        const response = await fetch(env.alertWebhookUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text }),
          signal: AbortSignal.timeout(env.retry.timeoutMs),
        });
        if (!response.ok) throw new Error(`alert webhook ${response.status}`);
        return true;
      },
      { attempts: 2, baseDelayMs: 150, maxDelayMs: 1000 }
    );
  } catch (error) {
    console.error('[lexhive][alert] delivery failed', (error as Error).message, input.details);
  }
}
