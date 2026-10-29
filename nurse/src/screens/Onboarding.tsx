import { useState } from 'react';
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
          { label: '⌖', text: copy.onboarding.locationWhen },
          { label: '◷', text: copy.onboarding.locationTime },
          { label: '◉', text: copy.onboarding.locationSeen },
        ]}
        onAccept={() => undefined}
        showAction={false}
      />
      <p className="placeholder privacy-notice">{copy.onboarding.privacyNotice}</p>
      <label className="check-row"><input type="checkbox" checked={readNotice} onChange={(event) => setReadNotice(event.target.checked)} /> <span>{copy.onboarding.readNotice}</span></label>
      <label className="check-row"><input type="checkbox" checked={agreeLocation} onChange={(event) => setAgreeLocation(event.target.checked)} /> <span>{copy.onboarding.agreeLocation}</span></label>
      <button type="button" disabled={!ready} onClick={onAccept}>{copy.disclosure.accept}<span aria-hidden="true">→</span></button>
    </section>;
  }

  return <section className="screen onboarding-panel location-explanation" aria-labelledby="onboarding-heading">
    <div className="location-icon" aria-hidden="true">⌖</div>
    <h1 id="onboarding-heading">{copy.onboarding.setup}</h1>
    <p className="onboarding-intro">So your supervisor can confirm you reached the client. Nothing more.</p>
    <Disclosure
      title=""
      items={[
        { label: 'When', text: 'Only when you tap Arrive or Leave, add a note or photo, or send SOS.' },
        { label: 'Who sees it', text: 'Your supervisor and office admins.' },
        { label: 'Android app only', text: 'An optional prompt when you seem to have arrived. You choose.' },
      ]}
      onAccept={() => undefined}
      showAction={false}
    />
    <button type="button" onClick={onContinue}>{copy.generic.continue}<span aria-hidden="true">→</span></button>
    {showNotifications && <section className="panel native-prompt"><p className="eyebrow">Next, your phone’s own prompt</p><h2>Allow Well Nest Home Care Uganda to access this device’s location?</h2><div className="native-options"><span>While using the app</span><span>Only this time</span><span>Don’t allow</span></div></section>}
  </section>;
}
