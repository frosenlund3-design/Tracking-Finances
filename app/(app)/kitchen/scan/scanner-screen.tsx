'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useBarcodeScanner } from '@/components/play/scanner';
import { useCelebrate } from '@/components/play/celebrate';
import { Button, Input, Select } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import { addItemAction, lookupBarcodeAction } from '../actions';

interface GroupOption {
  key: string;
  label: string;
  glyph: string;
}

interface Draft {
  barcode: string | null;
  name: string;
  group: string;
  location: 'fridge' | 'freezer' | 'pantry';
  expiresOn: string;
  quantity: number;
  /** Set when a lookup recognised the code. */
  found: boolean;
}

/**
 * Scan, confirm, done.
 *
 * The form is always pre-filled — with the product when a database knew it,
 * and with a shelf-life guess when nobody did — because the difference
 * between an app people use and one they abandon is whether adding a carton of
 * milk takes one tap or seven.
 *
 * A camera that will not start is never a dead end: the manual field is on the
 * same screen, always, not behind a link.
 */
export function ScannerScreen({
  groups,
  demoBarcodes,
  today,
}: {
  groups: GroupOption[];
  demoBarcodes: Array<{ barcode: string; name: string }>;
  today: string;
}) {
  const router = useRouter();
  const celebrate = useCelebrate();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState('');
  const [added, setAdded] = useState<string[]>([]);
  const lastCode = useRef<string | null>(null);

  const handle = useCallback(
    async (barcode: string) => {
      // A camera fires the same code many times a second. Only the first
      // matters, until the person scans something else.
      if (lastCode.current === barcode || busy) return;
      lastCode.current = barcode;
      setBusy(true);
      setError(null);

      const result = await lookupBarcodeAction(barcode);
      setBusy(false);

      if (result.error) {
        setError(result.error);
        lastCode.current = null;
        return;
      }
      if (navigator.vibrate) navigator.vibrate(18);

      setDraft({
        barcode,
        name: result.name ?? '',
        group: result.group ?? 'other',
        location: 'fridge',
        expiresOn: result.suggestedExpiry ?? today,
        quantity: 1,
        found: Boolean(result.name),
      });
    },
    [busy, today],
  );

  const { videoRef, state, error: cameraError, start, stop } = useBarcodeScanner(handle);

  // The camera has nothing to do while the confirm sheet is up.
  useEffect(() => {
    if (draft) stop();
  }, [draft, stop]);

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    const result = await addItemAction({
      name: draft.name,
      barcode: draft.barcode,
      group: draft.group,
      location: draft.location,
      expiresOn: draft.expiresOn || null,
      quantity: draft.quantity,
    });
    setBusy(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    celebrate({
      xp: result.reward?.xp,
      levelUp: result.reward?.levelUp,
      unlocked: result.reward?.unlocked,
      message: result.firstEver ? 'First time anyone has scanned that' : undefined,
    });
    setAdded((list) => [result.added!.name, ...list]);
    setDraft(null);
    lastCode.current = null;
    router.refresh();
  }

  if (draft) {
    return (
      <ConfirmForm
        draft={draft}
        groups={groups}
        busy={busy}
        error={error}
        onChange={setDraft}
        onCancel={() => {
          setDraft(null);
          lastCode.current = null;
        }}
        onSave={save}
      />
    );
  }

  return (
    <div className="rise space-y-4">
      <header>
        <h1 className="text-[26px] font-bold tracking-tight">Scan</h1>
        <p className="mt-0.5 text-[13.5px] text-ink-muted">
          Point at a barcode. Everything else is filled in for you.
        </p>
      </header>

      <div className="relative overflow-hidden rounded-[var(--radius-card)] bg-play-ink aspect-[4/3]">
        <video
          ref={videoRef}
          muted
          playsInline
          className={cn('h-full w-full object-cover', state !== 'scanning' && 'opacity-0')}
        />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-8">
          <div className="h-28 w-full max-w-xs rounded-2xl border-[3px] border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
        </div>

        {state !== 'scanning' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            {state === 'denied' ? (
              <>
                <p className="text-[15px] font-semibold text-white">Camera access was refused</p>
                <p className="max-w-xs text-[13px] leading-relaxed text-white/70">
                  You can turn it back on in your browser settings — or just type the barcode below,
                  which works just as well.
                </p>
              </>
            ) : state === 'unsupported' ? (
              <>
                <p className="text-[15px] font-semibold text-white">
                  No camera available here
                </p>
                <p className="max-w-xs text-[13px] leading-relaxed text-white/70">
                  {cameraError ?? 'Type the barcode below instead.'}
                </p>
              </>
            ) : (
              <>
                <span aria-hidden="true" className="text-[40px]">
                  📷
                </span>
                <Button onClick={() => void start()} disabled={state === 'starting'}>
                  {state === 'starting' ? 'Opening…' : 'Start the camera'}
                </Button>
              </>
            )}
          </div>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="rounded-xl bg-negative-soft px-3.5 py-2.5 text-[13px] text-negative">
          {error}
        </p>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const code = manual.trim();
          if (code) {
            lastCode.current = null;
            void handle(code);
          }
        }}
        className="flex gap-2"
      >
        <Input
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          inputMode="numeric"
          placeholder="Or type the barcode"
          aria-label="Barcode"
          className="flex-1"
        />
        <Button type="submit" variant="secondary" disabled={busy || manual.trim().length < 8}>
          Look up
        </Button>
      </form>

      <button
        type="button"
        onClick={() =>
          setDraft({
            barcode: null,
            name: '',
            group: 'other',
            location: 'fridge',
            expiresOn: today,
            quantity: 1,
            found: false,
          })
        }
        className="pressable w-full rounded-2xl border border-border bg-surface p-3.5 text-left"
      >
        <span className="block text-[14px] font-semibold">No barcode? Add it by name</span>
        <span className="mt-0.5 block text-[12.5px] text-ink-muted">
          Loose veg, leftovers, anything from the bakery.
        </span>
      </button>

      {demoBarcodes.length > 0 ? (
        <div>
          <p className="px-1 text-[12px] font-medium uppercase tracking-wide text-ink-subtle">
            Try one without a camera
          </p>
          <div className="scroll-x mt-2 flex gap-2 overflow-x-auto pb-1">
            {demoBarcodes.map((demo) => (
              <button
                key={demo.barcode}
                type="button"
                onClick={() => {
                  lastCode.current = null;
                  void handle(demo.barcode);
                }}
                className="pressable shrink-0 rounded-full border border-border bg-surface px-3 py-2 text-[13px]"
              >
                {demo.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {added.length > 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-[13px] font-semibold">Added just now</p>
          <ul className="mt-1.5 space-y-0.5 text-[13px] text-ink-muted">
            {added.slice(0, 6).map((name, i) => (
              <li key={`${name}-${i}`}>· {name}</li>
            ))}
          </ul>
          <Link href="/kitchen" className="mt-3 block">
            <Button variant="secondary" full size="sm">
              See the kitchen
            </Button>
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function ConfirmForm({
  draft,
  groups,
  busy,
  error,
  onChange,
  onCancel,
  onSave,
}: {
  draft: Draft;
  groups: GroupOption[];
  busy: boolean;
  error: string | null;
  onChange: (draft: Draft) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const glyph = groups.find((g) => g.key === draft.group)?.glyph ?? '📦';

  return (
    <form
      className="rise space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <header className="text-center">
        <span aria-hidden="true" className="pop-in inline-block text-[48px]">
          {glyph}
        </span>
        <h1 className="mt-1 text-[24px] font-bold tracking-tight">
          {draft.found ? 'Found it' : draft.barcode ? 'Nobody knows that one' : 'Add by name'}
        </h1>
        <p className="mt-0.5 text-[13px] text-ink-muted">
          {draft.found
            ? 'Check the date and you are done.'
            : 'Give it a name and it goes in the kitchen — and into the shared catalogue.'}
        </p>
      </header>

      <div className="space-y-3 rounded-[var(--radius-card)] border border-border bg-surface p-4">
        <label className="block">
          <span className="mb-1 block text-[12.5px] font-medium text-ink-muted">Name</span>
          <Input
            value={draft.name}
            autoFocus={!draft.found}
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
            placeholder="Letmælk"
            required
            maxLength={120}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-[12.5px] font-medium text-ink-muted">Kind</span>
            <Select
              value={draft.group}
              onChange={(e) => onChange({ ...draft, group: e.target.value })}
            >
              {groups.map((group) => (
                <option key={group.key} value={group.key}>
                  {group.glyph} {group.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[12.5px] font-medium text-ink-muted">Where</span>
            <Select
              value={draft.location}
              onChange={(e) => onChange({ ...draft, location: e.target.value as Draft['location'] })}
            >
              <option value="fridge">Fridge</option>
              <option value="freezer">Freezer</option>
              <option value="pantry">Cupboard</option>
            </Select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-[12.5px] font-medium text-ink-muted">Best before</span>
            <Input
              type="date"
              value={draft.expiresOn}
              onChange={(e) => onChange({ ...draft, expiresOn: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12.5px] font-medium text-ink-muted">How many</span>
            <Input
              type="number"
              min={1}
              max={99}
              value={draft.quantity}
              onChange={(e) =>
                onChange({ ...draft, quantity: Math.max(1, Number(e.target.value) || 1) })
              }
            />
          </label>
        </div>

        <p className="text-[12px] leading-relaxed text-ink-subtle">
          The date is a suggestion from how long this kind of thing usually keeps. Change it to
          whatever the packet says — or clear it if there is no date at all.
        </p>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl bg-negative-soft px-3.5 py-2.5 text-[13px] text-negative">
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" full disabled={busy || draft.name.trim().length === 0}>
          {busy ? 'Adding…' : 'Add to kitchen'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
