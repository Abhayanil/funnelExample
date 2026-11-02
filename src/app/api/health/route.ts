import { env, isMetaConfigured, isSupabaseConfigured } from '@/lib/env';

export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({
    ok: true,
    version: '1.0.0',
    time: new Date().toISOString(),
    configuration: {
      supabase: isSupabaseConfigured ? 'configured' : 'memory_fallback',
      metaCapi: isMetaConfigured ? 'configured' : 'dry_run',
      n8n: env.n8nWebhookUrl ? 'configured' : 'disabled',
      alerts: env.alertWebhookUrl ? 'configured' : 'log_only',
      devEndpoints: env.allowDevEndpoints,
    },
  });
}
