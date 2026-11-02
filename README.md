# LexHive — Disability Funnel Lead Capture

Graph-driven lead capture for the 26-step Social Security disability
qualification funnel. This repository is a **POC**: the funnel, dual-layer Meta
telemetry (browser Pixel + Conversions API with a shared `event_id`), Supabase
persistence and an internal analytics dashboard are complete and tested. n8n /
Airtable / Meta Business credentials are deliberately not configured yet; those
integration paths stay dormant when their env vars are unset.

```
Browser ──▶ Next.js funnel (React 19, RHF + Zod, framer-motion)
   │             │
   │             ├── Meta Pixel: InitiateCheckout, FunnelStepComplete, Lead
   │             └── POST /api/telemetry ─┐  (same event_id as the Pixel)
   │                                       ▼
   │                              Meta Conversions API (SHA-256 user_data)
   │
   └── POST /api/leads ──▶ Zod validation ──▶ Supabase capture_lead() (ON CONFLICT)
                                  │                └── lead_tcpa_consent audit row
                                  ├── Meta CAPI "Lead" (shared event_id)
                                  └── n8n webhook (HMAC signed)
                                          └── Airtable / CRM
                                  ↳ retries exhausted → dead_letter_queue + alert
```

### POC scope

| Included | Deferred (code present, disabled) |
| --- | --- |
| 26-step funnel with conditional branches, a11y, progress and reload recovery | n8n → Airtable ingestion |
| Supabase lead + consent writes with `ON CONFLICT` idempotency | Meta Business account / production Pixel |
| Dual-layer telemetry with SHA-256 user data and `event_id` dedupe | CRM sync and staff notifications |
| In-memory fallback for local demos | Production deployment, migrations and backfill |
| `/dashboard` analytics (KPIs, journey, answers, sources, recent leads) | — |

See [`NOTES.md`](NOTES.md) for assumptions, trade-offs and the reasoning behind
the deferred pieces.

---

## 1. Quick start

```bash
npm install
cp .env.example .env.local   # then fill in real values
npm run dev                  # funnel at http://127.0.0.1:3100
                             # dashboard at http://127.0.0.1:3100/dashboard
npm run test:e2e             # 19 Playwright tests
npm run typecheck && npm run build
```

The gitignored `.env.local` uses the in-memory store, Meta dry-run mode and the
dev inspection endpoints, so the full flow runs without external accounts. Set
`DASHBOARD_USER` / `DASHBOARD_PASSWORD` there to protect the dashboard locally;
Playwright reads the same values. The suite starts the app automatically on port
3100.

To persist leads instead of using memory, apply `supabase/schema.sql` and set
`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.

### Environment

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_APP_URL` | Canonical app URL, used for CAPI `event_source_url` fallbacks |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Server-side Postgres access (service role bypasses RLS) |
| `ALLOW_IN_MEMORY_FALLBACK` | `1` = use an in-process store when Supabase is absent. **Set `0` in production** so misconfiguration fails loudly |
| `NEXT_PUBLIC_META_PIXEL_ID` | Browser Pixel id |
| `META_CAPI_ACCESS_TOKEN` | Server-side Conversions API token |
| `META_API_VERSION` | Graph API version, default `v21.0` |
| `META_TEST_EVENT_CODE` | Optional Events Manager test code; leave empty in production |
| `N8N_WEBHOOK_URL` | Lead ingestion webhook (n8n) |
| `N8N_WEBHOOK_SECRET` | HMAC-SHA256 secret for n8n + failure callbacks |
| `CRM_WEBHOOK_SECRET` | HMAC-SHA256 secret for `/api/webhooks/crm-disposition` (falls back to the n8n secret) |
| `ALERT_WEBHOOK_URL` | Slack-compatible incoming webhook for alerts |
| `RETRY_ATTEMPTS`, `RETRY_BASE_MS`, `RETRY_MAX_MS`, `HTTP_TIMEOUT_MS` | Backoff/timeout tuning |
| `ALLOW_DEV_ENDPOINTS` | Exposes `/api/dev/*` for tests. **Never enable in production** |
| `DASHBOARD_USER` | HTTP Basic username for `/dashboard` (default `admin`) |
| `DASHBOARD_PASSWORD` | HTTP Basic password. Required in production; without it the dashboard returns `503` |

---

## 2. Funnel architecture

- `funnel_report.json` is the Playwright crawl of the live 26-step funnel.
- `scripts/build-funnel-graph.js` compiles it into `src/lib/funnel/graph.json`:
  26 nodes, 22 questions, 84 answer options, plus the email/contact/result
  chain. Every node stores its shortest distance to the terminal step.
- `src/lib/funnel/engine.ts` is the FSM: `resolveTarget()` evaluates
  state-dependent branches (`when` + `fallback`), `nextStepId()` advances, and
  `progressFor()` computes a branch-aware progress bar (answers completed ÷
  answers completed + shortest remaining path).
- `src/components/funnel/Funnel.tsx` owns session state, persists it to
  `sessionStorage` (reload-safe), fires telemetry, and handles back/restart.
- Validation is Zod + React Hook Form (`onTouched` / `reValidateMode: onChange`),
  so errors appear as the user leaves a field and clear as they type.
- Accessibility: labelled `fieldset`/`legend` radio groups, `aria-invalid` and
  linked error text, a native `role="progressbar"`, focus moved to the new
  question heading on every transition, `aria-live` step announcements, and
  reduced-motion support.

### Branch example

`outofwork` normally goes to `visit`. When the earlier answer for
`page_sm72h5` was `"Not working"`, it routes to `conditionstart` instead:

```json
{
  "label": "YES",
  "next": "conditionstart",
  "when": [{ "step": "page_sm72h5", "equals": "Not working" }],
  "fallback": "visit"
}
```

To add or change steps, edit the crawl-derived generator (or the graph) and run
`npm run graph:build`; the UI, progress and tests read the graph, not hardcoded
question text.

---

## 3. Dual-layer Meta telemetry

| Event | When | Browser | Server |
| --- | --- | --- | --- |
| `InitiateCheckout` | First render of a session | ✓ | ✓ |
| `FunnelStepComplete` | Every answered question / email capture | ✓ | ✓ |
| `Lead` | Successful submission | ✓ | ✓ (`/api/leads` only) |
| `QualifiedLead` | Successful submission whose rubric tier is `qualified` | — | ✓ (server-only, deterministic event id) |

- **Shared ids.** `newEventId()` uses `crypto.randomUUID()`. The same value is
  passed to `fbq('track', …, { eventID })` and to `/api/telemetry` (or the
  `/api/leads` body for `Lead`). Meta collapses the pair.
- **Idempotency.** `telemetry_events.event_id` is unique. `/api/telemetry`
  logs the id before sending CAPI; a repeated beacon returns
  `{ duplicate: true }` and does not re-send. `/api/leads` also dedupes on
  `submission_id` inside `capture_lead`, so a retried form post cannot create a
  second lead or a second `Lead` event.
- **EMQ.** `src/lib/meta/hash.ts` normalises then SHA-256 hashes email
  (trim/lowercase), phone (E.164 digits without `+`), first/last name (NFKD,
  lowercase, punctuation stripped) and `external_id`. The CAPI payload also
  includes `fbp`, `fbc`, `client_ip_address` and `client_user_agent` unhashed as
  Meta requires.
- **Pixel bootstrap.** `MetaPixel` initialises once; tests can pre-install a
  `window.fbq` stub, which is respected rather than overwritten.
- **Failure isolation.** Telemetry is fire-and-forget in the browser, so a
  tracking outage never blocks the funnel. Server-side CAPI failures are
  retried, then dead-lettered and alerted.

### Lead quality & offline conversions

`src/lib/leads/qualifier.ts` is a pure, deterministic SSA-style rubric over the
funnel `answers` map. It evaluates working hours (SGA), work history, asset
ceiling, medical evidence, condition duration, age, representation and the
12-month out-of-work expectation.

| Tier | Meaning | Synthetic value |
| --- | --- | --- |
| `qualified` | No hard stop and score ≥ 70 | `$250` |
| `borderline` | Score 45–69, or risk signals only | `$100` |
| `disqualified` | Any hard stop (SGA hours, <2 years work history, already represented, no medical evidence) or score < 45 | `$0` |

Reason codes are stored in `leads.qualification_reasons` and labelled in the
dashboard (`working_over_20_hours`, `already_represented`,
`condition_under_12_months`, etc.). The `Lead` CAPI event carries
`qualification_tier`, `lead_quality`, `qualification_score`,
`qualification_reasons` and the synthetic `value`; only `qualified` leads also
emit `QualifiedLead`, so Meta can optimise for quality rather than raw volume.

Closed-loop feedback arrives at `POST /api/webhooks/crm-disposition` from
Airtable/the CRM. The raw body is signed with HMAC-SHA256
(`x-lexhive-signature: sha256=<hex>`, secret `CRM_WEBHOOK_SECRET`). The endpoint
updates the lead and emits an offline CAPI event with the original `fbp`, `fbc`
and `external_id`:

| Disposition | Meta event |
| --- | --- |
| `consult_scheduled` | `Schedule` |
| `retained` | `CompleteRegistration` |
| `disqualified` | none (record only) |

Offline event ids are deterministic (`hash(lead + disposition)`), so webhook
retries dedupe at Meta. Contract value comes from the webhook (`contract_value`)
or defaults to `$250` / `$1000` for the two conversion events.

---

## 4. Analytics dashboard (`/dashboard`)

`src/app/dashboard/page.tsx` is a server component that reads
`getAnalyticsSnapshot(range)` (`src/lib/analytics/snapshot.ts`). It queries
Supabase when configured and falls back to the in-memory store in development,
showing a warning banner when data is ephemeral. Ranges: 7 / 30 / 90 days.

| Metric | Definition |
| --- | --- |
| Leads | Rows in `leads` submitted in the range |
| Sessions | Distinct `sessionId`s with telemetry **or** a lead |
| Conversion | `leads ÷ sessions`, capped at 100% |
| Median time to lead | First tracked event → `Lead` event, per session |
| Tracked events | Telemetry beacons received server-side |
| Step reach | Sessions reaching a step: `InitiateCheckout` → `start`, step/`Lead` events by `stepId`, every lead → `contact` |
| Median step time | Gap between consecutive tracked events, attributed to the later step, capped at 30 min |
| Answer mix | Distribution of stored `answers` across captured leads |
| Source | `utm_source`, else referrer host, else `direct` |
| Qualified leads | Leads whose rubric tier is `qualified` |
| Qualified rate | `qualified ÷ leads` in the range |
| Disqualification reasons | Count/share of every reason code attached to disqualified leads |
| Campaign quality | Volume, quality mix and qualified rate grouped by `utm_source` / `utm_campaign` |
| Disposition | Latest CRM outcome (`consult_scheduled`, `retained`, `disqualified`) on recent leads |

Branches mean step reach is not a strict waterfall: not every session sees every
question. Contact details in the recent-leads table are masked
(`j******@example.com`, `••• ••• 4567`); full records remain in Supabase behind
RLS. The dashboard has no client-side chart dependency — bars are CSS.

**Access.** `src/proxy.ts` (Next.js 16 renamed Middleware → Proxy) applies HTTP
Basic auth to `/dashboard` only and compares credentials in constant time.
Anonymous requests get `401` + `WWW-Authenticate`; a wrong password gets `401`.
If `DASHBOARD_PASSWORD` is unset, local development opens the page and production
returns `503`. The public funnel and the API routes are unaffected.

---

## 5. Supabase schema (`supabase/schema.sql`)

| Table | Role |
| --- | --- |
| `leads` | One row per submission: contact, every structured answer, raw `answers` JSONB, attribution, `lead_event_id`, qualification tier/score/reasons, CRM disposition/contract value/offline event id, status, timestamps |
| `lead_tcpa_consent` | Append-only audit: consent version, exact text, page URL, IP, user agent, timestamp |
| `telemetry_events` | Unique `event_id` ledger used as the CAPI dedupe key |
| `dead_letter_queue` | Failed CAPI/n8n/Supabase deliveries, deduped by `dedupe_key`, replayable |

- `capture_lead(payload jsonb)` inserts the lead and consent row in one
  transaction with `ON CONFLICT (submission_id) DO NOTHING`; on conflict it
  returns the existing `lead_id` and `inserted = false`.
- `enqueue_dead_letter(payload jsonb)` upserts on `dedupe_key`, increments
  `attempts` and clears `resolved` when the same failure reappears.
- `mark_lead_synced(uuid)` is called by n8n after the CRM write.
- `apply_crm_disposition(payload jsonb)` looks up the lead by `lead_id` or
  `submission_id`, records the disposition/contract value/offline event id and
  returns the previous disposition so the webhook can report `changed`.
- RLS is enabled on every table. `anon`/`authenticated` have no write grants;
  `service_role` executes the RPCs. Staff reads are gated on
  `app_metadata.lexhive_role ∈ {admin, analyst, agent}`.
- Views: `unresolved_dead_letters`, `funnel_daily_stats`,
  `funnel_quality_by_campaign`, `funnel_disqualification_reasons`.
- The new columns are added with `alter table … add column if not exists`, so
  re-running the file upgrades an existing POC database without data loss.

Apply with the Supabase CLI (`supabase db push`) or run the SQL file in the
dashboard SQL editor.

---

## 6. Automation, retries and observability

`src/lib/http/retry.ts` implements exponential backoff with full jitter:

```
delay = random(0.5, 1) × min(maxDelay, base × 2^(attempt-1))
```

It retries network errors, timeouts, `408/425/429` and `5xx`, and fails fast on
other `4xx`. It is used by Meta CAPI, the n8n webhook and Slack alerts. In the
POC, unconfigured downstreams are reported as `skipped` rather than retried, so
lead capture succeeds without Meta or n8n credentials. The retry/DLQ machinery is
still exercised by the test suite.

- **n8n success path:** `/api/leads` persists first, then signs the automation
  payload (`x-lexhive-signature: sha256=<HMAC>`) and POSTs it. The response
  returns `201` when both downstreams are healthy and `202` with
  `queued: true` when either is degraded. The lead row is marked `failed` for
  later reconciliation.
- **DLQ:** exhausted deliveries call `enqueueDeadLetter()` with a stable
  `dedupe_key` (`n8n:<submission_id>`, `meta:<event_id>`, `supabase:<submission_id>`).
  An alert is sent regardless of DLQ write success.
- **Replay:** `npm run dlq:replay` re-sends unresolved `n8n_webhook` rows with
  fresh HMAC signatures, marks them resolved, and exits non-zero if any replay
  fails. `meta_capi` rows carry no raw PII and are reported for manual replay.
- **Health:** `GET /api/health` reports which integrations are configured
  (`supabase`, `metaCapi`, `n8n`, `alerts`) without leaking secrets.
- **Local instrumentation:** `GET /api/dev/state` exposes the in-memory leads,
  events, dead letters and an audit trail; `POST /api/dev/reset` clears them.
  `POST /api/dev/retry { failures }` deterministically exercises backoff/DLQ.

---

## 7. API contracts

### `POST /api/leads`

```json
{
  "submissionId": "uuid-v4",
  "sessionId": "uuid-v4",
  "eventId": "uuid-v4",
  "funnelVersion": "qualification-v30",
  "answers": { "start": "YES", "page_sm72h5": "Not working" },
  "contact": {
    "firstName": "Jordan",
    "lastName": "Rivera",
    "phone": "(555) 123-4567",
    "email": "jordan.rivera@example.com"
  },
  "consent": {
    "accepted": true,
    "version": "tcpa-2026-11",
    "text": "full consent language …",
    "pageUrl": "https://funnel.example.com/"
  },
  "attribution": { "landingUrl": "…", "referrer": "…", "utm": { "utm_source": "google" } },
  "meta": { "fbp": "fb.1.…", "fbc": "fb.1.…" }
}
```

| Status | Meaning |
| --- | --- |
| `201` | Created; every configured downstream succeeded (unconfigured ones are `skipped`) |
| `200` | Duplicate `submissionId`; existing lead returned, downstream skipped |
| `202` | Persisted but at least one configured downstream failed and was queued |
| `422` | Zod validation failed (or unusable phone) |
| `413` | Body > 64 KB |

Response: `{ ok, leadId, duplicate, queued?, qualification: { tier, score, reasons, value, currency }, downstream: { capi, qualifiedLead, n8n } }`.
PII is stored in Postgres and only ever sent to Meta as SHA-256 hashes.

### `POST /api/webhooks/crm-disposition`

Signed by Airtable / the CRM after a consult or retainer decision.

```json
{
  "lead_id": "uuid",
  "status": "retained",
  "contract_value": 2500,
  "note": "Signed retainer"
}
```

`submission_id` can be used instead of `lead_id`; `disposition` is accepted as an
alias for `status`. The signature is HMAC-SHA256 over the raw body:

```
x-lexhive-signature: sha256=<hex>
```

Responses: `200` `{ ok, leadId, disposition, previousDisposition, changed,
contractValue, offlineCapi, offlineEventId, eventName }`, `401` invalid
signature, `404` unknown lead, `422` invalid payload, `503` webhook not
configured or persistence unavailable. `disqualified` records the outcome
without emitting a conversion event.

### `POST /api/telemetry`

```json
{
  "eventName": "FunnelStepComplete",
  "eventId": "uuid-v4",
  "sessionId": "uuid-v4",
  "stepId": "page_sm72h5",
  "stepIndex": 2,
  "eventSourceUrl": "https://funnel.example.com/",
  "customData": { "answer": "Not working" },
  "user": { "email": "…", "phone": "…", "firstName": "…", "lastName": "…" },
  "fbp": "fb.1.…",
  "fbc": "fb.1.…"
}
```

Returns `{ ok, duplicate, capi: "sent" | "skipped" | "failed" }`.

### Other routes

| Route | Purpose |
| --- | --- |
| `POST /api/webhooks/failures` | Signed callback used by n8n's error workflow to enqueue a DLQ row |
| `POST /api/webhooks/crm-disposition` | Signed CRM feedback → lead disposition + offline Meta CAPI |
| `GET /api/health` | Configuration/health summary |
| `GET /api/dev/state`, `POST /api/dev/reset`, `POST /api/dev/retry` | Dev-only verification (guarded by `ALLOW_DEV_ENDPOINTS`) |

---

## 8. n8n (optional — not part of the POC)

These workflows are checked in for the next stage but are **not required for the
POC**: with `N8N_WEBHOOK_URL` unset, `/api/leads` skips automation and still
returns `201` once the lead is persisted.

- `n8n/lexhive-lead-ingestion.json` — webhook → HMAC verification → validation
  → Airtable upsert (matched on `Lead ID`) → Supabase `mark_lead_synced` →
  `202`. Any node failure routes to a signed `/api/webhooks/failures` callback,
  a Slack alert, and a `502` response so the app queues the payload.
- `n8n/lexhive-error-handler.json` — Error Trigger workflow; reports any failed
  execution to the same DLQ endpoint.
- Import both, attach an Airtable Personal Access Token credential, set
  `N8N_WEBHOOK_SECRET`, `LEXHIVE_APP_URL`, `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `AIRTABLE_BASE_ID`, `AIRTABLE_TABLE_NAME` and
  `SLACK_WEBHOOK_URL`, then activate the lead workflow and attach the error
  workflow to it. Details: `n8n/README.md`.

The Airtable table needs its primary field to be `Lead ID` (text or formula) so
upserts are idempotent; all other columns are created to match the mapped
fields.

---

## 9. Verification

```bash
npm run test:e2e      # funnel, telemetry, API and resilience suites
npm run typecheck
npm run build
```

32 Playwright tests cover:

- shortest-path completion, a state-dependent branch, validation gating,
  reload recovery, accessible radio group/progressbar, and back navigation;
- `Lead` API idempotency, invalid payload rejection, retry-then-success, and
  DLQ write after exhausted retries;
- email validation/advance;
- Pixel + CAPI firing with one shared `event_id`, server dedupe of repeated
  event ids, SHA-256/E.164 normalization with no raw PII in the payload, and
  rejection of malformed telemetry;
- the qualification rubric (qualified/borderline/disqualified, hard stops,
  risk signals, deterministic UUIDs), tiered `Lead` value, and `QualifiedLead`
  firing only for qualified submissions;
- signed CRM webhooks (unsigned/wrong-signature rejection, `Schedule`,
  `CompleteRegistration`, retry idempotency, `disqualified` record-only,
  `submission_id` lookup, unknown lead and malformed payload);
- dashboard auth (`401` anonymous, `401` wrong password, funnel stays public),
  KPI/step/answer aggregation, source attribution, qualified rate,
  disqualification reasons, campaign quality, disposition chips and masked
  contact details.

The tests run serially against a single dev server because the fallback store is
in-process. In production each request uses Supabase and is safe to run
concurrently. `playwright.config.ts` loads `.env.local` so the runner and the app
share the dashboard credentials; in CI set `DASHBOARD_USER` /
`DASHBOARD_PASSWORD` as environment variables instead.

---

## 10. Security & compliance notes

- The service-role key is server-only and never exposed via `NEXT_PUBLIC_*`.
- RLS + revoked grants mean the anon key cannot read or write lead data.
- Consent is captured with its exact text, version, page URL, IP, user agent
  and server timestamp; the consent row is append-only.
- Raw email/phone/name are never included in CAPI or Pixel payloads — only
  normalized SHA-256 digests plus `fbp`/`fbc`/IP/user agent.
- Logs intentionally omit PII; the DLQ stores the automation payload needed for
  replay, so restrict its read access the same way as `leads`.
- The dashboard is read-only and server-rendered; it masks email/phone and is
  behind HTTP Basic auth. Use a long random `DASHBOARD_PASSWORD` over HTTPS.
- The CRM webhook is closed by default: without `CRM_WEBHOOK_SECRET` (or the
  n8n fallback) it returns `503`, and every request must carry a valid
  HMAC-SHA256 signature over the raw body.
- Set `ALLOW_IN_MEMORY_FALLBACK=0`, `ALLOW_DEV_ENDPOINTS=0`,
  `DASHBOARD_PASSWORD` and `CRM_WEBHOOK_SECRET` in production.

---

## 11. Repository map

```
src/app/                     routes, layout, global styles
src/components/funnel/       Funnel FSM, step cards, forms, progress, result
src/lib/funnel/              graph.json + engine + types
src/lib/leads/               Zod schemas, service, store, automation, consent,
                             qualifier rubric, CRM disposition/offline CAPI
src/lib/telemetry/           browser Pixel client + server telemetry service
src/lib/meta/                normalization/SHA-256 + CAPI client
src/lib/http/                backoff retry + request context helpers
src/lib/ops/                 DLQ writer + alerting
src/lib/analytics/           dashboard aggregation (Supabase or memory)
src/app/dashboard/           internal analytics page + styles
src/proxy.ts                 HTTP Basic auth for /dashboard (Next 16 Proxy)
supabase/schema.sql          tables, RPCs, RLS, triggers, views
n8n/*.json                   ingestion + error-handler workflows
scripts/build-funnel-graph.js  crawl → graph compiler
scripts/dlq-replay.mjs       dead-letter replay
tests/                       Playwright specs, helpers, fixtures
NOTES.md                     POC assumptions, trade-offs and deferred work
```
