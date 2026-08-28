# Kroner

Personal and business finance tracking for Denmark. It reads your accounts,
normalizes and categorizes every transaction, detects recurring payments,
and answers questions about your money.

**It is read-only by construction.** There is no code path in this application
that can move money, and the AI assistant has no tool that could reach one.

---

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000, create an account, and load demo data during
onboarding — nine months of realistic Danish transactions across a personal
account, a business account and Stripe. No credentials, no database server,
nothing else to configure.

The demo data runs through the identical pipeline as a real bank feed: same
normalization, same duplicate detection, same categorizer, same subscription
detection. What you evaluate in demo mode is the product.

```bash
npm test           # 143 tests
npm run typecheck
npm run build
npm run db:seed -- you@example.com 'a-long-enough-passphrase'
```

---

## What it never stores

Card numbers · CVV codes · MitID credentials · NemID credentials · bank
passwords · bank usernames · CPR numbers · full IBANs.

No screen asks for any of these and no database column can hold them. Free text
you type is scanned on the way in, and anything resembling a card number or a
credential is rejected rather than stored.

Bank access uses European Open Banking (PSD2). You authorize at your own bank,
in your bank's own flow. Kroner receives a read-only data token — never a
credential — and that token is encrypted with AES-256-GCM before it is written
down, using a key that lives outside the database.

---

## Architecture

```
app/            Screens and route handlers (Next.js App Router)
components/     UI primitives, charts, shared views
lib/            Money, dates, merchant normalization, auth helpers
services/       Transactions, accounts, subscriptions, analytics, forecast,
                insights, sync, users, token vault
integrations/   Provider implementations behind a common interface
  banking/      GoCardless Bank Account Data (Open Banking)
  stripe/       Stripe, read-only
  paypal/       Architecture in place, credentials not wired
  mobilepay/    Architecture in place, credentials not wired
  demo/         Deterministic demo data generator
ai/             Assistant, its read-only tool surface, deterministic fallback
database/       Schema, migrations, drivers, RLS
security/       Crypto, passwords, sessions, redaction, rate limits, audit
types/          The internal transaction model
tests/          143 tests
```

### The transaction model

Every provider normalizes into one shape (`types/finance.ts`): amount in
integer minor units, currency, transaction and booking dates, merchant and a
normalized merchant key, category and subcategory, transaction type,
personal/business/mixed, recurring status, tax label, a confidence score, a
dedupe fingerprint, and the (sanitized) provider payload.

**Money is never a float.** Amounts are integer øre from the moment they are
parsed. `lib/money.ts` is the only place that converts.

### Swapping providers

Every integration implements `BankProvider` or `PaymentProvider` from
`integrations/types.ts`. Moving from GoCardless to Tink or TrueLayer means
writing one file and changing one line in `integrations/registry.ts`. Nothing
in the dashboard, the analytics or the assistant knows which provider the data
came from.

### Duplicate prevention

Two independent defences:

1. `UNIQUE (user_id, provider, transaction_id)` — re-running a sync is a no-op.
2. A content fingerprint over amount, currency, date and merchant key — this
   catches the same real payment arriving from two providers (the bank feed and
   Stripe both reporting one charge), and a pending entry re-issued under a new
   id once it books.

The fingerprint is scoped so it does not collapse things that only look alike:
the two legs of a transfer between your own accounts have opposite signs, and a
genuine repeat purchase from the same provider carries a different provider id.

### Categorization

Four tiers, cheapest and most certain first:

1. **Your corrections.** Always win. Correcting `OPENAI` to Software creates a
   rule that catches every future OpenAI charge, including ones the bank
   describes differently (`OPENAI *CHATGPT SUBSCR` and `OPENAI` match the same
   rule).
2. **Structural facts.** What the transaction *is* beats what the merchant is
   called — a Stripe fee is a fee, a payout is a transfer.
3. **Curated merchants.** ~140 Danish and international merchants.
4. **AI**, for what is left, sending only merchant, description and amount.

Most transactions never reach a model at all.

### Search

The search box takes sentences. "business expenses over 1000 kr" becomes an
ownership filter, a direction and an amount floor; whatever is left over is
searched as text, so a phrase never silently matches nothing because part of it
was a qualifier rather than a merchant name. Everything it sets lands in the
URL, so a filtered view is shareable and survives a reload.

### Subscription detection

Statistical, not a name lookup. A merchant's charge dates are grouped, the
median gap matched against known cadences (weekly through annual) with a
per-cadence tolerance, and the amounts checked for stability. Three charges
minimum. A sustained step in the amount is reported as a price change; a
one-off spike is not.

### The AI assistant

The division of labour is strict and structural:

- **The model** understands the question, picks a tool, and phrases the answer.
- **The backend** computes every number, in SQL, from your own data.

The model is never shown a pile of transactions and asked to total them. Its
entire capability surface is a fixed list of read-only queries in
`ai/tools.ts`; the dispatcher rejects any name not on that list before a query
is built. Every tool name begins with `get_`, `list_` or `compare_`, and a test
asserts that the AI layer does not so much as import a function that can write.

Without an `ANTHROPIC_API_KEY` the assistant still answers, routing questions
through a rule-based intent parser to the same tools. The numbers are identical.

### Data isolation

Row-level security on every table, with requests running as an unprivileged
`kroner_app` role that cannot bypass it. A query that forgets its
`WHERE user_id` clause returns nothing rather than someone else's transactions.
Tests assert this by asking, as one user, for another user's rows — and getting
none.

---

## Database

Set `DATABASE_URL` for PostgreSQL (Supabase, RDS, Neon). Leave it unset and
Kroner runs an embedded Postgres under `.data/` — genuinely Postgres, so the
same migrations, the same SQL, and the same RLS policies apply. That is what
makes zero-config local development possible without a second code path.

Migrations in `database/migrations/` run automatically on first request, or
explicitly with `npm run db:migrate`.

The embedded database holds a lock on its data directory: PGlite is
single-process, and a second process opening the same directory would
otherwise abort with an unexplained WASM error much later. Starting a second
instance now fails immediately, saying so and pointing at `DATABASE_URL`.

---

## Configuration

See `.env.example`. Nothing is required to run in demo mode. For production:

| Variable | Purpose |
|---|---|
| `TOKEN_ENCRYPTION_KEY` | Encrypts provider tokens at rest. Required before any real provider can be connected. |
| `DATABASE_URL` | PostgreSQL. Falls back to embedded Postgres. |
| `APP_URL` | Public origin, for the bank authorization redirect. |
| `ANTHROPIC_API_KEY` | Natural-language questions. Optional. |
| `GOCARDLESS_SECRET_ID` / `_KEY` | Open Banking for Danish banks. Optional. |
| `STRIPE_API_KEY` | Fallback Stripe key; per-user keys are added in the UI. |

Password reset links are written to the server log — wire an email provider in
`app/auth-actions.ts` before production.

---

## Deliberate limits

- **It is not an accountant.** You can label transactions deductible,
  potentially deductible, not deductible or needing review, and export them as
  CSV. Kroner applies no Danish tax rules and never presents a figure as profit
  after tax. Gross profit means revenue minus recorded costs, and says so.
- **Forecasts are estimates**, labelled as such, built from observed patterns:
  recurring income, known subscriptions, and the recent burn rate.
- **Balances are not converted across currencies.** Accounts in another
  currency are excluded from totals and the exclusion is stated, because
  inventing an FX rate produces a confidently wrong number.
- **Disconnecting keeps your history.** A provider outage or an expired consent
  must never delete data you already have.
- **Authentication is email and password**, with scrypt hashing and opaque
  server-side sessions. Supabase Auth or Clerk can be dropped in behind
  `lib/auth.ts`; passkeys are a natural next step.
- **The rate limiter is in-process.** Fine for one instance; move it to Redis
  before running several.
- **Bookkeeping export is CSV.** Connectors for Dinero, Billy and e-conomic are
  declared in `integrations/bookkeeping/` with the endpoints documented, but
  posting entries automatically needs a mapping from Kroner's categories onto a
  specific business's chart of accounts. Until that exists, CSV is the
  supported path — a wrong automated posting is worse than a manual one.
