import { getRequestContext, readCookie } from '@/lib/http/request';
import { telemetryEventSchema } from '@/lib/leads/schema';
import { handleTelemetryEvent } from '@/lib/telemetry/service';

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

  const parsed = telemetryEventSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: 'invalid_payload', issues: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const context = getRequestContext(request);
  const cookieHeader = request.headers.get('cookie');

  const result = await handleTelemetryEvent(
    parsed.data,
    context,
    readCookie(cookieHeader, '_fbp'),
    readCookie(cookieHeader, '_fbc')
  );

  return Response.json(result);
}
