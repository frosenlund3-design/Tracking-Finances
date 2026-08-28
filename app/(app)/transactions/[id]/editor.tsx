'use client';

import { useState, useTransition } from 'react';
import { Button, Field, Select, Textarea } from '@/components/ui/primitives';
import { BUSINESS_CATEGORIES, PERSONAL_CATEGORIES } from '@/lib/categories';
import { updateTransactionAction } from '../actions';
import type { Transaction } from '@/types/finance';

const TAX_OPTIONS: Array<[string, string]> = [
  ['needs_review', 'Needs review'],
  ['deductible', 'Deductible'],
  ['potentially_deductible', 'Potentially deductible'],
  ['non_deductible', 'Not deductible'],
];

export function TransactionEditor({ transaction }: { transaction: Transaction }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ error?: string; message?: string } | null>(null);
  const [category, setCategory] = useState(transaction.category);

  const categoryChanged = category !== transaction.category;

  function submit(formData: FormData) {
    setResult(null);
    startTransition(async () => {
      setResult(await updateTransactionAction(formData));
    });
  }

  return (
    <form action={submit} className="space-y-4">
      <input type="hidden" name="id" value={transaction.id} />

      <Field label="Category" htmlFor="category">
        <Select
          id="category"
          name="category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
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

      {categoryChanged ? (
        <label className="flex items-start gap-2.5 rounded-lg bg-accent-soft p-3 text-[13px] text-accent-ink">
          <input
            type="checkbox"
            name="applyToPast"
            defaultChecked
            className="mt-0.5 h-4 w-4 shrink-0 rounded accent-[var(--color-accent)]"
          />
          <span>
            Also apply to past transactions from{' '}
            <strong className="font-medium">{transaction.merchant ?? 'this merchant'}</strong>.
            Future ones follow the new category either way.
          </span>
        </label>
      ) : null}

      <Field label="Personal or business" htmlFor="ownership">
        <Select id="ownership" name="ownership" defaultValue={transaction.ownership}>
          <option value="personal">Personal</option>
          <option value="business">Business</option>
          <option value="mixed">Mixed</option>
        </Select>
      </Field>

      <Field
        label="Bookkeeping"
        htmlFor="taxRelevant"
        hint="Your own label for later. Kroner gives no tax advice — confirm deductibility with an accountant."
      >
        <Select id="taxRelevant" name="taxRelevant" defaultValue={transaction.taxRelevant}>
          {TAX_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Note" htmlFor="notes" hint="Never enter card numbers or credentials.">
        <Textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={transaction.notes ?? ''}
          placeholder="What was this for?"
        />
      </Field>

      {result?.error ? (
        <p role="alert" className="rounded-lg bg-negative-soft px-3 py-2 text-[13px] text-negative">
          {result.error}
        </p>
      ) : null}
      {result?.message ? (
        <p role="status" className="rounded-lg bg-positive-soft px-3 py-2 text-[13px] text-positive">
          {result.message}
        </p>
      ) : null}

      <Button type="submit" full disabled={pending}>
        {pending ? 'Saving…' : 'Save changes'}
      </Button>
    </form>
  );
}
