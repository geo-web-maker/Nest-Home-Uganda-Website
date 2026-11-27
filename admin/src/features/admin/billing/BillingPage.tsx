import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../../../components/admin/PageHeader';
import { FilterTabs } from '../../../components/admin/FilterTabs';
import { FilterBar } from '../../../components/admin/FilterBar';
import { Pagination } from '../../../components/admin/Pagination';
import { Notice } from '@shared/components/dialogs/Notice';
import { DataTable } from '../../../components/admin/DataTable';
import { Modal } from '@shared/components/dialogs/Modal';
import { Button } from '@shared/components/ui/Button';
import { Checkbox } from '@shared/components/ui/Checkbox';
import { Field } from '@shared/components/ui/Field';
import { TotpGate } from '@shared/components/security/TotpGate';
import { apiClient } from '@shared/lib/api/client';
import { useAuth } from '../auth/useAuth';
import { hasScopes } from '../auth/hasScopes';
import {
  composeServiceDate,
  parseServiceDate,
  serviceFromAgreement,
  serviceProblem,
} from './serviceDate';
import {
  billingBase,
  canDeleteRecord,
  downloadOptions,
  type DocKind,
  type DocRef,
} from './downloadOptions';
import { BillingInvoiceEditor } from './BillingInvoiceEditor';
import { newInvoiceItem, type AgreementOption, type EditorItem, type Invoice, type Payment } from './billingTypes';
import { BillingInvoiceDetail } from './BillingInvoiceDetail';
import { useBillingAgreementOptions } from './useBillingAgreementOptions';
import styles from './BillingPage.module.css';

type PageResult<T> = { items: T[]; total: number };
const today = new Date().toISOString().slice(0, 10);
const fmt = (value: number) => `UGX ${value.toLocaleString('en-UG')}`;

export function BillingPage() {
  const { t } = useTranslation('admin');
  const location = useLocation();
  const { user } = useAuth();
  const receiptsView = location.pathname.endsWith('/receipts');
  const canWrite = hasScopes(user, ['billing:write']);
  const canVoid = hasScopes(user, ['billing:void']);
  const [rows, setRows] = useState<Invoice[]>([]);
  const [receiptRows, setReceiptRows] = useState<Payment[]>([]);
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [includeTest, setIncludeTest] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [billName, setBillName] = useState('');
  const [billAddress, setBillAddress] = useState('');
  const [billEmail, setBillEmail] = useState('');
  const [billPhone, setBillPhone] = useState('');
  const [careName, setCareName] = useState('');
  const [careProgram, setCareProgram] = useState('');
  const [agreementReference, setAgreementReference] = useState('');
  const [notes, setNotes] = useState('');
  const [isTest, setIsTest] = useState(false);
  const [issueDate, setIssueDate] = useState(today);
  const [dueDate, setDueDate] = useState(today);
  const [instructions, setInstructions] = useState(t('billing.clientToSupply'));
  const [items, setItems] = useState<EditorItem[]>([newInvoiceItem()]);
  const [showEditor, setShowEditor] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('mtn_momo');
  const [payerReference, setPayerReference] = useState('');
  const [paymentDate, setPaymentDate] = useState(today);
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [showPayment, setShowPayment] = useState(false);
  const [showVoidInvoice, setShowVoidInvoice] = useState(false);
  const [showVoidPayment, setShowVoidPayment] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [downloadTarget, setDownloadTarget] = useState<{ kind: DocKind; doc: DocRef } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ kind: DocKind; doc: DocRef } | null>(null);
  const [deleteReason, setDeleteReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setMessage('');
    try {
      if (receiptsView) {
        const result = await apiClient.get<PageResult<Payment>>('/admin/billing/payments', {
          params: {
            q: search || undefined,
            status: status || undefined,
            from: fromDate || undefined,
            to: toDate || undefined,
            include_test: includeTest,
            page,
            page_size: pageSize,
          },
        });
        setReceiptRows(result.items);
        setTotalCount(result.total);
        setRows([]);
        setSelected(null);
      } else {
        const result = await apiClient.get<PageResult<Invoice>>('/admin/billing/invoices', {
          params: {
            q: search || undefined,
            status: status || undefined,
            from: fromDate || undefined,
            to: toDate || undefined,
            include_test: includeTest,
            page,
            page_size: pageSize,
          },
        });
        setRows(result.items);
        setTotalCount(result.total);
        setReceiptRows([]);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('billing.loadError'));
    } finally {
      setLoading(false);
    }
  }, [receiptsView, search, status, fromDate, toDate, includeTest, page, t]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    setStatus('');
    setPage(1);
  }, [receiptsView]);

  const total = useMemo(
    () =>
      items.reduce(
        (sum, item) =>
          sum +
          Math.max(0, Number(item.quantity) || 0) * Math.max(0, Number(item.unit_price_ugx) || 0),
        0,
      ),
    [items],
  );
  const itemsInvalid = items.some((item) => serviceProblem(item.service) !== '');

  // The agreement dropdown lists real agreements (practice ones for a practice invoice).
  const applyAgreement = useCallback((reference: string, agreement?: AgreementOption) => {
    setAgreementReference(reference);
    if (!agreement) return;
    setBillName(agreement.client_name);
    setBillEmail(agreement.client_email);
    setBillPhone(agreement.client_phone);
    setBillAddress(agreement.client_address);
    setCareName(agreement.patient_name);
    setCareProgram(agreement.program);
    if (agreement.payment_instructions) setInstructions(agreement.payment_instructions);
    const period = serviceFromAgreement(agreement.service_start, agreement.service_end);
    if (period.mode !== 'none') {
      setItems((current) => current.map((item) =>
        item.service.mode === 'none' && !item.service.legacy ? { ...item, service: period } : item,
      ));
    }
  }, []);
  const formatAgreementSelected = useCallback(
    (reference: string) => t('billing.agreementFilled', { reference }),
    [t],
  );
  const { agreements, agreementError, agreementNote, setAgreementNote, chooseAgreement } = useBillingAgreementOptions({
    enabled: showEditor && canWrite,
    practice: isTest,
    onSelected: applyAgreement,
    formatSelectedMessage: formatAgreementSelected,
  });

  const openInvoice = useCallback(
    async (id: string) => {
      setError('');
      setMessage('');
      try {
        const result = await apiClient.get<Invoice>(`/admin/billing/invoices/${id}`);
        setSelected(result);
        setShowEditor(false);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : t('billing.loadError'));
      }
    },
    [t],
  );

  useEffect(() => {
    const id = new URLSearchParams(location.search).get('invoice');
    if (id && !receiptsView) void openInvoice(id);
  }, [location.search, receiptsView, openInvoice]);

  function startNew() {
    setSelected(null);
    setBillName('');
    setBillAddress('');
    setBillEmail('');
    setBillPhone('');
    setCareName('');
    setCareProgram('');
    setAgreementReference('');
    setNotes('');
    setIsTest(false);
    setIssueDate(today);
    setDueDate(today);
    setInstructions(t('billing.clientToSupply'));
    setItems([newInvoiceItem()]);
    setAgreementNote('');
    setShowEditor(true);
  }

  function startEdit() {
    if (!selected || selected.status !== 'draft') return;
    setBillName(selected.bill_to.name);
    setBillAddress(selected.bill_to.address);
    setBillEmail(selected.bill_to.email);
    setBillPhone(selected.bill_to.phone);
    setCareName(selected.care_recipient?.name || '');
    setCareProgram(selected.care_recipient?.program || '');
    setAgreementReference(selected.agreement_reference || '');
    setNotes(selected.notes || '');
    setIsTest(Boolean(selected.is_test));
    setIssueDate(selected.issue_date);
    setDueDate(selected.due_date);
    setInstructions(selected.payment_instructions || t('billing.clientToSupply'));
    setItems(
      selected.items.map((item) => ({
        description: item.description,
        service: parseServiceDate(item.service_date_text),
        quantity: item.quantity,
        unit_price_ugx: item.unit_price_ugx,
      })),
    );
    setAgreementNote('');
    setShowEditor(true);
  }

  async function saveDraft() {
    setBusy(true);
    setError('');
    setMessage('');
    const body = {
      bill_to: { name: billName, address: billAddress, phone: billPhone, email: billEmail },
      care_recipient: { name: careName, program: careProgram },
      agreement_reference: agreementReference || null,
      items: items.map(({ description, quantity, unit_price_ugx, service }) => ({
        description,
        quantity,
        unit_price_ugx,
        service_date_text: composeServiceDate(service),
      })),
      issue_date: issueDate,
      due_date: dueDate,
      payment_instructions: instructions,
      notes,
      is_test: isTest,
    };
    try {
      const result = selected
        ? await apiClient.patch<Invoice>(`/admin/billing/invoices/${selected.id}`, body)
        : await apiClient.post<Invoice>('/admin/billing/invoices', body);
      setSelected(result);
      setShowEditor(false);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('billing.saveError'));
    } finally {
      setBusy(false);
    }
  }

  async function issue() {
    if (!selected || !window.confirm(t('billing.issueConfirm'))) return;
    setBusy(true);
    setError('');
    try {
      const result = await apiClient.post<Invoice>(
        `/admin/billing/invoices/${selected.id}/issue`,
        {},
      );
      setSelected(result);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('billing.issueError'));
    } finally {
      setBusy(false);
    }
  }

  async function deleteDraft() {
    if (!selected || !window.confirm(t('billing.deleteConfirm'))) return;
    setBusy(true);
    setError('');
    try {
      await apiClient.delete(`/admin/billing/invoices/${selected.id}`);
      setSelected(null);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('billing.saveError'));
    } finally {
      setBusy(false);
    }
  }

  async function download(path: string, filename: string) {
    try {
      const blob = await apiClient.getBlob(path);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('billing.downloadError'));
    }
  }

  function startPayment() {
    if (!selected) return;
    setPaymentAmount(String(selected.balance_ugx));
    setPaymentDate(today);
    setPaymentMethod('mtn_momo');
    setPayerReference('');
    setIdempotencyKey(crypto.randomUUID());
    setShowPayment(true);
  }

  async function recordPayment() {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      await apiClient.post<Payment>(`/admin/billing/invoices/${selected.id}/payments`, {
        amount_ugx: Number(paymentAmount),
        method: paymentMethod,
        payer_reference: payerReference,
        paid_on: paymentDate,
        idempotency_key: idempotencyKey,
      });
      setShowPayment(false);
      setPayerReference('');
      setIdempotencyKey('');
      await openInvoice(selected.id);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('billing.paymentError'));
    } finally {
      setBusy(false);
    }
  }

  async function emailDocument(path: string) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await apiClient.post(path, {});
      setMessage(t('billing.emailSent'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('billing.emailError'));
    } finally {
      setBusy(false);
    }
  }

  async function copyWhatsApp(path: string) {
    try {
      const result = await apiClient.get<{ text: string }>(path);
      await navigator.clipboard.writeText(result.text);
      setMessage(t('billing.whatsappCopied'));
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('billing.whatsappError'));
    }
  }

  function openDownload(kind: DocKind, doc: DocRef) {
    setDownloadTarget({ kind, doc });
  }

  function openDelete(kind: DocKind, doc: DocRef) {
    setDeleteReason('');
    setDeleteTarget({ kind, doc });
  }

  /** Deletes an issued invoice or a receipt. The server frees its number and records who did it. */
  async function deleteRecord() {
    if (!deleteTarget) return;
    const { kind, doc } = deleteTarget;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await apiClient.post(`${billingBase(kind, doc.id)}/delete`, { reason: deleteReason });
      setDeleteTarget(null);
      setDeleteReason('');
      setMessage(t('billing.deleted', { reference: doc.reference || '' }));
      if (kind === 'invoice') {
        setSelected(null);
      } else if (selected) {
        await openInvoice(selected.id);
      }
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('billing.deleteRecordError'));
    } finally {
      setBusy(false);
    }
  }

  async function voidInvoice() {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      await apiClient.post(`/admin/billing/invoices/${selected.id}/void`, { reason: voidReason });
      setVoidReason('');
      setShowVoidInvoice(false);
      await openInvoice(selected.id);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('billing.voidError'));
    } finally {
      setBusy(false);
    }
  }

  async function voidPayment() {
    if (!selectedPayment) return;
    setBusy(true);
    setError('');
    try {
      await apiClient.post(`/admin/billing/payments/${selectedPayment.id}/void`, {
        reason: voidReason,
      });
      setVoidReason('');
      setShowVoidPayment(false);
      if (selected) await openInvoice(selected.id);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('billing.voidError'));
    } finally {
      setBusy(false);
    }
  }

  async function reissue() {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      const result = await apiClient.post<Invoice>(
        `/admin/billing/invoices/${selected.id}/reissue`,
        {},
      );
      setSelected(result);
      setShowEditor(false);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('billing.reissueError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.page}>
      <PageHeader
        title={receiptsView ? t('billing.receiptsTitle') : t('billing.title')}
        subtitle={t('billing.intro')}
        actions={
          canWrite && !receiptsView ? (
            <Button onClick={startNew}>{t('billing.newInvoice')}</Button>
          ) : undefined
        }
      />
      {error ? (
        <Notice tone="error">
          <p>{error}</p>
        </Notice>
      ) : null}
      {message ? (
        <Notice tone="info">
          <p>{message}</p>
        </Notice>
      ) : null}
      <FilterTabs
        tabs={
          receiptsView
            ? [
                { value: '', label: t('billing.all') },
                { value: 'valid', label: t('billing.statuses.valid') },
                { value: 'void', label: t('billing.statuses.void') },
              ]
            : [
                { value: '', label: t('billing.all') },
                ...['draft', 'issued', 'part_paid', 'paid', 'void'].map((value) => ({
                  value,
                  label: t(`billing.statuses.${value}`),
                })),
              ]
        }
        value={status}
        onChange={(value) => {
          setStatus(value);
          setPage(1);
        }}
        label={t('billing.status')}
        controls="billing-record-list"
      />
      <FilterBar
        label={t('billing.filterLabel')}
        role="search"
        onSubmit={() => setPage(1)}
        actions={
          <Button type="submit" variant="outline">
            {t('billing.refresh')}
          </Button>
        }
      >
        <Field
          label={t('billing.search')}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        <>
          <Field
            label={t('billing.fromDate')}
            type="date"
            value={fromDate}
            onChange={(event) => {
              setFromDate(event.target.value);
              setPage(1);
            }}
          />
          <Field
            label={t('billing.toDate')}
            type="date"
            value={toDate}
            onChange={(event) => {
              setToDate(event.target.value);
              setPage(1);
            }}
          />
        </>
        <Checkbox
          className={styles.practiceFilter}
          checked={includeTest}
          onChange={(event) => {
            setIncludeTest(event.target.checked);
            setPage(1);
          }}
          label={t('billing.includePractice')}
        />
      </FilterBar>
      <div className={styles.list}>
        {receiptsView ? (
          <DataTable<Payment>
            columns={[
              { key: 'reference', header: t('billing.reference'), cell: (row) => row.reference },
              {
                key: 'invoice',
                header: t('billing.invoice'),
                cell: (row) => row.invoice_reference,
              },
              { key: 'date', header: t('billing.date'), cell: (row) => row.paid_on },
              { key: 'amount', header: t('billing.amount'), cell: (row) => fmt(row.amount_ugx) },
              {
                key: 'balance',
                header: t('billing.balance'),
                cell: (row) => fmt(row.balance_after_ugx),
              },
              {
                key: 'status',
                header: t('billing.status'),
                cell: (row) => t(`billing.statuses.${row.status}`),
              },
              {
                key: 'actions',
                header: t('billing.actions'),
                cell: (row) => (
                  <div className={styles.actions}>
                    <Button
                      variant="outline"
                      size="compact"
                      onClick={() => openDownload('receipt', row)}
                    >
                      {t('billing.download')}
                    </Button>
                    {canWrite ? (
                      <Button
                        variant="outline"
                        size="compact"
                        onClick={() =>
                          void emailDocument(`/admin/billing/payments/${row.id}/email`)
                        }
                      >
                        {t('billing.emailReceipt')}
                      </Button>
                    ) : null}
                    {canVoid && row.status === 'valid' ? (
                      <Button
                        variant="outline"
                        size="compact"
                        onClick={() => {
                          setSelectedPayment(row);
                          setVoidReason('');
                          setShowVoidPayment(true);
                        }}
                      >
                        {t('billing.voidReceipt')}
                      </Button>
                    ) : null}
                    {canVoid ? (
                      <Button
                        variant="outline"
                        size="compact"
                        onClick={() => openDelete('receipt', row)}
                      >
                        {t('billing.deleteRecord')}
                      </Button>
                    ) : null}
                  </div>
                ),
              },
            ]}
            rows={receiptRows}
            getRowKey={(row) => row.id}
            loading={loading}
            labels={{
              caption: t('billing.receiptsTableCaption'),
              loading: t('billing.loading'),
              empty: t('billing.empty'),
            }}
          />
        ) : (
          <DataTable<Invoice>
            columns={[
              {
                key: 'reference',
                header: t('billing.reference'),
                cell: (row) => row.reference || t('billing.draft'),
              },
              {
                key: 'client',
                header: t('billing.client'),
                cell: (row) => row.bill_to?.name || row.reference || '',
              },
              { key: 'date', header: t('billing.date'), cell: (row) => row.issue_date || '' },
              {
                key: 'amount',
                header: t('billing.amount'),
                cell: (row) => fmt(row.total_ugx || 0),
              },
              {
                key: 'balance',
                header: t('billing.balance'),
                cell: (row) => fmt(row.balance_ugx || 0),
              },
              {
                key: 'status',
                header: t('billing.status'),
                cell: (row) => t(`billing.statuses.${row.status}`),
              },
            ]}
            rows={rows}
            getRowKey={(row) => row.id}
            id="billing-record-list"
            getRowHref={(row) => `/billing?invoice=${row.id}`}
            loading={loading}
            labels={{
              caption: t('billing.tableCaption'),
              loading: t('billing.loading'),
              empty: t('billing.empty'),
            }}
          />
        )}
      </div>
      <Pagination
        page={page}
        pageSize={pageSize}
        total={totalCount}
        onChange={setPage}
        labels={{
          nav: t('billing.paginationNav'),
          previous: t('billing.previous'),
          next: t('billing.next'),
          summary: (from, to, count) => t('billing.paginationSummary', { from, to, total: count }),
        }}
      />
      {showEditor ? (
        <BillingInvoiceEditor
          billName={billName}
          billEmail={billEmail}
          billPhone={billPhone}
          billAddress={billAddress}
          careName={careName}
          careProgram={careProgram}
          agreementReference={agreementReference}
          agreements={agreements}
          agreementError={agreementError}
          agreementNote={agreementNote}
          issueDate={issueDate}
          dueDate={dueDate}
          instructions={instructions}
          notes={notes}
          isTest={isTest}
          items={items}
          total={total}
          itemsInvalid={itemsInvalid}
          busy={busy}
          onBillNameChange={setBillName}
          onBillEmailChange={setBillEmail}
          onBillPhoneChange={setBillPhone}
          onBillAddressChange={setBillAddress}
          onCareNameChange={setCareName}
          onCareProgramChange={setCareProgram}
          onChooseAgreement={chooseAgreement}
          onIssueDateChange={setIssueDate}
          onDueDateChange={setDueDate}
          onInstructionsChange={setInstructions}
          onNotesChange={setNotes}
          onPracticeChange={setIsTest}
          onItemChange={(index, patch) => {
            setItems((current) => current.map((item, itemIndex) =>
              itemIndex === index ? { ...item, ...patch } : item,
            ));
          }}
          onAddItem={() => setItems((current) => [...current, newInvoiceItem()])}
          onRemoveItem={(index) => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}
          onSave={() => void saveDraft()}
          onCancel={() => setShowEditor(false)}
        />
      ) : null}
      {selected && !showEditor ? (
        <BillingInvoiceDetail
          invoice={selected}
          canWrite={canWrite}
          canVoid={canVoid}
          canDelete={canDeleteRecord('invoice', selected.status)}
          busy={busy}
          onEditDraft={startEdit}
          onDeleteDraft={() => void deleteDraft()}
          onIssue={() => void issue()}
          onDownload={(invoice) => openDownload('invoice', invoice)}
          onEmail={(invoice) => void emailDocument(`/admin/billing/invoices/${invoice.id}/email`)}
          onStartPayment={startPayment}
          onVoidReceipt={(payment) => {
            setSelectedPayment(payment);
            setVoidReason('');
            setShowVoidPayment(true);
          }}
          onDeleteReceipt={(payment) => openDelete('receipt', payment)}
          onReissue={() => void reissue()}
          onVoidInvoice={() => {
            setVoidReason('');
            setShowVoidInvoice(true);
          }}
          onDeleteInvoice={(invoice) => openDelete('invoice', invoice)}
        />
      ) : null}
      {downloadTarget ? (
        <Modal
          id="billing-download-dialog"
          title={t('billing.downloadTitle')}
          subtitle={downloadTarget.doc.reference || ''}
          closeLabel={t('billing.close')}
          onClose={() => setDownloadTarget(null)}
        >
          <div className={styles.downloadList}>
            {downloadOptions(downloadTarget.kind, downloadTarget.doc).map((option) => (
              <Button
                key={option.labelKey}
                variant="outline"
                onClick={() => {
                  setDownloadTarget(null);
                  if (option.type === 'pdf') void download(option.path, option.filename);
                  else void copyWhatsApp(option.path);
                }}
              >
                {t(option.labelKey)}
              </Button>
            ))}
          </div>
        </Modal>
      ) : null}
      {deleteTarget ? (
        <Modal
          id="billing-delete-dialog"
          title={t(
            deleteTarget.kind === 'invoice'
              ? 'billing.deleteInvoiceTitle'
              : 'billing.deleteReceiptTitle',
          )}
          subtitle={deleteTarget.doc.reference || ''}
          closeLabel={t('billing.close')}
          onClose={() => setDeleteTarget(null)}
          role="alertdialog"
        >
          <div className={styles.modalBody}>
            <TotpGate>
              <p>
                {t(
                  deleteTarget.kind === 'invoice'
                    ? 'billing.deleteInvoiceWarning'
                    : 'billing.deleteReceiptWarning',
                )}
              </p>
              <Field
                label={t('billing.deleteReason')}
                value={deleteReason}
                onChange={(event) => setDeleteReason(event.target.value)}
                maxLength={300}
              />
              <Button
                variant="outline"
                disabled={busy || deleteReason.trim().length < 5}
                onClick={() => void deleteRecord()}
              >
                {t('billing.confirmDelete')}
              </Button>
            </TotpGate>
          </div>
        </Modal>
      ) : null}
      {showPayment && selected ? (
        <Modal
          id="billing-payment-dialog"
          title={t('billing.recordPayment')}
          subtitle={selected.reference || ''}
          closeLabel={t('billing.close')}
          onClose={() => setShowPayment(false)}
        >
          <div className={styles.modalBody}>
            <Field
              label={t('billing.paymentAmount')}
              type="number"
              min={1}
              max={selected.balance_ugx}
              value={paymentAmount}
              onChange={(event) => setPaymentAmount(event.target.value)}
            />
            <Field
              kind="select"
              label={t('billing.paymentMethod')}
              value={paymentMethod}
              onChange={(event) => setPaymentMethod(event.target.value)}
            >
              {['mtn_momo', 'airtel_money', 'bank_transfer', 'cash', 'cheque', 'other'].map(
                (m) => (
                  <option key={m} value={m}>
                    {t(`billing.methods.${m}`)}
                  </option>
                ),
              )}
            </Field>
            {paymentMethod !== 'cash' ? (
              <Field
                label={t('billing.payerReference')}
                value={payerReference}
                onChange={(event) => setPayerReference(event.target.value)}
                maxLength={80}
              />
            ) : null}
            <Field
              label={t('billing.paymentDate')}
              type="date"
              value={paymentDate}
              max={today}
              onChange={(event) => setPaymentDate(event.target.value)}
            />
            <p className={styles.muted}>{t('billing.idempotencyNote')}</p>
            <div className={styles.actions}>
              <Button
                disabled={
                  busy ||
                  Number(paymentAmount) <= 0 ||
                  Number(paymentAmount) > selected.balance_ugx ||
                  (paymentMethod !== 'cash' && !payerReference.trim()) ||
                  !paymentDate
                }
                onClick={() => void recordPayment()}
              >
                {t('billing.submitPayment')}
              </Button>
              <Button variant="outline" onClick={() => setShowPayment(false)}>
                {t('billing.cancel')}
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
      {showVoidInvoice && selected ? (
        <Modal
          id="billing-void-invoice-dialog"
          title={t('billing.voidInvoiceTitle')}
          closeLabel={t('billing.close')}
          onClose={() => setShowVoidInvoice(false)}
        >
          <div className={styles.modalBody}>
            <TotpGate>
              <Field
                label={t('billing.voidInvoiceReason')}
                value={voidReason}
                onChange={(event) => setVoidReason(event.target.value)}
                maxLength={300}
              />
              <Button
                variant="outline"
                disabled={busy || voidReason.trim().length < 5}
                onClick={() => void voidInvoice()}
              >
                {t('billing.confirmVoid')}
              </Button>
            </TotpGate>
          </div>
        </Modal>
      ) : null}
      {showVoidPayment && selectedPayment ? (
        <Modal
          id="billing-void-payment-dialog"
          title={t('billing.voidPaymentTitle')}
          subtitle={selectedPayment.reference}
          closeLabel={t('billing.close')}
          onClose={() => setShowVoidPayment(false)}
        >
          <div className={styles.modalBody}>
            <TotpGate>
              <Field
                label={t('billing.voidPaymentReason')}
                value={voidReason}
                onChange={(event) => setVoidReason(event.target.value)}
                maxLength={300}
              />
              <Button
                variant="outline"
                disabled={busy || voidReason.trim().length < 5}
                onClick={() => void voidPayment()}
              >
                {t('billing.confirmVoidPayment')}
              </Button>
            </TotpGate>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}
