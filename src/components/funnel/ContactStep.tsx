'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { contactStepSchema, type ContactStepValues } from '@/lib/leads/schema';
import { CONSENT_SHORT, CONSENT_TEXT, CONSENT_VERSION } from '@/lib/leads/consent';
import { BackButton } from './StepCard';
import styles from './funnel.module.css';

interface ContactStepProps {
  question: string;
  submitLabel?: string;
  canBack: boolean;
  submitting: boolean;
  serverError?: string;
  onBack: () => void;
  onSubmit: (values: ContactStepValues) => void;
}

export default function ContactStep({
  question,
  submitLabel,
  canBack,
  submitting,
  serverError,
  onBack,
  onSubmit,
}: ContactStepProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ContactStepValues>({
    resolver: zodResolver(contactStepSchema),
    mode: 'onTouched',
    reValidateMode: 'onChange',
    defaultValues: { firstName: '', lastName: '', phone: '', consent: false },
  });

  return (
    <section aria-labelledby="contact-heading">
      <h2 id="contact-heading" data-step-heading tabIndex={-1} className={styles.question}>
        {question}
      </h2>
      <p className={styles.help}>Your details stay confidential and are only shared with the advocates who can help.</p>

      <form className={styles.form} noValidate onSubmit={handleSubmit(onSubmit)}>
        <div className={styles.nameGrid}>
          <div className={styles.field}>
            <label htmlFor="firstName" className={styles.label}>
              First name
            </label>
            <input
              id="firstName"
              autoComplete="given-name"
              placeholder="Jordan"
              aria-invalid={Boolean(errors.firstName)}
              aria-describedby={errors.firstName ? 'firstName-error' : undefined}
              className={`${styles.input} ${errors.firstName ? styles.inputError : ''}`}
              data-testid="input-firstName"
              {...register('firstName')}
            />
            {errors.firstName && (
              <p id="firstName-error" role="alert" className={styles.errorText}>
                {errors.firstName.message}
              </p>
            )}
          </div>

          <div className={styles.field}>
            <label htmlFor="lastName" className={styles.label}>
              Last name
            </label>
            <input
              id="lastName"
              autoComplete="family-name"
              placeholder="Rivera"
              aria-invalid={Boolean(errors.lastName)}
              aria-describedby={errors.lastName ? 'lastName-error' : undefined}
              className={`${styles.input} ${errors.lastName ? styles.inputError : ''}`}
              data-testid="input-lastName"
              {...register('lastName')}
            />
            {errors.lastName && (
              <p id="lastName-error" role="alert" className={styles.errorText}>
                {errors.lastName.message}
              </p>
            )}
          </div>
        </div>

        <div className={styles.field}>
          <label htmlFor="phone" className={styles.label}>
            Mobile number
          </label>
          <input
            id="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="(555) 123-4567"
            aria-invalid={Boolean(errors.phone)}
            aria-describedby={errors.phone ? 'phone-error' : 'phone-hint'}
            className={`${styles.input} ${errors.phone ? styles.inputError : ''}`}
            data-testid="input-phone"
            {...register('phone')}
          />
          <p id="phone-hint" className={styles.hint}>
            US numbers only. We will not call before you submit.
          </p>
          {errors.phone && (
            <p id="phone-error" role="alert" className={styles.errorText}>
              {errors.phone.message}
            </p>
          )}
        </div>

        <div className={styles.consent}>
          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              className={styles.checkbox}
              aria-describedby="consent-text"
              aria-invalid={Boolean(errors.consent)}
              data-testid="input-consent"
              {...register('consent')}
            />
            <span>{CONSENT_SHORT}</span>
          </label>
          {errors.consent && (
            <p role="alert" className={styles.errorText}>
              {errors.consent.message}
            </p>
          )}
          <p id="consent-text" className={styles.consentText}>
            {CONSENT_TEXT}
          </p>
          <p className={styles.consentMeta}>
            Consent version <code>{CONSENT_VERSION}</code> · A timestamped audit record (IP address, user agent,
            and consent text) is stored with your submission.
          </p>
        </div>

        {serverError && (
          <p role="alert" className={styles.serverError} data-testid="submit-error">
            {serverError}
          </p>
        )}

        <button type="submit" className={styles.submit} disabled={submitting} data-testid="contact-submit">
          {submitting ? (
            <>
              <span className={styles.spinner} aria-hidden="true" />
              Submitting…
            </>
          ) : (
            submitLabel ?? 'See what I am eligible for'
          )}
        </button>
      </form>

      {canBack && !submitting && (
        <div className={styles.backRow}>
          <BackButton onClick={onBack} />
        </div>
      )}
    </section>
  );
}
