import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { z } from 'zod';
import { Button } from '@shared/components/ui/Button';
import { Field } from '@shared/components/ui/Field';
import { ApiError, apiClient } from '@shared/lib/api/client';
import { MIN_PASSWORD_LENGTH, isWeakPassword, passwordStrength } from '@shared/lib/passwordStrength';
import { loadWithRetry } from './linkFailure';
import { cleanToken, describeSetPasswordFailure, problemForState, type SetPasswordProblem } from './setPasswordLink';
import styles from './LoginPage.module.css';

type Values = { password: string; confirm: string };

// Public route (outside RequireAuth): redeems the one-time link from an invite or reset email.
export function SetPasswordPage() {
  const { t } = useTranslation('admin');
  const [params] = useSearchParams();
  const rawToken = params.get('token') ?? '';
  const token = cleanToken(rawToken);
  const isInvite = params.get('purpose') === 'invite';
  const fromTemp = params.get('from') === 'temp';
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [problem, setProblem] = useState<SetPasswordProblem | null>(
    rawToken && !token ? problemForState('malformed') : null,
  );

  const schema = z
    .object({
      password: z
        .string()
        .min(MIN_PASSWORD_LENGTH, t('setPassword.errors.short'))
        .max(200)
        .refine((v) => !isWeakPassword(v), t('setPassword.errors.weak')),
      confirm: z.string(),
    })
    .refine((v) => v.password === v.confirm, {
      path: ['confirm'],
      message: t('setPassword.errors.mismatch'),
    });
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { password: '', confirm: '' },
  });

  // Ask first whether the link is still good, so a dead link is explained before a password is typed.
  useEffect(() => {
    if (!token) return;
    let live = true;
    const purpose = isInvite ? 'invite' : undefined;
    void loadWithRetry(() => apiClient.post('/auth/set-password/check', { token, purpose }, { retryOn401: false }))
      .catch((error: unknown) => {
        const found = describeSetPasswordFailure(error);
        if (live && found.kind === 'link') setProblem(found); // other failures: let the person try Save
      });
    return () => { live = false; };
  }, [token, isInvite]);

  const strength = passwordStrength(watch('password'));
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
      if (error instanceof ApiError && error.status === 422 && error.fields?.password) {
        setFormError(t('setPassword.errors.weak'));
        return;
      }
      const found = describeSetPasswordFailure(error);
      if (found.kind === 'link') setProblem(found);
      else if (error instanceof ApiError && error.status === 429) setFormError(t('login.errors.rateLimited'));
      else setFormError(`${found.lines[0] ?? t('setPassword.errors.failed')} (${found.ref})`);
    }
  };

  return (
    <main className={styles.screen}>
      <Helmet>
        <title>{`${t('setPassword.title')} | Bloomwell Home Care Uganda Admin`}</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      {done ? (
        <div className={styles.card}>
          <h1 className={styles.title}>{t('setPassword.title')}</h1>
          <p role="status">{t('setPassword.done')}</p>
          <Link to="/login">{t('setPassword.toLogin')}</Link>
        </div>
      ) : problem ? (
        <div className={styles.card}>
          <h1 className={styles.title}>{problem.title}</h1>
          {problem.lines.map((line, index) => (
            <p key={line} role={index === 0 ? 'alert' : undefined} className={index === 0 ? styles.error : undefined}>
              {line}
            </p>
          ))}
          <p>Reference: {problem.ref}</p>
          {problem.signIn && <Link to="/login">{t('setPassword.toLogin')}</Link>}
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
          {fromTemp && <p role="status">{t('setPassword.tempAccepted')}</p>}
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
          {strength !== 'empty' && (
            <p className={styles.strength} data-level={strength} aria-live="polite">
              {t(`setPassword.strength.${strength}`)}
            </p>
          )}
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
