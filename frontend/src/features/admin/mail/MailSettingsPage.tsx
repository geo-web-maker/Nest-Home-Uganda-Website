import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ButtonGroup } from '../../../components/admin/ButtonGroup';
import { Modal } from '../../../components/admin/Modal';
import { Notice } from '../../../components/admin/Notice';
import { PageHeader } from '../../../components/admin/PageHeader';
import { SectionHeader } from '../../../components/admin/SectionHeader';
import { Button } from '../../../components/ui/Button';
import { Checkbox } from '../../../components/ui/Checkbox';
import { Field } from '../../../components/ui/Field';
import { apiClient } from '../../../lib/api/client';
import { MailSetupCheck } from './MailSetupCheck';
import { coerceSettingValue, displayValue, type MailSetting } from './settings';
import styles from './MailPage.module.css';

type Usage = {
  today: number;
  month: number;
  queue: { queued: number; deferred: number; failed: number };
  top_mailboxes: { local_part: string; sent: number }[];
};
type Message = { tone: 'success' | 'error'; text: string };

export function MailSettingsPage() {
  const { t } = useTranslation('admin');
  const client = useQueryClient();
  const [edits, setEdits] = useState<Record<string, string | boolean>>({});
  const [message, setMessage] = useState<Message | null>(null);
  const [preview, setPreview] = useState<{ count: number; sample: string[] } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [totpSecret, setTotpSecret] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [testTo, setTestTo] = useState('');

  const settings = useQuery({
    queryKey: ['mail', 'settings'],
    queryFn: () => apiClient.get<{ items: MailSetting[] }>('/mail/settings'),
    retry: false,
  });
  const usage = useQuery({
    queryKey: ['mail', 'usage'],
    queryFn: () => apiClient.get<Usage>('/mail/usage'),
    retry: false,
  });
  const items = settings.data?.items ?? [];

  // Start each input from the stored value whenever the list is (re)loaded.
  useEffect(() => {
    setEdits(
      Object.fromEntries(
        items
          .filter((item) => !item.is_secret)
          .map((item) => [item.key, item.type === 'boolean' ? Boolean(item.value) : displayValue(item.type, item.value)]),
      ),
    );
  }, [settings.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const fail = (text: string) => setMessage({ tone: 'error', text });
  const ok = (text: string) => setMessage({ tone: 'success', text });
  const reload = () => client.invalidateQueries({ queryKey: ['mail'] });

  const save = useMutation({
    mutationFn: (input: { key: string; value: unknown }) => apiClient.patch('/mail/settings', { values: { [input.key]: input.value } }),
    onSuccess: async (_d, input) => {
      ok(t('mailSettings.saved'));
      if (items.find((item) => item.key === input.key)?.is_secret) setEdits((current) => ({ ...current, [input.key]: '' }));
      await reload();
    },
    onError: () => fail(t('mailSettings.saveError')),
  });
  const reset = useMutation({
    mutationFn: (key: string) => apiClient.post(`/mail/settings/${encodeURIComponent(key)}/reset`),
    onSuccess: async () => {
      ok(t('mailSettings.reset'));
      await reload();
    },
    onError: () => fail(t('mailSettings.saveError')),
  });
  const backfillPreview = useMutation({
    mutationFn: () => apiClient.post<{ count: number; sample: string[] }>('/mail/backfill/preview', {}),
    onSuccess: setPreview,
    onError: () => fail(t('mailSettings.backfillError')),
  });
  const backfillRun = useMutation({
    mutationFn: () => apiClient.post<{ created: number; skipped: unknown[] }>('/mail/backfill/run', {}),
    onSuccess: async (result) => {
      setConfirming(false);
      setPreview(null);
      ok(t('mailSettings.backfillDone', { count: result.created, skipped: result.skipped.length }));
      await reload();
    },
    onError: () => {
      setConfirming(false);
      fail(t('mailSettings.backfillError'));
    },
  });
  const enroll = useMutation({
    mutationFn: () => apiClient.post<{ secret: string }>('/mail/totp/enroll', {}),
    onSuccess: (result) => setTotpSecret(result.secret),
    onError: () => fail(t('mailSettings.totpError')),
  });
  const verify = useMutation({
    mutationFn: () => apiClient.post('/mail/totp/verify', { code: totpCode }),
    onSuccess: async () => {
      ok(t('mailSettings.totpVerified'));
      setTotpCode('');
      await reload();
    },
    onError: () => fail(t('mailSettings.totpError')),
  });
  const resetTotp = useMutation({
    mutationFn: () => apiClient.post('/mail/totp/reset', { code: totpCode }),
    onSuccess: async () => {
      setTotpSecret('');
      setTotpCode('');
      setRecoveryCodes([]);
      ok(t('mailSettings.totpResetDone'));
      await reload();
    },
    onError: () => fail(t('mailSettings.totpResetError')),
  });
  const confirmTotp = useMutation({
    mutationFn: async () => {
      const result = await apiClient.post<{ recovery_codes: string[] }>('/mail/totp/confirm', { code: totpCode });
      await apiClient.post('/mail/totp/verify', { code: totpCode });
      return result;
    },
    onSuccess: async (result) => {
      setRecoveryCodes(result.recovery_codes);
      ok(t('mailSettings.totpEnabled'));
      setTotpSecret('');
      setTotpCode('');
      await reload();
    },
    onError: () => fail(t('mailSettings.totpError')),
  });
  const testSend = useMutation({
    mutationFn: () => apiClient.post<{ sent?: boolean; message?: string; provider?: string }>('/mail/settings/test-send', { to: testTo }),
    onSuccess: (result) =>
      ok(result.sent ? t('mailSettings.testSentVia', { provider: result.provider ?? '', to: testTo }) : result.message || t('mailSettings.testQueued')),
    onError: () => fail(t('mailSettings.testError')),
  });

  const saveItem = (item: MailSetting) => {
    const raw = edits[item.key];
    if (raw === undefined) return;
    const value = coerceSettingValue(item.type, raw);
    if (value === undefined) return fail(t('mailSettings.saveError'));
    save.mutate({ key: item.key, value });
  };

  const groups = [...new Set(items.map((item) => item.group))];
  const setEdit = (key: string, value: string | boolean) => setEdits((current) => ({ ...current, [key]: value }));

  const control = (item: MailSetting) => {
    const edit = edits[item.key];
    if (item.is_secret) {
      return (
        <Field
          type="password"
          label={item.label}
          value={typeof edit === 'string' ? edit : ''}
          placeholder={item.is_set ? t('mailSettings.secretSet') : t('mailSettings.secretUnset')}
          onChange={(event) => setEdit(item.key, event.target.value)}
          autoComplete="new-password"
        />
      );
    }
    if (item.type === 'boolean') {
      return <Checkbox label={item.label} checked={Boolean(edit)} onChange={(event) => setEdit(item.key, event.target.checked)} />;
    }
    if (item.choices) {
      return (
        <Field kind="select" label={item.label} value={String(edit ?? '')} onChange={(event) => setEdit(item.key, event.target.value)}>
          {item.choices.map((choice) => (
            <option key={choice} value={choice}>
              {choice}
            </option>
          ))}
        </Field>
      );
    }
    const numeric = item.type === 'integer' || item.type === 'number';
    return (
      <Field
        type={numeric ? 'number' : 'text'}
        label={item.label}
        value={String(edit ?? '')}
        min={item.minimum}
        max={item.maximum}
        onChange={(event) => setEdit(item.key, event.target.value)}
      />
    );
  };

  return (
    <section aria-label={t('mailSettings.title')}>
      <PageHeader
        title={t('mailSettings.title')}
        subtitle={t('mailSettings.subtitle')}
        actions={
          <Button variant="outline" onClick={() => void reload()}>
            {t('mailSettings.refresh')}
          </Button>
        }
      />
      {settings.isError ? <Notice tone="info">{t('mailSettings.needsTotp')}</Notice> : null}
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      <div className={styles.settingsStack}>
        <MailSetupCheck />
        <section className={styles.panel} aria-label={t('mailSettings.security')}>
          <SectionHeader title={t('mailSettings.security')} />
          <ButtonGroup spaced>
            <Button variant="outline" onClick={() => enroll.mutate()}>
              {t('mailSettings.enrollTotp')}
            </Button>
          </ButtonGroup>
          {totpSecret ? (
            <p>
              {t('mailSettings.secret')}: <code>{totpSecret}</code>
            </p>
          ) : null}
          <Field label={t('mailSettings.code')} value={totpCode} maxLength={32} autoComplete="one-time-code" onChange={(event) => setTotpCode(event.target.value)} />
          <ButtonGroup spaced>
            {totpSecret ? (
              <Button disabled={totpCode.trim().length < 6} onClick={() => confirmTotp.mutate()}>
                {t('mailSettings.confirmTotp')}
              </Button>
            ) : null}
            <Button variant="outline" disabled={totpCode.trim().length < 6} onClick={() => verify.mutate()}>
              {t('mailSettings.verifyTotp')}
            </Button>
            <Button variant="outline" disabled={totpCode.trim().length < 6 || resetTotp.isPending} onClick={() => resetTotp.mutate()}>
              {t('mailSettings.resetTotp')}
            </Button>
          </ButtonGroup>
          {recoveryCodes.length > 0 ? (
            <div>
              <Notice tone="info">{t('mailSettings.recoveryCodes')}</Notice>
              <ul className={styles.codes}>
                {recoveryCodes.map((code) => (
                  <li key={code}>
                    <code>{code}</code>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        {groups.map((group) => (
          <section className={styles.panel} key={group} aria-label={group}>
            <SectionHeader title={group} />
            {items
              .filter((item) => item.group === group)
              .map((item) => (
                <div className={styles.settingRow} key={item.key}>
                  {control(item)}
                  {item.help ? <p className={styles.settingHelp}>{item.help}</p> : null}
                  <ButtonGroup size="compact">
                    <Button disabled={save.isPending} onClick={() => saveItem(item)} aria-label={`${t('mailSettings.save')}: ${item.label}`}>
                      {t('mailSettings.save')}
                    </Button>
                    <Button variant="outline" onClick={() => reset.mutate(item.key)} aria-label={`${t('mailSettings.resetButton')}: ${item.label}`}>
                      {t('mailSettings.resetButton')}
                    </Button>
                  </ButtonGroup>
                </div>
              ))}
          </section>
        ))}

        <section className={styles.panel} aria-label={t('mailSettings.backfill')}>
          <SectionHeader title={t('mailSettings.backfill')} />
          <ButtonGroup spaced>
            <Button variant="outline" onClick={() => backfillPreview.mutate()}>
              {t('mailSettings.preview')}
            </Button>
          </ButtonGroup>
          {preview ? (
            <>
              <p>{t('mailSettings.previewCount', { count: preview.count })}</p>
              {preview.sample.length > 0 ? <p className={styles.settingHelp}>{preview.sample.join(', ')}</p> : null}
              <ButtonGroup spaced>
                <Button disabled={preview.count === 0} onClick={() => setConfirming(true)}>
                  {t('mailSettings.run')}
                </Button>
              </ButtonGroup>
            </>
          ) : null}
        </section>

        <section className={styles.panel} aria-label={t('mailSettings.usage')}>
          <SectionHeader
            title={t('mailSettings.usage')}
            actions={
              <Button variant="outline" size="compact" onClick={() => void usage.refetch()}>
                {t('mailSettings.refreshUsage')}
              </Button>
            }
          />
          {usage.data ? (
            <>
              <p>
                {t('mailSettings.today')}: {usage.data.today} · {t('mailSettings.month')}: {usage.data.month}
              </p>
              <p>
                {t('mailSettings.queue')}: {usage.data.queue.queued} · {t('mailSettings.deferred')}: {usage.data.queue.deferred} · {t('mailSettings.failed')}: {usage.data.queue.failed}
              </p>
              {usage.data.top_mailboxes.length > 0 ? (
                <>
                  <h3>{t('mailSettings.topMailboxes')}</h3>
                  <ul className={styles.codes}>
                    {usage.data.top_mailboxes.map((box) => (
                      <li key={box.local_part}>
                        {box.local_part}: {box.sent}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </>
          ) : null}
        </section>

        <section className={styles.panel} aria-label={t('mailSettings.testSend')}>
          <SectionHeader title={t('mailSettings.testSend')} />
          <Field type="email" label={t('mailSettings.recipient')} value={testTo} onChange={(event) => setTestTo(event.target.value)} />
          <ButtonGroup spaced>
            <Button disabled={!testTo.includes('@')} onClick={() => testSend.mutate()}>
              {t('mailSettings.sendTest')}
            </Button>
          </ButtonGroup>
        </section>
      </div>

      {confirming ? (
        <Modal id="mail-backfill-title" title={t('mailSettings.confirmTitle')} subtitle={t('mailSettings.confirmBackfill')} onClose={() => setConfirming(false)} closeLabel={t('mail.cancel')}>
          <ButtonGroup spaced>
            <Button disabled={backfillRun.isPending} onClick={() => backfillRun.mutate()}>
              {t('mailSettings.confirmYes')}
            </Button>
          </ButtonGroup>
        </Modal>
      ) : null}
    </section>
  );
}
