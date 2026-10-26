import { Disclosure } from '../features/disclosure/Disclosure';
import { copy } from '../copy';

type Props = {
  accepted: boolean;
  onAccept: () => void;
  onContinue: () => void;
  onEnableNotifications: () => void;
  showNotifications: boolean;
  notificationsEnabled: boolean;
};

/** Permission entry point: no browser/native permission is requested before the disclosure is accepted. */
export function Onboarding({ accepted, onAccept, onContinue, onEnableNotifications, showNotifications, notificationsEnabled }: Props) {
  if (!accepted) {
    return <section className="screen onboarding-panel" aria-labelledby="onboarding-heading">
      <p className="eyebrow">{copy.onboarding.beforeVisit}</p>
      <h2 id="onboarding-heading">{copy.onboarding.title}</h2>
      <Disclosure
        title={copy.onboarding.disclosureTitle}
        text={`${copy.visit.locationHint} ${copy.onboarding.locationDisclosure}`}
        onAccept={onAccept}
      />
    </section>;
  }

  return <section className="screen onboarding-panel" aria-labelledby="onboarding-heading">
    <p className="eyebrow">{copy.onboarding.setupEyebrow}</p>
    <h2 id="onboarding-heading">{copy.onboarding.setup}</h2>
    <p className="status-chip status-chip--completed" role="status">{copy.onboarding.accepted}</p>
    {showNotifications && <section className="panel">
      <h3>{copy.onboarding.notificationsTitle}</h3>
      <p>{copy.onboarding.notificationCopy}</p>
      <button type="button" className="button-secondary" onClick={onEnableNotifications} disabled={notificationsEnabled}>
        {notificationsEnabled ? copy.onboarding.notificationsEnabled : copy.onboarding.enableNotifications}
      </button>
    </section>}
    <div className="sheet-actions"><button type="button" onClick={onContinue}>{copy.generic.continue}</button></div>
  </section>;
}
