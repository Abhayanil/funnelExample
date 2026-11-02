import { env } from '@/lib/env';
import { readAudit } from '@/lib/dev/audit';
import { memoryLeadStore } from '@/lib/leads/store';

export const dynamic = 'force-dynamic';

/** Local test instrumentation only. Disabled in production. */
export async function GET() {
  if (!env.allowDevEndpoints) {
    return Response.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  return Response.json({
    ok: true,
    audit: readAudit(),
    memory: memoryLeadStore.snapshot(),
  });
}
