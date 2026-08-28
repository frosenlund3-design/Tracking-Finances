import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/lib/auth';
import { getBankProvider } from '@/integrations/registry';
import { ProviderError } from '@/integrations/types';
import { errorResponse, NO_STORE_HEADERS } from '@/lib/api';
import { remainingInstitutions, resolveFeaturedBanks } from '@/integrations/banking/danish-banks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const countrySchema = z.string().regex(/^[A-Z]{2}$/, 'Use a two-letter country code.');

export async function GET(request: NextRequest) {
  try {
    await requireApiUser();
    const country = countrySchema.safeParse(
      (request.nextUrl.searchParams.get('country') ?? 'DK').toUpperCase(),
    );
    if (!country.success) {
      return NextResponse.json({ error: country.error.issues[0]?.message }, { status: 400 });
    }

    const provider = getBankProvider();
    if (!provider.isConfigured()) {
      throw new ProviderError('Open Banking is not configured.', 'not_configured');
    }

    const institutions = (await provider.listInstitutions(country.data)).map((i) => ({
      id: i.id,
      name: i.name,
      logoUrl: i.logoUrl,
      transactionHistoryDays: i.transactionHistoryDays,
    }));

    // The common banks come back as one-tap tiles; everything else is
    // searchable, so no one is stuck scrolling a list of 200 institutions.
    const featured = resolveFeaturedBanks(institutions);

    return NextResponse.json(
      {
        provider: provider.id,
        featured: featured.map((f) => ({
          key: f.key,
          name: f.name,
          institutionId: f.institutionId,
          institutionName: f.institutionName,
          tone: f.tone,
          initials: f.initials,
          hasLogo: Boolean(f.logoUrl),
          transactionHistoryDays: f.transactionHistoryDays,
        })),
        others: remainingInstitutions(institutions, featured),
        total: institutions.length,
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
