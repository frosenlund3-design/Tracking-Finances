import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/lib/auth';
import { getBankProvider } from '@/integrations/registry';
import { ProviderError } from '@/integrations/types';
import { errorResponse, NO_STORE_HEADERS } from '@/lib/api';

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

    const institutions = await provider.listInstitutions(country.data);
    return NextResponse.json(
      {
        provider: provider.id,
        institutions: institutions.map((i) => ({
          id: i.id,
          name: i.name,
          logoUrl: i.logoUrl,
          transactionHistoryDays: i.transactionHistoryDays,
        })),
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
