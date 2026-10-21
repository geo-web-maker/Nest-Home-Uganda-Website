import { useLocation } from 'react-router-dom';
import { trackClick } from '../../features/public/booking/bookingApi';
import { useSiteSettings } from '../../lib/queries/site';
import { plainWhatsappUrl } from '../../lib/whatsapp';
import { Button } from '../ui/Button';
import styles from './CtaBand.module.css';

type CtaBandProps = {
  heading: string;
  bookLabel: string;
  whatsappLabel: string;
};

/** End-of-page band (spec 4.18). Not used on Contact and Privacy. */
export function CtaBand({ heading, bookLabel, whatsappLabel }: CtaBandProps) {
  const { pathname } = useLocation();
  const { data: site } = useSiteSettings();

  return (
    <section className={styles.band}>
      <div className="container">
        <h2 className={styles.heading}>{heading}</h2>
        <div className={styles.actions}>
          <Button href="/contact">{bookLabel}</Button>
          <Button
            href={plainWhatsappUrl(site.business.whatsapp)}
            variant="whatsapp"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackClick('whatsapp', pathname, import.meta.env.VITE_API_URL ?? '')}
          >
            {whatsappLabel}
          </Button>
        </div>
      </div>
    </section>
  );
}
