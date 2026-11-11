import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { Arch, FillWords, Ledger, ShapeField, ThreadLine, VerticalSteps } from '../../components/thread/ThreadParts';
import { useSiteSettings } from '../../lib/queries/site';
import { normaliseUgPhone } from '../../lib/phone';
import styles from './DesignPage.module.css';

export default function DesignPage() {
  const { t } = useTranslation('site');
  const { data } = useSiteSettings();
  const phone = data.business.phone;
  return <main className={styles.page}>
    <section className={`${styles.hero} on-hero`}><ShapeField variant="hero" /><div className="container"><p>Thread design system</p><h1>Open doors.<br />A golden thread.</h1><p>Design preview, not available in production builds.</p><a href={`tel:${normaliseUgPhone(phone) ?? phone}`}>{phone}</a></div></section>
    <section className="container"><h2>Buttons and surfaces</h2><div className={styles.buttons}><Button>Primary</Button><Button variant="outline">Outline</Button><Button variant="whatsapp">WhatsApp</Button><Button variant="forest">Main action</Button></div><div className={styles.cards}><Arch placeholder /><Ledger rows={[{ label: 'Hours', missing: true }, { label: 'Office', value: data.business.office }]} emptyValue={t('thread.clientToSupply')} /></div><ThreadLine /><VerticalSteps steps={[{ title: 'First call', text: 'Tell us who needs care.' }, { title: 'Care plan', text: 'Agree the care, timing and cost.' }, { title: 'First visit', text: 'Care begins at home.' }]} /></section>
    <section className={styles.promise}><div className="container"><h2>{t('about.promiseHeading')}</h2><FillWords items={[{ word: 'Trusted', text: 'Qualified and vetted.' }, { word: 'Reliable', text: 'On time, every visit.' }, { word: 'Compassionate', text: 'Care with dignity.' }]} /></div></section>
  </main>;
}
