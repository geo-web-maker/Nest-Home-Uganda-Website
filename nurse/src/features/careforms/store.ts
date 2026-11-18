import { enqueueOperation, nurseDb, type OutboxOperation } from '../../offline/db';
import type { DocStatus, PatientType } from './rules';

export type DocRow = { id: string; form_id: string; client_id: string; visit_id?: string | null; status: DocStatus; version: number; signed_at?: string | null; updated_at?: string; data: Record<string, unknown>; queued?: boolean };
export type Bootstrap = { auto_email_copy: boolean; gates_enabled: boolean; privacy_email?: string; clients: { id: string; display_name: string; patient_type: PatientType }[]; documents: DocRow[] };
export type ClientSigPayload = { role: string; method: string; name: string; detail: Record<string, unknown>; evidence: Record<string, unknown>; image?: string | null; esign_consent: boolean; signer_email?: string | null };
export type NurseSigPayload = { method: string; evidence: Record<string, unknown>; image?: string | null };
export type SubmitPayload = { op_id: string; form_id: string; client_id: string; visit_id?: string | null; data: Record<string, unknown>; client_signature?: ClientSigPayload; nurse_signature?: NurseSigPayload };

const bootKey = (u: string) => `careforms:bootstrap:${u}`;
const regKey = (u: string) => `careforms:registration:${u}`;
const draftKey = (u: string, c: string, f: string, v: string | null | undefined, w?: string) => `careforms:draft:${u}:${c}:${f}:${v ?? ''}:${w ?? ''}`;

async function readJson<T>(key: string): Promise<T | null> {
  try { const row = await nurseDb.meta.get(key); return row?.value ? JSON.parse(row.value) as T : null; } catch { return null; }
}
const writeJson = (key: string, value: unknown) => nurseDb.meta.put({ key, value: JSON.stringify(value) });

export const readBootstrap = (u: string) => readJson<Bootstrap>(bootKey(u));
export const writeBootstrap = (u: string, b: Bootstrap) => writeJson(bootKey(u), b);
export const readRegistrationCache = <T,>(u: string) => readJson<T>(regKey(u));
export const writeRegistrationCache = (u: string, r: unknown) => writeJson(regKey(u), r);
export const readDraft = (u: string, c: string, f: string, v?: string | null, w?: string) => readJson<Record<string, unknown>>(draftKey(u, c, f, v, w));
export const writeDraft = (u: string, c: string, f: string, v: string | null | undefined, data: Record<string, unknown>, w?: string) => writeJson(draftKey(u, c, f, v, w), data);
export const clearDraft = (u: string, c: string, f: string, v?: string | null, w?: string) => nurseDb.meta.delete(draftKey(u, c, f, v, w));

export const newOpId = () => globalThis.crypto?.randomUUID?.() ?? `op-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const sameDoc = (d: DocRow, p: SubmitPayload) => d.client_id === p.client_id && d.form_id === p.form_id && (d.visit_id ?? null) === (p.visit_id ?? null)
  && (p.form_id !== 'tracker' || d.data.week_start === p.data.week_start) && d.status !== 'signed';

/** Optimistic local view of a submit: what the nurse sees while the op waits in the outbox. */
export function applyLocal(b: Bootstrap, p: SubmitPayload, now = new Date().toISOString()): Bootstrap {
  const status: DocStatus = p.nurse_signature ? 'signed' : p.client_signature ? 'pending' : 'draft';
  const docs = [...b.documents];
  const i = docs.findIndex((d) => sameDoc(d, p));
  const row: DocRow = { id: i >= 0 ? docs[i].id : `local-${p.op_id}`, form_id: p.form_id, client_id: p.client_id, visit_id: p.visit_id ?? null, status, version: i >= 0 ? docs[i].version : 1, signed_at: status === 'signed' ? now : null, updated_at: now, data: p.form_id === '08' && i >= 0 ? { ...docs[i].data, ...p.data } : p.data, queued: true };
  if (i >= 0) docs[i] = row; else docs.push(row);
  return { ...b, documents: docs };
}
export function overlayPending(b: Bootstrap, ops: Pick<OutboxOperation, 'payload' | 'createdAt'>[]): Bootstrap {
  return [...ops].sort((a, c) => a.createdAt.localeCompare(c.createdAt)).reduce((acc, op) => applyLocal(acc, op.payload as unknown as SubmitPayload, op.createdAt), b);
}

export async function queueSubmit(userId: string, p: SubmitPayload) {
  await enqueueOperation({ id: p.op_id, kind: 'care_form', visitId: p.visit_id ?? undefined, ownerUserId: userId, payload: p as unknown as Record<string, unknown>, createdAt: new Date().toISOString() });
}
export async function pendingCareOps(userId: string) {
  return (await nurseDb.outbox.where('kind').equals('care_form').toArray()).filter((o) => o.ownerUserId === userId);
}
