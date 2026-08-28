import '@/lib/server-guard';
import { randomUUID } from 'node:crypto';
import { withUser } from '@/database';
import { redactDeep } from './redact';

/**
 * Account-level events only. Deliberately never records amounts, merchants,
 * balances or transaction contents — an audit trail should not become a second
 * copy of the financial data it is protecting.
 */
export const AUDIT_ACTIONS = {
  SIGNED_UP: 'auth.signed_up',
  SIGNED_IN: 'auth.signed_in',
  SIGNED_OUT: 'auth.signed_out',
  SIGN_IN_FAILED: 'auth.sign_in_failed',
  PASSWORD_RESET_REQUESTED: 'auth.password_reset_requested',
  PASSWORD_CHANGED: 'auth.password_changed',
  BANK_CONNECTED: 'integration.bank_connected',
  BANK_DISCONNECTED: 'integration.bank_disconnected',
  STRIPE_CONNECTED: 'integration.stripe_connected',
  STRIPE_DISCONNECTED: 'integration.stripe_disconnected',
  INTEGRATION_REFRESHED: 'integration.refreshed',
  SYNC_STARTED: 'sync.started',
  SYNC_COMPLETED: 'sync.completed',
  SYNC_FAILED: 'sync.failed',
  EXPORT_REQUESTED: 'data.export_requested',
  FINANCIAL_DATA_DELETED: 'data.financial_deleted',
  ACCOUNT_DELETED: 'data.account_deleted',
  DEMO_DATA_LOADED: 'demo.loaded',
  ASSISTANT_QUERY: 'ai.query',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export interface AuditContext {
  ip?: string | null;
  userAgent?: string | null;
}

export async function recordAudit(
  userId: string,
  action: AuditAction,
  detail: Record<string, string | number | boolean | null> = {},
  context: AuditContext = {},
): Promise<void> {
  try {
    await withUser(userId, async (db) => {
      await db.query(
        `INSERT INTO audit_logs (id, user_id, action, detail, ip, user_agent)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
        [
          randomUUID(),
          userId,
          action,
          JSON.stringify(redactDeep(detail)),
          context.ip ?? null,
          context.userAgent?.slice(0, 300) ?? null,
        ],
      );
    });
  } catch (err) {
    // Auditing must never take down the action it is recording.
    console.error('[audit] failed to record', action, err);
  }
}
