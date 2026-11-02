import { getRequestContext } from '@/lib/http/request';
import { leadSubmissionSchema } from '@/lib/leads/schema';
import { submitLead } from '@/lib/leads/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 64 * 1024) {
    return Response.json({ ok: false, error: 'payload_too_large' }, { status: 413 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const parsed = leadSubmissionSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: 'invalid_payload', issues: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const result = await submitLead(parsed.data, getRequestContext(request));
  return Response.json(result.body, { status: result.status });
}
