import { useEffect, useRef, useState } from 'react';
import { Banner } from '../../ui/Banner';
import { PillButton } from '../../ui/PillButton';
import { Sheet, SheetActions } from '../../ui/Sheet';
import { SigningBlock } from './SigningBlock';
import { MAMA_CARE, TRACKER_FIELDS, addDays, tempNeedsAction, trackerKind, unmcProblem } from './rules';
import { clearDraft, newOpId, readDraft, writeDraft, type DocRow } from './store';
import { useCareFormsContext } from './useCareForms';

type Entry = { date: string; slot: 'AM' | 'PM'; values: Record<string, string>; initials?: string; action?: string; visit_id?: string | null };
type TData = { week_start: string; entries: Entry[]; care: Record<string, Record<string, string>>; notes: { date: string; text: string }[] };
type Props = { clientId: string; clientName: string; visitId: string | null; weekStart: string; doc?: DocRow; onClose: () => void };

export function TrackerSheet({ clientId, clientName, visitId, weekStart, doc, onClose }: Props) {
  const care = useCareFormsContext();
  const kind = trackerKind(care?.typeOf(clientId));
  const [data, setData] = useState<TData>(() => ({ week_start: weekStart, entries: [], care: {}, notes: [], ...(doc?.data as Partial<TData> | undefined) }));
  const [stage, setStage] = useState<'edit' | 'sign' | 'done'>('edit');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const loaded = useRef(false);
  const userId = care?.userId ?? '';
  useEffect(() => { if (!userId || loaded.current) return; loaded.current = true; void readDraft(userId, clientId, 'tracker', null, weekStart).then((d) => { if (d) setData(d as unknown as TData); }); }, [userId, clientId, weekStart]);
  useEffect(() => { if (userId && loaded.current && stage === 'edit') void writeDraft(userId, clientId, 'tracker', null, data as unknown as Record<string, unknown>, weekStart); }, [data, userId, clientId, weekStart, stage]);
  if (!care) return null;
  if (!kind) return <Sheet labelledBy="tr-title"><h2 id="tr-title">Weekly tracker</h2><Banner tone="info">Daily trackers are only for patients set as Mama or Baby by admin.</Banner><SheetActions><PillButton tone="ghost" size="full" showArrow={false} onClick={onClose}>Close</PillButton></SheetActions></Sheet>;

  const fields = TRACKER_FIELDS[kind];
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const entryOf = (date: string, slot: 'AM' | 'PM') => data.entries.find((e) => e.date === date && e.slot === slot);
  const patch = (date: string, slot: 'AM' | 'PM', p: Partial<Entry>, vk?: [string, string]) => setData((d) => {
    const cur = d.entries.find((e) => e.date === date && e.slot === slot) ?? { date, slot, values: {} };
    const next: Entry = { ...cur, ...p, values: vk ? { ...cur.values, [vk[0]]: vk[1] } : cur.values, visit_id: visitId };
    return { ...d, entries: [...d.entries.filter((e) => e !== cur), next] };
  });
  const clean = (): TData => ({ ...data, entries: data.entries.filter((e) => Object.values(e.values).some(Boolean) || e.initials || e.action) });

  async function send(nurse?: { method: string; evidence: Record<string, unknown>; image?: string | null }) {
    setBusy(true); setError('');
    try {
      const r = await care!.submit({ op_id: newOpId(), form_id: 'tracker', client_id: clientId, visit_id: null, data: clean() as unknown as Record<string, unknown>, ...(nurse ? { nurse_signature: nurse } : {}) });
      if (nurse) { await clearDraft(userId, clientId, 'tracker', null, weekStart); setStage('done'); return r; }
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save. Entries are kept on this device.'); } finally { setBusy(false); }
  }
  return <Sheet labelledBy="tr-title" className="cf-sheet">
    <h2 id="tr-title">{kind === 'baby' ? 'Baby' : 'Mama'} weekly tracker</h2>
    <p className="cf-hint">{clientName} · week of {weekStart}. Temperatures above 37.5 °C{kind === 'baby' ? ' or below 36.5 °C' : ''} need an action entry.</p>
    {stage === 'edit' && <>
      {days.map((date) => <details key={date} className="cf-day" open={date === days.find((d) => d >= new Date().toISOString().slice(0, 10)) }><summary>{date}</summary>
        {(['AM', 'PM'] as const).map((slot) => { const e = entryOf(date, slot); const temp = e?.values.temp; return <fieldset key={slot} className="cf-slot"><legend>{slot}</legend>
          <div className="cf-row">{fields.map(([k, label]) => <label key={k}>{label}<input value={e?.values[k] ?? ''} inputMode={k === 'temp' ? 'decimal' : undefined} onChange={(ev) => patch(date, slot, {}, [k, ev.target.value])} /></label>)}</div>
          {tempNeedsAction(temp, e?.action, false, kind === 'baby') && <label className="cf-warn">Action taken for the abnormal temperature<input value={e?.action ?? ''} onChange={(ev) => patch(date, slot, { action: ev.target.value })} /></label>}
          <label>Initials<input maxLength={6} value={e?.initials ?? ''} onChange={(ev) => patch(date, slot, { initials: ev.target.value })} /></label></fieldset>; })}
        {kind === 'mama' && <details><summary>Care for the day</summary>{MAMA_CARE.map(([k, label]) => <label key={k}>{label}<input value={data.care[date]?.[k] ?? ''} onChange={(ev) => setData((d) => ({ ...d, care: { ...d.care, [date]: { ...d.care[date], [k]: ev.target.value } } }))} /></label>)}</details>}
      </details>)}
      <label>Week note<textarea rows={3} value={data.notes[0]?.text ?? ''} onChange={(e) => setData((d) => ({ ...d, notes: e.target.value ? [{ date: weekStart, text: e.target.value }] : [] }))} /></label>
      {error && <Banner tone="warn">{error}</Banner>}
      <SheetActions>
        <PillButton tone="gold" size="full" disabled={busy} onClick={() => void send()}>Save week</PillButton>
        <PillButton tone="ghost" size="full" showArrow={false} disabled={busy} onClick={() => setStage('sign')}>Sign this week</PillButton>
        <PillButton tone="ghost" size="full" showArrow={false} onClick={onClose}>Close</PillButton>
      </SheetActions>
    </>}
    {stage === 'sign' && <><SigningBlock mode="nurse" formId="tracker" online={care.online} problem={unmcProblem(care.registration)} busy={busy} onSubmit={async (sig) => { await send(sig); }} />{error && <Banner tone="warn">{error}</Banner>}<SheetActions><PillButton tone="ghost" size="full" showArrow={false} onClick={() => setStage('edit')}>Back</PillButton></SheetActions></>}
    {stage === 'done' && <><Banner tone="ok">Week signed.</Banner><SheetActions><PillButton tone="gold" size="full" showArrow={false} onClick={onClose}>Done</PillButton></SheetActions></>}
  </Sheet>;
}
