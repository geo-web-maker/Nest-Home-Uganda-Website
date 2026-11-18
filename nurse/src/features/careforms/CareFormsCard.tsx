import { useState } from 'react';
import { Banner } from '../../ui/Banner';
import { Card } from '../../ui/Card';
import { Chip } from '../../ui/Chip';
import { kampalaDateKey } from '../../lib/time';
import type { CachedVisit } from '../../offline/db';
import { FormLauncher, type Launch } from './FormLauncher';
import { FORM_GROUPS, clientOptional, clientTakesPart, formTitle, formsForGroup, scopeVisitId, statusChip, statusLabel, weekStartOf } from './rules';
import { useCareFormsContext } from './useCareForms';

/** "Care forms" card on the visit: groups Before care / During the visit / Daily tracker / Events and end. */
export function CareFormsCard({ visit }: { visit: Pick<CachedVisit, 'id' | 'client_id' | 'client_display_name' | 'status'> }) {
  const care = useCareFormsContext();
  const [launch, setLaunch] = useState<Launch | null>(null);
  if (!care || !visit.client_id) return null;
  const clientId = visit.client_id;
  const type = care.typeOf(clientId);
  const week = weekStartOf(kampalaDateKey(new Date()));
  const find = (formId: string) => {
    const vid = scopeVisitId(formId, visit.id);
    const rows = care.docsFor(clientId).filter((d) => d.form_id === formId && (d.visit_id ?? null) === vid && (formId !== 'tracker' || d.data.week_start === week));
    return rows.find((d) => d.status !== 'signed') ?? rows[0];
  };
  return <Card className="cf-card" aria-label="Care forms">
    <div className="mk-section-title"><p className="eyebrow">Care forms</p><Chip kind="sc">{type}</Chip></div>
    {visit.status === 'scheduled' && care.arriveBlocked(clientId) && <Banner tone="warn">Form 03 (consent to care) must be signed before you can arrive. In an emergency, record it on Form 10.</Banner>}
    {FORM_GROUPS.map((g) => { const ids = formsForGroup(g.forms, type); if (!ids.length) return null; return <section key={g.id} className="cf-group"><h3>{g.title}</h3>
      <ul>{ids.map((id) => { const d = find(id); return <li key={id}><button type="button" className="cf-item" onClick={() => setLaunch({ formId: id, clientId, clientName: visit.client_display_name, visitId: scopeVisitId(id, visit.id), doc: d, weekStart: week })}>
        <span className="cf-item__title">{formTitle(id)}<small>{clientTakesPart(id) ? 'Client takes part' : clientOptional(id) ? 'Nurse · client may acknowledge' : 'Nurse only'}</small></span>
        <Chip kind={statusChip(d?.status)}>{statusLabel(d?.status, d?.queued)}</Chip></button></li>; })}</ul></section>; })}
    <FormLauncher launch={launch} onClose={() => setLaunch(null)} />
  </Card>;
}
