import { useRef, type TouchEvent } from 'react';

export type SwipeDirection = 'left' | 'right';

/** A deliberate sideways flick: far enough, and clearly more sideways than up or down (so scrolling never triggers it). */
export function swipeDirection(dx: number, dy: number, minimum = 80): SwipeDirection | null {
  if (Math.abs(dx) < minimum || Math.abs(dy) > Math.abs(dx) / 2) return null;
  return dx < 0 ? 'left' : 'right';
}

export function useSwipe(onSwipe: (direction: SwipeDirection) => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (event: TouchEvent) => {
      const touch = event.touches[0];
      start.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
    },
    onTouchEnd: (event: TouchEvent) => {
      const touch = event.changedTouches[0];
      const from = start.current;
      start.current = null;
      if (!from || !touch) return;
      const direction = swipeDirection(touch.clientX - from.x, touch.clientY - from.y);
      if (direction) onSwipe(direction);
    },
  };
}
