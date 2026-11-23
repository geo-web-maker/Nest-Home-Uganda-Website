import { useEffect, useState } from 'react';
import { Button } from '@shared/components/ui/Button';
import { apiClient } from '@shared/lib/api/client';
import { useAuth } from './auth/useAuth';
import { hasScopes } from './auth/hasScopes';
import './care/nurses/nurse-detail.css';
import './ProfilePage.css';
import { LoadingNote } from '../../components/admin/LoadingNote';

/** Shared account identity and app switching for staff with both app scopes. */
export function ProfilePage() {
  const { user } = useAuth();
  const canSwitchToNurse = hasScopes(user, ['field:use']);
  const [nurseUrl, setNurseUrl] = useState('');
  const [loading, setLoading] = useState(canSwitchToNurse);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!canSwitchToNurse) return;
    let live = true;
    void apiClient.get<{ url: string }>('/admin/care/switch-app')
      .then((result) => { if (live) setNurseUrl(result.url); })
      .catch((reason) => { if (live) setError(reason instanceof Error ? reason.message : 'The nurse app link could not be loaded.'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [canSwitchToNurse]);

  return <section className="admin-page admin-profile" aria-labelledby="profile-title">
    <header className="page-header"><div><p className="eyebrow">Account</p><h1 id="profile-title">My profile</h1><p>Identity and application access for this staff account.</p></div></header>
    <article className="care-form">
      <h2>Account details</h2>
      <dl className="nurse-facts">
        <div><dt>Name</dt><dd>{user?.name || 'Not available'}</dd></div>
        <div><dt>Email</dt><dd>{user?.email || 'Not available'}</dd></div>
        <div><dt>Account role</dt><dd>{user?.is_superadmin ? 'Super administrator' : 'Staff account'}</dd></div>
      </dl>
      <p>This view is read-only. Email or identity changes must use the verified account administration process; no unverified email-change action is exposed here.</p>
    </article>
    {canSwitchToNurse && <article className="care-form">
      <h2>Nurse application</h2>
      <p>This account has nurse-app access as well as admin access. Switching opens the nurse application; it does not create a second account.</p>
      {loading ? <LoadingNote>Loading nurse app link…</LoadingNote> : error ? <p role="alert">{error}</p> : nurseUrl ? <Button type="button" onClick={() => window.location.assign(nurseUrl)}>Open nurse app</Button> : <p>The nurse app URL is not configured for this deployment.</p>}
    </article>}
    <article className="care-form"><h2>Permissions</h2><ul>{(user?.scopes ?? []).map((scope) => <li key={scope}><code>{scope}</code></li>)}</ul></article>
  </section>;
}
