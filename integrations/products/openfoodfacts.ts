import '@/lib/server-guard';
import { guessFoodGroup, type WasteFraction } from '@/lib/food';
import type { ProductProvider, ProductRecord } from './types';

/**
 * Open Food Facts.
 *
 * A public, open-licence product database with good Danish coverage and no
 * API key, which is why it is the default here: a barcode scanner that needs
 * a paid contract before it can name a carton of milk is not a feature anyone
 * can actually turn on.
 *
 * Their terms ask for a User-Agent identifying the application, so this sends
 * one. Set OFF_USER_AGENT to your own contact details before deploying.
 *
 * Read-only, unauthenticated, and given a short timeout: a slow lookup must
 * fall back to manual entry rather than hold up a scan.
 */

const BASE = process.env.OFF_BASE_URL ?? 'https://world.openfoodfacts.org';
const TIMEOUT_MS = 4_000;
const FIELDS = 'code,product_name,product_name_da,brands,quantity,categories_tags,packaging_tags';

interface OffResponse {
  status?: number;
  product?: {
    code?: string;
    product_name?: string;
    product_name_da?: string;
    brands?: string;
    quantity?: string;
    categories_tags?: string[];
    packaging_tags?: string[];
  };
}

/** Open Food Facts packaging tags mapped onto the Danish fractions. */
const PACKAGING_HINTS: Array<{ re: RegExp; fraction: WasteFraction }> = [
  { re: /carton|brick|tetra/i, fraction: 'cartons' },
  { re: /glass|bottle-glass|jar/i, fraction: 'glass' },
  { re: /metal|aluminium|aluminum|steel|can\b|tin\b/i, fraction: 'metal' },
  { re: /plastic|pet\b|hdpe|film|pouch/i, fraction: 'plastic' },
  { re: /cardboard|paperboard|box/i, fraction: 'cardboard' },
  { re: /paper|wrapper-paper/i, fraction: 'paper' },
];

function packagingFraction(tags: string[] | undefined): WasteFraction | null {
  if (!tags?.length) return null;
  const joined = tags.join(' ');
  for (const hint of PACKAGING_HINTS) if (hint.re.test(joined)) return hint.fraction;
  return null;
}

export const openFoodFactsProvider: ProductProvider = {
  id: 'openfoodfacts',
  displayName: 'Open Food Facts',

  // No key needed, so it is configured wherever outbound HTTPS is allowed.
  // A blocked network shows up as a failed lookup, which the caller handles.
  isConfigured: () => process.env.OFF_DISABLED !== '1',

  async lookup(barcode: string): Promise<ProductRecord | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(
        `${BASE}/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${FIELDS}`,
        {
          signal: controller.signal,
          headers: {
            Accept: 'application/json',
            'User-Agent':
              process.env.OFF_USER_AGENT ?? 'Kroner/1.0 (self-hosted personal finance and pantry app)',
          },
          cache: 'no-store',
        },
      );
      if (!response.ok) return null;

      const body = (await response.json()) as OffResponse;
      if (body.status !== 1 || !body.product) return null;

      const p = body.product;
      const name = (p.product_name_da || p.product_name || '').trim();
      if (!name) return null;

      const categoryHint = p.categories_tags?.join(' ') ?? null;
      return {
        barcode,
        name,
        brand: p.brands?.split(',')[0]?.trim() || null,
        group: guessFoodGroup(name, categoryHint),
        quantityText: p.quantity?.trim() || null,
        packagingFraction: packagingFraction(p.packaging_tags),
        source: 'openfoodfacts',
      };
    } catch {
      // Timeout, DNS, a network policy, malformed JSON — all the same answer
      // to the caller: this provider could not name it, ask the human.
      return null;
    } finally {
      clearTimeout(timer);
    }
  },
};
