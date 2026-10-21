import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { InfoCard } from '../../../components/site/InfoCard';
import { MapPlaceholder } from '../../../components/site/MapPlaceholder';
import { PageHero } from '../../../components/site/PageHero';
import { Seo } from '../../../components/site/Seo';
import { Button } from '../../../components/ui/Button';
import { apiClient } from '../../../lib/api/client';
import { normaliseUgPhone } from '../../../lib/phone';
import { useServices } from '../../../lib/queries/services';
import { useSiteSettings } from '../../../lib/queries/site';
import { plainWhatsappUrl } from '../../../lib/whatsapp';
import { bookingCopyEn } from '../../../locales/en/booking';
import { BookingForm } from '../booking/BookingForm';
import { trackClick } from '../booking/bookingApi';
import { submitEnquiryViaClient } from '../booking/enquirySubmit';
import type { AreaPublic } from '../areas/types';
import { Reveal } from '../../../components/ui/Reveal';
import styles from './ContactPage.module.css';

/** Contact and book (spec 5.11). No CTA band: the page is the call to action. */
export function ContactPage() {
  const { t } = useTranslation('site');
  const { t: tc } = useTranslation('common');
  const { pathname } = useLocation();
  const { data: site } = useSiteSettings();
  const services = useServices();
  const areas = useQuery({
    queryKey: ['public', 'areas'],
    queryFn: () => apiClient.get<AreaPublic[]>('/public/areas', { params: { lang: 'en' } }),
  });
  const { phone, whatsapp, office, hours } = site.business;
  const dial = normaliseUgPhone(phone) ?? phone.replace(/\s/g, '');
  const baseUrl = import.meta.env.VITE_API_URL ?? '';

  return (
    <>
      <Seo
        title={t('contact.seoTitle')}
        description={t('contact.seoDescription')}
        path="/contact"
      />
      <PageHero
        rule={t('contact.rule')}
        title={t('contact.title')}
        lead={t('contact.lead')}
        breadcrumb={[{ label: tc('nav.home'), to: '/' }, { label: t('contact.rule') }]}
      />
      <section className={styles.section}>
        <div className={`container ${styles.columns}`}>
          <Reveal className={styles.left}>
            <div className={styles.actions}>
              <Button href={`tel:${dial}`} onClick={() => trackClick('call', pathname, baseUrl)}>
                {t('contact.callBig', { phone })}
              </Button>
              <Button
                href={plainWhatsappUrl(whatsapp)}
                variant="whatsapp"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackClick('whatsapp', pathname, baseUrl)}
              >
                {t('contact.whatsappUs')}
              </Button>
            </div>
            <div className={styles.cards}>
              <InfoCard label={t('contact.officeLabel')} value={office} />
              {hours ? <InfoCard label={t('contact.hoursLabel')} value={hours} /> : null}
            </div>
            <MapPlaceholder
              label={t('contact.mapLabel')}
              description={t('contact.mapDescription')}
            />
          </Reveal>
          <Reveal className={styles.right} index={1}>
            <BookingForm
              copy={bookingCopyEn}
              services={(services.data ?? []).map((item) => ({ id: item.id, name: item.name }))}
              areaSuggestions={(areas.data ?? []).map((area) => area.name)}
              whatsappDigits={whatsapp}
              callHref={`tel:${dial}`}
              openWhatsappAfter={site.forms?.open_whatsapp_after ?? false}
              submit={submitEnquiryViaClient}
              onContactClick={(channel) => trackClick(channel, pathname, baseUrl)}
            />
          </Reveal>
        </div>
      </section>
    </>
  );
}
