/* GENERATED from frontend/src. Edit there, then run: node scripts/sync-admin-shared.mjs */
/**
 * Presentation metadata for every agreement field. Ownership and validation stay on the
 * server (FIELD_OWNERS in backend rules); this only decides how a field is shown, grouped
 * and explained. Values are always stored as plain strings, so older saved text still works.
 */
export type FieldKind = 'text' | 'long' | 'money' | 'int' | 'date' | 'select' | 'phone' | 'email' | 'initials' | 'title';

export type FieldMeta = {
  label: string;
  kind: FieldKind;
  help?: string;
  placeholder?: string;
  options?: string[];
  suggestions?: string[];
  /** false = "Not applicable" is not accepted (the server needs a real value). */
  na?: boolean;
  required?: boolean;
  /** Show the field only when this returns true; `get` reads the current (possibly unsaved) value of any field. */
  showWhen?: (get: (path: string) => string) => boolean;
  /** Shown as the chosen option while the field is still blank (the server treats blank the same way). */
  defaultOption?: string;
};

export type FieldSection = { id: string; title: string; hint?: string; paths: string[] };
export type ScheduleTab = 'parties' | 'schedule_a' | 'schedule_b' | 'schedule_c';

const text = (label: string, help?: string, placeholder?: string): FieldMeta => ({ label, kind: 'text', help, placeholder });
const long = (label: string, help?: string, placeholder?: string): FieldMeta => ({ label, kind: 'long', help, placeholder });
const date = (label: string, help?: string): FieldMeta => ({ label, kind: 'date', help });

const select = (label: string, options: string[], extra: Partial<FieldMeta> = {}): FieldMeta => ({ label, kind: 'select', options, ...extra });

/** The patient is deciding personally (the stored answer, or an older free-text one, mentions "patient"). */
const decidesForSomeoneElse = (get: (path: string) => string): boolean => {
  const value = get('schedule_c.decision_maker').trim().toLowerCase();
  return value !== '' && !value.includes('patient');
};

/**
 * The tick-box and pick-list answers of the agreement. These mirror CHOICE_FIELDS in the backend rules,
 * which also checks them on save; the agreement document ticks exactly the chosen option.
 */
export const CHOICES = {
  title: ['Mr', 'Mrs', 'Miss', 'Dr'],
  coverage: ['Scheduled visits', 'Day shifts', 'Night shifts', 'Continuous care by roster'],
  decisionMaker: ['Patient with capacity', 'Parent/Guardian', 'Other lawful representative'],
  channel: ['Telephone', 'SMS', 'Email', 'WhatsApp', 'Other'],
  informationPermitted: ['Booking / billing only', 'Agreed care updates', 'Other'],
  paymentOption: ['Standard 50/50', 'Payment plan', 'Plan already provided'],
} as const;

/** 'standard', 'plan' or 'already'. Blank, N/A or an older draft means the standard 50/50 payment (mirrors the backend). */
export function paymentOptionKind(value: string | null | undefined): 'standard' | 'plan' | 'already' {
  const text = (value ?? '').trim().toLowerCase();
  return text.startsWith('plan already') ? 'already' : text === 'payment plan' ? 'plan' : 'standard';
}
const usesPlan = (get: (path: string) => string): boolean => paymentOptionKind(get('schedule_b.payment_option')) !== 'standard';

/** Fields still stored for older agreements but no longer asked for: their answer is entered once, elsewhere. */
export const HIDDEN_FIELDS: ReadonlySet<string> = new Set(['schedule_a.patient_dob_or_age', 'schedule_a.language']);
export const isHiddenField = (path: string): boolean => HIDDEN_FIELDS.has(path);

/**
 * Fields with no line in the printed agreement. If filled they print only on the extra pages after the schedules.
 * The backend test test_fields_without_a_line_in_the_printed_agreement keeps this list in step with the document.
 */
export const NOT_IN_FORM: ReadonlySet<string> = new Set([
  'schedule_b.fees', 'schedule_b.rates', 'schedule_b.payment_details', 'schedule_b.organisation_payer_contact',
  'schedule_c.permissions', 'schedule_c.care_consent', 'schedule_c.initials',
]);
export function notInFormNote(path: string, owner: string): string | null {
  if (!NOT_IN_FORM.has(path)) return null;
  if (owner === 'staff') return 'Not a line in the agreement. Mark N/A to skip it; if you fill it, it prints only on the extra “Additional agreed particulars” page.';
  if (owner === 'either') return 'Not a line in the agreement. Optional; if filled it prints only on the extra “Additional agreed particulars” page.';
  return 'No line for this on the agreement form. The client’s answer is kept on the extra “Consent and communication recorded online” page.';
}

export const FIELD_META: Record<string, FieldMeta> = {
  'client.name': { label: 'Client full name', kind: 'text', help: 'The person who signs and is responsible for the agreement.', placeholder: 'As on their national ID' },
  'client.title': { label: 'Title', kind: 'title', options: [...CHOICES.title], suggestions: ['Ms', 'Prof', 'Rev', 'Eng', 'Hon'], help: 'Pick one of the printed titles and the others are crossed out in the agreement. Pick Other to type a different title. Leave blank for none.' },
  'client.address': long('Client address', 'Postal or physical address for notices.'),
  'client.phone': { label: 'Client phone', kind: 'phone', help: 'Pick the country code, then the number. SMS only reaches Ugandan mobiles; others are reached by email.' },
  'client.email': { label: 'Client email', kind: 'email', help: 'The signed copy and notices are sent here.' },
  'client.relationship_to_patient': { label: 'Relationship to patient', kind: 'text', suggestions: ['Self', 'Spouse', 'Parent', 'Child', 'Sibling', 'Guardian', 'Employer', 'Other relative'] },
  'patient.full_name': { label: 'Patient full name', kind: 'text', placeholder: 'The person receiving care' },
  'patient.dob_or_age': text('Date of birth or age', 'For example 14/03/1951 or 75 years.'),
  'patient.language': { label: 'Preferred language', kind: 'text', suggestions: ['English', 'Luganda', 'Runyankole', 'Luo', 'Swahili'] },

  'schedule_a.assessment_date': date('Assessment date', 'The day the nurse assessed the patient.'),
  'schedule_a.patient_dob_or_age': text('Patient date of birth or age', 'Older agreements only. Enter this under Parties.'),
  'schedule_a.language': { label: 'Language', kind: 'text', help: 'Older agreements only. Enter this under Parties.' },
  'schedule_a.service_address': long('Service address', 'Where care will take place.'),
  'schedule_a.directions': long('Directions', 'Landmarks and how a nurse finds the home.'),
  'schedule_a.emergency_contact': long('Emergency contact', 'Name, relationship and phone number.'),
  'schedule_a.treating_practitioner': text('Treating doctor or practitioner', 'Name and facility, if any.'),
  'schedule_a.preferred_receiving_facility': text('Preferred hospital or facility', 'Where to go in an emergency.'),
  'schedule_a.care_start_date': date('Care start date'),
  'schedule_a.care_end_review_date': date('Care end or review date', 'No automatic renewal: set the date care ends or is reviewed.'),
  'schedule_a.visit_dates_frequency': long('Visit dates and frequency', 'For example: daily, Mon–Fri, 2 visits per day.'),
  'schedule_a.shift_start_end_times': text('Shift or visit times', 'For example 08:00–16:00.'),
  'schedule_a.coverage_arrangement': select('Coverage arrangement', [...CHOICES.coverage], { help: 'Tick only the booked arrangement. Describe relief cover below.' }),
  'schedule_a.relief_cover_family_attendance': long('Relief cover and family attendance', 'Who covers breaks and what family will do.'),
  'schedule_a.care_plan': long('Care plan', 'The agreed goals and approach.'),
  'schedule_a.tasks_included': long('Tasks included', 'Everything the nurse will do.'),
  'schedule_a.tasks_excluded': long('Tasks excluded', 'What is not part of this service.'),
  'schedule_a.medicines_clinical_orders': long('Medicines and clinical orders', 'Only as prescribed or ordered by a clinician.'),
  'schedule_a.equipment_supplies': long('Equipment and supplies', 'Who provides what.'),
  'schedule_a.safety_emergency_plan': long('Safety and emergency plan', 'What happens if the patient deteriorates.'),
  'schedule_a.client_contact': text('Client contact (if different from patient)', 'Name and phone of the client when the patient is someone else. Use N/A if the client is the patient.'),
  'schedule_a.allergies': long('Allergies recorded in clinical record', 'List known allergies, or write None known.'),
  'schedule_a.client_supplies': long('Client supplies', 'Items the client provides.'),
  'schedule_a.required_caregiver_presence': long('Required caregiver presence', 'Whether a responsible adult must be present during visits.'),
  'schedule_a.clinical_lead_contact': text('Clinical lead contact', 'Phone or email of the responsible nurse.'),
  'schedule_b.assessment_fee_basis': text('Assessment fee basis and inclusions', 'What the assessment fee covers. Use N/A if there is none.'),
  'schedule_b.bloomwell_signatory': text('Bloomwell authorized signatory (name and position)'),
  'schedule_c.witness_name_contact': text('Witness name and contact', 'Optional witness to the signing.'),
  'schedule_a.clinical_lead': text('Clinical lead', 'Name of the responsible nurse.'),
  'schedule_a.registration_number': text('Registration number', 'Council registration or licence number.'),
  'schedule_a.additional_care_sheets': long('Additional care sheets', 'Reference any attached care sheets.'),
  'schedule_a.clinical_approval': text('Clinical approval', 'Name and date of the approving clinician.'),
  'schedule_a.patient_rep_initials': { label: 'Patient or representative initials', kind: 'initials', help: 'Entered by the client when they review.' },
  'schedule_a.patient_rep_initials_date': date('Initials date', 'Entered by the client when they review.'),

  'schedule_b.currency': { label: 'Currency', kind: 'select', options: ['UGX', 'USD'], na: false, required: true, help: 'USD fees are payable in UGX at the Bank of Uganda mid-rate on the payment date (clause 8.6).' },
  'schedule_b.total_fee': { label: 'Total service fee', kind: 'money', na: false, required: true, help: 'Numbers only. Excludes the UGX 50,000 booking fee. 50% is due as advance.' },
  'schedule_b.price_basis': select('Rate unit', ['Per visit', 'Per shift', 'Per day', 'Per week', 'Per month', 'Fixed package total'], { help: 'Printed after the visit or shift rate, for example UGX 80,000 per day.' }),
  'schedule_b.price_type': select('Total is fixed or an estimate', ['Fixed', 'Estimate'], { help: 'Printed beside the total contract price.' }),
  'schedule_b.tax_treatment': select('Taxes', ['Inclusive', 'Exempt', 'Additional'], { help: 'Inclusive: rates already include taxes. Exempt: no tax applies. Additional: tax is added. Clause 8.6 requires this.' }),
  'schedule_b.transport_basis': select('Transport is', ['Included', 'Additional'], { help: 'Whether transport is inside the rates or charged on top.' }),
  'schedule_b.consumables_items': text('Dressings and consumables included', 'List the items covered, or N/A.'),
  'schedule_b.equipment_inventory_ref': text('Equipment inventory reference', 'Reference of the equipment inventory (clause 11.1), or N/A.'),
  'schedule_b.overtime_approval': select('Prior approval needed for overtime or extra visits', ['Yes', 'No']),
  'schedule_b.assessment_fee': { label: 'Assessment fee', kind: 'money', help: 'Non-refundable once paid. Use N/A if there is none.' },
  'schedule_b.rates': long('Rates', 'Rate for each service, for example 80,000 per day visit.'),
  'schedule_b.fees': long('Fees breakdown', 'Itemise the service fees.'),
  'schedule_b.nursing_visit_shift': text('Nursing visit or shift rate', 'Amount per visit or shift, numbers only. The rate unit below is printed after it.'),
  'schedule_b.number_visits_shifts': { label: 'Number of visits or shifts', kind: 'int', help: 'Whole number.' },
  'schedule_b.transport': text('Transport', 'Amount and basis, or N/A.'),
  'schedule_b.dressings_consumables': text('Dressings and consumables', 'Amount and basis, or N/A.'),
  'schedule_b.equipment_hire_deposit': text('Equipment hire and deposit', 'Amount and basis, or N/A.'),
  'schedule_b.overtime_extra_visit': text('Overtime and extra visits', 'Rate that applies, or N/A.'),
  'schedule_b.late_cancellation_charge': text('Late cancellation charge', 'Only if agreed and lawful, or N/A.'),
  'schedule_b.other_costs_exclusions': long('Other costs and exclusions', 'Anything not covered by the fees above.'),
  'schedule_b.start_date': date('Billing start date'),
  'schedule_b.end_date': date('Billing end date'),
  'schedule_b.payment_option': select('Payment option', [...CHOICES.paymentOption], { na: false, defaultOption: 'Standard 50/50', help: 'Standard 50/50: advance and balance as printed. Payment plan: the advance and balance rows point to the plan details below. Plan already provided: those rows are hidden because the client already has the plan in writing.' }),
  'schedule_b.payment_plan_details': { ...long('Payment plan details, or reference of the plan already given', 'For a plan: each instalment, amount and date. If the client already has the plan, give its reference and date, for example “Plan sent 05 Nov 2026”. Required before sending (N/A is accepted).'), showWhen: usesPlan },
  'schedule_b.advance_due_date': { ...date('Advance payment due date', '50% of service fees, before services begin.'), showWhen: (get) => !usesPlan(get) },
  'schedule_b.balance_due_dates': { ...long('Balance due dates', 'One or more dates for the remaining 50%.'), showWhen: (get) => !usesPlan(get) },
  'schedule_b.payment_details': long('Payment details', 'Verified Bloomwell payment instructions only.'),
  'schedule_b.payment_account_name': text('Payment account name'),
  'schedule_b.payment_provider_account_number': text('Bank or mobile money account number'),
  'schedule_b.repayment_recipient_method': text('Who receives payment and how', 'Only a verified collector with an official receipt.'),
  'schedule_b.bloomwell_insurance_details': long('Bloomwell insurance details'),
  'schedule_b.agreed_variations': long('Agreed variations', 'Written changes both parties have agreed.'),
  'schedule_b.organisation_payer_name': text('Organisation paying', 'Only if an employer, insurer or organisation pays.'),
  'schedule_b.organisation_registration_number': text('Organisation registration number'),
  'schedule_b.organisation_payer_address': long('Organisation address'),
  'schedule_b.organisation_signatory_name': text('Organisation signatory'),
  'schedule_b.organisation_signatory_role': text('Signatory role'),
  'schedule_b.organisation_signatory_authority': text('Signatory authority', 'Proof they can bind the organisation.'),
  'schedule_b.insurance_external_payer_reference': text('Insurance or payer reference'),
  'schedule_b.organisation_payer_contact': text('Payer contact', 'Name, phone and email.'),
  'schedule_b.client_billing_address_email': { label: 'Billing email', kind: 'email', help: 'Where invoices and receipts are sent.' },

  'schedule_c.decision_maker': select('Who makes care decisions', [...CHOICES.decisionMaker], {
    required: true, na: false,
    help: 'If it is not the patient, the representative details become required.',
  }),
  'schedule_c.representative_name': { ...text('Representative name', 'Required when the patient is not deciding personally.'), showWhen: decidesForSomeoneElse },
  'schedule_c.representative_relationship': { ...text('Representative relationship'), showWhen: decidesForSomeoneElse },
  'schedule_c.authority_basis': { ...long('Basis of authority', 'For example court order, power of attorney or guardianship.'), showWhen: decidesForSomeoneElse },
  'schedule_c.care_consent': select('Consent to care', ['Consent given', 'Consent given with conditions'], { na: false, help: 'Explain any conditions under Permissions.' }),
  'schedule_c.initials': { label: 'Initials', kind: 'initials', na: false },
  'schedule_c.permissions': long('Permissions and conditions', 'What care and treatment is permitted, and any conditions on your consent.'),
  'schedule_c.information_permitted': select('Information that may be sent on that channel', [...CHOICES.informationPermitted], { na: false }),
  'schedule_c.authorized_people_scope': long('Other people who may receive information', 'Names and what they may be told.'),
  'schedule_c.communication_channel': select('Preferred contact channel', [...CHOICES.channel], { na: false }),
  'schedule_c.other_channel_details': { ...text('Other channel details', 'Name the channel and how to reach you on it.'), showWhen: (get) => get('schedule_c.communication_channel').toLowerCase().startsWith('other') },
  'schedule_c.verified_contact': { label: 'Verified contact', kind: 'text', na: false, help: 'The number or address Bloomwell confirmed with the client.' },
  'schedule_c.bloomwell_verification_by': text('Verified by (Bloomwell)', 'Name of the staff member who verified identity.'),
  'schedule_c.consent_obtained_by': text('Consent obtained by (Bloomwell)'),
};

export const SCHEDULE_SECTIONS: Record<ScheduleTab, { title: string; intro: string; sections: FieldSection[] }> = {
  parties: {
    title: 'Parties',
    intro: 'Who signs the agreement and who receives care. The client can complete or correct these when they review.',
    sections: [
      { id: 'client', title: 'Client (signs and pays)', paths: ['client.name', 'client.title', 'client.relationship_to_patient', 'client.phone', 'client.email', 'client.address'] },
      { id: 'patient', title: 'Patient (receives care)', paths: ['patient.full_name', 'patient.dob_or_age', 'patient.language'] },
    ],
  },
  schedule_a: {
    title: 'Schedule A – Care plan',
    intro: 'Completed by the clinical team. Every clinical line must be filled in or marked N/A before the agreement can be sent.',
    sections: [
      { id: 'a-location', title: 'Patient and location', paths: ['schedule_a.service_address', 'schedule_a.directions', 'schedule_a.emergency_contact', 'schedule_a.client_contact', 'schedule_a.treating_practitioner', 'schedule_a.preferred_receiving_facility'] },
      { id: 'a-dates', title: 'Assessment and schedule', paths: ['schedule_a.assessment_date', 'schedule_a.care_start_date', 'schedule_a.care_end_review_date', 'schedule_a.visit_dates_frequency', 'schedule_a.shift_start_end_times', 'schedule_a.coverage_arrangement', 'schedule_a.relief_cover_family_attendance'] },
      { id: 'a-plan', title: 'Care plan', paths: ['schedule_a.care_plan', 'schedule_a.tasks_included', 'schedule_a.tasks_excluded', 'schedule_a.medicines_clinical_orders', 'schedule_a.allergies', 'schedule_a.equipment_supplies', 'schedule_a.client_supplies', 'schedule_a.safety_emergency_plan', 'schedule_a.required_caregiver_presence'] },
      { id: 'a-signoff', title: 'Clinical sign-off', paths: ['schedule_a.clinical_lead', 'schedule_a.clinical_lead_contact', 'schedule_a.registration_number', 'schedule_a.additional_care_sheets', 'schedule_a.clinical_approval'] },
      { id: 'a-ack', title: 'Client acknowledgement', hint: 'Completed by the client during review. Staff cannot edit these.', paths: ['schedule_a.patient_rep_initials', 'schedule_a.patient_rep_initials_date'] },
    ],
  },
  schedule_b: {
    title: 'Schedule B – Fees and payment',
    intro: 'Set currency and total first. The booking fee (UGX 50,000) is added automatically and is not part of the 50/50 split.',
    sections: [
      { id: 'b-fee', title: 'Fee summary', paths: ['schedule_b.currency', 'schedule_b.total_fee', 'schedule_b.price_type', 'schedule_b.price_basis', 'schedule_b.tax_treatment', 'schedule_b.assessment_fee', 'schedule_b.assessment_fee_basis', 'schedule_b.rates', 'schedule_b.fees'] },
      { id: 'b-charges', title: 'Other charges', paths: ['schedule_b.nursing_visit_shift', 'schedule_b.number_visits_shifts', 'schedule_b.transport', 'schedule_b.transport_basis', 'schedule_b.dressings_consumables', 'schedule_b.consumables_items', 'schedule_b.equipment_hire_deposit', 'schedule_b.equipment_inventory_ref', 'schedule_b.overtime_extra_visit', 'schedule_b.overtime_approval', 'schedule_b.late_cancellation_charge', 'schedule_b.other_costs_exclusions'] },
      { id: 'b-pay', title: 'Dates and how to pay', paths: ['schedule_b.payment_option', 'schedule_b.payment_plan_details', 'schedule_b.start_date', 'schedule_b.end_date', 'schedule_b.advance_due_date', 'schedule_b.balance_due_dates', 'schedule_b.payment_details', 'schedule_b.payment_account_name', 'schedule_b.payment_provider_account_number', 'schedule_b.repayment_recipient_method'] },
      { id: 'b-ins', title: 'Insurance and variations', paths: ['schedule_b.bloomwell_insurance_details', 'schedule_b.agreed_variations', 'schedule_b.bloomwell_signatory'] },
      { id: 'b-payer', title: 'Third-party payer (only if an organisation or insurer pays)', hint: 'Leave blank if the client pays personally.', paths: ['schedule_b.organisation_payer_name', 'schedule_b.organisation_registration_number', 'schedule_b.organisation_payer_address', 'schedule_b.organisation_signatory_name', 'schedule_b.organisation_signatory_role', 'schedule_b.organisation_signatory_authority', 'schedule_b.insurance_external_payer_reference', 'schedule_b.organisation_payer_contact', 'schedule_b.client_billing_address_email'] },
    ],
  },
  schedule_c: {
    title: 'Schedule C – Consent and communication',
    intro: 'Completed by the client or their lawful representative during review. Staff only record who verified identity and obtained consent.',
    sections: [
      { id: 'c-who', title: 'Who decides', paths: ['schedule_c.decision_maker', 'schedule_c.representative_name', 'schedule_c.representative_relationship', 'schedule_c.authority_basis'] },
      { id: 'c-consent', title: 'Consent to care', paths: ['schedule_c.care_consent', 'schedule_c.permissions', 'schedule_c.initials'] },
      { id: 'c-comm', title: 'How Bloomwell may contact you', paths: ['schedule_c.communication_channel', 'schedule_c.other_channel_details', 'schedule_c.verified_contact', 'schedule_c.information_permitted', 'schedule_c.authorized_people_scope'] },
      { id: 'c-verify', title: 'Bloomwell verification', paths: ['schedule_c.bloomwell_verification_by', 'schedule_c.consent_obtained_by', 'schedule_c.witness_name_contact'] },
    ],
  },
};

export function fieldMeta(path: string): FieldMeta {
  return FIELD_META[path] ?? { label: (path.split('.').at(-1) ?? path).replaceAll('_', ' '), kind: 'text' };
}
export function fieldLabel(path: string): string { return fieldMeta(path).label; }

export const OWNER_LABEL: Record<string, string> = {
  staff: 'Bloomwell staff', clinical: 'Clinical team', client: 'Client completes', either: 'Staff or client',
};

export function isBlank(value: unknown): boolean {
  return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
}

/** Money is stored as plain digits (one optional decimal point) so the server can calculate it. */
export function cleanMoney(raw: string): string {
  const stripped = raw.replace(/[^\d.]/g, '');
  const [first, ...rest] = stripped.split('.');
  const whole = first ?? '';
  return rest.length ? `${whole}.${rest.join('').slice(0, 2)}` : whole;
}
export function formatMoney(value: string): string {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return '';
  const [whole, frac] = value.split('.');
  return `${Number(whole).toLocaleString('en-US')}${frac ? `.${frac}` : ''}`;
}
export function isIsoDate(value: string): boolean { return /^\d{4}-\d{2}-\d{2}$/.test(value); }
