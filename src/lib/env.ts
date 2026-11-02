const bool = (value: string | undefined, defaultValue: boolean) => {
  if (value === undefined) return defaultValue;
  return value === '1' || value.toLowerCase() === 'true';
};

const int = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const env = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://127.0.0.1:3100',
  nodeEnv: process.env.NODE_ENV ?? 'development',

  supabaseUrl: process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',

  metaPixelId: process.env.NEXT_PUBLIC_META_PIXEL_ID ?? '',
  metaAccessToken: process.env.META_CAPI_ACCESS_TOKEN ?? '',
  metaTestEventCode: process.env.META_TEST_EVENT_CODE ?? '',
  metaApiVersion: process.env.META_API_VERSION ?? 'v21.0',

  n8nWebhookUrl: process.env.N8N_WEBHOOK_URL ?? '',
  n8nWebhookSecret: process.env.N8N_WEBHOOK_SECRET ?? '',

  alertWebhookUrl: process.env.ALERT_WEBHOOK_URL ?? '',

  retry: {
    attempts: int(process.env.RETRY_ATTEMPTS, 3),
    baseDelayMs: int(process.env.RETRY_BASE_MS, 250),
    maxDelayMs: int(process.env.RETRY_MAX_MS, 4000),
    timeoutMs: int(process.env.HTTP_TIMEOUT_MS, 8000),
  },

  allowMemoryFallback: bool(process.env.ALLOW_IN_MEMORY_FALLBACK, true),
  allowDevEndpoints:
    bool(process.env.ALLOW_DEV_ENDPOINTS, false) || (process.env.NODE_ENV ?? 'development') !== 'production',
};

export const isMetaConfigured = Boolean(env.metaPixelId && env.metaAccessToken);
export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseServiceKey);
