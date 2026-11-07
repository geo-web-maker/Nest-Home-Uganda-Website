/**
 * Presentation metadata for every agreement field. Ownership and validation stay on the
 * server (FIELD_OWNERS in backend rules); this only decides how a field is shown, grouped
 * and explained. Values are always stored as plain strings, so older saved text still works.
 */
export type FieldKind = 'text' | 'long' | 'money' | 'int' | 'date' | 'select' | 'phone' | 'email' | 'initials';

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
};

export type FieldSection = { id: string; title: string; hint?: string; paths: string[] };
export type ScheduleTab = 'parties' | 'schedule_a' | 'schedule_b' | 'schedule_c';

const text = (label: string, help?: string, placeholder?: string): FieldMeta => ({ label, kind: 'text', help, placeholder });
const long = (label: string, help?: string, placeholder?: string): FieldMeta => ({ label, kind: 'long', help, placeholder });
const date = (label: string, help?: string): FieldMeta => ({ label, kind: 'date', help });

export const FIELD_META: Record<string, FieldMeta> = {
  'client.name': { label: 'Client full name', kind: 'text', help: 'The person who signs and is responsible for the agreement.', placeholder: 'As on their national ID' },
  'client.title': { label: 'Title', kind: 'text', suggestions: ['Mr', 'Mrs', 'Ms', 'Miss', 'Dr', 'Prof', 'Rev'] },
  'client.address': long('Client address', 'Postal or physical address for notices.'),
  'client.phone': { label: 'Client phone', kind: 'phone', help: 'Uganda mobile, for example 0771 234 567.' },
  'client.email': { label: 'Client email', kind: 'email', help: 'The signed copy and notices are sent here.' },
  'client.relationship_to_patient': { label: 'Relationship to patient', kind: 'text', suggestions: ['Self', 'Spouse', 'Parent', 'Child', 'Sibling', 'Guardian', 'Employer', 'Other relative'] },
  'patient.full_name': { label: 'Patient full name', kind: 'text', placeholder: 'The person receiving care' },
  'patient.dob_or_age': text('Date of birth or age', 'For example 14/03/1951 or 75 years.'),
  'patient.language': { label: 'Preferred language', kind: 'text', suggestions: ['English', 'Luganda', 'Runyankole', 'Luo', 'Swahili'] },

  'schedule_a.assessment_date': date('Assessment date', 'The day the nurse assessed the patient.'),
  'schedule_a.patient_dob_or_age': text('Patient date of birth or age'),
  'schedule_a.language': { label: 'Language', kind: 'text', suggestions: ['English', 'Luganda', 'Runyankole', 'Luo', 'Swahili'] },
  'schedule_a.service_address': long('Service address', 'Where care will take place.'),
  'schedule_a.directions': long('Directions', 'Landmarks and how a nurse finds the home.'),
  'schedule_a.emergency_contact': long('Emergency contact', 'Name, relationship and phone number.'),
  'schedule_a.treating_practitioner': text('Treating doctor or practitioner', 'Name and facility, if any.'),
  'schedule_a.preferred_receiving_facility': text('Preferred hospital or facility', 'Where to go in an emergency.'),
  'schedule_a.care_start_date': date('Care start date'),
  'schedule_a.care_end_review_date': date('Care end or review date', 'No automatic renewal: set the date care ends or is reviewed.'),
  'schedule_a.visit_dates_frequency': long('Visit dates and frequency', 'For example: daily, Mon–Fri, 2 visits per day.'),
  'schedule_a.shift_start_end_times': text('Shift or visit times', 'For example 08:00–16:00.'),
  'schedule_a.coverage_arrangement': text('Coverage arrangement', 'Day, night, 24-hour or visit-based.'),
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
  'schedule_b.price_basis': { label: 'Price basis', kind: 'select', options: ['Per visit', 'Per shift', 'Per day', 'Per week', 'Fixed package total'] },
  'schedule_b.tax_treatment': { label: 'Taxes', kind: 'select', options: ['Fees include applicable taxes', 'Fees exclude taxes', 'No tax applies'], help: 'Clause 8.6 requires this to be stated.' },
  'schedule_b.assessment_fee': { label: 'Assessment fee', kind: 'money', help: 'Non-refundable once paid. Use N/A if there is none.' },
  'schedule_b.rates': long('Rates', 'Rate for each service, for example 80,000 per day visit.'),
  'schedule_b.fees': long('Fees breakdown', 'Itemise the service fees.'),
  'schedule_b.nursing_visit_shift': text('Nursing visit or shift charge', 'Amount and basis, or N/A.'),
  'schedule_b.number_visits_shifts': { label: 'Number of visits or shifts', kind: 'int', help: 'Whole number.' },
  'schedule_b.transport': text('Transport', 'Amount and basis, or N/A.'),
  'schedule_b.dressings_consumables': text('Dressings and consumables', 'Amount and basis, or N/A.'),
  'schedule_b.equipment_hire_deposit': text('Equipment hire and deposit', 'Amount and basis, or N/A.'),
  'schedule_b.overtime_extra_visit': text('Overtime and extra visits', 'Rate that applies, or N/A.'),
  'schedule_b.late_cancellation_charge': text('Late cancellation charge', 'Only if agreed and lawful, or N/A.'),
  'schedule_b.other_costs_exclusions': long('Other costs and exclusions', 'Anything not covered by the fees above.'),
  'schedule_b.start_date': date('Billing start date'),
  'schedule_b.end_date': date('Billing end date'),
  'schedule_b.advance_due_date': date('Advance payment due date', '50% of service fees, before services begin.'),
  'schedule_b.balance_due_dates': long('Balance due dates', 'One or more dates for the remaining 50%.'),
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

  'schedule_c.decision_maker': {
    label: 'Who makes care decisions', kind: 'select', required: true, na: false,
    options: ['The patient personally', 'Parent or legal guardian', 'Legally authorised representative', 'Next of kin with lawful authority'],
    help: 'If it is not the patient, the representative details below become required.',
  },
  'schedule_c.representative_name': text('Representative name', 'Required when the patient is not deciding personally.'),
  'schedule_c.representative_relationship': text('Representative relationship'),
  'schedule_c.authority_basis': long('Basis of authority', 'For example court order, power of attorney or guardianship.'),
  'schedule_c.care_consent': { label: 'Consent to care', kind: 'select', na: false, options: ['Consent given', 'Consent given with conditions'], help: 'Explain any conditions under Permissions.' },
  'schedule_c.initials': { label: 'Initials', kind: 'initials', na: false },
  'schedule_c.permissions': long('Permissions', 'What care and treatment is permitted.'),
  'schedule_c.information_permitted': long('Information that may be shared', 'And with whom.'),
  'schedule_c.authorized_people_scope': long('Other people who may receive information', 'Names and what they may be told.'),
  'schedule_c.communication_channel': { label: 'Preferred contact channel', kind: 'select', na: false, options: ['Phone call', 'SMS', 'WhatsApp', 'Email', 'Other (give details)'] },
  'schedule_c.other_channel_details': text('Other channel details', 'Only if you chose Other.'),
  'schedule_c.verified_contact': { label: 'Verified contact', kind: 'phone', na: false, help: 'The number or address Bloomwell confirmed with the client.' },
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
      { id: 'a-location', title: 'Patient and location', paths: ['schedule_a.patient_dob_or_age', 'schedule_a.language', 'schedule_a.service_address', 'schedule_a.directions', 'schedule_a.emergency_contact', 'schedule_a.client_contact', 'schedule_a.treating_practitioner', 'schedule_a.preferred_receiving_facility'] },
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
      { id: 'b-fee', title: 'Fee summary', paths: ['schedule_b.currency', 'schedule_b.total_fee', 'schedule_b.price_basis', 'schedule_b.tax_treatment', 'schedule_b.assessment_fee', 'schedule_b.assessment_fee_basis', 'schedule_b.rates', 'schedule_b.fees'] },
      { id: 'b-charges', title: 'Other charges', paths: ['schedule_b.nursing_visit_shift', 'schedule_b.number_visits_shifts', 'schedule_b.transport', 'schedule_b.dressings_consumables', 'schedule_b.equipment_hire_deposit', 'schedule_b.overtime_extra_visit', 'schedule_b.late_cancellation_charge', 'schedule_b.other_costs_exclusions'] },
      { id: 'b-pay', title: 'Dates and how to pay', paths: ['schedule_b.start_date', 'schedule_b.end_date', 'schedule_b.advance_due_date', 'schedule_b.balance_due_dates', 'schedule_b.payment_details', 'schedule_b.payment_account_name', 'schedule_b.payment_provider_account_number', 'schedule_b.repayment_recipient_method'] },
      { id: 'b-ins', title: 'Insurance and variations', paths: ['schedule_b.bloomwell_insurance_details', 'schedule_b.agreed_variations', 'schedule_b.bloomwell_signatory'] },
      { id: 'b-payer', title: 'Third-party payer (only if an organisation or insurer pays)', hint: 'Leave blank if the client pays personally.', paths: ['schedule_b.organisation_payer_name', 'schedule_b.organisation_registration_number', 'schedule_b.organisation_payer_address', 'schedule_b.organisation_signatory_name', 'schedule_b.organisation_signatory_role', 'schedule_b.organisation_signatory_authority', 'schedule_b.insurance_external_payer_reference', 'schedule_b.organisation_payer_contact', 'schedule_b.client_billing_address_email'] },
    ],
  },
  schedule_c: {
    title: 'Schedule C – Consent and communication',
    intro: 'Completed by the client or their lawful representative during review. Staff only record who verified identity and obtained consent.',
    sections: [
      { id: 'c-who', title: 'Who decides', paths: ['schedule_c.decision_maker', 'schedule_c.representative_name', 'schedule_c.representative_relationship', 'schedule_c.authority_basis'] },
      { id: 'c-consent', title: 'Consent and information sharing', paths: ['schedule_c.care_consent', 'schedule_c.initials', 'schedule_c.permissions', 'schedule_c.information_permitted', 'schedule_c.authorized_people_scope'] },
      { id: 'c-comm', title: 'Communication', paths: ['schedule_c.communication_channel', 'schedule_c.other_channel_details', 'schedule_c.verified_contact'] },
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
