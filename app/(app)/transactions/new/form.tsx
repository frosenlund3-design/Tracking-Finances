'use client';

import { useState, useTransition } from 'react';
import { Button, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { BUSINESS_CATEGORIES, PERSONAL_CATEGORIES } from '@/lib/categories';
import { cn } from '@/lib/cn';
import { createManualTransactionAction } from '../actions';
import type { FinancialAccount } from '@/types/finance';

/** Presets that cover the things people actually add by hand. */
const PRESETS = [
  { label: 'Cash expense', kind: 'expense', category: 'miscellaneous', ownership: 'personal' },
  { label: 'Cash income', kind: 'income', category: 'salary', ownership: 'personal' },
  { label: 'Invoice paid', kind: 'income', category: 'business_revenue', ownership: 'business' },
  { label: 'Business cost', kind: 'expense', category: 'business_other', ownership: 'business' },
  { label: 'Subscription', kind: 'expense', category: 'entertainment', ownership: 'personal' },
  { label: 'Debt repayment', kind: 'expense', category: 'transfers', ownership: 'personal' },
] as const;

export function ManualTransactionForm({
  accounts,
  currency,
}: {
  accounts: FinancialAccount[];
  currency: string;
}) {
  const [preset, setPreset] = useState<(typeof PRESETS)[number]>(PRESETS[0]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createManualTransactionAction(formData);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <form action={submit} className="space-y-4">
      <fieldset>
        <legend className="mb-2 text-[13px] font-medium text-ink-muted">What is it?</legend>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setPreset(p)}
              aria-pressed={preset.label === p.label}
              className={cn(
                'rounded-full border px-3 py-1.5 text-[13px] transition-colors',
                preset.label === p.label
                  ? 'border-accent bg-accent-soft text-accent-ink'
                  : 'border-border bg-surface text-ink-muted hover:text-ink',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </fieldset>

      <input type="hidden" name="kind" value={preset.kind} />

      <div className="grid grid-cols-2 gap-3">
        <Field label={`Amount (${currency})`} htmlFor="amount">
          <Input
            id="amount"
            name="amount"
            type="text"
            inputMode="decimal"
            required
            placeholder="0,00"
            autoComplete="off"
          />
        </Field>
        <Field label="Date" htmlFor="transactionDate">
          <Input
            id="transactionDate"
            name="transactionDate"
            type="date"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
            max={new Date().toISOString().slice(0, 10)}
          />
        </Field>
      </div>

      <Field label={preset.kind === 'income' ? 'From whom' : 'To whom'} htmlFor="merchant">
        <Input id="merchant" name="merchant" required maxLength={120} placeholder="Name" />
      </Field>

      <Field label="Account" htmlFor="accountId">
        <Select id="accountId" name="accountId" required defaultValue={accounts[0]?.id}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Category" htmlFor="category">
          <Select id="category" name="category" key={preset.label} defaultValue={preset.category}>
            <optgroup label="Personal">
              {PERSONAL_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Business">
              {BUSINESS_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </optgroup>
          </Select>
        </Field>
        <Field label="Type" htmlFor="ownership">
          <Select id="ownership" name="ownership" key={`${preset.label}-own`} defaultValue={preset.ownership}>
            <option value="personal">Personal</option>
            <option value="business">Business</option>
            <option value="mixed">Mixed</option>
          </Select>
        </Field>
      </div>

      <Field label="Description" htmlFor="description" hint="Optional.">
        <Input id="description" name="description" maxLength={300} placeholder="What was it for?" />
      </Field>

      <Field label="Note" htmlFor="notes" hint="Never enter card numbers or credentials.">
        <Textarea id="notes" name="notes" rows={2} maxLength={1000} />
      </Field>

      {error ? (
        <p role="alert" className="rounded-lg bg-negative-soft px-3 py-2 text-[13px] text-negative">
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" full disabled={pending}>
        {pending ? 'Adding…' : 'Add transaction'}
      </Button>
    </form>
  );
}
