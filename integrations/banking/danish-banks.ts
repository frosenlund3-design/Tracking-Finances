/**
 * The banks a Danish user is most likely to have, in the order they are most
 * likely to have them.
 *
 * Aggregators identify institutions by opaque ids that change, so these are
 * matched against the live institution list by name pattern rather than
 * hard-coded. That way a renamed or re-issued id does not silently turn the
 * Nordea button into a dead end — and if a match genuinely cannot be found,
 * the UI falls back to the full searchable list instead of guessing.
 */

export interface FeaturedBank {
  key: string;
  name: string;
  /** Matched case-insensitively against the provider's institution name. */
  match: RegExp;
  /** Prefer a personal-banking entry over a corporate one where both exist. */
  avoid?: RegExp;
  /** Brand colour, used for the tile. */
  tone: string;
  /** Two-letter mark shown when no logo is available. */
  initials: string;
}

export const FEATURED_DANISH_BANKS: FeaturedBank[] = [
  {
    key: 'nordea',
    name: 'Nordea',
    match: /^nordea\b/i,
    avoid: /corporate|erhverv|business/i,
    tone: '#0000a0',
    initials: 'N',
  },
  {
    key: 'danske-bank',
    name: 'Danske Bank',
    match: /^danske\s*bank/i,
    avoid: /business|erhverv|corporate/i,
    tone: '#003755',
    initials: 'DB',
  },
  {
    key: 'jyske-bank',
    name: 'Jyske Bank',
    match: /^jyske\s*bank/i,
    tone: '#0a4595',
    initials: 'JB',
  },
  {
    key: 'nykredit',
    name: 'Nykredit',
    match: /^nykredit/i,
    tone: '#00263e',
    initials: 'NY',
  },
  {
    key: 'sydbank',
    name: 'Sydbank',
    match: /^sydbank/i,
    tone: '#0d4f8b',
    initials: 'SY',
  },
  {
    key: 'spar-nord',
    name: 'Spar Nord',
    match: /^spar\s*nord/i,
    tone: '#004b87',
    initials: 'SN',
  },
  {
    key: 'arbejdernes-landsbank',
    name: 'Arbejdernes Landsbank',
    match: /arbejdernes\s*landsbank/i,
    tone: '#c8102e',
    initials: 'AL',
  },
  {
    key: 'lunar',
    name: 'Lunar',
    match: /^lunar/i,
    tone: '#111111',
    initials: 'LU',
  },
  {
    key: 'revolut',
    name: 'Revolut',
    match: /^revolut/i,
    tone: '#0666eb',
    initials: 'RE',
  },
  {
    key: 'wise',
    name: 'Wise',
    match: /^(wise|transferwise)/i,
    tone: '#163300',
    initials: 'WI',
  },
];

export interface ResolvedBank extends FeaturedBank {
  /** The provider's id for this institution, once matched. */
  institutionId: string;
  institutionName: string;
  logoUrl: string | null;
  transactionHistoryDays: number;
}

export interface InstitutionLike {
  id: string;
  name: string;
  logoUrl: string | null;
  transactionHistoryDays: number;
}

/**
 * Pairs the featured list with what the provider actually offers today.
 * Anything unmatched is simply left out — a tile that cannot connect is worse
 * than no tile.
 */
export function resolveFeaturedBanks(institutions: InstitutionLike[]): ResolvedBank[] {
  const resolved: ResolvedBank[] = [];

  for (const featured of FEATURED_DANISH_BANKS) {
    const candidates = institutions.filter((i) => featured.match.test(i.name));
    if (candidates.length === 0) continue;

    const preferred =
      candidates.find((i) => !featured.avoid || !featured.avoid.test(i.name)) ?? candidates[0]!;

    resolved.push({
      ...featured,
      institutionId: preferred.id,
      institutionName: preferred.name,
      logoUrl: preferred.logoUrl,
      // Longest available history among the matches, so we ask for as much as
      // the bank will give.
      transactionHistoryDays: Math.max(...candidates.map((c) => c.transactionHistoryDays || 90)),
    });
  }

  return resolved;
}

/** Everything not already surfaced as a tile, for the search list. */
export function remainingInstitutions(
  institutions: InstitutionLike[],
  featured: ResolvedBank[],
): InstitutionLike[] {
  const taken = new Set(featured.map((f) => f.institutionId));
  return institutions
    .filter((i) => !taken.has(i.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'da'));
}
