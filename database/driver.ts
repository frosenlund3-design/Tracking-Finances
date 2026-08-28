import '@/lib/server-guard';

export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

/** A connection scoped to a single transaction. */
export interface DbClient {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  /**
   * Runs a script that may contain several statements. Takes no parameters by
   * design — it exists for migrations, not for anything user-supplied.
   */
  exec(sql: string): Promise<void>;
}

export interface Driver {
  /** Runs `fn` inside a transaction, rolling back on throw. */
  transaction<T>(fn: (client: DbClient) => Promise<T>): Promise<T>;
  /** Human-readable backend name, surfaced in /settings. */
  readonly kind: 'postgres' | 'embedded';
  close(): Promise<void>;
}
