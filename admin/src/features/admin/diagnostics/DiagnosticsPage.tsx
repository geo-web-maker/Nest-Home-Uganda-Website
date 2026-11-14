import { useState } from 'react';
import { Notice } from '@shared/components/dialogs/Notice';
import { Button } from '@shared/components/ui/Button';
import { useAuth } from '../auth/useAuth';
import { AgreementDiagnostics } from '../agreements/AgreementDiagnostics';
import { MailDiagnosticsSection } from '../mail/MailDiagnosticsSection';
import { AuthenticatorSection } from './AuthenticatorSection';
import { SmsDiagnosticsSection } from './SmsDiagnosticsSection';
import { TestAccountsSection } from './TestAccountsSection';

type Section = 'authenticator' | 'test-accounts' | 'email' | 'sms' | 'agreements';

/**
 * Every diagnostic in one place, superadmin only. Test accounts and the mail, SMS and agreement test suites used
 * to sit on the Users, Mail settings and Agreements screens. The authenticator is set up and reset in its own section. Everything else asks for the code in a pop-up when you click it.
 */
export function DiagnosticsPage() {
  const { user } = useAuth();
  const [section, setSection] = useState<Section>('authenticator');
  if (!user?.is_superadmin) return <Notice tone="info"><p>Diagnostics are for the super administrator.</p></Notice>;
  const tabs: [Section, string][] = [['authenticator', 'Authenticator'], ['test-accounts', 'Test accounts'], ['email', 'Email'], ['sms', 'SMS'], ['agreements', 'Agreements']];
  return (
    <div>
      <h1>Diagnostics and test accounts</h1>
      <nav aria-label="Diagnostic sections">
        {tabs.map(([id, label]) => (
          <Button key={id} size="compact" variant={section === id ? 'primary' : 'outline'} onClick={() => setSection(id)}>{label}</Button>
        ))}
      </nav>
      {section === 'authenticator' ? <AuthenticatorSection /> : null}
      {section === 'test-accounts' ? <TestAccountsSection /> : null}
      {section === 'email' ? <MailDiagnosticsSection /> : null}
      {section === 'sms' ? <SmsDiagnosticsSection /> : null}
      {section === 'agreements' ? <AgreementDiagnostics canRunWorkflow canSeedTemplate /> : null}
    </div>
  );
}
