import { useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { trackClick } from '../../features/public/booking/bookingApi';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import { useScrollVars } from '../../hooks/useScrollVars';
import { normaliseUgPhone } from '../../lib/phone';
import { useSiteSettings } from '../../lib/queries/site';
import { plainWhatsappUrl } from '../../lib/whatsapp';
import { Reveal } from '../ui/Reveal';
import { Button } from '../ui/Button';
import { SealLink } from '../thread/ThreadParts';
import styles from './CtaBand.module.css';

type CtaBandProps = { heading: string; bookLabel: string; whatsappLabel: string };

/** Gold call-to-action band: blurred photo, the number set huge, a rotating seal, two buttons. */
export function CtaBand({ heading, bookLabel, whatsappLabel }: CtaBandProps) {
  const { pathname } = useLocation();
  const { t } = useTranslation('common');
  const { t: ts } = useTranslation('site');
  const { data: site } = useSiteSettings();
  const { phone, whatsapp } = site.business;
  const tel = `tel:${normaliseUgPhone(phone) ?? phone.replace(/\s/g, '')}`;
  const ref = useRef<HTMLElement>(null);
  const reduce = usePrefersReducedMotion();
  const update = useCallback((el: HTMLElement, vh: number) => {
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--cy', ((vh / 2 - (rect.top + rect.height / 2)) * 0.12).toFixed(1));
  }, []);
  useScrollVars(ref, update, !reduce);
  return (
    <section ref={ref} className={`${styles.cta} on-cta`}>
      <img className={styles.bg} src="/images/services/service-0-elderly.jpg" alt="" width={670} height={500} aria-hidden="true" loading="lazy" decoding="async" />
      <div className="container">
        <Reveal as="h2">{heading}</Reveal>
        <p className={styles.how}>{ts('thread.ctaHow')}</p>
        <div className={styles.numrow}>
          <a className={styles.num} href={tel} aria-label={`${t('actions.call')} ${phone}`} onClick={() => trackClick('call', pathname, import.meta.env.VITE_API_URL ?? '')}>
            {phone}
          </a>
          <SealLink href={tel} text={ts('thread.sealText')} />
        </div>
        <div className={styles.actions}>
          <Button href={plainWhatsappUrl(whatsapp)} variant="whatsapp" target="_blank" rel="noopener noreferrer" onClick={() => trackClick('whatsapp', pathname, import.meta.env.VITE_API_URL ?? '')}>
            {whatsappLabel}
          </Button>
          <Button href="/contact" variant="forest">{bookLabel}</Button>
        </div>
      </div>
    </section>
  );
}
