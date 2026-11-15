/** What the single Download pop-up offers for one invoice or receipt. */
export type DocKind = 'invoice' | 'receipt';
export type DocRef = { id: string; reference?: string | null; status: string };
export type DownloadOption =
  | { type: 'pdf'; labelKey: string; path: string; filename: string }
  | { type: 'whatsapp'; labelKey: string; path: string };

export function billingBase(kind: DocKind, id: string): string {
  return `/admin/billing/${kind === 'invoice' ? 'invoices' : 'payments'}/${id}`;
}

export function downloadOptions(kind: DocKind, doc: DocRef): DownloadOption[] {
  const base = billingBase(kind, doc.id);
  const ref = doc.reference || doc.id;
  const options: DownloadOption[] =
    doc.status === 'void'
      ? [
          {
            type: 'pdf',
            labelKey: 'billing.downloadVoid',
            path: `${base}/pdf?layout=ledger`,
            filename: `${ref}-VOID-ledger.pdf`,
          },
          {
            type: 'pdf',
            labelKey: kind === 'invoice' ? 'billing.originalLedger' : 'billing.originalReceipt',
            path: `${base}/pdf?layout=ledger&original=true`,
            filename: `${ref}-original-ledger.pdf`,
          },
          {
            type: 'pdf',
            labelKey: 'billing.originalSlip',
            path: `${base}/pdf?layout=slip&original=true`,
            filename: `${ref}-original-slip.pdf`,
          },
        ]
      : [
          {
            type: 'pdf',
            labelKey: 'billing.ledger',
            path: `${base}/pdf?layout=ledger`,
            filename: `${ref}-ledger.pdf`,
          },
          {
            type: 'pdf',
            labelKey: 'billing.slip',
            path: `${base}/pdf?layout=slip`,
            filename: `${ref}-slip.pdf`,
          },
        ];
  options.push({ type: 'whatsapp', labelKey: 'billing.copyWhatsApp', path: `${base}/whatsapp` });
  return options;
}

/** Issued and void invoices can be deleted; so can any receipt. Drafts use "Delete draft". */
export function canDeleteRecord(kind: DocKind, status: string): boolean {
  return kind === 'receipt' ? true : status === 'issued' || status === 'void';
}
