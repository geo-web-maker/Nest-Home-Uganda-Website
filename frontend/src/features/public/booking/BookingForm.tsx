import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import type { FieldErrors } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { Button } from '../../../components/ui/Button';
import { Checkbox } from '../../../components/ui/Checkbox';
import { Chip } from '../../../components/ui/Chip';
import { Field } from '../../../components/ui/Field';
import { plainWhatsappUrl } from '../../../lib/whatsapp';
import type { BookingCopy } from '../../../locales/en/booking';
import { BookingError } from './bookingApi';
import type { BookingResult } from './bookingApi';
import styles from './BookingForm.module.css';
import { NOTE_MAX, RELATIONSHIPS, START_OPTIONS, createBookingSchema } from './bookingSchema';
import type { BookingPayload, BookingValues } from './bookingSchema';

export type BookingFormProps = {
  copy: BookingCopy;
  /** Published services, in display order. */
  services: ReadonlyArray<{ id: string; name: string }>;
  /** Pre-selected on a service page. */
  preselectedServiceIds?: string[];
  /** Suggestions for the area field (the Areas list). Free text stays allowed. */
  areaSuggestions?: string[];
  /** business.whatsapp, digits only. */
  whatsappDigits: string;
  /** e.g. `tel:+256787499988` */
  callHref: string;
  /** forms.open_whatsapp_after */
  openWhatsappAfter?: boolean;
  /** Sends the enquiry. Throw `BookingError` on failure. */
  submit: (payload: BookingPayload) => Promise<BookingResult>;
  /** Called when a visitor taps a Call or WhatsApp button (click tracking). */
  onContactClick?: (channel: 'call' | 'whatsapp') => void;
};

type Phase = 'editing' | 'sending' | 'sent' | 'failed' | 'rate_limited';

export function BookingForm({
  copy,
  services,
  preselectedServiceIds = [],
  areaSuggestions = [],
  whatsappDigits,
  callHref,
  openWhatsappAfter = false,
  submit,
  onContactClick,
}: BookingFormProps) {
  const schema = useMemo(() => createBookingSchema(copy.errors), [copy.errors]);
  const [phase, setPhase] = useState<Phase>('editing');
  const [result, setResult] = useState<BookingResult | null>(null);
  const thanksRef = useRef<HTMLHeadingElement>(null);
  const firstChipRef = useRef<HTMLDivElement>(null);
  const areaListId = 'booking-areas';

  const {
    register,
    control,
    handleSubmit,
    setError,
    watch,
    formState: { errors },
  } = useForm<BookingValues, unknown, BookingPayload>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      phone: '',
      relationship: undefined,
      service_ids: preselectedServiceIds,
      area: '',
      preferred_start: '',
      note: '',
      consent: undefined,
      website: '',
    },
  });
  const noteLength = (watch('note') ?? '').length;

  // `register` also returns `required`, `min` and so on, which clash with Field's own typed
  // `required` + `requiredLabel`. Field needs only these four.
  const bind = (name: keyof BookingValues) => {
    const { onChange, onBlur, ref, name: fieldName } = register(name);
    return { onChange, onBlur, ref, name: fieldName };
  };

  useEffect(() => {
    if (phase === 'sent') thanksRef.current?.focus();
  }, [phase]);

  const onValid = async (payload: BookingPayload) => {
    setPhase('sending');
    try {
      const done = await submit(payload);
      setResult(done);
      setPhase('sent');
      if (openWhatsappAfter) window.open(done.whatsappUrl, '_blank', 'noopener');
    } catch (error) {
      if (error instanceof BookingError && error.kind === 'rate_limited') {
        setPhase('rate_limited');
      } else if (error instanceof BookingError && error.kind === 'validation') {
        for (const [field, message] of Object.entries(error.fields)) {
          if (field in payload) setError(field as keyof BookingValues, { message });
        }
        setPhase('editing');
      } else {
        setPhase('failed'); // the form stays mounted, so nothing the visitor typed is lost
      }
    }
  };

  // Field refs make react-hook-form focus the first invalid control. Chips are not
  // registered, so when the care list is the problem we focus it ourselves.
  const onInvalid = (invalid: FieldErrors<BookingValues>) => {
    if (invalid.service_ids && Object.keys(invalid).length === 1) {
      firstChipRef.current?.querySelector('button')?.focus();
    }
  };

  if (phase === 'sent' && result) {
    return (
      <section className={styles.card} data-state="success" aria-labelledby="booking-thanks">
        <h2 id="booking-thanks" ref={thanksRef} tabIndex={-1} className={styles.title}>
          {copy.thanksHeading}
        </h2>
        <Button
          variant="whatsapp"
          fullWidth
          href={result.whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => onContactClick?.('whatsapp')}
        >
          {copy.continueOnWhatsapp}
        </Button>
        <p className={styles.reference}>{copy.referenceLine(result.reference)}</p>
      </section>
    );
  }

  const busy = phase === 'sending';
  const failed = phase === 'failed' || phase === 'rate_limited';

  return (
    <form className={styles.card} onSubmit={handleSubmit(onValid, onInvalid)} noValidate>
      <h2 className={styles.title}>{copy.title}</h2>
      <Button
        variant="whatsapp"
        fullWidth
        href={plainWhatsappUrl(whatsappDigits)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => onContactClick?.('whatsapp')}
      >
        {copy.chatOnWhatsapp}
      </Button>
      <p className={styles.or}>{copy.or}</p>

      <Field
        label={copy.name}
        required
        requiredLabel={copy.required}
        autoComplete="name"
        error={errors.name?.message}
        {...bind('name')}
      />
      <Field
        label={copy.phone}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        required
        requiredLabel={copy.required}
        error={errors.phone?.message}
        {...bind('phone')}
      />
      <Field
        kind="select"
        label={copy.relationship}
        required
        requiredLabel={copy.required}
        error={errors.relationship?.message}
        defaultValue=""
        {...bind('relationship')}
      >
        <option value="" disabled>
          {copy.preferredStartPlaceholder}
        </option>
        {RELATIONSHIPS.map((key) => (
          <option key={key} value={key}>
            {copy.relationshipOptions[key]}
          </option>
        ))}
      </Field>

      <Controller
        control={control}
        name="service_ids"
        render={({ field }) => (
          <fieldset
            className={styles.care}
            aria-describedby={errors.service_ids ? 'care-error' : undefined}
          >
            <legend className={styles.legend}>
              {copy.careNeeded} {copy.required}
            </legend>
            <div className={styles.chips} ref={firstChipRef}>
              {services.map((service) => (
                <Chip
                  key={service.id}
                  selected={field.value.includes(service.id)}
                  onToggle={() =>
                    field.onChange(
                      field.value.includes(service.id)
                        ? field.value.filter((id) => id !== service.id)
                        : [...field.value, service.id],
                    )
                  }
                >
                  {service.name}
                </Chip>
              ))}
            </div>
            {errors.service_ids ? (
              <p id="care-error" className={styles.error} role="alert">
                {errors.service_ids.message}
              </p>
            ) : null}
          </fieldset>
        )}
      />

      <Field
        label={copy.area}
        required
        requiredLabel={copy.required}
        autoComplete="address-level2"
        list={areaListId}
        error={errors.area?.message}
        {...bind('area')}
      />
      <datalist id={areaListId}>
        {areaSuggestions.map((area) => (
          <option key={area} value={area} />
        ))}
      </datalist>

      <Field kind="select" label={copy.preferredStart} {...bind('preferred_start')}>
        <option value="">{copy.preferredStartPlaceholder}</option>
        {START_OPTIONS.map((key) => (
          <option key={key} value={key}>
            {copy.preferredStartOptions[key]}
          </option>
        ))}
      </Field>

      <p className={styles.medicalDetailsWarning} role="note">
        {copy.medicalDetailsWarning}
      </p>
      <Field
        kind="textarea"
        label={copy.note}
        maxLength={NOTE_MAX + 50}
        aria-describedby="note-hint"
        error={errors.note?.message}
        {...bind('note')}
      />
      <p id="note-hint" className={styles.hint}>
        {copy.noteHint} {copy.noteCount(noteLength, NOTE_MAX)}
      </p>

      <Checkbox
        className={styles.consent}
        aria-required="true"
        label={
          <>
            {copy.consent} <Link to="/privacy">{copy.privacyLink}</Link>
          </>
        }
        {...register('consent')}
      />
      {errors.consent ? (
        <p className={styles.error} role="alert">
          {errors.consent.message}
        </p>
      ) : null}

      {/* Honeypot: off screen, skipped by keyboards and screen readers. Humans never fill it. */}
      <div className={styles.trap} aria-hidden="true">
        <label>
          {copy.honeypotLabel}
          <input type="text" tabIndex={-1} autoComplete="off" {...register('website')} />
        </label>
      </div>

      {failed ? (
        <div className={styles.failure} role="alert">
          <p>{phase === 'rate_limited' ? copy.rateLimited : copy.sendFailed}</p>
          <div className={styles.fallbacks}>
            <Button href={callHref} onClick={() => onContactClick?.('call')}>
              {copy.callNow}
            </Button>
            <Button
              variant="whatsapp"
              href={plainWhatsappUrl(whatsappDigits)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => onContactClick?.('whatsapp')}
            >
              {copy.chatOnWhatsapp}
            </Button>
          </div>
        </div>
      ) : null}

      <Button type="submit" fullWidth disabled={busy} aria-busy={busy}>
        {busy ? copy.sending : copy.send}
      </Button>
    </form>
  );
}
