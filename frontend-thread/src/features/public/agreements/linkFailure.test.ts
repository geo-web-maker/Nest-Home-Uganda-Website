import { ApiError } from '../../../lib/api/client';
import { describeLinkFailure } from './linkFailure';

const linkError = (state: string, ref: string) =>
  new ApiError(state === 'expired' ? 410 : 404, `link_${state}`, 'server text', { state, ref, link_id: ref.split('-')[1] ?? '', release: 'abc1234' });

describe('describeLinkFailure', () => {
  it('gives each link problem its own title and support ref', () => {
    expect(describeLinkFailure(linkError('expired', 'L5-9F2A1C')).title).toBe('This agreement link has expired');
    expect(describeLinkFailure(linkError('not_found', 'L3-9F2A1C')).ref).toMatch(/^L3-9F2A1C-.+\.abc1234$/);
    expect(describeLinkFailure(linkError('mistyped', 'L2------')).title).toBe('This link is incomplete');
    expect(describeLinkFailure(linkError('signed', 'L6-111111')).title).toBe('This agreement is already signed');
  });

  it('never calls a network, busy or server failure a bad link', () => {
    expect(describeLinkFailure(new ApiError(0, 'network_error', 'x')).ref).toMatch(/^N1-/);
    expect(describeLinkFailure(new ApiError(429, 'rate_limited', 'x'))).toMatchObject({ kind: 'busy', retry: true });
    expect(describeLinkFailure(new ApiError(500, 'server_error', 'x', {}, 'req123abc'))).toMatchObject({ kind: 'server', retry: true });
  });

  it('flags an old server or cached page when the reply has no link reason', () => {
    expect(describeLinkFailure(new ApiError(404, 'not_found', 'The requested resource was not found')).ref).toMatch(/^N5-/);
    expect(describeLinkFailure(new SyntaxError('Unexpected token <')).ref).toMatch(/^N4-/);
  });
});
