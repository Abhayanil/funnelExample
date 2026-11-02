# LexHive POC — assumptions, trade-offs and extras

## Scope

This proof of concept is the 26-step disability funnel plus a working Supabase lead
pipeline, deterministic lead qualification, closed-loop CRM feedback and an
internal analytics dashboard. n8n, Airtable and the Meta Business account are
**not** configured for this stage. Their code paths remain in the repository, but
every one of them is a no-op when its environment variables are unset, so the POC
runs end-to-end without them and can be switched on later without a rewrite.

## Assumptions

- Supabase is the system of record. `capture_lead()` writes the lead and its TCPA
  consent row in one transaction and is idempotent on `submission_id`.
- Without Supabase credentials the app uses an in-process store so the funnel and
  dashboard can be demoed locally. This is dev-only and clearly labelled in the UI.
- Analytics is internal. It is server-rendered and protected with HTTP Basic auth;
  the full dataset stays in Postgres and never reaches the browser.
- "Session" means a distinct `sessionId` that produced telemetry or a lead. It is a
  funnel-session proxy, not a cookie-based analytics session.

## Key decisions and trade-offs

- **Capture first, enrich later.** `/api/leads` validates with Zod, persists to
  Supabase, and only then calls Meta CAPI or automation. A downstream outage
  returns `202` with `queued: true` instead of losing the lead; exhausted retries
  go to `dead_letter_queue`.
- **Idempotency at three layers.** `submission_id` dedupes leads, `event_id`
  dedupes telemetry (and is the CAPI dedupe key shared with the Pixel), and a
  stable `dedupe_key` dedupes DLQ rows. Retries and double submits are safe.
- **Tracking quality over volume.** Pixel and CAPI share one UUID per event;
  email, phone (E.164) and names are normalised and SHA-256 hashed by the server;
  `fbp`, `fbc`, client IP and user agent are forwarded unhashed as Meta requires.
  Telemetry is fire-and-forget in the browser so tracking failures never block a
  lead.
- **No chart library.** The dashboard uses CSS bars and tables. It keeps the
  bundle small and the rendering server-side; the cost is less interactivity, which
  an internal POC does not need.
- **Cheap, explainable metrics.** Conversion is `leads ÷ sessions` capped at 100%.
  Step reach counts `InitiateCheckout` as `start`, step/Lead events by `stepId`,
  and every lead as reaching `contact`. Step timing is the gap between consecutive
  tracked events, capped at 30 minutes to ignore idle tabs. These are directional
  metrics, not a warehouse-grade attribution model.
- **Privacy in the UI.** The dashboard masks email and phone (`j******@…`,
  `••• ••• 4567`); full records stay behind Supabase RLS.
- **Fallbacks are explicit.** `ALLOW_IN_MEMORY_FALLBACK=0` and
  `ALLOW_DEV_ENDPOINTS=0` in production make misconfiguration fail loudly instead
  of silently losing data. Without `DASHBOARD_PASSWORD` the dashboard is open in
  development and returns `503` in production.

## Extras beyond the brief

- A crawl → graph compiler (`scripts/build-funnel-graph.js`) so the FSM, progress
  bar and tests read one generated graph rather than duplicated question text.
- A recorded journey dashboard: KPI cards, daily/weekly trend, source mix, step
  reach and median timing, answer distribution, recent masked leads, 7/30/90-day
  ranges, and a visible warning when data is only in memory.
- A dead-letter queue, replay script (`npm run dlq:replay`), signed failure webhook
  and health endpoint.
- 19 Playwright tests covering funnel flow, a11y, validation, API retries/DLQ,
  Pixel + CAPI parity/hashing/dedupe, dashboard auth, KPI correctness and PII
  masking.

## Deferred

Real Meta credentials and `META_TEST_EVENT_CODE` validation, n8n/Airtable
activation, production Supabase migration/backfill, and a deployed environment
with its own secrets. Google Opal was considered for automation and rejected: it
has no signed inbound webhook, retry or DLQ semantics, and Google's FAQ states the
service is turned off on 17 November 2026. A Supabase Edge Function is the
recommended replacement if automation is needed later; it keeps the existing
signed-webhook contract.
