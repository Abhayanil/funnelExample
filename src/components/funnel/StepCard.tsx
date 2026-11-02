'use client';

import type { FunnelStep } from '@/lib/funnel/types';
import { Progress } from './Progress';
import styles from './funnel.module.css';

function Arrow() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={styles.optionArrow}>
      <path d="M7 4l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className={styles.back} onClick={onClick}>
      <svg viewBox="0 0 20 20" aria-hidden="true" className={styles.backIcon}>
        <path d="M13 4L7 10l6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Back
    </button>
  );
}

interface StepCardProps {
  step: FunnelStep;
  selected?: string;
  progress: { current: number; total: number; percent: number };
  onSelect: (label: string) => void;
  onBack: () => void;
  canBack: boolean;
}

export default function StepCard({ step, selected, progress, onSelect, onBack, canBack }: StepCardProps) {
  const isLanding = step.kind === 'landing';

  return (
    <section aria-labelledby={`${step.id}-heading`}>
      <Progress current={progress.current} total={progress.total} percent={progress.percent} />

      {isLanding && <p className={styles.eyebrow}>Free 60-second eligibility check</p>}
      {step.headline && <h1 className={styles.headline}>{step.headline}</h1>}
      {step.subhead && <p className={styles.subhead}>{step.subhead}</p>}

      <h2
        id={`${step.id}-heading`}
        data-step-heading
        tabIndex={-1}
        className={styles.question}
      >
        {step.question}
      </h2>
      {step.help && <p className={styles.help}>{step.help}</p>}

      <fieldset className={styles.options}>
        <legend className="sr-only">{step.question}</legend>
        {(step.options ?? []).map(option => {
          const isSelected = selected === option.label;
          return (
            <label
              key={option.label}
              className={`${styles.option} ${isSelected ? styles.optionSelected : ''}`}
              data-testid={`option-${option.label}`}
            >
              <input
                type="radio"
                name={step.id}
                value={option.label}
                checked={isSelected}
                onChange={() => onSelect(option.label)}
                onClick={() => {
                  /* A checked radio does not emit `change`; allow re-picking the
                     same answer after navigating back so the flow advances. */
                  if (isSelected) onSelect(option.label);
                }}
                className={styles.optionInput}
              />
              <span className={styles.optionLabel}>{option.label}</span>
              <Arrow />
            </label>
          );
        })}
      </fieldset>

      {canBack && (
        <div className={styles.backRow}>
          <BackButton onClick={onBack} />
        </div>
      )}
    </section>
  );
}
