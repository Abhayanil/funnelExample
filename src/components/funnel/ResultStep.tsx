'use client';

import { graph } from '@/lib/funnel/engine';
import styles from './funnel.module.css';

interface ResultStepProps {
  leadId?: string;
  answers: Record<string, string>;
  onRestart: () => void;
}

const SUMMARY_STEPS = [
  'page_uhs14w',
  'page_sozf2w',
  'receiving_ben',
  'page_6dkfid',
  'attorney',
  'page_8w2qbu',
];

export default function ResultStep({ leadId, answers, onRestart }: ResultStepProps) {
  const rows = SUMMARY_STEPS.map(id => {
    const step = graph.steps.find(candidate => candidate.id === id);
    return step && answers[id] ? { label: step.question, value: answers[id] } : null;
  }).filter(Boolean) as Array<{ label: string; value: string }>;

  return (
    <section aria-labelledby="result-heading" className={styles.result}>
      <div className={styles.resultIcon} aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M5 13l4 4L19 7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <h1 id="result-heading" data-step-heading tabIndex={-1} className={styles.headline}>
        Thank you — you&apos;re all set
      </h1>
      <p className={styles.subhead}>
        A licensed advocate will review your answers and call you within one business day. Keep your phone
        nearby.
      </p>

      {leadId && (
        <p className={styles.reference}>
          Reference <code data-testid="lead-reference">{leadId.slice(0, 8).toUpperCase()}</code>
        </p>
      )}

      {rows.length > 0 && (
        <dl className={styles.summary}>
          {rows.map(row => (
            <div key={row.label} className={styles.summaryRow}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <button type="button" className={styles.restart} onClick={onRestart}>
        Start a new check
      </button>
    </section>
  );
}
