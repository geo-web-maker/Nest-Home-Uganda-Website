import { useTranslation } from 'react-i18next';
import { Button } from '@shared/components/ui/Button';
import type { Invoice, Payment } from './billingTypes';
import styles from './BillingPage.module.css';

function formatMoney(value: number) {
  return `UGX ${value.toLocaleString('en-UG')}`;
}

type Props = {
  invoice: Invoice;
  canWrite: boolean;
  canVoid: boolean;
  canDelete: boolean;
  busy: boolean;
  onEditDraft: () => void;
  onDeleteDraft: () => void;
  onIssue: () => void;
  onDownload: (invoice: Invoice) => void;
  onEmail: (invoice: Invoice) => void;
  onStartPayment: () => void;
  onVoidReceipt: (payment: Payment) => void;
  onDeleteReceipt: (payment: Payment) => void;
  onReissue: () => void;
  onVoidInvoice: () => void;
  onDeleteInvoice: (invoice: Invoice) => void;
};

/** Read-only invoice summary and lifecycle actions, separate from the draft editor and page state. */
export function BillingInvoiceDetail({
  invoice,
  canWrite,
  canVoid,
  canDelete,
  busy,
  onEditDraft,
  onDeleteDraft,
  onIssue,
  onDownload,
  onEmail,
  onStartPayment,
  onVoidReceipt,
  onDeleteReceipt,
  onReissue,
  onVoidInvoice,
  onDeleteInvoice,
}: Props) {
  const { t } = useTranslation('admin');

  return (
    <div className={styles.panel}>
      <div className={styles.detailHead}>
        <h2>{invoice.reference || t('billing.draft')}</h2>
        <strong>{t(`billing.statuses.${invoice.status}`)}</strong>
      </div>
      <p>{invoice.bill_to.name}</p>
      <p>
        {formatMoney(invoice.total_ugx)} · {t('billing.balance')}: {formatMoney(invoice.balance_ugx)}
      </p>

      {invoice.events?.length ? (
        <section className={styles.timeline} aria-label={t('billing.timeline')}>
          <h3>{t('billing.timeline')}</h3>
          <ol>
            {[...invoice.events].reverse().map((event, index) => {
              const detail = event.detail || {};
              const reason = typeof detail.reason === 'string' ? detail.reason : '';
              const actor = event.actor === 'system'
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

      {invoice.status === 'draft' && canWrite ? (
        <div className={styles.actions}>
          <Button variant="outline" onClick={onEditDraft}>{t('billing.editDraft')}</Button>
          <Button variant="outline" onClick={onDeleteDraft} disabled={busy}>{t('billing.deleteDraft')}</Button>
          <Button disabled={busy} onClick={onIssue}>{t('billing.issue')}</Button>
        </div>
      ) : null}

      {invoice.sealed?.content_hash ? (
        <div className={styles.actions}>
          <Button variant="outline" onClick={() => onDownload(invoice)}>{t('billing.download')}</Button>
          {canWrite && invoice.status !== 'void' ? (
            <Button variant="outline" onClick={() => onEmail(invoice)}>
              {t('billing.email')}
            </Button>
          ) : null}
        </div>
      ) : null}

      {['issued', 'part_paid'].includes(invoice.status) && canWrite ? (
        <Button onClick={onStartPayment}>{t('billing.recordPayment')}</Button>
      ) : null}

      {invoice.payments?.length ? (
        <div>
          <h3>{t('billing.payments')}</h3>
          {invoice.payments.map((payment) => (
            <div className={styles.paymentRow} key={payment.id}>
              <span>
                {payment.reference} - {formatMoney(payment.amount_ugx)} -{' '}
                {t(`billing.statuses.${payment.status}`)}
              </span>
              {canVoid && payment.status === 'valid' ? (
                <Button variant="outline" size="compact" onClick={() => onVoidReceipt(payment)}>
                  {t('billing.voidReceipt')}
                </Button>
              ) : null}
              {canVoid ? (
                <Button variant="outline" size="compact" onClick={() => onDeleteReceipt(payment)}>
                  {t('billing.deleteRecord')}
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {invoice.status === 'void' && canWrite ? (
        <Button variant="outline" onClick={onReissue}>{t('billing.reissue')}</Button>
      ) : null}
      {invoice.status === 'issued' && canVoid ? (
        <Button variant="outline" onClick={onVoidInvoice}>{t('billing.void')}</Button>
      ) : null}
      {canDelete ? (
        <Button variant="outline" onClick={() => onDeleteInvoice(invoice)}>
          {t('billing.deleteRecord')}
        </Button>
      ) : null}
    </div>
  );
}
