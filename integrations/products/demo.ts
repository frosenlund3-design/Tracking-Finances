import type { ProductProvider, ProductRecord } from './types';

/**
 * A handful of products for demo mode and for tests.
 *
 * Every barcode here begins with 29, which GS1 reserves for in-store and
 * internal use and never assigns to a manufacturer. That matters: a made-up
 * code in the 57xx Danish range would eventually collide with a real product
 * and confidently name it something it is not.
 */

const DEMO: ProductRecord[] = [
  { barcode: '2900000000017', name: 'Letmælk 1,5%', brand: 'Arla', group: 'dairy', quantityText: '1 l', packagingFraction: 'cartons', source: 'demo' },
  { barcode: '2900000000024', name: 'Skyr Naturel', brand: 'Arla', group: 'dairy', quantityText: '450 g', packagingFraction: 'plastic', source: 'demo' },
  { barcode: '2900000000031', name: 'Rugbrød', brand: 'Schulstad', group: 'bakery', quantityText: '950 g', packagingFraction: 'plastic', source: 'demo' },
  { barcode: '2900000000048', name: 'Hakket oksekød 8-12%', brand: 'Levevis', group: 'meat', quantityText: '400 g', packagingFraction: 'plastic', source: 'demo' },
  { barcode: '2900000000055', name: 'Gulerødder', brand: null, group: 'produce', quantityText: '1 kg', packagingFraction: 'plastic', source: 'demo' },
  { barcode: '2900000000062', name: 'Pasta Penne', brand: 'De Cecco', group: 'dry', quantityText: '500 g', packagingFraction: 'cardboard', source: 'demo' },
  { barcode: '2900000000079', name: 'Hakkede tomater', brand: 'Mutti', group: 'condiment', quantityText: '400 g', packagingFraction: 'metal', source: 'demo' },
  { barcode: '2900000000086', name: 'Appelsinjuice', brand: 'Rynkeby', group: 'drink', quantityText: '1 l', packagingFraction: 'cartons', source: 'demo' },
  { barcode: '2900000000093', name: 'Revet mozzarella', brand: 'Castello', group: 'dairy', quantityText: '150 g', packagingFraction: 'plastic', source: 'demo' },
  { barcode: '2900000000109', name: 'Laksefilet', brand: null, group: 'fish', quantityText: '250 g', packagingFraction: 'plastic', source: 'demo' },
  { barcode: '2900000000116', name: 'Frosne ærter', brand: 'Frisk Frost', group: 'frozen', quantityText: '450 g', packagingFraction: 'plastic', source: 'demo' },
  { barcode: '2900000000123', name: 'Toiletpapir 8 ruller', brand: 'Lambi', group: 'household', quantityText: '8 stk.', packagingFraction: 'plastic', source: 'demo' },
];

const BY_BARCODE = new Map(DEMO.map((p) => [p.barcode, p]));

export const demoProductProvider: ProductProvider = {
  id: 'demo',
  displayName: 'Demo catalogue',
  isConfigured: () => true,
  async lookup(barcode: string) {
    return BY_BARCODE.get(barcode) ?? null;
  },
};

/** The demo barcodes, so a device without a camera can still try the flow. */
export const DEMO_BARCODES: ProductRecord[] = DEMO;
