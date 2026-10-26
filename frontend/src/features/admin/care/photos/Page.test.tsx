import { describe, expect, it } from 'vitest';
import { CARE_SCREEN_PATHS } from '../CareScreenPage';
describe('photos screen', () => {
  it('has a routed path', () => expect(CARE_SCREEN_PATHS.photos).toBeTruthy());
});
