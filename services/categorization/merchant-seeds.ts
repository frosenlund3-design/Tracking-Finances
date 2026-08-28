import type { Ownership, TaxRelevance } from '@/types/finance';

export interface SeedRule {
  /** Matched against the normalized merchant key as a whole-word substring. */
  match: string;
  category: string;
  ownership?: Ownership;
  tax?: TaxRelevance;
  subcategory?: string;
}

/**
 * Curated merchant knowledge, weighted towards Danish retail and the software
 * a small business actually buys. Matching is substring-on-merchant-key, so
 * "netto" also catches "netto 1234 koebenhavn".
 *
 * Defaults only — a user correction always wins (see rules.ts).
 */
export const MERCHANT_SEEDS: SeedRule[] = [
  // Danish groceries
  { match: 'netto', category: 'groceries' },
  { match: 'foetex', category: 'groceries' },
  { match: 'bilka', category: 'groceries' },
  { match: 'rema', category: 'groceries' },
  { match: 'lidl', category: 'groceries' },
  { match: 'aldi', category: 'groceries' },
  { match: 'meny', category: 'groceries' },
  { match: 'irma', category: 'groceries' },
  { match: 'superbrugsen', category: 'groceries' },
  { match: 'kvickly', category: 'groceries' },
  { match: 'daglibrugsen', category: 'groceries' },
  { match: 'nemlig', category: 'groceries' },

  // Eating out
  { match: 'wolt', category: 'restaurants' },
  { match: 'just eat', category: 'restaurants' },
  { match: 'joe and the juice', category: 'restaurants' },
  { match: 'espresso house', category: 'restaurants' },
  { match: 'baresso', category: 'restaurants' },
  { match: 'starbucks', category: 'restaurants' },
  { match: 'mcdonalds', category: 'restaurants' },
  { match: 'burger king', category: 'restaurants' },
  { match: 'sunset boulevard', category: 'restaurants' },
  { match: 'cafe', category: 'restaurants' },
  { match: 'restaurant', category: 'restaurants' },
  { match: 'pizzeria', category: 'restaurants' },
  { match: 'bager', category: 'restaurants' },

  // Transport
  { match: 'dsb', category: 'transport' },
  { match: 'rejsekort', category: 'transport' },
  { match: 'movia', category: 'transport' },
  { match: 'dantaxi', category: 'transport' },
  { match: 'taxa', category: 'transport' },
  { match: 'uber', category: 'transport' },
  { match: 'bolt', category: 'transport' },
  { match: 'circle k', category: 'transport', subcategory: 'Fuel' },
  { match: 'q8', category: 'transport', subcategory: 'Fuel' },
  { match: 'shell', category: 'transport', subcategory: 'Fuel' },
  { match: 'ok benzin', category: 'transport', subcategory: 'Fuel' },
  { match: 'easypark', category: 'transport', subcategory: 'Parking' },
  { match: 'donkey republic', category: 'transport' },

  // Utilities & home
  { match: 'ewii', category: 'utilities' },
  { match: 'norlys', category: 'utilities' },
  { match: 'andel energi', category: 'utilities' },
  { match: 'orsted', category: 'utilities' },
  { match: 'hofor', category: 'utilities' },
  { match: 'yousee', category: 'utilities', subcategory: 'Internet' },
  { match: 'hiper', category: 'utilities', subcategory: 'Internet' },
  { match: 'telenor', category: 'utilities', subcategory: 'Phone' },
  { match: 'telia', category: 'utilities', subcategory: 'Phone' },
  { match: 'cbb mobil', category: 'utilities', subcategory: 'Phone' },
  { match: 'oister', category: 'utilities', subcategory: 'Phone' },
  { match: 'husleje', category: 'rent' },
  { match: 'boligselskab', category: 'rent' },
  { match: 'ejendomsselskab', category: 'rent' },

  // Health & beauty
  { match: 'apotek', category: 'health' },
  { match: 'matas', category: 'beauty' },
  { match: 'fitness world', category: 'health', subcategory: 'Gym' },
  { match: 'sats', category: 'health', subcategory: 'Gym' },
  { match: 'puregym', category: 'health', subcategory: 'Gym' },
  { match: 'tandlaege', category: 'health' },

  // Entertainment
  { match: 'netflix', category: 'entertainment' },
  { match: 'spotify', category: 'entertainment' },
  { match: 'disney', category: 'entertainment' },
  { match: 'hbo', category: 'entertainment' },
  { match: 'viaplay', category: 'entertainment' },
  { match: 'tv2 play', category: 'entertainment' },
  { match: 'youtube premium', category: 'entertainment' },
  { match: 'playstation', category: 'entertainment' },
  { match: 'steam', category: 'entertainment' },
  { match: 'nintendo', category: 'entertainment' },
  { match: 'audible', category: 'entertainment' },
  { match: 'mofibo', category: 'entertainment' },
  { match: 'storytel', category: 'entertainment' },

  // Shopping
  { match: 'zalando', category: 'shopping' },
  { match: 'zara', category: 'shopping' },
  { match: 'ikea', category: 'shopping' },
  { match: 'jysk', category: 'shopping' },
  { match: 'elgiganten', category: 'shopping' },
  { match: 'proshop', category: 'shopping' },
  { match: 'amazon', category: 'shopping' },
  { match: 'komplett', category: 'shopping' },
  { match: 'boozt', category: 'shopping' },
  { match: 'magasin', category: 'shopping' },
  { match: 'flying tiger', category: 'shopping' },

  // Travel
  { match: 'norwegian', category: 'travel' },
  { match: 'ryanair', category: 'travel' },
  { match: 'booking com', category: 'travel' },
  { match: 'airbnb', category: 'travel' },
  { match: 'hotel', category: 'travel' },
  { match: 'momondo', category: 'travel' },

  // Business: software
  { match: 'openai', category: 'business_software', ownership: 'business', tax: 'deductible' },
  { match: 'anthropic', category: 'business_software', ownership: 'business', tax: 'deductible' },
  { match: 'github', category: 'business_software', ownership: 'business', tax: 'deductible' },
  { match: 'vercel', category: 'business_software', ownership: 'business', tax: 'deductible' },
  { match: 'netlify', category: 'business_software', ownership: 'business', tax: 'deductible' },
  { match: 'figma', category: 'business_software', ownership: 'business', tax: 'deductible' },
  { match: 'notion', category: 'business_software', ownership: 'business', tax: 'deductible' },
  { match: 'linear', category: 'business_software', ownership: 'business', tax: 'deductible' },
  { match: 'slack', category: 'business_software', ownership: 'business', tax: 'deductible' },
  { match: 'atlassian', category: 'business_software', ownership: 'business', tax: 'deductible' },
  { match: 'adobe', category: 'business_software', ownership: 'business', tax: 'deductible' },
  { match: 'google cloud', category: 'business_software', ownership: 'business', tax: 'deductible' },
  { match: 'google workspace', category: 'business_software', ownership: 'business', tax: 'deductible' },
  { match: 'amazon web services', category: 'business_software', ownership: 'business', tax: 'deductible' },
  { match: 'cloudflare', category: 'business_software', ownership: 'business', tax: 'deductible' },
  { match: 'digitalocean', category: 'business_software', ownership: 'business', tax: 'deductible' },
  { match: 'supabase', category: 'business_software', ownership: 'business', tax: 'deductible' },
  { match: 'sentry', category: 'business_software', ownership: 'business', tax: 'deductible' },
  { match: 'twilio', category: 'business_software', ownership: 'business', tax: 'deductible' },
  { match: 'postmark', category: 'business_software', ownership: 'business', tax: 'deductible' },
  { match: 'zoom', category: 'business_software', ownership: 'business', tax: 'deductible' },
  { match: 'dropbox', category: 'business_software', ownership: 'business', tax: 'deductible' },
  { match: 'jetbrains', category: 'business_software', ownership: 'business', tax: 'deductible' },
  { match: 'dinero', category: 'business_software', ownership: 'business', tax: 'deductible' },
  { match: 'e conomic', category: 'business_software', ownership: 'business', tax: 'deductible' },

  // Business: advertising
  { match: 'google ads', category: 'business_advertising', ownership: 'business', tax: 'deductible' },
  { match: 'meta platforms', category: 'business_advertising', ownership: 'business', tax: 'deductible' },
  { match: 'facebook ads', category: 'business_advertising', ownership: 'business', tax: 'deductible' },
  { match: 'linkedin ads', category: 'business_advertising', ownership: 'business', tax: 'deductible' },
  { match: 'tiktok ads', category: 'business_advertising', ownership: 'business', tax: 'deductible' },
  { match: 'reddit ads', category: 'business_advertising', ownership: 'business', tax: 'deductible' },

  // Business: fees, payroll, office, tax
  { match: 'stripe', category: 'business_processing_fees', ownership: 'business', tax: 'deductible' },
  { match: 'quickpay', category: 'business_processing_fees', ownership: 'business', tax: 'deductible' },
  { match: 'danloen', category: 'business_payroll', ownership: 'business', tax: 'deductible' },
  { match: 'underleverandoer', category: 'business_contractors', ownership: 'business', tax: 'deductible' },
  { match: 'freelance', category: 'business_contractors', ownership: 'business', tax: 'deductible' },
  { match: 'zenegy', category: 'business_payroll', ownership: 'business', tax: 'deductible' },
  { match: 'regus', category: 'business_office', ownership: 'business', tax: 'deductible' },
  { match: 'wework', category: 'business_office', ownership: 'business', tax: 'deductible' },
  { match: 'skattestyrelsen', category: 'business_taxes', ownership: 'business', tax: 'non_deductible' },
  { match: 'erhvervsstyrelsen', category: 'business_office', ownership: 'business', tax: 'deductible' },
  { match: 'udemy', category: 'business_education', ownership: 'business', tax: 'deductible' },
  { match: 'coursera', category: 'business_education', ownership: 'business', tax: 'deductible' },
];
