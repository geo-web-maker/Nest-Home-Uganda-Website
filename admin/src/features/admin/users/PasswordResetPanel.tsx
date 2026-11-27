import type { Dispatch, SetStateAction } from 'react';
import { ButtonGroup } from '@shared/components/dialogs/ButtonGroup';
import { Button } from '@shared/components/ui/Button';
import { Checkbox } from '@shared/components/ui/Checkbox';
import type { AdminUser, Delivery } from './types';
import { DELIVERIES, toggleDelivery, type Translate } from './userManagementShared';
import styles from './UsersPage.module.css';

export function PasswordResetPanel({
  resetting,
  resetDelivery,
  setResetDelivery,
  isPending,
  errorText,
  t,
  onSubmit,
  onCancel,
}: {
  resetting: AdminUser;
  resetDelivery: Delivery[];
  setResetDelivery: Dispatch<SetStateAction<Delivery[]>>;
  isPending: boolean;
  errorText: string | null;
  t: Translate;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <section className={styles.editor}>
      <h2>{t('users.resetHeading', { name: resetting.name })}</h2>
      <fieldset>
        <legend>{t('users.deliveryLegend')}</legend>
        {DELIVERIES.map((delivery) => (
          <Checkbox
            key={delivery}
            label={t(`users.delivery.${delivery}`)}
            checked={resetDelivery.includes(delivery)}
            onChange={(event) =>
              setResetDelivery((old) => toggleDelivery(old, delivery, event.target.checked))
            }
          />
        ))}
      </fieldset>
      {errorText && <p role="alert">{errorText}</p>}
      <ButtonGroup>
        <Button type="button" disabled={isPending || resetDelivery.length === 0} onClick={onSubmit}>
          {t('users.resetSend')}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </ButtonGroup>
    </section>
  );
}
