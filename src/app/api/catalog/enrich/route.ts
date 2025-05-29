// src/app/api/catalog/enrich/route.ts
import { NextResponse } from 'next/server';
import { reEnrichCatalog } from '@/lib/catalog-store';

export async function POST() {
  try {
    const newCatalog = await reEnrichCatalog();
    if (!newCatalog) {
      return NextResponse.json({ error: 'Failed to re-enrich catalog, possibly no raw data available.' }, { status: 400 });
    }
    return NextResponse.json({ message: 'Catalog re-enriched successfully.', catalog: newCatalog }, { status: 200 });
  } catch (error) {
    console.error('Re-enrich Catalog API Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred during re-enrichment.';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
