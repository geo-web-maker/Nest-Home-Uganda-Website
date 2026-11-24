import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './guide.css';

/** In-app guidance. Local-first so it works offline; an optional server timestamp lets staff re-assign it to a user. */
export type Step = { anchor?: string; title: string; body: string };
export type Tour = { key: string; version: number; path: string; match: (path: string) => boolean; steps: Step[] };
type Saved = { done: Record<string, number>; skipAll?: boolean; resetSeen?: string };
type Run = { queue: Tour[]; step: number };
type Api = { startPage: () => void; startAll: () => void; skipAll: () => void };
const Ctx = createContext<Api | null>(null);
export const useGuide = () => useContext(Ctx);

type Props = { app: 'nurse' | 'admin'; userId: string; tours: Tour[]; fetchReset?: () => Promise<string | null>; children?: ReactNode };

export function GuideProvider({ app, userId, tours, fetchReset, children }: Props) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const storeKey = `nest.${app}.guide.${userId}`;
  const [saved, setSaved] = useState<Saved>({ done: {} });
  const [ready, setReady] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const ref = useRef(saved);
  const write = useCallback((next: Saved) => {
    ref.current = next; setSaved(next);
    try { localStorage.setItem(storeKey, JSON.stringify(next)); } catch { /* storage may be unavailable */ }
  }, [storeKey]);

  useEffect(() => {
    let live = true; let s: Saved = { done: {} };
    try { s = { done: {}, ...(JSON.parse(localStorage.getItem(storeKey) || 'null') ?? {}) }; } catch { /* corrupt entry: start fresh */ }
    ref.current = s; setSaved(s); setReady(true);
    fetchReset?.().then((r) => {
      if (live && r && (!ref.current.resetSeen || r > ref.current.resetSeen)) write({ done: {}, resetSeen: r });
    }).catch(() => { /* offline: the local state decides */ });
    return () => { live = false; };
  }, [storeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const tour = useMemo(() => tours.find((t) => t.match(pathname)), [tours, pathname]);
  useEffect(() => {
    if (!ready || run || !tour || saved.skipAll || (saved.done[tour.key] ?? 0) >= tour.version) return;
    const id = window.setTimeout(() => setRun({ queue: [tour], step: 0 }), 700);
    return () => window.clearTimeout(id);
  }, [ready, run, tour, saved]);

  const mark = (t: Tour) => write({ ...ref.current, done: { ...ref.current.done, [t.key]: t.version } });
  const next = () => {
    if (!run) return;
    const cur = run.queue[0];
    if (!cur) return;
    if (run.step + 1 < cur.steps.length) { setRun({ ...run, step: run.step + 1 }); return; }
    mark(cur);
    const rest = run.queue.slice(1);
    const first = rest[0];
    if (!first) { setRun(null); return; }
    if (first.path && first.path !== pathname) navigate(first.path);
    setRun({ queue: rest, step: 0 });
  };
  const stop = (all: boolean) => {
    const current = run?.queue[0];
    if (current) mark(current);
    if (all) write({ ...ref.current, skipAll: true });
    setRun(null);
  };
  const api = useMemo<Api>(() => ({
    startPage: () => { const t = tours.find((x) => x.match(pathname)) ?? tours[0]; if (t) setRun({ queue: [t], step: 0 }); },
    startAll: () => { const list = tours.filter((t) => t.path); if (!list.length) return; write({ done: {}, resetSeen: ref.current.resetSeen }); if (list[0]?.path && list[0].path !== pathname) navigate(list[0].path); setRun({ queue: list, step: 0 }); },
    skipAll: () => { write({ ...ref.current, skipAll: true }); setRun(null); },
  }), [tours, pathname, navigate, write]);

  const cur = run?.queue[0];
  return <Ctx.Provider value={api}>
    {children}
    {run && cur && <Overlay key={`${cur.key}:${run.step}`} step={cur.steps[run.step]!} i={run.step} n={cur.steps.length} more={run.queue.length > 1}
      onNext={next} onBack={() => run.step > 0 && setRun({ ...run, step: run.step - 1 })} onSkip={() => stop(false)} onStop={() => stop(true)} />}
  </Ctx.Provider>;
}

function Overlay({ step, i, n, more, onNext, onBack, onSkip, onStop }: { step: Step; i: number; n: number; more: boolean; onNext: () => void; onBack: () => void; onSkip: () => void; onStop: () => void }) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!step.anchor) return;
    let el: Element | null = null; let tries = 0;
    const measure = () => { if (el?.isConnected) setRect(el.getBoundingClientRect()); };
    const find = () => {
      el = [...document.querySelectorAll(step.anchor!)].find((e) => e.getClientRects().length > 0) ?? null;
      if (el) { el.scrollIntoView({ block: 'center' }); measure(); return true; }
      return false;
    };
    const timer = find() ? 0 : window.setInterval(() => { if (find() || ++tries > 12) window.clearInterval(timer); }, 150);
    window.addEventListener('resize', measure); window.addEventListener('scroll', measure, true);
    return () => { window.clearInterval(timer); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); };
  }, [step.anchor]);
  useEffect(() => { nextRef.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onSkip(); };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [onSkip]);

  const vw = window.innerWidth; const vh = window.innerHeight; const w = Math.min(340, vw - 24);
  let style: React.CSSProperties = { width: w, left: '50%', top: '50%', transform: 'translate(-50%,-50%)' };
  if (rect) {
    const left = Math.max(12, Math.min(vw - w - 12, rect.left + rect.width / 2 - w / 2));
    style = rect.bottom + 210 < vh ? { width: w, left, top: rect.bottom + 14 } : { width: w, left, bottom: vh - rect.top + 14 };
  }
  return <div className="guide-root">
    <div className="guide-catch" />
    {rect ? <div className="guide-spot" style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }} /> : <div className="guide-dim" />}
    <section className="guide-card" style={style} role="dialog" aria-modal="true" aria-labelledby="guide-t" aria-describedby="guide-b">
      <p className="guide-count" aria-live="polite">{i + 1} of {n}</p>
      <h2 id="guide-t">{step.title}</h2><p id="guide-b">{step.body}</p>
      <div className="guide-actions">
        <button type="button" className="guide-link" onClick={onSkip}>{more ? 'Skip this page' : 'Skip'}</button>
        {more && <button type="button" className="guide-link" onClick={onStop}>Stop tour</button>}
        {i > 0 && <button type="button" onClick={onBack}>Back</button>}
        <button type="button" ref={nextRef} className="guide-primary" onClick={onNext}>{i + 1 < n ? 'Next' : more ? 'Next page' : 'Done'}</button>
      </div>
    </section>
  </div>;
}

/** Small "?" menu for the app's top bar: replay this page's tips, the full tour, or silence the tips. */
export function GuideHelp({ className = '' }: { className?: string }) {
  const g = useGuide(); const [open, setOpen] = useState(false); const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  if (!g) return null;
  const pick = (fn: () => void) => () => { setOpen(false); fn(); };
  return <div className="guide-help" ref={box} data-guide="help">
    <button type="button" className={className} aria-label="Help and tips" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((v) => !v)}>?</button>
    {open && <div className="guide-menu" role="menu">
      <button role="menuitem" type="button" onClick={pick(g.startPage)}>Tips for this page</button>
      <button role="menuitem" type="button" onClick={pick(g.startAll)}>Take the full tour</button>
      <button role="menuitem" type="button" onClick={pick(g.skipAll)}>Turn off tips</button>
    </div>}
  </div>;
}
