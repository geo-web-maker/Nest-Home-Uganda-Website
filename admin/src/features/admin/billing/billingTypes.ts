import { emptyService, type ServiceValue } from './serviceDate';

/** Draft-only invoice line, including the structured service-date editor value. */
export type EditorItem = {
  description: string;
  quantity: number;
  unit_price_ugx: number;
  service: ServiceValue;
};

export type AgreementOption = {
  reference: string;
  status: string;
  client_name: string;
  client_email: string;
  client_phone: string;
  client_address: string;
  patient_name: string;
  program: string;
  service_start: string;
  service_end: string;
  payment_instructions: string;
};

export function newInvoiceItem(): EditorItem {
  return {
    description: '',
    quantity: 1,
    unit_price_ugx: 0,
    service: emptyService(),
  };
}

export type InvoiceItem = {
  description: string;
  quantity: number;
  unit_price_ugx: number;
  amount_ugx?: number;
  service_date_text?: string;
};

export type Payment = {
  id: string;
  reference: string;
  invoice_id?: string;
  invoice_reference: string;
  status: string;
  amount_ugx: number;
  method: string;
  paid_on: string;
  balance_after_ugx: number;
  payer_reference?: string;
  invoice_total_ugx?: number;
  paid_before_ugx?: number;
};

export type Invoice = {
  id: string;
  reference?: string | null;
  status: string;
  is_test?: boolean;
  agreement_reference?: string | null;
  bill_to: { name: string; address: string; phone: string; email: string };
  care_recipient?: { name: string; program: string };
  items: InvoiceItem[];
  total_ugx: number;
  paid_ugx: number;
  balance_ugx: number;
  issue_date: string;
  due_date: string;
  payment_instructions: string;
  notes: string;
  payments?: Payment[];
  events?: Array<{ type: string; at: string; actor: string; detail?: Record<string, unknown> }>;
  sealed?: { content_hash?: string };
};
