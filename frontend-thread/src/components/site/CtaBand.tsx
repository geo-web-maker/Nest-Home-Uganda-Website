import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { trackClick } from '../../features/public/booking/bookingApi';
import { normaliseUgPhone } from '../../lib/phone';
import { useSiteSettings } from '../../lib/queries/site';
import { plainWhatsappUrl } from '../../lib/whatsapp';
import { Button } from '../ui/Button';
import { SealLink } from '../thread/ThreadParts';
import styles from './CtaBand.module.css';

type CtaBandProps = { heading: string; bookLabel: string; whatsappLabel: string };
export function CtaBand({ heading, bookLabel, whatsappLabel }: CtaBandProps) {
  const { pathname } = useLocation();
  const { t } = useTranslation('common');
  const { data: site } = useSiteSettings();
  const { phone, whatsapp } = site.business;
  const tel = `tel:${normaliseUgPhone(phone) ?? phone.replace(/\s/g, '')}`;
  return (
    <section className={`${styles.band} on-cta`}>
      <div className={`container ${styles.inner}`}>
        <p className={styles.eyebrow}>{t('actions.contact')}</p>
        <h2 className={styles.heading}>{heading}</h2>
        <a className={styles.phone} href={tel}>{phone}</a>
        <SealLink href={tel} label={`${t('actions.call')} ${phone}`} />
        <div className={styles.actions}>
          <Button href="/contact" variant="forest">{bookLabel}</Button>
          <Button href={plainWhatsappUrl(whatsapp)} variant="whatsapp" target="_blank" rel="noopener noreferrer" onClick={() => trackClick('whatsapp', pathname, import.meta.env.VITE_API_URL ?? '')}>{whatsappLabel}</Button>
        </div>
      </div>
    </section>
  );
}
