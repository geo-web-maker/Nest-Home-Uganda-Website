import { Button } from '../../../components/ui/Button';
import { Field } from '../../../components/ui/Field';
import { HelpIcon, PHONE, PencilIcon } from './AgreementPublicParts';
import styles from './AgreementPublicPage.module.css';

type Props = {
  choosing: boolean;
  waiting: boolean;
  assistOpen: boolean;
  assistNote: string;
  busy: boolean;
  sessionReplaced: boolean;
  onChooseSelf: () => void;
  onOpenAssistance: () => void;
  onAssistNoteChange: (value: string) => void;
  onRequestAssistance: () => void;
  onCloseAssistance: () => void;
  onCheckAgain: () => void;
};

/** Presents the client's self-service, assisted-completion and waiting states. */
export function AgreementAssistanceOptions({
  choosing,
  waiting,
  assistOpen,
  assistNote,
  busy,
  sessionReplaced,
  onChooseSelf,
  onOpenAssistance,
  onAssistNoteChange,
  onRequestAssistance,
  onCloseAssistance,
  onCheckAgain,
}: Props) {
  return (
    <>
      {choosing && (
        <div className={styles.choice}>
          <p>
            Some sections are for you to complete: your details, your care preferences and your consents.
            How would you like to do this?
          </p>
          <div className={styles.choiceGrid}>
            <button type="button" className={styles.option} disabled={busy} onClick={onChooseSelf}>
              <span className={styles.optionIcon}><PencilIcon /></span>
              <span>
                <strong>I will fill it in myself</strong>
                <span>It takes a few minutes. Your answers save as you type.</span>
              </span>
            </button>
            <button
              type="button"
              className={styles.option}
              disabled={busy}
              aria-pressed={assistOpen}
              onClick={onOpenAssistance}
            >
              <span className={styles.optionIcon}><HelpIcon /></span>
              <span>
                <strong>Ask Bloomwell to fill it in for me</strong>
                <span>A team member enters your details. You then check them and sign.</span>
              </span>
            </button>
          </div>
          {assistOpen && (
            <div className={styles.assist}>
              <p>
                <strong>We will fill in your details for you.</strong> You still read the agreement and sign it yourself.
                You will get a message with a new link when everything is ready.
              </p>
              <Field
                kind="textarea"
                label="Anything we should know? (optional)"
                value={assistNote}
                maxLength={500}
                rows={3}
                onChange={(event) => onAssistNoteChange(event.target.value)}
              />
              <div className={styles.actionRow}>
                <Button onClick={onRequestAssistance} disabled={busy} aria-busy={busy || undefined}>
                  Send my request
                </Button>
                <Button variant="outline" onClick={onCloseAssistance} disabled={busy}>
                  Back
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
      {waiting && (
        <div className={styles.waiting} role="status">
          <span className={styles.arch} aria-hidden="true"><span className={styles.pulse} /></span>
          <h3>Bloomwell is filling in your details</h3>
          <p>
            We have your request. A team member will enter your details from what we hold on record, then message you a new link
            by SMS or email. Open it, check the details and sign. You can keep reading the agreement while you wait.
          </p>
          <p>Need it sooner? Call <a href={`tel:${PHONE}`}>{PHONE}</a>.</p>
          {sessionReplaced && (
            <div className={styles.notice}>
              <strong>Your details are ready.</strong> Open the new link we just sent you by SMS or email to review and sign.
            </div>
          )}
          <div className={styles.actionRow}>
            <Button variant="outline" onClick={onCheckAgain} disabled={busy} aria-busy={busy || undefined}>
              Check again
            </Button>
            <button type="button" className={styles.linkButton} onClick={onChooseSelf} disabled={busy}>
              I would rather fill it in myself
            </button>
          </div>
        </div>
      )}
    </>
  );
}
