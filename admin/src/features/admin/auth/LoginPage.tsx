import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { z } from 'zod';
import { LoginMark } from '@shared/components/brand/Logo';
import { Button } from '@shared/components/ui/Button';
import { Field } from '@shared/components/ui/Field';
import { ApiError } from '@shared/lib/api/client';
import styles from './LoginPage.module.css';
import { firstReachablePath } from '../nav';
import { PasswordChangeRequiredError } from './session';
import { useAuth } from './useAuth';

const DEFAULT_LANDING = '/';

type LoginValues = { email: string; password: string };

// Only paths inside the admin are honoured, so a crafted link cannot send a user elsewhere.
// Otherwise the user lands on their first reachable screen.
function landingPath(state: unknown, fallback: string | null): string {
  const from = (state as { from?: unknown } | null)?.from;
  return typeof from === 'string' && from.startsWith('/') && !from.startsWith('//')
    ? from
    : (fallback ?? DEFAULT_LANDING);
}

export function LoginPage() {
  const { t } = useTranslation('admin');
  const { status, user, login } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);

  const schema = z.object({
    email: z
      .string()
      .trim()
      .pipe(z.email(t('login.errors.email'))),
    password: z.string().min(1, t('login.errors.password')),
  });
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  // `register` also returns `required`, `min` and so on, which clash with Field's typed `required`.
  const bind = (name: keyof LoginValues) => {
    const { onChange, onBlur, ref, name: fieldName } = register(name);
    return { onChange, onBlur, ref, name: fieldName };
  };

  const onValid = async ({ email, password }: LoginValues) => {
    setFormError(null);
    try {
      await login(email, password);
    } catch (error) {
      if (error instanceof PasswordChangeRequiredError) {
        // Temporary password accepted: choose a real one before getting in.
        const query = new URLSearchParams({
          token: error.token,
          purpose: error.purpose,
          from: 'temp',
        });
        navigate(`/set-password?${query.toString()}`, { replace: true });
        return;
      }
      if (error instanceof ApiError && error.status === 401) {
        setFormError(t('login.errors.credentials'));
      } else if (error instanceof ApiError && error.status === 429) {
        setFormError(t('login.errors.rateLimited'));
      } else if (error instanceof ApiError && error.status === 403) {
        setFormError(error.message); // the server names the reason, e.g. two-step sign-in not available
      } else {
        setFormError(t('login.errors.failed'));
      }
    }
  };

  if (status === 'loading') return null;
  if (status === 'signedIn')
    return <Navigate to={landingPath(location.state, firstReachablePath(user))} replace />;

  return (
    <main className={styles.screen}>
      <Helmet>
        <title>{`${t('login.title')} | Bloomwell Home Care Uganda Admin`}</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <form
        className={styles.card}
        onSubmit={(event) => void handleSubmit(onValid)(event)}
        noValidate
      >
        <LoginMark />
        <div>
          <h1 className={styles.title}>{t('login.title')}</h1>
          <p className={styles.subtitle}>{t('login.subtitle')}</p>
        </div>
        <Field
          label={t('login.email')}
          type="email"
          autoComplete="email"
          required
          requiredLabel={t('login.required')}
          error={errors.email?.message}
          {...bind('email')}
        />
        <Field
          label={t('login.password')}
          type="password"
          autoComplete="current-password"
          required
          requiredLabel={t('login.required')}
          error={errors.password?.message}
          {...bind('password')}
        />
        {formError && (
          <p className={styles.error} role="alert">
            {formError}
          </p>
        )}
        <Button type="submit" fullWidth arrow disabled={isSubmitting}>
          {isSubmitting ? t('login.submitting') : t('login.submit')}
        </Button>
        <p className={styles.forgot}>
          <span>{t('login.forgot')}</span>
          <small>{t('login.forgotHelp')}</small>
        </p>
      </form>
    </main>
  );
}
