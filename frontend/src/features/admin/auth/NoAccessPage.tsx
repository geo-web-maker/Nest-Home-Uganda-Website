import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/ui/Button';
import { normaliseUgPhone } from '../../../lib/phone';
import { useSiteSettings } from '../../../lib/queries/site';
import styles from './LoginPage.module.css';
import { useAuth } from './useAuth';

/** Shown to a signed-in user who can reach no admin screen (spec 12.3). */
export function NoAccessPage() {
  const { t } = useTranslation('admin');
  const { logout } = useAuth();
  const { data: site } = useSiteSettings();
  const normalised = normaliseUgPhone(site.business.phone);

  return (
    <main className={styles.screen}>
      <div className={styles.card}>
        <h1 className={styles.title}>{t('noAccess.title')}</h1>
        <p>
          {t('noAccess.callLabel')}{' '}
          <a href={normalised ? `tel:${normalised}` : undefined}>{site.business.phone}</a>
        </p>
        <Button type="button" variant="outline" onClick={() => void logout()}>
          {t('noAccess.signOut')}
        </Button>
      </div>
    </main>
  );
}
