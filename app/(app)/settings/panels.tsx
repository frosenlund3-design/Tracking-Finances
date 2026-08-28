'use client';

import { useState, useTransition } from 'react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Select,
} from '@/components/ui/primitives';
import {
  changePasswordAction,
  deleteAccountAction,
  deleteFinancialDataAction,
  deleteRuleAction,
  recategorizeAction,
  setAccountOwnershipAction,
  signOutEverywhereAction,
  updateProfileAction,
  type SettingsResult,
} from './actions';
import type { FinancialAccount, User } from '@/types/finance';

interface RuleView {
  id: string;
  pattern: string;
  categoryLabel: string;
  ownership: string | null;
}

export function SettingsPanels({
  user,
  accounts,
  rules,
}: {
  user: User;
  accounts: FinancialAccount[];
  rules: RuleView[];
}) {
  const [result, setResult] = useState<SettingsResult | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<SettingsResult>) => {
    setResult(null);
    startTransition(async () => setResult(await fn()));
  };

  return (
    <div className="space-y-4">
      {result?.error ? (
        <p role="alert" className="rounded-lg bg-negative-soft px-3.5 py-2.5 text-[13px] text-negative">
          {result.error}
        </p>
      ) : null}
      {result?.message ? (
        <p role="status" className="rounded-lg bg-positive-soft px-3.5 py-2.5 text-[13px] text-positive">
          {result.message}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardBody className="pt-0">
          <form
            className="space-y-3"
            action={(fd) => run(() => updateProfileAction(fd))}
          >
            <Field label="Name" htmlFor="displayName">
              <Input id="displayName" name="displayName" defaultValue={user.displayName ?? ''} maxLength={80} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tracking" htmlFor="trackingMode">
                <Select id="trackingMode" name="trackingMode" defaultValue={user.trackingMode}>
                  <option value="personal">Personal only</option>
                  <option value="business">Business only</option>
                  <option value="both">Both</option>
                </Select>
              </Field>
              <Field label="Currency" htmlFor="baseCurrency" hint="Used for totals.">
                <Select id="baseCurrency" name="baseCurrency" defaultValue={user.baseCurrency}>
                  {['DKK', 'EUR', 'SEK', 'NOK', 'GBP', 'USD'].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Button type="submit" size="sm" disabled={pending}>
              Save profile
            </Button>
          </form>
        </CardBody>
      </Card>

      {accounts.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Accounts</CardTitle>
          </CardHeader>
          <CardBody className="pt-0">
            <ul className="divide-y divide-border">
              {accounts.map((account) => (
                <li key={account.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium">
                      {account.name}
                      {!account.isActive ? <Badge className="ml-2">Disconnected</Badge> : null}
                    </p>
                    <p className="text-[12px] text-ink-subtle">
                      {account.institution ?? account.provider}
                      {account.maskedReference ? ` · ${account.maskedReference}` : ''}
                    </p>
                  </div>
                  <form action={(fd) => run(() => setAccountOwnershipAction(fd))}>
                    <input type="hidden" name="accountId" value={account.id} />
                    <Select
                      name="ownership"
                      defaultValue={account.ownership}
                      onChange={(e) => e.currentTarget.form?.requestSubmit()}
                      aria-label={`Type for ${account.name}`}
                      className="h-9 w-36 text-[13px]"
                    >
                      <option value="personal">Personal</option>
                      <option value="business">Business</option>
                      <option value="mixed">Mixed</option>
                    </Select>
                  </form>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Categorization rules</CardTitle>
        </CardHeader>
        <CardBody className="pt-0">
          <p className="text-[13px] leading-relaxed text-ink-muted">
            Every category you correct becomes a rule. New transactions from that merchant follow it
            automatically.
          </p>

          {rules.length > 0 ? (
            <ul className="mt-3 divide-y divide-border">
              {rules.map((rule) => (
                <li key={rule.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium">{rule.pattern}</p>
                    <p className="text-[12px] text-ink-subtle">
                      → {rule.categoryLabel}
                      {rule.ownership ? ` · ${rule.ownership}` : ''}
                    </p>
                  </div>
                  <form action={(fd) => run(() => deleteRuleAction(fd))}>
                    <input type="hidden" name="ruleId" value={rule.id} />
                    <Button type="submit" variant="ghost" size="sm" disabled={pending}>
                      Remove
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-[13px] text-ink-subtle">
              No rules yet. Change a transaction’s category and one appears here.
            </p>
          )}

          <Button
            className="mt-3"
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => run(recategorizeAction)}
          >
            {pending ? 'Working…' : 'Re-run categorization'}
          </Button>
          <p className="mt-2 text-[12px] text-ink-subtle">
            Applies your rules to everything you have not confirmed by hand.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
        </CardHeader>
        <CardBody className="pt-0">
          <form className="space-y-3" action={(fd) => run(() => changePasswordAction(fd))}>
            <Field label="Current password" htmlFor="currentPassword">
              <Input
                id="currentPassword"
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
              />
            </Field>
            <Field label="New password" htmlFor="newPassword" hint="At least 12 characters.">
              <Input
                id="newPassword"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                required
              />
            </Field>
            <Button type="submit" size="sm" disabled={pending}>
              Change password
            </Button>
          </form>

          <form action={signOutEverywhereAction} className="mt-4 border-t border-border pt-4">
            <Button type="submit" variant="secondary" size="sm">
              Sign out of all devices
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card className="border-negative/25">
        <CardHeader>
          <CardTitle>Delete data</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4 pt-0">
          <DangerForm
            title="Delete all financial data"
            body="Removes every transaction, account, connection, subscription, rule and stored provider token. Your login survives."
            phrase="delete my data"
            buttonLabel="Delete financial data"
            pending={pending}
            onSubmit={(fd) => run(() => deleteFinancialDataAction(fd))}
          />
          <div className="border-t border-border pt-4">
            <DangerForm
              title="Delete my account"
              body="Removes the account and everything attached to it. This cannot be undone."
              phrase="delete my account"
              buttonLabel="Delete account"
              pending={pending}
              onSubmit={(fd) => run(() => deleteAccountAction(fd))}
            />
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function DangerForm({
  title,
  body,
  phrase,
  buttonLabel,
  pending,
  onSubmit,
}: {
  title: string;
  body: string;
  phrase: string;
  buttonLabel: string;
  pending: boolean;
  onSubmit: (formData: FormData) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <p className="text-[14px] font-medium">{title}</p>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{body}</p>
      {open ? (
        <form action={onSubmit} className="mt-3 space-y-2.5">
          <Field label={`Type “${phrase}” to confirm`} htmlFor={`confirm-${phrase}`}>
            <Input id={`confirm-${phrase}`} name="confirm" autoComplete="off" required />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" variant="danger" size="sm" disabled={pending}>
              {pending ? 'Deleting…' : buttonLabel}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <Button className="mt-3" variant="secondary" size="sm" onClick={() => setOpen(true)}>
          {buttonLabel}
        </Button>
      )}
    </div>
  );
}
