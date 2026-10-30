import { useState } from 'react';
import { Disclosure } from '../features/disclosure/Disclosure';
import { copy } from '../copy';
import { Card } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { PillButton } from '../ui/PillButton';

type Props = {
  accepted: boolean;
  onAccept: () => void;
  onContinue: () => void;
  onEnableNotifications: () => void;
  showNotifications: boolean;
  notificationsEnabled: boolean;
};

export function Onboarding({ accepted, onAccept, onContinue, showNotifications }: Props) {
  const [readNotice, setReadNotice] = useState(false);
  const [agreeLocation, setAgreeLocation] = useState(false);
  if (!accepted) {
    const ready = readNotice && agreeLocation;
    return <section className="screen onboarding-panel" aria-labelledby="onboarding-heading">
      <p className="eyebrow">{copy.onboarding.beforeVisit}</p>
      <h1 id="onboarding-heading">{copy.onboarding.title}</h1>
      <p className="onboarding-intro">{copy.onboarding.intro}</p>
      <Disclosure
        title={copy.onboarding.disclosureTitle}
        items={[
          { label: <Icon name="pin" />, text: copy.onboarding.locationWhen },
          { label: <Icon name="clock" />, text: copy.onboarding.locationTime },
          { label: <Icon name="user" />, text: copy.onboarding.locationSeen },
        ]}
        onAccept={() => undefined}
        showAction={false}
      />
      <p className="placeholder privacy-notice">{copy.onboarding.privacyNotice}</p>
      <label className="check-row"><input type="checkbox" checked={readNotice} onChange={(event) => setReadNotice(event.target.checked)} /> <span>{copy.onboarding.readNotice}</span></label>
      <label className="check-row"><input type="checkbox" checked={agreeLocation} onChange={(event) => setAgreeLocation(event.target.checked)} /> <span>{copy.onboarding.agreeLocation}</span></label>
      <PillButton tone="gold" size="full" disabled={!ready} onClick={onAccept}>{copy.disclosure.accept}</PillButton>
    </section>;
  }

  return <section className="screen onboarding-panel location-explanation" aria-labelledby="onboarding-heading">
    <div className="location-icon" aria-hidden="true"><Icon name="pin" size={28} /></div>
    <h1 id="onboarding-heading">{copy.onboarding.setup}</h1>
    <p className="onboarding-intro">{copy.onboarding.setupIntro}</p>
    <Disclosure
      title=""
      items={[
        { label: copy.onboarding.locationWhenLabel, text: copy.onboarding.locationWhenDetail },
        { label: copy.onboarding.locationWhoLabel, text: copy.onboarding.locationWhoDetail },
        { label: copy.onboarding.locationAndroidLabel, text: copy.onboarding.locationAndroidDetail },
      ]}
      onAccept={() => undefined}
      showAction={false}
    />
    <PillButton tone="forest" size="full" onClick={onContinue}>{copy.generic.continue}</PillButton>
    {showNotifications && <Card className="native-prompt"><p className="eyebrow">{copy.onboarding.androidPromptEyebrow}</p><h2>{copy.onboarding.androidPromptTitle}</h2><div className="native-options"><span>{copy.onboarding.androidWhileUsing}</span><span>{copy.onboarding.androidOnlyThisTime}</span><span>{copy.onboarding.androidDontAllow}</span></div></Card>}
  </section>;
}
