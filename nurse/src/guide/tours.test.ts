import { describe, expect, it } from 'vitest';
import { NURSE_TOURS } from './tours';

describe('nurse tours', () => {
  it('has unique keys and non-empty steps', () => {
    expect(new Set(NURSE_TOURS.map((t) => t.key)).size).toBe(NURSE_TOURS.length);
    for (const t of NURSE_TOURS) { expect(t.steps.length).toBeGreaterThan(0); for (const s of t.steps) expect(s.title && s.body).toBeTruthy(); }
  });
  it('matches routes to one tour', () => {
    const hit = (p: string) => NURSE_TOURS.filter((t) => t.match(p)).map((t) => t.key);
    expect(hit('/')).toEqual(['today']); expect(hit('/visit/abc')).toEqual(['visit']); expect(hit('/active/abc')).toEqual(['active']);
  });
});
