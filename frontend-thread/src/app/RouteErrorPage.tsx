import { useEffect, useMemo } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/Button';
import { ErrorDoor, ShapeField } from '../components/thread/ThreadParts';
import { reportClientError } from '../lib/api/clientErrors';
import styles from '../features/public/NotFoundPage.module.css';

/** Shown instead of the router's raw error screen for any failure while loading or rendering a route. */
export function RouteErrorPage() {
  const error = useRouteError();
  const { t } = useTranslation('common');
  const status = isRouteErrorResponse(error) ? error.status : 500;
  const incidentId = useMemo(() => globalThis.crypto?.randomUUID?.() ?? `incident-${Date.now()}`, []);

  useEffect(() => {
    if (status === 404) return;
    const err = error instanceof Error ? error : new Error(isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : String(error));
    reportClientError({ name: err.name, message: err.message, stack: err.stack, source: 'react.route_error' });
  }, [error, status]);

  const kind = status === 404 ? 'notFound' : status === 401 || status === 403 ? 'forbidden' : status >= 500 ? 'server' : 'generic';
  const title = kind === 'notFound' ? t('notFound.title') : kind === 'forbidden' ? t('error.forbiddenTitle') : kind === 'server' ? t('error.serverTitle') : t('error.title');
  const body = kind === 'notFound' ? t('notFound.body') : kind === 'forbidden' ? t('error.forbiddenBody') : kind === 'server' ? t('error.serverBody') : t('error.body');

  return (
    <section className={styles.page} role={kind === 'server' || kind === 'generic' ? 'alert' : 'region'}>
      <ShapeField variant="error" />
      <div className="container">
        <div className={styles.content}>
          <ErrorDoor code={String(status)} kind={status === 404 ? 'open' : status === 403 || status === 401 ? 'shut' : 'frayed'} />
          <p className={styles.body}>{status}</p>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.body}>{body}</p>
          {kind !== 'notFound' && kind !== 'forbidden' && (
            <p className={styles.body}>{t('error.reference')}: <strong>{incidentId}</strong></p>
          )}
          <div className={styles.actions}>
            <Button href="/">{t('error.home')}</Button>
            {kind !== 'notFound' && kind !== 'forbidden' && (
              <Button variant="outline" onClick={() => window.location.reload()}>{t('error.reload')}</Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
