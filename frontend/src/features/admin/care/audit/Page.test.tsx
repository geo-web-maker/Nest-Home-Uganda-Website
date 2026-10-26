import { describe, expect, it } from 'vitest';
import { CARE_SCREEN_PATHS } from '../CareScreenPage';
describe('audit screen',()=>it('is routed',()=>expect(CARE_SCREEN_PATHS.audit).toBe('audit')));
