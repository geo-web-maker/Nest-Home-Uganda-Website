import type { RefObject } from 'react';
import { Button } from '../../../components/ui/Button';
import { Field } from '../../../components/ui/Field';
import { PHONE, clock, type OtpSent, type PreOtp } from './AgreementPublicParts';
import styles from './AgreementPublicPage.module.css';

type Props = {
  pre: PreOtp;
  delivery: OtpSent | null;
  channel: 'sms' | 'email';
  onChannelChange: (value: 'sms' | 'email') => void;
  busy: boolean;
  turnstileSiteKey?: string;
  turnstileRef: RefObject<HTMLDivElement>;
  turnstileToken: string;
  onRequestCode: () => void;
  secondsLeft: number;
  cooldownTotal: number;
  code: string;
  codeInput: RefObject<HTMLInputElement>;
  onCodeChange: (value: string) => void;
  onVerifyCode: (entered?: string) => void;
};

/** OTP delivery and verification UI, separated from the agreement session coordinator. */
export function OtpVerificationPanel({
  pre,
  delivery,
  channel,
  onChannelChange,
  busy,
  turnstileSiteKey,
  turnstileRef,
  turnstileToken,
  onRequestCode,
  secondsLeft,
  cooldownTotal,
  code,
  codeInput,
  onCodeChange,
  onVerifyCode,
}: Props) {
  return (
    <div className={styles.verify}>
      <p>
        For your privacy, we will send a short verification code to the contact already recorded on your agreement.
        No agreement details are shown until you verify.
      </p>
      <div className={styles.contactHint}>
        {pre.phone_hint && <span>Phone: {pre.phone_hint}</span>}
        {pre.email_hint && <span>Email: {pre.email_hint}</span>}
      </div>
      {!delivery && (
        <Field
          kind="select"
          label="Send code by"
          value={channel}
          onChange={(event) => onChannelChange(event.target.value as 'sms' | 'email')}
        >
          <option value="sms" disabled={!pre.available_channels.sms}>SMS</option>
          <option value="email" disabled={!pre.available_channels.email}>Email</option>
        </Field>
      )}
      {!pre.available_channels.sms && !pre.available_channels.email && (
        <p className={styles.security}>
          Bloomwell cannot currently send a verification code to this agreement's recorded contacts. No agreement details are displayed.
          Please call {PHONE} for assistance.
        </p>
      )}
      {turnstileSiteKey && (
        <div className={styles.turnstile} ref={turnstileRef} aria-label="Security verification" />
      )}
      {!delivery && (
        <Button
          onClick={onRequestCode}
          disabled={
            busy
            || (!pre.available_channels.sms && !pre.available_channels.email)
            || !pre.available_channels[channel]
            || Boolean(turnstileSiteKey && !turnstileToken)
          }
          aria-busy={busy || undefined}
        >
          Send verification code
        </Button>
      )}
      {delivery && (
        <div className={styles.otpPanel}>
          <p className={styles.otpWait}>
            <strong>
              Your code is on its way{delivery.destination_hint ? ` to ${delivery.destination_hint}` : ''}.
            </strong>
            {' '}
            {delivery.channel === 'email'
              ? 'Email can take a minute or two. If you do not see it, check your spam or junk folder.'
              : 'SMS can take up to a minute to arrive, depending on your network.'}
          </p>
          <label className={styles.plain}>
            Six-digit verification code
            <input
              ref={codeInput}
              className={styles.otpInput}
              value={code}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="••••••"
              aria-describedby="otp-resend"
              onChange={(event) => {
                const next = event.target.value.replace(/\D/g, '').slice(0, 6);
                onCodeChange(next);
                if (next.length === 6) onVerifyCode(next);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') onVerifyCode();
              }}
            />
          </label>
          <Button onClick={() => onVerifyCode()} disabled={busy || code.length !== 6} aria-busy={busy || undefined}>
            Verify and continue
          </Button>
          <div className={styles.resendRow} id="otp-resend">
            {secondsLeft > 0 ? (
              <>
                <svg className={styles.ring} viewBox="0 0 36 36" aria-hidden="true">
                  <circle className={styles.ringTrack} cx="18" cy="18" r="15" />
                  <circle
                    className={styles.ringFill}
                    cx="18"
                    cy="18"
                    r="15"
                    pathLength="100"
                    strokeDasharray="100"
                    strokeDashoffset={100 - Math.min(100, (secondsLeft / cooldownTotal) * 100)}
                  />
                </svg>
                <span role="timer" aria-live="off">
                  Didn’t get it? You can request a new code in <strong>{clock(secondsLeft)}</strong>.
                </span>
              </>
            ) : (
              <>
                <span>Still nothing?</span>
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={onRequestCode}
                  disabled={busy || Boolean(turnstileSiteKey && !turnstileToken)}
                >
                  Send a new code
                </button>
              </>
            )}
          </div>
          <Field
            kind="select"
            label="Send the next code by"
            value={channel}
            onChange={(event) => onChannelChange(event.target.value as 'sms' | 'email')}
          >
            <option value="sms" disabled={!pre.available_channels.sms}>SMS</option>
            <option value="email" disabled={!pre.available_channels.email}>Email</option>
          </Field>
          {secondsLeft > 0 && (
            <small className={styles.security}>
              Switching between SMS and email does not shorten the wait. Please give the first code time to arrive.
            </small>
          )}
        </div>
      )}
      <p className={styles.security}>Bloomwell staff will never ask you to share your verification code.</p>
    </div>
  );
}
