import { useRef, useState } from 'react';
import { ApiError, apiClient } from '@shared/lib/api/client';
import { dialogs } from '@shared/lib/dialogs';
import {
  SMS_MESSAGE_STAGES,
  type AgreementTemplateVersion,
  type MessagePreview,
  type MessageStage,
  type TemplateInfo,
  type TemplateMessage,
} from './MessageTemplatePanel';

type Channel = 'email' | 'sms';
type WorkflowCallbacks = {
  setBusy: (busy: boolean) => void;
  setError: (message: string) => void;
  setNotice: (message: string) => void;
};

function editableMessage(message: TemplateMessage) {
  return {
    subject: message.subject,
    preheader: message.preheader,
    body: message.body,
    button: message.button,
    footer_note: message.footer_note,
  };
}

function errorWithFields(cause: unknown, fallback: string): string {
  if (!(cause instanceof Error)) return fallback;
  const detail = cause instanceof ApiError
    ? Object.entries(cause.fields).map(([name, why]) => `${name}: ${why}`).join('; ')
    : '';
  return detail ? `${cause.message} (${detail})` : cause.message;
}

/** Owns the editable notification-template and agreement-wording lifecycle. */
export function useAgreementMessageTemplates({ setBusy, setError, setNotice }: WorkflowCallbacks) {
  const [messageStage, setMessageStage] = useState<MessageStage>('agreement_sent');
  const [messageChannel, setMessageChannel] = useState<Channel>('email');
  const [message, setMessage] = useState<TemplateMessage | null>(null);
  const [messagePreview, setMessagePreview] = useState<MessagePreview | null>(null);
  const [templateJson, setTemplateJson] = useState('');
  const [templateInfo, setTemplateInfo] = useState<TemplateInfo | null>(null);

  /** What the server last gave us, to tell real unsaved edits from an untouched form. */
  const loadedMessage = useRef<TemplateMessage | null>(null);
  /** Only the newest load may update the form, so a slow earlier response cannot overwrite it. */
  const loadSeq = useRef(0);

  const hasUnsavedMessageEdits = () =>
    Boolean(message && loadedMessage.current
      && JSON.stringify(editableMessage(message)) !== JSON.stringify(editableMessage(loadedMessage.current)));

  const loadMessage = async (stage: MessageStage, channel: Channel) => {
    const seq = ++loadSeq.current;
    setMessageStage(stage);
    setMessageChannel(channel);
    setError('');
    try {
      const result = await apiClient.get<TemplateMessage>(`/admin/agreements/message-templates/${stage}/${channel}`);
      if (seq !== loadSeq.current) return;
      loadedMessage.current = result;
      setMessage(result);
    } catch (cause) {
      if (seq !== loadSeq.current) return;
      setError(cause instanceof Error ? cause.message : 'Could not load this message template.');
    }
  };

  const saveMessage = async () => {
    if (!message) return;
    setBusy(true);
    setError('');
    try {
      await apiClient.put(`/admin/agreements/message-templates/${messageStage}/${messageChannel}`, editableMessage(message));
      await loadMessage(messageStage, messageChannel);
      setMessagePreview(null);
      setNotice('Message template saved and audited.');
    } catch (cause) {
      setError(errorWithFields(cause, 'Could not save this message.'));
    } finally {
      setBusy(false);
    }
  };

  const previewMessage = async () => {
    if (!message) return;
    setBusy(true);
    setError('');
    try {
      const result = await apiClient.post<MessagePreview>(
        `/admin/agreements/message-templates/${messageStage}/${messageChannel}/preview`,
        editableMessage(message),
      );
      setMessagePreview(result);
    } catch (cause) {
      setError(errorWithFields(cause, 'Could not preview this message.'));
    } finally {
      setBusy(false);
    }
  };

  const testSendMessage = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await apiClient.post<{ sent: boolean; message: string }>(
        `/admin/agreements/message-templates/${messageStage}/${messageChannel}/test-send`,
        {},
      );
      setNotice(result.message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The test message could not be sent.');
    } finally {
      setBusy(false);
    }
  };

  const openTemplate = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await apiClient.get<{
        version?: number;
        published?: boolean;
        template_hash?: string;
        clauses?: Record<string, string>;
        source_file?: string | null;
        versions?: AgreementTemplateVersion[];
        published_version?: number | null;
      }>('/admin/agreements/template/current');
      setTemplateInfo(result);
      setTemplateJson(JSON.stringify(result.clauses ?? {}, null, 2));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load template versions.');
    } finally {
      setBusy(false);
    }
  };

  const installSourceTemplate = async () => {
    const confirmed = await dialogs.confirm(
      'Install the latest agreement wording? If a version is already live, it is saved as a new draft version and nothing live changes.',
      { confirmLabel: 'Install as draft' },
    );
    if (!confirmed) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await apiClient.post<{ created: number; message: string }>('/admin/agreements/template/seed', {});
      await openTemplate();
      setNotice(result.created
        ? 'Latest wording installed as a draft. Choose it under "Load version", review it, then press "Publish selected version".'
        : result.message);
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message
        : 'The latest wording could not be installed. Verify your authenticator in Mail settings and try again.');
    } finally {
      setBusy(false);
    }
  };

  const loadTemplateVersion = async (version: number) => {
    setBusy(true);
    setError('');
    try {
      const result = await apiClient.get<{
        version: number;
        published: boolean;
        template_hash: string;
        clauses: Record<string, string>;
        source_file?: string | null;
        published_at?: string | null;
      }>(`/admin/agreements/template/${version}`);
      setTemplateInfo((current) => ({ ...current, ...result }));
      setTemplateJson(JSON.stringify(result.clauses, null, 2));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load this template version.');
    } finally {
      setBusy(false);
    }
  };

  const saveTemplateDraft = async () => {
    setBusy(true);
    setError('');
    try {
      const clauses = JSON.parse(templateJson) as Record<string, string>;
      const result = await apiClient.post<{ version: number; template_hash: string }>('/admin/agreements/template/drafts', { clauses });
      await openTemplate();
      setNotice(`Draft template v${result.version} saved. Check the clause text against the signed source before publishing.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Template JSON is invalid or could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const publishTemplate = async () => {
    if (!templateInfo?.version) {
      setError('Save a draft template before publishing.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await apiClient.post(`/admin/agreements/template/${templateInfo.version}/publish`, {});
      await openTemplate();
      setNotice(`Template v${templateInfo.version} published.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not publish the template.');
    } finally {
      setBusy(false);
    }
  };

  const resetMessage = async () => {
    const confirmed = await dialogs.confirm(
      'Reset this message to the default wording? Your saved and unsaved changes to it will be replaced.',
      { confirmLabel: 'Reset message' },
    );
    if (!confirmed) return;
    setBusy(true);
    setError('');
    try {
      await apiClient.post(`/admin/agreements/message-templates/${messageStage}/${messageChannel}/reset`, {});
      await loadMessage(messageStage, messageChannel);
      setMessagePreview(null);
      setNotice('Message reset to the default wording.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not reset this message template.');
    } finally {
      setBusy(false);
    }
  };

  /** Moving to another message throws the form away, so ask first when there are unsaved edits. */
  const confirmDiscardEdits = async () => {
    if (!hasUnsavedMessageEdits()) return true;
    return dialogs.confirm(
      'You have unsaved changes to this message. Switch anyway and discard them?',
      { confirmLabel: 'Discard changes' },
    );
  };

  const changeMessageStage = async (stage: MessageStage) => {
    if (!(await confirmDiscardEdits())) return;
    setMessagePreview(null);
    await loadMessage(stage, SMS_MESSAGE_STAGES.has(stage) ? messageChannel : 'email');
  };

  const changeMessageChannel = async (channel: Channel) => {
    if (!(await confirmDiscardEdits())) return;
    setMessagePreview(null);
    await loadMessage(messageStage, channel);
  };

  return {
    messageStage, messageChannel, message, messagePreview,
    templateJson, templateInfo,
    setMessage, setTemplateJson,
    loadMessage, changeMessageStage, changeMessageChannel,
    saveMessage, previewMessage, testSendMessage, resetMessage,
    openTemplate, installSourceTemplate, loadTemplateVersion,
    saveTemplateDraft, publishTemplate,
  };
}
