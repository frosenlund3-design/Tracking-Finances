/**
 * Import-time assertion that a module never reaches the browser bundle.
 * Used instead of the `server-only` package so the same modules can also be
 * loaded by test runners and CLI scripts, which have no React server condition.
 */
if (typeof window !== 'undefined') {
  throw new Error(
    'A server-only module was imported into client code. This module can touch ' +
      'database connections or provider secrets and must stay on the server.',
  );
}
export {};
