import type { ReactNode } from 'react';
import { Card } from '../ui/Card';
import { PillButton } from '../ui/PillButton';
import { LoadingScreen } from '../ui/Loading';
import { UpdateNotice } from '../features/update/UpdateNotice';
import { copy } from '../copy';
import type { FieldConsentRequirement } from './useFieldProfile';

export type NurseVersionInfo = {
  latest: string | null;
  min_supported: string;
  has_releases?: boolean;
  download_path?: string | null;
  apk_info?: { url: string; sha256?: string | null; version: string } | null;
};

type Props = {
  children: ReactNode;
  bootChecked: boolean;
  signedIn: boolean;
  preLoginBlocked: boolean;
  preLoginMinimum: string;
  updateBlocked: boolean;
  versionInfo: NurseVersionInfo | null;
  appVersion: string;
  accessProblem: string | null;
  consentsRequired: FieldConsentRequirement[];
  onCheckAgain: () => void;
  onSignOut: () => void;
  onAcceptConsent: (requirement: FieldConsentRequirement) => void;
};

/** Keeps the pre-auth update, nurse-access and consent gates out of the app coordinator. */
export function NurseAccessGate({
  children,
  bootChecked,
  signedIn,
  preLoginBlocked,
  preLoginMinimum,
  updateBlocked,
  versionInfo,
  appVersion,
  accessProblem,
  consentsRequired,
  onCheckAgain,
  onSignOut,
  onAcceptConsent,
}: Props) {
  if (!bootChecked) return <LoadingScreen />;

  if (!signedIn && preLoginBlocked) {
    return (
      <Card className="update-gate">
        <UpdateNotice currentVersion={appVersion} latestVersion={null} minimumVersion={preLoginMinimum} hasReleases />
        <p style={{ fontSize: '.82rem', color: 'var(--mut)', marginTop: 8 }}>{copy.update.contactSupervisor}</p>
      </Card>
    );
  }

  if (signedIn && updateBlocked && versionInfo) {
    return (
      <Card className="update-gate">
        <UpdateNotice
          currentVersion={appVersion}
          latestVersion={versionInfo.latest}
          minimumVersion={versionInfo.min_supported}
          downloadPath={versionInfo.download_path}
          apkInfo={versionInfo.apk_info}
          hasReleases={versionInfo.has_releases ?? true}
        />
        <PillButton type="button" tone="ghost" showArrow={false} onClick={onCheckAgain}>
          {copy.update.checkAgain}
        </PillButton>
      </Card>
    );
  }

  if (signedIn && accessProblem === 'not_nurse') {
    return (
      <Card className="update-gate">
        <h2>{copy.notNurse.heading}</h2>
        <p>{copy.notNurse.body}</p>
        <PillButton type="button" tone="gold" onClick={onSignOut}>
          {copy.notNurse.signOut}
        </PillButton>
      </Card>
    );
  }

  if (signedIn && consentsRequired.length > 0) {
    return (
      <Card className="consent-gate">
        <h2>{copy.consent.heading}</h2>
        <p>{copy.consent.explanation}</p>
        {consentsRequired.map((requirement) => (
          <Card className="consent-requirement" key={`${requirement.type}:${requirement.version}`}>
            <h3>{requirement.type.replaceAll('_', ' ')}</h3>
            <p>{requirement.text}</p>
            <p>{copy.consent.version} {requirement.version}</p>
            <PillButton type="button" tone="gold" onClick={() => onAcceptConsent(requirement)}>
              {copy.consent.accept}
            </PillButton>
          </Card>
        ))}
      </Card>
    );
  }

  return <>{children}</>;
}
