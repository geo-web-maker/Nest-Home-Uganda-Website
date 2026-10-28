import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { Head } from 'vite-react-ssg';
import { z } from 'zod';
import { Button } from '../../../components/ui/Button';
import { Field } from '../../../components/ui/Field';
import { ApiError, apiClient } from '../../../lib/api/client';
import styles from './LoginPage.module.css';

type Values = { password: string; confirm: string };

// Public route (outside RequireAuth): redeems the one-time link from an invite or reset email.
export function SetPasswordPage() {
  const { t } = useTranslation('admin');
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const isInvite = params.get('purpose') === 'invite';
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const schema = z
    .object({
      password: z.string().min(12, t('setPassword.errors.short')).max(200),
      confirm: z.string(),
    })
    .refine((v) => v.password === v.confirm, {
      path: ['confirm'],
      message: t('setPassword.errors.mismatch'),
    });
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { password: '', confirm: '' },
  });

  const bind = (name: keyof Values) => {
    const { onChange, onBlur, ref, name: fieldName } = register(name);
    return { onChange, onBlur, ref, name: fieldName };
  };

  const onValid = async ({ password }: Values) => {
    setFormError(null);
    try {
      const endpoint = isInvite ? '/auth/accept-invite' : '/auth/set-password';
      await apiClient.post(endpoint, { token, password }, { retryOn401: false });
      setDone(true);
    } catch (error) {
      if (error instanceof ApiError && error.status === 429) {
        setFormError(t('login.errors.rateLimited'));
      } else if (error instanceof ApiError && error.status === 422 && error.fields?.token) {
        setFormError(t('setPassword.errors.link'));
      } else {
        setFormError(t('setPassword.errors.failed'));
      }
    }
  };

  return (
    <main className={styles.screen}>
      <Head>
        <title>{`${t('setPassword.title')} | Well Nest Home Care Uganda Admin`}</title>
        <meta name="robots" content="noindex" />
      </Head>
      {done ? (
        <div className={styles.card}>
          <h1 className={styles.title}>{t('setPassword.title')}</h1>
          <p role="status">{t('setPassword.done')}</p>
          <Link to="/admin/login">{t('setPassword.toLogin')}</Link>
        </div>
      ) : token.length === 0 ? (
        <div className={styles.card}>
          <h1 className={styles.title}>{t('setPassword.title')}</h1>
          <p role="alert" className={styles.error}>
            {t('setPassword.errors.noToken')}
          </p>
        </div>
      ) : (
        <form className={styles.card} onSubmit={(e) => void handleSubmit(onValid)(e)} noValidate>
          <h1 className={styles.title}>{t('setPassword.title')}</h1>
          <p>{t('setPassword.hint')}</p>
          <Field
            label={t('setPassword.password')}
            type="password"
            autoComplete="new-password"
            required
            requiredLabel={t('login.required')}
            error={errors.password?.message}
            {...bind('password')}
          />
          <Field
            label={t('setPassword.confirm')}
            type="password"
            autoComplete="new-password"
            required
            requiredLabel={t('login.required')}
            error={errors.confirm?.message}
            {...bind('confirm')}
          />
          {formError && (
            <p className={styles.error} role="alert">
              {formError}
            </p>
          )}
          <Button type="submit" fullWidth disabled={isSubmitting}>
            {isSubmitting ? t('setPassword.submitting') : t('setPassword.submit')}
          </Button>
        </form>
      )}
    </main>
  );
}
