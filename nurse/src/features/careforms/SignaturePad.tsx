import { useEffect, useRef } from 'react';

type Props = { label: string; onChange: (png: string | null) => void; height?: number };
/** Finger/stylus drawing pad. Emits a PNG data URL (small enough for the 200 KB server limit) or null when cleared. */
export function SignaturePad({ label, onChange, height = 160 }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    c.width = 480; c.height = height;
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.strokeStyle = '#0B2E2A';
  }, [height]);
  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = ref.current!; const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => { const ctx = ref.current?.getContext('2d'); if (!ctx) return; drawing.current = true; ref.current!.setPointerCapture?.(e.pointerId); const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => { if (!drawing.current) return; const ctx = ref.current?.getContext('2d'); if (!ctx) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); dirty.current = true; };
  const up = () => { if (!drawing.current) return; drawing.current = false; if (dirty.current) onChange(ref.current!.toDataURL('image/png')); };
  const clear = () => { const c = ref.current; c?.getContext('2d')?.clearRect(0, 0, c.width, c.height); dirty.current = false; onChange(null); };
  return <div className="cf-pad">
    <canvas ref={ref} className="cf-pad__canvas" aria-label={label} role="img" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} style={{ touchAction: 'none' }} />
    <button type="button" className="cf-link" onClick={clear}>Clear</button>
  </div>;
}
