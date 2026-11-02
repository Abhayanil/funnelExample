'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { emailStepSchema, type EmailStepValues } from '@/lib/leads/schema';
import { BackButton } from './StepCard';
import styles from './funnel.module.css';

interface EmailStepProps {
  title?: string;
  question: string;
  submitLabel?: string;
  canBack: boolean;
  onBack: () => void;
  onSubmit: (email: string) => void;
}

export default function EmailStep({ title, question, submitLabel, canBack, onBack, onSubmit }: EmailStepProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EmailStepValues>({
    resolver: zodResolver(emailStepSchema),
    mode: 'onTouched',
    reValidateMode: 'onChange',
    defaultValues: { email: '' },
  });

  return (
    <section aria-labelledby="email-heading">
      {title && <h1 className={styles.headline}>{title}</h1>}
      <h2 id="email-heading" data-step-heading tabIndex={-1} className={styles.question}>
        {question}
      </h2>
      <p className={styles.help}>Enter your email to get your results now. We never sell your information.</p>

      <form
        className={styles.form}
        noValidate
        onSubmit={handleSubmit(values => onSubmit(values.email.trim()))}
      >
        <div className={styles.field}>
          <label htmlFor="email" className={styles.label}>
            Email address
          </label>
          <input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? 'email-error' : undefined}
            className={`${styles.input} ${errors.email ? styles.inputError : ''}`}
            data-testid="input-email"
            {...register('email')}
          />
          {errors.email && (
            <p id="email-error" role="alert" className={styles.errorText}>
              {errors.email.message}
            </p>
          )}
        </div>

        <button type="submit" className={styles.submit} data-testid="email-submit">
          {submitLabel ?? 'Send my results'}
        </button>
      </form>

      {canBack && (
        <div className={styles.backRow}>
          <BackButton onClick={onBack} />
        </div>
      )}
    </section>
  );
}
