import type { RequestContext } from '@/lib/leads/types';

export function getRequestContext(request: Request): RequestContext {
  const headers = request.headers;
  const forwarded = headers.get('x-forwarded-for');
  const ip =
    forwarded?.split(',')[0]?.trim() ||
    headers.get('cf-connecting-ip') ||
    headers.get('x-real-ip') ||
    '0.0.0.0';

  return {
    ip,
    userAgent: headers.get('user-agent') ?? 'unknown',
    origin: headers.get('origin') ?? 'unknown',
  };
}

export function readCookie(cookieHeader: string | null, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(';')) {
    const [rawKey, ...rest] = part.trim().split('=');
    if (rawKey === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}
