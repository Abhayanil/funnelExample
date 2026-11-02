import { env } from '@/lib/env';
import { sendAlert } from '@/lib/ops/alert';
import { recordAudit } from '@/lib/dev/audit';
import { getLeadStore } from '@/lib/leads/store';
import type { DeadLetterInput } from '@/lib/leads/types';

export async function enqueueDeadLetter(entry: DeadLetterInput) {
  try {
    await getLeadStore().enqueueDeadLetter(entry);
    recordAudit('dlq', {
      source: entry.source,
      dedupeKey: entry.dedupeKey,
      error: entry.error,
      attempts: entry.attempts,
      status: entry.status,
    });
  } catch (error) {
    console.error('[lexhive] failed to write dead letter', error);
    recordAudit('dlq', {
      source: entry.source,
      dedupeKey: entry.dedupeKey,
      error: `DLQ write failed: ${(error as Error).message}`,
    });
  }

  await sendAlert({
    severity: 'error',
    title: `Downstream failure: ${entry.source}`,
    details: {
      dedupeKey: entry.dedupeKey,
      attempts: entry.attempts,
      status: entry.status,
      error: entry.error,
      appUrl: env.appUrl,
    },
  });
}
