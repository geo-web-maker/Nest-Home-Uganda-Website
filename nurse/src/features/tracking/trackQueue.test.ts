import { beforeEach, describe, expect, it } from 'vitest';
import { enqueue, flushQueue, readQueue, toPayload } from './trackQueue';

const sample = (i: number) => toPayload('v1', 1_000_000, { at: 1_000_000 + i * 1000, state: 'good', lat: 0.3, lng: 32.5, accuracy: 12 }, true);

describe('visit track queue', () => {
  beforeEach(() => localStorage.clear());

  it('builds a payload with the time into the visit and a stable idempotency key', () => {
    const point = sample(90);
    expect(point.elapsed_s).toBe(90);
    expect(point.client_op_id).toBe('trk-v1-1090000-bg');
    expect(point.background).toBe(true);
  });

  it('sends in batches of at most 100 and empties the queue', async () => {
    enqueue('v1', Array.from({ length: 250 }, (_, i) => sample(i)));
    const sizes: number[] = [];
    await flushQueue(async (_id, points) => { sizes.push(points.length); });
    expect(sizes).toEqual([100, 100, 50]);
    expect(readQueue()).toHaveLength(0);
  });

  it('keeps samples when the network fails and drops them when the visit no longer exists', async () => {
    enqueue('v1', [sample(1), sample(2)]);
    await flushQueue(async () => { throw { status: 0 }; });
    expect(readQueue()).toHaveLength(2);
    await flushQueue(async () => { throw { status: 404 }; });
    expect(readQueue()).toHaveLength(0);
  });
});
