import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { swipeDirection, useSwipe } from './useSwipe';

describe('swipeDirection', () => {
  it('needs a long, mostly sideways move', () => {
    expect(swipeDirection(-120, 10)).toBe('left');
    expect(swipeDirection(120, -10)).toBe('right');
    expect(swipeDirection(-60, 0)).toBeNull();
    expect(swipeDirection(-100, 90)).toBeNull();
    expect(swipeDirection(0, 200)).toBeNull();
  });
});

function Box({ onSwipe }: { onSwipe: (d: 'left' | 'right') => void }) {
  const handlers = useSwipe(onSwipe);
  return <div data-testid="box" {...handlers} />;
}
const touch = (x: number, y: number) => [{ clientX: x, clientY: y }];

describe('useSwipe', () => {
  it('reports a swipe once, from touch start to touch end', () => {
    const onSwipe = vi.fn();
    render(<Box onSwipe={onSwipe} />);
    const box = screen.getByTestId('box');
    fireEvent.touchStart(box, { touches: touch(220, 50) });
    fireEvent.touchEnd(box, { changedTouches: touch(90, 55) });
    fireEvent.touchEnd(box, { changedTouches: touch(10, 55) });
    expect(onSwipe).toHaveBeenCalledTimes(1);
    expect(onSwipe).toHaveBeenCalledWith('left');
  });
  it('ignores a tap and a scroll', () => {
    const onSwipe = vi.fn();
    render(<Box onSwipe={onSwipe} />);
    const box = screen.getByTestId('box');
    fireEvent.touchStart(box, { touches: touch(100, 100) });
    fireEvent.touchEnd(box, { changedTouches: touch(102, 100) });
    fireEvent.touchStart(box, { touches: touch(100, 100) });
    fireEvent.touchEnd(box, { changedTouches: touch(110, 300) });
    expect(onSwipe).not.toHaveBeenCalled();
  });
});
