import { Controller } from 'react-hook-form';
import type { Control, FieldErrors } from 'react-hook-form';
import type { Ref } from 'react';
import { Chip } from '../../../components/ui/Chip';
import type { BookingCopy } from '../../../locales/en/booking';
import type { BookingPayload, BookingValues } from './bookingSchema';
import styles from './BookingForm.module.css';

type BookingServiceSelectorProps = {
  control: Control<BookingValues, unknown, BookingPayload>;
  errors: FieldErrors<BookingValues>;
  services: ReadonlyArray<{ id: string; name: string }>;
  copy: BookingCopy;
  firstChipRef: Ref<HTMLDivElement>;
};

/** Service multi-select, including its validation message and invalid-field focus target. */
export function BookingServiceSelector({
  control,
  errors,
  services,
  copy,
  firstChipRef,
}: BookingServiceSelectorProps) {
  return (
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
  );
}
