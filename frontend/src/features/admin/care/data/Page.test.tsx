import { describe, expect, it } from 'vitest';
import { CARE_SCREEN_PATHS } from '../CareScreenPage';
describe('data screen',()=>{ it('has a routed path',()=>expect(CARE_SCREEN_PATHS.data).toBeTruthy()); });
