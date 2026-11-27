import { ButtonGroup } from '@shared/components/dialogs/ButtonGroup';
import { Button } from '@shared/components/ui/Button';
import { Field } from '@shared/components/ui/Field';
import type { Issued } from './types';
import type { Translate } from './userManagementShared';
import styles from './UsersPage.module.css';

export function IssuedCredentialsPanel({
  issued,
  copied,
  t,
  onCopied,
  onDismiss,
}: {
  issued: { name: string } & Issued;
  copied: boolean;
  t: Translate;
  onCopied: () => void;
  onDismiss: () => void;
}) {
  const copyPassword = () => {
    void navigator.clipboard?.writeText(issued.temp_password ?? '').then(onCopied);
  };

  return (
    <section className={styles.editor} aria-live="polite">
      <h2>{t('users.issuedHeading', { name: issued.name })}</h2>
      {Object.entries(issued.delivered ?? {}).map(([channel, state]) => (
        <p key={channel} role={state === 'failed' ? 'alert' : undefined}>
          {t(`users.delivery.${channel}`)}: {t(`users.outcome.${state}`)}
        </p>
      ))}
      {issued.temp_password ? (
        <>
          <Field
            label={t('users.issuedTemp')}
            value={issued.temp_password}
            readOnly
            onFocus={(event) => event.currentTarget.select()}
          />
          <p>{t('users.issuedTempNote')}</p>
          <Button type="button" variant="outline" onClick={copyPassword}>
            {copied ? t('users.copied') : t('users.copy')}
          </Button>
        </>
      ) : null}
      <ButtonGroup>
        <Button type="button" onClick={onDismiss}>
          {t('users.dismiss')}
        </Button>
      </ButtonGroup>
    </section>
  );
}
