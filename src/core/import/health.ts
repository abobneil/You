// Health records from patient portals (MyChart and most others): "Download my record" gives a
// C-CDA document (XML) or FHIR resources (JSON / NDJSON). We take allergies, medications,
// conditions and immunizations. Best effort: portals vary, so anything unreadable is skipped.
import { fmtDate } from '../dates';
import { looseDate, rowId } from './parse';
import type { ImportResult, ImportRow, Proposal } from './types';

export interface HealthItem {
  kind: 'Allergy' | 'Medication' | 'Condition' | 'Immunization';
  name: string;
  id?: string;
  at?: string;
  since: string;
  until?: string;
  active: boolean;
  fields: Record<string, string>;
}

const GROUP: Record<HealthItem['kind'], string> = { Allergy: 'Allergies', Medication: 'Medications', Condition: 'Conditions', Immunization: 'Immunizations' };

// ---------- FHIR ----------
const text = (cc: any): string => cc?.text || cc?.coding?.find((c: any) => c.display)?.display || '';
const fhirDate = (...v: (string | undefined)[]) => looseDate((v.find(Boolean) ?? '').slice(0, 10));

function fromFhir(r: any): HealthItem | null {
  if ((r?.verificationStatus?.coding ?? []).some((c: any) => /entered-in-error|refuted/.test(c.code ?? '')) || /not-done|not-taken|entered-in-error/.test(r?.status ?? '')) return null;
  switch (r?.resourceType) {
    case 'AllergyIntolerance': {
      const status = text(r.clinicalStatus) || r.clinicalStatus?.coding?.[0]?.code || '';
      const reaction = r.reaction?.[0];
      return { kind: 'Allergy', name: text(r.code), since: fhirDate(r.onsetDateTime, r.recordedDate), active: !/inactive|resolved/i.test(status),
        fields: { status: status || 'Unknown', reaction: text(reaction?.manifestation?.[0]), severity: cap(reaction?.severity || (r.criticality === 'high' ? 'Severe' : '')) } };
    }
    case 'MedicationStatement':
    case 'MedicationRequest': {
      const dosage = r.dosage?.[0] ?? r.dosageInstruction?.[0];
      const status = r.status ?? '';
      return { kind: 'Medication', name: text(r.medicationCodeableConcept) || r.medicationReference?.display || '',
        since: fhirDate(r.effectivePeriod?.start, r.effectiveDateTime, r.authoredOn), until: fhirDate(r.effectivePeriod?.end),
        active: !/completed|stopped|cancelled|entered-in-error/i.test(status),
        fields: { status: status || 'Unknown', dose: [dosage?.doseAndRate?.[0]?.doseQuantity?.value, dosage?.doseAndRate?.[0]?.doseQuantity?.unit, dosage?.text].filter(v => v !== undefined && v !== '').join(' '), for: text(r.reasonCode?.[0]), prescriber: r.requester?.display ?? '' } };
    }
    case 'Condition': {
      const status = r.clinicalStatus?.coding?.[0]?.code ?? text(r.clinicalStatus);
      return { kind: 'Condition', name: text(r.code), since: fhirDate(r.onsetDateTime, r.onsetPeriod?.start, r.recordedDate),
        until: fhirDate(r.abatementDateTime), active: !/resolved|inactive|remission/i.test(status), fields: { status: status || 'Unknown' } };
    }
    case 'Immunization':
      return { kind: 'Immunization', name: text(r.vaccineCode), since: fhirDate(r.occurrenceDateTime, r.date), active: true,
        fields: { dose: r.protocolApplied?.[0]?.doseNumberPositiveInt ? `Dose ${r.protocolApplied[0].doseNumberPositiveInt}` : '', givenAt: r.location?.display ?? r.performer?.[0]?.actor?.display ?? '' } };
  }
  return null;
}

function fhirResources(raw: string): any[] {
  const t = raw.trim();
  try {
    const j = JSON.parse(t);
    if (Array.isArray(j)) return j;
    if (j.resourceType === 'Bundle') return (j.entry ?? []).map((e: any) => e.resource);
    return [j];
  } catch {
    // NDJSON: one resource per line
    return t.split('\n').map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  }
}

// ---------- C-CDA ----------
const SECTIONS: Record<string, HealthItem['kind']> = { '48765-2': 'Allergy', '10160-0': 'Medication', '11450-4': 'Condition', '11369-6': 'Immunization' };

const local = (el: Element, name: string) => Array.from(el.getElementsByTagNameNS('*', name));
/** Element children (works in browsers and in plain XML DOMs that lack `.children`). */
const kids = (el: Element) => Array.from(el.childNodes).filter((n): n is Element => n.nodeType === 1);
const findById = (doc: Document, id: string) =>
  Array.from(doc.getElementsByTagNameNS('*', '*')).find(e => e.getAttribute('ID') === id || e.getAttribute('id') === id);
const first = (el: Element | null | undefined, name: string) => (el ? local(el, name)[0] : undefined);
const hl7Date = (v?: string | null) => looseDate((v ?? '').slice(0, 8));

/** The readable name for a coded element: its displayName, or the narrative text it points to. */
function named(doc: Document, el?: Element): string {
  if (!el) return '';
  const d = el.getAttribute('displayName');
  if (d) return d;
  const ref = first(el, 'reference')?.getAttribute('value') ?? first(first(el, 'originalText'), 'reference')?.getAttribute('value');
  if (ref?.startsWith('#')) return findById(doc, ref.slice(1))?.textContent?.trim() ?? '';
  return first(el, 'originalText')?.textContent?.trim() ?? '';
}

function fromCcda(xml: string, notes: string[] = []): HealthItem[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) return [];
  const items: HealthItem[] = [];
  for (const section of local(doc.documentElement, 'section')) {
    const code = kids(section).find(c => c.localName === 'code')?.getAttribute('code') ?? '';
    const kind = SECTIONS[code];
    if (!kind) { notes.push('1 unsupported health section skipped.'); continue; }
    for (const entry of kids(section).filter(c => c.localName === 'entry')) {
      if (local(entry, 'observation').some(o => o.getAttribute('negationInd') === 'true') || local(entry, 'substanceAdministration').some(o => o.getAttribute('negationInd') === 'true')) { notes.push('1 negated health entry skipped.'); continue; }
      const time = first(entry, 'effectiveTime');
      const low = hl7Date(first(time, 'low')?.getAttribute('value') ?? time?.getAttribute('value'));
      const high = hl7Date(first(time, 'high')?.getAttribute('value'));
      let name = '';
      const fields: Record<string, string> = {};
      if (kind === 'Allergy') {
        const participant = first(entry, 'playingEntity') ?? first(entry, 'participant');
        name = named(doc, first(participant, 'code')) || first(participant, 'name')?.textContent?.trim() || '';
        const reactionObs = local(entry, 'observation').find(o => first(o, 'templateId')?.getAttribute('root') === '2.16.840.1.113883.10.20.22.4.9');
        fields.reaction = named(doc, first(reactionObs, 'value'));
        const sev = local(entry, 'observation').find(o => first(o, 'templateId')?.getAttribute('root') === '2.16.840.1.113883.10.20.22.4.8');
        fields.severity = cap(named(doc, first(sev, 'value')).replace(/ to .*/i, ''));
      } else if (kind === 'Medication' || kind === 'Immunization') {
        const material = first(entry, 'manufacturedMaterial');
        name = named(doc, first(material, 'code')) || first(material, 'name')?.textContent?.trim() || '';
        const dose = first(entry, 'doseQuantity');
        if (kind === 'Medication' && dose?.getAttribute('value')) fields.dose = `${dose.getAttribute('value')} ${dose.getAttribute('unit') ?? ''}`.trim();
      } else {
        const obs = first(entry, 'observation');
        name = named(doc, first(obs, 'value')) || named(doc, first(obs, 'code'));
      }
      const status = local(entry, 'statusCode')[0]?.getAttribute('code') ?? '';
      if (name) items.push({ kind, name, since: low, until: high, active: kind === 'Immunization' || (!high && !/completed|resolved|inactive/i.test(status)), fields });
    }
  }
  return items;
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : '');

export function parseHealth(raw: string): HealthItem[] & { notes?: string[] } {
  const notes: string[] = [];
  const t = raw.trim();
  const items = t.startsWith('<') ? fromCcda(t, notes) : fhirResources(t).map(r => { const i = fromFhir(r); if (i) i.at = r.meta?.lastUpdated || r.effectivePeriod?.end || r.effectiveDateTime || r.recordedDate || r.authoredOn || i.until || i.since; if (i && r.id) i.id = r.resourceType + ':' + r.id; if (!i) notes.push(`1 health resource skipped: ${r?.status || r?.verificationStatus?.coding?.[0]?.code || r?.resourceType || 'unsupported'}.`); return i; }).filter((x): x is HealthItem => !!x && !!x.name);
  // Portals often list the same medication many times (one per refill); keep the earliest.
  const seen = new Map<string, HealthItem>();
  for (const i of items) {
    if (i.kind === 'Allergy' && /no known|no allergy|unknown|not known/i.test(i.name)) continue;
    const k = i.id || i.kind + ':' + i.name.toLowerCase() + ':' + i.since;
    const prev = seen.get(k);
    if (!prev || (i.since && (!prev.since || i.since < prev.since))) seen.set(k, { ...i, active: i.active || !!prev?.active });
  }
  return Object.assign([...seen.values()], { notes });
}

export function healthRows(items: HealthItem[] & { notes?: string[] }, at = ''): ImportResult {
  const keep = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v));
  const rows: ImportRow[] = items.map(i => {
    const p: Proposal = { area: 'health', kind: i.kind, value: i.name, since: i.since, sync: { source: 'health', id: i.id || [i.kind, i.name, i.since].join(':'), at: at || i.at || i.until || i.since }, fields: keep(i.fields),
      past: !i.active && i.kind !== 'Immunization', until: !i.active ? i.until ?? '' : undefined };
    return { id: rowId('hx'), group: GROUP[i.kind], label: i.name,
      sub: [i.since && fmtDate(i.since), !i.active && i.kind !== 'Immunization' ? 'ended' : ''].filter(Boolean).join(' · '),
      build: () => [p] };
  });
  return { rows, notes: [...(items.notes ?? []), ...(rows.length ? ['Medical records can list old or duplicate items. Untick anything that isn’t right.']
    : ['No allergies, medications, conditions or immunizations were found in that file.'])] };
}
