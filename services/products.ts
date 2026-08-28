import '@/lib/server-guard';
import { withSystem } from '@/database';
import { guessFoodGroup, isFoodGroup, type FoodGroup, type WasteFraction } from '@/lib/food';
import { openFoodFactsProvider } from '@/integrations/products/openfoodfacts';
import { demoProductProvider } from '@/integrations/products/demo';
import type { ProductRecord } from '@/integrations/products/types';

/**
 * Barcode → product, with a cache in front.
 *
 * The cache is shared across all users and deliberately has no user_id: that
 * Arla Letmælk exists is public knowledge, and one person scanning it should
 * save the next person the round trip. What is personal is the pantry row
 * pointing at it, and that lives under row-level security like everything else.
 *
 * The order is cache → demo → Open Food Facts → nothing. "Nothing" is a real
 * answer the UI handles: it opens manual entry with the name field focused,
 * rather than inventing a product.
 */

/** GTIN-8/12/13/14. Anything else is not a barcode we can look up. */
export function isValidBarcode(value: string): boolean {
  return /^\d{8}$|^\d{12,14}$/.test(value.trim());
}

export interface ProductLookup {
  product: ProductRecord | null;
  /** True when the barcode is well-formed but nobody knows it. */
  unknown: boolean;
}

export async function lookupProduct(rawBarcode: string): Promise<ProductLookup> {
  const barcode = rawBarcode.trim();
  if (!isValidBarcode(barcode)) return { product: null, unknown: false };

  const cached = await readCache(barcode);
  if (cached) return { product: cached, unknown: false };

  for (const provider of [demoProductProvider, openFoodFactsProvider]) {
    if (!provider.isConfigured()) continue;
    const found = await provider.lookup(barcode);
    if (found) {
      await writeCache(found);
      return { product: found, unknown: false };
    }
  }

  return { product: null, unknown: true };
}

interface ProductRow {
  barcode: string;
  name: string;
  brand: string | null;
  category: string | null;
  quantity_text: string | null;
  packaging_fraction: string | null;
  source: string;
}

function mapRow(row: ProductRow): ProductRecord {
  const category = row.category ?? '';
  return {
    barcode: row.barcode,
    name: row.name,
    brand: row.brand,
    group: isFoodGroup(category) ? (category as FoodGroup) : guessFoodGroup(row.name),
    quantityText: row.quantity_text,
    packagingFraction: (row.packaging_fraction as WasteFraction | null) ?? null,
    source: 'cache',
  };
}

async function readCache(barcode: string): Promise<ProductRecord | null> {
  return withSystem(async (db) => {
    const { rows } = await db.query<ProductRow>(
      `SELECT barcode, name, brand, category, quantity_text, packaging_fraction, source
         FROM products WHERE barcode = $1`,
      [barcode],
    );
    return rows[0] ? mapRow(rows[0]) : null;
  });
}

/**
 * Remembers a product.
 *
 * Uses the system connection because the row is not owned by anyone. Nothing
 * about a user is written here — not who scanned it, not when they did.
 */
export async function writeCache(product: ProductRecord): Promise<void> {
  await withSystem(async (db) => {
    await db.query(
      `INSERT INTO products (barcode, name, brand, category, quantity_text, packaging_fraction, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (barcode) DO UPDATE SET
         name = EXCLUDED.name,
         brand = COALESCE(EXCLUDED.brand, products.brand),
         category = EXCLUDED.category,
         quantity_text = COALESCE(EXCLUDED.quantity_text, products.quantity_text),
         packaging_fraction = COALESCE(EXCLUDED.packaging_fraction, products.packaging_fraction),
         fetched_at = now()`,
      [
        product.barcode,
        product.name,
        product.brand,
        product.group,
        product.quantityText,
        product.packagingFraction,
        product.source === 'cache' ? 'manual' : product.source,
      ],
    );
  });
}

/** Whether anyone has ever scanned this barcode, for the first-time bonus. */
export async function isNewBarcode(barcode: string): Promise<boolean> {
  return withSystem(async (db) => {
    const { rows } = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM products WHERE barcode = $1`,
      [barcode],
    );
    return Number(rows[0]?.n ?? 0) === 0;
  });
}
