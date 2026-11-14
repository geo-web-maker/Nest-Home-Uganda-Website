import { SectionHeader } from '@shared/components/dialogs/SectionHeader';
import styles from './MailPage.module.css';
import { MailInboundTrace } from './MailInboundTrace';
import { MailOutboundTest } from './MailOutboundTest';
import { MailSetupCheck } from './MailSetupCheck';
import { MailSmtpTrace } from './MailSmtpTrace';

/** All live mail tests live together. Running one asks for the authenticator code in a pop-up; the server enforces it. */
export function MailDiagnosticsSection() {
  return (
    <section className={styles.panel} aria-label="Email Diagnostics & Test Suite">
      <SectionHeader title="Email Diagnostics & Test Suite" />
      <MailSetupCheck />
      <MailOutboundTest />
      <MailSmtpTrace />
      <MailInboundTrace />
    </section>
  );
}
