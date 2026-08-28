'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button, Field, Input } from '@/components/ui/primitives';
import type { FormState } from '@/app/auth-actions';

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" full disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function AuthForm({
  action,
  fields,
  submitLabel,
  pendingLabel,
  hidden,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  fields: Array<{
    name: string;
    label: string;
    type: string;
    autoComplete?: string;
    hint?: string;
    required?: boolean;
    placeholder?: string;
  }>;
  submitLabel: string;
  pendingLabel: string;
  hidden?: Record<string, string>;
}) {
  const [state, formAction] = useActionState(action, {});

  return (
    <form action={formAction} className="space-y-4">
      {Object.entries(hidden ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}

      {fields.map((field) => (
        <Field key={field.name} label={field.label} hint={field.hint} htmlFor={field.name}>
          <Input
            id={field.name}
            name={field.name}
            type={field.type}
            autoComplete={field.autoComplete}
            required={field.required ?? true}
            placeholder={field.placeholder}
          />
        </Field>
      ))}

      {state.error ? (
        <p role="alert" className="rounded-lg bg-negative-soft px-3 py-2 text-[13px] text-negative">
          {state.error}
        </p>
      ) : null}
      {state.notice ? (
        <p role="status" className="rounded-lg bg-accent-soft px-3 py-2 text-[13px] text-accent-ink">
          {state.notice}
        </p>
      ) : null}

      <SubmitButton label={submitLabel} pendingLabel={pendingLabel} />
    </form>
  );
}
