import { useEffect, useState } from 'react';
import { Notice } from '@shared/components/dialogs/Notice';
import { Button } from '@shared/components/ui/Button';
import { Checkbox } from '@shared/components/ui/Checkbox';
import { LoadingNote } from '../../../components/admin/LoadingNote';
import { apiClient } from '@shared/lib/api/client';
import styles from './AgreementsPage.module.css';

type PreviewResponse = { html: string };

/** Loads the rendered client agreement preview and exposes the highlighted review PDF. */
export function AgreementPreviewPanel({ id, reference }: { id: string; reference: string }) {
  const [html, setHtml] = useState('');
  const [error, setError] = useState('');
  const [highlight, setHighlight] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let live = true;
    void apiClient
      .get<PreviewResponse>(`/admin/agreements/${id}/preview-data`, {
        params: { highlight: highlight ? 'true' : 'false' },
      })
      .then((value) => {
        if (live) {
          setHtml(value.html);
          setError('');
        }
      })
      .catch((cause: unknown) => {
        if (live) setError(cause instanceof Error ? cause.message : 'Preview unavailable.');
      });
    return () => { live = false; };
  }, [id, highlight]);

  const download = async () => {
    setDownloading(true);
    setError('');
    try {
      const blob = await apiClient.getBlob(`/admin/agreements/${id}/review-pdf`);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${reference}-review.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not download the review copy.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <div className={styles.previewBar}>
        <Checkbox label="Highlight fields" checked={highlight} onChange={(event) => setHighlight(event.target.checked)} />
        <span className={styles.previewKey}>
          <i style={{ background: '#ffe066' }} />staff must fill
          <i style={{ background: '#d7f0dc' }} />filled
          <i style={{ background: '#dceaf8' }} />client fills
        </span>
        <Button variant="outline" size="compact" onClick={() => void download()} disabled={downloading}>
          {downloading ? <LoadingNote inline>Preparing…</LoadingNote> : 'Download highlighted copy (PDF)'}
        </Button>
      </div>
      {error
        ? <Notice tone="error">{error}</Notice>
        : <div className={styles.preview}><iframe title="Rendered client agreement preview" srcDoc={html} sandbox="" /></div>}
    </>
  );
}
