'use client';

import styles from './funnel.module.css';

interface ProgressProps {
  current: number;
  total: number;
  percent: number;
}

export function Progress({ current, total, percent }: ProgressProps) {
  return (
    <div className={styles.progress}>
      <div className={styles.progressMeta}>
        <span>
          Step {current} of {total}
        </span>
        <span>{percent}% complete</span>
      </div>
      <div
        role="progressbar"
        aria-label="Funnel progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${percent}% complete, step ${current} of ${total}`}
        className={styles.track}
      >
        <span className={styles.fill} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
