# n8n workflows

Two workflows implement the ingestion + resilience layer.

## 1. `lexhive-lead-ingestion.json`

```
Lead Webhook (POST /webhook/lexhive-lead)
  → Verify & Normalize   (HMAC + schema checks + Airtable flattening)
  → Valid? ──false──▶ Rejected (401)
       └─true──▶ Upsert Airtable (match on "Lead ID")
                    → Mark Lead Synced (Supabase RPC mark_lead_synced)
                         → Accepted (202)
                    └─error──▶ Build Failure Report
                                  → Report to DLQ (signed callback)
                                  → Slack Alert
                                  → Degraded (502)
```

- **Verification.** The Code node recomputes
  `HMAC-SHA256(rawBody, N8N_WEBHOOK_SECRET)` and compares it in constant time
  with `x-lexhive-signature`. Invalid signatures and missing contact fields
  return `401` without touching Airtable.
- **Idempotency.** Airtable upsert matches the primary field `Lead ID`
  (the app's lead UUID), so retried deliveries update the same record. The app
  also dedupes on `submission_id` before calling n8n.
- **Failure contract.** A `502` response (after the DLQ callback) tells the
  Next.js app to mark the lead `failed` and keep the payload in
  `dead_letter_queue` for replay. If n8n is offline entirely, the app's own
  backoff writes the DLQ row itself.
- **No PII in URLs.** Everything travels in the POST body; the webhook uses
  POST only.

### Import

1. n8n → **Workflows → Import from file**; select the JSON.
2. Create an **Airtable Personal Access Token** credential and attach it to
   *Upsert Airtable* (replace the placeholder credential id).
3. Set workflow environment variables (n8n → Settings → Variables, or the
   container env):
   - `N8N_WEBHOOK_SECRET` (must equal the app's value)
   - `LEXHIVE_APP_URL` (e.g. `https://funnel.example.com`)
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   - `AIRTABLE_BASE_ID`, `AIRTABLE_TABLE_NAME` (optional, defaults to `Leads`)
   - `SLACK_WEBHOOK_URL` (optional alert sink)
4. Create these Airtable fields (names must match exactly):
   `Lead ID` (primary), `Submission ID`, `First Name`, `Last Name`, `Email`,
   `Phone`, `Receiving Benefits`, `Hours Per Week`, `Years Employed`, `Assets`,
   `Expects Out Of Work`, `Condition Start`, `Doctor Status`,
   `Pending Application`, `Attorney Status`, `Attorney Firm`,
   `Application Denied`, `Claim Stage`, `Hearing Status`, `Waiting Period`,
   `Denial Age`, `Gender`, `Age Range`, `Marital Status`, `UTM Source`,
   `UTM Medium`, `UTM Campaign`, `Landing URL`, `Submitted At`, `Sync Status`.
5. Activate the workflow and copy the production URL to the app's
   `N8N_WEBHOOK_URL` (`https://<n8n-host>/webhook/lexhive-lead`).

## 2. `lexhive-error-handler.json`

Error Trigger → **Build Failure Callback** (raw-signed body) → **Report Failure**
(3 attempts, 2 s apart) → **Notify Slack**.

Import it, set the same environment variables, then in the lead workflow's
settings choose this workflow as its **Error Workflow**. Execution failures are
then stored in `dead_letter_queue` with `dedupe_key = n8n-error:<executionId>`
and appear in Slack.

## Local smoke test

```bash
# n8n listening on :5678, app on :3100
BODY='{"lead_id":"00000000-0000-4000-8000-000000000000","contact":{"email":"a@b.co","phone":"+15551234567","first_name":"A","last_name":"B"}}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$N8N_WEBHOOK_SECRET" | awk '{print $2}')

curl -i -X POST http://localhost:5678/webhook/lexhive-lead \
  -H 'content-type: application/json' \
  -H "x-lexhive-signature: sha256=$SIG" \
  -d "$BODY"
```

A valid, fully configured workflow returns `202`; an invalid signature returns
`401`.
