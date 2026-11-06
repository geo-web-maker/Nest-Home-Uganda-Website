import { Notice } from '../../../components/admin/Notice';
import { SectionHeader } from '../../../components/admin/SectionHeader';
import styles from './MailPage.module.css';
import { MailInboundTrace } from './MailInboundTrace';
import { MailOutboundTest } from './MailOutboundTest';
import { MailSetupCheck } from './MailSetupCheck';
import { MailSmtpTrace } from './MailSmtpTrace';

/** All live mail tests live together and are only mounted after the backend confirms TOTP. */
export function MailDiagnosticsSection({ unlocked }: { unlocked: boolean }) {
  return (
    <section className={styles.panel} aria-label="Email Diagnostics & Test Suite">
      <SectionHeader title="Email Diagnostics & Test Suite" />
      <p className={styles.settingHelp}>
        Run the tests from top to bottom. The setup checks are non-destructive. Internal and inbound tests create labelled messages in your mailbox. External tests send only to the address you enter. Detailed transport traces can contain operational metadata, so every test requires a verified authenticator session.
      </p>
      {!unlocked ? (
        <Notice tone="info">Set up your authenticator and verify a current code in the Security section above to unlock email diagnostics. The server independently enforces this check for every test request.</Notice>
      ) : (
        <>
          <MailSetupCheck />
          <MailOutboundTest />
          <MailSmtpTrace />
          <MailInboundTrace />
        </>
      )}
    </section>
  );
}
