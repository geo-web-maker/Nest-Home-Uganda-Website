import type { ReactNode } from 'react';
import { Button } from '@shared/components/ui/Button';
import { Checkbox } from '@shared/components/ui/Checkbox';

type DeliveryChannels = { email: boolean; sms: boolean };

type AgreementDeliveryPanelProps = {
  status: string;
  canWrite: boolean;
  busy: boolean;
  noChannel: boolean;
  channels: DeliveryChannels;
  onChannelsChange: (value: DeliveryChannels) => void;
  onSend: () => void;
  resendPanel: ReactNode;
};

/** Controls the secure-link delivery options and the initial send action. */
export function AgreementDeliveryPanel({
  status,
  canWrite,
  busy,
  noChannel,
  channels,
  onChannelsChange,
  onSend,
  resendPanel,
}: AgreementDeliveryPanelProps) {
  if (!canWrite) return null;

  const canSend = ['draft', 'changes_requested', 'expired'].includes(status);
  const canResend = ['sent', 'client_in_progress'].includes(status);

  return (
    <>
      <h3>Send agreement for review</h3>
      <p>
        Messages contain a secure link only. No patient name, care details or fees are sent by email
        or SMS.
      </p>
      <fieldset>
        <legend>Send via (tick one or more)</legend>
        <Checkbox
          checked={channels.email}
          onChange={(event) => onChannelsChange({ ...channels, email: event.target.checked })}
          label="Email"
        />{' '}
        <Checkbox
          checked={channels.sms}
          onChange={(event) => onChannelsChange({ ...channels, sms: event.target.checked })}
          label="SMS"
        />
        {noChannel && <p role="alert">Tick at least one way to send.</p>}
      </fieldset>
      <p>
        Link expiry: 14 days. Reminders: 48 hours and day 5. Expiry warning: 48 hours before
        expiry.
      </p>
      <Button onClick={onSend} disabled={busy || noChannel || !canSend}>
        Validate and send
      </Button>
      {canResend && (
        <>
          <p>
            Client did not get it? Resend sends the same link again by the channel selected above.
            Nothing earlier stops working.
          </p>
          {resendPanel}
        </>
      )}
    </>
  );
}
