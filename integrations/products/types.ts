import type { FoodGroup, WasteFraction } from '@/lib/food';

/**
 * What a barcode lookup hands back.
 *
 * Same shape whatever answered — Open Food Facts, the demo catalogue, or the
 * person typing it in — so nothing downstream has to know or care.
 */
export interface ProductRecord {
  barcode: string;
  name: string;
  brand: string | null;
  /** Best guess at what kind of thing this is. */
  group: FoodGroup;
  /** "1 l", "500 g" — as printed, when the source knows. */
  quantityText: string | null;
  /** Where the packaging goes, when it can be inferred. */
  packagingFraction: WasteFraction | null;
  source: 'openfoodfacts' | 'demo' | 'manual' | 'cache';
}

export interface ProductProvider {
  readonly id: string;
  readonly displayName: string;
  /** False means no credentials or no network policy for it in this deployment. */
  isConfigured(): boolean;
  /** Null when the provider simply does not know this barcode. */
  lookup(barcode: string): Promise<ProductRecord | null>;
}
