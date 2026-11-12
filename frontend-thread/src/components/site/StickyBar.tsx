import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { trackClick } from '../../features/public/booking/bookingApi';
import { normaliseUgPhone } from '../../lib/phone';
import { useSiteSettings } from '../../lib/queries/site';
import { plainWhatsappUrl } from '../../lib/whatsapp';
import { Button } from '../ui/Button';
import styles from './StickyBar.module.css';

/** Call and WhatsApp bar for phones and tablets (spec 4.5). Hidden from 1040px by CSS. */
export function StickyBar() {
  const { t } = useTranslation('common');
  const { pathname } = useLocation();
  const { data: site } = useSiteSettings();
  const { phone, whatsapp } = site.business;
  const baseUrl = import.meta.env.VITE_API_URL ?? '';
  const [onFooter, setOnFooter] = useState(false);

  // Once the footer scrolls up to the dock, the dock takes the footer's colour so the two read as one surface.
  useEffect(() => {
    const footer = document.querySelector('footer');
    if (!footer || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setOnFooter(entry?.isIntersecting ?? false), {
      rootMargin: '0px 0px -76px 0px',
    });
    observer.observe(footer);
    return () => observer.disconnect();
  }, [pathname]);

  return (
    <div className={styles.bar} data-surface={onFooter ? 'footer' : undefined}>
      <Button
        href={`tel:${normaliseUgPhone(phone) ?? phone.replace(/\s/g, '')}`}
        fullWidth
        onClick={() => trackClick('call', pathname, baseUrl)}
      >
        {t('actions.callNow')}
      </Button>
      <Button
        href={plainWhatsappUrl(whatsapp)}
        variant="whatsapp"
        fullWidth
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => trackClick('whatsapp', pathname, baseUrl)}
      >
        {t('actions.whatsapp')}
      </Button>
    </div>
  );
}
