import { useState } from 'react';
import { Notice } from '@shared/components/dialogs/Notice';
import { PageHeader } from '../../../components/admin/PageHeader';
import { FilterTabs } from '../../../components/admin/FilterTabs';
import { useAuth } from '../auth/useAuth';
import { AgreementDiagnostics } from '../agreements/AgreementDiagnostics';
import { MailDiagnosticsSection } from '../mail/MailDiagnosticsSection';
import { AuthenticatorSection } from './AuthenticatorSection';
import { PushDiagnosticsSection } from './PushDiagnosticsSection';
import { ReleaseChecksSection } from './ReleaseChecksSection';
import { SmsDiagnosticsSection } from './SmsDiagnosticsSection';
import { TestAccountsSection } from './TestAccountsSection';

type Section = 'authenticator' | 'test-accounts' | 'email' | 'sms' | 'push' | 'agreements' | 'releases';

const TABS = [
  { value: 'authenticator', label: 'Authenticator' },
  { value: 'test-accounts', label: 'Test accounts' },
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
  { value: 'push', label: 'Push' },
  { value: 'agreements', label: 'Agreements' },
  { value: 'releases', label: 'Releases' },
] as const;

/**
 * Every diagnostic in one place, superadmin only. Laid out like Settings and Billing: page header, pill tabs,
 * one panel per tab. The authenticator is set up and reset in its own tab; everything else asks for the code in a pop-up.
 */
export function DiagnosticsPage() {
  const { user } = useAuth();
  const [section, setSection] = useState<Section>('authenticator');
  if (!user?.is_superadmin) return <Notice tone="info"><p>Diagnostics are for the super administrator.</p></Notice>;
  return (
    <>
      <PageHeader title="Diagnostics and test accounts" subtitle="Checks and test tools for the super administrator." />
      <FilterTabs label="Diagnostic sections" tabs={TABS} value={section} onChange={(value) => setSection(value as Section)} controls="diagnostics-panel" />
      <div id="diagnostics-panel" role="tabpanel">
        {section === 'authenticator' ? <AuthenticatorSection /> : null}
        {section === 'test-accounts' ? <TestAccountsSection /> : null}
        {section === 'email' ? <MailDiagnosticsSection /> : null}
        {section === 'sms' ? <SmsDiagnosticsSection /> : null}
        {section === 'push' ? <PushDiagnosticsSection /> : null}
        {section === 'releases' ? <ReleaseChecksSection /> : null}
        {section === 'agreements' ? <AgreementDiagnostics canRunWorkflow canSeedTemplate /> : null}
      </div>
    </>
  );
}
