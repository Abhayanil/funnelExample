import { env } from '@/lib/env';
import { recordAudit } from '@/lib/dev/audit';
import { HttpError, withRetry } from '@/lib/http/retry';
import { enqueueDeadLetter } from '@/lib/ops/dead-letter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Exercises the retry/backoff and dead-letter paths deterministically.
 * Body: { failures: number } — the simulated dependency fails N times.
 */
export async function POST(request: Request) {
  if (!env.allowDevEndpoints) {
    return Response.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as { failures?: number };
  const failures = Math.max(0, Math.min(10, Number(body.failures ?? 0)));
  let calls = 0;

  try {
    const { attempts } = await withRetry(
      async () => {
        calls += 1;
        if (calls <= failures) throw new HttpError(503, 'simulated downstream failure');
        return true;
      },
      {
        attempts: env.retry.attempts,
        baseDelayMs: env.retry.baseDelayMs,
        maxDelayMs: env.retry.maxDelayMs,
      }
    );

    recordAudit('retry', { ok: true, calls, attempts, failures });
    return Response.json({ ok: true, calls, attempts });
  } catch (error) {
    const attempts = (error as { attempts?: number }).attempts ?? env.retry.attempts;
    await enqueueDeadLetter({
      source: 'unknown',
      dedupeKey: `retry-test:${Date.now()}`,
      payload: { failures },
      error: (error as Error).message,
      attempts,
    });
    recordAudit('retry', { ok: false, calls, attempts, failures });
    return Response.json({ ok: false, calls, attempts, queued: true }, { status: 502 });
  }
}
