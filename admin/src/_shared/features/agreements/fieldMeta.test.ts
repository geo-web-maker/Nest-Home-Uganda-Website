/* GENERATED from frontend/src. Edit there, then run: node scripts/sync-admin-shared.mjs */
import { describe, expect, it } from 'vitest';
import { CHOICES, FIELD_META, paymentOptionKind, HIDDEN_FIELDS, NOT_IN_FORM, notInFormNote, SCHEDULE_SECTIONS, cleanMoney, formatMoney } from './fieldMeta';

describe('agreement field metadata', () => {
  const sectioned = Object.values(SCHEDULE_SECTIONS).flatMap((tab) => tab.sections.flatMap((section) => section.paths));

  it('describes every field that is placed in a section, exactly once', () => {
    expect(new Set(sectioned).size).toBe(sectioned.length);
    for (const path of sectioned) expect(FIELD_META[path], path).toBeDefined();
  });

  it('never offers N/A for the values the server must calculate or check', () => {
    expect(FIELD_META['schedule_b.total_fee']?.na).toBe(false);
    expect(FIELD_META['schedule_b.currency']?.options).toEqual(['UGX', 'USD']);
  });

  it('keeps every representative option free of the word "patient" so representative details are required', () => {
    const options = FIELD_META['schedule_c.decision_maker']?.options ?? [];
    expect(options.filter((option) => !option.toLowerCase().includes('patient'))).toHaveLength(options.length - 1);
  });

  it('stores money as plain digits the server can parse', () => {
    expect(cleanMoney('UGX 1,500,000.505')).toBe('1500000.50');
    expect(formatMoney('1500000')).toBe('1,500,000');
    expect(formatMoney('abc')).toBe('');
  });

  it('offers the tick-box answers of the agreement as pick-lists, in the order the document prints them', () => {
    expect(FIELD_META['schedule_a.coverage_arrangement']).toMatchObject({ kind: 'select', options: [...CHOICES.coverage] });
    expect(FIELD_META['schedule_c.decision_maker']?.options).toEqual(['Patient with capacity', 'Parent/Guardian', 'Other lawful representative']);
    expect(FIELD_META['schedule_c.communication_channel']?.options).toEqual(['Telephone', 'SMS', 'Email', 'WhatsApp', 'Other']);
    expect(FIELD_META['schedule_c.information_permitted']?.options).toEqual(['Booking / billing only', 'Agreed care updates', 'Other']);
    expect(FIELD_META['schedule_b.tax_treatment']?.options).toEqual(['Inclusive', 'Exempt', 'Additional']);
    expect(FIELD_META['schedule_b.price_type']?.options).toEqual(['Fixed', 'Estimate']);
  });

  it('asks for the representative only when someone other than the patient decides', () => {
    const show = FIELD_META['schedule_c.representative_name']!.showWhen!;
    expect(show(() => '')).toBe(false);
    expect(show(() => 'Patient with capacity')).toBe(false);
    expect(show(() => 'The patient personally')).toBe(false);
    expect(show(() => 'Parent/Guardian')).toBe(true);
    expect(show(() => 'Other lawful representative')).toBe(true);
  });

  it('shows the other-channel details only for "Other"', () => {
    const show = FIELD_META['schedule_c.other_channel_details']!.showWhen!;
    expect(show((path) => (path === 'schedule_c.communication_channel' ? 'Other' : ''))).toBe(true);
    expect(show((path) => (path === 'schedule_c.communication_channel' ? 'Email' : ''))).toBe(false);
  });

  it('asks for a duplicated answer only once', () => {
    for (const path of HIDDEN_FIELDS) expect(sectioned, path).not.toContain(path);
    expect(sectioned).toContain('patient.dob_or_age');
  });

  it('explains fields that have no line in the printed agreement', () => {
    for (const path of NOT_IN_FORM) expect(FIELD_META[path], path).toBeDefined();
    expect(notInFormNote('schedule_b.rates', 'staff')).toContain('Mark N/A to skip');
    expect(notInFormNote('schedule_b.total_fee', 'staff')).toBeNull();
  });
});

describe('payment option', () => {
  it('maps the answer, treating blank and N/A as the standard payment', () => {
    expect(paymentOptionKind('')).toBe('standard');
    expect(paymentOptionKind('N/A')).toBe('standard');
    expect(paymentOptionKind('Payment plan')).toBe('plan');
    expect(paymentOptionKind('Plan already provided')).toBe('already');
  });
  it('shows plan details only for a plan and the 50/50 dates only for the standard payment', () => {
    const get = (option: string) => (path: string) => (path === 'schedule_b.payment_option' ? option : '');
    expect(FIELD_META['schedule_b.payment_plan_details']!.showWhen!(get(''))).toBe(false);
    expect(FIELD_META['schedule_b.payment_plan_details']!.showWhen!(get('Plan already provided'))).toBe(true);
    expect(FIELD_META['schedule_b.advance_due_date']!.showWhen!(get('Payment plan'))).toBe(false);
    expect(FIELD_META['schedule_b.balance_due_dates']!.showWhen!(get('Standard 50/50'))).toBe(true);
  });
});
