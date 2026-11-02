-- ============================================================================
-- LexHive lead capture — Supabase / Postgres schema
-- ============================================================================
-- Apply with the Supabase CLI:
--   supabase db push
-- or paste into the SQL editor of your project (runs in one transaction).
--
-- Security model
--   * The browser never talks to Postgres. Every write goes through Next.js
--     API routes using the service-role key, which bypasses RLS.
--   * RLS is enabled on every table and the `anon` / `authenticated` roles are
--     given no write access. Staff read access is opt-in through the
--     `app_metadata.lexhive_role` JWT claim (see policies at the bottom).
--   * `capture_lead` and `enqueue_dead_letter` are SECURITY DEFINER functions
--     executable only by `service_role`.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'lead_status') then
    create type public.lead_status as enum ('new', 'synced', 'failed');
  end if;

  if not exists (select 1 from pg_type where typname = 'dead_letter_source') then
    create type public.dead_letter_source as enum ('meta_capi', 'n8n_webhook', 'supabase', 'unknown');
  end if;
end
$$;

-- ----------------------------------------------------------------------------
-- leads: one row per qualified submission
-- ----------------------------------------------------------------------------

create table if not exists public.leads (
  id                    uuid primary key default gen_random_uuid(),
  submission_id         uuid not null unique,
  session_id            uuid not null,
  funnel_version        text not null,

  -- contact
  first_name            text not null,
  last_name             text not null,
  email                 text not null,
  phone_e164            text not null,

  -- full answer map (source of truth) + structured columns for CRM/analytics
  answers               jsonb not null default '{}'::jsonb,
  receiving_benefits    text,
  hours_per_week        text,
  last_worked           text,
  years_employed        text,
  assets                text,
  expects_out_of_work   boolean,
  condition_start       text,
  doctor_status         text,
  last_doctor_visit     text,
  pending_application   boolean,
  attorney_status       text,
  attorney_firm         text,
  application_denied    boolean,
  claim_stage           text,
  reconsideration_status text,
  denial_age            text,
  hearing_status        text,
  hearing_month         text,
  waiting_period        text,
  gender                text,
  age_range             text,
  marital_status        text,

  -- attribution / telemetry
  attribution           jsonb not null default '{}'::jsonb,
  meta                  jsonb not null default '{}'::jsonb,
  lead_event_id         uuid not null,

  status                public.lead_status not null default 'new',
  submitted_at          timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint leads_email_shape check (position('@' in email) > 1),
  constraint leads_phone_shape check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$')
);

comment on table public.leads is
  'Qualified intake submissions. `submission_id` is the client-generated idempotency key; `lead_event_id` is the Meta event id shared by Pixel and CAPI.';
comment on column public.leads.answers is
  'Raw step_id -> answer map from the funnel graph; kept so new questions never require a migration.';

create index if not exists leads_email_idx on public.leads (lower(email));
create index if not exists leads_phone_idx on public.leads (phone_e164);
create index if not exists leads_submitted_at_idx on public.leads (submitted_at desc);
create index if not exists leads_status_idx on public.leads (status);
create index if not exists leads_session_idx on public.leads (session_id);
create index if not exists leads_lead_event_idx on public.leads (lead_event_id);

-- ----------------------------------------------------------------------------
-- lead_tcpa_consent: append-only TCPA audit log
-- ----------------------------------------------------------------------------

create table if not exists public.lead_tcpa_consent (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.leads (id) on delete cascade,
  accepted    boolean not null,
  version     text not null,
  text        text not null,
  page_url    text,
  ip          text not null,
  user_agent  text not null,
  created_at  timestamptz not null default now(),

  constraint lead_tcpa_consent_text_present check (length(text) >= 20)
);

comment on table public.lead_tcpa_consent is
  'Immutable record of the exact consent language, version, timestamp, IP and user agent captured at submission.';

create index if not exists lead_tcpa_consent_lead_idx on public.lead_tcpa_consent (lead_id);
create index if not exists lead_tcpa_consent_created_idx on public.lead_tcpa_consent (created_at desc);

-- ----------------------------------------------------------------------------
-- telemetry_events: Pixel/CAPI idempotency ledger
-- ----------------------------------------------------------------------------

create table if not exists public.telemetry_events (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null unique,
  event_name  text not null,
  session_id  uuid not null,
  step_id     text not null,
  source      text not null check (source in ('pixel', 'capi')),
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

comment on table public.telemetry_events is
  'One row per unique Meta event_id. The unique constraint is the server-side dedupe guard for retried beacons.';

create index if not exists telemetry_events_session_idx on public.telemetry_events (session_id);
create index if not exists telemetry_events_name_idx on public.telemetry_events (event_name);

-- ----------------------------------------------------------------------------
-- dead_letter_queue: failed downstream deliveries, replayable
-- ----------------------------------------------------------------------------

create table if not exists public.dead_letter_queue (
  id           uuid primary key default gen_random_uuid(),
  source       public.dead_letter_source not null default 'unknown',
  dedupe_key   text not null unique,
  payload      jsonb not null,
  error        text not null,
  attempts     integer not null default 1 check (attempts > 0),
  status       integer,
  resolved     boolean not null default false,
  resolved_at  timestamptz,
  last_seen_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.dead_letter_queue is
  'Payloads whose downstream delivery (Meta CAPI, n8n, Supabase) exhausted retries. Replay with scripts/dlq-replay.mjs after fixing the dependency.';

create index if not exists dlq_unresolved_idx
  on public.dead_letter_queue (created_at)
  where resolved = false;
create index if not exists dlq_source_idx on public.dead_letter_queue (source);

-- ----------------------------------------------------------------------------
-- updated_at trigger
-- ----------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists leads_touch_updated_at on public.leads;
create trigger leads_touch_updated_at
  before update on public.leads
  for each row execute function public.touch_updated_at();

drop trigger if exists dlq_touch_updated_at on public.dead_letter_queue;
create trigger dlq_touch_updated_at
  before update on public.dead_letter_queue
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- capture_lead(payload jsonb)
--   Atomic, idempotent insert of a lead + its consent record.
--   Returns (lead_id, inserted):
--     inserted = true  -> new row created
--     inserted = false -> submission_id already existed, nothing duplicated
-- ----------------------------------------------------------------------------

create or replace function public.capture_lead(payload jsonb)
returns table (lead_id uuid, inserted boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead_id uuid;
  v_consent jsonb := coalesce(payload -> 'consent', '{}'::jsonb);
begin
  insert into public.leads (
    submission_id, session_id, funnel_version,
    first_name, last_name, email, phone_e164,
    answers,
    receiving_benefits, hours_per_week, last_worked, years_employed, assets,
    expects_out_of_work, condition_start, doctor_status, last_doctor_visit,
    pending_application, attorney_status, attorney_firm, application_denied,
    claim_stage, reconsideration_status, denial_age, hearing_status,
    hearing_month, waiting_period, gender, age_range, marital_status,
    attribution, meta, lead_event_id, status, submitted_at
  )
  values (
    (payload ->> 'submission_id')::uuid,
    (payload ->> 'session_id')::uuid,
    payload ->> 'funnel_version',
    payload ->> 'first_name',
    payload ->> 'last_name',
    lower(payload ->> 'email'),
    payload ->> 'phone_e164',
    coalesce(payload -> 'answers', '{}'::jsonb),
    payload ->> 'receiving_benefits',
    payload ->> 'hours_per_week',
    payload ->> 'last_worked',
    payload ->> 'years_employed',
    payload ->> 'assets',
    (nullif(payload ->> 'expects_out_of_work', ''))::boolean,
    payload ->> 'condition_start',
    payload ->> 'doctor_status',
    payload ->> 'last_doctor_visit',
    (nullif(payload ->> 'pending_application', ''))::boolean,
    payload ->> 'attorney_status',
    payload ->> 'attorney_firm',
    (nullif(payload ->> 'application_denied', ''))::boolean,
    payload ->> 'claim_stage',
    payload ->> 'reconsideration_status',
    payload ->> 'denial_age',
    payload ->> 'hearing_status',
    payload ->> 'hearing_month',
    payload ->> 'waiting_period',
    payload ->> 'gender',
    payload ->> 'age_range',
    payload ->> 'marital_status',
    coalesce(payload -> 'attribution', '{}'::jsonb),
    coalesce(payload -> 'meta', '{}'::jsonb),
    (payload ->> 'lead_event_id')::uuid,
    coalesce((payload ->> 'status')::public.lead_status, 'new'),
    coalesce((payload ->> 'submitted_at')::timestamptz, now())
  )
  on conflict (submission_id) do nothing
  returning id into v_lead_id;

  if v_lead_id is null then
    -- Duplicate submission: return the original row. A retry that reports a
    -- downstream failure may still downgrade a pristine lead to 'failed'.
    select id into v_lead_id
    from public.leads
    where submission_id = (payload ->> 'submission_id')::uuid;

    if v_lead_id is not null and payload ->> 'status' = 'failed' then
      update public.leads
         set status = 'failed'
       where id = v_lead_id and status = 'new';
    end if;

    return query select v_lead_id, false;
    return;
  end if;

  insert into public.lead_tcpa_consent (
    lead_id, accepted, version, text, page_url, ip, user_agent
  )
  values (
    v_lead_id,
    coalesce((v_consent ->> 'accepted')::boolean, true),
    coalesce(v_consent ->> 'version', 'unknown'),
    coalesce(v_consent ->> 'text', ''),
    v_consent ->> 'page_url',
    coalesce(v_consent ->> 'ip', '0.0.0.0'),
    coalesce(v_consent ->> 'user_agent', 'unknown')
  );

  return query select v_lead_id, true;
end;
$$;

revoke all on function public.capture_lead(jsonb) from public, anon, authenticated;
grant execute on function public.capture_lead(jsonb) to service_role;

-- ----------------------------------------------------------------------------
-- enqueue_dead_letter(payload jsonb)
--   Upsert on `dedupe_key`: repeated failures bump attempts instead of
--   flooding the table with identical payloads.
-- ----------------------------------------------------------------------------

create or replace function public.enqueue_dead_letter(payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.dead_letter_queue (
    source, dedupe_key, payload, error, attempts, status
  )
  values (
    coalesce((payload ->> 'source')::public.dead_letter_source, 'unknown'),
    payload ->> 'dedupe_key',
    coalesce(payload -> 'payload', '{}'::jsonb),
    coalesce(payload ->> 'error', 'unknown error'),
    greatest(coalesce((payload ->> 'attempts')::integer, 1), 1),
    (payload ->> 'status')::integer
  )
  on conflict (dedupe_key) do update
    set payload      = excluded.payload,
        error        = excluded.error,
        attempts     = public.dead_letter_queue.attempts + excluded.attempts,
        status       = excluded.status,
        resolved     = false,
        resolved_at  = null,
        last_seen_at = now();
end;
$$;

revoke all on function public.enqueue_dead_letter(jsonb) from public, anon, authenticated;
grant execute on function public.enqueue_dead_letter(jsonb) to service_role;

-- ----------------------------------------------------------------------------
-- mark_lead_synced(lead_id uuid): called by the n8n success path
-- ----------------------------------------------------------------------------

create or replace function public.mark_lead_synced(target_lead_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.leads
     set status = 'synced'
   where id = target_lead_id;
$$;

revoke all on function public.mark_lead_synced(uuid) from public, anon, authenticated;
grant execute on function public.mark_lead_synced(uuid) to service_role;

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------

alter table public.leads              enable row level security;
alter table public.lead_tcpa_consent  enable row level security;
alter table public.telemetry_events   enable row level security;
alter table public.dead_letter_queue  enable row level security;

-- No client-side writes, ever. RLS + privileges are both locked down.
revoke all on public.leads             from anon, authenticated;
revoke all on public.lead_tcpa_consent from anon, authenticated;
revoke all on public.telemetry_events  from anon, authenticated;
revoke all on public.dead_letter_queue from anon, authenticated;

grant select, insert, update, delete on public.leads             to service_role;
grant select, insert, update, delete on public.lead_tcpa_consent to service_role;
grant select, insert, update, delete on public.telemetry_events  to service_role;
grant select, insert, update, delete on public.dead_letter_queue to service_role;

-- Staff read access for the operations dashboard. Users get a JWT with
-- app_metadata.lexhive_role = 'admin' | 'analyst' | 'agent'.
drop policy if exists "staff read leads" on public.leads;
create policy "staff read leads"
  on public.leads for select
  to authenticated
  using (coalesce(auth.jwt() -> 'app_metadata' ->> 'lexhive_role', '') in ('admin', 'analyst', 'agent'));

drop policy if exists "staff read consent" on public.lead_tcpa_consent;
create policy "staff read consent"
  on public.lead_tcpa_consent for select
  to authenticated
  using (coalesce(auth.jwt() -> 'app_metadata' ->> 'lexhive_role', '') in ('admin', 'analyst'));

drop policy if exists "staff read telemetry" on public.telemetry_events;
create policy "staff read telemetry"
  on public.telemetry_events for select
  to authenticated
  using (coalesce(auth.jwt() -> 'app_metadata' ->> 'lexhive_role', '') in ('admin', 'analyst'));

drop policy if exists "staff read dlq" on public.dead_letter_queue;
create policy "staff read dlq"
  on public.dead_letter_queue for select
  to authenticated
  using (coalesce(auth.jwt() -> 'app_metadata' ->> 'lexhive_role', '') in ('admin', 'analyst'));

-- ----------------------------------------------------------------------------
-- Operations helpers
-- ----------------------------------------------------------------------------

create or replace view public.unresolved_dead_letters as
select id, source, dedupe_key, error, attempts, status, last_seen_at, created_at
from public.dead_letter_queue
where resolved = false
order by created_at desc;

create or replace view public.funnel_daily_stats as
select
  date_trunc('day', submitted_at) as day,
  status,
  count(*) as leads,
  count(*) filter (where application_denied) as denied_claims,
  count(*) filter (where attorney_status = 'YES') as represented
from public.leads
group by 1, 2
order by 1 desc;
