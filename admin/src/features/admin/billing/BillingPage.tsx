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
import { Field } from '@shared/components/ui/Field';
import { TotpGate } from '@shared/components/security/TotpGate';
import { apiClient } from '@shared/lib/api/client';
import { useAuth } from '../auth/useAuth';
import { hasScopes } from '../auth/hasScopes';
import styles from './BillingPage.module.css';

type Item = {
  description: string;
  quantity: number;
  unit_price_ugx: number;
  amount_ugx?: number;
  service_date_text?: string;
};
type Payment = {
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
type Invoice = {
  id: string;
  reference?: string | null;
  status: string;
  is_test?: boolean;
  agreement_reference?: string | null;
  bill_to: { name: string; address: string; phone: string; email: string };
  care_recipient?: { name: string; program: string };
  items: Item[];
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
type PageResult<T> = { items: T[]; total: number };
const today = new Date().toISOString().slice(0, 10);
const newItem = (): Item => ({ description: '', quantity: 1, unit_price_ugx: 0 });
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
  const [items, setItems] = useState<Item[]>([newItem()]);
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
    setItems([newItem()]);
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
        service_date_text: item.service_date_text || '',
        quantity: item.quantity,
        unit_price_ugx: item.unit_price_ugx,
      })),
    );
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
      items: items.map(({ description, quantity, unit_price_ugx, service_date_text }) => ({
        description,
        quantity,
        unit_price_ugx,
        service_date_text: service_date_text || '',
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
        <label className={styles.practiceFilter}>
          <input
            type="checkbox"
            checked={includeTest}
            onChange={(event) => {
              setIncludeTest(event.target.checked);
              setPage(1);
            }}
          />
          {t('billing.includePractice')}
        </label>
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
                      onClick={() =>
                        void download(
                          `/admin/billing/payments/${row.id}/pdf?layout=ledger`,
                          `${row.reference}${row.status === 'void' ? '-VOID' : ''}-ledger.pdf`,
                        )
                      }
                    >
                      {row.status === 'void'
                        ? t('billing.downloadVoid')
                        : t('billing.downloadReceipt')}
                    </Button>
                    {row.status === 'void' ? (
                      <Button
                        variant="outline"
                        size="compact"
                        onClick={() =>
                          void download(
                            `/admin/billing/payments/${row.id}/pdf?layout=ledger&original=true`,
                            `${row.reference}-original-ledger.pdf`,
                          )
                        }
                      >
                        {t('billing.originalReceipt')}
                      </Button>
                    ) : null}
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
            getRowHref={(row) => `/admin/billing?invoice=${row.id}`}
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
        <div className={styles.panel}>
          <h2>{t('billing.editorTitle')}</h2>
          <div className={styles.formGrid}>
            <Field
              label={t('billing.clientName')}
              value={billName}
              onChange={(event) => setBillName(event.target.value)}
            />
            <Field
              label={t('billing.clientEmail')}
              value={billEmail}
              onChange={(event) => setBillEmail(event.target.value)}
            />
            <Field
              label={t('billing.clientPhone')}
              value={billPhone}
              onChange={(event) => setBillPhone(event.target.value)}
            />
            <Field
              label={t('billing.clientAddress')}
              value={billAddress}
              onChange={(event) => setBillAddress(event.target.value)}
            />
            <Field
              label={t('billing.careRecipient')}
              value={careName}
              onChange={(event) => setCareName(event.target.value)}
            />
            <Field
              label={t('billing.careProgram')}
              value={careProgram}
              onChange={(event) => setCareProgram(event.target.value)}
            />
            <Field
              label={t('billing.agreementReference')}
              value={agreementReference}
              onChange={(event) => setAgreementReference(event.target.value)}
            />
            <Field
              label={t('billing.issueDate')}
              type="date"
              value={issueDate}
              onChange={(event) => setIssueDate(event.target.value)}
            />
            <Field
              label={t('billing.dueDate')}
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
            <Field
              label={t('billing.paymentInstructions')}
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
            />
            <Field
              label={t('billing.notes')}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
          <label className={styles.practiceFilter}>
            <input
              type="checkbox"
              checked={isTest}
              onChange={(event) => setIsTest(event.target.checked)}
            />
            {t('billing.practiceDocument')}
          </label>
          <h3>{t('billing.items')}</h3>
          {items.map((item, index) => (
            <div className={styles.itemRow} key={index}>
              <Field
                label={t('billing.description')}
                value={item.description}
                onChange={(event) =>
                  setItems((current) =>
                    current.map((row, i) =>
                      i === index ? { ...row, description: event.target.value } : row,
                    ),
                  )
                }
              />
              <Field
                label={t('billing.serviceDate')}
                value={item.service_date_text || ''}
                onChange={(event) =>
                  setItems((current) =>
                    current.map((row, i) =>
                      i === index ? { ...row, service_date_text: event.target.value } : row,
                    ),
                  )
                }
              />
              <Field
                label={t('billing.quantity')}
                type="number"
                min={1}
                max={10000}
                value={String(item.quantity)}
                onChange={(event) =>
                  setItems((current) =>
                    current.map((row, i) =>
                      i === index ? { ...row, quantity: Number(event.target.value) } : row,
                    ),
                  )
                }
              />
              <Field
                label={t('billing.unitPrice')}
                type="number"
                min={0}
                max={2000000000}
                value={String(item.unit_price_ugx)}
                onChange={(event) =>
                  setItems((current) =>
                    current.map((row, i) =>
                      i === index ? { ...row, unit_price_ugx: Number(event.target.value) } : row,
                    ),
                  )
                }
              />
              <Button
                variant="outline"
                onClick={() => setItems((current) => current.filter((_, i) => i !== index))}
              >
                {t('billing.remove')}
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            onClick={() => setItems((current) => [...current, newItem()])}
            disabled={items.length >= 60}
          >
            {t('billing.addItem')}
          </Button>
          <p className={styles.total}>
            {t('billing.total')}: {fmt(total)}
          </p>
          <div className={styles.actions}>
            <Button
              onClick={() => void saveDraft()}
              disabled={busy || !billName.trim() || dueDate < issueDate}
            >
              {t('billing.saveDraft')}
            </Button>
            <Button variant="outline" onClick={() => setShowEditor(false)}>
              {t('billing.cancel')}
            </Button>
          </div>
        </div>
      ) : null}
      {selected && !showEditor ? (
        <div className={styles.panel}>
          <div className={styles.detailHead}>
            <h2>{selected.reference || t('billing.draft')}</h2>
            <strong>{t(`billing.statuses.${selected.status}`)}</strong>
          </div>
          <p>{selected.bill_to.name}</p>
          <p>
            {fmt(selected.total_ugx)} · {t('billing.balance')}: {fmt(selected.balance_ugx)}
          </p>
          {selected.events?.length ? (
            <section className={styles.timeline} aria-label={t('billing.timeline')}>
              <h3>{t('billing.timeline')}</h3>
              <ol>
                {[...selected.events].reverse().map((event, index) => {
                  const detail = event.detail || {};
                  const reason = typeof detail.reason === 'string' ? detail.reason : '';
                  const actor =
                    event.actor === 'system'
                      ? t('billing.systemActor')
                      : `${t('billing.staffActor')} ${event.actor.slice(-4)}`;
                  return (
                    <li key={`${event.type}-${event.at}-${index}`}>
                      <div>
                        <strong>
                          {t(`billing.events.${event.type}`, {
                            defaultValue: event.type.replaceAll('_', ' '),
                          })}
                        </strong>{' '}
                        <time dateTime={event.at}>{new Date(event.at).toLocaleString()}</time>
                      </div>
                      <small>{actor}</small>
                      {reason ? <p>{reason}</p> : null}
                    </li>
                  );
                })}
              </ol>
            </section>
          ) : null}
          {selected.status === 'draft' && canWrite ? (
            <div className={styles.actions}>
              <Button variant="outline" onClick={startEdit}>
                {t('billing.editDraft')}
              </Button>
              <Button variant="outline" onClick={() => void deleteDraft()} disabled={busy}>
                {t('billing.deleteDraft')}
              </Button>
              <Button disabled={busy} onClick={() => void issue()}>
                {t('billing.issue')}
              </Button>
            </div>
          ) : null}
          {selected.sealed?.content_hash ? (
            <div className={styles.actions}>
              <Button
                variant="outline"
                onClick={() =>
                  void download(
                    `/admin/billing/invoices/${selected.id}/pdf?layout=ledger`,
                    `${selected.reference}${selected.status === 'void' ? '-VOID' : ''}-ledger.pdf`,
                  )
                }
              >
                {selected.status === 'void' ? t('billing.downloadVoid') : t('billing.ledger')}
              </Button>
              {selected.status === 'void' ? (
                <>
                  <Button
                    variant="outline"
                    onClick={() =>
                      void download(
                        `/admin/billing/invoices/${selected.id}/pdf?layout=ledger&original=true`,
                        `${selected.reference}-original-ledger.pdf`,
                      )
                    }
                  >
                    {t('billing.originalLedger')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      void download(
                        `/admin/billing/invoices/${selected.id}/pdf?layout=slip&original=true`,
                        `${selected.reference}-original-slip.pdf`,
                      )
                    }
                  >
                    {t('billing.originalSlip')}
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  onClick={() =>
                    void download(
                      `/admin/billing/invoices/${selected.id}/pdf?layout=slip`,
                      `${selected.reference}-slip.pdf`,
                    )
                  }
                >
                  {t('billing.slip')}
                </Button>
              )}
              {canWrite && selected.status !== 'void' ? (
                <Button
                  variant="outline"
                  onClick={() => void emailDocument(`/admin/billing/invoices/${selected.id}/email`)}
                >
                  {t('billing.email')}
                </Button>
              ) : null}
              <Button
                variant="outline"
                onClick={() => void copyWhatsApp(`/admin/billing/invoices/${selected.id}/whatsapp`)}
              >
                {t('billing.copyWhatsApp')}
              </Button>
            </div>
          ) : null}
          {['issued', 'part_paid'].includes(selected.status) && canWrite ? (
            <Button onClick={startPayment}>{t('billing.recordPayment')}</Button>
          ) : null}
          {selected.payments?.length ? (
            <div>
              <h3>{t('billing.payments')}</h3>
              {selected.payments.map((payment) => (
                <div className={styles.paymentRow} key={payment.id}>
                  <span>
                    {payment.reference} - {fmt(payment.amount_ugx)} -{' '}
                    {t(`billing.statuses.${payment.status}`)}
                  </span>
                  {canVoid && payment.status === 'valid' ? (
                    <Button
                      variant="outline"
                      size="compact"
                      onClick={() => {
                        setSelectedPayment(payment);
                        setVoidReason('');
                        setShowVoidPayment(true);
                      }}
                    >
                      {t('billing.voidReceipt')}
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
          {selected.status === 'void' && canWrite ? (
            <Button variant="outline" onClick={() => void reissue()}>
              {t('billing.reissue')}
            </Button>
          ) : null}
          {selected.status === 'issued' && canVoid ? (
            <Button
              variant="outline"
              onClick={() => {
                setVoidReason('');
                setShowVoidInvoice(true);
              }}
            >
              {t('billing.void')}
            </Button>
          ) : null}
        </div>
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
            <label>
              {t('billing.paymentMethod')}
              <select
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
              </select>
            </label>
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
