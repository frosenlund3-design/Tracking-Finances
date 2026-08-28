import type { NormalizedAccount, NormalizedTransaction } from '@/integrations/types';
import { toMinor } from '@/lib/money';
import { addDays, addMonths } from '@/lib/normalize';

/**
 * Deterministic, realistic Danish financial history.
 *
 * Seeded so the same user always sees the same numbers — a demo that reshuffles
 * on every reload is impossible to reason about, and impossible to test.
 */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const DEMO_ACCOUNTS: NormalizedAccount[] = [
  {
    providerAccountId: 'demo-checking',
    name: 'Everyday account',
    institution: 'Demo Bank',
    maskedReference: '••4417',
    type: 'checking',
    currency: 'DKK',
    balanceMinor: 0,
    ownership: 'personal',
  },
  {
    providerAccountId: 'demo-savings',
    name: 'Savings',
    institution: 'Demo Bank',
    maskedReference: '••8802',
    type: 'savings',
    currency: 'DKK',
    balanceMinor: toMinor(84_500),
    ownership: 'personal',
  },
  {
    providerAccountId: 'demo-business',
    name: 'Business account',
    institution: 'Demo Bank',
    maskedReference: '••9130',
    type: 'checking',
    currency: 'DKK',
    balanceMinor: 0,
    ownership: 'business',
  },
  {
    providerAccountId: 'demo-stripe',
    name: 'Stripe balance',
    institution: 'Stripe',
    maskedReference: null,
    type: 'payment_processor',
    currency: 'DKK',
    balanceMinor: toMinor(12_480),
    ownership: 'business',
  },
];

interface RecurringSpec {
  merchant: string;
  description: string;
  account: string;
  amount: number;
  /** Day of month the charge lands on. */
  day: number;
  everyMonths?: number;
  ownership?: 'personal' | 'business';
  jitterDays?: number;
  /** Month index (from the start) at which the price changes, and to what. */
  priceChange?: { afterMonths: number; amount: number };
}

const RECURRING: RecurringSpec[] = [
  { merchant: 'Nordisk Design ApS', description: 'Loenoverfoersel', account: 'demo-checking', amount: 38_400, day: 28 },
  { merchant: 'Boligselskabet Vest', description: 'Overfoersel husleje Boligselskabet Vest', account: 'demo-checking', amount: -9_850, day: 1 },
  { merchant: 'Andel Energi', description: 'BS Andel Energi el-regning', account: 'demo-checking', amount: -612, day: 5, jitterDays: 2 },
  { merchant: 'Hofor', description: 'BS Hofor vand og varme', account: 'demo-checking', amount: -448, day: 6 },
  { merchant: 'YouSee', description: 'BS YouSee bredbaand', account: 'demo-checking', amount: -349, day: 8 },
  { merchant: 'CBB Mobil', description: 'Automatisk kortbetaling Mobilabonnement', account: 'demo-checking', amount: -129, day: 12 },
  { merchant: 'Fitness World', description: 'Automatisk kortbetaling Medlemskab', account: 'demo-checking', amount: -279, day: 3 },
  { merchant: 'Tryg Forsikring', description: 'BS Tryg indboforsikring', account: 'demo-checking', amount: -318, day: 15 },

  { merchant: 'Netflix', description: 'Automatisk kortbetaling Netflix.com', account: 'demo-checking', amount: -139, day: 17,
    priceChange: { afterMonths: 7, amount: -159 } },
  { merchant: 'Spotify', description: 'Automatisk kortbetaling Spotify P16D8A', account: 'demo-checking', amount: -119, day: 9 },
  { merchant: 'Storytel', description: 'Automatisk kortbetaling Storytel abonnement', account: 'demo-checking', amount: -139, day: 22 },
  { merchant: 'Viaplay', description: 'Automatisk kortbetaling Viaplay Group', account: 'demo-checking', amount: -169, day: 24 },
  { merchant: 'Rejsekort', description: 'Automatisk kortbetaling Rejsekort automatisk optankning', account: 'demo-checking', amount: -300, day: 11, jitterDays: 4 },

  { merchant: 'OpenAI', description: 'MASTERCARD OPENAI *CHATGPT SUBSCR', account: 'demo-business', amount: -152, day: 14, ownership: 'business' },
  { merchant: 'Anthropic', description: 'MASTERCARD ANTHROPIC CLAUDE', account: 'demo-business', amount: -138, day: 14, ownership: 'business' },
  { merchant: 'GitHub', description: 'MASTERCARD GITHUB INC', account: 'demo-business', amount: -145, day: 2, ownership: 'business' },
  { merchant: 'Vercel', description: 'MASTERCARD VERCEL INC', account: 'demo-business', amount: -137, day: 4, ownership: 'business',
    priceChange: { afterMonths: 8, amount: -274 } },
  { merchant: 'Figma', description: 'MASTERCARD FIGMA MONTHLY', account: 'demo-business', amount: -103, day: 7, ownership: 'business' },
  { merchant: 'Linear', description: 'MASTERCARD LINEAR ORB INC', account: 'demo-business', amount: -110, day: 19, ownership: 'business' },
  { merchant: 'Google Workspace', description: 'MASTERCARD GOOGLE WORKSPACE', account: 'demo-business', amount: -96, day: 21, ownership: 'business' },
  { merchant: 'Adobe', description: 'MASTERCARD ADOBE CREATIVE CLOUD', account: 'demo-business', amount: -329, day: 26, ownership: 'business' },
  { merchant: 'Notion', description: 'MASTERCARD NOTION LABS', account: 'demo-business', amount: -78, day: 13, ownership: 'business' },
  { merchant: 'Amazon Web Services', description: 'MASTERCARD AWS EMEA', account: 'demo-business', amount: -412, day: 3, ownership: 'business', jitterDays: 1 },

  { merchant: 'Nordisk Design ApS', description: 'Loenoverfoersel til ejer', account: 'demo-business', amount: -38_400, day: 27, ownership: 'business' },
  { merchant: 'Regus', description: 'Kontorplads', account: 'demo-business', amount: -2_450, day: 1, ownership: 'business' },
  { merchant: 'Dinero', description: 'Bogfoeringsprogram', account: 'demo-business', amount: -229, day: 10, ownership: 'business' },
  { merchant: 'Skattestyrelsen', description: 'B-skat rate', account: 'demo-business', amount: -6_200, day: 20, ownership: 'business' },

  { merchant: 'JetBrains', description: 'MASTERCARD JETBRAINS ALL PRODUCTS', account: 'demo-business', amount: -2_190, day: 18, everyMonths: 12, ownership: 'business' },
];

interface VariableSpec {
  merchant: string;
  description: string;
  account: string;
  min: number;
  max: number;
  /** Roughly how many times a month. */
  perMonth: number;
  ownership?: 'personal' | 'business';
}

const VARIABLE: VariableSpec[] = [
  { merchant: 'Netto', description: 'VISA/DANKORT NETTO 5412 KBH N', account: 'demo-checking', min: 68, max: 412, perMonth: 9 },
  { merchant: 'Foetex', description: 'VISA/DANKORT FOETEX NOERREBRO', account: 'demo-checking', min: 120, max: 640, perMonth: 4 },
  { merchant: 'Rema 1000', description: 'VISA/DANKORT REMA 1000 DK', account: 'demo-checking', min: 55, max: 380, perMonth: 5 },
  { merchant: 'Nemlig.com', description: 'VISA/DANKORT NEMLIG COM A/S', account: 'demo-checking', min: 480, max: 1_240, perMonth: 1 },
  { merchant: 'Espresso House', description: 'KORTKOEB ESPRESSO HOUSE', account: 'demo-checking', min: 38, max: 79, perMonth: 6 },
  { merchant: 'Joe and the Juice', description: 'VISA/DANKORT JOE AND THE JUICE', account: 'demo-checking', min: 55, max: 98, perMonth: 3 },
  { merchant: 'Wolt', description: 'VISA/DANKORT WOLT DENMARK', account: 'demo-checking', min: 135, max: 380, perMonth: 4 },
  { merchant: 'Sunset Boulevard', description: 'VISA/DANKORT SUNSET BOULEVARD', account: 'demo-checking', min: 79, max: 165, perMonth: 2 },
  { merchant: 'Restaurant Koedbyen', description: 'VISA/DANKORT RESTAURANT KOEDBYEN', account: 'demo-checking', min: 240, max: 720, perMonth: 1 },
  { merchant: 'DSB', description: 'VISA/DANKORT DSB BILLET', account: 'demo-checking', min: 42, max: 320, perMonth: 3 },
  { merchant: 'Dantaxi', description: 'VISA/DANKORT DANTAXI 4X48', account: 'demo-checking', min: 95, max: 285, perMonth: 2 },
  { merchant: 'Matas', description: 'VISA/DANKORT MATAS FISKETORVET', account: 'demo-checking', min: 85, max: 340, perMonth: 1 },
  { merchant: 'Zalando', description: 'VISA/DANKORT ZALANDO SE', account: 'demo-checking', min: 199, max: 1_190, perMonth: 1 },
  { merchant: 'Elgiganten', description: 'VISA/DANKORT ELGIGANTEN A/S', account: 'demo-checking', min: 249, max: 2_400, perMonth: 0.4 },
  { merchant: 'Apotek', description: 'VISA/DANKORT KBH APOTEK', account: 'demo-checking', min: 55, max: 280, perMonth: 1 },
  { merchant: 'Flying Tiger', description: 'VISA/DANKORT FLYING TIGER COPENHAGEN', account: 'demo-checking', min: 30, max: 180, perMonth: 1 },
  { merchant: 'Google Ads', description: 'MASTERCARD GOOGLE ADS 8842', account: 'demo-business', min: 800, max: 4_200, perMonth: 2, ownership: 'business' },
  { merchant: 'Meta Platforms', description: 'MASTERCARD META PLATFORMS ADS', account: 'demo-business', min: 600, max: 3_100, perMonth: 2, ownership: 'business' },
  { merchant: 'Frilans Udvikler ApS', description: 'Faktura konsulent', account: 'demo-business', min: 3_500, max: 12_000, perMonth: 0.7, ownership: 'business' },
  { merchant: 'Kestrel Freelance', description: 'Underleverandoer faktura', account: 'demo-business', min: 4_200, max: 14_500, perMonth: 1.2, ownership: 'business' },
];

/**
 * Peer-to-peer MobilePay. These arrive through the bank feed with the person's
 * name in the description, which is exactly what the MobilePay view reads.
 */
interface MobilePaySpec {
  person: string;
  direction: 'out' | 'in' | 'both';
  min: number;
  max: number;
  perMonth: number;
}

const MOBILEPAY_PEOPLE: MobilePaySpec[] = [
  { person: 'Anders Kjeldsen', direction: 'both', min: 40, max: 480, perMonth: 2.2 },
  { person: 'Sofie Lindberg', direction: 'both', min: 60, max: 350, perMonth: 1.8 },
  { person: 'Mikkel Thorup', direction: 'out', min: 50, max: 260, perMonth: 1.2 },
  { person: 'Emma Dalgaard', direction: 'in', min: 75, max: 420, perMonth: 1.1 },
  { person: 'Cafe Hjoerne', direction: 'out', min: 45, max: 190, perMonth: 1.6 },
  { person: 'Jonas Vestergaard', direction: 'both', min: 100, max: 900, perMonth: 0.8 },
];

const STRIPE_CUSTOMERS = [
  'Bjerre Consulting', 'Studio Nord', 'Hansen og Co', 'Vestergaard Media',
  'Koebenhavn Kaffe', 'Aarhus Labs', 'Lykke Studio', 'Fjord Analytics',
  'Nordlys Agency', 'Bregnholt IVS',
];

export interface DemoDataset {
  accounts: NormalizedAccount[];
  transactions: NormalizedTransaction[];
}

/**
 * Builds `months` of history ending today.
 * Every amount is derived from the seed, so the dataset is reproducible.
 */
export function generateDemoData(seedKey: string, months = 9, now: Date = new Date()): DemoDataset {
  const rand = mulberry32(hashSeed(seedKey));
  const transactions: NormalizedTransaction[] = [];
  const endDate = now.toISOString().slice(0, 10);
  const startDate = addMonths(endDate, -months);
  let counter = 0;

  const nextId = (prefix: string) => `${prefix}_${(counter++).toString(36).padStart(6, '0')}`;
  const between = (min: number, max: number) => min + rand() * (max - min);
  const lastDayOf = (yyyymm: string) => {
    const [year, month] = yyyymm.split('-').map(Number) as [number, number];
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  };

  for (const spec of RECURRING) {
    const every = spec.everyMonths ?? 1;
    for (let m = 0; m <= months; m += every) {
      const monthStart = addMonths(startDate, m);
      const ym = monthStart.slice(0, 7);
      const jitter = spec.jitterDays ? Math.round((rand() - 0.5) * 2 * spec.jitterDays) : 0;
      const day = Math.min(Math.max(1, spec.day + jitter), lastDayOf(ym));
      const date = `${ym}-${String(day).padStart(2, '0')}`;
      if (date < startDate || date > endDate) continue;

      const amount =
        spec.priceChange && m >= spec.priceChange.afterMonths ? spec.priceChange.amount : spec.amount;

      transactions.push({
        transactionId: nextId('rec'),
        providerAccountId: spec.account,
        amountMinor: toMinor(amount),
        currency: 'DKK',
        transactionDate: date,
        bookingDate: date,
        merchant: spec.merchant,
        description: spec.description,
        transactionType: amount > 0 ? 'income' : 'expense',
        ownershipHint: spec.ownership,
        metadata: { source: 'demo', pattern: 'recurring' },
      });
    }
  }

  for (const spec of VARIABLE) {
    for (let m = 0; m <= months; m++) {
      const ym = addMonths(startDate, m).slice(0, 7);
      const count = Math.max(0, Math.round(spec.perMonth * (0.6 + rand() * 0.9)));
      for (let i = 0; i < count; i++) {
        const day = 1 + Math.floor(rand() * lastDayOf(ym));
        const date = `${ym}-${String(day).padStart(2, '0')}`;
        if (date < startDate || date > endDate) continue;
        const magnitude = Math.round(between(spec.min, spec.max));
        // Only the consulting invoice is money coming in; the rest are costs.
        const isIncome = spec.merchant === 'Frilans Udvikler ApS';
        transactions.push({
          transactionId: nextId('var'),
          providerAccountId: spec.account,
          amountMinor: toMinor(isIncome ? magnitude : -magnitude),
          currency: 'DKK',
          transactionDate: date,
          bookingDate: date,
          merchant: spec.merchant,
          description: spec.description,
          transactionType: isIncome ? 'income' : 'expense',
          ownershipHint: spec.ownership,
          metadata: { source: 'demo', pattern: 'variable' },
        });
      }
    }
  }

  for (const spec of MOBILEPAY_PEOPLE) {
    for (let m = 0; m <= months; m++) {
      const ym = addMonths(startDate, m).slice(0, 7);
      const count = Math.max(0, Math.round(spec.perMonth * (0.5 + rand() * 1.1)));
      for (let i = 0; i < count; i++) {
        const day = 1 + Math.floor(rand() * lastDayOf(ym));
        const date = `${ym}-${String(day).padStart(2, '0')}`;
        if (date < startDate || date > endDate) continue;
        const incoming =
          spec.direction === 'in' || (spec.direction === 'both' && rand() < 0.42);
        const magnitude = Math.round(between(spec.min, spec.max));
        transactions.push({
          transactionId: nextId('mp'),
          providerAccountId: 'demo-checking',
          amountMinor: toMinor(incoming ? magnitude : -magnitude),
          currency: 'DKK',
          transactionDate: date,
          bookingDate: date,
          merchant: spec.person,
          description: `MobilePay ${incoming ? 'fra' : 'til'} ${spec.person}`,
          transactionType: incoming ? 'income' : 'expense',
          metadata: { source: 'demo', pattern: 'mobilepay' },
        });
      }
    }
  }

  // Stripe: customer payments, the fee on each, occasional refunds, and payouts.
  for (let m = 0; m <= months; m++) {
    const ym = addMonths(startDate, m).slice(0, 7);
    const lastDay = lastDayOf(ym);
    const paymentCount = 8 + Math.round(m * 0.8 + rand() * 4);
    let monthGross = 0;

    for (let i = 0; i < paymentCount; i++) {
      const day = 1 + Math.floor(rand() * lastDay);
      const date = `${ym}-${String(day).padStart(2, '0')}`;
      if (date < startDate || date > endDate) continue;
      const customer = STRIPE_CUSTOMERS[Math.floor(rand() * STRIPE_CUSTOMERS.length)]!;
      const gross = Math.round(between(950, 8_900));
      monthGross += gross;

      transactions.push({
        transactionId: nextId('pi'),
        providerAccountId: 'demo-stripe',
        amountMinor: toMinor(gross),
        currency: 'DKK',
        transactionDate: date,
        bookingDate: date,
        merchant: customer,
        description: `Faktura betalt - ${customer}`,
        transactionType: 'income',
        ownershipHint: 'business',
        metadata: { source: 'demo', object: 'charge', customer },
      });

      // Stripe DK pricing: 1.4% + 1.80 kr on European cards.
      const fee = Math.round(gross * 1.4) / 100 + 1.8;
      transactions.push({
        transactionId: nextId('fee'),
        providerAccountId: 'demo-stripe',
        amountMinor: -toMinor(fee),
        currency: 'DKK',
        transactionDate: date,
        bookingDate: date,
        merchant: 'Stripe',
        description: 'Stripe processing fee',
        transactionType: 'fee',
        ownershipHint: 'business',
        metadata: { source: 'demo', object: 'balance_transaction' },
      });

      if (rand() < 0.05) {
        const refundDate = addDays(date, 3 + Math.floor(rand() * 10));
        if (refundDate <= endDate) {
          transactions.push({
            transactionId: nextId('re'),
            providerAccountId: 'demo-stripe',
            amountMinor: -toMinor(gross),
            currency: 'DKK',
            transactionDate: refundDate,
            bookingDate: refundDate,
            merchant: customer,
            description: `Refund - ${customer}`,
            transactionType: 'refund',
            ownershipHint: 'business',
            metadata: { source: 'demo', object: 'refund', customer },
          });
        }
      }
    }

    const payoutDate = `${ym}-${String(Math.min(lastDay, 27)).padStart(2, '0')}`;
    if (payoutDate >= startDate && payoutDate <= endDate && monthGross > 0) {
      const payout = Math.round(monthGross * 0.94);
      transactions.push({
        transactionId: nextId('po'),
        providerAccountId: 'demo-stripe',
        amountMinor: -toMinor(payout),
        currency: 'DKK',
        transactionDate: payoutDate,
        bookingDate: payoutDate,
        merchant: 'Stripe',
        description: 'Payout to bank account',
        transactionType: 'payout',
        ownershipHint: 'business',
        metadata: { source: 'demo', object: 'payout' },
      });
      const arrival = addDays(payoutDate, 2);
      transactions.push({
        transactionId: nextId('in'),
        providerAccountId: 'demo-business',
        amountMinor: toMinor(payout),
        currency: 'DKK',
        transactionDate: arrival <= endDate ? arrival : payoutDate,
        bookingDate: null,
        merchant: 'Stripe',
        description: 'Overfoersel fra Stripe Payments',
        transactionType: 'payout',
        ownershipHint: 'business',
        metadata: { source: 'demo', object: 'transfer' },
      });
    }
  }

  for (let m = 0; m <= months; m++) {
    const ym = addMonths(startDate, m).slice(0, 7);
    const withdrawals = rand() < 0.7 ? 1 : 2;
    for (let i = 0; i < withdrawals; i++) {
      const day = 1 + Math.floor(rand() * lastDayOf(ym));
      const date = `${ym}-${String(day).padStart(2, '0')}`;
      if (date < startDate || date > endDate) continue;
      transactions.push({
        transactionId: nextId('atm'),
        providerAccountId: 'demo-checking',
        amountMinor: toMinor(-(200 + Math.round(rand() * 6) * 100)),
        currency: 'DKK',
        transactionDate: date,
        bookingDate: date,
        merchant: 'Haeveautomat',
        description: 'Haeveautomat kontant udbetaling',
        transactionType: 'expense',
        metadata: { source: 'demo', pattern: 'cash' },
      });
    }
  }

  const oneOffs: Array<{
    merchant: string | null;
    description: string;
    amount: number;
    monthOffset: number;
  }> = [
    { merchant: 'Ryanair', description: 'VISA/DANKORT RYANAIR DUB', amount: -1_240, monthOffset: 2 },
    { merchant: 'Booking.com', description: 'VISA/DANKORT BOOKING COM AMSTERDAM', amount: -3_180, monthOffset: 2 },
    { merchant: 'IKEA', description: 'VISA/DANKORT IKEA GENTOFTE', amount: -2_745, monthOffset: 4 },
    { merchant: 'Norwegian', description: 'VISA/DANKORT NORWEGIAN AIR', amount: -1_890, monthOffset: 6 },
    { merchant: 'Proshop', description: 'VISA/DANKORT PROSHOP A/S', amount: -8_995, monthOffset: 5 },

    // Rows no categorizer can honestly resolve: a bare terminal ID, a foreign
    // acquirer, a transfer whose only clue is a reference number. Every real
    // bank feed has a handful, and they are what the review queue is for —
    // a demo without them would hide the part of the product that asks.
    { merchant: null, description: 'DANKORT-NOTA 4471 KBH K', amount: -1_150, monthOffset: 1 },
    { merchant: null, description: 'VISA/DANKORT SUMUP  *MARKED', amount: -420, monthOffset: 3 },
    { merchant: null, description: 'OVERFOERSEL REF 88213004', amount: -2_400, monthOffset: 4 },
    { merchant: null, description: 'VISA/DANKORT PAYPAL *0000MERCH', amount: -899, monthOffset: 5 },
    { merchant: null, description: 'DANKORT-NOTA 9902 AARHUS C', amount: -675, monthOffset: 6 },
  ];
  for (const one of oneOffs) {
    const ym = addMonths(startDate, one.monthOffset).slice(0, 7);
    const day = Math.min(4 + Math.floor(rand() * 20), lastDayOf(ym));
    const date = `${ym}-${String(day).padStart(2, '0')}`;
    if (date < startDate || date > endDate) continue;
    transactions.push({
      transactionId: nextId('one'),
      providerAccountId: 'demo-checking',
      amountMinor: toMinor(one.amount),
      currency: 'DKK',
      transactionDate: date,
      bookingDate: date,
      merchant: one.merchant ?? null,
      description: one.description,
      transactionType: 'expense',
      metadata: { source: 'demo', pattern: 'one_off' },
    });
  }

  transactions.sort((a, b) => a.transactionDate.localeCompare(b.transactionDate));

  // Derive closing balances from the flows so the dashboard is self-consistent.
  const OPENING: Record<string, number> = {
    'demo-checking': toMinor(18_400),
    'demo-business': toMinor(26_000),
    'demo-stripe': toMinor(4_000),
  };
  const accounts = DEMO_ACCOUNTS.map((account) => {
    const opening = OPENING[account.providerAccountId];
    if (opening === undefined) return account;
    const net = transactions
      .filter((t) => t.providerAccountId === account.providerAccountId)
      .reduce((sum, t) => sum + t.amountMinor, 0);
    return { ...account, balanceMinor: opening + net };
  });

  return { accounts, transactions };
}
