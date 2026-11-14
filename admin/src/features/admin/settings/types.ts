// TODO(gen-types): replace with generated types
export type SettingEntry = { key: string; group: string; value: unknown };
export type SettingPayload = Record<string, unknown>;
export type SettingsGroup =
  'business' | 'home' | 'forms' | 'notify' | 'theme' | 'seo' | 'site' | 'sms' | 'system';
