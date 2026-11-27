import { useCallback, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

/** Owns the drawn-signature canvas lifecycle and exposes the ink flag used by submission validation. */
export function useAgreementSignatureCanvas() {
  const signatureCanvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);

  const pointerPosition = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (event.currentTarget.width / rect.width),
      y: (event.clientY - rect.top) * (event.currentTarget.height / rect.height),
    };
  }, []);

  const beginStroke = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    canvas.setPointerCapture(event.pointerId);
    const context = canvas.getContext('2d');
    if (!context) return;
    const point = pointerPosition(event);
    context.beginPath();
    context.moveTo(point.x, point.y);
    context.lineWidth = 2.5;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = '#0B2E2A';
    drawing.current = true;
    hasInk.current = true;
  }, [pointerPosition]);

  const drawStroke = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const context = event.currentTarget.getContext('2d');
    if (!context) return;
    const point = pointerPosition(event);
    context.lineTo(point.x, point.y);
    context.stroke();
  }, [pointerPosition]);

  const endStroke = useCallback(() => { drawing.current = false; }, []);
  const clearSignature = useCallback(() => {
    const canvas = signatureCanvas.current;
    if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    hasInk.current = false;
  }, []);

  return { signatureCanvas, hasInk, beginStroke, drawStroke, endStroke, clearSignature };
}
