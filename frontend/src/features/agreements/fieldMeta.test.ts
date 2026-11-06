import { describe, expect, it } from 'vitest';
import { FIELD_META, SCHEDULE_SECTIONS, cleanMoney, formatMoney } from './fieldMeta';

describe('agreement field metadata', () => {
  const sectioned = Object.values(SCHEDULE_SECTIONS).flatMap((tab) => tab.sections.flatMap((section) => section.paths));

  it('describes every field that is placed in a section, exactly once', () => {
    expect(new Set(sectioned).size).toBe(sectioned.length);
    for (const path of sectioned) expect(FIELD_META[path], path).toBeDefined();
  });

  it('never offers N/A for the values the server must calculate or check', () => {
    expect(FIELD_META['schedule_b.total_fee'].na).toBe(false);
    expect(FIELD_META['schedule_b.currency'].options).toEqual(['UGX', 'USD']);
  });

  it('keeps every representative option free of the word "patient" so representative details are required', () => {
    const options = FIELD_META['schedule_c.decision_maker'].options ?? [];
    expect(options.filter((option) => !option.toLowerCase().includes('patient'))).toHaveLength(options.length - 1);
  });

  it('stores money as plain digits the server can parse', () => {
    expect(cleanMoney('UGX 1,500,000.505')).toBe('1500000.50');
    expect(formatMoney('1500000')).toBe('1,500,000');
    expect(formatMoney('abc')).toBe('');
  });
});
