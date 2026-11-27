import type { Dispatch, FormEvent, SetStateAction } from 'react';
import { ButtonGroup } from '@shared/components/dialogs/ButtonGroup';
import { Button } from '@shared/components/ui/Button';
import { Checkbox } from '@shared/components/ui/Checkbox';
import { Field } from '@shared/components/ui/Field';
import { FilterBar } from '../../../components/admin/FilterBar';
import type { Delivery, ScopeInfo, UserInvite } from './types';
import {
  DELIVERIES,
  toggleDelivery,
  type InviteKind,
  type InviteReach,
  type Translate,
} from './userManagementShared';
import styles from './UsersPage.module.css';

export function UserInvitePanel({
  t,
  name,
  setName,
  email,
  setEmail,
  phone,
  setPhone,
  delivery,
  setDelivery,
  chosen,
  setChosen,
  inviteKind,
  setInviteKind,
  inviteReach,
  setInviteReach,
  invitePreset,
  setInvitePreset,
  scopeRows,
  isSuperAdmin,
  isPending,
  errorText,
  applyPreset,
  matchesInvitePreset,
  onSubmit,
  onCancel,
}: {
  t: Translate;
  name: string;
  setName: Dispatch<SetStateAction<string>>;
  email: string;
  setEmail: Dispatch<SetStateAction<string>>;
  phone: string;
  setPhone: Dispatch<SetStateAction<string>>;
  delivery: Delivery[];
  setDelivery: Dispatch<SetStateAction<Delivery[]>>;
  chosen: string[];
  setChosen: Dispatch<SetStateAction<string[]>>;
  inviteKind: InviteKind;
  setInviteKind: Dispatch<SetStateAction<InviteKind>>;
  inviteReach: InviteReach;
  setInviteReach: Dispatch<SetStateAction<InviteReach>>;
  invitePreset: string;
  setInvitePreset: Dispatch<SetStateAction<string>>;
  scopeRows: ScopeInfo[];
  isSuperAdmin: boolean;
  isPending: boolean;
  errorText: string | null;
  applyPreset: (preset: string) => string[];
  matchesInvitePreset: (chosenScopes: string[], preset: string) => boolean;
  onSubmit: (body: UserInvite) => void;
  onCancel: () => void;
}) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const presetMatches = matchesInvitePreset(chosen, invitePreset);
    onSubmit({
      name: name.trim(),
      email: email.trim(),
      scopes: presetMatches ? [] : chosen,
      ...(presetMatches ? { preset: invitePreset as NonNullable<UserInvite['preset']> } : {}),
      kind: inviteKind,
      reach: inviteReach,
      delivery,
      ...(phone.trim() ? { phone: phone.trim() } : {}),
    });
  };

  const applySelectedPreset = () => {
    setChosen(applyPreset(invitePreset));
    if (invitePreset === 'staff') return;
    setInviteKind(invitePreset === 'super_admin' ? 'admin' : (invitePreset as InviteKind));
    setInviteReach(
      invitePreset === 'nurse' ? 'own' : invitePreset === 'supervisor' ? 'team' : 'all',
    );
  };

  return (
    <section className={styles.editor}>
      <h2>{t('users.inviteHeading')}</h2>
      <form className={styles.form} onSubmit={submit}>
        <Field
          label={t('users.name')}
          required
          requiredLabel={t('common.required')}
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={100}
        />
        <Field
          label={t('users.email')}
          type="email"
          required
          requiredLabel={t('common.required')}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Field
          label={t('users.phone')}
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          maxLength={32}
          autoComplete="off"
        />
        <fieldset className={styles.fullRow}>
          <legend>{t('users.deliveryLegend')}</legend>
          {DELIVERIES.map((channel) => (
            <Checkbox
              key={channel}
              label={t(`users.delivery.${channel}`)}
              checked={delivery.includes(channel)}
              onChange={(event) =>
                setDelivery((old) => toggleDelivery(old, channel, event.target.checked))
              }
            />
          ))}
        </fieldset>
        <Field
          kind="select"
          label="Account type"
          value={inviteKind}
          onChange={(event) => setInviteKind(event.target.value as InviteKind)}
        >
          <option value="staff">Staff</option>
          <option value="nurse">Nurse</option>
          <option value="supervisor">Supervisor</option>
          <option value="admin">Admin</option>
          <option value="executive">Executive</option>
          <option value="lawyer">Lawyer</option>
        </Field>
        <Field
          kind="select"
          label="Data reach"
          value={inviteReach}
          onChange={(event) => setInviteReach(event.target.value as InviteReach)}
        >
          <option value="own">Own</option>
          <option value="team">Team</option>
          <option value="all">All</option>
        </Field>
        <FilterBar
          label="Access preset"
          className={styles.fullRow}
          actions={
            <Button type="button" variant="outline" onClick={applySelectedPreset}>
              Apply preset
            </Button>
          }
        >
          <Field
            kind="select"
            label="Access preset"
            value={invitePreset}
            onChange={(event) => setInvitePreset(event.target.value)}
          >
            <option value="nurse">Nurse</option>
            <option value="supervisor">Supervisor</option>
            <option value="admin">Admin</option>
            <option value="executive">Executive</option>
            <option value="lawyer">Lawyer</option>
            {isSuperAdmin && <option value="super_admin">Super admin</option>}
          </Field>
        </FilterBar>
        <fieldset className={styles.scopeFieldset}>
          <legend>{t('users.grantScopes')}</legend>
          {Object.entries(
            scopeRows.reduce<Record<string, ScopeInfo[]>>((groups, scope) => {
              (groups[scope.group] ??= []).push(scope);
              return groups;
            }, {}),
          ).map(([group, groupScopes]) => (
            <div key={group} className={styles.scopeGroup}>
              <h3>{group}</h3>
              {groupScopes.map((scope) => (
                <Checkbox
                  key={scope.id}
                  label={scope.label || scope.id}
                  checked={chosen.includes(scope.id)}
                  disabled={
                    (scope.id === 'system:manage' || scope.id === 'carecfg:write') && !isSuperAdmin
                  }
                  onChange={(event) =>
                    setChosen((old) =>
                      event.target.checked
                        ? [...old, scope.id]
                        : old.filter((id) => id !== scope.id),
                    )
                  }
                />
              ))}
            </div>
          ))}
        </fieldset>
        {delivery.length === 0 && <p role="alert">{t('users.deliveryNone')}</p>}
        {errorText && (
          <p role="alert" ref={(element) => element?.scrollIntoView({ block: 'center' })}>
            {errorText}
          </p>
        )}
        <ButtonGroup className={styles.fullRow}>
          <Button
            type="submit"
            disabled={
              isPending ||
              !name.trim() ||
              !email.trim() ||
              delivery.length === 0 ||
              (delivery.includes('sms') && !phone.trim())
            }
          >
            {t('users.sendInvite')}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        </ButtonGroup>
      </form>
    </section>
  );
}
