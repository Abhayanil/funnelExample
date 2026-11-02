import { env } from '@/lib/env';
import { resetAudit } from '@/lib/dev/audit';
import { memoryLeadStore } from '@/lib/leads/store';

export const dynamic = 'force-dynamic';

export async function POST() {
  if (!env.allowDevEndpoints) {
    return Response.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  memoryLeadStore.reset();
  resetAudit();
  return Response.json({ ok: true, reset: true });
}
