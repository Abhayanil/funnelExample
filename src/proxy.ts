import { NextResponse, type NextRequest } from 'next/server';

/**
 * HTTP Basic auth for the internal analytics dashboard.
 *
 * Next.js 16 renamed Middleware to Proxy; this file is the single proxy for the
 * app. The dashboard is the only protected route: the public funnel and the
 * API routes keep their own validation (and `/api/dev/*` is disabled in prod).
 *
 * Set DASHBOARD_USER / DASHBOARD_PASSWORD in production. Without a password
 * the dashboard is open in local development only and returns 503 in
 * production rather than silently exposing lead data.
 */

const REALM = 'LexHive dashboard';

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function unauthorized(): NextResponse {
  return new NextResponse('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"`,
      'Cache-Control': 'no-store',
    },
  });
}

export function proxy(request: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD ?? '';
  const username = process.env.DASHBOARD_USER ?? 'admin';

  if (!password) {
    if (process.env.NODE_ENV !== 'production') return NextResponse.next();

    return new NextResponse(
      'Dashboard is not configured. Set DASHBOARD_USER and DASHBOARD_PASSWORD.',
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const header = request.headers.get('authorization') ?? '';
  if (!header.startsWith('Basic ')) return unauthorized();

  let decoded = '';
  try {
    decoded = atob(header.slice('Basic '.length));
  } catch {
    return unauthorized();
  }

  const separator = decoded.indexOf(':');
  if (separator <= 0) return unauthorized();

  const providedUser = decoded.slice(0, separator);
  const providedPassword = decoded.slice(separator + 1);

  if (!safeEqual(providedUser, username) || !safeEqual(providedPassword, password)) {
    return unauthorized();
  }

  const response = NextResponse.next();
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export const config = {
  matcher: ['/dashboard', '/dashboard/:path*'],
};
