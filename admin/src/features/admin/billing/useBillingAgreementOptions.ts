import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@shared/lib/api/client';
import type { AgreementOption } from './billingTypes';

type UseBillingAgreementOptionsArgs = {
  enabled: boolean;
  practice: boolean;
  onSelected: (reference: string, agreement?: AgreementOption) => void;
  formatSelectedMessage: (reference: string) => string;
};

/** Loads the agreement choices for the invoice editor and applies the selected agreement. */
export function useBillingAgreementOptions({
  enabled,
  practice,
  onSelected,
  formatSelectedMessage,
}: UseBillingAgreementOptionsArgs) {
  const [agreements, setAgreements] = useState<AgreementOption[]>([]);
  const [agreementError, setAgreementError] = useState(false);
  const [agreementNote, setAgreementNote] = useState('');

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setAgreementError(false);
    void apiClient
      .get<{ items: AgreementOption[] }>('/admin/billing/agreement-options', {
        params: { practice },
      })
      .then((result) => {
        if (!cancelled) setAgreements(result.items ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setAgreements([]);
          setAgreementError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, practice]);

  const chooseAgreement = useCallback((reference: string) => {
    const agreement = agreements.find((entry) => entry.reference === reference);
    onSelected(reference, agreement);
    setAgreementNote(agreement ? formatSelectedMessage(reference) : '');
  }, [agreements, formatSelectedMessage, onSelected]);

  return { agreements, agreementError, agreementNote, setAgreementNote, chooseAgreement };
}
