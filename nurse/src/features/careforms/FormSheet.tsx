import { useEffect, useRef, useState } from 'react';
import { Banner } from '../../ui/Banner';
import { PillButton } from '../../ui/PillButton';
import { Sheet, SheetActions } from '../../ui/Sheet';
import { SigningBlock } from './SigningBlock';
import { administrationProblem, clientOptional, clientTakesPart, defOf, formTitle, tempNeedsAction, unmcProblem } from './rules';
import { clearDraft, newOpId, readDraft, writeDraft, type ClientSigPayload, type DocRow, type NurseSigPayload } from './store';
import { useCareFormsContext } from './useCareForms';
import type { FormItem } from './formDefs';

type Props = { formId: string; clientId: string; clientName: string; visitId: string | null; doc?: DocRow; onClose: () => void };
type Data = Record<string, unknown>;
type Admin = { due?: string; at?: string; dose_route?: string; given?: boolean; code?: string; reason?: string; initials?: string };
const s = (d: Data, k: string) => String(d[k] ?? '');

export function FormSheet({ formId, clientId, clientName, visitId, doc, onClose }: Props) {
  const care = useCareFormsContext();
  const def = defOf(formId);
  const [data, setData] = useState<Data>(doc?.data ?? {});
  const [stage, setStage] = useState<'edit' | 'client' | 'nurse' | 'done'>(doc?.status === 'pending' ? 'nurse' : 'edit');
  const [clientJoins, setClientJoins] = useState(clientTakesPart(formId));
  const [agreed, setAgreed] = useState(Boolean(doc?.data?.client_agreed_email));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [doneText, setDoneText] = useState('');
  const loaded = useRef(false);
  const userId = care?.userId ?? '';

  useEffect(() => { // an unsent local draft wins over the server copy
    if (!userId || loaded.current) return; loaded.current = true;
    void readDraft(userId, clientId, formId, visitId).then((d) => { if (d) setData((cur) => ({ ...cur, ...d })); });
  }, [userId, clientId, formId, visitId]);
  useEffect(() => { if (userId && loaded.current && stage === 'edit') void writeDraft(userId, clientId, formId, visitId, data); }, [data, userId, clientId, formId, visitId, stage]);

  if (!care || !def) return null;
  const set = (k: string, v: unknown) => setData((d) => ({ ...d, [k]: v }));
  const baby = care.typeOf(clientId) === 'Baby';
  const payloadData = (): Data => {
    const out: Data = formId === '08' ? { administrations: data.administrations ?? [] } : { ...data };
    if (formId === '08' && data._correction_note) out._correction_note = data._correction_note;
    if (care.autoEmail && clientJoins) out.client_agreed_email = agreed;
    return out;
  };
  const adminProblem = formId === '08' ? ((data.administrations as Admin[] | undefined) ?? []).map(administrationProblem).find(Boolean) ?? null : null;

  async function send(extra: { client_signature?: ClientSigPayload; nurse_signature?: NurseSigPayload }) {
    setBusy(true); setError('');
    try {
      const r = await care!.submit({ op_id: newOpId(), form_id: formId, client_id: clientId, visit_id: visitId, data: payloadData(), ...extra });
      if (extra.nurse_signature) { await clearDraft(userId, clientId, formId, visitId); setDoneText(r.sent ? 'Signed and saved.' : 'Signed. It is saved on this device and will send when you are online.'); setStage('done'); }
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save. Your entries are kept on this device.'); return false; } finally { setBusy(false); }
  }
  async function saveDraft() { if (await send({})) onClose(); }
  async function toSigning() {
    if (adminProblem) { setError(adminProblem); return; }
    if (clientJoins) setStage('client'); else setStage('nurse');
  }

  const title = formTitle(formId);
  return <Sheet labelledBy="cf-title" className="cf-sheet">
    <h2 id="cf-title">{title}</h2>
    <p className="cf-hint">{clientName}{def.who === 'staff' ? ' · prefilled from the client’s agreement; change anything that is wrong' : ''}</p>
    {stage === 'edit' && <>
      <p>{def.purpose}</p>
      {formId === '07' && <label className="cf-check"><input type="checkbox" checked={clientJoins} onChange={(e) => setClientJoins(e.target.checked)} />Client acknowledges this visit (optional)</label>}
      {formId === '08' ? <MedicationBody data={data} set={set} /> : def.items.map((item, i) => <Item key={i} item={item} data={data} set={set} />)}
      {formId !== '08' && 'temperature_c' in data && tempNeedsAction(data.temperature_c, '', false, baby) && <label className="cf-warn">Action taken for the abnormal temperature<textarea rows={2} value={s(data, 'temperature_action')} onChange={(e) => set('temperature_action', e.target.value)} /></label>}
      {doc?.status === 'signed' && <label>Correction note (a dated note and a new version are added)<textarea rows={2} value={s(data, '_correction_note')} onChange={(e) => set('_correction_note', e.target.value)} /></label>}
      {error && <Banner tone="warn">{error}</Banner>}
      <SheetActions>
        <PillButton tone="forest" size="full" disabled={busy} onClick={() => void toSigning()}>Continue to signing</PillButton>
        <PillButton tone="ghost" size="full" showArrow={false} disabled={busy} onClick={() => void saveDraft()}>Save draft</PillButton>
        <PillButton tone="ghost" size="full" showArrow={false} onClick={onClose}>Close</PillButton>
      </SheetActions>
    </>}
    {stage === 'client' && <>
      <SigningBlock mode="client" formId={formId} defaultName={clientName} autoEmail={care.autoEmail} clientAgreed={agreed} onClientAgreed={setAgreed} busy={busy}
        onSubmit={async (sig) => { if (await send({ client_signature: sig })) setStage('nurse'); }} />
      {error && <Banner tone="warn">{error}</Banner>}
      <SheetActions><PillButton tone="ghost" size="full" showArrow={false} onClick={() => setStage('edit')}>Back</PillButton></SheetActions>
    </>}
    {stage === 'nurse' && <>
      <SigningBlock mode="nurse" formId={formId} online={care.online} problem={unmcProblem(care.registration)} busy={busy} onSubmit={async (sig) => { await send({ nurse_signature: sig }); }} />
      {error && <Banner tone="warn">{error}</Banner>}
      <SheetActions>
        {clientOptional(formId) || !clientTakesPart(formId) ? <PillButton tone="ghost" size="full" showArrow={false} onClick={() => setStage('edit')}>Back</PillButton> : <PillButton tone="ghost" size="full" showArrow={false} onClick={onClose}>Countersign later</PillButton>}
      </SheetActions>
    </>}
    {stage === 'done' && <><Banner tone="ok">{doneText}</Banner><SheetActions><PillButton tone="forest" size="full" showArrow={false} onClick={onClose}>Done</PillButton></SheetActions></>}
  </Sheet>;
}

function Item({ item, data, set }: { item: FormItem; data: Data; set: (k: string, v: unknown) => void }) {
  switch (item.t) {
    case 'H': return <h3 className="cf-h">{item.text}</h3>;
    case 'N': return <p className="cf-note">{item.text}</p>;
    case 'T': return <p className="cf-text">{item.text}</p>;
    case 'W': return <label>{item.label}<textarea rows={3} value={s(data, item.key)} onChange={(e) => set(item.key, e.target.value)} /></label>;
    case 'F': return <div className="cf-row">{item.fields.map((f) => <label key={f.key}>{f.label}<input value={s(data, f.key)} inputMode={f.key.startsWith('temperature') ? 'decimal' : undefined} onChange={(e) => set(f.key, e.target.value)} /></label>)}</div>;
    case 'C': return <fieldset className="cf-choice"><legend>{item.label}</legend>{item.options.map((o) => <label key={o} className="cf-check"><input type="radio" name={item.key} checked={s(data, item.key) === o} onChange={() => set(item.key, o)} />{o}</label>)}</fieldset>;
    case 'TBL': return <div className="cf-table" role="group" aria-label={item.cols[0]}>{Array.from({ length: item.rows }, (_, r) => <div className="cf-row" key={r}>{item.cols.map((c, ci) => { const k = `t_r${r + 1}c${ci}`; return <label key={k}>{c}<input value={s(data, k)} onChange={(e) => set(k, e.target.value)} /></label>; })}</div>)}</div>;
    default: return null;
  }
}

/** Form 08: supervisor orders are read-only; the nurse records Given / Not given and a reason (rule 9). */
function MedicationBody({ data, set }: { data: Data; set: (k: string, v: unknown) => void }) {
  const orders = (data.orders ?? {}) as Record<string, string>;
  const rows = ((data.administrations as Admin[] | undefined) ?? []);
  const upd = (i: number, patch: Admin) => set('administrations', rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const entries = Object.entries(orders).filter(([, v]) => v);
  return <>
    <h3 className="cf-h">Verified medicine order (set by your supervisor)</h3>
    {entries.length === 0 ? <Banner tone="info">No verified order has been set yet. Ask your supervisor. You cannot create orders.</Banner>
      : <dl className="cf-order">{entries.map(([k, v]) => <div key={k}><dt>{k.replaceAll('_', ' ')}</dt><dd>{v}</dd></div>)}</dl>}
    <h3 className="cf-h">Doses</h3>
    {rows.map((r, i) => <div className="cf-admin" key={i}>
      <div className="cf-row"><label>Due<input value={r.due ?? ''} onChange={(e) => upd(i, { due: e.target.value })} /></label><label>Actual time<input value={r.at ?? ''} onChange={(e) => upd(i, { at: e.target.value })} /></label></div>
      <label>Dose and route given<input value={r.dose_route ?? ''} onChange={(e) => upd(i, { dose_route: e.target.value })} /></label>
      <div className="cf-tabs" role="group" aria-label="Given or not given"><button type="button" aria-pressed={r.given === true} onClick={() => upd(i, { given: true, code: undefined })}>Given</button><button type="button" aria-pressed={r.given === false} onClick={() => upd(i, { given: false })}>Not given</button></div>
      {r.given === false && <><label>Code<select value={r.code ?? 'R'} onChange={(e) => upd(i, { code: e.target.value })}><option value="R">R refused</option><option value="H">H withheld on instruction</option><option value="U">U unavailable</option><option value="A">A absent</option></select></label><label>Reason (required)<textarea rows={2} value={r.reason ?? ''} onChange={(e) => upd(i, { reason: e.target.value })} /></label></>}
      <label>Initials<input value={r.initials ?? ''} maxLength={6} onChange={(e) => upd(i, { initials: e.target.value })} /></label>
    </div>)}
    {rows.length < 10 && <PillButton tone="ghost" showArrow={false} onClick={() => set('administrations', [...rows, { at: new Date().toTimeString().slice(0, 5) }])}>Add a dose</PillButton>}
  </>;
}
