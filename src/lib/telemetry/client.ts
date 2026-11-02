'use client';

export interface PixelEventLogEntry {
  eventName: string;
  eventId: string;
  params: Record<string, unknown>;
  at: number;
}

declare global {
  interface Window {
    fbq?: ((...args: unknown[]) => void) & {
      queue?: unknown[];
      loaded?: boolean;
      version?: string;
      callMethod?: (...args: unknown[]) => void;
    };
    _fbq?: unknown;
    __LEXHIVE_EVENTS__?: PixelEventLogEntry[];
    __LEXHIVE_PIXEL_INIT__?: boolean;
  }
}

/** UUID v4 from the platform CSPRNG, with a safe fallback. */
export function newEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

function installPixelSnippet() {
  if (window.fbq) return;

  const fbq = function (...args: unknown[]) {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue?.push(args);
  } as NonNullable<Window['fbq']>;

  fbq.queue = [];
  fbq.loaded = true;
  fbq.version = '2.0';
  window.fbq = fbq;
  window._fbq = fbq;

  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://connect.facebook.net/en_US/fbevents.js';
  document.head.appendChild(script);
}

/**
 * Initialises the browser Pixel once. A stub already placed on `window.fbq`
 * (used by the Playwright tests) is respected and never overwritten.
 */
export function initMetaPixel(pixelId: string | undefined) {
  if (typeof window === 'undefined') return;
  if (window.__LEXHIVE_PIXEL_INIT__) return;

  window.__LEXHIVE_EVENTS__ = window.__LEXHIVE_EVENTS__ ?? [];
  window.__LEXHIVE_PIXEL_INIT__ = true;

  if (!pixelId) return;

  installPixelSnippet();
  window.fbq?.('init', pixelId);
  window.fbq?.('track', 'PageView');
}

/** Sends the browser-side event and records it for local diagnostics/tests. */
export function trackPixel(
  eventName: string,
  params: Record<string, unknown>,
  eventId: string
) {
  if (typeof window === 'undefined') return;

  window.__LEXHIVE_EVENTS__ = window.__LEXHIVE_EVENTS__ ?? [];
  window.__LEXHIVE_EVENTS__.push({ eventName, eventId, params, at: Date.now() });

  window.fbq?.('track', eventName, params, { eventID: eventId });
}

export interface ServerTelemetryPayload {
  eventName: 'InitiateCheckout' | 'FunnelStepComplete' | 'Lead';
  eventId: string;
  sessionId: string;
  stepId: string;
  stepIndex?: number;
  eventSourceUrl?: string;
  customData?: Record<string, string | number | boolean>;
  user?: { email?: string; phone?: string; firstName?: string; lastName?: string };
}

/**
 * Mirrors the event to the server with the identical event_id.
 * Fire-and-forget: a telemetry outage must never block the funnel.
 */
export function sendServerEvent(payload: ServerTelemetryPayload): void {
  if (typeof window === 'undefined') return;

  const body = JSON.stringify({
    ...payload,
    eventSourceUrl: payload.eventSourceUrl ?? window.location.href,
    fbp: readCookie('_fbp'),
    fbc: readCookie('_fbc'),
  });

  try {
    void fetch('/api/telemetry', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {
      /* swallowed by design */
    });
  } catch {
    /* ignore */
  }
}

/** Fires the same logical event through both transports. */
export function trackDualEvent(args: {
  eventName: 'InitiateCheckout' | 'FunnelStepComplete' | 'Lead';
  eventId: string;
  sessionId: string;
  stepId: string;
  stepIndex?: number;
  params?: Record<string, string | number | boolean>;
  user?: { email?: string; phone?: string; firstName?: string; lastName?: string };
}) {
  trackPixel(args.eventName, args.params ?? {}, args.eventId);
  sendServerEvent({
    eventName: args.eventName,
    eventId: args.eventId,
    sessionId: args.sessionId,
    stepId: args.stepId,
    stepIndex: args.stepIndex,
    customData: args.params,
    user: args.user,
  });
}
