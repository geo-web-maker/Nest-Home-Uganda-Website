import { Button } from '@shared/components/ui/Button';
import { ButtonGroup } from '@shared/components/dialogs/ButtonGroup';
import { Notice } from '@shared/components/dialogs/Notice';
import { FilterBar } from '../../../components/admin/FilterBar';
import { Field } from '@shared/components/ui/Field';
import styles from './AgreementsPage.module.css';

export type MessageStage =
  | 'agreement_sent'
  | 'otp_sign'
  | 'otp_view'
  | 'reminder_1'
  | 'reminder_2'
  | 'expiring_soon'
  | 'expired'
  | 'changes_requested'
  | 'assistance_requested'
  | 'staff_revised'
  | 'client_signed_client'
  | 'client_signed_staff'
  | 'completed_client'
  | 'voided'
  | 'amendment_sent'
  | 'payment_due';

export type TemplateMessage = {
  subject: string;
  preheader: string;
  body: string;
  button: string;
  footer_note: string;
  version: number;
  is_default: boolean;
};

export type MessagePreview = {
  subject?: string;
  html?: string;
  text?: string;
  body?: string;
  characters?: number;
  segments?: number;
  gsm7?: boolean;
};

export type AgreementTemplateVersion = {
  version: number;
  published: boolean;
  template_hash: string;
  published_at?: string | null;
  source_file?: string | null;
};

export type TemplateInfo = {
  version?: number;
  published?: boolean;
  template_hash?: string;
  clauses?: Record<string, string>;
  source_file?: string | null;
  versions?: AgreementTemplateVersion[];
  published_version?: number | null;
};

export const MESSAGE_STAGES: MessageStage[] = [
  'agreement_sent',
  'otp_sign',
  'otp_view',
  'reminder_1',
  'reminder_2',
  'expiring_soon',
  'expired',
  'changes_requested',
  'assistance_requested',
  'staff_revised',
  'client_signed_client',
  'client_signed_staff',
  'completed_client',
  'voided',
  'amendment_sent',
  'payment_due',
];

export const SMS_MESSAGE_STAGES = new Set<MessageStage>([
  'agreement_sent',
  'otp_sign',
  'otp_view',
  'reminder_1',
  'reminder_2',
  'expiring_soon',
  'staff_revised',
  'client_signed_client',
  'completed_client',
  'voided',
  'amendment_sent',
  'payment_due',
]);

type MessageTemplatePanelProps = {
  tab: 'messages' | 'template';
  messageStage: MessageStage;
  messageChannel: 'email' | 'sms';
  message: TemplateMessage | null;
  messagePreview: MessagePreview | null;
  onMessageStageChange: (stage: MessageStage) => void;
  onMessageChannelChange: (channel: 'email' | 'sms') => void;
  onMessageChange: (message: TemplateMessage) => void;
  onSaveMessage: () => void;
  onPreviewMessage: () => void;
  onTestSendMessage: () => void;
  onResetMessage: () => void;
  templateInfo: TemplateInfo | null;
  templateJson: string;
  onTemplateJsonChange: (value: string) => void;
  onLoadTemplateVersion: (version: number) => void;
  canManageTemplates: boolean;
  onInstallSourceTemplate: () => void;
  onSaveTemplateDraft: () => void;
  onPublishTemplate: () => void;
  busy: boolean;
};

/** Message delivery copy and clause-version management are separate from agreement editing. */
export function MessageTemplatePanel({
  tab,
  messageStage,
  messageChannel,
  message,
  messagePreview,
  onMessageStageChange,
  onMessageChannelChange,
  onMessageChange,
  onSaveMessage,
  onPreviewMessage,
  onTestSendMessage,
  onResetMessage,
  templateInfo,
  templateJson,
  onTemplateJsonChange,
  onLoadTemplateVersion,
  canManageTemplates,
  onInstallSourceTemplate,
  onSaveTemplateDraft,
  onPublishTemplate,
  busy,
}: MessageTemplatePanelProps) {
  if (tab === 'messages') {
    return (
      <div className={styles.messagePanel}>
        <h3>Message templates</h3>
        <FilterBar label="Message template">
          <Field
            kind="select"
            label="Stage"
            value={messageStage}
            onChange={(event) => onMessageStageChange(event.target.value as MessageStage)}
          >
            {MESSAGE_STAGES.map((stage) => (
              <option key={stage} value={stage}>{stage}</option>
            ))}
          </Field>
          <Field
            kind="select"
            label="Channel"
            value={messageChannel}
            onChange={(event) => onMessageChannelChange(event.target.value as 'email' | 'sms')}
          >
            <option value="email">Email</option>
            <option value="sms" disabled={!SMS_MESSAGE_STAGES.has(messageStage)}>
              SMS
            </option>
          </Field>
        </FilterBar>

        {message && (
          <>
            <p>{message.is_default ? 'Using code default' : `Custom version ${message.version}`}</p>
            {messageChannel === 'email' && (
              <Field
                label="Subject"
                value={message.subject}
                onChange={(event) => onMessageChange({ ...message, subject: event.target.value })}
              />
            )}
            <Field
              label="Preheader"
              value={message.preheader}
              onChange={(event) => onMessageChange({ ...message, preheader: event.target.value })}
            />
            <Field
              kind="textarea"
              label="Message body"
              rows={7}
              value={message.body}
              onChange={(event) => onMessageChange({ ...message, body: event.target.value })}
            />
            {messageChannel === 'email' && (
              <>
                <Field
                  label="Button label"
                  value={message.button}
                  onChange={(event) => onMessageChange({ ...message, button: event.target.value })}
                />
                <Field
                  kind="textarea"
                  label="Footer note"
                  rows={2}
                  value={message.footer_note}
                  onChange={(event) => onMessageChange({ ...message, footer_note: event.target.value })}
                />
              </>
            )}
            <p>
              {messageChannel === 'sms'
                ? `${message.body.length} characters · ${message.body.length <= 160 ? 1 : message.body.length <= 306 ? 2 : 'over limit'} segments`
                : 'Email links are inserted by the shared branded layout.'}
            </p>
            <ButtonGroup>
              <Button onClick={onSaveMessage} disabled={busy}>Save message</Button>
              <Button variant="outline" onClick={onPreviewMessage} disabled={busy}>Preview</Button>
              <Button variant="outline" onClick={onTestSendMessage} disabled={busy}>Send test to me</Button>
              <Button variant="outline" onClick={onResetMessage} disabled={busy}>Reset to default</Button>
            </ButtonGroup>
            {messagePreview && (
              <section className={styles.messagePreview}>
                <h4>{messagePreview.subject ?? 'SMS preview'}</h4>
                {messagePreview.html ? (
                  <iframe title="Email message preview" srcDoc={messagePreview.html} sandbox="" />
                ) : (
                  <p>{messagePreview.body}</p>
                )}
                {messagePreview.gsm7 === false && (
                  <Notice tone="info">The rendered message contains characters outside GSM-7.</Notice>
                )}
                {messagePreview.segments !== undefined && (
                  <small>
                    {messagePreview.characters} characters · {messagePreview.segments} GSM-7
                    segment(s)
                  </small>
                )}
              </section>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className={styles.messagePanel}>
      <h3>Agreement clause versions</h3>
      {templateInfo?.versions?.length ? (
        <Field
          kind="select"
          label="Load version"
          value={templateInfo.version ?? ''}
          onChange={(event) => onLoadTemplateVersion(Number(event.target.value))}
        >
          {templateInfo.versions.map((version) => (
            <option key={version.version} value={version.version}>
              v{version.version} · {version.published ? 'published' : 'draft'}
              {version.version === templateInfo.published_version ? ' · active' : ''}
            </option>
          ))}
        </Field>
      ) : null}
      {templateInfo && (
        <p>
          Version {templateInfo.version ?? '—'} ·{' '}
          {templateInfo.published ? 'published' : 'draft / not published'} ·{' '}
          {templateInfo.template_hash ?? 'No template hash'}
          {templateInfo.source_file ? ` · Source: ${templateInfo.source_file}` : ''}
        </p>
      )}
      <p>
        The source PDF is loaded as a versioned clause map. Review the complete wording and
        schedules against the original signed source before publishing. The two required company
        email corrections are checked server-side.
      </p>
      <Field
        kind="textarea"
        label="Clause template JSON"
        className={styles.templateEditor}
        rows={16}
        value={templateJson}
        onChange={(event) => onTemplateJsonChange(event.target.value)}
        spellCheck={false}
      />
      <p>
        Publishing and voiding require the existing authenticator session. Each of these actions
        asks for your authenticator code in a pop-up.
      </p>
      <ButtonGroup>
        {canManageTemplates && (
          <Button variant="outline" onClick={onInstallSourceTemplate} disabled={busy}>
            Install latest wording as draft
          </Button>
        )}
        <Button onClick={onSaveTemplateDraft} disabled={busy}>Save new draft version</Button>
        <Button
          variant="outline"
          onClick={onPublishTemplate}
          disabled={busy || !templateInfo?.version || templateInfo.published}
        >
          Publish selected version
        </Button>
      </ButtonGroup>
    </div>
  );
}
