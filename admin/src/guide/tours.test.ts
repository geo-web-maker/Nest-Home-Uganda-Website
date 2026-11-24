import { describe, expect, it } from 'vitest';
import { ADMIN_TOURS } from './tours';

describe('admin tours', () => {
  it('has unique keys and non-empty steps', () => {
    expect(new Set(ADMIN_TOURS.map((t) => t.key)).size).toBe(ADMIN_TOURS.length);
    for (const t of ADMIN_TOURS) { expect(t.steps.length).toBeGreaterThan(0); for (const s of t.steps) expect(s.title && s.body).toBeTruthy(); }
  });
  it('matches routes to one tour', () => {
    const hit = (p: string) => ADMIN_TOURS.filter((t) => t.match(p)).map((t) => t.key);
    expect(hit('/')).toEqual(['dashboard']); expect(hit('/care/visits')).toEqual(['visits']);
  });
});
