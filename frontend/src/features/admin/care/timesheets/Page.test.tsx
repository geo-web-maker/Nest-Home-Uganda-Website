import { describe, expect, it } from 'vitest';
import { CARE_SCREEN_PATHS } from '../CareScreenPage';
describe('timesheets screen',()=>{ it('has a routed path',()=>expect(CARE_SCREEN_PATHS.timesheets).toBeTruthy()); });
