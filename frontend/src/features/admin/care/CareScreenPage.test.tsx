import { describe, expect, it } from 'vitest';
import { CARE_SCREEN_PATHS, CARE_SCREEN_SCOPES } from './CareScreenPage';

describe('Track D care routes', () => {
  it('declares every Track D screen and its read scope', () => {
    expect(Object.keys(CARE_SCREEN_PATHS)).toEqual(expect.arrayContaining([
      'nurses','clients','places','visits','flags','team','photos','alerts','timesheets','sos','reports','settings','readiness','data','audit',
    ]));
    for (const key of Object.keys(CARE_SCREEN_PATHS)) expect(CARE_SCREEN_SCOPES[key as keyof typeof CARE_SCREEN_SCOPES].length).toBeGreaterThan(0);
  });
});
