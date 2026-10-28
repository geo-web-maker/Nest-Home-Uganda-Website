import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../../../components/admin/PageHeader';
import { Button } from '../../../components/ui/Button';
import { Field } from '../../../components/ui/Field';
import { apiClient } from '../../../lib/api/client';
import { useAuth } from '../auth/useAuth';
import { hasScopes } from '../auth/hasScopes';
import type { SettingEntry, SettingsGroup } from './types';
import styles from './SettingsPage.module.css';
const tabs: Array<{ id: SettingsGroup; title: string }> = [
  { id: 'business', title: 'business' },
  { id: 'home', title: 'homepage' },
  { id: 'forms', title: 'forms' },
  { id: 'notify', title: 'notifications' },
  { id: 'theme', title: 'appearance' },
  { id: 'seo', title: 'seo' },
  { id: 'site', title: 'languages' },
  { id: 'sms', title: 'sms' },
  { id: 'system', title: 'system' },
];
const keys: Record<SettingsGroup, string[]> = {
  business: [
    'business.name',
    'business.tagline',
    'business.phone_display',
    'business.phone_dial',
    'business.whatsapp',
    'business.email',
    'business.address',
    'business.hours',
    'business.facebook',
    'business.instagram',
    'business.location_strip',
  ],
  home: [
    'home.headline',
    'home.accent',
    'home.btn1',
    'home.btn2',
    'home.lead',
    'home.eggs',
    'home.promise',
    'home.show_team',
    'home.show_testimonials',
    'home.show_sticky_bar',
  ],
  forms: [
    'forms.who_options',
    'forms.start_options',
    'forms.consent_text',
    'forms.thanks_message',
    'forms.whatsapp_prefix',
    'forms.open_whatsapp_after',
    'forms.save_enquiries',
    'forms.require_phone',
  ],
  notify: [
    'notify.enquiry_emails',
    'notify.application_emails',
    'notify.sms_number',
    'notify.reminder_minutes',
    'notify.email_new_enquiry',
    'notify.daily_summary',
    'notify.hours_from',
    'notify.hours_to',
  ],
  theme: ['theme.forest', 'theme.gold', 'theme.leaf', 'theme.mint', 'theme.logo', 'theme.favicon'],
  seo: ['seo.home_title', 'seo.home_description', 'seo.google_business_url', 'seo.index'],
  site: ['site.default_language', 'site.languages_enabled'],
  system: [
    'system.MAINTENANCE_MODE',
    'system.ENABLE_USER_REGISTRATION',
    'system.ENABLE_BETA_FEATURES',
    'system.MAX_DAILY_VISITS',
    'system.MAX_ITEMS_PER_USER',
    'system.SESSION_TIMEOUT_MINUTES',
    'system.MAX_UPLOAD_SIZE_MB',
    'system.DEFAULT_SENDER_EMAIL',
    'system.SMS_NOTIFICATIONS_ENABLED',
    'system.WEBHOOK_RETRY_ATTEMPTS',
    'system.PAYMENT_GATEWAY_MODE',
    'system.API_REQUEST_TIMEOUT_SEC',
    'system.SYNC_CRON_INTERVAL_MIN',
    'system.PLATFORM_SITE_NAME',
    'system.DEFAULT_TIMEZONE',
    'system.SUPPORT_CONTACT_EMAIL',
  ],
  sms: [
    'sms.provider',
    'sms.sender_id',
    'sms.message_category',
    'sms.staff_enabled',
    'sms.visitor_enabled',
    'sms.visitor_text',
    'sms.daily_limit',
  ],
};
function display(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  if (value === null || value === undefined) return '';
  return JSON.stringify(value, null, 2);
}
function coerce(value: string | boolean, original: unknown): unknown {
  if (typeof original === 'boolean') return Boolean(value);
  if (typeof original === 'number') return Number(value);
  if (Array.isArray(original) || (original !== null && typeof original === 'object')) {
    try {
      return JSON.parse(String(value));
    } catch {
      return value;
    }
  }
  return value;
}
const NUMBER_KEYS = [
  'notify.reminder_minutes',
  'sms.daily_limit',
  'system.MAX_DAILY_VISITS',
  'system.MAX_ITEMS_PER_USER',
  'system.SESSION_TIMEOUT_MINUTES',
  'system.MAX_UPLOAD_SIZE_MB',
  'system.WEBHOOK_RETRY_ATTEMPTS',
  'system.API_REQUEST_TIMEOUT_SEC',
  'system.SYNC_CRON_INTERVAL_MIN',
];
const NUMBER_BOUNDS: Record<string, { min: number; max: number }> = {
  'system.MAX_DAILY_VISITS': { min: 1, max: 100000 },
  'system.MAX_ITEMS_PER_USER': { min: 1, max: 100000 },
  'system.SESSION_TIMEOUT_MINUTES': { min: 5, max: 1440 },
  'system.MAX_UPLOAD_SIZE_MB': { min: 1, max: 1024 },
  'system.WEBHOOK_RETRY_ATTEMPTS': { min: 0, max: 20 },
  'system.API_REQUEST_TIMEOUT_SEC': { min: 1, max: 300 },
  'system.SYNC_CRON_INTERVAL_MIN': { min: 1, max: 1440 },
};
const EMAIL_KEYS = ['business.email', 'system.DEFAULT_SENDER_EMAIL', 'system.SUPPORT_CONTACT_EMAIL'];
const TEXTAREA_KEYS = [
  'home.eggs',
  'home.promise',
  'forms.who_options',
  'forms.start_options',
  'forms.consent_text',
  'forms.thanks_message',
  'forms.whatsapp_prefix',
  'notify.enquiry_emails',
  'notify.application_emails',
  'notify.sms_number',
  'sms.visitor_text',
];

export function SettingsPage() {
  const { t } = useTranslation('admin');
  const { user } = useAuth();
  const client = useQueryClient();
  const canReadSettings = hasScopes(user, ['settings:read']);
  const canWrite = hasScopes(user, ['settings:write']);
  const canSms = hasScopes(user, ['system:manage']);
  const canSystem = hasScopes(user, ['system:manage']);
  const [tab, setTab] = useState<SettingsGroup>('business');
  const [edited, setEdited] = useState<Record<string, string | boolean>>({});
  const activeTab: SettingsGroup = canReadSettings ? tab : canSystem ? 'system' : 'sms';
  const canWriteActiveTab = activeTab === 'sms' || activeTab === 'system' ? canSystem : canWrite;
  const data = useQuery({
    queryKey: ['admin', 'settings', canReadSettings ? 'all' : canSystem ? 'system' : 'sms'],
    queryFn: () =>
      apiClient.get<SettingEntry[]>(canReadSettings ? '/admin/settings' : canSystem ? '/admin/settings/system' : '/admin/settings/sms'),
  });
  const byKey = useMemo(
    () => Object.fromEntries((data.data ?? []).map((entry) => [entry.key, entry.value])),
    [data.data],
  );
  const save = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {};
      for (const key of keys[activeTab])
        if (edited[key] !== undefined) {
          body[key.slice(key.indexOf('.') + 1)] = coerce(edited[key], byKey[key]);
        }
      return apiClient.patch<SettingEntry[]>(`/admin/settings/${activeTab}`, body);
    },
    onSuccess: async () => {
      setEdited({});
      await client.invalidateQueries({ queryKey: ['admin', 'settings'] });
      await client.invalidateQueries({ queryKey: ['site'] });
    },
  });
  const resetTheme = useMutation({
    mutationFn: () => apiClient.post('/admin/settings/theme/reset', {}),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['admin', 'settings'] });
    },
  });
  const currentKeys = keys[activeTab].filter(
    (key) =>
      !(
        activeTab === 'notify' &&
        ['notify.sms_new_enquiry', 'notify.sms_confirm_visitor'].includes(key)
      ),
  );
  const valueFor = (key: string) => (edited[key] === undefined ? byKey[key] : edited[key]);
  const isBoolean = (key: string) =>
    typeof valueFor(key) === 'boolean' ||
    [
      'forms.open_whatsapp_after',
      'forms.save_enquiries',
      'forms.require_phone',
      'home.show_team',
      'home.show_testimonials',
      'home.show_sticky_bar',
      'notify.email_new_enquiry',
      'notify.daily_summary',
      'seo.index',
      'sms.staff_enabled',
      'sms.visitor_enabled',
      'system.MAINTENANCE_MODE',
      'system.ENABLE_USER_REGISTRATION',
      'system.ENABLE_BETA_FEATURES',
      'system.SMS_NOTIFICATIONS_ENABLED',
    ].includes(key);
  return (
    <>
      <PageHeader title={t('nav.settings')} subtitle={t('settings.subtitle')} />
      <div className={styles.tabs} role="tablist" aria-label={t('settings.tabsLabel')}>
        {tabs
          .filter((item) => (canReadSettings || item.id === 'sms' || item.id === 'system') &&
            (item.id !== 'sms' && item.id !== 'system' || canSystem))
          .map((item) => (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === item.id}
              className={activeTab === item.id ? styles.activeTab : styles.tab}
              key={item.id}
              onClick={() => {
                setTab(item.id);
                setEdited({});
              }}
            >
              {t(`settings.tabs.${item.title}`)}
            </button>
          ))}
      </div>
      {data.isError ? (
        <div role="alert">
          <p>{t('settings.error')}</p>
          <Button variant="outline" onClick={() => void data.refetch()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : !data.data ? (
        <p aria-busy="true">{t('settings.loading')}</p>
      ) : (
        <section className={styles.panel}>
          <h2>
            {t(`settings.tabs.${tabs.find((item) => item.id === activeTab)?.title ?? 'business'}`)}
          </h2>
          {activeTab === 'sms' && !canSms ? (
            <p role="alert">{t('settings.sms.scopeRequired')}</p>
          ) : (
            <form
              className={styles.fields}
              onSubmit={(event) => {
                event.preventDefault();
                save.mutate();
              }}
            >
              {currentKeys.map((key) => {
                const value = valueFor(key);
                const locked = key === 'sms.provider' || !canWriteActiveTab;
                return isBoolean(key) ? (
                  <label className={styles.check} key={key}>
                    <input
                      type="checkbox"
                      checked={Boolean(value)}
                      disabled={locked}
                      onChange={(event) =>
                        setEdited((current) => ({ ...current, [key]: event.target.checked }))
                      }
                    />
                    {t(`settings.fields.${key}`)}
                  </label>
                ) : key === 'system.PAYMENT_GATEWAY_MODE' ? (
                  <Field
                    key={key}
                    kind="select"
                    label={t(`settings.fields.${key}`)}
                    value={edited[key] === undefined ? display(value || 'sandbox') : String(edited[key])}
                    onChange={(event) =>
                      setEdited((current) => ({ ...current, [key]: event.target.value }))
                    }
                    disabled={locked}
                  >
                    <option value="sandbox">Sandbox</option>
                    <option value="production">Production</option>
                  </Field>
                ) : (
                  <Field
                    key={key}
                    label={t(`settings.fields.${key}`)}
                    {...(TEXTAREA_KEYS.includes(key)
                      ? { kind: 'textarea' as const, rows: 3 }
                      : {
                          type: NUMBER_KEYS.includes(key)
                            ? ('number' as const)
                            : EMAIL_KEYS.includes(key)
                              ? ('email' as const)
                              : ('text' as const),
                          min: NUMBER_BOUNDS[key]?.min,
                          max: NUMBER_BOUNDS[key]?.max,
                          step: NUMBER_KEYS.includes(key) ? 1 : undefined,
                        })}
                    value={edited[key] === undefined ? display(value) : String(edited[key])}
                    onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                      setEdited((current) => ({ ...current, [key]: event.target.value }))
                    }
                    disabled={locked}
                  />
                );
              })}
              {activeTab === 'sms' && (
                <p className={styles.note}>
                  {t('settings.sms.balanceUnavailable')} {t('settings.sms.testSmsUnavailable')}
                </p>
              )}
              {activeTab === 'system' && (
                <p className={styles.note}>{t('settings.system.securityNote')}</p>
              )}
              {save.isError && <p role="alert">{t('settings.saveError')}</p>}
              <div className={styles.actions}>
                {canWriteActiveTab && (
                  <Button type="submit" disabled={save.isPending}>
                    {save.isPending ? t('settings.saving') : t('settings.save')}
                  </Button>
                )}
                {activeTab === 'theme' && canWrite && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={resetTheme.isPending}
                    onClick={() => resetTheme.mutate()}
                  >
                    {t('settings.resetTheme')}
                  </Button>
                )}
              </div>
            </form>
          )}
        </section>
      )}
    </>
  );
}
