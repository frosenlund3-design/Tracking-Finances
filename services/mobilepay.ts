import '@/lib/server-guard';
import { withUser } from '@/database';
import { buildWhere, type TransactionFilters } from '@/services/transactions';
import { isoDate } from '@/lib/normalize';
import type { PaymentChannel } from '@/types/finance';

/**
 * MobilePay, tracked honestly.
 *
 * There is no consumer API for personal MobilePay and there never has been.
 * What there is, is the bank feed: every MobilePay payment shows up there with
 * the counterparty's name in the description. So rather than pretend to
 * connect to MobilePay, this reads the payments back out of the bank data and
 * gives them their own view — who you pay, who pays you, and the net between
 * you and each person.
 *
 * Merchant-side MobilePay (Vipps MobilePay business) is a real API and is
 * handled separately in integrations/mobilepay.
 */

export interface MobilePayPerson {
  name: string;
  sentMinor: number;
  receivedMinor: number;
  netMinor: number;
  transactionCount: number;
  lastDate: string;
}

export interface MobilePaySummary {
  available: boolean;
  transactionCount: number;
  sentMinor: number;
  receivedMinor: number;
  netMinor: number;
  people: MobilePayPerson[];
  firstSeen: string | null;
  lastSeen: string | null;
}

export async function mobilePaySummary(
  userId: string,
  filters: TransactionFilters = {},
): Promise<MobilePaySummary> {
  const where = buildWhere(userId, { ...filters, paymentChannels: ['mobilepay'] });

  return withUser(userId, async (db) => {
    const { rows: totals } = await db.query<{
      n: number; sent: number | null; received: number | null;
      first_seen: string | Date | null; last_seen: string | Date | null;
    }>(
      `SELECT count(*)::int AS n,
              COALESCE(sum(-t.amount_minor) FILTER (WHERE t.amount_minor < 0), 0) AS sent,
              COALESCE(sum(t.amount_minor) FILTER (WHERE t.amount_minor > 0), 0) AS received,
              min(t.transaction_date) AS first_seen,
              max(t.transaction_date) AS last_seen
         FROM transactions t WHERE ${where.sql}`,
      where.params,
    );

    const { rows: people } = await db.query<{
      name: string; sent: number | null; received: number | null; n: number;
      last_date: string | Date;
    }>(
      `SELECT COALESCE(t.counterparty, t.merchant, 'Unknown') AS name,
              COALESCE(sum(-t.amount_minor) FILTER (WHERE t.amount_minor < 0), 0) AS sent,
              COALESCE(sum(t.amount_minor) FILTER (WHERE t.amount_minor > 0), 0) AS received,
              count(*)::int AS n,
              max(t.transaction_date) AS last_date
         FROM transactions t WHERE ${where.sql}
        GROUP BY name
        ORDER BY (COALESCE(sum(abs(t.amount_minor)), 0)) DESC
        LIMIT 40`,
      where.params,
    );

    const sent = Number(totals[0]?.sent ?? 0);
    const received = Number(totals[0]?.received ?? 0);

    return {
      available: Number(totals[0]?.n ?? 0) > 0,
      transactionCount: Number(totals[0]?.n ?? 0),
      sentMinor: sent,
      receivedMinor: received,
      netMinor: received - sent,
      firstSeen: totals[0]?.first_seen ? isoDate(totals[0].first_seen) : null,
      lastSeen: totals[0]?.last_seen ? isoDate(totals[0].last_seen) : null,
      people: people.map((p) => ({
        name: p.name,
        sentMinor: Number(p.sent),
        receivedMinor: Number(p.received),
        netMinor: Number(p.received) - Number(p.sent),
        transactionCount: Number(p.n),
        lastDate: isoDate(p.last_date),
      })),
    };
  });
}

export interface ChannelTotal {
  channel: PaymentChannel;
  label: string;
  outMinor: number;
  inMinor: number;
  transactionCount: number;
  share: number;
}

export const CHANNEL_LABELS: Record<PaymentChannel, string> = {
  card: 'Card',
  mobilepay: 'MobilePay',
  transfer: 'Bank transfer',
  direct_debit: 'Direct debit',
  cash: 'Cash',
  processor: 'Payment processor',
  unknown: 'Other',
};

/** How money left the account, broken down by rail. */
export async function channelBreakdown(
  userId: string,
  filters: TransactionFilters = {},
): Promise<ChannelTotal[]> {
  const where = buildWhere(userId, filters);

  return withUser(userId, async (db) => {
    const { rows } = await db.query<{
      payment_channel: PaymentChannel; out_minor: number | null; in_minor: number | null; n: number;
    }>(
      `SELECT t.payment_channel,
              COALESCE(sum(-t.amount_minor) FILTER (WHERE t.amount_minor < 0), 0) AS out_minor,
              COALESCE(sum(t.amount_minor) FILTER (WHERE t.amount_minor > 0), 0) AS in_minor,
              count(*)::int AS n
         FROM transactions t WHERE ${where.sql}
        GROUP BY t.payment_channel
        ORDER BY out_minor DESC`,
      where.params,
    );

    const totalOut = rows.reduce((sum, r) => sum + Number(r.out_minor), 0);
    return rows.map((r) => ({
      channel: r.payment_channel,
      label: CHANNEL_LABELS[r.payment_channel] ?? 'Other',
      outMinor: Number(r.out_minor),
      inMinor: Number(r.in_minor),
      transactionCount: Number(r.n),
      share: totalOut > 0 ? Number(r.out_minor) / totalOut : 0,
    }));
  });
}
