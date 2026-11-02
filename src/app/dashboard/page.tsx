import Link from 'next/link';
import { getAnalyticsSnapshot, type AnalyticsSnapshot, type RangeDays } from '@/lib/analytics/snapshot';
import styles from './dashboard.module.css';

export const dynamic = 'force-dynamic';

const RANGES: RangeDays[] = [7, 30, 90];
const MAX_ANSWER_CARDS = 8;
const MAX_OPTIONS_PER_QUESTION = 4;

function parseRange(value: string | string[] | undefined): RangeDays {
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  return RANGES.includes(parsed as RangeDays) ? (parsed as RangeDays) : 7;
}

function formatCount(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${Math.round(seconds % 60)}s`;
  }
  return `${(seconds / 3600).toFixed(1)}h`;
}

function formatTimestamp(iso: string): string {
  return `${new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(iso))} UTC`;
}

function Kpi({
  label,
  value,
  hint,
  testId,
}: {
  label: string;
  value: string;
  hint: string;
  testId: string;
}) {
  return (
    <div className={styles.kpi}>
      <span className={styles.kpiLabel}>{label}</span>
      <span className={styles.kpiValue} data-testid={testId}>
        {value}
      </span>
      <span className={styles.kpiHint}>{hint}</span>
    </div>
  );
}

function Panel({
  title,
  hint,
  children,
  testId,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <section className={styles.panel} data-testid={testId}>
      <header className={styles.panelHeader}>
        <h2 className={styles.panelTitle}>{title}</h2>
        {hint && <p className={styles.panelHint}>{hint}</p>}
      </header>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className={styles.empty}>{children}</p>;
}

function TrendChart({ trend }: { trend: AnalyticsSnapshot['trend'] }) {
  const max = Math.max(...trend.map(bucket => Math.max(bucket.leads, bucket.sessions)), 1);

  return (
    <div className={styles.chartBlock}>
      <div className={styles.legend}>
        <span className={styles.legendItem}>
          <span className={`${styles.dot} ${styles.dotLeads}`} aria-hidden="true" />
          Leads
        </span>
        <span className={styles.legendItem}>
          <span className={`${styles.dot} ${styles.dotSessions}`} aria-hidden="true" />
          Sessions
        </span>
      </div>
      <div
        className={styles.chart}
        role="img"
        aria-label={`Leads and sessions per ${trend.length > 15 ? 'week' : 'day'}`}
      >
        {trend.map(bucket => (
          <div className={styles.barGroup} key={bucket.label}>
            <div className={styles.bars}>
              <span
                className={`${styles.bar} ${styles.barLeads}`}
                style={{ height: `${(bucket.leads / max) * 100}%` }}
                title={`${bucket.label}: ${bucket.leads} lead${bucket.leads === 1 ? '' : 's'}`}
              />
              <span
                className={`${styles.bar} ${styles.barSessions}`}
                style={{ height: `${(bucket.sessions / max) * 100}%` }}
                title={`${bucket.label}: ${bucket.sessions} session${bucket.sessions === 1 ? '' : 's'}`}
              />
            </div>
            <span className={styles.barLabel}>{bucket.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const className =
    status === 'synced'
      ? styles.chipSynced
      : status === 'failed'
        ? styles.chipFailed
        : styles.chipNew;
  return <span className={`${styles.chip} ${className}`}>{status}</span>;
}

function DashboardBody({ snapshot }: { snapshot: AnalyticsSnapshot }) {
  const topAnswers = snapshot.answers.slice(0, MAX_ANSWER_CARDS);

  return (
    <>
      {snapshot.dataSource === 'memory' && (
        <p className={`${styles.banner} ${styles.bannerWarning}`} role="status">
          Using the in-memory store — leads disappear when the server restarts. Set
          <code> SUPABASE_URL </code> and <code> SUPABASE_SERVICE_ROLE_KEY </code> to persist them.
        </p>
      )}

      <section className={styles.kpis} aria-label="Key metrics">
        <Kpi
          label={`Leads · ${snapshot.rangeDays}d`}
          value={formatCount(snapshot.totals.leads)}
          hint="Unique captured submissions"
          testId="kpi-leads"
        />
        <Kpi
          label="Sessions"
          value={formatCount(snapshot.totals.sessions)}
          hint="Distinct ids with events or a lead"
          testId="kpi-sessions"
        />
        <Kpi
          label="Conversion"
          value={formatPercent(snapshot.totals.conversionRate)}
          hint="Leads ÷ sessions in range"
          testId="kpi-conversion"
        />
        <Kpi
          label="Median time to lead"
          value={formatDuration(snapshot.totals.medianTimeToLeadSeconds)}
          hint="First tracked event → Lead"
          testId="kpi-time"
        />
        <Kpi
          label="Tracked events"
          value={formatCount(snapshot.totals.trackedEvents)}
          hint="Step beacons received server-side"
          testId="kpi-events"
        />
      </section>

      <div className={styles.grid}>
        <Panel
          title={snapshot.rangeDays > 30 ? 'Leads per week' : 'Leads per day'}
          hint={`${snapshot.trend[0]?.label ?? ''} – ${snapshot.trend.at(-1)?.label ?? ''}`}
          testId="trend-panel"
        >
          {snapshot.totals.leads === 0 && snapshot.totals.sessions === 0 ? (
            <Empty>No activity in this range yet.</Empty>
          ) : (
            <TrendChart trend={snapshot.trend} />
          )}
        </Panel>

        <Panel
          title="Traffic sources"
          hint="utm_source, then referrer host, then direct"
          testId="sources-panel"
        >
          {snapshot.sources.length === 0 ? (
            <Empty>No attribution data yet.</Empty>
          ) : (
            <ul className={styles.sources}>
              {snapshot.sources.map(source => (
                <li key={source.source} className={styles.sourceRow}>
                  <span className={styles.sourceName}>{source.source}</span>
                  <span className={styles.sourceBar} aria-hidden="true">
                    <span
                      className={styles.sourceFill}
                      style={{ width: `${Math.max(source.share * 100, 2)}%` }}
                    />
                  </span>
                  <span className={styles.sourceCount}>
                    {formatCount(source.leads)} · {formatPercent(source.share)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel
        title="Step reach & timing"
        hint="Sessions reaching each step, and median time to answer it. Branches mean not every session sees every step."
        testId="steps-panel"
      >
        {snapshot.steps.length === 0 ? (
          <Empty>No step events in this range.</Empty>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Step</th>
                  <th scope="col">Sessions</th>
                  <th scope="col">Reach</th>
                  <th scope="col">Median time</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.steps.map(step => (
                  <tr key={step.stepId}>
                    <td>
                      <span className={styles.stepQuestion}>{step.question}</span>
                      <code className={styles.stepId}>{step.stepId}</code>
                    </td>
                    <td className={styles.numeric}>{formatCount(step.sessions)}</td>
                    <td>
                      <span className={styles.reachCell}>
                        <span className={styles.reachBar} aria-hidden="true">
                          <span
                            className={styles.reachFill}
                            style={{ width: `${Math.max(step.reachRate * 100, 2)}%` }}
                          />
                        </span>
                        <span className={styles.numeric}>{formatPercent(step.reachRate)}</span>
                      </span>
                    </td>
                    <td className={styles.numeric}>{formatDuration(step.medianSeconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel
        title="Answer distribution"
        hint={`Top ${topAnswers.length} of ${snapshot.answers.length} answered questions, from captured leads.`}
        testId="answers-panel"
      >
        {topAnswers.length === 0 ? (
          <Empty>No qualified leads in this range yet.</Empty>
        ) : (
          <div className={styles.answersGrid}>
            {topAnswers.map(entry => (
              <article key={entry.stepId} className={styles.answerCard}>
                <header className={styles.answerHeader}>
                  <h3>{entry.question}</h3>
                  <span className={styles.answerTotal}>
                    {formatCount(entry.total)} response{entry.total === 1 ? '' : 's'}
                  </span>
                </header>
                <ul className={styles.optionList}>
                  {entry.options.slice(0, MAX_OPTIONS_PER_QUESTION).map(option => (
                    <li key={option.label} className={styles.optionRow}>
                      <span className={styles.optionLabel} title={option.label}>
                        {option.label}
                      </span>
                      <span className={styles.optionBar} aria-hidden="true">
                        <span
                          className={styles.optionFill}
                          style={{ width: `${Math.max(option.share * 100, 2)}%` }}
                        />
                      </span>
                      <span className={styles.optionCount}>
                        {formatCount(option.count)} · {formatPercent(option.share)}
                      </span>
                    </li>
                  ))}
                </ul>
                {entry.options.length > MAX_OPTIONS_PER_QUESTION && (
                  <p className={styles.moreOptions}>
                    +{entry.options.length - MAX_OPTIONS_PER_QUESTION} more options
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </Panel>

      <Panel
        title="Recent leads"
        hint="Contact details are masked. Full records live in Supabase (RLS-protected)."
        testId="recent-panel"
      >
        {snapshot.recentLeads.length === 0 ? (
          <Empty>No leads in this range yet.</Empty>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Lead</th>
                  <th scope="col">Contact</th>
                  <th scope="col">Profile</th>
                  <th scope="col">Attorney</th>
                  <th scope="col">Status</th>
                  <th scope="col">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.recentLeads.map(lead => (
                  <tr key={lead.id}>
                    <td className={styles.leadName}>{lead.name}</td>
                    <td>
                      <span className={styles.contactLine}>{lead.email}</span>
                      <span className={styles.contactLine}>{lead.phone}</span>
                    </td>
                    <td>
                      {[lead.ageRange, lead.maritalStatus].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td>{lead.attorneyStatus ?? '—'}</td>
                    <td>
                      <StatusChip status={lead.status} />
                    </td>
                    <td className={styles.numeric}>{formatTimestamp(lead.submittedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string | string[] }>;
}) {
  const params = await searchParams;
  const range = parseRange(params.range);

  let snapshot: AnalyticsSnapshot | null = null;
  let error: string | null = null;

  try {
    snapshot = await getAnalyticsSnapshot(range);
  } catch (cause) {
    error = cause instanceof Error ? cause.message : 'Unknown analytics error';
  }

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.wrap}>
          <div className={styles.brandRow}>
            <div className={styles.brand}>
              <span className={styles.mark} aria-hidden="true">
                LH
              </span>
              <span className={styles.brandText}>
                LexHive
                <span className={styles.brandSub}>Lead analytics · internal</span>
              </span>
            </div>
            <nav className={styles.nav} aria-label="Dashboard links">
              <Link className={styles.navLink} href="/">
                View funnel
              </Link>
            </nav>
          </div>
        </div>
      </header>

      <main className={`${styles.wrap} ${styles.main}`}>
        <div className={styles.titleRow}>
          <div>
            <h1 className={styles.title}>Lead analytics</h1>
            <p className={styles.lede}>
              Consolidated view of captured leads, funnel reach, answer mix and journey timing.
            </p>
          </div>
          <nav className={styles.rangeTabs} aria-label="Date range">
            {RANGES.map(value => (
              <Link
                key={value}
                href={`/dashboard?range=${value}`}
                aria-current={value === range ? 'page' : undefined}
                className={`${styles.tab} ${value === range ? styles.tabActive : ''}`}
              >
                {value}d
              </Link>
            ))}
          </nav>
        </div>

        {error ? (
          <section className={styles.errorPanel} role="alert">
            <h2>Analytics unavailable</h2>
            <p>{error}</p>
            <p className={styles.errorHint}>
              Check <code>SUPABASE_URL</code> / <code>SUPABASE_SERVICE_ROLE_KEY</code>, then apply{' '}
              <code>supabase/schema.sql</code>. In local development without Supabase the
              in-memory store is used instead.
            </p>
          </section>
        ) : snapshot ? (
          <DashboardBody snapshot={snapshot} />
        ) : null}
      </main>

      <footer className={styles.footer}>
        <div className={`${styles.wrap} ${styles.footerInner}`}>
          <span>
            Data source: <strong>{snapshot ? snapshot.dataSource : 'unavailable'}</strong>
            {snapshot && snapshot.totals.failedLeads > 0
              ? ` · ${snapshot.totals.failedLeads} lead(s) marked failed`
              : ''}
          </span>
          <span>{snapshot ? `Generated ${formatTimestamp(snapshot.generatedAt)}` : '—'}</span>
        </div>
      </footer>
    </div>
  );
}
